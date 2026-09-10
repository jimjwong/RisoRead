"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { parseAuthorLines } from "@/lib/types";
import { removeBook } from "@/lib/storage/books";

import { ingestBook } from "@/lib/books/ingest";
import { MAX_BOOK_BYTES, MAX_BOOK_FILES, MAX_BATCH_BYTES } from "@/lib/books/limits";
import { entitlementFor, assertWithin, assertStorage, assertNotSuspended, LimitReached } from "@/lib/billing/entitlements";
import { PREF_NAMES, validPref, cookieFor } from "@/lib/books/reading-prefs";

async function requireUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

async function defaultOrgId(): Promise<string> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No lab found for this account");
  return data.org_id as string;
}


/**
 * Add books to the shelf, without client JavaScript.
 *
 * The browser posts one file at a time to /books/upload so it can report
 * progress; this is the path taken when that never runs. Both call the same
 * ingest, because two upload paths that drift apart is how one of them quietly
 * stops matching the other.
 */
export async function uploadBooks(formData: FormData): Promise<void> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  const back = (params: string) => redirect(`/books?${params}`);

  if (files.length === 0) back("upload=nofiles");
  if (files.length > MAX_BOOK_FILES) back(`upload=toomany&limit=${MAX_BOOK_FILES}`);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_BATCH_BYTES) back("upload=toobig");

  const { supabase, user } = await requireUser();
  const orgId = await defaultOrgId();

  // The same check the endpoint makes, for the path a browser without
  // JavaScript takes. Both go through entitlementFor rather than one of them
  // keeping its own idea of the limits.
  const entitlement = await entitlementFor(orgId);
  try {
    assertNotSuspended(entitlement);
    assertWithin(entitlement, "books", files.length);
    assertStorage(entitlement, files.reduce((n, f) => n + f.size, 0));
  } catch (err) {
    if (err instanceof LimitReached) back(`upload=limit&detail=${encodeURIComponent(err.message)}`);
    throw err;
  }

  let added = 0;
  let duplicates = 0;
  let failed = 0;

  for (const file of files) {
    if (file.size > MAX_BOOK_BYTES) {
      failed++;
      continue;
    }

    const outcome = await ingestBook({
      supabase,
      orgId,
      userId: user.id,
      filename: file.name || "book",
      bytes: new Uint8Array(await file.arrayBuffer()),
    });

    if (outcome.status === "added") added++;
    else if (outcome.status === "duplicate") duplicates++;
    else failed++;
  }

  revalidatePath("/books");
  back(`upload=done&added=${added}&dupes=${duplicates}&failed=${failed}`);
}

/**
 * How far through a book this reader is. Personal, never shared.
 *
 * Also the jump control, which posts a 1-based number because that is what a
 * page or chapter is called on the page; everything stored is 0-based, and
 * mixing the two is how a reader ends up one page off every time.
 */
export async function saveProgress(formData: FormData): Promise<void> {
  const bookId = String(formData.get("book_id") ?? "");
  const focus = String(formData.get("focus") ?? "") === "1";

  const display = formData.get("location_display");
  const location =
    display !== null && String(display).trim() !== ""
      ? Number(display) - 1
      : Number(formData.get("location") ?? 0);

  const { supabase, user } = await requireUser();

  const { data: book } = await supabase
    .from("books")
    .select("id, org_id, location_count")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) redirect("/books");

  const total = (book.location_count as number | null) ?? 0;
  const at = Math.max(0, Math.min(location, total > 0 ? total - 1 : 0));
  const percent = total > 1 ? Math.round((at / (total - 1)) * 100) : 0;

  await supabase.from("reading_progress").upsert(
    {
      book_id: bookId,
      user_id: user.id,
      org_id: book.org_id,
      location: at,
      percent,
      finished_at: percent >= 100 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "book_id,user_id" },
  );

  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}?at=${at}${focus ? "&focus=1" : ""}`);
}

export async function addBookmark(formData: FormData): Promise<void> {
  const bookId = String(formData.get("book_id") ?? "");
  const location = Number(formData.get("location") ?? 0);
  const focus = String(formData.get("focus") ?? "") === "1";
  const note = String(formData.get("note") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim() || null;

  const { supabase, user } = await requireUser();

  const { data: book } = await supabase
    .from("books")
    .select("id, org_id")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) redirect("/books");

  // Bookmarking the same page twice is a misclick, not two bookmarks. The
  // note is updated instead, so a second attempt refines rather than clutters.
  const { data: existing } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .eq("location", location)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("bookmarks")
      .update({ label, note })
      .eq("id", existing.id);
  } else {
    await supabase.from("bookmarks").insert({
      book_id: bookId,
      user_id: user.id,
      org_id: book.org_id,
      location,
      label,
      note,
    });
  }

  revalidatePath(`/books/${bookId}`);
  redirect(
    `/books/${bookId}?at=${location}&notice=bookmarked${focus ? "&focus=1" : ""}`,
  );
}

export async function removeBookmark(formData: FormData): Promise<void> {
  const bookId = String(formData.get("book_id") ?? "");
  const bookmarkId = String(formData.get("bookmark_id") ?? "");
  const at = String(formData.get("at") ?? "0");
  const focus = String(formData.get("focus") ?? "") === "1";

  const { supabase } = await requireUser();
  await supabase.from("bookmarks").delete().eq("id", bookmarkId);

  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}?at=${at}${focus ? "&focus=1" : ""}`);
}

/**
 * Remove a book from the shelf, and its file with it.
 *
 * The row goes first. An orphaned object costs storage; an orphaned row is a
 * book that appears on the shelf and cannot be opened, which is worse.
 */
export async function deleteBook(formData: FormData): Promise<void> {
  const bookId = String(formData.get("book_id") ?? "");
  const { supabase } = await requireUser();

  const { data: book } = await supabase
    .from("books")
    .select("id, storage_path, cover_path")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) redirect("/books");

  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) throw error;

  await removeBook(book.storage_path as string).catch(() => {});
  if (book.cover_path) await removeBook(book.cover_path as string).catch(() => {});

  revalidatePath("/books");
  redirect("/books?notice=removed");
}

/**
 * Rename a book on the shelf.
 *
 * The title is a label, and the file is addressed by the hash of its own
 * bytes — `{org}/{sha256}.{ext}` — so renaming touches one column and nothing
 * else. The stored object keeps its name, every signed URL keeps working, and
 * a reader mid-chapter is undisturbed. That separation is deliberate: naming a
 * file after its title would mean a rename had to move an object, which is a
 * copy, a delete and a window where the book cannot be opened.
 *
 * Authors are editable here too, since a scanned PDF usually arrives with none
 * and the shelf reads badly without them.
 */
export async function renameBook(formData: FormData): Promise<void> {
  const bookId = String(formData.get("book_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const authorLines = String(formData.get("authors") ?? "");
  // Carried through, so renaming a book does not move the reader off the page
  // they were on — which it would, by falling back to saved progress.
  const at = String(formData.get("at") ?? "");
  const focus = String(formData.get("focus") ?? "") === "1";
  const where = `${at ? `&at=${at}` : ""}${focus ? "&focus=1" : ""}`;

  if (!title) redirect(`/books/${bookId}?notice=notitle${where}`);

  const { supabase } = await requireUser();

  // The same parser the library editor uses, so a name typed here and a name
  // typed there end up in the same shape.
  const authors = parseAuthorLines(authorLines);

  const { error } = await supabase
    .from("books")
    .update({ title, authors, updated_at: new Date().toISOString() })
    .eq("id", bookId);

  if (error) throw error;

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}?notice=renamed${where}`);
}

/**
 * Set a book's tags.
 *
 * Confirming a suggestion and typing a tag land here identically, because once
 * a person has looked at a tag there is no longer any difference between them.
 * Accepting clears the suggestions, so nothing stays pending after it has been
 * decided.
 */
export async function saveTags(formData: FormData): Promise<void> {
  const bookId = String(formData.get("book_id") ?? "");
  const at = String(formData.get("at") ?? "");
  const focus = String(formData.get("focus") ?? "") === "1";
  const where = `${at ? `&at=${at}` : ""}${focus ? "&focus=1" : ""}`;

  const { supabase } = await requireUser();

  // Comma separated, unlike authors: a tag never contains a comma, and typing
  // one is how everyone expects to enter a list of short labels.
  const tags = [
    ...new Set(
      String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim().replace(/\s+/g, " ").toLowerCase())
        .filter((t) => t.length > 1 && t.length <= 40),
    ),
  ].slice(0, 12);

  const { error } = await supabase
    .from("books")
    .update({
      tags,
      // Decided, so no longer pending.
      suggested_tags: [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookId);

  if (error) throw error;

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}?notice=tagged${where}`);
}

/** Take every suggestion as it stands, which is the common case when they are right. */
export async function acceptSuggestedTags(formData: FormData): Promise<void> {
  const bookId = String(formData.get("book_id") ?? "");
  const at = String(formData.get("at") ?? "");
  const focus = String(formData.get("focus") ?? "") === "1";
  const where = `${at ? `&at=${at}` : ""}${focus ? "&focus=1" : ""}`;

  const { supabase } = await requireUser();

  const { data: book } = await supabase
    .from("books")
    .select("tags, suggested_tags")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) redirect("/books");

  const merged = [
    ...new Set([
      ...((book.tags as string[] | null) ?? []),
      ...((book.suggested_tags as string[] | null) ?? []),
    ]),
  ].slice(0, 12);

  await supabase
    .from("books")
    .update({ tags: merged, suggested_tags: [], updated_at: new Date().toISOString() })
    .eq("id", bookId);

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}?notice=tagged${where}`);
}

/** Throw the suggestions away without tagging the book. */
export async function dismissSuggestedTags(formData: FormData): Promise<void> {
  const bookId = String(formData.get("book_id") ?? "");
  const { supabase } = await requireUser();

  await supabase.from("books").update({ suggested_tags: [] }).eq("id", bookId);

  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}?notice=dismissed`);
}

/**
 * Remember how this device likes to read.
 *
 * A cookie set from a form, so the choice survives a reload and works with no
 * client JavaScript — the same rule the rest of the reader follows. The value
 * is clamped here rather than trusted, because a cookie is user input and this
 * one ends up in a style attribute.
 */
export async function setReadingPref(formData: FormData): Promise<void> {
  const returnTo = String(formData.get("return_to") ?? "/books");

  const jar = await cookies();
  const year = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };

  /*
    One loop over the declared preferences rather than a branch per control.
    A new setting is a row in that table and nothing here: the alternative was
    seven near-identical blocks, six of which would stay correct and one of
    which would eventually be added without its validation.

    Values are checked against the allowed set rather than sanitised, because
    these end up in a style attribute and "looks safe" is not the same as "is
    one of these five".
  */
  for (const name of PREF_NAMES) {
    const raw = formData.get(name);
    if (raw === null) continue;
    const value = String(raw);
    if (validPref(name, value)) jar.set(cookieFor(name), value, year);
  }

  const safe = /^\/[A-Za-z0-9\-._~/?=&%+]*$/.test(returnTo) ? returnTo : "/books";
  redirect(safe);
}
