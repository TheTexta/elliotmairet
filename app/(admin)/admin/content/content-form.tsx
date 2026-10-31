"use client";

import { Save } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useActionState, useState } from "react";

import type { SiteContent } from "@/lib/site-content/queries";

import { updateSiteContentAction, type AdminActionState } from "../actions";
import { useUnsavedChanges } from "../photos/unsaved-changes";

const initialState: AdminActionState = {};

function normalizeContent(footerText: string, seoTitle: string, seoDescription: string) {
  return { footerText: footerText.replace(/\r\n?/g, "\n"), seoTitle: seoTitle.trim(), seoDescription: seoDescription.trim() };
}

export function ContentForm({ initialContent }: { initialContent: SiteContent }) {
  const [footerText, setFooterText] = useState(initialContent.footerText);
  const [seoTitle, setSeoTitle] = useState(initialContent.seoTitle);
  const [seoDescription, setSeoDescription] = useState(initialContent.seoDescription);
  const [saved, setSaved] = useState(() => normalizeContent(initialContent.footerText, initialContent.seoTitle, initialContent.seoDescription));
  const [state, formAction, pending] = useActionState(async (previousState: AdminActionState, formData: FormData) => {
    const submitted = normalizeContent(String(formData.get("footerText") ?? ""), String(formData.get("seoTitle") ?? ""), String(formData.get("seoDescription") ?? ""));
    try {
      const result = await updateSiteContentAction(previousState, formData);
      if (result.message && !result.error) setSaved(submitted);
      return result;
    } catch (error) {
      unstable_rethrow(error);
      return { error: "Site content could not be saved. Your changes are still here. Try again." };
    }
  }, initialState);
  const current = normalizeContent(footerText, seoTitle, seoDescription);
  const dirty = current.footerText !== saved.footerText || current.seoTitle !== saved.seoTitle || current.seoDescription !== saved.seoDescription;
  useUnsavedChanges(dirty || pending);

  return (
    <form action={formAction} aria-busy={pending} className="flex min-w-0 w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium uppercase" htmlFor="seoTitle">Site title</label>
        <p className="text-sm leading-relaxed text-neutral-600" id="seo-title-help">Used in browser tabs, search results, and link previews.</p>
      </div>
      <input
        aria-describedby="seo-title-help seo-title-count"
        className="min-h-11 min-w-0 w-full max-w-full border border-neutral-300 bg-white px-3 text-base text-black outline-none focus:border-black focus-visible:ring-1 focus-visible:ring-black disabled:bg-neutral-200 disabled:text-neutral-600"
        disabled={pending}
        id="seoTitle"
        maxLength={120}
        name="seoTitle"
        onChange={(event) => setSeoTitle(event.target.value)}
        value={seoTitle}
      />
      <div className="flex justify-end text-xs tabular-nums text-neutral-600" id="seo-title-count">
        {seoTitle.length}/120
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <label className="text-sm font-medium uppercase" htmlFor="seoDescription">Search description</label>
        <p className="text-sm leading-relaxed text-neutral-600" id="seo-description-help">A short summary for search results and link previews, separate from your footer. Search engines may choose different wording and take time to update.</p>
      </div>
      <textarea
        aria-describedby="seo-description-help seo-description-count"
        className="min-h-28 min-w-0 w-full resize-y border border-neutral-300 bg-white p-4 text-base leading-relaxed text-black outline-none focus:border-black focus-visible:ring-1 focus-visible:ring-black disabled:bg-neutral-200 disabled:text-neutral-600"
        disabled={pending} id="seoDescription" maxLength={320} name="seoDescription" rows={3}
        onChange={event => setSeoDescription(event.target.value)} value={seoDescription}
      />
      <div className="flex justify-end text-xs tabular-nums text-neutral-600" id="seo-description-count">{seoDescription.length}/320</div>
      <div className="mt-4 flex flex-col gap-2">
        <label className="text-sm font-medium uppercase" htmlFor="footerText">Footer text</label>
        <p className="text-sm leading-relaxed text-neutral-600" id="footer-text-help">Shown at the bottom of the public site. Line breaks are preserved.</p>
      </div>
      <textarea
        aria-describedby="footer-text-help footer-text-count"
        className="min-h-56 min-w-0 w-full max-w-full resize-y border border-neutral-300 bg-white p-4 text-base leading-relaxed text-black outline-none focus:border-black focus-visible:ring-1 focus-visible:ring-black disabled:bg-neutral-200 disabled:text-neutral-600"
        disabled={pending}
        id="footerText"
        maxLength={2000}
        name="footerText"
        onChange={(event) => setFooterText(event.target.value)}
        value={footerText}
      />
      <div className="flex min-h-11 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" aria-atomic="true" role="status" className="min-w-0 wrap-anywhere text-sm" id="footer-text-status">
          <p>{pending ? "Saving changes…" : dirty ? "Unsaved changes" : state.message || "No unsaved changes"}</p>
          {state.error ? <p role="alert" className="text-red-800">{state.error}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 sm:justify-end">
          <span className="text-xs tabular-nums text-neutral-600" id="footer-text-count">
            {footerText.length}/2,000
          </span>
          <button
            className="flex min-h-11 items-center gap-2 bg-black px-4 text-xs uppercase text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:bg-neutral-600"
            disabled={pending || !dirty}
            type="submit"
          >
            <Save aria-hidden="true" size={14} strokeWidth={1.8} />
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
