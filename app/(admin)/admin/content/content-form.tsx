"use client";

import { Save } from "lucide-react";
import { useActionState, useState } from "react";

import { updateFooterTextAction, type AdminActionState } from "../actions";

const initialState: AdminActionState = {};

export function ContentForm({ initialText }: { initialText: string }) {
  const [footerText, setFooterText] = useState(initialText);
  const [state, formAction, pending] = useActionState(updateFooterTextAction, initialState);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-4">
      <label className="flex flex-col gap-2 text-[9px] font-medium uppercase text-neutral-600" htmlFor="footerText">
        Footer text
      </label>
      <textarea
        aria-describedby="footer-text-count"
        className="min-h-56 w-full resize-y border border-neutral-300 bg-white p-4 text-base leading-relaxed text-black outline-none focus:border-black"
        id="footerText"
        maxLength={2000}
        name="footerText"
        onChange={(event) => setFooterText(event.target.value)}
        value={footerText}
      />
      <div className="flex min-h-10 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="text-[10px]" id="footer-text-status">
          {state.error ? <p className="border-l-2 border-red-700 pl-3 text-red-800">{state.error}</p> : null}
          {state.message ? <p className="border-l-2 border-black pl-3">{state.message}</p> : null}
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <span className="text-[9px] tabular-nums text-neutral-500" id="footer-text-count">
            {footerText.length}/2,000
          </span>
          <button
            className="flex h-10 items-center gap-2 bg-black px-4 text-[9px] uppercase text-white disabled:cursor-wait disabled:bg-neutral-500"
            disabled={pending}
            type="submit"
          >
            <Save aria-hidden="true" size={14} strokeWidth={1.8} />
            {pending ? "Saving" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}