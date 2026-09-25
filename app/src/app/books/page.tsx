import Link from "next/link";
import { ChevronDown, Folder as FolderIcon } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getMyOrgs } from "@/lib/data";
import { Button, Card, EmptyState, Shell } from "@/components/ui";
import { bookUrl, storageBackend } from "@/lib/storage/books";
import { uploadBooks } from "./actions";
import { BookUploader } from "@/components/book-uploader";
import { BookDragDrop } from "@/components/book-dnd";
import {
  FolderSidebar,
  FolderRail,
  FolderControls,
  buildFolderTree,
  flattenFolders,
  folderOptions as buildFolderOptions,
  type FolderRow,
} from "@/components/folder-sidebar";
import { moveBook } from "./folder-actions";
import { MoveBookControl } from "@/components/move-book";

export const dynamic = "force-dynamic";

type BookRow = {
  id: string;
  title: string;
  authors: { name: string }[];
  format: "pdf" | "epub";
  cover_path: string | null;
  published_year: number | null;
  publisher: string | null;
  location_count: number | null;
  size_bytes: number;
  folder_id: string | null;
  tags: string[] | null;
  suggested_tags: string[] | null;
  reading_progress: { percent: number; location: number }[] | null;
};

/** How many part-read books sit above the shelf before the rest fold away. */
const CONTINUE_SHOWN = 4;

const NOTICES: Record<string, string> = {
  removed: "Removed from the shelf.",
  nofiles: "Choose a PDF or EPUB first.",
  toobig: "That batch is too large.",
  limit: "That would go past what this plan holds.",
  foldercreated: "Folder created.",
  folderrenamed: "Folder renamed.",
  folderdeleted: "Folder deleted. The books inside are now unfiled.",
  foldermoved: "Folder moved.",
  moved: "Moved.",
  noname: "A folder needs a name.",
  duplicate: "There is already a folder with that name here.",
  toodeep: "Folders only nest four levels deep.",
  cycle: "A folder cannot go inside itself.",
  failed: "That did not work. Nothing was changed.",
};

/**
 * The shelf.
 *
 * Deliberately a grid of covers rather than a list of rows. A shelf is
 * recognised by sight, and that is the one place in this app where an image
 * earns its weight; everything else here stays a list.
 */
export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const tag = (params.tag ?? "").trim();
  const folder = (params.folder ?? "").trim() || null;
  const sidebarCollapsed = params.sidebar === "closed";
  // Filtering by tag is a different question from filtering by folder, so the
  // shelf shows one set of chips at a time. A tag in the URL implies the
  // answer even if the toggle was never touched — a shared link should land on
  // the view it describes.
  const filterBy: "folders" | "tags" =
    params.by === "tags" || (params.tag ?? "").trim() ? "tags" : "folders";

  const supabase = await getSupabaseServerClient();
  const [orgs, { data: { user } }] = await Promise.all([
    getMyOrgs(),
    supabase.auth.getUser(),
  ]);

  let query = supabase
    .from("books")
    .select(
      "id, title, authors, format, cover_path, published_year, publisher, location_count, size_bytes, folder_id, tags, suggested_tags, reading_progress(percent, location)",
    )
    .order("created_at", { ascending: false });

  if (q) query = query.ilike("title", `%${q}%`);
  // Postgres array containment, so a book matches when the tag is among its own.
  if (tag) query = query.contains("tags", [tag]);
  // "unfiled" is a place rather than the absence of a filter, so it asks for
  // rows with no folder rather than skipping the clause.
  if (folder === "unfiled") query = query.is("folder_id", null);
  else if (folder) query = query.eq("folder_id", folder);

  const { data, error } = await query;
  if (error) throw error;

  const books = (data ?? []) as unknown as BookRow[];

  // Covers are signed one by one. They are small and cached, and this is the
  // only page that needs them.
  const covers = new Map<string, string>();
  await Promise.all(
    books.map(async (b) => {
      if (!b.cover_path) return;
      const url = await bookUrl(b.cover_path, 3600);
      if (url) covers.set(b.id, url);
    }),
  );

  // Counted across the whole shelf rather than the current filter, so the
  // cloud does not collapse to one tag the moment you use it.
  const { data: everything } = await supabase.from("books").select("tags");
  const tally = new Map<string, number>();
  for (const row of everything ?? []) {
    for (const name of ((row.tags as string[] | null) ?? [])) {
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
  }
  const allTags = [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30);

  // Counts come from the whole shelf, not the filtered view: a sidebar whose
  // numbers changed as you clicked around it would be useless for navigating.
  const [{ data: folderRows }, { data: placement }] = await Promise.all([
    supabase.from("book_folders").select("id, name, parent_id, position"),
    supabase.from("books").select("folder_id"),
  ]);

  const counts = new Map<string | null, number>();
  for (const row of placement ?? []) {
    const key = (row.folder_id as string | null) ?? null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const folders = (folderRows ?? []) as FolderRow[];
  const { tree, unfiled, total } = buildFolderTree(folders, counts);
  const currentFolder = folder ? flattenFolders(tree).find((f) => f.id === folder) : undefined;
  const folderOptions = buildFolderOptions(tree);
  const folderNames = new Map(folders.map((f) => [f.id, f.name]));
  // `query` is already the Supabase builder in this scope; this is the URL.
  const viewQuery = new URLSearchParams(
    Object.entries(params).filter(([, v]) => typeof v === "string") as [string, string][],
  ).toString();

  // Filing a book should leave you looking at what you were looking at, so the
  // move carries the current view back with it.
  const returnTo = (() => {
    const sp = new URLSearchParams(
      Object.entries(params).filter(([, v]) => typeof v === "string") as [string, string][],
    );
    sp.delete("notice");
    return `/books${sp.toString() ? `?${sp}` : ""}`;
  })();

  const added = Number(params.added) || 0;
  const dupes = Number(params.dupes) || 0;
  const failed = Number(params.failed) || 0;

  const reading = books.filter((b) => {
    const p = b.reading_progress?.[0]?.percent ?? 0;
    return p > 0 && p < 100;
  });

  return (
    <Shell breadcrumb={orgs[0]?.name ?? "Your shelf"} userId={user?.id ?? null}>
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Your shelf</h1>
        <p className="mt-1 max-w-prose text-sm text-[var(--fg-muted)]">
          PDFs and EPUBs, in folders, kept where you left off — on this device
          and on every other one you sign in from.
        </p>
      </div>

      {params.upload === "done" && (
        <Card className="mb-4 p-3">
          <p role="status" className="text-sm">
            {added > 0 ? (
              <span style={{ color: "var(--supports)" }}>
                {added} book{added === 1 ? "" : "s"} added.
              </span>
            ) : (
              <span className="text-[var(--fg-muted)]">Nothing new was added.</span>
            )}
            {dupes > 0 && (
              <span className="text-[var(--fg-muted)]"> {dupes} already on the shelf.</span>
            )}
            {failed > 0 && (
              <span style={{ color: "var(--contradicts)" }}> {failed} could not be read.</span>
            )}
          </p>
        </Card>
      )}

      {params.upload === "limit" && (
        <Card className="mb-4 p-3">
          <p role="status" className="text-sm">
            <span style={{ color: "var(--contradicts)" }}>
              {params.detail ?? NOTICES.limit}
            </span>{" "}
            <Link href="/settings?tab=usage" className="text-[var(--accent)] hover:underline">
              See what is left
            </Link>
          </p>
        </Card>
      )}

      {params.notice && NOTICES[params.notice] && (
        <Card className="mb-4 p-3">
          <p role="status" className="text-sm text-[var(--fg-muted)]">
            {NOTICES[params.notice]}
          </p>
        </Card>
      )}

      <BookDragDrop />

      {/*
        Three fixed columns on a phone is 560px of layout in a 390px window, so
        the whole shelf scrolled sideways. Below lg there is one column and the
        panels reorder around it: the sidebar becomes the rail inside the shelf,
        and "Add books" comes first because adding is what a phone is for here.
      */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="hidden lg:block">
          <FolderSidebar
            tree={tree}
            unfiled={unfiled}
            total={total}
            current={folder}
            collapsed={sidebarCollapsed}
            query={viewQuery}
          />
        </div>

        <div className="min-w-0 lg:flex-1">
          <FolderRail
            tree={tree}
            unfiled={unfiled}
            total={total}
            current={folder}
            query={viewQuery}
            tags={allTags}
            currentTag={tag}
            by={filterBy}
            addBookOpen={books.length === 0 && !q && !tag && !folder}
            addBook={
              /*
                The uploader takes over when it hydrates and shows real per-file
                progress; without it this is a plain form posting to the Server
                Action, and the button below submits either way.
              */
              <BookUploader action={uploadBooks}>
                <noscript>
                  <p className="mb-2 text-xs text-[var(--fg-subtle)]">
                    Without JavaScript the whole batch goes in one request, and
                    the page waits until it is finished.
                  </p>
                </noscript>
                <Button type="submit" className="w-full">
                  Add to shelf
                </Button>
                <p className="text-xs text-[var(--fg-subtle)]">
                  PDF or EPUB, up to 100 MB each. Stored on{" "}
                  {storageBackend() === "r2" ? "Cloudflare R2" : "local storage"}.
                </p>
              </BookUploader>
            }
          />
          {currentFolder && <FolderControls folder={currentFolder} folders={folders} />}
          <form method="get" className="mb-5">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search the shelf…"
              aria-label="Search books"
              className="w-full max-w-md rounded-md border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)]"
            />
          </form>

          {reading.length > 0 && !q && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-medium">Continue reading</h2>
              {/*
                Four, and the rest behind a disclosure. A shelf in active use
                has a dozen books part-read, and a dozen covers above the shelf
                is a second shelf in front of the one being looked for. Four is
                what fits a phone without scrolling and a desktop in one row.
              */}
              <div className="flex flex-wrap gap-3">
                {reading.slice(0, CONTINUE_SHOWN).map((b) => (
                  <ReadingTile key={b.id} book={b} url={covers.get(b.id)} />
                ))}
              </div>

              {reading.length > CONTINUE_SHOWN && (
                <details className="mt-3">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-[var(--fg-subtle)] select-none hover:text-[var(--fg)]">
                    <ChevronDown size={13} aria-hidden />
                    {reading.length - CONTINUE_SHOWN} more part-read
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {reading.slice(CONTINUE_SHOWN).map((b) => (
                      <ReadingTile key={b.id} book={b} url={covers.get(b.id)} />
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          {books.length === 0 ? (
            <EmptyState
              title={q ? `Nothing matches ${q}` : "The shelf is empty"}
              body={
                q
                  ? "Try a different title, or clear the search."
                  : "Upload a PDF or an EPUB. An EPUB brings its own title, authors and cover with it."
              }
            />
          ) : (
            <>
              <h2 className="mb-3 text-sm font-medium">
                {q ? `${books.length} found` : `All ${books.length}`}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {books.map((b) => (
                  /*
                    The tile carries the id rather than the link inside it: the
                    drag listener reads it off whatever the pointer grabbed.
                    Deliberately not `draggable` — that starts the browser's own
                    drag, which suspends pointer events and would leave the
                    pointer-based drag with no moves to follow.
                  */
                  <div key={b.id} data-book-id={b.id} data-book-title={b.title}>
                    <Link href={`/books/${b.id}`} className="group block">
                      <Cover book={b} url={covers.get(b.id)} />
                      <p className="mt-1.5 line-clamp-2 text-xs font-medium group-hover:text-[var(--accent)]">
                        {b.title}
                      </p>
                      <p className="truncate text-[11px] text-[var(--fg-subtle)]">
                        {b.authors?.[0]?.name ?? "Unknown"}
                        {b.published_year ? ` · ${b.published_year}` : ""}
                      </p>
                      {(b.tags?.length ?? 0) > 0 ? (
                        <p className="mt-1 truncate text-[11px] text-[var(--fg-muted)]">
                          {b.tags!.slice(0, 3).join(" · ")}
                        </p>
                      ) : (b.suggested_tags?.length ?? 0) > 0 ? (
                        // A book with suggestions waiting is worth pointing at:
                        // untagged books are invisible to the filter.
                        <p className="mt-1 truncate text-[11px]" style={{ color: "var(--accent)" }}>
                          {b.suggested_tags!.length} suggested tags
                        </p>
                      ) : null}
                    </Link>

                    {/*
                      Dragging is the fast path, not the only one. This is the
                      same action the drop posts to, so filing works on a phone,
                      by keyboard, and with scripting off.
                    */}
                    {/*
                      A select and a button under all forty covers is a form
                      the shelf has to be read around. Closed, this is one line
                      saying where the book is; it becomes a control only when
                      someone wants to move something.
                    */}
                    {folderOptions.length > 0 && (
                      <details className="mt-0.5">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] text-[var(--fg-subtle)] select-none hover:text-[var(--fg)]">
                          <FolderIcon size={11} aria-hidden />
                          {folderNames.get(b.folder_id ?? "") ?? "Unfiled"}
                        </summary>
                        <MoveBookControl
                          action={moveBook}
                          bookId={b.id}
                          returnTo={returnTo}
                          current={b.folder_id}
                          folders={folderOptions}
                          className="mt-1"
                        />
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </Shell>
  );
}

/** A part-read book: cover, title, and how far in. */
function ReadingTile({ book, url }: { book: BookRow; url?: string }) {
  const percent = book.reading_progress?.[0]?.percent ?? 0;
  return (
    <Link
      href={`/books/${book.id}?at=${book.reading_progress?.[0]?.location ?? 0}`}
      rel="nofollow"
      className="w-32 shrink-0 sm:w-40"
    >
      <Cover book={book} url={url} />
      <p className="mt-1.5 truncate text-xs font-medium">{book.title}</p>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, background: "var(--accent)" }}
        />
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">{percent}%</p>
    </Link>
  );
}

/** A cover, or something legible when a book has none. */
function Cover({ book, url }: { book: BookRow; url?: string }) {
  if (url) {
    return (
      // Not next/image: these are signed URLs on a bucket the optimiser cannot
      // reach, and they expire.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="aspect-[2/3] w-full rounded-md border object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex aspect-[2/3] w-full flex-col justify-between rounded-md border bg-[var(--surface-2)] p-3">
      <span className="text-[10px] tracking-wide text-[var(--fg-subtle)] uppercase">
        {book.format}
      </span>
      <span className="line-clamp-4 text-xs leading-snug font-medium text-[var(--fg-muted)]">
        {book.title}
      </span>
    </div>
  );
}
