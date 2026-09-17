"use client";

import { Save } from "lucide-react";
import { useActionState, useState } from "react";

import type { SiteContent } from "@/lib/site-content/queries";

import { updateSiteContentAction, type AdminActionState } from "../actions";

const initialState: AdminActionState = {};

export function ContentForm({ initialContent }: { initialContent: SiteContent }) {
  const [footerText, setFooterText] = useState(initialContent.footerText);
  const [seoTitle, setSeoTitle] = useState(initialContent.seoTitle);
  const [seoDescription, setSeoDescription] = useState(initialContent.seoDescription);
  const [state, formAction, pending] = useActionState(updateSiteContentAction, initialState);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-4">
      <label className="flex flex-col gap-2 text-[9px] font-medium uppercase text-neutral-600" htmlFor="seoTitle">
        SEO title
      </label>
      <input
        aria-describedby="seo-title-count"
        className="h-10 w-full border border-neutral-300 bg-white px-3 text-base text-black outline-none focus:border-black"
        id="seoTitle"
        maxLength={120}
        name="seoTitle"
        onChange={(event) => setSeoTitle(event.target.value)}
        value={seoTitle}
      />
      <div className="flex justify-end text-[9px] tabular-nums text-neutral-500" id="seo-title-count">
        {seoTitle.length}/120
      </div>
      <label className="flex flex-col gap-2 text-[9px] font-medium uppercase text-neutral-600" htmlFor="seoDescription">
        SEO description
      </label>
      <textarea
        aria-describedby="seo-description-count"
        className="min-h-28 w-full resize-y border border-neutral-300 bg-white p-4 text-base leading-relaxed text-black outline-none focus:border-black"
        id="seoDescription"
        maxLength={320}
        name="seoDescription"
        onChange={(event) => setSeoDescription(event.target.value)}
        value={seoDescription}
      />
      <div className="flex justify-end text-[9px] tabular-nums text-neutral-500" id="seo-description-count">
        {seoDescription.length}/320
      </div>
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