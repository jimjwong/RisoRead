"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

export function PasswordResetSubmitButton({
  idleLabel,
  pendingLabel,
}: {
  idleLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="min-h-11 w-full">
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
