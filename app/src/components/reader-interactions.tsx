"use client";

import { useEffect } from "react";
import * as manifest from "@/lib/offline/manifest";
import { recordProgress } from "@/lib/offline/progress-sync";

/**
 * Turning a page, every way there is to ask for one.
 *
 * For a book that has not been downloaded, this does exactly what the old
 * reader-gestures.tsx did: resolve a swipe, an arrow key or PageUp/PageDown to
 * the href the server already rendered, and let the browser navigate there —
 * the reader works with no client JavaScript at all, and everything here is
 * an enhancement on top of that, never a requirement.
 *
 * For a book that *has* been downloaded, this also owns turning the page
 * without a navigation at all: fetching the next page-image or chapter
 * (served from the service worker's cache when there is no network),
 * swapping it into the DOM, updating the address bar with pushState, and
 * recording progress locally. It has to be the one place that knows how a
 * turn happens, click or swipe or key or the back button — two components
 * each with their own idea of "go to page N" is how they end up disagreeing
 * about whether one actually happened.
 *
 * Any failure at all — not downloaded, a page outside the download, a cache
 * miss, a network error mid-fetch — falls back to a real navigation, exactly
 * today's behavior. Nothing here can get a reader stuck.
 */
export function ReaderInteractions({
  bookId,
  userId,
  format,
  at: initialAt,
  total,
  unit,
  focus,
}: {
  bookId: string;
  userId: string | null;
  format: "pdf" | "epub";
  at: number;
  total: number;
  unit: "Page" | "Chapter";
  focus: boolean;
}) {
  useEffect(() => {
    let at = initialAt;
    let downloaded = false;
    let pdfWidth = 3000;
    let cancelled = false;

    const hrefFor = (loc: number) => `/books/${bookId}?at=${loc}${focus ? "&focus=1" : ""}`;

    function updateCounters(newAt: number) {
      const percent = total > 1 ? Math.round((newAt / (total - 1)) * 100) : 0;

      document.querySelectorAll("[data-reader-counter]").forEach((el) => {
        el.textContent = `${unit} ${newAt + 1} of ${total} · ${percent}%`;
      });
      document.querySelectorAll("[data-reader-percent]").forEach((el) => {
        el.textContent = `${percent}%`;
      });
      document.querySelectorAll("[data-reader-header-counter]").forEach((el) => {
        el.textContent = `${newAt + 1}/${total}`;
      });
      document.querySelectorAll("[data-reader-progress]").forEach((el) => {
        el.setAttribute("aria-valuenow", String(percent));
      });
      document.querySelectorAll<HTMLElement>("[data-reader-progress-fill]").forEach((el) => {
        el.style.width = `${percent}%`;
      });
    }

    function loadPdfPage(target: number): Promise<void> {
      const img = document.querySelector<HTMLImageElement>("[data-reader-image]");
      if (!img) return Promise.reject(new Error("no image element"));
      const src = `/books/${bookId}/page-image?p=${target + 1}&w=${pdfWidth}`;
      return new Promise((resolve, reject) => {
        const onLoad = () => {
          img.removeEventListener("load", onLoad);
          img.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          img.removeEventListener("load", onLoad);
          img.removeEventListener("error", onError);
          reject(new Error("image failed to load"));
        };
        img.addEventListener("load", onLoad, { once: true });
        img.addEventListener("error", onError, { once: true });
        // Fixed to the one width this download actually cached — the
        // responsive srcset can only pick a width nothing offline has.
        img.removeAttribute("srcset");
        img.removeAttribute("sizes");
        img.src = src;
      });
    }

    async function loadEpubChapter(target: number): Promise<void> {
      const article = document.querySelector<HTMLElement>("[data-reader-article]");
      if (!article) throw new Error("no article element");
      const res = await fetch(`/books/${bookId}/chapter?spine=${target}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("chapter fetch failed");
      const { html } = (await res.json()) as { html: string };
      // Already sanitized server-side by the same pass that backs the
      // server-rendered chapter — this is exactly as trusted as that.
      article.innerHTML = html;
    }

    /** Attempt an in-place turn to `target`. Never throws. */
    async function goTo(target: number): Promise<boolean> {
      if (!downloaded || target < 0 || target >= total) return false;
      try {
        if (format === "pdf") await loadPdfPage(target);
        else await loadEpubChapter(target);
      } catch {
        return false;
      }

      at = target;
      updateCounters(at);
      history.pushState({ at }, "", hrefFor(at));
      if (userId) void recordProgress(userId, bookId, at);
      const scrollContainer = document.querySelector<HTMLElement>("[data-reader-scroll-container]");
      if (scrollContainer) scrollContainer.scrollTo({ top: 0, left: 0 });
      else if (format === "epub") {
        document.querySelector<HTMLElement>("[data-reader-article]")?.scrollIntoView({ block: "start" });
      }
      window.dispatchEvent(new CustomEvent("risoread:chapterchange", { detail: { at } }));
      return true;
    }

    /** A click/swipe/key resolved to a direction — go, or fall back to a real navigation. */
    async function turn(direction: "prev" | "next") {
      const scroller = document.querySelector<HTMLElement>("[data-reader-scroll-container]");
      if (
        format === "epub" &&
        scroller?.dataset.pageLayout === "spread" &&
        window.matchMedia("(min-width: 900px)").matches
      ) {
        const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        const canTurnInside =
          direction === "next" ? scroller.scrollLeft < max - 4 : scroller.scrollLeft > 4;
        if (canTurnInside) {
          scroller.scrollBy({
            left: direction === "next" ? scroller.clientWidth : -scroller.clientWidth,
            behavior: "smooth",
          });
          return;
        }
      }

      const target = direction === "next" ? at + 1 : at - 1;
      if (target < 0 || target >= total) return;
      if (!(await goTo(target))) window.location.assign(hrefFor(target));
    }

    const onClick = (event: MouseEvent) => {
      const el = event.target instanceof Element ? event.target.closest("[data-turn]") : null;
      if (!el) return;
      const direction = el.getAttribute("data-turn");
      if (direction !== "prev" && direction !== "next") return;
      event.preventDefault();
      void turn(direction);
    };

    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches("input, textarea, select")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "ArrowRight" || event.key === "PageDown") void turn("next");
      if (event.key === "ArrowLeft" || event.key === "PageUp") void turn("prev");
    };

    let start: { x: number; y: number; time: number } | null = null;

    const onDown = (event: PointerEvent) => {
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

      if (elapsed > 600) return;
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.8) return;

      void turn(dx < 0 ? "next" : "prev");
    };

    const onPopState = () => {
      const target = Number(new URLSearchParams(location.search).get("at") ?? initialAt);
      if (!Number.isFinite(target) || target === at) return;
      goTo(target).then((ok) => {
        if (!ok) location.reload();
      });
    };

    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("popstate", onPopState);

    if (userId) {
      manifest.get(userId, bookId).then((entry) => {
        if (cancelled || !entry || entry.format !== format) return;
        downloaded = true;
        if (format === "pdf") {
          pdfWidth = entry.pdfWidth ?? 3000;
          // Corrects the very first page too, not just later turns — a
          // downloaded book opened while already offline should not depend on
          // the responsive srcset happening to land on the cached width.
          void loadPdfPage(at).catch(() => {
            // The current page is presumably already visible and correct;
            // nothing to recover from if this specific re-fetch fails.
          });
        }
      });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("popstate", onPopState);
    };
  }, [bookId, userId, format, initialAt, total, unit, focus]);

  return null;
}
