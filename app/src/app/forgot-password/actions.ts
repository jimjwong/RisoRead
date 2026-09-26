"use server";

import { redirect } from "next/navigation";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function back(code: string): never {
  redirect(`/forgot-password?${code}`);
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@") || email.length > 254) {
    back("error=email");
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
  });

  /*
   * Deliberately return the same result for an unknown address and for most
   * delivery failures. An account-recovery form must not become a directory
   * of registered email addresses. Operational delivery failures belong in
   * the Supabase Auth logs, not in a public response.
   */
  if (error) console.error("Password recovery request failed", error.message);

  back("sent=1");
}
