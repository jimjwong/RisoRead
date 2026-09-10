import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { PRICES, money } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Terms of use — RisoRead",
  description:
    "What you get, what it costs, what happens to your work, and what we will not do with it.",
};

export default function TermsPage() {
  return (
    <PublicShell>
      <article className="prose-measure max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Terms of use</h1>
        <p className="mt-2 text-xs text-[var(--fg-subtle)]">Last updated 23 August 2026</p>

        <Para>
          Plain terms for a reading app. Where a sentence could be read two
          ways, read it the way that favours you.
        </Para>

        <H2>Your work is yours</H2>
        <Para>
          You keep every right in the books you upload and the notes you write.
          Using RisoRead grants us permission to store them, transmit them, and
          process them for the sole purpose of providing the features you use —
          rendering a page you asked to read, unpacking a chapter, sending an
          extract you asked to have tagged. That permission covers nothing else,
          and it ends when you delete the content.
        </Para>
        <Para>
          <strong>We do not train models on your books</strong>, ours or anyone
          else&rsquo;s, and we do not licence them to anyone who does.
        </Para>

        <H2>What our administrators may access</H2>
        <Para>
          This is a term of the agreement rather than only a description of the
          software, so that it binds us:
        </Para>
        <ul className="mt-3 space-y-2 text-sm text-[var(--fg-muted)]">
          <li>
            Our administration console provides no means to read the content of
            your books, your bookmarks, or your reading positions. Administrator
            accounts are subject to the same row-level access controls as every
            other account.
          </li>
          <li>
            Administrators may see account and billing records, and aggregate
            counts and storage totals for a shelf — how much, never what.
          </li>
          <li>
            Our personnel hold infrastructure credentials capable of reaching
            stored data. We will use them to access your content only with your
            request or consent, where necessary to maintain or restore the
            service, or where legally compelled — and we will notify you of a
            legal compulsion unless prohibited from doing so.
          </li>
        </ul>
        <Para>
          The <Link href="/privacy" className="text-[var(--accent)] hover:underline">privacy page</Link>{" "}
          explains how each of these is enforced.
        </Para>

        <H2>Plans and payment</H2>
        <Para>
          <strong>Free</strong> is a plan and not a trial. It does not expire.
          We may change what it includes for new accounts, and will not reduce it
          under an account already using it without 60 days&rsquo; notice.
        </Para>
        <Para>
          <strong>Pro</strong> is {money(PRICES.monthly)} a month or{" "}
          {money(PRICES.annual)} a year, charged in advance and cancellable at
          any time. Cancelling stops the next charge and leaves you on the plan
          you paid for until it runs out. We do not pro-rate part-months, and we
          will refund a subscription within 14 days of a charge if you ask.
        </Para>
        <Para>
          <strong>Lifetime</strong> is {money(PRICES.lifetime)} once, or{" "}
          {money(PRICES.lifetimeLaunch)} for waitlist members at launch. It
          covers everything in Pro, including features added later, for as long
          as the service operates. It carries no renewal and no expiry. If we
          discontinue it we will give at least 90 days&rsquo; notice and keep
          downloads working throughout.
        </Para>
        <Para>
          &ldquo;Lifetime&rdquo; means the lifetime of the service, not of a
          person, and we would rather say so here than have you discover it
          later. Prices exclude any tax we are required to collect.
        </Para>

        <H2>Fair use of the plans</H2>
        <Para>
          Unlimited means unlimited for reading done by you and the people on
          your shelf. It does not cover reselling access, sharing one account
          across an institution, distributing books you have no right to
          distribute, or using storage as a general file host. If usage looks
          like one of those, we will write to you before doing anything about it.
        </Para>

        <H2>Getting your books out</H2>
        <Para>
          Every book downloads as the file you uploaded, on every plan, including
          free and including after a paid plan lapses. If your plan lapses, your
          books are not deleted — you keep reading and downloading them, and
          adding new ones is what stops.
        </Para>

        <H2>One account, two applications</H2>
        <Para>
          RisoRead and RisoDesk share an account, a database and a plan. These
          terms apply to both, an action taken in one is an action on the same
          account, and closing the account closes it in both. If you only ever
          use one of them, nothing here changes for you.
        </Para>

        <H2>Ending it</H2>
        <Para>
          You can delete your shelf at any time, which deletes its content. We may
          suspend an account that is being used to break the law, to attack the
          service, or to store material we are required to remove; short of
          that, we will contact a person before disabling anything.
        </Para>

        <H2>What we do not promise</H2>
        <Para>
          RisoRead is provided as it is. We do not warrant that it will be
          uninterrupted or error-free, and our liability is limited to what you
          paid us in the twelve months before a claim. Nothing here limits
          liability that cannot lawfully be limited.
        </Para>
        <Para>
          Suggested tags are an aid, not an authority. A model reading the first
          page of a book is guessing at what the book is about, and it is worth
          looking at what it guessed before relying on it.
        </Para>

        <H2>Changes</H2>
        <Para>
          If we change these terms materially we will give 30 days&rsquo; notice
          by email, and the previous version continues to apply to you until
          then. Continuing to use RisoRead after that is acceptance.
        </Para>

        <p className="mt-10 border-t pt-6 text-sm text-[var(--fg-muted)]">
          Questions:{" "}
          <a href="mailto:hello@risoread.com" className="text-[var(--accent)] hover:underline">
            hello@risoread.com
          </a>
        </p>
      </article>
    </PublicShell>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-lg font-semibold tracking-tight">{children}</h2>;
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-[var(--fg-muted)]">{children}</p>;
}
