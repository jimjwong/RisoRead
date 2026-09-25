import { setReadingPref } from "@/app/books/actions";
import {
  TEXT_SIZES,
  LEADING,
  MEASURE,
  FACES,
  TINTS,
  ZOOMS,
  type ReadingPrefs,
} from "@/lib/books/reading-prefs";

/**
 * The reading controls.
 *
 * A form per option rather than a select and a submit. Adjusting text size is
 * something people do repeatedly while looking at the result, and a two-step
 * control makes that a chore. Each button is one tap and one round trip, and
 * every one of them works with no client JavaScript because it is a form.
 *
 * Which controls appear depends on the format, and that is not tidiness: line
 * spacing means nothing to a page of a PDF, which is an image of a page
 * somebody else already set. Offering it would be offering a control that does
 * nothing.
 */
export function ReaderComfort({
  prefs,
  isPdf,
  returnTo,
  /** Laid out in a column in the reader's tray, in a row on a settings page. */
  compact = false,
}: {
  prefs: ReadingPrefs;
  isPdf: boolean;
  returnTo: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-3" : "flex flex-wrap items-start gap-x-6 gap-y-4"}>
      {isPdf ? (
        <>
          <Group label="Page">
            {(["width", "page"] as const).map((fit) => (
              <Choice
                key={fit}
                name="fit"
                value={fit}
                current={prefs.fit}
                returnTo={returnTo}
                label={fit === "width" ? "Fit width" : "Fit page"}
              />
            ))}
          </Group>

          <Group label="Zoom">
            {ZOOMS.map((zoom) => (
              <Choice
                key={zoom}
                name="zoom"
                value={String(zoom)}
                current={String(prefs.zoom)}
                returnTo={returnTo}
                label={zoom === 100 ? "Fit" : `${zoom}%`}
              />
            ))}
          </Group>
        </>
      ) : (
        <>
          <Group label="Pages">
            <Choice
              name="layout"
              value="single"
              current={prefs.layout}
              returnTo={returnTo}
              label="1 page"
              title="Single page with vertical scrolling"
            />
            <Choice
              name="layout"
              value="spread"
              current={prefs.layout}
              returnTo={returnTo}
              label="2 pages"
              title="Two-page spread on wide screens"
            />
          </Group>

          <Group label="Text">
            {TEXT_SIZES.map((t) => (
              <Choice
                key={t.step}
                name="size"
                value={String(t.step)}
                current={String(prefs.size)}
                returnTo={returnTo}
                label="A"
                title={t.label}
                // The button is the size it sets, which is quicker to read than
                // five identical buttons numbered one to five.
                style={{ fontSize: `calc(${t.rem} * 0.72)` }}
              />
            ))}
          </Group>

          <Group label="Spacing">
            {LEADING.map((l) => (
              <Choice
                key={l.step}
                name="leading"
                value={String(l.step)}
                current={String(prefs.leading)}
                returnTo={returnTo}
                label={l.label}
              />
            ))}
          </Group>

          <Group label="Width">
            {MEASURE.map((m) => (
              <Choice
                key={m.step}
                name="measure"
                value={String(m.step)}
                current={String(prefs.measure)}
                returnTo={returnTo}
                label={m.label}
              />
            ))}
          </Group>

          <Group label="Typeface">
            {(Object.keys(FACES) as (keyof typeof FACES)[]).map((face) => (
              <Choice
                key={face}
                name="face"
                value={face}
                current={prefs.face}
                returnTo={returnTo}
                label={FACES[face].label}
                style={{ fontFamily: FACES[face].stack }}
              />
            ))}
          </Group>
        </>
      )}

      {/*
        Offered for both formats. A bright white page in a dark room is the
        commonest reason somebody stops reading on a screen, and that is as true
        of a scanned page as of a chapter of text.
      */}
      <Group label="Page colour">
        {(Object.keys(TINTS) as (keyof typeof TINTS)[]).map((tint) => (
          <Choice
            key={tint}
            name="tint"
            value={tint}
            current={prefs.tint}
            returnTo={returnTo}
            label={TINTS[tint].label}
            style={
              TINTS[tint].bg
                ? { background: TINTS[tint].bg, color: TINTS[tint].fg }
                : undefined
            }
          />
        ))}
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-[var(--fg-subtle)]">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Choice({
  name,
  value,
  current,
  returnTo,
  label,
  title,
  style,
}: {
  name: string;
  value: string;
  current: string;
  returnTo: string;
  label: string;
  title?: string;
  style?: React.CSSProperties;
}) {
  const active = current === value;
  return (
    <form action={setReadingPref}>
      <input type="hidden" name={name} value={value} />
      <input type="hidden" name="return_to" value={returnTo} />
      <button
        type="submit"
        aria-pressed={active}
        title={title ?? label}
        // 32px square minimum: these sit in a tray at the bottom of a phone
        // screen and get pressed with a thumb.
        className={`min-h-8 min-w-8 rounded-md border px-2 text-[11px] whitespace-nowrap ${
          active
            ? "border-transparent bg-[var(--accent)] text-[var(--accent-fg)]"
            : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
        }`}
        style={active ? undefined : style}
      >
        {label}
      </button>
    </form>
  );
}
