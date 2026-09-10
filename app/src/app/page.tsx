import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * The root.
 *
 * RisoRead is one thing, so the root is not a dashboard about it — it is the
 * shelf. Signed out, it is the landing page instead, which lives at its own URL
 * so it can be linked from a post without depending on what the root happens to
 * do for whoever opens it.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? "/books" : "/welcome");
}
