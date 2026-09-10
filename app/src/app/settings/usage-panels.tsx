import Link from "next/link";
import { Card } from "@/components/ui";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { KIND_LABELS, type ActivityYear, type Kind } from "@/lib/stats/activity";
import { PLANS, bytesLabel, limitLabel } from "@/lib/billing/plans";
import type { Usage } from "@/lib/stats/usage";

/**
 * How this account has been used.
 *
 * Two subjects, kept visibly apart. The shelf belongs to the lab; where you got
 * to in a book and what you bookmarked belong to you and to nobody else in it.
 * A page that ran them together would tell somebody who joined last week that
 * they have read four hundred books.
 */
export function UsagePanels({
  usage,
  activity: year,
}: {
  usage: Usage;
  activity: ActivityYear;
}) {
  const { lab, you, storage, entitlement } = usage;
  const plan = PLANS[entitlement.plan];

  return (
    <div className="space-y-6">
      {/* ---- At a glance ------------------------------------------------ */}
      <section>
        <h2 className="mb-3 text-sm font-medium">
          {lab.name}
          {lab.since && (
            <span className="ml-2 text-xs font-normal text-[var(--fg-subtle)]">
              since{" "}
              {new Date(lab.since).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Books", lab.books],
            ["Folders", lab.folders],
            ["Nobody has opened", lab.untouched],
            ["People", lab.members],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-3">
              <p className="text-[11px] text-[var(--fg-subtle)]">{label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {Number(value).toLocaleString()}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---- Plan ------------------------------------------------------- */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">{plan.name} plan</h2>
          <Link href="/settings?tab=data" className="text-xs text-[var(--accent)] hover:underline">
            Plan and downloads
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Books",
              used: entitlement.usage.books,
              limit: entitlement.limits.books,
              fmt: limitLabel,
            },
            { label: "Storage", used: storage.books, limit: storage.limit, fmt: bytesLabel },
            {
              label: "People",
              used: entitlement.usage.members,
              limit: entitlement.limits.members,
              fmt: limitLabel,
            },
          ].map((row) => {
            const share = Number.isFinite(row.limit) ? Math.min(100, (row.used / row.limit) * 100) : 0;
            // Amber before red, and only once it is close enough to matter.
            const colour =
              share >= 90 ? "var(--contradicts)" : share >= 70 ? "var(--limitation)" : "var(--accent)";
            return (
              <div key={row.label}>
                <p className="text-[11px] text-[var(--fg-subtle)]">{row.label}</p>
                <p className="text-sm tabular-nums">
                  {row.fmt(row.used)}
                  <span className="text-[var(--fg-subtle)]"> / {row.fmt(row.limit)}</span>
                </p>
                {Number.isFinite(row.limit) && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: colour }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/*
          The allowance is one allowance. Somebody who fills it with papers in
          RisoDesk and then cannot add a book here deserves to have been told
          why before it happens rather than by the error.
        */}
        <p className="mt-3 border-t pt-3 text-[11px] text-[var(--fg-subtle)]">
          Shared with RisoDesk. Both applications draw on the same storage and
          the same plan, because they are the same account.
        </p>
      </Card>

      {/* ---- The year --------------------------------------------------- */}
      <Card className="p-4">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Your year</h2>
          <span className="text-xs text-[var(--fg-subtle)]">
            {year.activeDays} active {year.activeDays === 1 ? "day" : "days"}
          </span>
        </div>
        <p className="mb-4 text-xs text-[var(--fg-muted)]">
          Reading, books added, bookmarks — and anything the same account did in
          RisoDesk. Yours alone, and not visible to anyone else.
        </p>

        <ActivityHeatmap activity={year} />

        <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
          {[
            ["Current streak", year.currentStreak === 1 ? "1 day" : `${year.currentStreak} days`],
            ["Longest streak", year.longestStreak === 1 ? "1 day" : `${year.longestStreak} days`],
            [
              "Busiest day",
              year.busiest
                ? `${year.busiest.total} on ${new Date(year.busiest.day).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                : "—",
            ],
            ["Active in the last four weeks", `${year.recentActiveDays} of 28`],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-[11px] text-[var(--fg-subtle)]">{label}</p>
              <p className="mt-0.5 text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>

        {/*
          Said plainly, because a chart of counts invites being read as a chart
          of worth, and the people most likely to read it that way are the ones
          it would do the most harm to.
        */}
        <p className="mt-4 border-t pt-3 text-[11px] text-[var(--fg-subtle)]">
          This counts things done, not time spent, and not pages understood. A
          week spent on forty careful pages can be the best week of a book and
          will look thin here. Nothing on this page measures how well you read.
        </p>
      </Card>

      {/* ---- Balance ---------------------------------------------------- */}
      {year.byKind.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-medium">What the year went on</h2>
          <p className="mb-4 text-xs text-[var(--fg-muted)]">
            A shelf that only ever grows is a shelf nobody is reading. The useful
            question is whether adding and reading are anywhere near each other.
          </p>
          <Bars
            rows={year.byKind.map((k) => ({ label: KIND_LABELS[k.kind as Kind], value: k.count }))}
            total={year.total}
          />
        </Card>
      )}

      {/* ---- You -------------------------------------------------------- */}
      <section>
        <h2 className="mb-1 text-sm font-medium">Your reading</h2>
        <p className="mb-3 text-xs text-[var(--fg-muted)]">
          Yours alone. A shared shelf, but your own place in it — nobody else in
          the lab sees this.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Books started", you.booksStarted],
            ["Finished", you.booksFinished],
            ["Bookmarks", you.bookmarks],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-3">
              <p className="text-[11px] text-[var(--fg-subtle)]">{label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {Number(value).toLocaleString()}
              </p>
            </Card>
          ))}
        </div>

        {you.reading.length > 0 && (
          <Card className="mt-3 p-4">
            <h3 className="mb-3 text-xs font-medium text-[var(--fg-muted)]">Part-read</h3>
            <ul className="space-y-2.5">
              {you.reading.map((book) => (
                <li key={book.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/books/${book.id}`}
                      rel="nofollow"
                      className="min-w-0 flex-1 truncate text-sm hover:text-[var(--accent)]"
                    >
                      {book.title}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--fg-subtle)]">
                      {book.percent}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${book.percent}%`, background: "var(--accent)" }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function Bars({ rows, total }: { rows: { label: string; value: number }[]; total: number }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--fg-muted)]">Nothing to show yet.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-[var(--fg-muted)]">{row.label}</span>
            <span className="tabular-nums">
              {row.value.toLocaleString()}
              {total > 0 && (
                <span className="ml-1.5 text-xs text-[var(--fg-subtle)]">
                  {Math.round((row.value / total) * 100)}%
                </span>
              )}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${total > 0 ? (row.value / total) * 100 : 0}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
