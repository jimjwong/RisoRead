import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * A year of working days, and what can honestly be said about them.
 *
 * The chart is the easy half. The hard half is not overclaiming: a count of
 * acts is a record of activity, and activity is not productivity. A week spent
 * reading four papers properly and rewriting one paragraph can be the best week
 * of a project, and it will look thin here.
 *
 * So what this computes is consistency — which is real, is the thing that
 * actually finishes a review, and is what somebody can act on — rather than
 * anything dressed up as output per hour.
 */

export const KINDS = ["paper", "screen", "card", "write", "read", "book", "note", "ai"] as const;
export type Kind = (typeof KINDS)[number];

/**
 * What each kind of act is called.
 *
 * The table is shared with RisoDesk and records everything either application
 * does, so a day spent screening papers shows up on this heatmap too. That is
 * deliberate: it is one account's year, not one app's, and hiding the other
 * half would make the streak count lie.
 */
export const KIND_LABELS: Record<Kind, string> = {
  paper: "Papers added",
  screen: "Screening decisions",
  card: "Evidence cards",
  write: "Writing",
  read: "Reading",
  book: "Books added",
  note: "Bookmarks",
  ai: "AI actions",
};

export type Day = { day: string; total: number; byKind: Partial<Record<Kind, number>> };

export type ActivityYear = {
  /** Every day from a year ago to today, including the empty ones. */
  days: Day[];
  total: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  busiest: { day: string; total: number } | null;
  byKind: { kind: Kind; count: number }[];
  /** Days in the last 28 with anything on them. */
  recentActiveDays: number;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function activityYear(userId: string): Promise<ActivityYear> {
  const supabase = await getSupabaseServerClient();

  // 371 days rather than 365: the grid starts on a Sunday, so it needs up to
  // six days of the week before the year began to fill the first column.
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 370);

  const { data } = await supabase
    .from("activity_days")
    .select("day, kind, count")
    .eq("user_id", userId)
    .gte("day", iso(from))
    .order("day");

  const rows = (data ?? []) as { day: string; kind: Kind; count: number }[];

  const byDay = new Map<string, Day>();
  const kindTotals = new Map<Kind, number>();

  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { day: row.day, total: 0, byKind: {} };
    entry.total += row.count;
    entry.byKind[row.kind] = (entry.byKind[row.kind] ?? 0) + row.count;
    byDay.set(row.day, entry);
    kindTotals.set(row.kind, (kindTotals.get(row.kind) ?? 0) + row.count);
  }

  // Every day in the window, empty ones included — a heatmap with gaps missing
  // would silently shorten the year and misalign every column after the gap.
  const days: Day[] = [];
  const cursor = new Date(from);
  const today = iso(new Date());
  while (iso(cursor) <= today) {
    const key = iso(cursor);
    days.push(byDay.get(key) ?? { day: key, total: 0, byKind: {} });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Streaks are counted backwards from today. Today being empty does not break
  // a streak — it is not over until a whole day has passed without anything,
  // and telling somebody at nine in the morning that they have lost a
  // twelve-day run is both wrong and discouraging.
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const isToday = i === days.length - 1;
    if (days[i].total > 0) currentStreak++;
    else if (!isToday) break;
  }

  let longestStreak = 0;
  let run = 0;
  for (const day of days) {
    run = day.total > 0 ? run + 1 : 0;
    if (run > longestStreak) longestStreak = run;
  }

  const busiest = days.reduce<{ day: string; total: number } | null>(
    (best, d) => (d.total > (best?.total ?? 0) ? { day: d.day, total: d.total } : best),
    null,
  );

  const recent = days.slice(-28);

  return {
    days,
    total: days.reduce((sum, d) => sum + d.total, 0),
    activeDays: days.filter((d) => d.total > 0).length,
    currentStreak,
    longestStreak,
    busiest,
    byKind: [...kindTotals.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
    recentActiveDays: recent.filter((d) => d.total > 0).length,
  };
}
