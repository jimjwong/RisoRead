import Link from "next/link";
import { Card } from "@/components/ui";
import { LoginFields, type Mode } from "@/components/login-form";
import { authenticate } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  credentials: "That email and password don't match an account.",
  taken: "That email already has an account.",
  unconfirmed: "Check your inbox to confirm the address first.",
  short: "Passwords need at least 6 characters.",
  missing: "Enter both an email and a password.",
  unknown: "Something went wrong. Try again.",
};

const NOTICES: Record<string, string> = {
  "password-reset": "Password changed. Sign in with your new password.",
};

/**
 * Mode and errors both live in the URL, and the form posts to a Server Action.
 *
 * Nothing on this page requires JavaScript. That is deliberate: when the
 * client bundle doesn't run — a stale tab holding chunk URLs that now 404, a
 * flaky connection, an older mobile browser — a click-handler-driven login
 * renders perfectly and silently does nothing, which is indistinguishable
 * from a broken app and impossible to diagnose from the outside.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string; notice?: string }>;
}) {
  const { mode: rawMode, error: rawError, notice: rawNotice } = await searchParams;
  const mode: Mode = rawMode === "signup" ? "signup" : "signin";
  const error = rawError ? (ERRORS[rawError] ?? ERRORS.unknown) : null;
  const notice = rawNotice ? NOTICES[rawNotice] : null;

  const tabs: { mode: Mode; label: string }[] = [
    { mode: "signin", label: "Sign in" },
    { mode: "signup", label: "Create account" },
  ];

  const otherMode: Mode = mode === "signin" ? "signup" : "signin";

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Riso<span className="text-[var(--accent)]">Read</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            Your shelf, on whatever you are holding.
          </p>
        </div>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-2 border-b">
            {tabs.map((t) => {
              const active = mode === t.mode;
              return (
                <Link
                  key={t.mode}
                  href={`/login?mode=${t.mode}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-12 items-center justify-center px-4 text-center text-sm font-medium transition"
                  style={{
                    background: active ? "var(--surface)" : "var(--surface-2)",
                    color: active ? "var(--fg)" : "var(--fg-muted)",
                    boxShadow: active
                      ? "inset 0 -2px 0 0 var(--accent)"
                      : undefined,
                  }}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          {error && (
            <div
              role="alert"
              className="border-b px-6 py-3 text-sm"
              style={{ color: "var(--contradicts)" }}
            >
              {error}{" "}
              <Link
                href={`/login?mode=${otherMode}`}
                className="underline underline-offset-2"
              >
                {otherMode === "signup" ? "Create one" : "Sign in instead"}
              </Link>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="border-b px-6 py-3 text-sm text-[var(--supports)]"
            >
              {notice}
            </div>
          )}

          <form action={authenticate}>
            <LoginFields mode={mode} />
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-[var(--fg-subtle)]">
          {mode === "signup"
            ? "Creating an account sets up your own shelf. You can invite other people to it later."
            : "The same sign-in as RisoDesk, and the same shelf behind it."}
        </p>

        {process.env.NEXT_PUBLIC_BUILD_STAMP ? (
          <p className="mt-2 text-center text-[10px] text-[var(--fg-subtle)] opacity-60">
            build {process.env.NEXT_PUBLIC_BUILD_STAMP}
          </p>
        ) : null}
      </div>
    </div>
  );
}
