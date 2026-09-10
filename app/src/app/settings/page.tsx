import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getMyOrgs } from "@/lib/data";
import { Button, Card, Input, Shell } from "@/components/ui";
import { ReaderComfort } from "@/components/reader-controls";
import { readingPrefs } from "@/lib/books/reading-prefs";
import { usageFor } from "@/lib/stats/usage";
import { activityYear } from "@/lib/stats/activity";
import { PLANS, bytesLabel, limitLabel, limitsFromRow, type PlanLimitsRow } from "@/lib/billing/plans";
import {
  updateProfile,
  changeEmail,
  changePassword,
  signOutEverywhere,
  deleteAccount,
} from "./actions";
import { UsagePanels } from "./usage-panels";

export const dynamic = "force-dynamic";

const TABS = ["account", "reading", "usage", "data"] as const;
type Tab = (typeof TABS)[number];

const NOTICES: Record<string, string> = {
  profile: "Saved.",
  email: "Check the new address — the change takes effect when you follow the link in it.",
  password: "Password changed. Other sessions were not signed out; there is a control for that below.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "account";

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, orgs, prefs, { data: limitRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, orcid, affiliation, created_at").eq("id", user.id).maybeSingle(),
    getMyOrgs(),
    readingPrefs(),
    supabase.rpc("plan_limits_public"),
  ]);

  const freeLimits = limitsFromRow(
    ((limitRows ?? []) as PlanLimitsRow[]).find((r) => r.plan === "free"),
  );

  const lab = orgs[0];
  const usage = tab === "usage" && lab?.id ? await usageFor(lab.id as string, user.id) : null;
  const year = usage ? await activityYear(user.id) : null;

  return (
    <Shell breadcrumb="Settings">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          {user.email}
          {profile?.created_at && (
            <span className="text-[var(--fg-subtle)]">
              {" · "}here since{" "}
              {new Date(profile.created_at as string).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
        </p>
      </div>

      {sp.error && (
        <Card className="mb-4 p-3">
          <p role="status" className="text-sm" style={{ color: "var(--contradicts)" }}>
            {sp.error}
          </p>
        </Card>
      )}
      {sp.notice && NOTICES[sp.notice] && (
        <Card className="mb-4 p-3">
          <p role="status" className="text-sm" style={{ color: "var(--supports)" }}>
            {NOTICES[sp.notice]}
          </p>
        </Card>
      )}

      <nav className="mb-6 inline-flex flex-wrap rounded-md border p-0.5 text-xs">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/settings?tab=${t}`}
            aria-current={tab === t ? "true" : undefined}
            className={`rounded px-3 py-1.5 capitalize ${
              tab === t
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            {t}
          </Link>
        ))}
      </nav>

      {tab === "account" && (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <Card className="p-4">
            <h2 className="mb-1 text-sm font-medium">Who you are</h2>
            <p className="mb-4 text-xs text-[var(--fg-muted)]">
              Shown to the other people on your shelf. This is the same profile
              RisoDesk uses, so editing it here changes it there.
            </p>
            <form action={updateProfile} className="space-y-3">
              <div>
                <label htmlFor="full_name" className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]">
                  Name
                </label>
                <Input id="full_name" name="full_name" required defaultValue={profile?.full_name ?? ""} />
              </div>
              <div>
                <label htmlFor="affiliation" className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]">
                  Affiliation
                </label>
                <Input
                  id="affiliation"
                  name="affiliation"
                  defaultValue={profile?.affiliation ?? ""}
                  placeholder="Department, University"
                />
              </div>
              <div>
                <label htmlFor="orcid" className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]">
                  ORCID
                </label>
                <Input
                  id="orcid"
                  name="orcid"
                  defaultValue={profile?.orcid ?? ""}
                  placeholder="0000-0002-1825-0097"
                  className="font-mono text-sm"
                />
                <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">
                  Pasted with or without the orcid.org prefix — both are
                  understood, and it is stored the same way either way.
                </p>
              </div>
              <Button type="submit">Save</Button>
            </form>
          </Card>

          <div className="space-y-5">
            <Card className="p-4">
              <h2 className="mb-1 text-sm font-medium">Email</h2>
              <p className="mb-4 text-xs text-[var(--fg-muted)]">
                Currently <span className="font-mono">{user.email}</span>. Changing
                it sends a confirmation to the new address; nothing moves until
                you follow it.
              </p>
              <form action={changeEmail} className="space-y-3">
                <Input name="email" type="email" required placeholder="new@university.edu" />
                <Input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Your current password"
                />
                <Button type="submit" variant="ghost" className="text-xs">
                  Change email
                </Button>
              </form>
            </Card>

            <Card className="p-4">
              <h2 className="mb-1 text-sm font-medium">Password</h2>
              <p className="mb-4 text-xs text-[var(--fg-muted)]">
                Your current one is asked for as well — a session on an
                unattended laptop should not be enough to lock you out of your
                own account.
              </p>
              <form action={changePassword} className="space-y-3">
                <Input
                  name="current_password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Current password"
                />
                <Input
                  name="new_password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="New password, at least 8 characters"
                />
                <Input
                  name="confirm_password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="New password again"
                />
                <Button type="submit" variant="ghost" className="text-xs">
                  Change password
                </Button>
              </form>
            </Card>

            <Card className="p-4">
              <h2 className="mb-1 text-sm font-medium">Sessions</h2>
              <p className="mb-3 text-xs text-[var(--fg-muted)]">
                Signs out every device, including this one. The thing to press
                after losing a laptop.
              </p>
              <form action={signOutEverywhere}>
                <Button type="submit" variant="ghost" className="text-xs">
                  Sign out everywhere
                </Button>
              </form>
            </Card>
          </div>
        </div>
      )}

      {tab === "reading" && (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <Card className="p-4">
            <h2 className="mb-1 text-sm font-medium">Text size</h2>
            <p className="mb-4 text-xs text-[var(--fg-muted)]">
              For EPUBs in the reader.
            </p>
            <ReaderComfort prefs={prefs} isPdf={false} returnTo="/settings?tab=reading" />
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-sm font-medium">PDF pages</h2>
            <p className="mb-4 text-xs text-[var(--fg-muted)]">
              Fill the column and scroll, or fit a whole page on screen.
            </p>
            <ReaderComfort prefs={prefs} isPdf returnTo="/settings?tab=reading" />
          </Card>

          <Card className="p-4 lg:col-span-2">
            {/*
              Saying where these live matters: somebody who sets the text size on
              a phone and then finds a desktop unchanged should know that was
              the intent rather than a bug.
            */}
            <h2 className="mb-1 text-sm font-medium">Where these are kept</h2>
            <p className="text-xs text-[var(--fg-muted)]">
              On this device, not on your account. The size that suits a phone
              held at arm&rsquo;s length is not the one that suits a monitor, and
              the same person uses both. Clearing your browser&rsquo;s storage
              resets them to the defaults.
            </p>
          </Card>
        </div>
      )}

      {tab === "usage" && usage && year && <UsagePanels usage={usage} activity={year} />}
      {tab === "usage" && !usage && (
        <Card className="p-4">
          <p className="text-sm text-[var(--fg-muted)]">
            Nothing to count yet — this account is not in a lab.
          </p>
        </Card>
      )}

      {tab === "data" && (
        <div className="space-y-5">
          <Card className="p-4">
            <h2 className="mb-1 text-sm font-medium">Your plan</h2>
            <p className="mb-3 text-xs text-[var(--fg-muted)]">
              {lab ? `${lab.name} is on the ` : "This account is on the "}
              <strong>{PLANS[(usage?.entitlement.plan ?? "free") as "free"].name}</strong> plan.
              The plan covers the whole account, so a shelf that fits here fits
              in RisoDesk too, and one storage allowance is shared between them.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-sm font-medium">Taking your books with you</h2>
            <p className="mb-3 text-xs text-[var(--fg-muted)]">
              Every book on the shelf can be downloaded as the file you
              uploaded, byte for byte, from its own page. Nothing is re-encoded
              on the way in, so what comes back out is what went in.
            </p>
            <p className="text-xs text-[var(--fg-subtle)]">
              There is no single-button archive of the whole shelf yet. Each
              book downloads today; a bulk download is not built.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-sm font-medium">One account, two applications</h2>
            <p className="text-xs text-[var(--fg-muted)]">
              RisoRead and RisoDesk are the same account, the same shelf and the
              same files. A book added in either appears in both, and a page you
              stop on here is the page RisoDesk opens at. Closing your account
              below closes it in both.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-sm font-medium" style={{ color: "var(--contradicts)" }}>
              Close this account
            </h2>
            <p className="mb-1 text-xs text-[var(--fg-muted)]">
              Your profile and your sign-in go immediately. Labs where you are
              the only member are deleted with everything in them — books,
              bookmarks, reading positions, and anything RisoDesk holds for the
              same account.
            </p>
            <p className="mb-4 text-xs text-[var(--fg-muted)]">
              Labs shared with other people are left alone, and you are simply
              removed from them. The work belongs to the lab.
            </p>

            <details>
              <summary className="cursor-pointer list-none text-xs text-[var(--fg-subtle)] select-none hover:text-[var(--contradicts)]">
                I want to close my account
              </summary>
              <form action={deleteAccount} className="mt-3 max-w-sm space-y-3">
                <div>
                  <label
                    htmlFor="confirm_email"
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                  >
                    Type <span className="font-mono">{user.email}</span> to confirm
                  </label>
                  <Input id="confirm_email" name="confirm_email" required autoComplete="off" />
                </div>
                <Input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Your password"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-9 items-center rounded-md border px-3 text-xs"
                  style={{ color: "var(--contradicts)", borderColor: "var(--contradicts)" }}
                >
                  Close my account permanently
                </button>
              </form>
            </details>
          </Card>
        </div>
      )}

      {/* A quiet reminder of what the plan holds, on every tab but usage. */}
      {tab !== "usage" && usage === null && lab && (
        <p className="mt-6 text-xs text-[var(--fg-subtle)]">
          <Link href="/settings?tab=usage" className="hover:text-[var(--fg)]">
            See how much of your plan you are using
          </Link>
          {" · "}
          {limitLabel(freeLimits.books)} books and{" "}
          {bytesLabel(freeLimits.storageBytes)} on the free plan.
        </p>
      )}
    </Shell>
  );
}
