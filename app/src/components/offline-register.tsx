"use client";

import { useEffect } from "react";
import { registerServiceWorker, setActiveUser } from "@/lib/offline/engine";
import { syncAll } from "@/lib/offline/progress-sync";

/**
 * Registers the offline download engine and tells it who is reading.
 *
 * `userId` arrives as a prop from whichever server-rendered page mounted this,
 * rather than being fetched here on mount — it is then part of the same
 * response that already decided everything else on the page, so there is no
 * request in flight that a user switch could race. See public/sw.js for why
 * that race matters on a shared computer.
 *
 * Like every other client-only piece of this reader, this is additive: a
 * browser with no service worker support renders nothing here and the rest of
 * the application is unaffected.
 */
export function OfflineRegister({ userId }: { userId: string | null }) {
  useEffect(() => {
    registerServiceWorker();
    setActiveUser(userId);
  }, [userId]);

  // Positions turned to while disconnected sit locally until this runs: once
  // on mount, in case a previous session ended offline, and again whenever
  // the browser regains a connection.
  useEffect(() => {
    if (!userId) return;
    syncAll(userId);
    const onOnline = () => syncAll(userId);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [userId]);

  return null;
}
