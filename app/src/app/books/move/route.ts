import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Move one book into a folder.
 *
 * A route rather than the Server Action, because a drop happens without a form
 * submission and the page must not navigate — the book should slide into the
 * folder while the shelf stays where it is. The action still exists and does
 * the same thing for the no-JavaScript path.
 *
 * RLS decides whether the book and the folder are the caller's; naming an id
 * is never enough on its own.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await request.formData();
  const bookId = String(form.get("book_id") ?? "");
  const folderId = String(form.get("folder_id") ?? "") || null;

  if (!bookId) return NextResponse.json({ error: "No book" }, { status: 400 });

  // The folder is checked separately rather than left to the foreign key: a
  // constraint violation would be a 500, and "that folder is not yours" is a
  // different answer from "something went wrong".
  if (folderId) {
    const { data: folder } = await supabase
      .from("book_folders")
      .select("id")
      .eq("id", folderId)
      .maybeSingle();
    if (!folder) return NextResponse.json({ error: "No such folder" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("books")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq("id", bookId)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // Zero rows means RLS refused it, which is a miss rather than a fault.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "No such book" }, { status: 404 });
  }

  return NextResponse.json({ moved: bookId, folder: folderId });
}
