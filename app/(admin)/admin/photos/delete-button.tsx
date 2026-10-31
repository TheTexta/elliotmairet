"use client";

import { Trash2 } from "lucide-react";
import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminConfirm } from "../confirm-provider";

import { deletePhotographAction } from "../actions";

export function DeleteButton({ id, filename }: { id: string; filename: string }) {
  const confirm = useAdminConfirm();
  const [state, action, pending] = useActionState(async () => {
    try { return await deletePhotographAction(id); }
    catch { return { error: "Removal could not be confirmed. Refresh the archive before trying again." }; }
  }, {});

  return (
    <div aria-busy={pending}>
      <Button aria-label={`Permanently remove ${filename}`} variant="destructive" disabled={pending} type="button" onClick={async () => {
        if (pending || !await confirm({ title: "Remove photograph permanently?", description: `Permanently remove “${filename}” from the public archive? This cannot be undone and discards any unsaved edits to this photograph.`, confirmLabel: "Remove permanently", destructive: true })) return;
        startTransition(() => action());
      }}>
        <Trash2 aria-hidden="true" size={15} />{pending ? "Removing…" : "Remove permanently"}
      </Button>
      {state.error || state.message ? <p className="mt-2 text-sm text-neutral-700" role={state.error ? "alert" : "status"}>{state.error ?? state.message}</p> : null}
    </div>
  );
}
