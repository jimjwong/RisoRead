import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getBook } from "@/lib/storage/books";
import { parseEpub, renderSpineItem } from "@/lib/books/epub";

/**
 * One EPUB chapter, as content only.
 *
 * Everything else that touches this book's spine goes through the reading
 * page, which also records where the reader is as a side effect of the same
 * request. This route exists for callers that must never do that — a future
 * offline download warming a cache should not look like a reader turning
 * pages. So it takes a spine index rather than a reading position, and it
 * carries no personalization: no progress, no bookmarks, no reading prefs.
 *
 * Cached the same way a PDF page already is: private, because it is still
 * scoped to one lab, and immutable, because a book is addressed by the hash
 * of its own bytes and never changes under a given id.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const raw = new URL(request.url).searchParams.get("spine") ?? "0";
  const spine = Number(raw);
  if (!Number.isInteger(spine) || spine < 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  // RLS decides whether this book is theirs to open at all.
  const { data: book } = await supabase
    .from("books")
    .select("storage_path, format")
    .eq("id", id)
    .maybeSingle();

  if (!book || book.format !== "epub") {
    return new NextResponse("Not found", { status: 404 });
  }

  const bytes = await getBook(book.storage_path as string);
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  try {
    const epub = parseEpub(bytes);
    // Out of range is refused rather than clamped: a caller looping 0..total-1
    // off this same response should see its own bug, not a silently repeated
    // last chapter.
    if (spine >= epub.spine.length) {
      return new NextResponse("Not found", { status: 404 });
    }

    const html = renderSpineItem(epub, bytes, spine, `/books/${id}/asset`);

    return NextResponse.json(
      {
        html,
        index: spine,
        total: epub.spine.length,
        label: epub.spine[spine].label,
      },
      { headers: { "Cache-Control": "private, max-age=31536000, immutable" } },
    );
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
