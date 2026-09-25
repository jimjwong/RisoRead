import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Who, if anyone, is signed in — for the offline engine to check identity
 * outside of a server-rendered page (see src/lib/offline/engine.ts).
 *
 * Never cached: unlike a book's own content, whether a given browser is
 * currently signed in as someone changes on every sign-in and sign-out, and a
 * stale answer here is exactly the class of bug the offline engine's
 * user-scoping exists to avoid.
 */
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json(
    { id: user?.id ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
