import type { ReactNode } from "react";
import Link from "next/link";
import { CloseOnOutsideClick } from "@/components/close-on-outside";
import { OfflineRegister } from "@/components/offline-register";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius)] border bg-[var(--surface)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles = {
    primary:
      "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 border-transparent",
    ghost:
      "bg-transparent text-[var(--fg)] hover:bg-[var(--surface-2)] border-[var(--border-firm)]",
    danger:
      "bg-transparent text-[var(--contradicts)] hover:bg-[var(--surface-2)] border-[var(--border-firm)]",
  }[variant];

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed text-[var(--fg)] placeholder:text-[var(--fg-subtle)] ${props.className ?? ""}`}
    />
  );
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-medium tracking-wide text-[var(--fg-muted)] uppercase"
    >
      {children}
    </label>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--fg)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--fg-muted)]">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * The application frame.
 *
 * Three destinations, which is the whole application: the shelf, the reader you
 * were last in, and your settings. RisoDesk's header carries eight, because
 * RisoDesk is eight tools; a reader that borrowed that header would spend a
 * third of a phone screen on links to somewhere else.
 */
export function Shell({
  children,
  breadcrumb,
  userId = null,
}: {
  children: ReactNode;
  breadcrumb?: ReactNode;
  /** Who's signed in, for the offline download engine. See OfflineRegister. */
  userId?: string | null;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-[var(--surface)]/85 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:flex-nowrap sm:px-5 sm:py-0">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Riso<span className="text-[var(--accent)]">Read</span>
          </Link>
          <Link
            href="/books"
            className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            Shelf
          </Link>
          <Link
            href="/settings"
            className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            Settings
          </Link>
          {breadcrumb ? (
            <>
              <span className="text-[var(--fg-subtle)]">/</span>
              <div className="min-w-0 flex-1 truncate text-sm text-[var(--fg-muted)]">
                {breadcrumb}
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          <form action="/api/signout" method="post">
            <button
              type="submit"
              className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <CloseOnOutsideClick />
      <OfflineRegister userId={userId} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-8">{children}</main>
    </div>
  );
}
