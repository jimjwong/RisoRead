"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Dragging books into folders, on a phone as well as a desktop.
 *
 * This is built on Pointer Events rather than HTML5 drag-and-drop. The HTML5
 * API fires nothing at all on a touchscreen — no dragstart, no drop — so what
 * shipped was a desktop feature wearing the name of a general one, and the
 * phone was left with a select tucked under every cover. Pointer Events are one
 * code path for mouse, touch and pen.
 *
 * The cost is that the drag has to be built by hand: a ghost that follows the
 * pointer, hit-testing with elementFromPoint, and a long press to tell picking
 * a book up apart from scrolling past it. What it buys is that the gesture
 * exists at all where most of the reading happens.
 *
 * It still renders no UI of its own beyond the ghost. The shelf and the folder
 * rail are server-rendered and this reads data attributes off them, so nothing
 * here is required for the page to work: every book keeps a "Move to" form, and
 * if this never runs the shelf is slower to use rather than broken.
 */

/** Long enough not to fire while scrolling, short enough not to feel stuck. */
const HOLD_MS = 350;

/** A pointer that travels this far before the hold completes was scrolling. */
const SLOP_PX = 10;

export function BookDragDrop() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // The drag lives in a ref rather than in state: it updates on every
  // pointermove, and re-rendering the shelf sixty times a second to move a
  // ghost would make the ghost the slowest thing on the page.
  const drag = useRef<{
    bookId: string;
    ghost: HTMLElement;
    over: Element | null;
  } | null>(null);

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number; tile: HTMLElement } | null = null;

    const clearHold = () => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      start = null;
    };

    const markOver = (element: Element | null) => {
      const current = drag.current;
      if (!current || current.over === element) return;
      current.over?.removeAttribute("data-over");
      element?.setAttribute("data-over", "true");
      current.over = element;
    };

    /** The folder under the pointer, or null. */
    const targetAt = (x: number, y: number): Element | null => {
      // The ghost sits directly under the pointer and would be the top element
      // at every sample, so it is taken out of hit-testing altogether with
      // pointer-events: none rather than hidden and restored each time.
      const el = document.elementFromPoint(x, y);
      return el?.closest("[data-drop-folder]") ?? null;
    };

    const beginDrag = (tile: HTMLElement, x: number, y: number) => {
      const bookId = tile.getAttribute("data-book-id");
      if (!bookId) return;

      const ghost = document.createElement("div");
      ghost.className = "book-drag-ghost";
      ghost.textContent = tile.getAttribute("data-book-title") ?? "Book";
      ghost.style.transform = `translate(${x}px, ${y}px)`;
      document.body.appendChild(ghost);

      drag.current = { bookId, ghost, over: null };
      document.body.dataset.draggingBook = bookId;

      // A long press on a phone otherwise raises the selection handles and the
      // callout menu on top of the drag.
      document.body.style.userSelect = "none";

      if (navigator.vibrate) navigator.vibrate(8);
    };

    const endDrag = () => {
      const current = drag.current;
      if (!current) return;
      current.over?.removeAttribute("data-over");
      current.ghost.remove();
      drag.current = null;
      delete document.body.dataset.draggingBook;
      document.body.style.userSelect = "";
    };

    const onPointerDown = (event: PointerEvent) => {
      // Secondary buttons, and anything inside a control: a drag starting on a
      // select or a link would swallow the tap that was meant for it.
      if (event.button !== 0) return;
      const el = event.target instanceof Element ? event.target : null;
      if (!el || el.closest("select, button, input, textarea, summary")) return;

      const tile = el.closest<HTMLElement>("[data-book-id]");
      if (!tile) return;

      start = { x: event.clientX, y: event.clientY, tile };
      holdTimer = setTimeout(() => {
        if (start) beginDrag(start.tile, start.x, start.y);
        holdTimer = null;
      }, HOLD_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      // Before the hold completes, movement means the page is being scrolled.
      if (start && !drag.current) {
        const moved =
          Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y);
        if (moved > SLOP_PX) clearHold();
        return;
      }

      const current = drag.current;
      if (!current) return;

      current.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      markOver(targetAt(event.clientX, event.clientY));
    };

    const onPointerUp = async (event: PointerEvent) => {
      clearHold();
      const current = drag.current;
      if (!current) return;

      const target = targetAt(event.clientX, event.clientY);
      const bookId = current.bookId;
      endDrag();
      if (!target) return;

      // "unfiled" is a real destination rather than the absence of one, so it
      // travels as a word and becomes null on the server.
      const folder = target.getAttribute("data-drop-folder");
      const folderId = folder === "unfiled" ? "" : (folder ?? "");

      setBusy(true);
      try {
        const body = new FormData();
        body.set("book_id", bookId);
        body.set("folder_id", folderId);
        await fetch("/books/move", { method: "POST", body });
        router.refresh();
      } finally {
        setBusy(false);
      }
    };

    const onCancel = () => {
      clearHold();
      endDrag();
    };

    /*
      Scrolling has to be cancelled through touchmove, not pointermove.

      Safari builds Pointer Events on top of touch events, and preventDefault on
      a pointermove does not reach the scroller — the shelf kept scrolling out
      from under the ghost on exactly the devices this rewrite was for. A
      non-passive touchmove listener does stop it, and it can be cancelled
      part-way through a gesture, which touch-action cannot: touch-action is
      read once at touchstart, so setting it when the long press fires is
      already too late.
    */
    const onTouchMove = (event: TouchEvent) => {
      if (drag.current) event.preventDefault();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      clearHold();
      endDrag();
    };
  }, [router]);

  if (!busy) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border bg-[var(--surface)] px-3 py-1.5 text-xs shadow-sm"
    >
      Moving…
    </div>
  );
}
