import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getBook } from "@/lib/storage/books";
import { readEntry } from "@/lib/books/epub";

/**
 * Serve one asset from inside an EPUB.
 *
 * A chapter's images live in the archive, which the browser cannot open, so
 * they are handed out one at a time from here.
 *
 * Two checks stand between a request and a file. The book id goes through the
 * ordinary RLS-scoped client, so a reader can only ever name a book their lab
 * holds — the archive path alone is never enough. And the path is only ever
 * used as a key into that book's zip entries, so it cannot address anything
 * outside the archive even if it tries.
 */

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path = new URL(request.url).searchParams.get("path");
  if (!path) return new NextResponse("Not found", { status: 404 });

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

  const entry = readEntry(bytes, path);
  if (!entry) return new NextResponse("Not found", { status: 404 });

  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const type = TYPES[ext];
  // Only image types are served. An EPUB can contain fonts, scripts and
  // arbitrary files, and none of those need to reach a page.
  if (!type) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(Buffer.from(entry), {
    headers: {
      "Content-Type": type,
      // The book is addressed by a content hash upstream, so an asset inside
      // it never changes for a given id.
      "Cache-Control": "private, max-age=86400",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
