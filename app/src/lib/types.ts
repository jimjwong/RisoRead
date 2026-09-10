/**
 * The shapes RisoRead shares with RisoDesk.
 *
 * Both applications read the same Postgres database, so these mirror the
 * columns rather than describing anything RisoRead invented. Only the parts a
 * reader touches are declared here: the rest of the schema — projects,
 * evidence cards, manuscripts — belongs to RisoDesk and is never queried from
 * this app.
 */

export type OrgRole = "owner" | "admin" | "member" | "student" | "guest";

/** A lab. The tenant every row of content is scoped to, in both apps. */
export type Org = { id: string; name: string; slug: string };

export type Author = { name: string; orcid?: string; affiliation?: string };

/**
 * Best-effort surname for one author.
 *
 * `books.authors` is jsonb with no schema, filled by the EPUB's own metadata,
 * by a PDF's document properties, and by hand. Ingestion normalises to
 * `{ name }`, but nothing in the database enforces that, and a single row that
 * slipped through in another shape used to throw inside a `.map()` and take
 * down the entire shelf — every book unreachable because of one bad author
 * list. So this reads what it can and never throws.
 *
 * `family`/`given` is understood rather than merely survived: it is the shape
 * most likely to arrive unnormalised.
 */
function surnameOf(author: unknown): string | null {
  const lastWord = (full: string) => full.trim().split(/\s+/).slice(-1)[0];

  if (typeof author === "string") {
    return author.trim() ? lastWord(author) : null;
  }
  if (!author || typeof author !== "object") return null;

  const a = author as { name?: unknown; family?: unknown; literal?: unknown };

  // Already a surname; taking its last word would break "van Dijk".
  if (typeof a.family === "string" && a.family.trim()) return a.family.trim();

  const full = [a.name, a.literal].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  return full ? lastWord(full) : null;
}

/**
 * Authors as one name per line, for editing.
 *
 * The stored shape is a list of objects, which nobody should have to type. A
 * line per author survives a round trip: parse(format(x)) is x for anything a
 * person would actually enter. Semicolons also separate, since that is how
 * most exports write a list.
 *
 * BibTeX's " and " separator is deliberately not honoured. It cannot be told
 * apart from a name containing the word: "Institute for Peace and Conflict
 * Research" is one author, and splitting it produced two publishers that do
 * not exist.
 */
export function formatAuthorLines(authors: Author[] | null | undefined): string {
  if (!Array.isArray(authors)) return "";
  return authors
    .map((a) => (a && typeof a === "object" ? a.name : String(a ?? "")))
    .filter((n) => typeof n === "string" && n.trim().length > 0)
    .join("\n");
}

export function parseAuthorLines(input: string): Author[] {
  return input
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((name) => ({ name }));
}

export function formatAuthors(authors: Author[] | null | undefined): string {
  if (!Array.isArray(authors)) return "Unknown";

  const names = authors.map(surnameOf).filter((n): n is string => n !== null);

  if (names.length === 0) return "Unknown";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} et al.`;
}
