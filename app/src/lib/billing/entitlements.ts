import { getSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePlan, limitsFromRow, type PlanLimitsRow } from "./plans";
import type { Entitlement } from "./limits";

/**
 * Whether a lab may do one more of something.
 *
 * Checked against the database at the moment of the write rather than against a
 * number carried in a session. A counter in a cookie is a counter the person
 * holding it can edit, and a count cached at sign-in is wrong by the time two
 * people in the same lab are uploading at once.
 */

export type { Entitlement } from "./limits";

export async function entitlementFor(orgId: string): Promise<Entitlement> {
  const supabase = await getSupabaseServerClient();

  const { data: org } = await supabase
    .from("orgs")
    .select("plan, plan_expires_at, suspended_at, suspended_reason")
    .eq("id", orgId)
    .maybeSingle();

  // A lab that cannot be read is a lab the caller is not in, and the safe
  // answer to "what may they do" in that case is "what a free lab may do".
  const row = org ?? { plan: "free", plan_expires_at: null };
  const planId = effectivePlan(row);

  const counts = await Promise.all([
    supabase.from("sources").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("books").select("size_bytes").eq("org_id", orgId),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.rpc("plan_limits_public"),
  ]);

  const stored = (counts[3].data ?? []).reduce(
    (sum: number, b: { size_bytes: number | null }) => sum + (b.size_bytes ?? 0),
    0,
  );
  const limitRows = (counts[5].data ?? []) as PlanLimitsRow[];
  const limitRow = limitRows.find((r) => r.plan === planId);

  return {
    plan: planId,
    limits: limitsFromRow(limitRow),
    /*
      Suspension stops new work; it does not hide old work. Somebody who has
      not paid still owns what they wrote, and an account that cannot read its
      own data is an account that cannot export it — which the terms page
      promises it can, on every plan, including after one lapses.
    */
    suspended: Boolean((row as { suspended_at?: string | null }).suspended_at),
    suspendedReason:
      ((row as { suspended_reason?: string | null }).suspended_reason ?? null) || null,
    usage: {
      sources: counts[0].count ?? 0,
      projects: counts[1].count ?? 0,
      books: counts[2].count ?? 0,
      storageBytes: stored,
      members: counts[4].count ?? 0,
    },
  };
}

export { LimitReached, assertWithin, assertStorage, assertNotSuspended } from "./limits";
