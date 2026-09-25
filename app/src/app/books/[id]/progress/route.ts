import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { recordProgress } from "@/lib/books/progress";

/**
 * Record a reading position from plain client code.
 *
 * The reader normally records progress as a side effect of a navigation's own
 * GET (see the comment in page.tsx). The offline reader turns pages without
 * one — it fetches content and swaps it into the DOM directly — so it needs a
 * plain endpoint to call instead of a Server Action, whose invocation
 * protocol isn't meant to be reproduced by hand from client code.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const at = Number(body?.at);
  if (!Number.isFinite(at) || at < 0) {
    return NextResponse.json({ error: "Bad location" }, { status: 400 });
  }

  const result = await recordProgress(supabase, user.id, id, at);
  if (!result) return NextResponse.json({ error: "No such book" }, { status: 404 });

  return NextResponse.json(result);
}
