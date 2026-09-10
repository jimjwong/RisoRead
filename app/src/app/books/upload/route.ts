import { NextResponse } from "next/server";
import {
  entitlementFor,
  assertWithin,
  assertStorage,
  assertNotSuspended,
  LimitReached,
} from "@/lib/billing/entitlements";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ingestBook } from "@/lib/books/ingest";
import { MAX_BOOK_BYTES } from "@/lib/books/limits";

/**
 * One file per request, so the browser can report progress on it.
 *
 * A Server Action cannot report upload progress: the browser exposes byte
 * counts only through XMLHttpRequest, and only against a plain endpoint. So
 * the form still posts to the action when JavaScript is not running, and this
 * exists for when it is — both calling the same ingest, because two upload
 * paths that drift apart is how one of them quietly stops working.
 *
 * One file at a time is the point rather than a limitation. A batch of five in
 * a single request gives one progress bar that says nothing about which book
 * is slow, and one failure loses the other four.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "No lab found for this account" }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > MAX_BOOK_BYTES) {
    return NextResponse.json(
      { status: "failed", filename: file.name, detail: "over the size limit" },
      { status: 413 },
    );
  }

  /*
    The plan is checked here, at the write, rather than in the uploader.

    A limit enforced in the browser is a limit that holds until somebody posts
    to this endpoint directly, and this endpoint is deliberately outside the
    proxy's matcher — so it is exactly the one that would be found. Checking
    against the database also means two people uploading into the same lab at
    once cannot both slip under the same stale count.
  */
  const entitlement = await entitlementFor(membership.org_id as string);
  try {
    assertNotSuspended(entitlement);
    assertWithin(entitlement, "books");
    assertStorage(entitlement, file.size);
  } catch (err) {
    if (err instanceof LimitReached) {
      return NextResponse.json(
        { status: "failed", filename: file.name, detail: err.message, limit: err.what },
        { status: 402 },
      );
    }
    throw err;
  }

  const outcome = await ingestBook({
    supabase,
    orgId: membership.org_id as string,
    userId: user.id,
    filename: file.name || "book",
    bytes: new Uint8Array(await file.arrayBuffer()),
  });

  return NextResponse.json(outcome);
}
