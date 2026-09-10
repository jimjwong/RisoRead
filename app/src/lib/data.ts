import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Org } from "@/lib/types";

export async function getCurrentUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The caller's labs.
 *
 * RLS scopes this, so no org filter is needed here — and the same membership
 * rows decide it in RisoDesk, which is what makes one account see one shelf in
 * both applications.
 */
export async function getMyOrgs(): Promise<Org[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, orgs(id, name, slug)")
    .order("created_at");

  if (error) throw error;

  // PostgREST returns the embedded relation as an array or a single object
  // depending on how it infers the relationship — normalise both shapes.
  return (data ?? []).flatMap((m) => {
    const orgs = (m as unknown as { orgs: Org | Org[] | null }).orgs;
    if (!orgs) return [];
    return Array.isArray(orgs) ? orgs : [orgs];
  });
}
