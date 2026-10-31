"use client";

import { Pencil, Save } from "lucide-react";
import { useActionState, useState } from "react";

import type { PhotographWithPalette } from "@/lib/photographs/types";
import { photographCaption, type CaptionMode, type TextField } from "@/lib/photographs/text";

import { savePhotographTextAction } from "./text-actions";
import { AdminInput, FormField, adminInputClassName } from "./form-controls";
import { useUnsavedChanges } from "./unsaved-changes";

export function PhotographEditForm({
  photograph,
}: {
  photograph: PhotographWithPalette;
}) {
  const [values, setValues] = useState({
    title: photograph.title ?? "", description: photograph.description ?? "",
    altText: photograph.altText ?? "", capturedAt: photograph.capturedAt ?? "",
    captionMode: photograph.captionMode ?? "description", customCaption: photograph.customCaption ?? "",
  });
  const [saved, setSaved] = useState(values);
  const [manualFields, setManualFields] = useState<TextField[]>([]);
  const [revision, setRevision] = useState(photograph.textRevision);
  const available = photograph.textMetadataAvailable;
  const dirty = manualFields.length > 0 || JSON.stringify(values) !== JSON.stringify(saved);
  const [state, action, pending] = useActionState(async (previous: { error?: string; message?: string; revision?: number }, form: FormData) => {
    try {
      const result = await savePhotographTextAction(photograph.id, previous, form);
      if (!result.error) {
        setSaved(values);
        setManualFields([]);
        if (result.revision !== undefined) setRevision(result.revision);
      }
      return result;
    } catch {
      return { error: "The save could not be completed. Your edits are retained; try again." };
    }
  }, {});
  useUnsavedChanges(dirty || pending);
  function change<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues(current => ({ ...current, [key]: value }));
    const field = key === "altText" ? "alt_text" : key;
    if (field === "title" || field === "description" || field === "alt_text") {
      setManualFields(current => current.includes(field) ? current : [...current, field]);
    }
  }
  const source = (field: "title" | "description" | "alt_text") => {
    const existing = field === "title" ? photograph.title : field === "alt_text" ? photograph.altText : photograph.description;
    const ownership = photograph.textSources?.[field] ?? (existing ? "manual" : "unset");
    return ownership === "manual" ? "Manual · protected" : ownership === "ai" ? "AI suggestion" : "Not set";
  };

  return (
    <details className="min-w-0 w-full xl:relative xl:w-auto">
      <summary className="mr-24 ml-auto flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 px-2 text-[9px] marker:hidden xl:mr-0 xl:min-h-9">
        <Pencil aria-hidden="true" size={14} strokeWidth={1.8} />
        Edit
      </summary>
      <form
        action={action}
        aria-label={`Edit text for ${photograph.filename}`}
        aria-busy={pending}
        className="mt-2 grid max-h-[75dvh] min-w-0 w-full grid-cols-1 gap-3 overflow-y-auto border border-neutral-300 bg-white p-4 normal-case sm:grid-cols-2 xl:absolute xl:right-0 xl:z-10 xl:w-[min(32rem,calc(100vw-3rem))] xl:shadow-[0_10px_35px_rgba(0,0,0,0.12)]"
      >
        {available ? <input type="hidden" name="textRevision" value={revision} /> : <p className="text-xs text-neutral-700 sm:col-span-2">The text migration is required for descriptions, captions and AI review. Existing title, alt text and date editing remains available.</p>}
        {available ? <input type="hidden" name="manualFields" value={JSON.stringify(manualFields)} /> : null}
        <fieldset disabled={pending} className="contents">
        <FormField label={`Title · ${source("title")}`}>
          <AdminInput
            value={values.title}
            onChange={event => change("title", event.target.value)}
            maxLength={200}
            name="title"
          />
        </FormField>
        <FormField label="Captured">
          <AdminInput
            value={values.capturedAt}
            onChange={event => change("capturedAt", event.target.value)}
            name="capturedAt"
            type="date"
          />
        </FormField>
        <FormField className="sm:col-span-2" label={`Description · ${source("description")}`}>
          <textarea className={`${adminInputClassName} h-auto! py-2`} rows={3} name="description" maxLength={1000} disabled={!available} value={values.description} onChange={event => change("description", event.target.value)} />
        </FormField>
        <FormField className="sm:col-span-2" label={`Alt text · ${source("alt_text")}`}>
          <textarea
            className={`${adminInputClassName} h-auto! py-2`}
            rows={3}
            value={values.altText}
            onChange={event => change("altText", event.target.value)}
            maxLength={500}
            name="altText"
          />
        </FormField>
        <FormField className="sm:col-span-2" label="Visible caption">
          <select className={adminInputClassName} name="captionMode" value={values.captionMode} disabled={!available} onChange={event => change("captionMode", event.target.value as CaptionMode)}>
            <option value="description">Description</option><option value="custom">Custom caption</option><option value="hidden">Hidden</option>
          </select>
        </FormField>
        <FormField className="sm:col-span-2" label="Custom caption · display only">
          <textarea className={`${adminInputClassName} h-auto! py-2`} rows={3} name="customCaption" maxLength={1000} disabled={!available} required={available && values.captionMode === "custom"} value={values.customCaption} onChange={event => change("customCaption", event.target.value)} />
        </FormField>
        <div className="min-w-0 space-y-2 text-xs text-neutral-700 sm:col-span-2">
          <p>Caption preview: <span className="whitespace-pre-wrap wrap-anywhere">{photographCaption(values) ?? "No visible caption"}</span></p>
          <p>Custom and Hidden leave the description and alt text unchanged. Custom text is retained when switching modes.</p>
          <button className="min-h-11 border border-neutral-300 px-3 text-black disabled:opacity-50" type="button" disabled={!available || values.captionMode === "description"} onClick={() => change("captionMode", "description")}>Use description</button>
        </div>
        <FormField className="text-neutral-400" label="Sort order">
          <AdminInput
            className="cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
            defaultValue={photograph.sortOrder ?? ""}
            disabled
            step="1"
            type="number"
          />
          <input
            defaultValue={photograph.sortOrder ?? ""}
            name="sortOrder"
            type="hidden"
          />
        </FormField>
        <div className="flex items-end justify-end">
          <button
            className="flex min-h-11 items-center gap-2 bg-black px-4 text-[10px] uppercase text-white disabled:opacity-50"
            disabled={!dirty}
            type="submit"
          >
            <Save aria-hidden="true" size={13} />
            {pending ? "Saving…" : "Save text"}
          </button>
        </div>
        </fieldset>
        <p className="text-xs text-neutral-700 sm:col-span-2" role={state.error ? "alert" : "status"}>{state.error ?? (pending ? "Saving your changes…" : dirty ? "Unsaved changes" : state.message ?? "All changes saved")}</p>
      </form>
    </details>
  );
}
