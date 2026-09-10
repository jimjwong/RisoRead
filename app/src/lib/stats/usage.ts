import { getSupabaseServerClient } from "@/lib/supabase/server";
import { entitlementFor } from "@/lib/billing/entitlements";
import type { Entitlement } from "@/lib/billing/limits";

/**
 * What this account has actually been reading.
 *
 * Two different subjects, kept apart on purpose. A lab shares its shelf, so
 * those numbers describe the lab. Reading position and bookmarks are per
 * person and are nobody else's business, so those describe you. Merging them
 * would produce a page that says "you have 340 books" to somebody who added
 * four of them.
 *
 * Every query runs through the caller's own session, so row-level security
 * scopes all of it without this file having to remember to. The same rows back
 * RisoDesk's own usage page — one shelf, counted once, however you reached it.
 */

export type Usage = {
  lab: {
    name: string;
    since: string | null;
    members: number;
    books: number;
    folders: number;
    /** Books nobody has opened yet, which is the number worth acting on. */
    untouched: number;
  };
  you: {
    booksStarted: number;
    booksFinished: number;
    bookmarks: number;
    reading: { id: string; title: string; percent: number }[];
  };
  storage: {
    books: number;
    limit: number;
  };
  entitlement: Entitlement;
};

export async function usageFor(orgId: string, userId: string): Promise<Usage> {
  const supabase = await getSupabaseServerClient();

  const count = (table: string) =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);

  const [org, members, books, folders, sizes, progress, bookmarks, entitlement] =
    await Promise.all([
      supabase.from("orgs").select("name, created_at").eq("id", orgId).maybeSingle(),
      count("memberships"),
      count("books"),
      count("book_folders"),
      supabase.from("books").select("size_bytes").eq("org_id", orgId),
      // Per person: this is the one table that knows where somebody got to.
      supabase
        .from("reading_progress")
        .select("book_id, percent, books(title)")
        .eq("user_id", userId),
      supabase.from("bookmarks").select("id", { count: "exact", head: true }).eq("user_id", userId),
      entitlementFor(orgId),
    ]);

  const bookBytes = (sizes.data ?? []).reduce(
    (sum: number, b: { size_bytes: number | null }) => sum + (b.size_bytes ?? 0),
    0,
  );

  const reads = (progress.data ?? []) as unknown as {
    book_id: string;
    percent: number | null;
    books: { title: string } | { title: string }[] | null;
  }[];

  // PostgREST returns the embedded relation as an array or a single object
  // depending on how it infers the relationship — handle both shapes.
  const titleOf = (row: (typeof reads)[number]) => {
    const b = row.books;
    if (!b) return "A book";
    return Array.isArray(b) ? (b[0]?.title ?? "A book") : b.title;
  };

  const opened = reads.filter((r) => (r.percent ?? 0) > 0).length;

  return {
    lab: {
      name: (org.data?.name as string) ?? "Your shelf",
      since: (org.data?.created_at as string) ?? null,
      members: members.count ?? 0,
      books: books.count ?? 0,
      folders: folders.count ?? 0,
      untouched: Math.max(0, (books.count ?? 0) - opened),
    },
    you: {
      booksStarted: opened,
      booksFinished: reads.filter((r) => (r.percent ?? 0) >= 100).length,
      bookmarks: bookmarks.count ?? 0,
      reading: reads
        .filter((r) => (r.percent ?? 0) > 0 && (r.percent ?? 0) < 100)
        .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
        .slice(0, 5)
        .map((r) => ({ id: r.book_id, title: titleOf(r), percent: r.percent ?? 0 })),
    },
    storage: {
      books: bookBytes,
      limit: entitlement.limits.storageBytes,
    },
    entitlement,
  };
}
