"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { photographUrl } from "@/lib/photographs/storage";
import { photographPath } from "@/lib/seo";
import { previewTextFields, textFields, type PhotographTextDraft, type PhotographTextFields, type TextBatchPreview, type TextBatchResult, type TextField } from "@/lib/photographs/text";

import { AdminInput, FormField, adminInputClassName } from "./form-controls";
import {
  acceptPhotographTextDraftFieldAction, applyPhotographTextBatchAction,
  getPhotographTextSnapshotAction, importPhotographTextDraftsAction,
  getPhotographTextBatchAction,
  listPhotographTextDraftsAction, previewPhotographTextBatchAction,
  rollbackPhotographTextBatchAction, savePhotographTextDraftAction,
} from "./text-actions";
import { useUnsavedChanges } from "./unsaved-changes";

const button = "min-h-11 border border-neutral-300 bg-white px-3 py-2 text-xs text-black hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-50";
const fieldLabels: Record<TextField, string> = { title: "Title", description: "Description", alt_text: "Alt text" };
const fieldKeys = { title: "title", description: "description", alt_text: "altText" } as const;
type Filter = "all" | "pending" | "manual" | "conflict";

function downloadJson(value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "photograph-text-snapshot.json";
  link.click();
  URL.revokeObjectURL(url);
}

export function PhotographTextReview({ available }: { available: boolean }) {
  const [opened, setOpened] = useState(false);
  const [drafts, setDrafts] = useState<PhotographTextDraft[]>([]);
  const [total, setTotal] = useState(0);
  const [runId, setRunId] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [offset, setOffset] = useState(0);
  const [pageVersion, setPageVersion] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const [fields, setFields] = useState<TextField[]>([...textFields]);
  const [preview, setPreview] = useState<TextBatchPreview | null>(null);
  const [results, setResults] = useState<TextBatchResult[]>([]);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState("");
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const locked = started && !done;
  useUnsavedChanges(locked || pending);
  const markDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds(current => dirty ? current.includes(id) ? current : [...current, id] : current.filter(value => value !== id));
  }, []);

  function invalidate() {
    setPreview(null); setResults([]); setStarted(false); setDone(false);
  }

  function task(work: () => Promise<void>) {
    setError(""); setMessage("");
    startTransition(async () => {
      try { await work(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "The operation could not be completed. Try again."); }
    });
  }

  async function load(nextOffset = offset, nextFilter = filter) {
    const result = await listPhotographTextDraftsAction({ runId: runId.trim() || undefined, offset: nextOffset, filter: nextFilter });
    if (result.error) throw new Error(result.error);
    setDrafts(result.drafts ?? []); setTotal(result.total ?? 0); setOffset(nextOffset);
  }

  function loadPage(nextOffset: number, nextFilter = filter) {
    if (dirtyIds.length && !window.confirm("Discard unsaved draft edits and load this page?")) return;
    task(async () => { await load(nextOffset, nextFilter); setFilter(nextFilter); invalidate(); setPageVersion(current => current + 1); });
  }

  async function refreshSavedDraft(savedDraft: PhotographTextDraft) {
    const result = await listPhotographTextDraftsAction({ runId: savedDraft.runId, photographId: savedDraft.photographId, filter: "all" });
    const updated = result.drafts?.find(draft => draft.id === savedDraft.id);
    if (result.error || !updated) throw new Error("The change was saved, but its latest version could not be loaded. Refresh suggestions before editing it again; other unsaved drafts are still here.");
    // Refresh only this record. Reloading the page would remount dirty siblings.
    setDrafts(current => current.map(draft => draft.id === updated.id ? updated : draft));
  }

  async function importFile(file: File) {
    if (file.size > 5 * 1024 * 1024) throw new Error("Choose a JSON metadata export no larger than 5 MB.");
    let payload: unknown;
    try { payload = JSON.parse(await file.text()); }
    catch { throw new Error("The file is not valid JSON. Choose the original draft export."); }
    if (!payload || typeof payload !== "object") throw new Error("Choose a version 1 draft export.");
    const envelope = payload as Record<string, unknown>;
    if (envelope.formatVersion !== 1 || typeof envelope.runId !== "string" || !envelope.config || !Array.isArray(envelope.records) || !envelope.records.length) {
      throw new Error("The export must contain formatVersion 1, runId, config and records.");
    }
    // Send only metadata. Provider response bodies and embedded images are not imported.
    const records = envelope.records.map((value: unknown) => {
      if (!value || typeof value !== "object") throw new Error("The export contains an invalid record.");
      const record = value as Record<string, unknown>;
      return Object.fromEntries(["photographId", "filename", "storagePath", "width", "height", "textRevision", "previewSha256", "fields", "responseId", "model", "usage"].map(key => [key, record[key]]));
    });
    invalidate();
    let imported = 0;
    for (let index = 0; index < records.length; index += 20) {
      const result = await importPhotographTextDraftsAction({ formatVersion: 1, runId: envelope.runId, config: envelope.config, records: records.slice(index, index + 20) });
      if (result.error) throw new Error(`Import stopped after ${index} records. ${result.error} Re-importing the same file is safe.`);
      imported += result.imported ?? 0;
      setMessage(`Imported ${Math.min(index + 20, records.length)} of ${records.length} records…`);
    }
    setRunId(envelope.runId);
    setMessage(`Import complete: ${imported} drafts. Nothing was applied. Load the run to review.`);
  }

  async function apply() {
    if (!preview) return;
    if (!started && !window.confirm(`Apply this exact preview for run ${preview.runId}? Only eligible fields will change; manual fields and conflicts are excluded.`)) return;
    setStarted(true);
    let complete = false;
    while (!complete) {
      const result = await applyPhotographTextBatchAction(preview.token);
      if (result.error) throw new Error(`${result.error} The approval token is retained. Resume to reconcile remaining records.`);
      if (typeof result.done !== "boolean") throw new Error("The batch returned no completion status. The approval is retained; resume to reconcile safely.");
      if (result.results) setResults(current => {
        const entries = new Map(current.map(row => [row.draftId, row]));
        for (const row of result.results ?? []) entries.set(row.draftId, row);
        return [...entries.values()];
      });
      complete = result.done === true;
      setMessage(result.message ?? "Applying the next group of up to 20 records…");
    }
    setDone(true); setMessage("Batch complete. Review the recorded results below.");
  }

  return (
    <details id="text-review" className="min-w-0 border border-neutral-300 bg-white normal-case" onToggle={event => {
      if (event.currentTarget.open && !opened && available) {
        try { setRecoveryToken(sessionStorage.getItem("elliot:photograph-text:approval") ?? ""); } catch { /* Recovery also works by copying the token. */ }
        setOpened(true); task(() => load(0));
      }
    }}>
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-black">Suggested text</summary>
      <div className="min-w-0 space-y-6 border-t border-neutral-300 p-3 text-sm sm:p-4">
        <p className="max-w-prose text-neutral-700">Review suggestions that have not been applied. Drafts and review notes are private. Importing or editing them does not change the public site or make a new AI request.</p>
        {!available ? <p role="status">The photograph text migration is required before draft review, import or caption editing is available.</p> : <>
          <details className="min-w-0 border-b border-neutral-200 pb-3">
          <summary className="min-h-11 cursor-pointer py-3 text-xs text-neutral-700">Import or choose a catalogue run (advanced)</summary>
          <fieldset disabled={pending || locked} className="flex min-w-0 flex-wrap items-end gap-3">
            <legend className="mb-3 text-xs uppercase">Prepare and import</legend>
            <button type="button" className={button} onClick={() => task(async () => {
              const result = await getPhotographTextSnapshotAction();
              if (result.error || !result.snapshot) throw new Error(result.error ?? "No snapshot was returned.");
              downloadJson(result.snapshot); setMessage("Snapshot downloaded. Generation remains a separate, locally approved step.");
            })}>Download catalogue snapshot</button>
            <FormField label="Import draft JSON · maximum 5 MB">
              <input type="file" accept="application/json,.json" className="max-w-full text-xs file:mr-2 file:min-h-11 file:border file:border-neutral-300 file:bg-white file:px-3" onChange={event => {
                const file = event.target.files?.[0]; event.target.value = "";
                if (file) task(() => importFile(file));
              }} />
            </FormField>
          </fieldset>
          <fieldset disabled={pending || locked} className="flex min-w-0 flex-wrap items-end gap-3">
            <legend className="mb-3 text-xs uppercase">Find drafts</legend>
            <FormField className="min-w-0 flex-1 basis-56" label="Run ID · blank lists all runs">
              <AdminInput value={runId} onChange={event => { setRunId(event.target.value); setSelection([]); invalidate(); }} placeholder="Run UUID" />
            </FormField>
            {drafts.length ? <FormField className="min-w-0 max-w-full flex-1 basis-56" label="Choose a loaded run"><select className={adminInputClassName} value={drafts.some(draft => draft.runId === runId) ? runId : ""} onChange={event => {
              setRunId(event.target.value); setSelection([]); invalidate();
            }}><option value="">Select a run</option>{[...new Set(drafts.map(draft => draft.runId))].map(id => <option key={id} value={id}>{id}</option>)}</select></FormField> : null}
            <button className={button} type="button" onClick={() => loadPage(0)}>Load suggestions</button>
          </fieldset>
          </details>
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Suggestions to show"><select disabled={pending || locked} className={adminInputClassName} value={filter} onChange={event => loadPage(0, event.target.value as Filter)}>
              <option value="pending">Not yet applied</option><option value="all">All suggestions</option><option value="manual">Manually edited photos</option><option value="conflict">Changed since generation</option>
            </select></FormField>
            <button className={button} disabled={pending || locked} type="button" onClick={() => loadPage(0)}>Refresh suggestions</button>
          </div>
          <div role={error ? "alert" : "status"} aria-live="polite" className="wrap-anywhere text-sm text-neutral-700">{error || message || (pending ? "Working…" : "Ready to review.")}</div>
          <p className="text-xs text-neutral-700">{total ? `${offset + 1}–${Math.min(offset + drafts.length, total)} of ${total} suggestions` : "No suggestions match this filter. Previously applied text is available under All suggestions; normal photo editing is in the archive above."} {dirtyIds.length ? "Save or discard draft edits before previewing a batch." : ""}</p>
          <fieldset disabled={pending || locked} className="min-w-0 space-y-4">
            <legend className="sr-only">Private draft records</legend>
            {drafts.map(draft => <DraftEditor key={`${pageVersion}:${draft.id}:${draft.version}`} draft={draft} selected={selection.includes(draft.id)} onSelect={selected => {
              setSelection(current => selected ? [...current, draft.id] : current.filter(id => id !== draft.id)); invalidate();
            }} onDirty={markDirty} onEdit={invalidate} onSaved={() => refreshSavedDraft(draft)} />)}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button className={button} type="button" disabled={pending || locked || offset === 0} onClick={() => loadPage(Math.max(0, offset - 50))}>Previous 50</button>
            <button className={button} type="button" disabled={pending || locked || offset + 50 >= total} onClick={() => loadPage(offset + 50)}>Next 50</button>
          </div>
          <details className="min-w-0 border-t border-neutral-300 pt-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm">Bulk application and batch recovery (advanced)</summary>
          <fieldset disabled={pending || locked} className="min-w-0 space-y-3 border-t border-neutral-300 pt-4">
            <legend className="px-1 text-xs uppercase">Bulk application</legend>
            <p className="text-xs text-neutral-700">{selection.length ? `${selection.length} selected drafts across loaded pages.` : "No selection: preview all drafts in the specified run, not just this page."} Manual fields and unresolved conflicts are excluded.</p>
            <div className="flex flex-wrap gap-3">{textFields.map(field => <label key={field} className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={fields.includes(field)} onChange={event => {
              setFields(current => event.target.checked ? [...current, field] : current.filter(value => value !== field)); invalidate();
            }} />{fieldLabels[field]}</label>)}</div>
            <button type="button" className={button} disabled={!runId.trim() || !fields.length || !!dirtyIds.length} onClick={() => task(async () => {
              const result = await previewPhotographTextBatchAction(runId.trim(), fields, selection.length ? selection : undefined);
              if (result.error || !result.preview) throw new Error(result.error ?? "No preview was returned.");
              setPreview(result.preview); setResults([]); setStarted(false); setDone(false);
              setRecoveryToken(result.preview.token);
              try { sessionStorage.setItem("elliot:photograph-text:approval", result.preview.token); } catch { /* Token is also displayed for manual recovery. */ }
            })}>Preview exact changes</button>
            <button type="button" className={`${button} ml-2`} disabled={!selection.length} onClick={() => { setSelection([]); invalidate(); }}>Clear selection</button>
          </fieldset>
          <fieldset disabled={pending} className="flex min-w-0 flex-wrap items-end gap-3 border-t border-neutral-300 pt-4">
            <legend className="px-1 text-xs uppercase">Recover an interrupted or completed batch</legend>
            <FormField className="min-w-0 flex-1 basis-56" label="Approval token · only your account can recover it">
              <AdminInput value={recoveryToken} onChange={event => setRecoveryToken(event.target.value)} placeholder="Approval UUID" />
            </FormField>
            <button type="button" className={button} disabled={!recoveryToken.trim() || !!dirtyIds.length} onClick={() => task(async () => {
              const result = await getPhotographTextBatchAction(recoveryToken.trim());
              if (result.error || !result.preview) throw new Error(result.error ?? "The approval could not be recovered.");
              setPreview(result.preview); setRunId(result.preview.runId); setResults(result.results ?? []);
              setFields([...new Set(result.preview.rows.flatMap(previewTextFields))]);
              setStarted(Boolean(result.results?.length)); setDone(result.done ?? false);
              setMessage("Approval and recorded results recovered. Expired approvals need a fresh preview to apply; rollback remains available.");
            })}>Recover approval and results</button>
            <button type="button" className={button} disabled={!preview} onClick={() => {
              if (window.confirm("Release this local preview? Committed changes remain live and recoverable using its approval token.")) invalidate();
            }}>Release local preview</button>
          </fieldset>
          {preview ? <section className="min-w-0 space-y-4 border-t border-neutral-300 pt-4" aria-label="Batch change preview">
            <h3 className="text-sm">Preview · {preview.rows.length} photographs</h3>
            <p className="wrap-anywhere text-xs text-neutral-700">Run {preview.runId} · approval expires {preview.expiresAt}</p>
            <p className="wrap-anywhere text-xs text-neutral-700">Approval token: {preview.token}. Keep this to recover results or roll back unchanged fields after leaving this page.</p>
            <div className="max-h-[60dvh] space-y-4 overflow-y-auto">
              {preview.rows.map(row => <article key={row.draftId} className="min-w-0 border-b border-neutral-200 pb-3">
                <h4 className="wrap-anywhere text-sm">{row.filename} · {row.status}</h4>
                <p className="text-xs text-neutral-700">Eligible: {row.eligibleFields.map(field => fieldLabels[field]).join(", ") || "none"}. Protected: {row.protectedFields.map(field => fieldLabels[field]).join(", ") || "none"}.</p>
                {previewTextFields(row).map(field => <div key={field} className="mt-2 grid min-w-0 gap-2 text-xs sm:grid-cols-2">
                  <p className="whitespace-pre-wrap wrap-anywhere"><strong>{fieldLabels[field]} before:</strong> {row.before[field] ?? "(empty)"}</p>
                  <p className="whitespace-pre-wrap wrap-anywhere"><strong>After{row.eligibleFields.includes(field) ? "" : " · excluded"}:</strong> {row.after[field] ?? "(empty)"}</p>
                </div>)}
              </article>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={`${button} bg-black! text-white!`} type="button" disabled={pending || done || !preview.rows.some(row => row.eligibleFields.length)} onClick={() => task(apply)}>{pending && started ? "Applying…" : started ? "Resume approved batch" : "Confirm and apply eligible fields"}</button>
              <button className={button} type="button" disabled={pending || !started} onClick={() => {
                if (!window.confirm("Roll back this batch? Only unchanged applied fields are restored. Newer manual edits remain protected.")) return;
                task(async () => {
                  const result = await rollbackPhotographTextBatchAction(preview.token);
                  if (result.error) throw new Error(result.error);
                  setResults(result.results ?? []); setDone(true); setMessage(result.message ?? "Rollback completed. Review restored and skipped fields below.");
                });
              }}>Roll back unchanged applied fields</button>
            </div>
            <p className="text-xs text-neutral-700" role="status">{results.length} recorded results{locked && !pending ? ". Batch interrupted: resume using the retained approval above." : ""}</p>
            <ul className="space-y-1 text-xs">{results.map(row => <li key={row.draftId} className="wrap-anywhere">{row.filename}: {row.status} · {row.fields.map(field => fieldLabels[field]).join(", ") || "no fields changed"}</li>)}</ul>
          </section> : null}
          </details>
        </>}
      </div>
    </details>
  );
}

function DraftEditor({ draft, selected, onSelect, onDirty, onEdit, onSaved }: {
  draft: PhotographTextDraft; selected: boolean; onSelect: (selected: boolean) => void;
  onDirty: (id: string, dirty: boolean) => void; onEdit: () => void; onSaved: () => Promise<void>;
}) {
  const [fields, setFields] = useState<PhotographTextFields>(draft.fields);
  const [resolved, setResolved] = useState(draft.notesResolved);
  const [saved, setSaved] = useState({ fields: draft.fields, resolved: draft.notesResolved });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify({ fields, resolved }) !== JSON.stringify(saved);
  useUnsavedChanges(dirty || pending);
  useEffect(() => { onDirty(draft.id, dirty || pending); return () => onDirty(draft.id, false); }, [draft.id, dirty, pending, onDirty]);

  function task(work: () => Promise<void>) {
    setError(""); setMessage("");
    startTransition(async () => {
      try { await work(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "The operation failed. Your edits are retained."); }
    });
  }

  return <article className="min-w-0 border-t border-neutral-300 pt-3">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <label className="flex min-h-11 min-w-0 items-center gap-2 text-xs"><input type="checkbox" checked={selected} onChange={event => onSelect(event.target.checked)} /><span className="wrap-anywhere">{draft.filename} · {draft.status}</span></label>
      <div className="flex flex-wrap gap-3 text-xs"><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={photographUrl(draft.storagePath)} target="_blank" rel="noreferrer">View photograph</a><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={photographPath(draft.filename)} target="_blank" rel="noreferrer">Public page</a></div>
    </div>
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-xs">Review draft · version {draft.version} · revision {draft.baselineRevision} → {draft.currentRevision}</summary>
      <form className="grid min-w-0 gap-3 sm:grid-cols-2" aria-busy={pending} onSubmit={event => {
        event.preventDefault();
        task(async () => {
          const result = await savePhotographTextDraftAction(draft.id, draft.version, fields, resolved);
          if (result.error) throw new Error(result.error);
          setSaved({ fields, resolved }); setMessage(result.message ?? "Private draft saved. No live text changed.");
          await onSaved();
        });
      }}>
        <fieldset disabled={pending} className="contents">
          {textFields.map(field => <div key={field} className="min-w-0 space-y-2 sm:col-span-2">
            <FormField label={`${fieldLabels[field]} · live source: ${draft.sources[field]}${draft.sources[field] === "manual" ? " · protected" : ""}`}>
              <textarea className={`${adminInputClassName} h-auto! py-2`} rows={field === "title" ? 2 : 3} maxLength={field === "title" ? 200 : field === "description" ? 1000 : 500} required value={fields[fieldKeys[field]]} onChange={event => {
                setFields(current => ({ ...current, [fieldKeys[field]]: event.target.value })); onEdit();
              }} />
            </FormField>
            <details className="text-xs text-neutral-700"><summary className="min-h-11 cursor-pointer py-3">Original AI {fieldLabels[field].toLowerCase()}</summary><p className="whitespace-pre-wrap wrap-anywhere">{draft.originalFields[fieldKeys[field]]}</p></details>
            <button type="button" className={button} disabled={dirty} onClick={() => {
              if (!window.confirm(`Replace the live ${fieldLabels[field].toLowerCase()} with this ORIGINAL AI suggestion, including any manual value?\n\n${draft.originalFields[fieldKeys[field]]}\n\nThis is a live change, not a draft save.`)) return;
              task(async () => {
                const result = await acceptPhotographTextDraftFieldAction(draft.id, draft.version, field, draft.currentRevision);
                if (result.error) throw new Error(result.error);
                setMessage(result.message ?? "AI suggestion applied."); onEdit(); await onSaved();
              });
            }}>Replace live {fieldLabels[field].toLowerCase()} with original AI suggestion</button>
          </div>)}
          <FormField className="sm:col-span-2" label="Filename suggestion · draft only, never renames files or routes"><AdminInput maxLength={160} required value={fields.filenameSuggestion} onChange={event => {
            setFields(current => ({ ...current, filenameSuggestion: event.target.value })); onEdit();
          }} /></FormField>
          <div className="min-w-0 space-y-2 text-xs text-neutral-700 sm:col-span-2">
            <p>Private uncertainty notes</p>
            {fields.uncertainties.length ? <ul className="list-disc space-y-1 pl-4">{fields.uncertainties.map((note, index) => <li key={index} className="wrap-anywhere">{note}</li>)}</ul> : <p>No uncertainty notes.</p>}
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={resolved} onChange={event => { setResolved(event.target.checked); onEdit(); }} />Notes reviewed and resolved</label>
            <p>Edited suggestions become manual-owned when applied. Save draft edits before using an original AI suggestion or creating a bulk preview.</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button className={button} type="submit" disabled={!dirty}>{pending ? "Saving…" : "Save private draft"}</button>
            <button className={button} type="button" disabled={!dirty} onClick={() => {
              if (window.confirm("Discard these unsaved draft edits?")) { setFields(saved.fields); setResolved(saved.resolved); onEdit(); }
            }}>Discard edits</button>
          </div>
        </fieldset>
        <p role={error ? "alert" : "status"} className="wrap-anywhere text-xs text-neutral-700 sm:col-span-2">{error || message || (pending ? "Working…" : dirty ? "Unsaved private draft edits" : "Private draft unchanged")}</p>
      </form>
    </details>
  </article>;
}
