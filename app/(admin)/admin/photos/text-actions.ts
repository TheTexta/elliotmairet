"use server";

import { revalidatePath } from "next/cache";
import { invalidatePhotographs } from "@/lib/cache-invalidation";
import { requireAdmin } from "@/lib/supabase/admin";
import {
  textFields, uuidPattern, validatePhotographTextFields, validateTextImport,
  type PhotographTextDraft, type PhotographTextFields, type TextBatchPreview,
  type TextBatchResult, type TextField, type TextSnapshot,
} from "@/lib/photographs/text";
import { updatePhotographAction } from "../actions";

export type TextActionState = { error?: string; message?: string; revision?: number };

function identifier(value: string) {
  if (!uuidPattern.test(value)) throw new Error("Choose a valid photograph, draft or run identifier.");
  return value;
}

function revision(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Reload to obtain the current text revision.");
  return parsed;
}

function text(form: FormData, field: string, maximum: number) {
  const raw = form.get(field);
  if (typeof raw !== "string" || raw.length > maximum || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw)) {
    throw new Error(`${field} is missing, invalid or too long.`);
  }
  return raw.trim() || null;
}

function databaseError(error: { code?: string } | null, fallback: string) {
  if (error?.code === "PGRST202" || error?.code === "42883" || error?.code === "42703") {
    return "The photograph text migration is required. No text was changed.";
  }
  if (error?.code === "40001") return "The photograph or draft changed. Reload before saving; your edits have been retained.";
  return fallback;
}

function refreshText() {
  invalidatePhotographs();
  revalidatePath("/admin/photos");
}

export async function savePhotographTextAction(id: string, _previous: TextActionState, form: FormData): Promise<TextActionState> {
  const { supabase } = await requireAdmin();
  try {
    identifier(id);
    if (form.get("textRevision") === null) {
      // Compatibility while the additive migration is not deployed. Once it is
      // present, a cached legacy form must reload instead of bypassing revisions.
      const ready = await supabase.rpc("photograph_text_states");
      if (!ready.error) return { error: "Text editing has been upgraded. Reload before saving." };
      if (!["PGRST202", "42883"].includes(ready.error.code)) return { error: "Text editing could not be verified. Try again." };
      await updatePhotographAction(id, form);
      revalidatePath("/admin/photos");
      return { message: "Photograph updated. Caption editing awaits the migration." };
    }
    const mode = form.get("captionMode");
    if (!["description", "custom", "hidden"].includes(String(mode))) throw new Error("Choose a caption mode.");
    const custom = text(form, "customCaption", 1000);
    if (mode === "custom" && !custom) throw new Error("Write a custom caption, or choose Description or Hidden.");
    const date = text(form, "capturedAt", 10);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Captured date must use YYYY-MM-DD.");
    const sort = text(form, "sortOrder", 12);
    if (sort !== null && !Number.isSafeInteger(Number(sort))) throw new Error("Sort order must be a whole number.");
    const manualFields: unknown = JSON.parse(String(form.get("manualFields") ?? "[]"));
    if (!Array.isArray(manualFields) || manualFields.length > 3 ||
      manualFields.some(field => !textFields.includes(field))) throw new Error("Reload before saving text field ownership.");
    const { data, error } = await supabase.rpc("save_photograph_text", {
      p_id: id, p_revision: revision(form.get("textRevision")),
      p_values: { title: text(form, "title", 200), description: text(form, "description", 1000),
        alt_text: text(form, "altText", 500), caption_mode: mode, custom_caption: custom,
        captured_at: date, sort_order: sort === null ? null : Number(sort),
        ...(manualFields.length ? { manual_fields: manualFields } : {}) },
    });
    if (error) return { error: databaseError(error, "The photograph could not be saved. It may have changed; reload before retrying.") };
    refreshText();
    return { message: "Text saved. Manual edits are protected from bulk AI updates.", revision: data.revision };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The photograph could not be saved." };
  }
}

export async function getPhotographTextSnapshotAction(): Promise<{ error?: string; snapshot?: TextSnapshot }> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("photograph_text_snapshot");
  if (error) return { error: databaseError(error, "The catalogue snapshot could not be loaded.") };
  return { snapshot: data as TextSnapshot };
}

export async function importPhotographTextDraftsAction(payload: unknown): Promise<{ error?: string; message?: string; imported?: number }> {
  const { supabase } = await requireAdmin();
  let validated;
  try { validated = validateTextImport(payload); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid draft export." }; }
  const { data, error } = await supabase.rpc("import_photograph_text_drafts", { p_payload: validated });
  if (error) return { error: databaseError(error, "Import failed. The run or original records may differ from an earlier import; originals cannot be replaced.") };
  return { imported: data as number, message: "Private drafts imported. No live text changed." };
}

export async function listPhotographTextDraftsAction(options: {
  runId?: string; photographId?: string; offset?: number; filter?: "all" | "pending" | "manual" | "conflict";
} = {}): Promise<{ error?: string; drafts?: PhotographTextDraft[]; total?: number }> {
  const { supabase } = await requireAdmin();
  try {
    if (options.runId) identifier(options.runId);
    if (options.photographId) identifier(options.photographId);
    const offset = revision(options.offset ?? 0);
    if (!["all", "pending", "manual", "conflict"].includes(options.filter ?? "all")) throw new Error("Choose a valid draft filter.");
    const { data, error } = await supabase.rpc("list_photograph_text_drafts", {
      p_run_id: options.runId ?? null, p_photograph_id: options.photographId ?? null,
      p_offset: offset, p_filter: options.filter ?? "all",
    });
    if (error) return { error: databaseError(error, "Private drafts could not be loaded.") };
    return { drafts: data.drafts as PhotographTextDraft[], total: data.total as number };
  } catch { return { error: "Choose a valid run, photograph and page." }; }
}

export async function savePhotographTextDraftAction(id: string, version: number, fields: PhotographTextFields, notesResolved: boolean): Promise<TextActionState> {
  const { supabase } = await requireAdmin();
  try {
    identifier(id); revision(version);
    if (typeof notesResolved !== "boolean") throw new Error("Choose whether the review notes are resolved.");
    const validated = validatePhotographTextFields(fields);
    const { error } = await supabase.rpc("save_photograph_text_draft", {
      p_id: id, p_version: version, p_fields: validated, p_notes_resolved: notesResolved,
    });
    if (error) return { error: databaseError(error, "The draft could not be saved. Reload its latest version.") };
    return { message: "Private draft saved. Previous batch previews are no longer valid." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Invalid draft." }; }
}

export async function previewPhotographTextBatchAction(runId: string, fields: TextField[], draftIds?: string[]): Promise<{ error?: string; preview?: TextBatchPreview }> {
  const { supabase } = await requireAdmin();
  try {
    identifier(runId);
    if (!Array.isArray(fields) || !fields.length || fields.length > 3 || new Set(fields).size !== fields.length ||
      fields.some(field => !textFields.includes(field))) throw new Error("Choose text fields to preview.");
    if (draftIds && (!Array.isArray(draftIds) || !draftIds.length || draftIds.length > 1000)) throw new Error("Choose up to 1000 drafts.");
    draftIds?.forEach(identifier);
    const { data, error } = await supabase.rpc("preview_photograph_text_batch", {
      p_run_id: runId, p_fields: fields, p_draft_ids: draftIds ?? null,
    });
    if (error) return { error: databaseError(error, "The batch could not be previewed. Check the run and selection.") };
    return { preview: data as TextBatchPreview };
  } catch (error) { return { error: error instanceof Error ? error.message : "Invalid preview selection." }; }
}

export async function getPhotographTextBatchAction(token: string): Promise<{ error?: string; preview?: TextBatchPreview; results?: TextBatchResult[]; done?: boolean }> {
  const { supabase } = await requireAdmin();
  try { identifier(token); } catch { return { error: "Enter the approval token to recover." }; }
  const { data, error } = await supabase.rpc("get_photograph_text_batch", { p_token: token });
  if (error) return { error: databaseError(error, "This approval was not found for your administrator account.") };
  return { preview: data.preview, results: data.results, done: data.done };
}

export async function applyPhotographTextBatchAction(token: string): Promise<{ error?: string; message?: string; results?: TextBatchResult[]; done?: boolean }> {
  const { supabase } = await requireAdmin();
  try { identifier(token); } catch { return { error: "Preview the batch before applying it." }; }
  const { data, error } = await supabase.rpc("apply_photograph_text_batch", { p_token: token });
  if (error) return { error: databaseError(error, "The approval is missing or expired. Preview again to reconcile completed and remaining records.") };
  refreshText();
  return { results: data.results, done: data.done, message: data.done ? "Batch complete. Review applied, protected and conflicted records." : "Chunk saved; continue or resume the same approval." };
}

export async function rollbackPhotographTextBatchAction(token: string): Promise<{ error?: string; message?: string; results?: TextBatchResult[] }> {
  const { supabase } = await requireAdmin();
  try { identifier(token); } catch { return { error: "Choose the batch approval to roll back." }; }
  const { data, error } = await supabase.rpc("rollback_photograph_text_batch", { p_token: token });
  if (error) return { error: databaseError(error, "The batch could not be rolled back.") };
  refreshText();
  return { results: data.results, message: "Rollback checked. Newer edits were left untouched." };
}

export async function acceptPhotographTextDraftFieldAction(id: string, version: number, field: TextField, currentRevision: number): Promise<TextActionState> {
  const { supabase } = await requireAdmin();
  try {
    identifier(id); revision(version); revision(currentRevision);
    if (!textFields.includes(field)) throw new Error("Choose a valid text field.");
    const { data, error } = await supabase.rpc("accept_photograph_text_field", {
      p_id: id, p_version: version, p_field: field, p_revision: currentRevision,
    });
    if (error) return { error: databaseError(error, "The suggestion or photograph changed. Reload before explicitly replacing this field.") };
    refreshText();
    return { message: "Original AI suggestion applied to the selected field only.", revision: data.revision };
  } catch (error) { return { error: error instanceof Error ? error.message : "Invalid field selection." }; }
}
