import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getBook, putBook } from "@/lib/storage/books";

/**
 * One page of a PDF, as an image.
 *
 * The browser's own PDF viewer was doing this job until it turned out not to
 * on the device that matters most here: Safari on iOS renders only the first
 * page of a PDF in an iframe and will not scroll it. No fragment, no CSS and
 * no embed element changes that — it is how iOS treats an embedded PDF. So a
 * reader on a phone was permanently stuck on page one.
 *
 * Rendering server-side removes the browser from the argument entirely. Every
 * device gets the same page, the same way, and it scales to the column it is
 * put in rather than to whatever the viewer decides. The cost is losing text
 * selection and the viewer's own controls, which is why the original file is
 * still one link away.
 *
 * Pages are cached in object storage after the first render. A page takes the
 * better part of a second to rasterise, and a reader turning pages should pay
 * that once per page, not once per visit.
 *
 * Served as JPEG rather than the PNG the renderer produces. A page of dense
 * text came to 430 KB as PNG and 35 KB as JPEG — twelve times smaller for no
 * visible difference on a photograph of a page.
 *
 * Rendered at whichever width the browser asks for rather than one size for
 * everyone, but the smallest option is deliberately larger than any screen
 * needs to display a page at 1:1.
 *
 * That is the correction to a wrong assumption. The first version offered a
 * 1200px render and told the browser the slot was one viewport wide, so a
 * phone dutifully chose 1200 — exactly enough pixels to fill the screen and
 * none to spare. Reading a page of a book on a phone means pinching in, and at
 * that point there is nothing left to magnify. Sizing an image to its display
 * box is right for a photograph in an article and wrong for a page someone
 * intends to zoom into.
 *
 * So the floor is 2400, and the hint deliberately over-states the slot so the
 * browser reaches for headroom rather than sufficiency.
 *
 * The list is an allowlist rather than a free parameter. An open width would
 * let anyone fill object storage with arbitrary renders of the same page.
 */

const WIDTHS = [2400, 3000, 4000] as const;
const DEFAULT_WIDTH = 3000;
const QUALITY = 0.9;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const requested = Number(query.get("p") ?? "1");
  if (!Number.isFinite(requested) || requested < 1) {
    return new NextResponse("Not found", { status: 404 });
  }

  const askedWidth = Number(query.get("w") ?? DEFAULT_WIDTH);
  const width = (WIDTHS as readonly number[]).includes(askedWidth)
    ? askedWidth
    : DEFAULT_WIDTH;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  // RLS decides whether this book is theirs to open; the page number alone is
  // never enough to reach a file.
  const { data: book } = await supabase
    .from("books")
    .select("org_id, storage_path, sha256, format, location_count")
    .eq("id", id)
    .maybeSingle();

  if (!book || book.format !== "pdf") {
    return new NextResponse("Not found", { status: 404 });
  }

  const total = (book.location_count as number | null) ?? 1;
  const page = Math.min(requested, Math.max(1, total));

  const cachePath = `${book.org_id}/pages/${book.sha256}/${page}-${width}.jpg`;

  const served = (bytes: Uint8Array) =>
    new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        // The path contains the file's content hash and the page number, so
        // this image can never change for this URL.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });

  const cached = await getBook(cachePath);
  if (cached && cached.byteLength > 0) return served(cached);

  const file = await getBook(book.storage_path as string);
  if (!file) return new NextResponse("Not found", { status: 404 });

  try {
    const { renderPageAsImage } = await import("unpdf");
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");

    const png = Buffer.from(
      await renderPageAsImage(file.slice(), page, {
        canvasImport: () => import("@napi-rs/canvas"),
        width,
      }),
    );
    if (png.byteLength === 0) return new NextResponse("Not found", { status: 404 });

    // Re-encoded rather than served as rendered. The renderer only emits PNG,
    // which is the wrong format for what is effectively a photograph of a page.
    const image = await loadImage(png);
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext("2d").drawImage(image, 0, 0);
    const jpeg = new Uint8Array(canvas.toBuffer("image/jpeg", QUALITY));

    // Stored after it renders, and a storage failure is not a reason to fail
    // the read: the page exists, the reader should see it.
    await putBook(cachePath, jpeg, "image/jpeg").catch(() => {});
    return served(jpeg);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
