import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The frame for pages a stranger sees.
 *
 * Deliberately not the app's Shell. That one carries a sign-out button and
 * links to a shelf, both of which are meaningless before anyone has an account
 * and one of which looks broken when clicked.
 */
export function PublicShell({
  children,
  cta = true,
}: {
  children: ReactNode;
  cta?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-20 border-b bg-[var(--surface)]/85 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
          <Link href="/welcome" className="text-sm font-semibold tracking-tight">
            Riso<span className="text-[var(--accent)]">Read</span>
          </Link>
          <nav className="flex flex-1 items-center gap-4">
            <Link href="/privacy" className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]">
              Privacy
            </Link>
            <Link href="/terms" className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]">
              Terms
            </Link>
          </nav>
          {cta && (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                className="inline-flex min-h-9 items-center rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">{children}</main>

      <footer className="mt-16 border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-8 text-xs text-[var(--fg-subtle)] sm:px-6">
          <span>RisoRead</span>
          <Link href="/privacy" className="hover:text-[var(--fg)]">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[var(--fg)]">
            Terms
          </Link>
          <span className="ml-auto">Your shelf, on whatever you are holding.</span>
        </div>
      </footer>
    </div>
  );
}

/** A section with a heading, used the same way down every public page. */
export function Section({
  id,
  title,
  lead,
  children,
}: {
  id?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mb-14 scroll-mt-20">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl text-sm text-[var(--fg-muted)]">{lead}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}
