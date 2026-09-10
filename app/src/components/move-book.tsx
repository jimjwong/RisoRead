"use client";

import { useState } from "react";
import { Check, Folder } from "lucide-react";

/**
 * Filing one book, without losing your place.
 *
 * The move happens in the background and the page is deliberately left alone —
 * no navigation, no refresh. Filing a shelf is something people do to twenty
 * books in a row, and a full round trip between each one throws away the scroll
 * position every time, which is most of the work of finding the next book.
 *
 * The cost is that anything counting books is briefly wrong: the folder rail
 * still shows the old totals until the next navigation. That is the trade —
 * a stale number against a page that stays where you put it — and the control
 * says what happened, so the number is never the only evidence.
 *
 * Still a form around a Server Action underneath, so it works with no client
 * JavaScript; then it navigates, because without a script that is the only way
 * anything can happen at all.
 */
export function MoveBookControl({
  action,
  bookId,
  returnTo,
  current,
  folders,
  className = "",
}: {
  action: (formData: FormData) => Promise<void>;
  bookId: string;
  /** Where the no-JavaScript fallback comes back to. */
  returnTo: string;
  current: string | null;
  folders: { id: string; label: string }[];
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [filed, setFiled] = useState(current ?? "");

  const move = async (folderId: string) => {
    setState("saving");
    try {
      const body = new FormData();
      body.set("book_id", bookId);
      body.set("folder_id", folderId);
      const res = await fetch("/books/move", { method: "POST", body });
      if (!res.ok) throw new Error(String(res.status));
      setFiled(folderId);
      setState("saved");
    } catch {
      setState("failed");
    }
  };

  return (
    <form
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const select = form.elements.namedItem("folder_id") as HTMLSelectElement | null;
        void move(select?.value ?? "");
      }}
      className={`flex items-center gap-1.5 ${className}`}
    >
      <input type="hidden" name="book_id" value={bookId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <label htmlFor={`move-${bookId}`} className="sr-only">
        Folder
      </label>
      <select
        id={`move-${bookId}`}
        name="folder_id"
        defaultValue={current ?? ""}
        // Choosing is not filing. Picking the wrong entry in a list on a phone
        // is easy enough that doing it on change would file books by accident,
        // with nothing to undo it.
        onChange={() => setState("idle")}
        className="min-h-8 min-w-0 flex-1 rounded border bg-[var(--surface)] px-1.5 text-xs text-[var(--fg-muted)]"
      >
        <option value="">Unfiled</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={state === "saving"}
        className="shrink-0 rounded border px-2 py-1 text-[11px] text-[var(--fg-subtle)] hover:text-[var(--fg)] disabled:opacity-50"
      >
        {state === "saving" ? "Moving…" : "Move"}
      </button>

      {/*
        The whole confirmation, since nothing else on the page changes. Assertive
        rather than polite: it is the only report of something the reader asked
        for and cannot otherwise see.
      */}
      <span role="status" aria-live="assertive" className="shrink-0 text-[11px]">
        {state === "saved" && (
          <span className="inline-flex items-center gap-1" style={{ color: "var(--supports)" }}>
            <Check size={11} aria-hidden />
            {filed ? "Filed" : "Unfiled"}
          </span>
        )}
        {state === "failed" && (
          <span style={{ color: "var(--contradicts)" }}>Not moved</span>
        )}
      </span>
    </form>
  );
}

/** The folder a book is in, for pages that only need to say so. */
export function FolderLabel({ name }: { name: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[var(--fg-subtle)]">
      <Folder size={12} aria-hidden />
      {name ?? "Unfiled"}
    </span>
  );
}
