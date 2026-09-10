import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { BookHeading } from "@/components/book-heading";
import { BookTags } from "@/components/book-tags";
import { ReaderGestures } from "@/components/reader-gestures";
import { ReaderComfort } from "@/components/reader-controls";
import { MoveBookControl, FolderLabel } from "@/components/move-book";
import {
  buildFolderTree,
  folderOptions as buildFolderOptions,
  type FolderRow,
} from "@/components/folder-sidebar";
import { moveBook } from "../folder-actions";
import { Button, Card, Shell, Textarea } from "@/components/ui";
import { getBook, bookUrl } from "@/lib/storage/books";
import { parseEpub, renderChapter, EpubError } from "@/lib/books/epub";
import { readingPrefs, readingVars } from "@/lib/books/reading-prefs";
import { saveProgress, addBookmark, removeBookmark, deleteBook } from "../actions";

export const dynamic = "force-dynamic";

type Bookmark = {
  id: string;
  location: number;
  label: string | null;
  note: string | null;
};

/**
 * The reader.
 *
 * A chapter at a time, rendered on the server, rather than shipping an EPUB
 * engine to the browser: the whole application works without client
 * JavaScript, and a reader that needs hydration to show a page of text is a
 * blank screen when hydration fails — which on this deployment, over plain
 * HTTP on a tailnet address, it has.
 *
 * Focus mode follows the same rule. It is a URL parameter that renders the page
 * without its surrounding chrome, so it works with no JavaScript and can be
 * linked to.
 *
 * Page turns are links rather than form submissions, and the position is
 * recorded when the page renders with an explicit ?at. That is a write on a GET,
 * which is normally worth avoiding — it is defensible here because "where I am
 * in this book" is per-reader, idempotent and not destructive, and because the
 * alternative cost a POST and a redirect for every page turn, which on a phone
 * is the difference between reading and waiting. The page-turn links are plain
 * anchors for the same reason it is defensible: next/link prefetches, and a
 * prefetched page turn would record a position nobody had read to.
 */
export default async function ReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const focus = sp.focus === "1";

  const supabase = await getSupabaseServerClient();

  const { data: book, error } = await supabase
    .from("books")
    .select(
      "id, title, authors, format, storage_path, cover_path, publisher, published_year, language, isbn, description, subjects, tags, suggested_tags, location_count, size_bytes, folder_id, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!book) notFound();

  const [{ data: progress }, { data: bookmarkRows }] = await Promise.all([
    supabase
      .from("reading_progress")
      .select("location, percent, updated_at")
      .eq("book_id", id)
      .maybeSingle(),
    supabase
      .from("bookmarks")
      .select("id, location, label, note, created_at")
      .eq("book_id", id)
      .order("location"),
  ]);

  const bookmarks = (bookmarkRows ?? []) as Bookmark[];
  const isPdf = book.format === "pdf";
  const total = (book.location_count as number | null) ?? 1;

  // Where to open. An explicit ?at wins; otherwise the place this reader was
  // last at, which is the whole point of recording it.
  const savedAt = (progress?.location as number | null) ?? 0;
  const requested = sp.at !== undefined ? Number(sp.at) : savedAt;
  const at = Math.max(
    0,
    Math.min(Number.isFinite(requested) ? requested : 0, Math.max(0, total - 1)),
  );

  // Recorded here rather than in an action, so a page turn is one GET. See the
  // note at the top of the file for why a write on a GET is the right trade
  // in this one place.
  if (sp.at !== undefined && at !== savedAt) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: owner } = await supabase
        .from("books")
        .select("org_id")
        .eq("id", id)
        .maybeSingle();
      if (owner) {
        await supabase.from("reading_progress").upsert(
          {
            book_id: id,
            user_id: user.id,
            org_id: owner.org_id,
            location: at,
            percent: total > 1 ? Math.round((at / (total - 1)) * 100) : 0,
            finished_at: at >= total - 1 ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "book_id,user_id" },
        );
      }
    }
  }

  const resumed = sp.at === undefined && savedAt > 0;
  const percent = total > 1 ? Math.round((at / (total - 1)) * 100) : 0;
  const unit = isPdf ? "Page" : "Chapter";
  const bookmarkHere = bookmarks.find((b) => b.location === at);

  const authors = (book.authors as { name: string }[] | null) ?? [];
  const subjects = (book.subjects as string[] | null) ?? [];

  const href = (loc: number, extra = "") =>
    `/books/${id}?at=${loc}${focus ? "&focus=1" : ""}${extra}`;

  const prevHref = at > 0 ? href(at - 1) : null;
  const nextHref = at < total - 1 ? href(at + 1) : null;

  /** Where a preference form comes back to, so changing text size stays put. */
  const returnTo = href(at);

  const prefs = await readingPrefs();

  // The shelf is where books are filed in bulk; this is where one book is
  // filed while you are looking at it, which is when you actually know where
  // it belongs.
  const { data: folderRows } = await supabase
    .from("book_folders")
    .select("id, name, parent_id, position");
  const folders = (folderRows ?? []) as FolderRow[];
  const { tree: folderTree } = buildFolderTree(folders, new Map());
  const folderOptions = buildFolderOptions(folderTree);
  const folderName =
    folders.find((f) => f.id === (book.folder_id as string | null))?.name ?? null;

  // --- Controls, identical for both formats --------------------------------
  //
  // Anchors, not forms. A page turn used to be a POST and a redirect; it is now
  // one request, which is what makes tapping through a book feel like reading
  // rather than like submitting something.
  const turn = (
    href: string | null,
    direction: "Previous" | "Next",
    icon: React.ReactNode,
    /** Hidden in the footer, where there is room for an arrow and nothing else. */
    showLabel = true,
  ) => {
    const label = `${direction} ${unit.toLowerCase()}`;
    return href ? (
      <a
        href={href}
        rel="nofollow"
        // The name comes from here rather than from the text, because in the
        // footer there is no text — an unlabelled arrow either side of a
        // percentage is two controls a screen reader cannot tell apart.
        aria-label={label}
        className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 text-xs hover:bg-[var(--surface-2)]"
      >
        {icon}
        {showLabel && direction}
      </a>
    ) : (
      <span
        aria-hidden
        className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 text-xs opacity-40"
      >
        {icon}
        {showLabel && direction}
      </span>
    );
  };

  const nav = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {turn(prevHref, "Previous", <ChevronLeft size={14} aria-hidden />)}

      <span className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
        {bookmarkHere && (
          <BookmarkIcon
            size={13}
            aria-label="Bookmarked"
            style={{ color: "var(--accent)" }}
          />
        )}
        {unit} {at + 1} of {total} · {percent}%
      </span>

      {turn(nextHref, "Next", <ChevronRight size={14} aria-hidden />)}
    </div>
  );

  /** Jump straight to a numbered page or chapter, which matters in a long book. */
  const jump = (
    <form action={saveProgress} className="flex items-center gap-2">
      <input type="hidden" name="book_id" value={id} />
      <input type="hidden" name="focus" value={focus ? "1" : ""} />
      <label htmlFor="jump" className="text-xs text-[var(--fg-muted)]">
        Go to
      </label>
      <input
        id="jump"
        name="location_display"
        type="number"
        min={1}
        max={total}
        defaultValue={at + 1}
        className="min-h-9 w-20 rounded-md border bg-[var(--surface)] px-2 text-sm text-[var(--fg)]"
      />
      <Button type="submit" variant="ghost" className="text-xs">
        Go
      </Button>
    </form>
  );

  const bar = (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={focus ? `/books/${id}?at=${at}` : `/books/${id}?at=${at}&focus=1`}
        rel="nofollow"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-[var(--surface-2)]"
      >
        {focus ? (
          <>
            <Minimize2 size={14} aria-hidden />
            Leave focus
          </>
        ) : (
          <>
            <Maximize2 size={14} aria-hidden />
            Read
          </>
        )}
      </Link>
      {bookmarks.length > 0 && (
        <span className="text-xs text-[var(--fg-subtle)]">
          {bookmarks.length} bookmark{bookmarks.length === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );

  // --- Body ----------------------------------------------------------------
  let body: React.ReactNode;
  let failure: string | null = null;

  if (isPdf) {
    // The original file, for anyone who wants the real viewer, to search it or
    // to keep a copy. The page itself is rendered rather than embedded.
    const url = await bookUrl(book.storage_path as string, 3600);

    // "page" fits a whole page on screen, the way a book is held; "width"
    // fills the column and scrolls, which is the only way a textbook is
    // legible on a phone. The reader picks; neither is right for both.
    const fitPage = prefs.fit === "page";
    const zoom = prefs.zoom / 100;

    /*
      Zoom multiplies whichever fit is in force, and the container scrolls in
      both directions once it is past 100%.

      There is real detail to find: the page is rendered at 3000px, so a phone
      at 390 CSS pixels and two device pixels each is showing about a quarter of
      the source at 100%. Two hundred per cent is still reading pixels that
      exist rather than interpolating between them, which is the difference
      between zooming into a figure and blurring it.
    */
    const zoomed = prefs.zoom !== 100;

    body = (
      <div
        className={
          focus
            ? zoomed
              ? "overflow-auto"
              : "overflow-hidden"
            : `rounded-[var(--radius)] border bg-[var(--surface)] ${zoomed ? "overflow-auto" : "overflow-hidden"}`
        }
      >
        {/*
          A rendered image rather than an embedded viewer.

          Safari on iOS shows only the first page of a PDF in an iframe and
          will not scroll it, so a reader on a phone was stuck on page one no
          matter what the page number said. Rendering server-side takes the
          browser out of the argument: every device gets the same page, and it
          scales to the width it is given instead of to whatever the viewer
          decides.

          Not next/image: the route is auth-scoped per book and the optimiser
          cannot reach it.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/books/${id}/page-image?p=${at + 1}&w=3000`}
          // Every option here is larger than the box it is displayed in, on
          // purpose. A page of a book is read by pinching into it, so sizing
          // the image to its slot leaves nothing to magnify — which is what
          // made this look soft on a phone even though it filled the screen.
          srcSet={[2400, 3000, 4000]
            .map((w) => `/books/${id}/page-image?p=${at + 1}&w=${w} ${w}w`)
            .join(", ")}
          // The slot is over-stated for the same reason: the browser multiplies
          // this by the device pixel ratio to choose, and an honest figure here
          // would have it choose just enough to display and no more.
          sizes="(min-width: 1024px) 1400px, 150vw"
          alt={`Page ${at + 1} of ${book.title}`}
          className={
            fitPage
              ? "mx-auto block max-h-[calc(100dvh-8.5rem)] w-auto max-w-full object-contain"
              : "block h-auto w-full"
          }
          // Only when it is not 100%, so the ordinary case keeps the plain
          // classes above and nothing has to compute a width to fill a column.
          style={
            zoomed
              ? fitPage
                ? { maxHeight: `calc((100dvh - 8.5rem) * ${zoom})`, maxWidth: "none" }
                : { width: `${prefs.zoom}%`, maxWidth: "none" }
              : undefined
          }
          loading="eager"
        />

        {url && !focus && (
          <div className="border-t p-3">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--accent)] hover:underline"
            >
              Open the original PDF
            </a>
            <span className="ml-2 text-xs text-[var(--fg-subtle)]">
              for search, text selection or to keep a copy
            </span>
          </div>
        )}
      </div>
    );
  } else {
    let chapterHtml = "";
    try {
      const bytes = await getBook(book.storage_path as string);
      if (!bytes) throw new EpubError("This book's file could not be reached.");
      const epub = parseEpub(bytes);
      const item = epub.spine[Math.min(at, epub.spine.length - 1)];
      chapterHtml = renderChapter(bytes, item.href, { assetBase: `/books/${id}/asset` });
    } catch (err) {
      failure = err instanceof Error ? err.message : "This book could not be opened.";
    }

    body = failure ? (
      <Card className="p-5">
        <p className="text-sm" style={{ color: "var(--limitation)" }}>
          {failure}
        </p>
      </Card>
    ) : (
      // The variables are set here as well as on the focus wrapper, because the
      // ordinary view has no wrapper of its own — and a chapter whose font-size
      // resolves to nothing is a chapter at the browser default.
      <div
        className={focus ? "px-4 py-6 sm:px-10 sm:py-12" : "rounded-[var(--radius)] border p-5 sm:p-10"}
        style={{
          ...(readingVars(prefs) as React.CSSProperties),
          background: "var(--reading-bg, var(--surface))",
          color: "var(--reading-fg, var(--fg))",
        }}
      >
        {/*
          XHTML from a file someone uploaded, filtered to a tag allowlist in
          renderChapter — no scripts, styles, event handlers or iframes — which
          is what makes putting it on the page defensible.
        */}
        {/*
          Size, spacing, measure and typeface all arrive as custom properties
          set on the reading surface, applied on the server so the first paint
          is already right and nothing reflows under the reader. font-size is
          also written directly, because it is the one the stylesheet needs to
          resolve the measure against — the measure is in em.
        */}
        <article
          className="book-prose"
          style={{ fontSize: "var(--reading-size)" }}
          dangerouslySetInnerHTML={{ __html: chapterHtml }}
        />
      </div>
    );
  }

  const progressBar = (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${percent}%`, background: "var(--accent)" }}
      />
    </div>
  );

  const bookmarkForm = (
    <form action={addBookmark} className="space-y-2">
      <input type="hidden" name="book_id" value={id} />
      <input type="hidden" name="location" value={at} />
      <input type="hidden" name="focus" value={focus ? "1" : ""} />
      <Textarea
        name="note"
        rows={2}
        placeholder={`Why ${unit.toLowerCase()} ${at + 1} is worth coming back to…`}
        className="text-sm"
      />
      <Button type="submit" variant="ghost" className="text-xs">
        <BookmarkIcon size={13} aria-hidden />
        Bookmark {unit.toLowerCase()} {at + 1}
      </Button>
    </form>
  );

  const bookmarkList = (
    <ul className="divide-y">
      {bookmarks.map((b) => (
        <li key={b.id} className="flex items-start gap-3 py-2">
          {/*
            A plain anchor, like the page turns and for the same reason: this
            href records a position when it is followed, and next/link may
            fetch it without anyone following it. A prefetched bookmark would
            move the reader to that bookmark without them ever tapping it.
          */}
          <a
            href={href(b.location)}
            rel="nofollow"
            className="min-w-0 flex-1 text-sm hover:text-[var(--accent)]"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <BookmarkIcon size={12} aria-hidden style={{ color: "var(--accent)" }} />
              {unit} {b.location + 1}
            </span>
            {b.note && <span className="block text-xs text-[var(--fg-muted)]">{b.note}</span>}
          </a>
          <form action={removeBookmark}>
            <input type="hidden" name="book_id" value={id} />
            <input type="hidden" name="bookmark_id" value={b.id} />
            <input type="hidden" name="at" value={at} />
            <input type="hidden" name="focus" value={focus ? "1" : ""} />
            <button
              type="submit"
              className="text-xs text-[var(--fg-subtle)] hover:text-[var(--contradicts)]"
            >
              Remove
            </button>
          </form>
        </li>
      ))}
    </ul>
  );

  // --- Focus mode: the reading surface -------------------------------------
  //
  // The page is the screen. Everything else is a thin bar at the top and a thin
  // bar at the bottom, and the two invisible strips down the sides that turn
  // pages when tapped — the arrangement every e-reader has converged on,
  // because the alternative is reading a book through a form.
  if (focus) {
    return (
      // The reading variables sit on the outermost element so the page, the
      // bars and the chapter all resolve the same tint. Falling back to the
      // application's own colours when the tint is "paper" means the reader
      // does not pin itself to a light theme of its own.
      <div
        className="flex min-h-[100dvh] flex-col"
        style={{
          ...(readingVars(prefs) as React.CSSProperties),
          background: "var(--reading-bg, var(--bg))",
          color: "var(--reading-fg, var(--fg))",
        }}
      >
        <ReaderGestures prev={prevHref} next={nextHref} />

        <header className="flex items-center gap-3 border-b px-3 py-2">
          <Link
            href={`/books/${id}?at=${at}`}
            rel="nofollow"
            aria-label="Leave focus"
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
          >
            <Minimize2 size={15} aria-hidden />
          </Link>
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--fg-muted)]">
            {book.title}
          </span>
          <span className="shrink-0 text-xs text-[var(--fg-subtle)] tabular-nums">
            {at + 1}/{total}
          </span>
        </header>

        {/*
          The page, and the two tap strips over it. The strips stop short of the
          middle so a passage can still be selected and a diagram pinched into,
          which is the difference between a reader and a slideshow.
        */}
        <div className="relative flex-1">
          {body}

          {prevHref && (
            <a
              href={prevHref}
              rel="nofollow"
              aria-label={`Previous ${unit.toLowerCase()}`}
              className="reader-zone absolute inset-y-0 left-0 w-[18%]"
            />
          )}
          {nextHref && (
            <a
              href={nextHref}
              rel="nofollow"
              aria-label={`Next ${unit.toLowerCase()}`}
              className="reader-zone absolute inset-y-0 right-0 w-[18%]"
            />
          )}
        </div>

        {/*
          Bottom bar, padded past the home indicator. Sticky rather than fixed
          so a long chapter scrolls under it without the bar covering the last
          paragraph.
        */}
        <footer
          className="sticky bottom-0 border-t backdrop-blur pb-[env(safe-area-inset-bottom)]"
          style={{ background: "var(--reading-bg, var(--surface))" }}
        >
          {progressBar}

          <div className="flex items-center gap-2 px-3 py-2">
            {turn(prevHref, "Previous", <ChevronLeft size={16} aria-hidden />, false)}

            <div className="min-w-0 flex-1 text-center text-[11px] text-[var(--fg-subtle)]">
              {bookmarkHere && (
                <BookmarkIcon
                  size={11}
                  className="mr-1 inline"
                  aria-label="Bookmarked"
                  style={{ color: "var(--accent)" }}
                />
              )}
              {percent}%
            </div>

            {turn(nextHref, "Next", <ChevronRight size={16} aria-hidden />, false)}
          </div>

          <details className="border-t">
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] opacity-70 select-none">
              Go to a page, bookmark, or change how this reads
            </summary>
            <div className="space-y-3 px-3 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {jump}
                <form action={addBookmark}>
                  <input type="hidden" name="book_id" value={id} />
                  <input type="hidden" name="location" value={at} />
                  <input type="hidden" name="focus" value="1" />
                  <Button type="submit" variant="ghost" className="text-xs">
                    <BookmarkIcon size={13} aria-hidden />
                    Bookmark
                  </Button>
                </form>
              </div>

              <ReaderComfort prefs={prefs} isPdf={isPdf} returnTo={returnTo} compact />

              {bookmarks.length > 0 && <div>{bookmarkList}</div>}
            </div>
          </details>
        </footer>
      </div>
    );
  }

  // --- Ordinary view --------------------------------------------------------
  return (
    <Shell
      breadcrumb={
        <Link href="/books" className="hover:text-[var(--fg)]">
          Shelf
        </Link>
      }
    >
      <div className="mb-5">
        <BookHeading
          bookId={id}
          title={book.title as string}
          authors={authors}
          at={at}
          focus={focus}
        />
        {(book.published_year || book.publisher) && (
          <p className="mt-0.5 px-1.5 text-sm text-[var(--fg-muted)]">
            {[book.published_year, book.publisher].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--fg-subtle)]">
          <FolderLabel name={folderName} />
          <span className="uppercase">{book.format}</span>
          {book.location_count && (
            <span>
              {book.location_count} {isPdf ? "pages" : "chapters"}
            </span>
          )}
          <span>{Math.round((book.size_bytes as number) / 1024 / 1024)} MB</span>
          {book.language && <span>{book.language}</span>}
          {book.isbn && <span>ISBN {book.isbn}</span>}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {bar}
        {jump}
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <ReaderComfort prefs={prefs} isPdf={isPdf} returnTo={returnTo} />
        {folderOptions.length > 0 && (
          <MoveBookControl
            action={moveBook}
            bookId={id}
            returnTo={returnTo}
            current={(book.folder_id as string | null) ?? null}
            folders={folderOptions}
          />
        )}
      </div>

      {resumed && (
        <Card className="mb-3 p-2.5">
          <p className="text-xs text-[var(--fg-muted)]">
            Picking up where you left off, at {unit.toLowerCase()} {at + 1}.{" "}
            {/* Anchor, not Link: prefetching this would send the reader back
                to the beginning of the book without them asking. */}
            <a href={href(0)} rel="nofollow" className="text-[var(--accent)] hover:underline">
              Start from the beginning
            </a>
          </p>
        </Card>
      )}

      {(sp.notice === "tagged" || sp.notice === "dismissed") && (
        <Card className="mb-3 p-2.5">
          <p role="status" className="text-xs" style={{ color: "var(--supports)" }}>
            {sp.notice === "tagged" ? "Tags saved." : "Suggestions dismissed."}
          </p>
        </Card>
      )}

      {sp.notice === "renamed" && (
        <Card className="mb-3 p-2.5">
          <p role="status" className="text-xs" style={{ color: "var(--supports)" }}>
            Renamed. The file itself is untouched.
          </p>
        </Card>
      )}

      {sp.notice === "notitle" && (
        <Card className="mb-3 p-2.5">
          <p role="status" className="text-xs" style={{ color: "var(--limitation)" }}>
            A book needs a title.
          </p>
        </Card>
      )}

      {sp.notice === "bookmarked" && (
        <Card className="mb-3 p-2.5">
          <p role="status" className="text-xs" style={{ color: "var(--supports)" }}>
            Bookmarked. It is yours alone, and you can jump back to it any time.
          </p>
        </Card>
      )}

      <ReaderGestures prev={prevHref} next={nextHref} />

      <div className="mb-3">{progressBar}</div>

      <Card className="mb-3 p-3">{nav}</Card>

      {body}

      <Card className="mt-3 p-3">{nav}</Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <BookTags
          bookId={id}
          tags={(book.tags as string[] | null) ?? []}
          suggested={(book.suggested_tags as string[] | null) ?? []}
          at={at}
          focus={focus}
        />

        <Card className="p-4">
          <details>
            <summary className="cursor-pointer list-none text-sm font-medium select-none">
              Bookmarks ({bookmarks.length})
              {bookmarkHere && (
                <span className="ml-2 text-xs font-normal" style={{ color: "var(--accent)" }}>
                  this {unit.toLowerCase()} is bookmarked
                </span>
              )}
            </summary>
            <div className="mt-3 space-y-3">
              {bookmarkForm}
              {bookmarks.length === 0 ? (
                <p className="text-sm text-[var(--fg-muted)]">
                  None yet. Yours only — a shared shelf, but your own reading,
                  and the same bookmarks on every device you sign in from.
                </p>
              ) : (
                bookmarkList
              )}
            </div>
          </details>
        </Card>

        {(book.description || subjects.length > 0) && (
          <Card className="p-4 lg:col-span-2">
            <h2 className="mb-2 text-sm font-medium">About</h2>
            {typeof book.description === "string" && book.description && (
              <p className="prose-measure mb-3 text-sm text-[var(--fg-muted)]">
                {book.description.slice(0, 700)}
              </p>
            )}
            {subjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {subjects.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--fg-muted)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <form action={deleteBook} className="mt-6">
        <input type="hidden" name="book_id" value={id} />
        <button
          type="submit"
          className="text-xs text-[var(--fg-subtle)] hover:text-[var(--contradicts)]"
        >
          Remove this book from the shelf
        </button>
      </form>
    </Shell>
  );
}
