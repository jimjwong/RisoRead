"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

const back: (params?: string) => never = (params = "") => redirect(`/settings${params}`);

export async function updateProfile(formData: FormData): Promise<void> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const affiliation = String(formData.get("affiliation") ?? "").trim();
  const orcidRaw = String(formData.get("orcid") ?? "").trim();

  if (!fullName) back("?error=A+name+is+needed.");

  // An ORCID is a fixed shape and the final character may be an X, which is
  // exactly the sort of detail a looser check would drop. Stored bare, so it
  // reads the same however it was pasted.
  let orcid: string | null = null;
  if (orcidRaw) {
    const digits = orcidRaw.replace(/^https?:\/\/orcid\.org\//i, "").replace(/[\s-]/g, "");
    if (!/^\d{15}[\dX]$/i.test(digits)) {
      back("?error=An+ORCID+looks+like+0000-0002-1825-0097.");
    }
    orcid = digits.toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
  }

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName.slice(0, 120),
      affiliation: affiliation.slice(0, 200) || null,
      orcid,
    })
    .eq("id", user.id);

  if (error) back("?error=That+could+not+be+saved.");

  revalidatePath("/settings");
  back("?notice=profile");
}

/**
 * Change the email an account signs in with.
 *
 * Supabase sends a confirmation to the new address and does not switch until it
 * is followed, which is the behaviour to want: an account whose address can be
 * changed to one nobody controls is an account that can be locked out by a
 * typo, or taken by whoever borrowed an unlocked laptop.
 */
export async function changeEmail(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) back("?error=That+email+does+not+look+right.");
  if (!password) back("?error=Confirm+with+your+current+password.");

  const { supabase, user } = await requireUser();

  // Supabase does not require the current password for this, so it is checked
  // here. Without it, an unattended session is a permanent account takeover.
  const { error: wrong } = await supabase.auth.signInWithPassword({
    email: user.email ?? "",
    password,
  });
  if (wrong) back("?error=That+password+is+not+right.");

  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    back(
      error.message.toLowerCase().includes("already")
        ? "?error=That+address+is+already+in+use."
        : "?error=That+address+could+not+be+set.",
    );
  }

  back("?notice=email");
}

export async function changePassword(formData: FormData): Promise<void> {
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const again = String(formData.get("confirm_password") ?? "");

  if (next.length < 8) back("?error=A+password+needs+at+least+8+characters.");
  if (next !== again) back("?error=Those+two+passwords+are+different.");

  const { supabase, user } = await requireUser();

  // Same reasoning as the email change: the session alone is not proof that the
  // person at the keyboard is the account holder.
  const { error: wrong } = await supabase.auth.signInWithPassword({
    email: user.email ?? "",
    password: current,
  });
  if (wrong) back("?error=Your+current+password+is+not+right.");

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) back("?error=That+password+could+not+be+set.");

  back("?notice=password");
}

/**
 * End every session, everywhere.
 *
 * The control somebody reaches for after losing a laptop, so it signs this
 * session out too rather than leaving the one device it was pressed on still
 * holding a token.
 */
export async function signOutEverywhere(): Promise<void> {
  const { supabase } = await requireUser();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?notice=signedout");
}

/**
 * Close the account.
 *
 * Typing the address is not ceremony: this is the one control here that cannot
 * be undone, and a misplaced click on a page full of forms should not be able
 * to reach it.
 *
 * The labs go first, from the account's own session, and only labs where this
 * person is the last member — a lab with anyone else in it belongs to them too.
 * The auth user goes last, through the admin client, after the id has been
 * matched against the session: this is the only place in the application where
 * that key acts on a request, and it acts on exactly one row that the caller
 * has proved is theirs.
 */
export async function deleteAccount(formData: FormData): Promise<void> {
  const typed = String(formData.get("confirm_email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const { supabase, user } = await requireUser();

  if (typed !== (user.email ?? "").toLowerCase()) {
    back("?tab=data&error=Type+your+email+address+exactly+to+confirm.");
  }
  if (!password) back("?tab=data&error=Confirm+with+your+password.");

  const { error: wrong } = await supabase.auth.signInWithPassword({
    email: user.email ?? "",
    password,
  });
  if (wrong) back("?tab=data&error=That+password+is+not+right.");

  const { error: prepFailed } = await supabase.rpc("prepare_account_deletion");
  if (prepFailed) back("?tab=data&error=Your+account+could+not+be+closed.");

  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) back("?tab=data&error=Your+account+could+not+be+closed.");

  await supabase.auth.signOut();
  redirect("/welcome?closed=1");
}
