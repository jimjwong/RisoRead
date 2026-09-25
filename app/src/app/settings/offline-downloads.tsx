"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";
import { bytesLabel } from "@/lib/billing/plans";
import * as manifest from "@/lib/offline/manifest";
import { removeDownload } from "@/lib/offline/engine";
import type { DownloadEntry } from "@/lib/offline/manifest";

/**
 * What this device has saved for offline reading.
 *
 * A separate concept from "Taking your books with you" above it: that card
 * is about exporting the original file; this one is the reader's own offline
 * cache, which lives in this browser and nowhere else. IndexedDB has no
 * synchronous read, so the empty-state copy renders first and the real list
 * swaps in once `manifest.list` resolves — the same render-then-correct
 * pattern the rest of the offline engine's UI uses.
 */
export function OfflineDownloads({ userId }: { userId: string }) {
  const [downloads, setDownloads] = useState<DownloadEntry[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    manifest.list(userId).then((rows) => {
      if (!cancelled) setDownloads(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function remove(bookId: string) {
    setRemovingId(bookId);
    try {
      await removeDownload({ bookId, userId });
      setDownloads((rows) => rows.filter((r) => r.bookId !== bookId));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-1 text-sm font-medium">Downloaded for offline</h2>
      <p className="mb-3 text-xs text-[var(--fg-muted)]">
        Saved on this device only, for reading with no connection. Signing in
        on another device starts with nothing downloaded there.
      </p>

      {downloads.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Nothing saved for offline on this device yet.
        </p>
      ) : (
        <ul className="divide-y">
          {downloads.map((entry) => (
            <li key={entry.bookId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">{entry.title}</p>
                <p className="text-xs text-[var(--fg-subtle)]">
                  {entry.format.toUpperCase()} · {bytesLabel(entry.bytesApprox)} ·{" "}
                  {new Date(entry.downloadedAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="shrink-0 text-xs"
                disabled={removingId === entry.bookId}
                onClick={() => remove(entry.bookId)}
              >
                {removingId === entry.bookId ? "Removing…" : "Remove"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
