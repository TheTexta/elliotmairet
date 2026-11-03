"use client";

import { Trash2 } from "lucide-react";
import { startTransition, useActionState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAdminConfirm } from "../confirm-provider";

import { removePhotographAndReturnAction } from "./photo-page-actions";
import { useUnsavedChanges } from "./unsaved-changes";

export function DeleteButton({ id, filename, returnHref = "/admin/photos", disabled = false }: { id: string; filename: string; returnHref?: string; disabled?: boolean }) {
  const confirm = useAdminConfirm();
  const [state, action, pending] = useActionState<{ error?: string }, void>(async () => {
    try { await removePhotographAndReturnAction(id, returnHref); return {}; }
    catch (error) { unstable_rethrow(error); return { error: "Removal could not be confirmed. Refresh the archive before trying again." }; }
  }, {});
  useUnsavedChanges(pending, pending);

  return (
    <div aria-busy={pending}>
      <Button aria-label={`Remove permanently: ${filename}`} variant="destructive" disabled={disabled || pending} type="button" onClick={async () => {
        if (disabled || pending || !await confirm({ title: "Remove photograph permanently?", description: `Permanently remove “${filename}” from the public archive? This cannot be undone and discards any unsaved edits to this photograph.`, confirmLabel: "Remove permanently", destructive: true })) return;
        startTransition(() => action());
      }}>
        <Trash2 aria-hidden="true" size={15} />{pending ? "Removing…" : "Remove permanently"}
      </Button>
      {state.error ? <p className="mt-2 text-sm" role="alert">{state.error}</p> : null}
    </div>
  );
}
