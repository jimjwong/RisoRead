import Link from "next/link";
import { Card, Input, Label } from "@/components/ui";
import { PasswordResetSubmitButton } from "@/components/password-reset-submit-button";
import { requestPasswordReset } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "Enter a valid email address.",
  expired: "That reset link is invalid or has expired. Request a new one.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error: rawError } = await searchParams;
  const error = rawError ? (ERRORS[rawError] ?? ERRORS.expired) : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            We’ll email you a secure, one-time recovery link.
          </p>
        </div>

        <Card className="overflow-hidden">
          {sent === "1" ? (
            <div className="space-y-4 p-6">
              <div role="status" className="text-sm leading-relaxed text-[var(--fg)]">
                If an account exists for that email, a reset link is on its way.
                Check your inbox and spam folder.
              </div>
              <p className="text-xs leading-relaxed text-[var(--fg-subtle)]">
                For your security, the link expires and can only be used once.
              </p>
              <Link
                href="/login"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[var(--border-firm)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)]"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form action={requestPasswordReset} className="space-y-4 p-6">
              {error && (
                <p role="alert" className="text-sm text-[var(--contradicts)]">
                  {error}
                </p>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="email"
                  className="min-h-11"
                  autoFocus
                />
              </div>
              <PasswordResetSubmitButton idleLabel="Send reset link" pendingLabel="Sending…" />
              <p className="text-center text-xs text-[var(--fg-muted)]">
                Remembered it?{" "}
                <Link href="/login" className="text-[var(--accent)] hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
