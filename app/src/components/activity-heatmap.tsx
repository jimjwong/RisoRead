import { KIND_LABELS, type ActivityYear, type Kind } from "@/lib/stats/activity";

/**
 * A year of activity as a grid of days.
 *
 * Server-rendered squares rather than a charting library: it is a table of
 * numbers with a colour scale, the whole thing is under a hundred elements per
 * column, and shipping a plotting runtime to draw rectangles would cost more
 * than the page it sits on.
 *
 * The scale is by quartile of the days that had anything on them, not by a
 * fixed ceiling. A fixed ceiling picked for a busy lab makes a quiet one look
 * dead, and one picked for a quiet lab makes every busy day the same shade —
 * either way the chart stops distinguishing the thing it exists to show.
 */
export function ActivityHeatmap({ activity }: { activity: ActivityYear }) {
  const { days } = activity;

  // Nothing to draw and nothing to guess from. Reading the clock here to
  // invent a start date would also make the component impure, which is what
  // the linter objected to when this fell back to Date.now().
  if (days.length === 0) {
    return <p className="text-sm text-[var(--fg-muted)]">Nothing recorded yet.</p>;
  }

  const busyTotals = days.filter((d) => d.total > 0).map((d) => d.total).sort((a, b) => a - b);
  const quartile = (q: number) =>
    busyTotals.length ? busyTotals[Math.min(busyTotals.length - 1, Math.floor(busyTotals.length * q))] : 1;

  const cuts = [quartile(0.25), quartile(0.5), quartile(0.75)];

  const level = (total: number) => {
    if (total === 0) return 0;
    if (total <= cuts[0]) return 1;
    if (total <= cuts[1]) return 2;
    if (total <= cuts[2]) return 3;
    return 4;
  };

  const shade = (l: number) =>
    l === 0
      ? "var(--surface-2)"
      : `color-mix(in srgb, var(--accent) ${[0, 22, 45, 70, 100][l]}%, var(--surface-2))`;

  // Columns are weeks starting on Sunday, so the first one is padded out to
  // keep every row on the same weekday all the way across.
  const weeks: (typeof days)[] = [];
  let week: typeof days = [];
  const firstWeekday = new Date(days[0].day).getUTCDay();
  for (let i = 0; i < firstWeekday; i++) week.push({ day: `pad-${i}`, total: -1, byKind: {} });

  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push(week);

  // A label above the column where each month starts, which is where the eye
  // looks for it — not evenly spaced, because months are not evenly long.
  const monthLabels = weeks.map((w, i) => {
    const first = w.find((d) => d.total >= 0);
    if (!first) return null;
    const date = new Date(first.day);
    if (date.getUTCDate() > 7) return null;
    const previous = weeks[i - 1]?.find((d) => d.total >= 0);
    if (previous && new Date(previous.day).getUTCMonth() === date.getUTCMonth()) return null;
    return date.toLocaleDateString(undefined, { month: "short" });
  });

  return (
    <div>
      {/*
        Scrolls sideways on a phone rather than shrinking the squares to
        invisibility. A year does not fit in 390 pixels and pretending it does
        produces a grey smear.
      */}
      <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
        <div className="inline-block min-w-max">
          <div className="mb-1 flex gap-[3px] pl-7 text-[10px] text-[var(--fg-subtle)]">
            {monthLabels.map((label, i) => (
              <span key={i} className="w-[11px] shrink-0">
                {label}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            <div className="flex w-6 shrink-0 flex-col gap-[3px] text-[10px] text-[var(--fg-subtle)]">
              {["", "Mon", "", "Wed", "", "Fri", ""].map((label, i) => (
                <span key={i} className="h-[11px] leading-[11px]">
                  {label}
                </span>
              ))}
            </div>

            {weeks.map((column, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {column.map((day) =>
                  day.total < 0 ? (
                    <span key={day.day} className="h-[11px] w-[11px]" />
                  ) : (
                    <span
                      key={day.day}
                      className="h-[11px] w-[11px] rounded-[2px]"
                      style={{ background: shade(level(day.total)) }}
                      // The whole legend for one square: what day, how much, and
                      // of what. A heatmap without this is a mood ring.
                      title={`${new Date(day.day).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })} — ${
                        day.total === 0
                          ? "nothing"
                          : Object.entries(day.byKind)
                              .map(([kind, n]) => `${n} ${KIND_LABELS[kind as Kind].toLowerCase()}`)
                              .join(", ")
                      }`}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--fg-subtle)]">
        <span>{activity.total.toLocaleString()} things done in the last year</span>
        <span className="ml-auto flex items-center gap-1">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className="h-[11px] w-[11px] rounded-[2px]"
              style={{ background: shade(l) }}
              aria-hidden
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
