"use client";

import { useEffect, useState } from "react";
import { Download, CloudCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { bytesLabel } from "@/lib/billing/plans";
import * as manifest from "@/lib/offline/manifest";
import { downloadPdf, downloadEpub, removeDownload } from "@/lib/offline/engine";
import type { DownloadEntry } from "@/lib/offline/manifest";

type Status =
  | { kind: "idle" }
  | { kind: "downloading"; done: number; total: number }
  | { kind: "downloaded"; entry: DownloadEntry }
  | { kind: "removing" }
  | { kind: "error"; message: string };

/**
 * Save this one book for offline reading, or take it back off the device.
 *
 * Renders the "idle" button on first paint, on the server and the client
 * alike — IndexedDB has no synchronous read, so there is no way to know
 * whether this book is already downloaded before mount. A `useEffect`
 * corrects it a moment later if it is, the same render-then-correct pattern
 * `reader-interactions.tsx` already uses for the same reason.
 */
export function SaveOfflineControl({
  bookId,
  userId,
  format,
  title,
  totalUnits,
}: {
  bookId: string;
  userId: string | null;
  format: "pdf" | "epub";
  title: string;
  totalUnits: number;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    manifest.get(userId, bookId).then((entry) => {
      if (!cancelled && entry && entry.format === format) {
        setStatus({ kind: "downloaded", entry });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, bookId, format]);

  // A device reading someone else's shared shelf with no account of its own
  // isn't a real scenario here, but downloads are meaningless without an
  // identity to scope the cache to — the engine and manifest enforce this
  // everywhere else, so this control does too.
  if (!userId) return null;

  async function start() {
    setStatus({ kind: "downloading", done: 0, total: totalUnits });
    try {
      const onProgress = (done: number, total: number) =>
        setStatus({ kind: "downloading", done, total });

      if (format === "pdf") {
        await downloadPdf({ bookId, userId: userId as string, title, totalPages: totalUnits, onProgress });
      } else {
        await downloadEpub({ bookId, userId: userId as string, title, totalChapters: totalUnits, onProgress });
      }

      const entry = await manifest.get(userId as string, bookId);
      setStatus(entry ? { kind: "downloaded", entry } : { kind: "idle" });
    } catch {
      setStatus({ kind: "error", message: "Could not save this book for offline reading." });
    }
  }

  async function remove() {
    setStatus({ kind: "removing" });
    try {
      await removeDownload({ bookId, userId: userId as string });
      setStatus({ kind: "idle" });
    } catch {
      setStatus({ kind: "error", message: "Could not remove the offline copy." });
    }
  }

  if (status.kind === "downloaded") {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
        <CloudCheck size={14} aria-hidden style={{ color: "var(--supports)" }} />
        <span>Available offline · {bytesLabel(status.entry.bytesApprox)}</span>
        <Button type="button" variant="ghost" className="text-xs" onClick={remove}>
          Remove
        </Button>
      </div>
    );
  }

  if (status.kind === "downloading") {
    return (
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs text-[var(--fg-muted)]">
        <Loader2 size={14} aria-hidden className="animate-spin" />
        Saving for offline… {status.done}/{status.total}
      </span>
    );
  }

  if (status.kind === "removing") {
    return (
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs text-[var(--fg-muted)]">
        <Loader2 size={14} aria-hidden className="animate-spin" />
        Removing…
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="ghost" className="text-xs" onClick={start}>
        <Download size={14} aria-hidden />
        Save for offline
      </Button>
      {status.kind === "error" && (
        <span className="text-xs" style={{ color: "var(--contradicts)" }}>
          {status.message}
        </span>
      )}
    </div>
  );
}
