"use client";

import { useFormStatus } from "react-dom";
import { Button, Input, Label } from "@/components/ui";

export type Mode = "signin" | "signup";

/**
 * The credential fields.
 *
 * Deliberately has no submit handler and no state that the form depends on:
 * the parent posts to a Server Action, so this works whether or not React has
 * hydrated. Everything here is an enhancement — a pending label, a password
 * reveal — and the form still submits correctly with all of it inert.
 */
export function LoginFields({ mode }: { mode: Mode }) {
  return (
    <div className="space-y-4 p-6">
      <input type="hidden" name="mode" value={mode} />

      {mode === "signup" && (
        <div>
          <Label htmlFor="full_name">Name</Label>
          <Input
            id="full_name"
            name="full_name"
            placeholder="Dr Jim Wong"
            autoComplete="name"
            className="min-h-11"
          />
        </div>
      )}

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@university.edu"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="email"
          className="min-h-11"
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="min-h-11"
        />
        {mode === "signup" && (
          <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">
            At least 6 characters.
          </p>
        )}
      </div>

      {mode === "signup" && (
        <div>
          <label htmlFor="invite" className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]">
            Launch code <span className="font-normal text-[var(--fg-subtle)]">optional</span>
          </label>
          <input
            id="invite"
            name="invite"
            autoComplete="off"
            spellCheck={false}
            placeholder="From your waitlist invitation"
            className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--fg)] placeholder:font-sans placeholder:text-[var(--fg-subtle)]"
          />
          {/*
            A wrong code never blocks the sign-up — the account is created on
            the free plan and can be put right by hand. Failing here would mean
            an error page after somebody had already chosen a password.
          */}
          <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">
            Leave it empty to start on the free plan.
          </p>
        </div>
      )}

      <SubmitButton mode={mode} />
    </div>
  );
}

/**
 * `useFormStatus` reports the parent form's state. If React never hydrated
 * this renders the idle label and the native submit still works.
 */
function SubmitButton({ mode }: { mode: Mode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="min-h-11 w-full">
      {pending
        ? mode === "signup"
          ? "Creating account…"
          : "Signing in…"
        : mode === "signup"
          ? "Create account"
          : "Sign in"}
    </Button>
  );
}
