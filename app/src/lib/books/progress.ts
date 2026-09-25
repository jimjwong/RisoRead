import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a reader is in a book, recorded once from every place that can move
 * them: the page-turn write-on-GET, the "go to page" action, and — since the
 * offline reader turns pages without ever hitting the server — a plain HTTP
 * endpoint a client can call directly. One function, so the clamp and the
 * upsert shape can't quietly drift apart between them.
 */
export async function recordProgress(
  supabase: SupabaseClient,
  userId: string,
  bookId: string,
  rawLocation: number,
): Promise<{ at: number; percent: number; finished: boolean } | null> {
  const { data: book } = await supabase
    .from("books")
    .select("org_id, location_count")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) return null;

  const total = (book.location_count as number | null) ?? 0;
  const at = Math.max(0, Math.min(rawLocation, total > 0 ? total - 1 : 0));
  const percent = total > 1 ? Math.round((at / (total - 1)) * 100) : 0;
  const finished = percent >= 100;

  const { error } = await supabase.from("reading_progress").upsert(
    {
      book_id: bookId,
      user_id: userId,
      org_id: book.org_id,
      location: at,
      percent,
      finished_at: finished ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "book_id,user_id" },
  );
  if (error) throw error;

  return { at, percent, finished };
}
