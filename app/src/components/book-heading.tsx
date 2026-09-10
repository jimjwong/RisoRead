import { Check } from "lucide-react";
import { formatAuthorLines, type Author } from "@/lib/types";
import { renameBook } from "@/app/books/actions";

/**
 * The book's title and byline, editable in place.
 *
 * The fields are inputs that look like text rather than text that turns into
 * inputs. That is a deliberate inversion: the swap-on-click version needs
 * JavaScript to exist at all, and this application is read over plain HTTP on
 * a tailnet where hydration is not guaranteed. Tapping one focuses it, Enter
 * submits because a form with a submit button does that natively, and none of
 * it depends on a script having run.
 *
 * Nothing is saved until the save control is used or Enter is pressed, so a
 * stray tap costs nothing — which is the property the tap-to-edit pattern is
 * really protecting.
 *
 * Renaming changes what the shelf calls the book and nothing else. The file is
 * addressed by the hash of its own bytes, so the stored object keeps its name
 * and every signed URL keeps working.
 */
export function BookHeading({
  bookId,
  title,
  authors,
  at,
  focus,
}: {
  bookId: string;
  title: string;
  authors: Author[];
  /** Where the reader is, so saving a name does not move them. */
  at: number;
  focus: boolean;
}) {
  return (
    <form action={renameBook} className="group/rename">
      <input type="hidden" name="book_id" value={bookId} />
      <input type="hidden" name="at" value={at} />
      <input type="hidden" name="focus" value={focus ? "1" : ""} />

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="book-title" className="sr-only">
            Title
          </label>
          <input
            id="book-title"
            name="title"
            defaultValue={title}
            required
            aria-label="Book title"
            // Styled as the heading it replaces. The border only appears on
            // focus, so the page reads as a title until someone means to
            // change it.
            className="prose-measure w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-base leading-snug font-semibold text-[var(--fg)] hover:border-[var(--border)] focus:border-[var(--border-firm)] focus:bg-[var(--surface)] focus:outline-none"
          />

          <label htmlFor="book-authors" className="sr-only">
            Authors
          </label>
          <input
            id="book-authors"
            name="authors"
            defaultValue={formatAuthorLines(authors).replace(/\n/g, "; ")}
            placeholder="Add authors"
            aria-label="Authors, separated by semicolons"
            className="mt-0.5 w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-[var(--fg-muted)] placeholder:text-[var(--fg-subtle)] hover:border-[var(--border)] focus:border-[var(--border-firm)] focus:bg-[var(--surface)] focus:outline-none"
          />
        </div>

        {/*
          Visible once either field has focus, and always visible to a keyboard
          or screen reader — focus-within covers the button's own focus, so
          tabbing to it does not make it disappear underneath the cursor.
        */}
        <button
          type="submit"
          title="Save the title and authors"
          className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs opacity-0 transition group-focus-within/rename:opacity-100 hover:bg-[var(--surface-2)] focus:opacity-100"
        >
          <Check size={14} aria-hidden />
          Save
        </button>
      </div>

      <p className="mt-0.5 h-0 overflow-hidden px-1.5 text-xs text-[var(--fg-subtle)] transition-[height] group-focus-within/rename:h-4">
        Press Enter to save. Separate authors with a semicolon.
      </p>
    </form>
  );
}
