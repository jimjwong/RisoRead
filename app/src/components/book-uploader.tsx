"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleSlash } from "lucide-react";

/**
 * Uploading books, with the progress the browser can actually report.
 *
 * A Server Action cannot show a progress bar: byte counts only come from
 * XMLHttpRequest against a plain endpoint. So the form below still posts to
 * the action when this component never runs, and when it does run it takes
 * over and uploads one file at a time to /books/upload — the same ingest at
 * the far end either way.
 *
 * One file per request rather than one big batch. A single request gives one
 * bar that says nothing about which book is slow, and a failure anywhere loses
 * everything; per-file, a broken EPUB in the middle of a stack of ten costs
 * only itself and says so by name.
 */

type FileState = {
  name: string;
  size: number;
  /** 0–100 of bytes sent. Reaching 100 means uploaded, not yet ingested. */
  sent: number;
  status: "waiting" | "uploading" | "reading" | "added" | "duplicate" | "failed";
  detail?: string;
};

const MAX_BYTES = 100 * 1024 * 1024;

function human(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BookUploader({
  action,
  children,
}: {
  /**
   * The Server Action the form falls back to. Set as the form's own action so
   * a browser with no JavaScript posts it natively; when this component is
   * running, onSubmit preventDefaults first and the action never fires.
   * Without this the fallback would silently do nothing, which is worse than
   * having no fallback at all.
   */
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);

  const uploadOne = (file: File, index: number) =>
    new Promise<void>((resolve) => {
      const update = (patch: Partial<FileState>) =>
        setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));

      if (file.size > MAX_BYTES) {
        update({ status: "failed", detail: `over ${human(MAX_BYTES)}` });
        resolve();
        return;
      }

      const body = new FormData();
      body.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/books/upload");

      xhr.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) return;
        update({
          status: "uploading",
          sent: Math.round((event.loaded / event.total) * 100),
        });
      });

      // Bytes are all sent, but the server is still unzipping, rendering a
      // cover and writing to storage. Saying "uploading 100%" through that
      // reads as stuck, which is when people reload and upload twice.
      xhr.upload.addEventListener("load", () => update({ sent: 100, status: "reading" }));

      xhr.addEventListener("load", () => {
        try {
          const result = JSON.parse(xhr.responseText) as {
            status?: string;
            detail?: string;
          };
          if (result.status === "added") update({ status: "added" });
          else if (result.status === "duplicate")
            update({ status: "duplicate", detail: "already on the shelf" });
          else update({ status: "failed", detail: result.detail ?? "could not be read" });
        } catch {
          update({ status: "failed", detail: `server said ${xhr.status}` });
        }
        resolve();
      });

      xhr.addEventListener("error", () => {
        update({ status: "failed", detail: "the connection dropped" });
        resolve();
      });

      xhr.send(body);
    });

  const start = async (chosen: FileList) => {
    const list = Array.from(chosen);
    if (list.length === 0) return;

    setFiles(
      list.map((f) => ({ name: f.name, size: f.size, sent: 0, status: "waiting" as const })),
    );
    setBusy(true);

    // Sequential on purpose. Ingest unzips, rasterises a page and writes to
    // object storage; ten of those at once makes every one of them slower and
    // the progress meaningless.
    for (let i = 0; i < list.length; i++) {
      await uploadOne(list[i], i);
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    // The shelf is a server component, so it has to be told the world moved.
    router.refresh();
  };

  const done = files.length > 0 && !busy;
  const added = files.filter((f) => f.status === "added").length;

  /*
    Once everything has settled the bars have nothing left to report: a full
    green bar over the word "added" says what the sentence underneath already
    says, four times over, and pushes the shelf itself off the screen on a
    phone. What survives is the summary — and a row for each file that did not
    simply work, because "one was already there" is only useful if you can see
    which one.
  */
  const unresolved = files.filter((f) => f.status !== "added");
  const listed = done ? unresolved : files;

  return (
    // Marked while files are in flight, so a disclosure holding this one does
    // not tidy itself away in the middle of an upload.
    <div className="space-y-3" data-busy={busy ? "true" : undefined}>
      <form
        action={action}
        onSubmit={(event) => {
          event.preventDefault();
          const chosen = inputRef.current?.files;
          if (chosen) void start(chosen);
        }}
        className="space-y-2"
      >
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          accept="application/pdf,.pdf,application/epub+zip,.epub"
          aria-label="Book files to upload"
          disabled={busy}
          className="w-full text-xs text-[var(--fg-muted)] file:mr-3 file:rounded file:border file:bg-[var(--surface-2)] file:px-2 file:py-1 file:text-xs file:text-[var(--fg)]"
        />
        {children}
      </form>

      {listed.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {listed.map((f, i) => (
            <li key={`${f.name}-${i}`} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[var(--fg-muted)]">{f.name}</span>
                <span className="shrink-0 text-[var(--fg-subtle)]">{human(f.size)}</span>
                {f.status === "added" && (
                  <Check size={13} aria-hidden style={{ color: "var(--supports)" }} />
                )}
                {f.status === "duplicate" && (
                  <CircleSlash size={13} aria-hidden style={{ color: "var(--fg-subtle)" }} />
                )}
                {f.status === "failed" && (
                  <CircleAlert size={13} aria-hidden style={{ color: "var(--contradicts)" }} />
                )}
              </div>

              {!done && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{
                    width:
                      f.status === "waiting"
                        ? "0%"
                        : f.status === "uploading"
                          ? `${f.sent}%`
                          : "100%",
                    background:
                      f.status === "failed"
                        ? "var(--contradicts)"
                        : f.status === "added"
                          ? "var(--supports)"
                          : f.status === "duplicate"
                            ? "var(--fg-subtle)"
                            : "var(--accent)",
                  }}
                />
              </div>
              )}

              <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">
                {f.status === "waiting" && "waiting"}
                {f.status === "uploading" && `uploading ${f.sent}%`}
                {f.status === "reading" && "reading the file…"}
                {f.status === "added" && "added"}
                {f.status !== "added" && f.detail}
              </p>
            </li>
          ))}
        </ul>
      )}

      {done && (
        <p
          className="text-xs"
          aria-live="polite"
          style={{ color: added > 0 ? "var(--supports)" : "var(--fg-muted)" }}
        >
          {added > 0
            ? `${added} book${added === 1 ? "" : "s"} added to the shelf.`
            : "Nothing new was added."}
        </p>
      )}
    </div>
  );
}
