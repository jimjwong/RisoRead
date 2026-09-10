import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Cloud, Lock, Smartphone } from "lucide-react";
import { PublicShell, Section } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "RisoRead — your shelf, on whatever you are holding",
  description:
    "PDFs and EPUBs kept in the cloud, opening at the page you left, on a phone, a tablet or a desktop. The same account and the same shelf as RisoDesk.",
};

/**
 * The landing page.
 *
 * Its own URL rather than the root, so it can be linked from a post or a poster
 * without depending on what the root happens to redirect to for whoever opens
 * it. The root sends signed-out visitors here and signed-in ones to the shelf.
 */
export default function WelcomePage() {
  return (
    <PublicShell>
      <section className="mb-16">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-[var(--fg-muted)]">
          <Cloud size={12} aria-hidden />
          One account with RisoDesk — the same shelf in both
        </p>

        <h1 className="max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          Your shelf, on whatever you are holding.
        </h1>

        <p className="mt-4 max-w-2xl text-base text-[var(--fg-muted)]">
          Put a PDF or an EPUB in once. Read it on a laptop at your desk, pick it
          up on a phone on the train, and it opens on the page you stopped at.
          Bookmarks, folders and tags follow the book rather than the device.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/login?mode=signup"
            className="inline-flex min-h-11 items-center rounded-md bg-[var(--accent)] px-5 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-md border px-5 text-sm hover:bg-[var(--surface-2)]"
          >
            Sign in
          </Link>
          <span className="text-xs text-[var(--fg-subtle)]">
            Already using RisoDesk? The same sign-in works here.
          </span>
        </div>
      </section>

      <Section
        title="What it does"
        lead="A reader, and the shelf behind it. Nothing else, on purpose."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: <BookOpen size={16} aria-hidden />,
              title: "The reader",
              body: "Focus mode fills the screen. Tap the edges or swipe to turn pages. Text size, line spacing, measure, typeface and page tint for EPUBs; fit and zoom for PDFs.",
            },
            {
              icon: <Cloud size={16} aria-hidden />,
              title: "The shelf",
              body: "Folders four deep, tags suggested by Claude when you want them, and a search that finds a title without you remembering where you filed it.",
            },
            {
              icon: <Smartphone size={16} aria-hidden />,
              title: "Anywhere",
              body: "Every page is rendered on the server, so a book opens on a slow phone before any script arrives. Add it to a home screen and it behaves like an app.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-[var(--radius)] border bg-[var(--surface)] p-4">
              <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium">
                <span style={{ color: "var(--accent)" }}>{f.icon}</span>
                {f.title}
              </p>
              <p className="text-sm text-[var(--fg-muted)]">{f.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="One account, two applications"
        lead="RisoRead is the reading half of RisoDesk, on its own."
      >
        <div className="rounded-[var(--radius)] border bg-[var(--surface)] p-5">
          <p className="prose-measure text-sm text-[var(--fg-muted)]">
            RisoDesk is a research workspace: a library of papers, screening,
            evidence, a manuscript. Its shelf of books was the part people opened
            on a phone in bed, and it did not need the other seven tools around
            it. So it is here on its own, reading the same database.
          </p>
          <p className="prose-measure mt-3 text-sm text-[var(--fg-muted)]">
            A book added in either appears in both. A page you stop on here is
            the page RisoDesk opens at. Your plan, your storage and your
            colleagues are the same in both, because there is only one account.
          </p>
        </div>
      </Section>

      <Section title="Reading positions are yours" lead="A shared shelf, but not a shared place in it.">
        <div className="rounded-[var(--radius)] border bg-[var(--surface)] p-5">
          <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium">
            <Lock size={14} aria-hidden style={{ color: "var(--accent)" }} />
            What other people can see
          </p>
          <ul className="space-y-2 text-sm text-[var(--fg-muted)]">
            <li>
              Everyone you share a shelf with sees the books, the folders and the
              tags. That is what a shared shelf is.
            </li>
            <li>
              Nobody sees where you got to, what you bookmarked, or the note you
              wrote on a bookmark. Those rows carry your user id and the database
              enforces it.
            </li>
            <li>
              Administrators have no query path to any of it. There is no
              exemption in the content policies — not one switched off, one never
              written.
            </li>
          </ul>
          <p className="mt-4 text-xs text-[var(--fg-subtle)]">
            Where that stops is on the <Link href="/privacy" className="text-[var(--accent)] hover:underline">privacy page</Link>,
            in the open rather than in a footnote.
          </p>
        </div>
      </Section>
    </PublicShell>
  );
}
