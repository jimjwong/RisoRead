"use client";

import { useEffect } from "react";

/**
 * Swipe and arrow keys in the reader.
 *
 * The page turns are ordinary links the server rendered; this only adds two
 * more ways to follow them. That ordering matters — the reader is usable with
 * no client JavaScript at all, and every gesture here resolves to the same href
 * a tap on the edge of the page would have used, so there is no second
 * definition of "next page" that could disagree with the first.
 *
 * Deliberately assigns location rather than routing: a page turn replaces the
 * whole view, and a client-side transition on a book this size buys a
 * re-render of everything to change one image.
 */
export function ReaderGestures({
  prev,
  next,
}: {
  prev: string | null;
  next: string | null;
}) {
  useEffect(() => {
    const go = (href: string | null) => {
      if (href) window.location.assign(href);
    };

    const onKey = (event: KeyboardEvent) => {
      // Not while someone is typing a page number or a bookmark note.
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches("input, textarea, select")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "ArrowRight" || event.key === "PageDown") go(next);
      if (event.key === "ArrowLeft" || event.key === "PageUp") go(prev);
    };

    let start: { x: number; y: number; time: number } | null = null;

    const onDown = (event: PointerEvent) => {
      // A swipe that begins on a control is that control's business.
      const el = event.target instanceof Element ? event.target : null;
      if (el?.closest("a, button, input, textarea, select, summary")) {
        start = null;
        return;
      }
      start = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    };

    const onUp = (event: PointerEvent) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const elapsed = event.timeStamp - start.time;
      start = null;

      // Horizontal, decisively so, and quick: a slow drag down the page with a
      // slight sideways lean is someone scrolling, and turning the page under
      // them is worse than doing nothing.
      if (elapsed > 600) return;
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.8) return;

      go(dx < 0 ? next : prev);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [prev, next]);

  return null;
}
