"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function back(code: string): never {
  redirect(`/reset-password?error=${code}`);
}

export async function updateRecoveredPassword(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");

  if (password.length < 8) back("short");
  if (password !== confirmation) back("mismatch");

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/forgot-password?error=expired");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) back("update");

  // End the recovery session so the new password is immediately proven by a
  // normal sign-in rather than leaving an email-link session active.
  await supabase.auth.signOut();
  redirect("/login?notice=password-reset");
}
