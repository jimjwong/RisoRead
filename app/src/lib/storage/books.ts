import { createHash } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isR2Configured, r2Put, r2Get, r2Delete, r2SignedUrl } from "@/lib/storage/r2";

export const BOOKS_BUCKET = "books";

/**
 * Where a book file lives, without the caller knowing where that is.
 *
 * Two backends, chosen by environment rather than by code path: Cloudflare R2
 * when it is configured, Supabase Storage otherwise. Every call site below is
 * identical for both, and the database stores only a path, so moving a lab's
 * shelf to R2 is copying a bucket and setting four variables.
 *
 * Keeping the fallback is not hedging. It means the feature works end to end
 * on a laptop with no cloud account, which is also the only way any of this
 * gets tested without one.
 */

export function bookPath(opts: {
  orgId: string;
  sha256: string;
  extension: string;
}): string {
  const ext = opts.extension.replace(/^\./, "").toLowerCase();
  // Org first, because both backends key access on that prefix. Hash as the
  // name, so the same file uploaded twice is one object.
  return `${opts.orgId}/${opts.sha256}.${ext}`;
}

export function coverPath(opts: { orgId: string; sha256: string; extension: string }): string {
  const ext = opts.extension.replace(/^\./, "").toLowerCase();
  return `${opts.orgId}/covers/${opts.sha256}.${ext}`;
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Which backend is actually in use, for the settings page to state plainly. */
export function storageBackend(): "r2" | "supabase" {
  return isR2Configured() ? "r2" : "supabase";
}

export async function putBook(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  if (isR2Configured()) {
    await r2Put(path, bytes, contentType);
    return;
  }

  const supabase = await getSupabaseServerClient();
  // Wrapped in a Blob deliberately: the Supabase client accepts a raw
  // Uint8Array without complaint and stores a zero-byte object, which is
  // silent data loss that looks entirely successful.
  const blob = new Blob([bytes as unknown as BlobPart], { type: contentType });

  const { error } = await supabase.storage.from(BOOKS_BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
}

export async function getBook(path: string): Promise<Uint8Array | null> {
  if (isR2Configured()) return r2Get(path);

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.storage.from(BOOKS_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeBook(path: string): Promise<void> {
  if (isR2Configured()) {
    await r2Delete(path);
    return;
  }
  const supabase = await getSupabaseServerClient();
  await supabase.storage.from(BOOKS_BUCKET).remove([path]);
}

/**
 * A URL the browser can fetch directly, valid for an hour.
 *
 * Used for PDFs, which the browser's own viewer renders far better than
 * anything worth building, and for cover images. EPUB text never goes through
 * here: it is unzipped and rendered server-side, so the file itself is never
 * exposed to the page.
 */
export async function bookUrl(path: string, seconds = 3600): Promise<string | null> {
  if (isR2Configured()) {
    try {
      return await r2SignedUrl(path, seconds);
    } catch {
      return null;
    }
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(BOOKS_BUCKET)
    .createSignedUrl(path, seconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
