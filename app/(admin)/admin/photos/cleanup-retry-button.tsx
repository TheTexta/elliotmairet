"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { retryStorageCleanupAction, type AdminActionState } from "../actions";

const initialState: AdminActionState = {};

export function CleanupRetryButton({ storagePath }: { storagePath: string }) {
  const [state, formAction, pending] = useActionState(
    retryStorageCleanupAction.bind(null, storagePath),
    initialState,
  );

  return (
    <form action={formAction} className="w-full shrink-0 sm:w-auto">
      <Button
        className="w-full sm:w-auto"
        disabled={pending}
        type="submit"
      >
        <Trash2 aria-hidden="true" size={16} />
        {pending ? "Removing file…" : "Remove unused file"}
      </Button>
      {state.error ? (
        <Alert variant="destructive" className="mt-2 max-w-64"><AlertDescription>{state.error}</AlertDescription></Alert>
      ) : null}
      {state.message ? (
        <p aria-live="polite" className="mt-2 max-w-64 wrap-anywhere text-sm leading-5">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
