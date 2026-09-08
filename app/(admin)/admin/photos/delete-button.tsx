"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { deletePhotographAction } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="flex h-9 items-center gap-1.5 px-2 text-[9px] text-red-800 disabled:cursor-wait disabled:text-neutral-400"
      disabled={pending}
      type="submit"
    >
      <Trash2 aria-hidden="true" size={14} strokeWidth={1.8} />
      {pending ? "Deleting" : "Delete"}
    </button>
  );
}

export function DeleteButton({ id }: { id: string }) {
  const action = deletePhotographAction.bind(null, id);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Delete this public photograph permanently?")) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton />
    </form>
  );
}