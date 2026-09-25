/**
 * The offline download engine.
 *
 * Hand-written rather than built on Workbox/Serwist — there is no dependency on
 * either in this repo, and the whole job here is narrow enough not to need one:
 * serve a handful of explicitly-downloaded book URLs from cache, and leave
 * absolutely everything else to the network exactly as if this file did not
 * exist.
 *
 * The one thing this file cannot get wrong: RisoRead runs on shared department
 * computers, where one lab member signs out and another signs in on the same
 * browser. Cache Storage is scoped to the origin, not to whoever is signed in,
 * so a fetch handler that served cached bytes by URL alone would hand the
 * second person whatever the first one downloaded — a private lab's shelf,
 * served without ever going through Supabase's row-level security. Every
 * decision below is in service of that not being possible, not just the happy
 * path of a book opening fast.
 */

const CACHEABLE = /^\/books\/[^/]+\/(page-image|chapter|asset)/;

let currentUserId = null;
let lastAppliedAt = 0;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // A new document is the only moment a different person's cookies could be
  // involved. Revert to "unknown user" synchronously, before that document's
  // own images and chapter requests can reach this handler — this does not
  // depend on any message arriving in time. The document itself is never
  // intercepted.
  if (request.mode === "navigate") {
    currentUserId = null;
    lastAppliedAt = Date.now();
    return;
  }

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE.test(url.pathname)) return;

  // Nobody known to be signed in right now: nothing is ever served from
  // cache, every request goes to the network and through the ordinary
  // RLS-checked route exactly as it would with no service worker installed.
  if (!currentUserId) return;

  event.respondWith(
    caches.open(`riso-books-${currentUserId}`).then(async (cache) => {
      const cached = await cache.match(request);
      return cached ?? fetch(request);
    }),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data ?? {};
  const port = event.ports[0];

  if (data.type === "set-user") {
    // A message dispatched under a since-superseded identity (a backgrounded
    // tab, delivered late) must never clobber a newer, correct one. Only the
    // most recently *captured* identity ever wins, regardless of arrival order.
    if (typeof data.capturedAt === "number" && data.capturedAt < lastAppliedAt) return;
    currentUserId = data.userId ?? null;
    lastAppliedAt = data.capturedAt ?? Date.now();
    return;
  }

  if (data.type === "download-book") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(`riso-books-${data.userId}`);
        const urls = data.urls ?? [];
        let done = 0;
        for (const url of urls) {
          try {
            const res = await fetch(url, { credentials: "same-origin" });
            if (res.ok) await cache.put(url, res.clone());
          } catch {
            // One page failing to fetch is not a reason to abandon the rest.
          }
          done++;
          port?.postMessage({ type: "progress", done, total: urls.length });
        }
        port?.postMessage({ type: "done" });
      })(),
    );
    return;
  }

  if (data.type === "remove-download") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(`riso-books-${data.userId}`);
        await Promise.all((data.urls ?? []).map((u) => cache.delete(u)));
        port?.postMessage({ type: "done" });
      })(),
    );
  }
});
