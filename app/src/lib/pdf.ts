import { extractText, getDocumentProxy } from "unpdf";

/**
 * PDF text extraction.
 *
 * The text layer is what makes a fetched paper useful rather than decorative:
 * it is what the reader renders, what selections anchor into, and what the
 * Citations API is given when proposing Evidence Cards. Without it a PDF is
 * just a file the researcher has to read somewhere else.
 */

export type ExtractedPdf = {
  text: string;
  pageCount: number;
};

/** A PDF starts with %PDF-. Checked before parsing, since a paywall or a login
 *  page returns HTML with a 200 and would otherwise be stored as a paper. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

/**
 * Extract the text layer.
 *
 * Consumes the buffer it is given: pdf.js transfers it, leaving the caller's
 * array detached. Pass a copy if the bytes are needed afterwards.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdf> {
  const pdf = await getDocumentProxy(bytes);
  // `mergePages` narrows the return to a string, but keep the array case
  // handled: the option is the only thing standing between the two shapes.
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const merged: string = Array.isArray(text) ? (text as string[]).join("\n\n") : text;

  return { text: tidy(merged), pageCount: totalPages };
}

/**
 * Clean up the artefacts of two-column academic PDFs.
 *
 * Extraction gives back the text in reading order but with the line breaks of
 * the layout, so words are hyphenated across lines and sentences are broken
 * mid-clause. Left alone, that wrecks both readability and the character
 * offsets that Evidence Cards anchor into.
 */
function tidy(raw: string): string {
  return (
    raw
      // A hyphen at a line end is layout, not spelling: "cog-\nnition".
      .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
      // A single newline mid-sentence is a wrapped line; a blank line is a
      // real paragraph break and is kept.
      .replace(/([^\n.!?:;])\n(?!\n)\s*/g, "$1 ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      // Ligatures, which appear literally in a lot of extracted text.
      .replace(/ﬁ/g, "fi")
      .replace(/ﬂ/g, "fl")
      .replace(/ﬀ/g, "ff")
      .trim()
  );
}
