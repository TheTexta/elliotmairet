"use client";

import { LogOut } from "lucide-react";

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
      <button className="flex min-h-11 items-center gap-1 px-2 text-xs uppercase hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:text-neutral-500" disabled={disabled} type="submit">
        <LogOut aria-hidden="true" size={15} strokeWidth={1.8} />
        <span>Sign out</span>
      </button>
    </form>
  );
}
