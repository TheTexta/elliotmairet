"use client";

import { Pencil, Save } from "lucide-react";
import { useActionState, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import type { PhotographWithPalette } from "@/lib/photographs/types";
import { photographCaption, type CaptionMode } from "@/lib/photographs/text";
import { savePhotographTextAction } from "./text-actions";
import { AdminInput, FormField } from "./form-controls";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAdminConfirm } from "../confirm-provider";
import { useUnsavedChanges } from "./unsaved-changes";
import { createPhotoEditor, discardPhotoEdits, photoEditorDirty, refreshPhotoEditor } from "./photo-editor-state";
import { DeleteButton } from "./delete-button";
import { PaletteIndicator } from "./palette-indicator";

export function PhotographEditForm({ photograph, automaticAlt = false }: { photograph: PhotographWithPalette; automaticAlt?: boolean | null }) {
  const confirm = useAdminConfirm();
  const [editor, setEditor] = useState(() => createPhotoEditor(photograph));
  const available = photograph.textMetadataAvailable;
  const dirty = photoEditorDirty(editor);
  const altReadOnly = automaticAlt !== false;
  const [state, action, pending] = useActionState(async (previous: { error?: string; message?: string; revision?: number }, form: FormData) => {
    try {
      const submitted = { ...editor.values };
      const manual = [...editor.manualFields];
      const result = await savePhotographTextAction(photograph.id, previous, form);
      if (!result.error) {
        for (const key of ["title", "description", "altText", "customCaption"] as const) submitted[key] = submitted[key].trim();
        setEditor(current => ({ ...current, values: submitted, saved: submitted, manualFields: [],
          revision: result.revision ?? current.revision,
          seenRevision: Math.max(current.seenRevision, result.revision ?? current.revision),
          sources: { ...current.sources, ...Object.fromEntries(manual.map(field => [field, "manual" as const])) } }));
      }
      return result;
    } catch (error) { unstable_rethrow(error); return { error: "Your changes could not be saved. They are still here; try again." }; }
  }, {});
  const refreshed = refreshPhotoEditor(editor, photograph, pending);
  if (refreshed !== editor) setEditor(refreshed);
  const values = editor.values;
  const stale = available && photograph.textRevision > editor.revision;
  useUnsavedChanges(dirty || pending);

  function change<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    const field = key === "altText" ? "alt_text" : key;
    setEditor(current => ({ ...current, values: { ...current.values, [key]: value },
      manualFields: field === "title" || field === "description" || field === "alt_text"
        ? current.manualFields.includes(field) ? current.manualFields : [...current.manualFields, field] : current.manualFields }));
  }
  const source = (field: "title" | "description" | "alt_text") =>
    editor.sources[field] === "manual" ? "Your text · protected" : editor.sources[field] === "ai" ? "Generated · editable" : "Not added";

  async function discard() {
    if (dirty && !await confirm({ title: "Discard photo edits?", description: `Discard your unsaved changes to “${photograph.filename}” and load its latest saved text?`, confirmLabel: "Discard changes", destructive: true })) return;
    setEditor(current => discardPhotoEdits(current, photograph));
  }

  return <details className="min-w-0 border-t border-neutral-200">
    <summary aria-label={`Edit photo ${photograph.filename}`} className="flex min-h-11 w-fit cursor-pointer items-center gap-2 py-2 text-sm font-medium focus-visible:outline-2">
      <Pencil aria-hidden="true" size={15} strokeWidth={1.8} />Edit photo
    </summary>
    <form action={action} aria-label={`Edit text for ${photograph.filename}`} aria-busy={pending} className="grid min-w-0 gap-5 py-4 sm:grid-cols-2">
      {available ? <><input type="hidden" name="textRevision" value={editor.revision} /><input type="hidden" name="manualFields" value={JSON.stringify(editor.manualFields)} /></> : <p className="text-sm text-neutral-700 sm:col-span-2">Caption editing is not available yet. Title, alt text and capture date can still be edited.</p>}
      <input type="hidden" name="sortOrder" value={photograph.sortOrder ?? ""} />
      {stale ? <Alert role="status" className="sm:col-span-2">
        <p>This photograph has newer saved text. Your unsaved edits have been kept; load the latest version before saving.</p>
        <Button type="button" variant="outline" disabled={pending} onClick={discard}>Load latest saved text</Button>
      </Alert> : null}
      <fieldset disabled={pending} className="contents">
        <FormField className="sm:col-span-2" label="Title">
          <AdminInput name="title" maxLength={200} value={values.title} onChange={event => change("title", event.target.value)} />
          <span className="text-xs font-normal text-neutral-600">{source("title")}</span>
        </FormField>
        <div className="space-y-4 sm:col-span-2">
          <FormField label="Description">
            <Textarea name="description" rows={3} maxLength={1000} disabled={!available} value={values.description} onChange={event => change("description", event.target.value)} />
            <span className="text-xs font-normal text-neutral-600">{source("description")} · Used in search and link previews.</span>
          </FormField>
          {altReadOnly ? <><input type="hidden" name="captionMode" value={values.captionMode} /><input type="hidden" name="customCaption" value={values.customCaption} /></> : <>
          <FormField label="Caption metadata">
            <NativeSelect name="captionMode" disabled={!available} value={values.captionMode} onChange={event => change("captionMode", event.target.value as CaptionMode)}>
              <option value="description">Use the description</option><option value="custom">Use a custom caption</option><option value="hidden">Hide the caption</option>
            </NativeSelect>
          </FormField>
          {values.captionMode === "custom" ? <FormField label="Custom caption">
            <Textarea name="customCaption" rows={3} maxLength={1000} disabled={!available} required value={values.customCaption} onChange={event => change("customCaption", event.target.value)} />
            <span className="text-xs font-normal text-neutral-600">Changes the caption metadata only. Your description and accessibility text stay unchanged.</span>
          </FormField> : <input type="hidden" name="customCaption" value={values.customCaption} />}
          <div className="space-y-1 border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
            <p className="font-medium">Caption text preview</p>
            <p className="whitespace-pre-wrap wrap-anywhere">{photographCaption(values) ?? "No caption metadata."}</p>
            <p className="text-xs">Public photo pages are image-only. Caption text is retained in metadata, not displayed below the photo.</p>
            {values.captionMode !== "custom" && values.customCaption ? <p className="pt-2 text-xs">Your custom wording is saved for when you choose Custom again.</p> : null}
          </div>
          </>}
        </div>
        <details className="min-w-0 border-t border-neutral-200 sm:col-span-2">
          <summary aria-label={`Alt text, date and file details for ${photograph.filename}`} className="min-h-11 cursor-pointer py-3 text-sm focus-visible:outline-2">Alt text, date and file details</summary>
          <div className="grid gap-4 pb-3 sm:grid-cols-2">
            <FormField className="sm:col-span-2" label="Image description for screen readers (alt text)">
              <Textarea name="altText" rows={3} maxLength={500} readOnly={altReadOnly} value={altReadOnly ? photograph.altText ?? "" : values.altText} onChange={altReadOnly ? undefined : event => change("altText", event.target.value)} />
              <span className="text-xs font-normal text-neutral-600">{automaticAlt === null ? "Alt text settings could not be checked. Manual alt editing is locked until you use Check progress to reload the setting; title and description edits are still available."
                : automaticAlt ? "Read-only. AI regenerates this after you save a changed title or description. The previous alt text stays live until generation succeeds; use Check progress to refresh."
                : `${source("alt_text")} · Describe what is visible, not the caption or filename.`}</span>
              {automaticAlt && !values.description.trim() ? <span className="text-xs font-normal text-neutral-600">Add a description to generate alt text. Clearing the description keeps the previous alt text.</span> : null}
            </FormField>
            <FormField label="Date captured"><AdminInput name="capturedAt" type="date" value={values.capturedAt} onChange={event => change("capturedAt", event.target.value)} /></FormField>
             <p className="self-end text-xs leading-5 text-neutral-600">Archive order: {photograph.sortOrder ?? "automatic"}. The original filename and image are not changed by editing text.</p>
             <div className="space-y-2 border-t border-neutral-200 pt-3 text-xs text-neutral-600 sm:col-span-2">
               <p className="wrap-anywhere">Original file: {photograph.filename}</p>
               <p>{photograph.width} × {photograph.height} pixels</p>
               <p className="wrap-anywhere">Storage path: {photograph.storagePath}</p>
               <PaletteIndicator photograph={photograph} />
             </div>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!dirty || stale}>
            <Save aria-hidden="true" size={15} />{pending ? "Saving…" : "Save changes"}
          </Button>
          {dirty ? <Button type="button" variant="outline" onClick={discard}>Discard changes</Button> : null}
          {state.error && dirty ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
          <p className="min-w-0 wrap-anywhere text-xs text-neutral-700" role="status">
            {pending ? "Saving your changes…" : dirty ? "Unsaved changes" : state.message ?? "All changes saved"}
          </p>
        </div>
      </fieldset>
    </form>
    <details className="border-t border-neutral-200 text-sm">
      <summary className="min-h-11 cursor-pointer py-3 text-neutral-700 focus-visible:outline-2">Remove this photograph</summary>
      <p className="mb-2 max-w-prose text-sm text-neutral-600">Permanently removes this photograph from the public archive. This does not affect other photographs.</p>
      <DeleteButton id={photograph.id} filename={photograph.filename} />
    </details>
  </details>;
}
