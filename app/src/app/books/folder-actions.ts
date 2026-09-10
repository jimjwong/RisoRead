"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Folders on the shelf.
 *
 * Every one of these is a plain form action, so file management works without
 * client JavaScript. Dragging is layered on top and posts to the same move
 * action — it is a faster way to do something already possible, rather than
 * the only way to do it.
 */

const MAX_DEPTH = 4;

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

// Annotated on the variable, not just the arrow. TypeScript only treats a call
// as terminating — and narrows what follows — when the identifier itself is
// declared to return never.
const back: (params?: string) => never = (params = "") => redirect(`/books${params}`);

/** How far from the top a folder sits, walked rather than trusted to a column. */
async function depthOf(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  folderId: string,
): Promise<number> {
  let depth = 0;
  let current: string | null = folderId;

  while (current && depth < MAX_DEPTH + 2) {
    const result: { data: { parent_id: string | null } | null } = await supabase
      .from("book_folders")
      .select("parent_id")
      .eq("id", current)
      .maybeSingle();
    if (!result.data) break;
    current = result.data.parent_id ?? null;
    depth++;
  }
  return depth;
}

export async function createFolder(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parent_id") ?? "") || null;

  if (!name) back("?notice=noname");

  const { supabase, user } = await requireUser();
  const orgId = await defaultOrgId();

  // A tree deep enough to need scrolling sideways is a tree nobody can use.
  if (parentId) {
    const depth = await depthOf(supabase, parentId);
    if (depth + 1 > MAX_DEPTH) back("?notice=toodeep");
  }

  const { error } = await supabase.from("book_folders").insert({
    org_id: orgId,
    name,
    parent_id: parentId,
    created_by: user.id,
  });

  // A folder that already exists under the same parent is a mistake every
  // time, and saying so beats a constraint name.
  if (error) back(error.code === "23505" ? "?notice=duplicate" : "?notice=failed");

  revalidatePath("/books");
  back("?notice=foldercreated");
}

export async function renameFolder(formData: FormData): Promise<void> {
  const folderId = String(formData.get("folder_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back("?notice=noname");

  const { supabase } = await requireUser();
  const { error } = await supabase.from("book_folders").update({ name }).eq("id", folderId);

  if (error) back(error.code === "23505" ? "?notice=duplicate" : "?notice=failed");

  revalidatePath("/books");
  back(`?folder=${folderId}&notice=folderrenamed`);
}

/**
 * Remove a folder without removing what is in it.
 *
 * Books fall back to unfiled and child folders come up a level, because
 * deleting a container should not destroy its contents. Those are two
 * different intentions and this button only expresses one of them.
 */
export async function deleteFolder(formData: FormData): Promise<void> {
  const folderId = String(formData.get("folder_id") ?? "");
  const { supabase } = await requireUser();

  const { data: folder } = await supabase
    .from("book_folders")
    .select("id, parent_id")
    .eq("id", folderId)
    .maybeSingle();
  if (!folder) back();

  const parentOfDeleted = folder.parent_id as string | null;

  await supabase.from("books").update({ folder_id: null }).eq("folder_id", folderId);
  await supabase
    .from("book_folders")
    .update({ parent_id: parentOfDeleted })
    .eq("parent_id", folderId);

  const { error } = await supabase.from("book_folders").delete().eq("id", folderId);
  if (error) back("?notice=failed");

  revalidatePath("/books");
  back("?notice=folderdeleted");
}

/** Put a book somewhere, or nowhere. A drop posts exactly this. */
export async function moveBook(formData: FormData): Promise<void> {
  const bookId = String(formData.get("book_id") ?? "");
  const folderId = String(formData.get("folder_id") ?? "") || null;
  const returnTo = String(formData.get("return_to") ?? "/books");

  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("books")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq("id", bookId);
  if (error) throw error;

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);

  // An open redirect is one unchecked hidden field away here, so the return
  // path has to look like a path on this site rather than merely be a string.
  const safe = /^\/[A-Za-z0-9\-._~/?=&%+]*$/.test(returnTo) ? returnTo : "/books";
  redirect(`${safe}${safe.includes("?") ? "&" : "?"}notice=moved`);
}

/**
 * Move a folder under another, or back to the top.
 *
 * The cycle check is why this is not a one-line update. Dropping a folder onto
 * its own descendant detaches that whole branch: every row survives, each
 * points at another row inside the loop, and none is reachable from the top —
 * so the folders and their books disappear from the sidebar with nothing to
 * explain where they went.
 */
export async function moveFolder(formData: FormData): Promise<void> {
  const folderId = String(formData.get("folder_id") ?? "");
  const parentId = String(formData.get("parent_id") ?? "") || null;

  if (folderId === parentId) back("?notice=cycle");

  const { supabase } = await requireUser();

  if (parentId) {
    let current: string | null = parentId;
    for (let i = 0; i < MAX_DEPTH + 4 && current; i++) {
      if (current === folderId) back("?notice=cycle");
      const result: { data: { parent_id: string | null } | null } = await supabase
        .from("book_folders")
        .select("parent_id")
        .eq("id", current)
        .maybeSingle();
      current = result.data?.parent_id ?? null;
    }

    const depth = await depthOf(supabase, parentId);
    if (depth + 1 > MAX_DEPTH) back("?notice=toodeep");
  }

  const { error } = await supabase
    .from("book_folders")
    .update({ parent_id: parentId })
    .eq("id", folderId);
  if (error) back("?notice=failed");

  revalidatePath("/books");
  back(`?folder=${folderId}&notice=foldermoved`);
}
