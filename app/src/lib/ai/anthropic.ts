import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5";

/**
 * Refusal fallback. Claude Opus 5's safety classifiers can decline a request
 * (HTTP 200, `stop_reason: "refusal"`) — benign life-sciences and security
 * papers occasionally trip them, which is exactly our corpus. `"default"`
 * routes by refusal category so we never maintain a model list.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic();
  }
  return client;
}

export class RefusalError extends Error {
  // Declared and assigned rather than written as a constructor parameter
  // property. That shorthand is TypeScript-only syntax that Node's type
  // stripping refuses outright, which meant no script could import anything
  // that reached this file — so none of the AI modules could be exercised
  // outside the Next build.
  readonly category: string | null;

  constructor(category: string | null) {
    super(
      `The model declined this request${category ? ` (${category})` : ""}. ` +
        `This can happen with security or life-sciences material.`,
    );
    this.name = "RefusalError";
    this.category = category;
  }
}

/** Throw on a refusal rather than letting empty content flow downstream. */
export function assertNotRefused(response: {
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
}) {
  if (response.stop_reason === "refusal") {
    throw new RefusalError(response.stop_details?.category ?? null);
  }
}
