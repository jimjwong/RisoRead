import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Bookmark as BookmarkIcon,
  ChevronDown,
  ChevronUp,
  Columns2,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
} from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { BookHeading } from "@/components/book-heading";
import { BookTags } from "@/components/book-tags";
import { ReaderInteractions } from "@/components/reader-interactions";
import { ReaderBookmarkToggle } from "@/components/reader-bookmark-toggle";
import { EpubAutoScroll } from "@/components/epub-auto-scroll";
import { OfflineRegister } from "@/components/offline-register";
import { SaveOfflineControl } from "@/components/save-offline";
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
import { parseEpub, renderSpineItem, EpubError } from "@/lib/books/epub";
import { readingPrefs, readingVars } from "@/lib/books/reading-prefs";
import { recordProgress } from "@/lib/books/progress";
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

  const [
    { data: book, error },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("books")
      .select(
        "id, title, authors, format, storage_path, cover_path, publisher, published_year, language, isbn, description, subjects, tags, suggested_tags, location_count, size_bytes, folder_id, created_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

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
    if (user) {
      await recordProgress(supabase, user.id, id, at);
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
  const settingsReturnTo = `${returnTo}&settings=1`;

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

  const nav = (
    <div className="flex items-center justify-center">
      <span className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
        {bookmarkHere && (
          <BookmarkIcon
            size={13}
            aria-label="Bookmarked"
            style={{ color: "var(--accent)" }}
          />
        )}
        {/* Its own span, so an offline turn can update the text without
            touching the bookmark icon next to it. */}
        <span data-reader-counter>
          {unit} {at + 1} of {total} · {percent}%
        </span>
      </span>
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
            Full
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
            : `bg-[var(--surface)] ${zoomed ? "overflow-auto" : "overflow-hidden"}`
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
          data-reader-image
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
      chapterHtml = renderSpineItem(epub, bytes, at, `/books/${id}/asset`);
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
        data-reader-surface
        data-page-layout={prefs.layout}
        className={focus ? "px-4 py-6 sm:px-10 sm:py-12" : "p-5 sm:p-10"}
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
          data-reader-article
          className="book-prose"
          style={{ fontSize: "var(--reading-size)" }}
          dangerouslySetInnerHTML={{ __html: chapterHtml }}
        />
      </div>
    );
  }

  const progressBar = (
    <div
      data-reader-progress
      className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
    >
      <div
        data-reader-progress-fill
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

  const spreadStatus = (
    <div className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-[11px] text-[var(--fg-muted)]">
      <Columns2 size={14} aria-hidden />
      <span className="hidden sm:inline">Two-page spread</span>
      {bookmarkHere && (
        <BookmarkIcon size={11} aria-label="Bookmarked" style={{ color: "var(--accent)" }} />
      )}
      <span data-reader-percent>{percent}%</span>
    </div>
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
        className="flex h-[100dvh] flex-col overflow-hidden"
        style={{
          ...(readingVars(prefs) as React.CSSProperties),
          background: "var(--reading-bg, var(--bg))",
          color: "var(--reading-fg, var(--fg))",
        }}
      >
        <ReaderInteractions
          bookId={id}
          userId={user?.id ?? null}
          format={isPdf ? "pdf" : "epub"}
          at={at}
          total={total}
          unit={unit}
          focus={focus}
        />
        {/* Focus mode has no Shell around it, so it registers the offline
            engine itself rather than inheriting it from there. */}
        <OfflineRegister userId={user?.id ?? null} />

        <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2">
          <Link
            href={`/books/${id}?at=${at}`}
            rel="nofollow"
            aria-label="Leave focus"
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
          >
            <Minimize2 size={15} aria-hidden />
          </Link>
          <span className="min-w-0 truncate text-center text-xs font-medium text-[var(--fg-muted)]">
            {book.title}
          </span>
          <div className="flex items-center gap-1">
            <span
              data-reader-header-counter
              className="mr-1 shrink-0 text-[11px] text-[var(--fg-subtle)] tabular-nums"
            >
              {at + 1}/{total}
            </span>
            {!isPdf && (
              <details data-autoclose className="group relative">
                <summary
                  className="inline-flex min-h-8 min-w-8 cursor-pointer list-none items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)] [&::-webkit-details-marker]:hidden"
                  aria-label="Reading settings"
                  title="Reading settings"
                >
                  <SlidersHorizontal size={16} aria-hidden />
                </summary>
                <div className="absolute top-10 right-0 z-40 max-h-[min(70dvh,38rem)] w-[min(28rem,calc(100vw-1.5rem))] overflow-auto rounded-[var(--radius)] border bg-[var(--reading-bg,var(--surface))] p-4 text-left shadow-xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium">Reading settings</h2>
                    <span className="text-[10px] text-[var(--fg-subtle)]">Layout &amp; type</span>
                  </div>
                  <ReaderComfort prefs={prefs} isPdf={false} returnTo={returnTo} compact />
                </div>
              </details>
            )}
            <ReaderBookmarkToggle
              bookId={id}
              initialLocation={at}
              bookmarks={bookmarks.map(({ id: bookmarkId, location }) => ({
                id: bookmarkId,
                location,
              }))}
              focus
            />
          </div>
        </header>

        {/*
          The page, and the two tap strips over it. The strips stop short of the
          middle so a passage can still be selected and a diagram pinched into,
          which is the difference between a reader and a slideshow.
        */}
        <div className="relative min-h-0 flex-1">
          <div
            data-reader-scroll-container
            data-page-layout={!isPdf ? prefs.layout : undefined}
            className="h-full overflow-auto overscroll-contain"
          >
            {body}
          </div>

          {(prevHref || (!isPdf && prefs.layout === "spread")) && (
            <a
              href={prevHref ?? href(at)}
              rel="nofollow"
              data-turn="prev"
              aria-label={`Previous ${unit.toLowerCase()}`}
              className="reader-page-zone reader-page-zone--previous absolute inset-y-0 left-0"
            >
              <span className="reader-page-bar" aria-hidden />
            </a>
          )}
          {(nextHref || (!isPdf && prefs.layout === "spread")) && (
            <a
              href={nextHref ?? href(at)}
              rel="nofollow"
              data-turn="next"
              aria-label={`Next ${unit.toLowerCase()}`}
              className="reader-page-zone reader-page-zone--next absolute inset-y-0 right-0"
            >
              <span className="reader-page-bar" aria-hidden />
            </a>
          )}
        </div>

        {/*
          Bottom bar, padded past the home indicator. Sticky rather than fixed
          so a long chapter scrolls under it without the bar covering the last
          paragraph.
        */}
        <footer
          className="shrink-0 border-t backdrop-blur pb-[env(safe-area-inset-bottom)]"
          style={{ background: "var(--reading-bg, var(--surface))" }}
        >
          {progressBar}

          <div className="flex items-center justify-center px-3 py-2">
            <div className="flex min-w-0 flex-1 justify-center">
              {isPdf ? (
                <div className="text-center text-[11px] text-[var(--fg-subtle)]">
                  {bookmarkHere && (
                    <BookmarkIcon
                      size={11}
                      className="mr-1 inline"
                      aria-label="Bookmarked"
                      style={{ color: "var(--accent)" }}
                    />
                  )}
                  <span data-reader-percent>{percent}%</span>
                </div>
              ) : prefs.layout === "single" ? (
                <EpubAutoScroll bookId={id} percent={percent} bookmarked={Boolean(bookmarkHere)} />
              ) : (
                spreadStatus
              )}
            </div>
          </div>

          <details className="group border-t">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11px] opacity-70 select-none">
              <span>Jump to a {unit.toLowerCase()} or view bookmarks</span>
              <ChevronUp size={14} className="shrink-0 group-open:hidden" aria-hidden />
              <ChevronDown
                size={14}
                className="hidden shrink-0 group-open:block"
                aria-hidden
              />
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
      userId={user?.id ?? null}
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
        <details
          data-autoclose
          open={sp.settings === "1"}
          className="group relative z-20"
        >
          <summary
            className="inline-flex min-h-10 min-w-10 cursor-pointer list-none items-center justify-center gap-0.5 rounded-md border text-[var(--fg-muted)] hover:bg-[var(--surface-2)] [&::-webkit-details-marker]:hidden"
            aria-label="Reading settings"
            title="Reading settings"
          >
            <SlidersHorizontal size={17} aria-hidden />
            <ChevronDown size={11} className="group-open:hidden" aria-hidden />
            <ChevronUp size={11} className="hidden group-open:block" aria-hidden />
            <span className="sr-only">Reading settings</span>
          </summary>
          <div className="absolute left-0 mt-2 max-h-[min(65dvh,36rem)] w-[min(48rem,calc(100vw-2rem))] overflow-auto rounded-[var(--radius)] border bg-[var(--surface)] p-4 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal size={15} aria-hidden />
              <h2 className="text-sm font-medium">Reading settings</h2>
            </div>
            <ReaderComfort
              prefs={prefs}
              isPdf={isPdf}
              returnTo={settingsReturnTo}
              compact
            />
          </div>
        </details>
        <div className="flex flex-wrap items-start gap-3">
          {folderOptions.length > 0 && (
            <MoveBookControl
              action={moveBook}
              bookId={id}
              returnTo={returnTo}
              current={(book.folder_id as string | null) ?? null}
              folders={folderOptions}
            />
          )}
          <SaveOfflineControl
            bookId={id}
            userId={user?.id ?? null}
            format={isPdf ? "pdf" : "epub"}
            title={book.title as string}
            totalUnits={total}
          />
        </div>
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

      <ReaderInteractions
        bookId={id}
        userId={user?.id ?? null}
        format={isPdf ? "pdf" : "epub"}
        at={at}
        total={total}
        unit={unit}
        focus={focus}
      />
      <Card className="mb-3 p-3">{nav}</Card>

      <div className="overflow-hidden rounded-[var(--radius)] border bg-[var(--surface)]">
        <div className="relative">
          <div
            data-reader-scroll-container
            data-page-layout={!isPdf ? prefs.layout : undefined}
            className="h-[clamp(20rem,70dvh,48rem)] overflow-auto overscroll-contain"
          >
            {body}
          </div>

          {(prevHref || (!isPdf && prefs.layout === "spread")) && (
            <a
              href={prevHref ?? href(at)}
              rel="nofollow"
              data-turn="prev"
              aria-label={`Previous ${unit.toLowerCase()}`}
              className="reader-page-zone reader-page-zone--previous absolute inset-y-0 left-0"
            >
              <span className="reader-page-bar" aria-hidden />
            </a>
          )}
          {(nextHref || (!isPdf && prefs.layout === "spread")) && (
            <a
              href={nextHref ?? href(at)}
              rel="nofollow"
              data-turn="next"
              aria-label={`Next ${unit.toLowerCase()}`}
              className="reader-page-zone reader-page-zone--next absolute inset-y-0 right-0"
            >
              <span className="reader-page-bar" aria-hidden />
            </a>
          )}
        </div>

        <div className="border-t">
          {progressBar}
          <div className="p-3">
            {isPdf ? (
              nav
            ) : (
              <div className="flex items-center justify-center">
                <div className="flex min-w-0 flex-1 justify-center">
                  {prefs.layout === "single" ? (
                    <EpubAutoScroll
                      bookId={id}
                      percent={percent}
                      bookmarked={Boolean(bookmarkHere)}
                    />
                  ) : (
                    spreadStatus
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
