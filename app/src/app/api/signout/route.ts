import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign out, and go back to the front of the site.
 *
 * The Location header is relative, and that is the whole fix. It used to be
 * built with `new URL("/login", request.url)`, and in a route handler
 * request.url is reconstructed from the address the server is bound to — which
 * here is 0.0.0.0, because the app listens on every interface so it can be
 * reached over the tailnet. Everyone who signed out was sent to
 * http://0.0.0.0:3210/login, which no browser can connect to.
 *
 * A relative Location cannot name the wrong host because it names no host: the
 * browser resolves it against whatever address it was already using, so this
 * works identically on localhost, on a tailnet IP and on risodesk.com. RFC 7231
 * has permitted it since 2014 and every browser has done it for far longer.
 *
 * NextResponse.redirect insists on an absolute URL, so the header is set
 * directly rather than through it.
 */
export async function POST() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();

  // The landing page rather than the sign-in form: somebody who has just signed
  // out is not trying to sign in, and being handed a password field is a small
  // way of asking whether they meant it.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/welcome" },
  });
}
