"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

import { signOutAction } from "./actions";
import { confirmAdminNavigation } from "./photos/unsaved-changes";

export function SignOutButton({ disabled = false, onAttempt }: { disabled?: boolean; onAttempt?: () => boolean }) {
  return (
    <form action={signOutAction} onSubmit={(event) => {
      if (disabled || (onAttempt && !onAttempt())) {
        event.preventDefault();
        return;
      }
      if (!confirmAdminNavigation("You have unsaved changes or an unfinished operation. Sign out?")) event.preventDefault();
    }}>
      <Button variant="ghost" className="gap-1 px-2" disabled={disabled} type="submit">
        <LogOut aria-hidden="true" size={15} strokeWidth={1.8} />
        <span>Sign out</span>
      </Button>
    </form>
  );
}
