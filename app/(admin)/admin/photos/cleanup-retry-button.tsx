"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";

import { retryStorageCleanupAction, type AdminActionState } from "../actions";

const initialState: AdminActionState = {};

export function CleanupRetryButton({ storagePath }: { storagePath: string }) {
  const [state, formAction, pending] = useActionState(
    retryStorageCleanupAction.bind(null, storagePath),
    initialState,
  );

  return (
    <form action={formAction} className="w-full shrink-0 sm:w-auto">
      <button
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-black px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-wait disabled:bg-neutral-500 sm:w-auto"
        disabled={pending}
        type="submit"
      >
        <Trash2 aria-hidden="true" size={16} />
        {pending ? "Removing file…" : "Remove unused file"}
      </button>
      {state.error ? (
        <p aria-live="polite" className="mt-2 max-w-64 wrap-anywhere text-sm leading-5 text-red-800" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p aria-live="polite" className="mt-2 max-w-64 wrap-anywhere text-sm leading-5 text-neutral-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
