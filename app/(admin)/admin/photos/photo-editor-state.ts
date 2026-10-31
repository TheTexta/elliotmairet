import { emptyTextSources, type TextField, type TextSources } from "@/lib/photographs/text";
import type { Photograph } from "@/lib/photographs/types";

export function photoEditorValues(photo: Photograph) {
  return {
    title: photo.title ?? "", description: photo.description ?? "", altText: photo.altText ?? "",
    capturedAt: photo.capturedAt ?? "", captionMode: photo.captionMode ?? "description",
    customCaption: photo.customCaption ?? "",
  };
}

export function createPhotoEditor(photo: Photograph) {
  const values = photoEditorValues(photo);
  const sources: TextSources = photo.textSources ?? {
    ...emptyTextSources,
    title: photo.title ? "manual" : "unset", description: photo.description ? "manual" : "unset",
    alt_text: photo.altText ? "manual" : "unset",
  };
  return { values, saved: values, manualFields: [] as TextField[], revision: photo.textRevision,
    seenRevision: photo.textRevision, sources };
}

export type PhotoEditor = ReturnType<typeof createPhotoEditor>;

export function photoEditorDirty(editor: PhotoEditor) {
  return editor.manualFields.length > 0 || JSON.stringify(editor.values) !== JSON.stringify(editor.saved);
}

export function refreshPhotoEditor(editor: PhotoEditor, photo: Photograph, pending: boolean): PhotoEditor {
  if (pending || photo.textRevision <= editor.seenRevision) return editor;
  // A revision-based React key would discard dirty forms. Observe the incoming
  // revision, but retain their values and original optimistic-write revision.
  return photoEditorDirty(editor) ? { ...editor, seenRevision: photo.textRevision } : createPhotoEditor(photo);
}

export function discardPhotoEdits(editor: PhotoEditor, photo: Photograph): PhotoEditor {
  return photo.textRevision >= editor.revision ? createPhotoEditor(photo)
    : { ...editor, values: editor.saved, manualFields: [] };
}
