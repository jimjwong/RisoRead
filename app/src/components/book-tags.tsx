import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { saveTags, acceptSuggestedTags, dismissSuggestedTags } from "@/app/books/actions";

/**
 * A book's tags, and whatever the model thought they should be.
 *
 * Suggestions are shown as suggestions and stored apart from confirmed tags,
 * which is the whole point of keeping two columns. A proposed tag displayed
 * identically to a chosen one becomes a fact by accident, and a shelf filtered
 * on tags nobody looked at is worse than an untagged shelf, because it looks
 * organised.
 *
 * Editing is a plain input rather than a chip widget: tags are a short
 * comma-separated list, every browser can already edit that, and it works
 * before any script has run.
 */
export function BookTags({
  bookId,
  tags,
  suggested,
  at,
  focus,
}: {
  bookId: string;
  tags: string[];
  suggested: string[];
  at: number;
  focus: boolean;
}) {
  // Anything already applied is not worth proposing again.
  const applied = new Set(tags.map((t) => t.toLowerCase()));
  const pending = suggested.filter((t) => !applied.has(t.toLowerCase()));

  return (
    <Card className="p-4">
      <h2 className="mb-2 text-sm font-medium">Tags</h2>

      {tags.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/books?tag=${encodeURIComponent(tag)}`}
              className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              {tag}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-xs text-[var(--fg-muted)]">
          Not tagged yet.
        </p>
      )}

      {pending.length > 0 && (
        <div
          className="mb-3 rounded-md border p-2.5"
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
            background: "color-mix(in srgb, var(--accent) 6%, transparent)",
          }}
        >
          <p className="mb-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--accent)" }}>
            <Sparkles size={13} aria-hidden />
            Claude read the opening and suggests these
          </p>

          <div className="mb-2 flex flex-wrap gap-1.5">
            {pending.map((tag) => (
              <span
                key={tag}
                className="rounded border px-2 py-0.5 text-xs"
                style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={acceptSuggestedTags}>
              <input type="hidden" name="book_id" value={bookId} />
              <input type="hidden" name="at" value={at} />
              <input type="hidden" name="focus" value={focus ? "1" : ""} />
              <Button type="submit" variant="ghost" className="text-xs">
                <Check size={13} aria-hidden />
                Use these
              </Button>
            </form>

            <form action={dismissSuggestedTags}>
              <input type="hidden" name="book_id" value={bookId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-[var(--fg-subtle)] hover:text-[var(--fg)]"
              >
                <X size={13} aria-hidden />
                No thanks
              </button>
            </form>
          </div>

          <p className="mt-2 text-[11px] text-[var(--fg-subtle)]">
            Or edit them below — anything you save replaces the suggestion.
          </p>
        </div>
      )}

      <form action={saveTags} className="space-y-2">
        <input type="hidden" name="book_id" value={bookId} />
        <input type="hidden" name="at" value={at} />
        <input type="hidden" name="focus" value={focus ? "1" : ""} />
        <Input
          name="tags"
          // Suggestions are pre-filled into the box so accepting with an edit
          // is one action rather than retyping what was already proposed.
          defaultValue={[...tags, ...pending].join(", ")}
          placeholder="survey methods, organisational change"
          aria-label="Tags, separated by commas"
          className="text-sm"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="ghost" className="text-xs">
            Save tags
          </Button>
          <span className="text-[11px] text-[var(--fg-subtle)]">
            Separated by commas. Up to twelve.
          </span>
        </div>
      </form>
    </Card>
  );
}
