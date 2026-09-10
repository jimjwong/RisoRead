import { PLANS, type Limits, type PlanId } from "./plans";


/**
 * Whether one more of something fits.
 *
 * Pure, and in its own file, because the module that reads a lab's usage has to
 * import next/headers to find the session — which makes it unloadable outside a
 * request, and these are the rules most worth checking without one.
 */

export type Entitlement = {
  plan: PlanId;
  limits: Limits;
  suspended?: boolean;
  suspendedReason?: string | null;
  usage: {
    sources: number;
    projects: number;
    books: number;
    storageBytes: number;
    members: number;
  };
};

export class LimitReached extends Error {
  readonly plan: PlanId;
  readonly what: keyof Limits;

  constructor(message: string, plan: PlanId, what: keyof Limits) {
    super(message);
    this.plan = plan;
    this.what = what;
  }
}

/**
 * Refuse a write that would take a lab past its plan.
 *
 * The message names the number and the plan, because "limit reached" with no
 * figures leaves someone unable to tell whether they are one over or a hundred,
 * and unable to decide whether upgrading would help.
 */
/** Refuse a write into a suspended lab, before any limit is even consulted. */
export function assertNotSuspended(entitlement: Entitlement): void {
  if (!entitlement.suspended) return;
  throw new LimitReached(
    entitlement.suspendedReason
      ? `This lab is suspended: ${entitlement.suspendedReason}. Your work is untouched and still exports.`
      : "This lab is suspended. Your work is untouched and still exports.",
    entitlement.plan,
    "sources",
  );
}

export function assertWithin(
  entitlement: Entitlement,
  what: "sources" | "projects" | "books" | "members",
  adding = 1,
): void {
  const limit = entitlement.limits[what];
  const used = entitlement.usage[what];
  if (used + adding <= limit) return;

  const noun = { sources: "papers", projects: "projects", books: "books", members: "people" }[what];
  throw new LimitReached(
    `The ${PLANS[entitlement.plan].name} plan holds ${limit.toLocaleString()} ${noun}, and this lab has ${used.toLocaleString()}.`,
    entitlement.plan,
    what,
  );
}

export function assertStorage(entitlement: Entitlement, addingBytes: number): void {
  const { storageBytes: limit } = entitlement.limits;
  const used = entitlement.usage.storageBytes;
  if (used + addingBytes <= limit) return;

  const gb = (n: number) => `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  throw new LimitReached(
    `That would put this lab at ${gb(used + addingBytes)}, over the ${gb(limit)} the ${PLANS[entitlement.plan].name} plan includes.`,
    entitlement.plan,
    "storageBytes",
  );
}
