import { getAnthropic, MODEL, FALLBACK_BETA, assertNotRefused } from "@/lib/ai/anthropic";

/**
 * Proposing tags for a book.
 *
 * A shelf is only searchable by tag if the tags agree with each other, and
 * that is the hard part rather than the naming. Left to itself a model will
 * offer "machine learning" for one book, "Machine Learning" for the next and
 * "ML" for a third, and the shelf ends up with three tags where it needs one.
 * So the tags already in use are passed in and reuse is the instruction, not a
 * preference — a new tag has to earn its place.
 *
 * Nothing here is applied silently. Suggestions are stored apart from
 * confirmed tags and shown as suggestions, because a tag nobody has looked at
 * is a guess, and a guess displayed identically to a considered answer becomes
 * a fact by accident.
 */

export type TagSuggestion = {
  tags: string[];
  /** Tags the model reused from the shelf rather than inventing. */
  reused: string[];
};

const SYSTEM = `You tag books for a university research group's shelf, so a researcher can find them again.

You will be given a book's title, authors, description and any subjects its publisher recorded, plus an extract of its opening text and the tags already used on this shelf.

- Give three to six tags. Fewer is better than padding: a tag that applies to every book on a research shelf, like "research" or "academic", is noise.
- Reuse an existing tag whenever it fits, exactly as it is written. This matters more than precision — a shelf with "machine learning" and "Machine Learning" and "ML" cannot be browsed. Only invent a tag when nothing on the list comes close.
- Write new tags in lower case, as a short noun phrase, singular where it reads naturally: "survey methods", "organisational change", "bayesian statistics".
- Tag what the book is about and what it would be reached for. Method, field, and the population or setting where the book has one. Not its format, not its publisher, not its age.
- The publisher's subjects are a hint, not an answer. They are often far broader than a shelf needs.
- If the extract is unreadable or says nothing about the subject, return fewer tags rather than guessing from the title alone.`;

const TOOL = {
  name: "record_tags",
  description: "Record the tags for this book.",
  input_schema: {
    type: "object" as const,
    properties: {
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Three to six tags, reusing existing ones where they fit.",
      },
    },
    required: ["tags"],
  },
};

/** Enough of the opening to tell what a book is about, without paying for it all. */
const EXTRACT_CHARS = 4000;
const MAX_TAGS = 6;

/**
 * Tags that say nothing.
 *
 * Told to return fewer tags rather than guess, the model sometimes returns
 * "unclassified" instead of returning none — which is honest in spirit and
 * useless in practice: it is a tag that matches a set of books with nothing in
 * common, so filtering by it finds exactly the books nobody could describe.
 * Format words go too. That a thing is a book is not a fact about the book.
 */
const EMPTY_TAGS = new Set([
  "unclassified",
  "uncategorized",
  "uncategorised",
  "unknown",
  "general",
  "miscellaneous",
  "misc",
  "other",
  "none",
  "n/a",
  "book",
  "ebook",
  "e-book",
  "pdf",
  "epub",
  "document",
  "publication",
  "text",
]);

export async function suggestTags(input: {
  title: string;
  authors: string[];
  description: string | null;
  subjects: string[];
  text: string;
  existingTags: string[];
}): Promise<{ suggestion: TagSuggestion; usage: { input: number; output: number } }> {
  const anthropic = getAnthropic();

  const extract = input.text.slice(0, EXTRACT_CHARS).trim();

  const parts = [
    `Title: ${input.title}`,
    input.authors.length > 0 ? `Authors: ${input.authors.join(", ")}` : null,
    input.description ? `Publisher's description: ${input.description.slice(0, 1200)}` : null,
    input.subjects.length > 0 ? `Publisher's subjects: ${input.subjects.join("; ")}` : null,
    input.existingTags.length > 0
      ? `Tags already on this shelf, reuse these where they fit:\n${input.existingTags.join("\n")}`
      : "This shelf has no tags yet, so every tag will be a new one.",
    extract.length > 60 ? `\nOpening text:\n${extract}` : null,
  ].filter(Boolean);

  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 1500,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "record_tags" },
    messages: [{ role: "user", content: parts.join("\n") }],
  } as never);

  assertNotRefused(response as never);

  const call = response.content.find(
    (b) => b.type === "tool_use" && b.name === "record_tags",
  ) as { input?: { tags?: unknown[] } } | undefined;

  // Existing tags are matched case-insensitively and returned in the shelf's
  // own spelling, so a model answering "Machine Learning" still lands on the
  // "machine learning" already in use rather than creating its neighbour.
  const canonical = new Map(input.existingTags.map((t) => [t.toLowerCase(), t]));

  const seen = new Set<string>();
  const tags: string[] = [];
  const reused: string[] = [];

  for (const raw of call?.input?.tags ?? []) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (trimmed.length < 2 || trimmed.length > 40) continue;
    if (EMPTY_TAGS.has(trimmed.toLowerCase())) continue;

    const existing = canonical.get(trimmed.toLowerCase());
    const tag = existing ?? trimmed.toLowerCase();

    if (seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
    if (existing) reused.push(existing);

    if (tags.length >= MAX_TAGS) break;
  }

  return {
    suggestion: { tags, reused },
    usage: {
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
    },
  };
}
