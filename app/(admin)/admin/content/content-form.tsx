"use client";

import { Save } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useActionState, useState } from "react";

import type { SiteContent } from "@/lib/site-content/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    <form action={formAction} aria-label="Edit site content" aria-busy={pending} className="flex min-w-0 w-full max-w-3xl flex-col gap-6">
      <fieldset disabled={pending} className="min-w-0 space-y-5">
      <legend className="mb-4 text-base font-medium">Search and link previews</legend>
      <div className="space-y-2">
        <Label htmlFor="seoTitle">Site title</Label>
        <p className="text-sm leading-6 text-neutral-600" id="seo-title-help">Used in browser tabs, search results and shared links.</p>
      <Input
        aria-describedby="seo-title-help seo-title-count"
        disabled={pending}
        id="seoTitle"
        maxLength={120}
        name="seoTitle"
        onChange={(event) => setSeoTitle(event.target.value)}
        value={seoTitle}
      />
      <div className="text-right text-xs tabular-nums text-neutral-600" id="seo-title-count">
        {seoTitle.length}/120 characters
      </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="seoDescription">Search description</Label>
        <p className="max-w-prose text-sm leading-6 text-neutral-600" id="seo-description-help">A short summary for search results and shared links. Search engines may change the wording and take time to update.</p>
      <Textarea
        aria-describedby="seo-description-help seo-description-count"
        className="min-h-28 p-4"
        disabled={pending} id="seoDescription" maxLength={320} name="seoDescription" rows={3}
        onChange={event => setSeoDescription(event.target.value)} value={seoDescription}
      />
      <div className="text-right text-xs tabular-nums text-neutral-600" id="seo-description-count">{seoDescription.length}/320 characters</div>
      </div>
      </fieldset>
      <Separator />
      <fieldset disabled={pending} className="min-w-0 space-y-2">
        <legend className="mb-4 text-base font-medium">Public footer</legend>
        <Label htmlFor="footerText">Footer text</Label>
        <p className="text-sm leading-relaxed text-neutral-600" id="footer-text-help">Shown at the bottom of the public site. Line breaks are preserved.</p>
      <Textarea
        aria-describedby="footer-text-help footer-text-count"
        className="min-h-40 p-4"
        disabled={pending}
        id="footerText"
        maxLength={2000}
        name="footerText"
        onChange={(event) => setFooterText(event.target.value)}
        value={footerText}
      />
      <div className="text-right text-xs tabular-nums text-neutral-600" id="footer-text-count">{footerText.length}/2,000 characters</div>
      </fieldset>
      <div className="flex min-h-11 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" aria-atomic="true" role="status" className="min-w-0 wrap-anywhere text-sm" id="footer-text-status">
          <p>{pending ? "Saving changes…" : dirty ? "Unsaved changes" : state.message || "No unsaved changes"}</p>
          {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 sm:justify-end">
          <Button
            disabled={pending || !dirty}
            type="submit"
          >
            <Save aria-hidden="true" size={14} strokeWidth={1.8} />
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
