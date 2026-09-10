import Link from "next/link";
import { ChevronRight, Folder, FolderOpen, Inbox, Library, Plus } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { createFolder, renameFolder, deleteFolder, moveFolder } from "@/app/books/folder-actions";

export type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
};

export type FolderTree = FolderRow & { children: FolderTree[]; count: number };

/**
 * Build the tree, counting each folder's books including everything beneath it.
 *
 * A parent showing only its own direct books reads as empty when all the books
 * are one level down, which is exactly how people file things.
 */
export function buildFolderTree(
  folders: FolderRow[],
  counts: Map<string | null, number>,
): { tree: FolderTree[]; unfiled: number; total: number } {
  const byParent = new Map<string | null, FolderRow[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parent_id) ?? [];
    list.push(folder);
    byParent.set(folder.parent_id, list);
  }

  const build = (parent: string | null): FolderTree[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map((folder) => {
        const children = build(folder.id);
        return {
          ...folder,
          children,
          count:
            (counts.get(folder.id) ?? 0) +
            children.reduce((sum, child) => sum + child.count, 0),
        };
      });

  let total = 0;
  for (const n of counts.values()) total += n;

  return { tree: build(null), unfiled: counts.get(null) ?? 0, total };
}

/** Every folder in the tree as a flat list, for finding one by id. */
export function flattenFolders(nodes: FolderTree[]): FolderTree[] {
  return nodes.flatMap((node) => [node, ...flattenFolders(node.children)]);
}

/**
 * The tree flattened to a path per folder, for places with one line to spend.
 *
 * Only the last two segments: the full path of a folder four deep is longer
 * than a phone is wide, and the segments that identify it are the ones nearest
 * the leaf. "Qualitative / Interviews" says where you are; "Reading / Methods /
 * Qualitative / Interviews" says the same thing and does not fit.
 */
export function folderPaths(
  nodes: FolderTree[],
  prefix: string[] = [],
): { id: string; path: string; count: number }[] {
  return nodes.flatMap((node) => {
    const trail = [...prefix, node.name];
    return [
      { id: node.id, path: trail.slice(-2).join(" / "), count: node.count },
      ...folderPaths(node.children, trail),
    ];
  });
}

/** The tree as flat <option> labels, indented so nesting survives a select. */
export function folderOptions(
  nodes: FolderTree[],
  depth = 0,
): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"  ".repeat(depth)}${node.name}` },
    ...folderOptions(node.children, depth + 1),
  ]);
}

/**
 * The folder sidebar.
 *
 * Collapsing is a URL parameter and each folder's open state is a native
 * <details>, so the whole thing works before any script runs — including the
 * tree, which is the part most likely to be built as a pile of client state.
 * Dragging a book onto a row is layered on top by data attributes the drag
 * component reads; every row also has a form, so a move is possible without a
 * pointer at all.
 */
export function FolderSidebar({
  tree,
  unfiled,
  total,
  current,
  collapsed,
  query,
}: {
  tree: FolderTree[];
  unfiled: number;
  total: number;
  /** The folder being viewed: an id, "unfiled", or null for everything. */
  current: string | null;
  collapsed: boolean;
  /** Whatever else is in the URL, so switching folders keeps a search. */
  query: string;
}) {
  const href = (folder: string | null) => {
    const sp = new URLSearchParams(query);
    sp.delete("folder");
    sp.delete("notice");
    if (folder) sp.set("folder", folder);
    const qs = sp.toString();
    return `/books${qs ? `?${qs}` : ""}`;
  };

  if (collapsed) {
    const sp = new URLSearchParams(query);
    sp.delete("sidebar");
    sp.delete("notice");
    return (
      <aside className="shrink-0">
        <Link
          href={`/books${sp.toString() ? `?${sp}` : ""}`}
          title="Show folders"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-[var(--surface-2)]"
        >
          <ChevronRight size={15} aria-hidden />
          <span className="sr-only">Show folders</span>
        </Link>
      </aside>
    );
  }

  const collapseHref = (() => {
    const sp = new URLSearchParams(query);
    sp.set("sidebar", "closed");
    sp.delete("notice");
    return `/books?${sp}`;
  })();

  return (
    <aside className="w-56 shrink-0">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-[var(--fg-muted)] uppercase">
          Folders
        </h2>
        <Link
          href={collapseHref}
          title="Hide folders"
          className="rounded p-1 text-[var(--fg-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
        >
          <ChevronRight size={14} className="rotate-180" aria-hidden />
          <span className="sr-only">Hide folders</span>
        </Link>
      </div>

      <nav className="space-y-0.5 text-sm">
        <Link
          href={href(null)}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
            current === null
              ? "bg-[var(--surface-2)] font-medium"
              : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          }`}
        >
          <Library size={14} aria-hidden />
          <span className="flex-1">All books</span>
          <span className="text-xs text-[var(--fg-subtle)]">{total}</span>
        </Link>

        {/*
          Unfiled is a real destination and a real drop target. Without it a
          book could go into a folder and never come back out without a form.
        */}
        <Link
          href={href("unfiled")}
          data-drop-folder="unfiled"
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
            current === "unfiled"
              ? "bg-[var(--surface-2)] font-medium"
              : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          }`}
        >
          <Inbox size={14} aria-hidden />
          <span className="flex-1">Unfiled</span>
          <span className="text-xs text-[var(--fg-subtle)]">{unfiled}</span>
        </Link>

        <div className="pt-1">
          {tree.map((folder) => (
            <FolderNode key={folder.id} folder={folder} current={current} href={href} depth={0} />
          ))}
        </div>
      </nav>

    </aside>
  );
}

function FolderNode({
  folder,
  current,
  href,
  depth,
}: {
  folder: FolderTree;
  current: string | null;
  href: (id: string | null) => string;
  depth: number;
}) {
  const active = current === folder.id;
  // Open when it is the folder being viewed, or an ancestor of it. Native
  // <details> so the state survives without any script.
  const containsCurrent = (node: FolderTree): boolean =>
    node.id === current || node.children.some(containsCurrent);
  const open = containsCurrent(folder);

  const row = (
    <div
      data-drop-folder={folder.id}
      className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 ${
        active
          ? "bg-[var(--surface-2)] font-medium"
          : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
      }`}
      style={{ paddingInlineStart: `${8 + depth * 12}px` }}
    >
      {folder.children.length > 0 ? (
        open ? (
          <FolderOpen size={14} aria-hidden />
        ) : (
          <Folder size={14} aria-hidden />
        )
      ) : (
        <Folder size={14} aria-hidden />
      )}
      <Link href={href(folder.id)} className="min-w-0 flex-1 truncate">
        {folder.name}
      </Link>
      <span className="text-xs text-[var(--fg-subtle)]">{folder.count}</span>
    </div>
  );

  if (folder.children.length === 0) return row;

  return (
    <details open={open}>
      <summary className="list-none">{row}</summary>
      <div>
        {folder.children.map((child) => (
          <FolderNode key={child.id} folder={child} current={current} href={href} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

/** Managing the folder being viewed: rename, move, remove. */
export function FolderControls({
  folder,
  folders,
}: {
  folder: FolderTree;
  folders: FolderRow[];
}) {
  // A folder cannot be moved into itself or anything beneath it, and offering
  // the option only to refuse it is worse than not offering it.
  const descendants = new Set<string>();
  const collect = (id: string) => {
    descendants.add(id);
    for (const f of folders) if (f.parent_id === id) collect(f.id);
  };
  collect(folder.id);

  return (
    <details className="mb-4">
      <summary className="cursor-pointer list-none text-xs text-[var(--fg-subtle)] select-none hover:text-[var(--fg)]">
        Manage this folder
      </summary>

      <div className="mt-3 flex flex-wrap items-end gap-4 rounded-[var(--radius)] border p-3">
        <form action={renameFolder} className="flex items-end gap-2">
          <input type="hidden" name="folder_id" value={folder.id} />
          <div>
            <label
              htmlFor="folder-name"
              className="mb-1 block text-xs text-[var(--fg-muted)]"
            >
              Name
            </label>
            <Input
              id="folder-name"
              name="name"
              defaultValue={folder.name}
              required
              className="w-48 text-sm"
            />
          </div>
          <Button type="submit" variant="ghost" className="text-xs">
            Rename
          </Button>
        </form>

        <form action={moveFolder} className="flex items-end gap-2">
          <input type="hidden" name="folder_id" value={folder.id} />
          <div>
            <label htmlFor="folder-parent" className="mb-1 block text-xs text-[var(--fg-muted)]">
              Inside
            </label>
            <select
              id="folder-parent"
              name="parent_id"
              defaultValue={folder.parent_id ?? ""}
              className="min-h-9 rounded-md border bg-[var(--surface)] px-2 text-sm text-[var(--fg)]"
            >
              <option value="">Top level</option>
              {folders
                .filter((f) => !descendants.has(f.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>
          <Button type="submit" variant="ghost" className="text-xs">
            Move
          </Button>
        </form>

        <form action={deleteFolder}>
          <input type="hidden" name="folder_id" value={folder.id} />
          <button
            type="submit"
            className="text-xs text-[var(--fg-subtle)] hover:text-[var(--contradicts)]"
          >
            Delete folder
          </button>
          <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">
            Books inside become unfiled. Nothing is deleted.
          </p>
        </form>
      </div>
    </details>
  );
}

/**
 * Folders on a phone.
 *
 * The sidebar is a column, and a column is the one thing a phone has no room
 * for. The same tree becomes a rail of chips that scrolls sideways under the
 * thumb — the arrangement people already know from photo albums and playlists,
 * and the reason it works here is that a chip is large enough to hit while
 * dragging a book, which a row in a nested tree is not.
 *
 * Nesting survives as a two-segment path rather than indentation. Indentation
 * needs a column to be indented from.
 */
export function FolderRail({
  tree,
  unfiled,
  total,
  current,
  query,
  tags,
  currentTag,
  by,
  addBook,
  addBookOpen = false,
}: {
  tree: FolderTree[];
  unfiled: number;
  total: number;
  current: string | null;
  query: string;
  tags: [string, number][];
  currentTag: string;
  /** Which dimension the shelf is being filtered by. */
  by: "folders" | "tags";
  /**
   * The uploader, passed in rather than built here: it is a client component
   * bound to a Server Action, and the rail has no business knowing either.
   */
  addBook?: React.ReactNode;
  /** Open on an empty shelf, where adding a book is the only thing to do. */
  addBookOpen?: boolean;
}) {
  const href = (folder: string | null) => {
    const sp = new URLSearchParams(query);
    sp.delete("folder");
    sp.delete("notice");
    if (folder) sp.set("folder", folder);
    const qs = sp.toString();
    return `/books${qs ? `?${qs}` : ""}`;
  };

  const chip = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition ${
      active
        ? "border-transparent bg-[var(--accent)] text-[var(--accent-fg)]"
        : "bg-[var(--surface)] text-[var(--fg-muted)]"
    }`;

  const tagHref = (name: string | null) => {
    const sp = new URLSearchParams(query);
    sp.delete("tag");
    sp.delete("notice");
    sp.set("by", "tags");
    if (name) sp.set("tag", name);
    return `/books?${sp}`;
  };

  /** Switching dimension keeps the search but drops the filter being left. */
  const byHref = (next: "folders" | "tags") => {
    const sp = new URLSearchParams(query);
    sp.delete("notice");
    sp.delete(next === "folders" ? "tag" : "folder");
    if (next === "tags") sp.set("by", "tags");
    else sp.delete("by");
    const qs = sp.toString();
    return `/books${qs ? `?${qs}` : ""}`;
  };

  const showTags = by === "tags";

  return (
    // Named, so what the rail is showing can be asserted without inferring it
    // from chips the sidebar also renders.
    <div className="mb-4" data-filter-rail={by}>
      {/*
        Folders and tags answer different questions — where a book is, and what
        it is about — and a shelf that shows both at once is two rows of chips
        above the books. One at a time, and the choice is in the URL.
      */}
      {tags.length > 0 && (
        <div className="mb-2 inline-flex rounded-md border p-0.5 text-xs">
          {(["folders", "tags"] as const).map((option) => (
            <Link
              key={option}
              href={byHref(option)}
              aria-current={by === option ? "true" : undefined}
              className={`rounded px-2.5 py-1 capitalize ${
                by === option
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
              }`}
            >
              {option}
            </Link>
          ))}
        </div>
      )}

      {/*
        A rail wider than the screen, scrolled rather than wrapped. Wrapping
        would push the shelf itself below the fold as soon as a lab has more
        than a few folders, which is precisely when folders start to matter.
      */}
      <div
        // The folder chips are the phone's version of the sidebar, so on a
        // desktop they would be the same tree twice. The tag chips have no
        // sidebar to duplicate and stay at every width.
        className={`flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          showTags ? "" : "lg:hidden"
        }`}
      >
        {showTags ? (
          <>
            <Link href={tagHref(null)} className={`${chip(!currentTag)} snap-start`}>
              <Library size={13} aria-hidden />
              All
              <span className="opacity-60">{total}</span>
            </Link>
            {tags.map(([name, count]) => (
              <Link
                key={name}
                href={tagHref(name === currentTag ? null : name)}
                className={`${chip(name === currentTag)} snap-start`}
              >
                {name}
                <span className="opacity-60">{count}</span>
              </Link>
            ))}
          </>
        ) : (
          <>
            <Link href={href(null)} className={`${chip(current === null)} snap-start`}>
              <Library size={13} aria-hidden />
              All
              <span className="opacity-60">{total}</span>
            </Link>

            <Link
              href={href("unfiled")}
              data-drop-folder="unfiled"
              className={`${chip(current === "unfiled")} snap-start`}
            >
              <Inbox size={13} aria-hidden />
              Unfiled
              <span className="opacity-60">{unfiled}</span>
            </Link>

            {folderPaths(tree).map((f) => (
              <Link
                key={f.id}
                href={href(f.id)}
                data-drop-folder={f.id}
                className={`${chip(current === f.id)} snap-start`}
              >
                <Folder size={13} aria-hidden />
                {f.path}
                <span className="opacity-60">{f.count}</span>
              </Link>
            ))}
          </>
        )}
      </div>

      {/*
        The two things you do to a shelf, side by side and closed by default.
        Adding books used to be a panel above the covers on a phone and a
        column beside them on a desktop; it was permanent furniture for
        something done occasionally, and it cost more room than the shelf.
      */}
      <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-2">
        {!showTags && (
          <details data-autoclose="true">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-[var(--fg-subtle)] select-none hover:text-[var(--fg)]">
              <Plus size={13} aria-hidden />
              New folder
            </summary>
            <form action={createFolder} className="mt-2 flex items-center gap-2">
              {/*
                The folder being viewed is the parent, so a folder made from
                inside "Methods" lands in "Methods". On a phone there is no tree
                to drag it into afterwards, which makes getting this right the
                first time the difference between usable and not.
              */}
              {current && current !== "unfiled" && (
                <input type="hidden" name="parent_id" value={current} />
              )}
              <Input name="name" placeholder="Folder name" required className="text-sm" />
              <Button type="submit" variant="ghost" className="shrink-0 text-xs">
                Create
              </Button>
            </form>
          </details>
        )}

        {addBook && (
          <details className="min-w-0 flex-1" data-autoclose="true" open={addBookOpen}>
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-[var(--fg-subtle)] select-none hover:text-[var(--fg)]">
              <Plus size={13} aria-hidden />
              Add book
            </summary>
            <div className="mt-2 max-w-md">{addBook}</div>
          </details>
        )}
      </div>
    </div>
  );
}
