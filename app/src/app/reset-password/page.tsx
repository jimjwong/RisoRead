import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Input, Label } from "@/components/ui";
import { PasswordResetSubmitButton } from "@/components/password-reset-submit-button";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateRecoveredPassword } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  short: "Use at least 8 characters.",
  mismatch: "The two passwords do not match.",
  update: "We could not change the password. Request a new reset link and try again.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/forgot-password?error=expired");

  const { error: rawError } = await searchParams;
  const error = rawError ? (ERRORS[rawError] ?? ERRORS.update) : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            This replaces the old password for {user.email}.
          </p>
        </div>

        <Card>
          <form action={updateRecoveredPassword} className="space-y-4 p-6">
            {error && (
              <p role="alert" className="text-sm text-[var(--contradicts)]">
                {error}
              </p>
            )}
            <div>
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="min-h-11"
                autoFocus
              />
              <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">
                At least 8 characters.
              </p>
            </div>
            <div>
              <Label htmlFor="password_confirmation">Confirm new password</Label>
              <Input
                id="password_confirmation"
                name="password_confirmation"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="min-h-11"
              />
            </div>
            <PasswordResetSubmitButton idleLabel="Change password" pendingLabel="Changing…" />
            <p className="text-center text-xs text-[var(--fg-muted)]">
              <Link href="/login" className="text-[var(--accent)] hover:underline">
                Cancel and return to sign in
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
