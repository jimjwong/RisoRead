import { extractPdfText, looksLikePdf } from "@/lib/pdf";
import { parseEpub, readEntry, EpubError } from "@/lib/books/epub";
import { bookPath, coverPath, hashBytes, putBook, removeBook } from "@/lib/storage/books";
import { suggestTags } from "@/lib/ai/tag-book";
import { strFromU8, unzipSync } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Filename as a last-resort title, so a book with no metadata is still filed. */
function titleFromFilename(filename: string): string {
  const base = filename
    .replace(/\.(pdf|epub)$/i, "")
    .replace(/[_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.length > 0 ? base : "Untitled upload";
}

/**
 * Taking one file onto the shelf.
 *
 * Extracted from the form action so the same work backs both ways in: a plain
 * form post, which is what happens with no client JavaScript, and the upload
 * endpoint the browser talks to when it can report progress. Two code paths
 * doing this differently is how one of them quietly stops matching the other.
 */

export type IngestOutcome = {
  filename: string;
  status: "added" | "duplicate" | "failed";
  title?: string;
  bookId?: string;
  detail?: string;
};

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function extensionOf(path: string): string {
  return path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "jpg";
}

/**
 * A thumbnail of the first page.
 *
 * Rendered rather than guessed at: a shelf is recognised by sight, and a grid
 * of identical grey placeholders is a worse shelf than one showing what each
 * book actually looks like when you open it.
 *
 * Deliberately never fatal. A PDF that pdf.js can parse for text can still
 * fail to rasterise — an unusual font, a colour space, a corrupt object — and
 * losing the whole upload over a missing picture would be the wrong trade.
 */
export async function renderFirstPage(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const { renderPageAsImage } = await import("unpdf");
    const png = await renderPageAsImage(bytes.slice(), 1, {
      canvasImport: () => import("@napi-rs/canvas"),
      // Wide enough to stay sharp on a retina shelf tile, small enough that a
      // page of dense text is still tens of kilobytes rather than hundreds.
      width: 600,
    });
    const out = new Uint8Array(png);
    return out.byteLength > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function ingestBook(opts: {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  filename: string;
  bytes: Uint8Array;
}): Promise<IngestOutcome> {
  const { supabase, orgId, userId, filename, bytes } = opts;
  const stored: string[] = [];

  try {
    const sha = hashBytes(bytes);

    // The same file twice is the same book. Checked before any upload, so a
    // re-added book costs nothing.
    const { data: existing } = await supabase
      .from("books")
      .select("id, title")
      .eq("org_id", orgId)
      .eq("sha256", sha)
      .maybeSingle();

    if (existing) {
      return { filename, status: "duplicate", title: existing.title as string };
    }

    const isPdf = looksLikePdf(bytes);
    // An EPUB is a zip; its first two bytes are the zip signature.
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (!isPdf && !isZip) {
      return { filename, status: "failed", detail: "not a PDF or EPUB" };
    }

    let title = titleFromFilename(filename);
    let authors: { name: string }[] = [];
    let publisher: string | null = null;
    let publishedYear: number | null = null;
    let language: string | null = null;
    let isbn: string | null = null;
    let description: string | null = null;
    let subjects: string[] = [];
    let locationCount: number | null = null;
    let storedCover: string | null = null;
    const format: "pdf" | "epub" = isPdf ? "pdf" : "epub";

    let sample = "";

    if (isPdf) {
      // The page count is why this runs; the opening text is a by-product, and
      // it is what the tagger reads.
      const parsed = await extractPdfText(bytes.slice());
      locationCount = parsed.pageCount;
      sample = parsed.text.slice(0, 6000);

      const page = await renderFirstPage(bytes);
      if (page) {
        const path = coverPath({ orgId, sha256: sha, extension: "png" });
        await putBook(path, page, "image/png");
        stored.push(path);
        storedCover = path;
      }
    } else {
      const epub = parseEpub(bytes);
      title = epub.metadata.title?.trim() || title;
      authors = epub.metadata.authors.map((name) => ({ name }));
      publisher = epub.metadata.publisher;
      publishedYear = epub.metadata.publishedYear;
      language = epub.metadata.language;
      isbn = epub.metadata.isbn;
      description = epub.metadata.description;
      subjects = epub.metadata.subjects;
      locationCount = epub.spine.length;

      // The first few spine items, unstyled. A cover and a title page say
      // nothing about a book's subject, so this reaches past them.
      try {
        const files = unzipSync(bytes);
        for (const item of epub.spine.slice(0, 4)) {
          const entry = files[item.href];
          if (!entry) continue;
          sample += strFromU8(entry).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
          if (sample.length > 6000) break;
        }
      } catch {
        // A chapter that will not unzip is not a reason to lose the upload.
      }

      // An EPUB's own cover is its first page, and it is the picture the
      // publisher chose, so it beats anything rendered from the text.
      if (epub.coverHref) {
        const cover = readEntry(bytes, epub.coverHref);
        if (cover && cover.byteLength > 0) {
          const ext = extensionOf(epub.coverHref);
          const path = coverPath({ orgId, sha256: sha, extension: ext });
          await putBook(path, cover, IMAGE_TYPES[ext] ?? "image/jpeg");
          stored.push(path);
          storedCover = path;
        }
      }
    }

    // Tags are proposed, never applied. A failure here — no API key, a
    // refusal, an outage — must not cost the upload, so it is caught and the
    // book lands untagged rather than not at all.
    let suggested: string[] = [];
    try {
      const { data: shelf } = await supabase
        .from("books")
        .select("tags")
        .eq("org_id", orgId)
        .limit(400);

      const existing = [
        ...new Set((shelf ?? []).flatMap((b) => (b.tags as string[] | null) ?? [])),
      ];

      const { suggestion } = await suggestTags({
        title,
        authors: authors.map((a) => a.name),
        description,
        subjects,
        text: sample,
        existingTags: existing,
      });
      suggested = suggestion.tags;
    } catch {
      suggested = [];
    }

    const path = bookPath({ orgId, sha256: sha, extension: format });
    await putBook(path, bytes, isPdf ? "application/pdf" : "application/epub+zip");
    stored.push(path);

    const { data: created, error } = await supabase
      .from("books")
      .insert({
        org_id: orgId,
        title,
        authors,
        format,
        publisher,
        published_year: publishedYear,
        language,
        isbn,
        description,
        subjects,
        storage_path: path,
        cover_path: storedCover,
        sha256: sha,
        size_bytes: bytes.byteLength,
        location_count: locationCount,
        suggested_tags: suggested,
        tags_suggested_at: suggested.length > 0 ? new Date().toISOString() : null,
        added_by: userId,
      })
      .select("id")
      .single();

    if (error) throw error;

    return { filename, status: "added", title, bookId: created.id as string };
  } catch (err) {
    // Nothing half-written: an object without a row is storage nobody can
    // reach and nobody knows to clean up.
    for (const path of stored) await removeBook(path).catch(() => {});

    return {
      filename,
      status: "failed",
      detail:
        err instanceof EpubError
          ? err.message
          : err instanceof Error
            ? err.message.slice(0, 120)
            : "could not be read",
    };
  }
}
