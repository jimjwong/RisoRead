"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Authentication as a Server Action.
 *
 * A plain `<form action={...}>` posts natively when JavaScript hasn't run, so
 * signing in works on a page that never hydrated — a stale tab, a flaky
 * connection, an older mobile browser. Doing this client-side made the form a
 * no-op in exactly those cases: the button appeared to do nothing, with no
 * error, because the submit handler was never attached.
 *
 * It also puts the session cookie where it belongs. `@supabase/ssr` writes it
 * during the action, so the very next request is already authenticated —
 * no client-side round trip, and nothing to lose if the tab closes first.
 */

/** Errors travel in the URL so they survive a no-JavaScript form post. */
function fail(mode: string, code: string): never {
  redirect(`/login?mode=${mode}&error=${code}`);
}

export async function authenticate(formData: FormData) {
  const mode = String(formData.get("mode") ?? "signin");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const invite = String(formData.get("invite") ?? "").trim();

  if (!email || !password) fail(mode, "missing");
  if (password.length < 6) fail(mode, "short");

  const supabase = await getSupabaseServerClient();

  const { data: result, error } =
    mode === "signup"
      ? await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || email.split("@")[0] } },
        })
      : await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("invalid login credentials")) fail(mode, "credentials");
    if (m.includes("already registered") || m.includes("already been registered")) {
      fail(mode, "taken");
    }
    if (m.includes("email not confirmed")) fail(mode, "unconfirmed");
    if (m.includes("password should be")) fail(mode, "short");
    fail(mode, "unknown");
  }

  /*
    Redeeming a launch code.

    Done after the account exists rather than before, so a code is never spent
    on a sign-up that then failed for another reason. claim_invite marks it used
    and returns the price it was worth; the price comes from the database rather
    than from a constant here, so editing the pricing file later cannot reprice
    somebody who already redeemed.

    A code that does not work is not a reason to refuse the account. They are
    signed in on the free plan and can be upgraded by hand, which is a far better
    outcome than an error page after a password was chosen.
  */
  if (mode === "signup" && invite && result?.user) {
    const { data: cents } = await supabase.rpc("claim_invite", {
      code: invite,
      claimant: result.user.id,
    });

    if (typeof cents === "number") {
      const { data: membership } = await supabase
        .from("memberships")
        .select("org_id")
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (membership) {
        await supabase
          .from("orgs")
          .update({
            plan: "lifetime",
            plan_period: "lifetime",
            plan_started_at: new Date().toISOString(),
            plan_price_cents: cents,
            plan_note: "Waitlist launch code",
          })
          .eq("id", membership.org_id);
      }
    }
  }

  // redirect() throws, so it must sit outside the try/catch-free path above.
  redirect("/");
}
