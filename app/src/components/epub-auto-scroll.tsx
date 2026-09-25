"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark as BookmarkIcon, Gauge, Minus, Pause, Play, Plus } from "lucide-react";

const SPEEDS = [
  { label: "0.4×", pixelsPerSecond: 16 },
  { label: "0.6×", pixelsPerSecond: 22 },
  { label: "0.8×", pixelsPerSecond: 30 },
  { label: "1×", pixelsPerSecond: 40 },
  { label: "1.3×", pixelsPerSecond: 54 },
  { label: "1.7×", pixelsPerSecond: 72 },
  { label: "2.0×", pixelsPerSecond: 84 },
] as const;

const SPEED_KEY = "risoread:epub-autoscroll-speed-v2";
const LEGACY_SPEED_KEY = "risoread:epub-autoscroll-speed";
const activeKey = (bookId: string) => `risoread:epub-autoscroll-active:${bookId}`;

/**
 * Hands-free EPUB reading, layered over the server-rendered chapter.
 *
 * Speed is remembered on this device, while the running state only survives
 * navigation in the current tab. That lets auto-scroll carry on across a
 * server-loaded chapter without unexpectedly starting again tomorrow.
 */
export function EpubAutoScroll({
  bookId,
  percent,
  bookmarked,
}: {
  bookId: string;
  percent: number;
  bookmarked: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(3);
  const [announcement, setAnnouncement] = useState("Auto-scroll ready");
  const changingChapter = useRef(false);
  const endReachedAt = useRef<number | null>(null);
  const manualGesture = useRef(false);
  const resumeAt = useRef(0);

  const setActive = useCallback(
    (active: boolean, message?: string) => {
      // Starting is an explicit command. Do not inherit a short manual-scroll
      // cooldown from the tap/drag that happened immediately beforehand.
      if (active) {
        manualGesture.current = false;
        resumeAt.current = 0;
        changingChapter.current = false;
      }
      setRunning(active);
      sessionStorage.setItem(activeKey(bookId), active ? "1" : "0");
      if (message) setAnnouncement(message);
    },
    [bookId],
  );

  const changeSpeed = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(SPEEDS.length - 1, next));
    setSpeedIndex(clamped);
    localStorage.setItem(SPEED_KEY, String(clamped));
    setAnnouncement(`Auto-scroll speed ${SPEEDS[clamped].label}`);
  }, []);

  useEffect(() => {
    // Read browser storage after hydration. Scheduling the state sync also
    // keeps the first client render identical to the server-rendered controls.
    const frame = requestAnimationFrame(() => {
      const savedSpeed = Number(localStorage.getItem(SPEED_KEY));
      if (Number.isInteger(savedSpeed) && savedSpeed >= 0 && savedSpeed < SPEEDS.length) {
        setSpeedIndex(savedSpeed);
      } else {
        // The original list began at 0.6×. Shift its saved index once so
        // adding 0.4× does not silently change a reader's preferred speed.
        const legacySpeed = Number(localStorage.getItem(LEGACY_SPEED_KEY));
        if (Number.isInteger(legacySpeed) && legacySpeed >= 0 && legacySpeed < SPEEDS.length - 1) {
          const migratedSpeed = legacySpeed + 1;
          setSpeedIndex(migratedSpeed);
          localStorage.setItem(SPEED_KEY, String(migratedSpeed));
        }
      }
      if (sessionStorage.getItem(activeKey(bookId)) === "1") {
        setRunning(true);
        setAnnouncement("Auto-scroll resumed");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [bookId]);

  useEffect(() => {
    if (!running) return;

    let frameId = 0;
    let previous = performance.now();
    // Keep a floating-point destination instead of asking the browser to add
    // a tiny delta every frame. Some engines round those deltas separately,
    // which made low speeds pause for a few frames and then jump a pixel.
    let targetPosition: number | null = null;

    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame);
      if (changingChapter.current) {
        previous = now;
        targetPosition = null;
        return;
      }

      const article = document.querySelector<HTMLElement>("[data-reader-article]");
      if (!article) {
        previous = now;
        targetPosition = null;
        return;
      }

      const scrollContainer = article.closest<HTMLElement>("[data-reader-scroll-container]");
      const currentPosition = scrollContainer ? scrollContainer.scrollTop : window.scrollY;

      // Yield while a finger/mouse is actively moving the page, then carry on
      // from the reader's new position. Resetting `previous` is what prevents
      // a catch-up jump when automatic movement resumes.
      if (manualGesture.current || now < resumeAt.current) {
        previous = now;
        targetPosition = currentPosition;
        endReachedAt.current = null;
        return;
      }

      // Scroll metrics avoid two forced layout measurements on every frame.
      // Besides being cheaper, this removes the visible cadence those reads
      // could introduce while the same element was being scrolled.
      const maximumPosition = scrollContainer
        ? Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
        : Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const atEnd = currentPosition >= maximumPosition - 2;
      if (atEnd) {
        endReachedAt.current ??= now;
        // Leave the final lines still long enough to read before turning.
        if (now - endReachedAt.current < 2600) return;

        const next = document.querySelector<HTMLElement>('[data-turn="next"]');
        if (!next) {
          setActive(false, "End of book — auto-scroll stopped");
          return;
        }
        changingChapter.current = true;
        next.click();
        return;
      }

      endReachedAt.current = null;
      const elapsed = Math.min(now - previous, 80);
      previous = now;
      const distance = (SPEEDS[speedIndex].pixelsPerSecond * elapsed) / 1000;
      targetPosition ??= currentPosition;
      targetPosition = Math.min(maximumPosition, targetPosition + distance);
      if (scrollContainer) scrollContainer.scrollTop = targetPosition;
      else window.scrollTo({ top: targetPosition, behavior: "instant" });
    };

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [running, speedIndex, setActive]);

  useEffect(() => {
    const isControl = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      return Boolean(target?.closest("[data-auto-scroll-controls]"));
    };

    const yieldBriefly = (delay = 650) => {
      resumeAt.current = performance.now() + delay;
      endReachedAt.current = null;
    };

    const onWheel = () => {
      if (running) yieldBriefly();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!running || isControl(event)) return;
      manualGesture.current = true;
      endReachedAt.current = null;
    };

    const finishPointerGesture = () => {
      if (!manualGesture.current) return;
      manualGesture.current = false;
      yieldBriefly(450);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setActive(!running, running ? "Auto-scroll paused" : "Auto-scroll started");
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        changeSpeed(speedIndex - 1);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeSpeed(speedIndex + 1);
      } else if (["ArrowUp", "ArrowDown", "Home", "End", " "].includes(event.key)) {
        // Let the browser perform the manual movement and resume shortly after.
        yieldBriefly();
      }
    };

    const onChapterChange = () => {
      changingChapter.current = false;
      endReachedAt.current = null;
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", finishPointerGesture, { passive: true });
    window.addEventListener("pointercancel", finishPointerGesture, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("risoread:chapterchange", onChapterChange);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", finishPointerGesture);
      window.removeEventListener("pointercancel", finishPointerGesture);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("risoread:chapterchange", onChapterChange);
    };
  }, [changeSpeed, running, setActive, speedIndex]);

  const speed = SPEEDS[speedIndex];
  const controlClass =
    "inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-9 sm:min-w-9";

  return (
    <div
      data-auto-scroll-controls
      className="flex min-w-0 items-center justify-center gap-0.5 rounded-xl border p-1"
      style={{ background: "color-mix(in srgb, var(--reading-bg, var(--surface)) 92%, transparent)" }}
      role="group"
      aria-label="EPUB auto-scroll"
    >
      <span className="inline-flex min-w-9 items-center justify-center gap-1 px-0.5 text-[11px] text-[var(--fg-subtle)] tabular-nums sm:min-w-10 sm:px-1">
        {bookmarked && (
          <BookmarkIcon size={11} aria-label="Bookmarked" style={{ color: "var(--accent)" }} />
        )}
        <span data-reader-percent>{percent}%</span>
      </span>
      <Gauge size={15} className="mx-0.5 hidden text-[var(--fg-subtle)] sm:block" aria-hidden />
      <span className="hidden text-xs font-medium sm:inline">Auto-scroll</span>

      <button
        type="button"
        className={controlClass}
        onClick={() => changeSpeed(speedIndex - 1)}
        disabled={speedIndex === 0}
        aria-label="Slower auto-scroll"
        title="Slower (-)"
      >
        <Minus size={15} aria-hidden />
      </button>
      <output
        className="min-w-9 text-center text-xs font-medium tabular-nums sm:min-w-10"
        aria-label={`Current speed ${speed.label}`}
      >
        {speed.label}
      </output>
      <button
        type="button"
        className={controlClass}
        onClick={() => changeSpeed(speedIndex + 1)}
        disabled={speedIndex === SPEEDS.length - 1}
        aria-label="Faster auto-scroll"
        title="Faster (+)"
      >
        <Plus size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={`${controlClass} bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90`}
        onClick={() => setActive(!running, running ? "Auto-scroll paused" : "Auto-scroll started")}
        aria-label={running ? "Pause auto-scroll" : "Start auto-scroll"}
        aria-pressed={running}
        aria-keyshortcuts="Shift+A"
        title={`${running ? "Pause" : "Start"} auto-scroll (Shift+A)`}
      >
        {running ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      </button>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
