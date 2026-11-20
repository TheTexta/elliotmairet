import type { TextBatchPreview, TextBatchResult } from "../../../../lib/photographs/text.ts";

export type TextBatchState =
  | { phase: "empty"; preview: null; results: TextBatchResult[] }
  | { phase: "previewed" | "applying" | "interrupted" | "complete"; preview: TextBatchPreview; results: TextBatchResult[] };

export const emptyTextBatch: TextBatchState = { phase: "empty", preview: null, results: [] };

type BatchEvent =
  | { type: "release" }
  | { type: "preview"; preview: TextBatchPreview }
  | { type: "recover"; previous: TextBatchState; preview: TextBatchPreview; results: TextBatchResult[]; done: boolean }
  | { type: "start"; token: string }
  | { type: "interrupt"; token: string }
  | { type: "progress" | "rollback"; token: string; results: TextBatchResult[]; done: boolean };

function reconcile(current: TextBatchResult[], incoming: TextBatchResult[]) {
  const entries = new Map(current.map(row => [row.draftId, row]));
  for (const row of incoming) entries.set(row.draftId, row);
  return [...entries.values()];
}

export function textBatchReducer(state: TextBatchState, event: BatchEvent): TextBatchState {
  if (event.type === "release") return { ...emptyTextBatch };
  if (event.type === "preview") return { phase: "previewed", preview: event.preview, results: [] };
  if (event.type === "recover") {
    // A recovery response belongs to the exact local approval lifetime that
    // requested it. Rollback, release or newer progress supersedes that read.
    if (state !== event.previous) return state;
    const sameApproval = state.preview?.token === event.preview.token;
    if (sameApproval && state.phase === "complete" && !event.done) return state;
    const results = reconcile(sameApproval ? state.results : [], event.results);
    return {
      phase: event.done ? "complete" : results.length || (sameApproval && textBatchLocked(state)) ? "interrupted" : "previewed",
      preview: event.preview, results,
    };
  }
  if (!state.preview || state.preview.token !== event.token) return state;
  if (event.type === "rollback") return { ...state, phase: "complete", results: reconcile([], event.results) };
  // Rollback (or confirmed completion) wins over late same-token apply work.
  if (state.phase === "complete") return state;
  if (event.type === "start") return { ...state, phase: "applying" };
  if (event.type === "interrupt") return { ...state, phase: "interrupted" };
  return { ...state, phase: event.done ? "complete" : "applying", results: reconcile(state.results, event.results) };
}

export function textBatchLocked(state: TextBatchState) {
  return state.phase === "applying" || state.phase === "interrupted";
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function fields(value: unknown): boolean {
  return Array.isArray(value) && value.every(field => ["title", "description", "alt_text"].includes(field));
}

function batchResults(value: unknown): value is TextBatchResult[] {
  return Array.isArray(value) && value.every(row => record(row)
    && typeof row.draftId === "string" && typeof row.filename === "string"
    && typeof row.status === "string" && fields(row.fields));
}

function batchPreview(value: unknown, token: string): value is TextBatchPreview {
  return record(value) && value.token === token && typeof value.runId === "string"
    && typeof value.expiresAt === "string" && Array.isArray(value.rows)
    && value.rows.every(row => record(row) && typeof row.draftId === "string"
      && typeof row.filename === "string" && typeof row.status === "string"
      && ["ready", "conflict", "applied", "protected"].includes(row.status)
      && fields(row.eligibleFields) && fields(row.protectedFields)
      && [row.before, row.after].every(text => record(text)
        && ["title", "description", "alt_text"].every(field => text[field] === null || typeof text[field] === "string")));
}

export function recoverTextBatch(previous: TextBatchState, token: string, response: unknown, dispatch: (event: BatchEvent) => void) {
  if (record(response) && response.error) throw new Error(String(response.error));
  if (!record(response) || !batchPreview(response.preview, token)
    || !batchResults(response.results) || typeof response.done !== "boolean") {
    throw new Error("The approval could not be recovered. The approval and recorded results are retained; try recovery again.");
  }
  dispatch({ type: "recover", previous, preview: response.preview, results: response.results, done: response.done });
  return response.preview;
}

export function rollbackTextBatch(token: string, response: unknown, dispatch: (event: BatchEvent) => void) {
  if (record(response) && response.error) throw new Error(String(response.error));
  if (!record(response) || !batchResults(response.results)
    || (response.message !== undefined && typeof response.message !== "string")) {
    throw new Error("The batch could not be rolled back. The approval and recorded results are retained; recover the approval to reconcile safely.");
  }
  dispatch({ type: "rollback", token, results: response.results, done: true });
}

// Confirmation belongs to the UI. Once approved, every group/retry uses the
// same token; partial responses reconcile by draft ID, never by array position.
export async function applyTextBatch(token: string, apply: (token: string) => Promise<{
  error?: string; done?: boolean; results?: TextBatchResult[]; message?: string;
}>, dispatch: (event: BatchEvent) => void, onMessage: (message: string) => void) {
  dispatch({ type: "start", token });
  try {
    while (true) {
      const result = await apply(token);
      if (record(result) && result.error) throw new Error(`${result.error} The approval token is retained. Resume to reconcile remaining records.`);
      if (!record(result) || typeof result.done !== "boolean") throw new Error("The batch returned no completion status. The approval is retained; resume to reconcile safely.");
      if (!batchResults(result.results) || (result.message !== undefined && typeof result.message !== "string")) {
        throw new Error("The batch returned no valid recorded results. The approval is retained; resume to reconcile safely.");
      }
      dispatch({ type: "progress", token, results: result.results, done: result.done });
      onMessage(result.done ? "Batch complete. Review the recorded results below." : result.message ?? "Applying the next group of up to 20 records…");
      if (result.done) return;
    }
  } catch (error) {
    dispatch({ type: "interrupt", token });
    throw error;
  }
}
