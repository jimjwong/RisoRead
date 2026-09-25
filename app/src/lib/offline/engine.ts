import * as manifest from "@/lib/offline/manifest";

/**
 * The client side of the offline download engine — talks to public/sw.js over
 * postMessage, and to the download manifest once a job finishes.
 *
 * Every exported function here is safe to call from a browser with no service
 * worker support at all: each one checks for the API it needs and quietly does
 * nothing rather than throwing, the same way the rest of this app treats
 * client JavaScript as an enhancement rather than a requirement.
 */

export const PAGE_WIDTHS = [2400, 3000, 4000] as const;
export type PageWidth = (typeof PAGE_WIDTHS)[number];

// Set right before the one deliberate reload below, and checked after it, so
// a browser where this page genuinely never becomes controlled (rather than
// just needing the one reload) fails quietly instead of reloading forever.
const RELOAD_GUARD = "riso-sw-reload";

/**
 * Register the service worker, and get this page under its control the same
 * session it first installs.
 *
 * `clients.claim()` (public/sw.js) is worker-side and, per the spec, is
 * supposed to hand control to every open client immediately — in practice,
 * confirmed against this app's own deployment, the page that performed the
 * registration itself does not receive it: no `controllerchange` fires there
 * no matter how long you wait, only a further navigation does. So the very
 * first "Save for offline" click of a browser's lifetime would otherwise
 * fail for a reason with no visible cause — the worker is active, just not
 * controlling anything yet. One silent reload, exactly once per session,
 * fixes it before it can be visible as a broken button.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  // Installing takes real time, and a reader can navigate — into a book,
  // say — well within it. Reloading by then would land wherever this promise
  // happens to still be pointed, not where they actually are.
  const expectedPath = location.pathname + location.search;
  try {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    if (location.pathname + location.search !== expectedPath) return;
    if (sessionStorage.getItem(RELOAD_GUARD) === "1") return;
    sessionStorage.setItem(RELOAD_GUARD, "1");
    window.location.reload();
  } catch {
    // Offline support is an enhancement; a registration failure should not be
    // visible as an application error.
  }
}

/**
 * Tell the service worker who is signed in, right now, on this tab.
 *
 * Captured here rather than inside the worker, so a message carries the
 * instant its sender actually knew this to be true — the worker uses that
 * timestamp to refuse an update from a call that started before a more recent
 * one, rather than trusting whichever message happens to arrive last.
 */
export async function setActiveUser(userId: string | null): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.ready;
  const controller = navigator.serviceWorker.controller;
  // No controller yet (first load before the worker has claimed this page) is
  // a safe no-op: an uncontrolled page's requests are never intercepted, so
  // there is nothing for the worker to guard on this page anyway.
  if (!controller) return;
  controller.postMessage({ type: "set-user", userId, capturedAt: Date.now() });
}

/**
 * One round trip to the service worker, resolved when its reply says "done".
 * `onProgress` is optional — the worker sends a `"progress"` message after
 * every URL it caches, but most callers (removal, in particular) don't need
 * to show one.
 */
function call(
  message: Record<string, unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) {
      reject(new Error("No active service worker"));
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      if (event.data?.type === "progress") {
        onProgress?.(event.data.done, event.data.total);
        return;
      }
      if (event.data?.type === "done") resolve();
    };
    controller.postMessage(message, [channel.port2]);
  });
}

/** The one thing every download actually does: hand the worker a URL list to cache. */
async function downloadUrls(
  userId: string,
  urls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  await call({ type: "download-book", userId, urls }, onProgress);
}

export async function downloadPdf(opts: {
  bookId: string;
  userId: string;
  title: string;
  totalPages: number;
  width?: PageWidth;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  // Checked rather than trusted: this is reachable from the console hook, not
  // just typed callers, and page-image/route.ts 404s on any width outside
  // this allowlist.
  const width = PAGE_WIDTHS.includes(opts.width as PageWidth) ? (opts.width as PageWidth) : 3000;
  const urls = Array.from(
    { length: opts.totalPages },
    (_, i) => `/books/${opts.bookId}/page-image?p=${i + 1}&w=${width}`,
  );

  await downloadUrls(opts.userId, urls, opts.onProgress);

  await manifest.put({
    userId: opts.userId,
    bookId: opts.bookId,
    format: "pdf",
    title: opts.title,
    totalUnits: opts.totalPages,
    // A rough figure rather than measured bytes: the point is to show a
    // reader roughly what they've committed to, not to account for it
    // precisely — actual JPEG size varies per page and isn't worth a second
    // round trip to find out.
    bytesApprox: urls.length * 35_000,
    downloadedAt: new Date().toISOString(),
    pdfWidth: width,
    urls,
  });
}

/**
 * Every image one EPUB chapter references, for the download to also cache —
 * a chapter without its figures is not the chapter. Reads the chapter's own
 * sanitized HTML (the same content the reader already trusts enough to set
 * as innerHTML) into a detached document that is never attached to the page,
 * purely to read out `<img src>` values.
 */
async function chapterAssetUrls(bookId: string, chapterUrl: string): Promise<string[]> {
  const res = await fetch(chapterUrl, { credentials: "same-origin" });
  if (!res.ok) return [];
  const { html } = (await res.json()) as { html: string };

  const doc = new DOMParser().parseFromString(html, "text/html");
  const prefix = `/books/${bookId}/asset?path=`;
  return [...doc.querySelectorAll("img[src]")]
    .map((img) => img.getAttribute("src") ?? "")
    .filter((src) => src.startsWith(prefix));
}

export async function downloadEpub(opts: {
  bookId: string;
  userId: string;
  title: string;
  totalChapters: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const chapterUrls = Array.from(
    { length: opts.totalChapters },
    (_, i) => `/books/${opts.bookId}/chapter?spine=${i}`,
  );

  // Each chapter is fetched here to find its images, and again by the worker
  // below to actually cache it — a download-time cost only, not worth
  // avoiding by piping response bodies across the postMessage boundary. No
  // progress is reported for this scan; it's cheap relative to the caching
  // phase that follows, where onProgress actually applies.
  const assetUrls = new Set<string>();
  for (const url of chapterUrls) {
    for (const asset of await chapterAssetUrls(opts.bookId, url)) assetUrls.add(asset);
  }

  const urls = [...chapterUrls, ...assetUrls];
  await downloadUrls(opts.userId, urls, opts.onProgress);

  await manifest.put({
    userId: opts.userId,
    bookId: opts.bookId,
    format: "epub",
    title: opts.title,
    totalUnits: opts.totalChapters,
    bytesApprox: urls.length * 15_000,
    downloadedAt: new Date().toISOString(),
    urls,
  });
}

export async function removeDownload(opts: { bookId: string; userId: string }): Promise<void> {
  const entry = await manifest.get(opts.userId, opts.bookId);
  await call({ type: "remove-download", userId: opts.userId, urls: entry?.urls ?? [] });
  await manifest.remove(opts.userId, opts.bookId);
}

export { list } from "@/lib/offline/manifest";
