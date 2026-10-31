"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";

import { deletePhotographAction } from "../actions";

export function DeleteButton({ id, filename }: { id: string; filename: string }) {
  const [state, action, pending] = useActionState(async () => {
    try { return await deletePhotographAction(id); }
    catch { return { error: "Removal could not be confirmed. Refresh the archive before trying again." }; }
  }, {});

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Permanently remove “${filename}” from the public archive? This cannot be undone and discards any unsaved edits to this photograph.`)) {
          event.preventDefault();
        }
      }}
    >
      <button aria-label={`Permanently remove ${filename}`} className="flex min-h-11 items-center gap-2 border border-red-300 px-3 text-xs text-red-800 hover:bg-red-50 focus-visible:outline-2 disabled:cursor-wait disabled:opacity-50" disabled={pending} type="submit">
        <Trash2 aria-hidden="true" size={15} />{pending ? "Removing…" : "Remove permanently"}
      </button>
      {state.error || state.message ? <p className="mt-2 text-sm text-neutral-700" role={state.error ? "alert" : "status"}>{state.error ?? state.message}</p> : null}
    </form>
  );
}
