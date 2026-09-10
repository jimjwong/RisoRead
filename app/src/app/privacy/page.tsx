import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "Privacy — RisoRead",
  description:
    "What RisoRead stores, what our administrators can and cannot see, and where the limits of that claim are.",
};

/**
 * The privacy page.
 *
 * Written to be checkable. Every claim here corresponds to something in the
 * schema or the code, and the one section people usually leave out — what our
 * own engineers can technically reach — is in the middle rather than the
 * footnotes. A privacy promise that turns out to have an asterisk is worth less
 * than one that arrived with it.
 */
export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="prose-measure max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Privacy</h1>
        <p className="mt-2 text-xs text-[var(--fg-subtle)]">Last updated 23 August 2026</p>

        <Para>
          RisoRead holds your library and your reading: the books you keep, the
          passages you marked, and the page you stopped on last night. What
          somebody reads is more sensitive than most software has to handle, and
          this page is meant to be read rather than agreed to.
        </Para>

        <H2>The short version</H2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--fg-muted)]">
          <li>Your books are visible to the people you invite onto your shelf, and to nobody else.</li>
          <li>Where you got to in a book, and what you bookmarked, is visible to you alone.</li>
          <li>Our admin console cannot query your content. That is enforced by the database, not by policy.</li>
          <li>We do not train models on your books, sell them, or share them with advertisers. There are no advertisers.</li>
          <li>Our engineers hold infrastructure credentials that could technically reach stored data. What we do about that is below.</li>
          <li>You can download every book and delete everything, without asking us.</li>
          <li>RisoRead and RisoDesk are one account and one database, so everything here describes both.</li>
        </ul>

        <H2>What we store</H2>
        <Para>
          <strong>Account records.</strong> Your email address, your name if you
          give one, an encrypted password, the labs you belong to, your plan and
          what was charged for it. Sign-in times, so you can spot an account
          being used by someone else.
        </Para>
        <Para>
          <strong>Your content.</strong> Uploaded PDFs and EPUBs, the metadata
          read out of them, reading positions, bookmarks and the notes on them,
          tags and folders. If the same account also uses RisoDesk, its papers
          and manuscripts are in the same database, under the same rules.
        </Para>
        <Para>
          <strong>Operational records.</strong> Error traces and request logs,
          which may contain identifiers such as a document id, and are kept for
          30 days. Short links you create record a count of how often they were
          followed, and not by whom.
        </Para>
        <Para>
          <strong>Your activity record.</strong> So that the usage page can show
          you your own year, we count how many things you did on each day: a
          book added, a bookmark written, a day on which you read something. The
          granularity is a day and that is deliberate — there are no timestamps,
          so it cannot say when in the day you read, and there are no targets, so
          it cannot say which book. It is readable by you and by nobody else: not
          other people on your shelf, and not our admin console, which has no
          query path to it.
        </Para>
        <Para>
          We do not measure time on page, hours logged, or sessions. Doing that
          would need a feed from your browser reporting that you are still
          there, and we would rather not know.
        </Para>
        <Para>
          <strong>What we deliberately do not store.</strong> No analytics or
          advertising trackers on any page, signed in or out. No profile of you
          assembled for anyone else&rsquo;s benefit. No record of how long you
          spent on a page, or which pages you lingered on, beyond the single
          reading position you asked us to
          remember so you could pick up where you left off — which is yours
          alone and is not visible to others on your shelf.
        </Para>

        <H2>What our administrators can see</H2>
        <Para>
          This is the part usually written vaguely, so here it is exactly.
        </Para>
        <Para>
          RisoRead is multi-tenant, and every row of content in the database
          carries the id of the lab it belongs to. Postgres row-level security
          decides, on every single query, whether the person asking is a member
          of that lab. An administrator account is subject to the same check as
          anyone else — <em>there is no administrator exemption in any content
          policy</em>. Not one that is switched off; one that was never written.
        </Para>
        <Para>
          The admin console — which lives in RisoDesk, not here — reads through
          three database functions that return account records and aggregate
          counts. They return numbers. Asked how many books a lab holds, they
          answer with a number. There is no function that returns a book, a
          title, a filename or a file, and the console has no other way to ask.
        </Para>
        <Para>
          Concretely: an administrator can see that a lab is called Chen Lab, is
          on the lifetime plan, has four members, 62 books and 4.1 GB stored.
          They cannot see the title of a single one of them.
        </Para>

        <H2>Where that claim stops</H2>
        <Para>
          RisoRead is not end-to-end encrypted, and any product offering these
          features while claiming to be is describing something it has not
          built. Our servers process your files because that is what the
          features are:
        </Para>
        <ul className="mt-3 space-y-2 text-sm text-[var(--fg-muted)]">
          <li>PDFs are rendered to images page by page on our servers, so they display on a phone.</li>
          <li>EPUBs are unpacked and their chapters sanitised before being shown.</li>
          <li>When you ask for tag suggestions, the book&rsquo;s title, description and a short opening extract are sent to Anthropic&rsquo;s API. Anthropic does not train on it, and nothing is sent unless you ask.</li>
          <li>Backups are taken of the whole database, and someone has to be able to restore them.</li>
        </ul>
        <Para>
          So: our engineers hold credentials that could read stored data. We
          hold them because a service nobody can restore is a service that loses
          your work the first time a disk fails. What we commit to is narrower
          and, we think, more honest than a promise we could not keep:
        </Para>
        <ul className="mt-3 space-y-2 text-sm text-[var(--fg-muted)]">
          <li>No product surface exposes your content to us. Reaching it requires deliberately going around the application.</li>
          <li>We access stored content only when you ask us to for support, when required to keep the service running, or where the law compels us.</li>
          <li>We will tell you if we are legally compelled to hand over your data, unless we are forbidden from telling you.</li>
          <li>Your work is never used to train any model.</li>
        </ul>

        <H2>Who else touches your data</H2>
        <Para>
          Supabase hosts the database, authentication and file storage.
          Cloudflare R2 stores uploaded books. Anthropic processes the extracts
          you send for tag suggestions, and does not train on them. That is the
          list. There is no analytics vendor, no advertising network and no data
          broker in it.
        </Para>

        <H2>Leaving</H2>
        <Para>
          Every book downloads as the file you uploaded, byte for byte, from its
          own page. Nothing about that is behind a paid plan, and none of it
          requires a support request. Deleting your lab deletes its content, and
          backups age out within 30 days.
        </Para>

        <H2>Asking us anything</H2>
        <Para>
          Write to{" "}
          <a href="mailto:privacy@risoread.com" className="text-[var(--accent)] hover:underline">
            privacy@risoread.com
          </a>
          . If you are in a jurisdiction with rights of access, correction,
          portability or erasure, those rights apply to you here, and the export
          and delete controls in the product are the fastest route to most of
          them.
        </Para>

        <p className="mt-10 border-t pt-6 text-sm text-[var(--fg-muted)]">
          The <Link href="/terms" className="text-[var(--accent)] hover:underline">terms of use</Link>{" "}
          cover what we each owe the other.
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
