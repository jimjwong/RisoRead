/**
 * What each plan is, in one place.
 *
 * Prices live here as cents rather than dollars, because a price is money and
 * money is not a float. What was actually charged is copied onto the lab at the
 * time of sale, so editing this file reprices what is on offer and never
 * reprices somebody who already bought.
 */

export type PlanId = "free" | "pro" | "lifetime";
export type Period = "monthly" | "annual" | "lifetime";

export type Limits = {
  /** Papers in the library. */
  sources: number;
  projects: number;
  books: number;
  /** Total bytes of uploaded files. */
  storageBytes: number;
  /** AI calls a month: tagging, extraction, drafting. */
  aiPerMonth: number;
  members: number;
};

export const UNLIMITED = Number.POSITIVE_INFINITY;

const GB = 1024 * 1024 * 1024;

export type Plan = {
  id: PlanId;
  name: string;
  blurb: string;
  /** What this plan can do that the one below cannot. */
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    blurb: "For one review, start to finish. Not a trial — it does not expire.",
    features: [
      "The whole arc: question, screening, evidence, manuscript",
      "100 papers, 2 projects, 10 books",
      "2 GB of uploads",
      "Citation graph and search",
      "Everything exports — nothing is held hostage",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    blurb: "For a lab that runs more than one review at a time.",
    features: [
      "Unlimited papers, projects and books",
      "200 GB of uploads",
      "Up to 25 people in the lab",
      "2,000 AI actions a month",
      "Zotero sync",
      "Priority support from a person",
    ],
  },
  lifetime: {
    id: "lifetime",
    name: "Lifetime",
    blurb: "Pro, bought once. No renewal, no price rise, no expiry.",
    features: [
      "Everything in Pro, permanently",
      "One payment, no renewal",
      "Every feature added later, included",
      "Transferable within your institution",
    ],
  },
};

/** Prices in cents. */
export const PRICES = {
  monthly: 1800,
  annual: 18000,
  lifetime: 28800,
  /** The launch price, for people who joined the waitlist before opening. */
  lifetimeLaunch: 8800,
} as const;

export function money(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** Two months free, stated as the saving rather than left to be worked out. */
export const ANNUAL_SAVING = PRICES.monthly * 12 - PRICES.annual;

export function bytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes)) return "Unlimited";
  if (bytes >= GB) return `${Math.round(bytes / GB)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function limitLabel(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "Unlimited";
}

/**
 * The plan a lab is actually on right now.
 *
 * An expired paid plan is a free plan. Read from the row every time rather than
 * cached anywhere: a subscription that lapsed at midnight should not still be
 * letting somebody upload at nine because a cache had not turned over.
 */
export function effectivePlan(org: {
  plan?: string | null;
  plan_expires_at?: string | null;
}): PlanId {
  const id = (org.plan ?? "free") as PlanId;
  if (id === "free" || id === "lifetime") return id;

  if (org.plan_expires_at && new Date(org.plan_expires_at).getTime() < Date.now()) {
    return "free";
  }
  return id;
}

export type PlanLimitsRow = {
  plan: PlanId;
  sources_limit: number | null;
  projects_limit: number | null;
  books_limit: number | null;
  storage_bytes_limit: number | null;
  ai_per_month_limit: number | null;
  members_limit: number | null;
};

/**
 * A plan_limits row, with null turned into the Infinity every other function
 * in this file already expects.
 *
 * Falls back to zero on every field rather than defaulting to unlimited: the
 * safe answer when the plan table cannot be read is "none of it", not "all
 * of it". The row itself is seeded by migration and never deletable, so this
 * only matters if that migration has not run.
 */
export function limitsFromRow(row: PlanLimitsRow | undefined): Limits {
  if (!row) {
    return { sources: 0, projects: 0, books: 0, storageBytes: 0, aiPerMonth: 0, members: 0 };
  }
  return {
    sources: row.sources_limit ?? UNLIMITED,
    projects: row.projects_limit ?? UNLIMITED,
    books: row.books_limit ?? UNLIMITED,
    storageBytes: row.storage_bytes_limit ?? UNLIMITED,
    aiPerMonth: row.ai_per_month_limit ?? UNLIMITED,
    members: row.members_limit ?? UNLIMITED,
  };
}
