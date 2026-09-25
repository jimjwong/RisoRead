import { cookies } from "next/headers";

/**
 * How a reader likes to read.
 *
 * Kept in cookies rather than a table because these belong to the device, not
 * to the account: the text size that suits a phone held at arm's length is not
 * the one that suits a desktop monitor, and the same person uses both. It also
 * means the server renders at the right size on the first paint, so nothing
 * reflows once a script arrives — which is the whole reason the reader is
 * server-rendered to begin with.
 *
 * Declared as a table rather than as seven near-identical functions. Every
 * preference is the same shape — a cookie name, a set of allowed values, a
 * default — and reading, validating and writing them are one function each
 * rather than seven. A cookie is user input and ends up in a style attribute,
 * so a value that is not in the list is replaced by the default rather than
 * being trusted or escaped.
 */

export const TEXT_SIZES = [
  { step: 1, rem: "0.9375rem", label: "Smallest" },
  { step: 2, rem: "1rem", label: "Small" },
  { step: 3, rem: "1.0625rem", label: "Default" },
  { step: 4, rem: "1.1875rem", label: "Large" },
  { step: 5, rem: "1.375rem", label: "Largest" },
] as const;

/** Line spacing. The setting people reach for after text size, and rarely find. */
export const LEADING = [
  { step: 1, value: "1.45", label: "Tight" },
  { step: 2, value: "1.75", label: "Normal" },
  { step: 3, value: "2.1", label: "Loose" },
] as const;

/**
 * How many characters to a line.
 *
 * In em, so it follows the text size: a line holds about the same number of
 * words at every setting. Fixed in rem, the largest size became four words a
 * line on a phone.
 */
export const MEASURE = [
  { step: 1, value: "26em", label: "Narrow" },
  { step: 2, value: "34em", label: "Normal" },
  { step: 3, value: "46em", label: "Wide" },
] as const;

export const FACES = {
  serif: { label: "Serif", stack: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  sans: { label: "Sans", stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
} as const;

/**
 * The colour of the page.
 *
 * Sepia and night are not decoration: a bright white page in a dark room is
 * the commonest reason somebody stops reading on a screen, and every e-reader
 * has had these for fifteen years.
 */
export const TINTS = {
  paper: { label: "Paper", bg: "", fg: "", muted: "" },
  sepia: { label: "Sepia", bg: "#f4ecd8", fg: "#4a3b2a", muted: "#7a6a54" },
  night: { label: "Night", bg: "#12141a", fg: "#c9ced6", muted: "#8d95a3" },
} as const;

export const ZOOMS = [100, 125, 150, 200, 300] as const;

export type Fit = "width" | "page";
export type Face = keyof typeof FACES;
export type Tint = keyof typeof TINTS;
export type PageLayout = "single" | "spread";

export type ReadingPrefs = {
  /** 1..5, an index into TEXT_SIZES. */
  size: number;
  leading: number;
  measure: number;
  face: Face;
  tint: Tint;
  /** Continuous single-column reading, or a paginated two-page desktop spread. */
  layout: PageLayout;
  /**
   * How a PDF page is sized. "width" fills the column and scrolls, which is
   * what makes a textbook legible on a phone; "page" fits a whole page on
   * screen, which is what makes a picture book worth looking at. Neither is
   * right for both, so it is a choice rather than a default.
   */
  fit: Fit;
  /** A multiplier on whichever fit is in force. 100 means "as fitted". */
  zoom: number;
};

type Spec = {
  cookie: string;
  values: readonly (string | number)[];
  fallback: string | number;
  numeric?: boolean;
};

/** The cookie names are load-bearing: changing one resets everybody's settings. */
const SPECS: Record<keyof ReadingPrefs, Spec> = {
  size: { cookie: "riso_size", values: TEXT_SIZES.map((t) => t.step), fallback: 3, numeric: true },
  leading: { cookie: "riso_leading", values: LEADING.map((l) => l.step), fallback: 2, numeric: true },
  measure: { cookie: "riso_measure", values: MEASURE.map((m) => m.step), fallback: 2, numeric: true },
  face: { cookie: "riso_face", values: Object.keys(FACES), fallback: "serif" },
  tint: { cookie: "riso_tint", values: Object.keys(TINTS), fallback: "paper" },
  layout: { cookie: "riso_layout", values: ["single", "spread"], fallback: "single" },
  fit: { cookie: "riso_fit", values: ["width", "page"], fallback: "width" },
  zoom: { cookie: "riso_zoom", values: ZOOMS, fallback: 100, numeric: true },
};

export const PREF_NAMES = Object.keys(SPECS) as (keyof ReadingPrefs)[];

export const DEFAULT_PREFS: ReadingPrefs = {
  size: 3,
  leading: 2,
  measure: 2,
  face: "serif",
  tint: "paper",
  layout: "single",
  fit: "width",
  zoom: 100,
};

/** Whether a value is one this preference actually allows. */
export function validPref(name: keyof ReadingPrefs, raw: string): boolean {
  const spec = SPECS[name];
  const value: string | number = spec.numeric ? Number(raw) : raw;
  if (spec.numeric && !Number.isFinite(value as number)) return false;
  return (spec.values as readonly (string | number)[]).includes(value);
}

export function cookieFor(name: keyof ReadingPrefs): string {
  return SPECS[name].cookie;
}

export async function readingPrefs(): Promise<ReadingPrefs> {
  const jar = await cookies();

  const read = (name: keyof ReadingPrefs) => {
    const spec = SPECS[name];
    const raw = jar.get(spec.cookie)?.value;
    if (raw !== undefined && validPref(name, raw)) {
      return spec.numeric ? Number(raw) : raw;
    }
    return spec.fallback;
  };

  return {
    size: read("size") as number,
    leading: read("leading") as number,
    measure: read("measure") as number,
    face: read("face") as Face,
    tint: read("tint") as Tint,
    layout: read("layout") as PageLayout,
    fit: read("fit") as Fit,
    zoom: read("zoom") as number,
  };
}

/** The CSS length for a step, clamped rather than trusted. */
export function textSizeRem(size: number): string {
  return (TEXT_SIZES.find((t) => t.step === size) ?? TEXT_SIZES[2]).rem;
}

export function leadingValue(step: number): string {
  return (LEADING.find((l) => l.step === step) ?? LEADING[1]).value;
}

export function measureValue(step: number): string {
  return (MEASURE.find((m) => m.step === step) ?? MEASURE[1]).value;
}

/**
 * Everything the reading surface needs, as custom properties.
 *
 * One object rather than a scattering of inline styles, so the page and the
 * chapter cannot end up disagreeing about which tint is in force.
 */
export function readingVars(prefs: ReadingPrefs): Record<string, string> {
  const tint = TINTS[prefs.tint] ?? TINTS.paper;
  return {
    "--reading-size": textSizeRem(prefs.size),
    "--reading-leading": leadingValue(prefs.leading),
    "--reading-measure": measureValue(prefs.measure),
    "--reading-face": FACES[prefs.face]?.stack ?? FACES.serif.stack,
    // Empty for "paper", which leaves the application's own colours in place
    // rather than pinning the reader to a light theme of its own.
    ...(tint.bg ? { "--reading-bg": tint.bg, "--reading-fg": tint.fg, "--reading-muted": tint.muted } : {}),
  };
}

/** Kept for the two places that only care about the old pair. */
export const SIZE_COOKIE = SPECS.size.cookie;
export const FIT_COOKIE = SPECS.fit.cookie;
