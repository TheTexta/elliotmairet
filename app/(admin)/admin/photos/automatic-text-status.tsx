"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAdminConfirm } from "../confirm-provider";

import { getAutomaticTextStatusAction, refreshAutomaticTextStatusAction, retryAutomaticTextAction, setDescriptionAltAction, type AutomaticTextSummary } from "./automatic-text-actions";
import { hasUnsavedAdminChanges, useUnsavedChanges } from "./unsaved-changes";

const labels: Record<AutomaticTextSummary["jobs"][number]["status"], string> = {
  pending: "Queued", processing: "Generating", budget_paused: "Budget paused", failed: "Failed",
  uncertain: "Payment check needed", review: "Suggestion ready to review", completed: "Completed", skipped: "Skipped",
};

function dollars(micros: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(micros / 1_000_000);
}

function updatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "time unavailable" : new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  }).format(date);
}

export default function AutomaticTextStatus({ initialStatus, loadError = false }: {
  initialStatus: AutomaticTextSummary | null;
  loadError?: boolean | string;
}) {
  const confirm = useAdminConfirm();
  const titleId = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const historyRef = useRef<HTMLDetailsElement>(null);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(loadError ? "Text status could not be loaded. Use Check progress to try again; uploads and photo editing are still available." : "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [received, setReceived] = useState(initialStatus);
  if (received !== initialStatus && !pending) { setReceived(initialStatus); setStatus(initialStatus); }
  const counts = status?.counts ?? {};
  const waiting = (counts.pending ?? 0) + (counts.processing ?? 0);
  const uncertain = Math.max(status?.uncertainCount ?? 0, counts.uncertain ?? 0);
  const active = status?.enabled && status.serverConfigured;
  const attention = (counts.failed ?? 0) + (counts.budget_paused ?? 0) + uncertain;
  useUnsavedChanges(pending);

  async function load() {
    const result = await getAutomaticTextStatusAction();
    if (result.error || !result.status) throw new Error(result.error ?? "No status was returned. Use Check progress to try again.");
    setStatus(result.status);
  }

  function task(work: () => Promise<void>) {
    if (pending) return;
    setError(""); setMessage("");
    startTransition(async () => {
      try { await work(); }
      catch { setError("The operation could not be confirmed. Use Check progress before retrying; uploads are unaffected."); }
    });
  }

  async function retry(job: AutomaticTextSummary["jobs"][number]) {
    if (!await confirm({ title: "Retry paid generation?", description: `Retry generation for ${job.filename}? This may send ${job.kind === "description_alt" ? "the saved title and description" : "an image preview"} for a paid AI request, within the shared $5 monthly automatic-text budget.`, confirmLabel: "Retry generation" })) return;
    task(async () => {
      const result = await retryAutomaticTextAction(job.id);
      if (result.error) { setError(result.error); return; }
      setMessage(result.message ?? "Generation retry queued. Use Check progress to see the result.");
      try { await load(); }
      catch { setError("The retry was queued, but status could not be checked. Use Check progress before attempting another retry."); }
    });
  }

  async function toggleAlt() {
    if (!status || status.descriptionAltRevision === undefined) return;
    if (hasUnsavedAdminChanges()) { setError("Save or discard unfinished edits and uploads before changing automatic alt text."); return; }
    const enabled = !status.descriptionAltEnabled;
    if (!await confirm({ title: enabled ? "Generate alt text from descriptions?" : "Turn off automatic alt text?",
      description: enabled ? "For the whole archive, saving a title or description will send those saved fields to AI and replace the photo’s alt text, including previous manual alt text. Alt text becomes read-only. Requests share the $5 monthly budget. Turning this on does not regenerate existing photos."
        : "Future edits will no longer generate alt text. Existing alt text is kept and becomes editable. In-flight results will not replace it.",
      confirmLabel: enabled ? "Enable automatic alt text" : "Turn off" })) return;
    task(async () => {
      const result = await setDescriptionAltAction(enabled, status.descriptionAltRevision!);
      if (result.error) { setError(result.error); return; }
      setMessage(result.message ?? "Setting saved.");
      await load();
    });
  }

  return <section aria-labelledby={titleId} aria-busy={pending} className="min-w-0 border-y border-border py-3 normal-case">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1 basis-48">
        <h2 id={titleId} className="text-sm font-medium">Automatic text</h2>
        <p className="mt-1 text-xs leading-5">{!status ? "Status unavailable. You can still upload and edit photographs." : !active ? "Currently off. Uploads still work without generated text."
          : waiting ? `${waiting} text ${waiting === 1 ? "update is" : "updates are"} waiting. Your titles and descriptions stay protected.`
          : status.descriptionAltEnabled ? "Edit titles and descriptions; alt text is generated for you." : "New uploads get text automatically. Your wording stays protected."}</p>
      </div>
      <Button type="button" variant="outline" disabled={pending} onClick={() => task(async () => {
        const result = await refreshAutomaticTextStatusAction();
        if (result.error || !result.status) { setError(result.error ?? "No status was returned. Use Check progress to try again."); return; }
        setStatus(result.status); setMessage("Status updated. Unsaved photo edits have been kept.");
      })}>{pending ? "Working…" : "Check progress"}</Button>
    </div>
    {attention || (counts.review ?? 0) > 0 ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4">
      {attention ? <Button type="button" variant="link" className="px-0" aria-controls={`${titleId}-history`} onClick={() => {
        if (detailsRef.current) detailsRef.current.open = true;
        if (historyRef.current) {
          historyRef.current.open = true;
          historyRef.current.querySelector("summary")?.focus();
        }
      }}>Review {attention} text {attention === 1 ? "issue" : "issues"}</Button> : null}
      {(counts.review ?? 0) > 0 ? <a href="#text-review" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-2" onClick={() => {
        const tools = document.getElementById("admin-tools"); const review = document.getElementById("text-review");
        if (tools instanceof HTMLDetailsElement) tools.open = true;
        if (review instanceof HTMLDetailsElement) review.open = true;
      }}>Review {counts.review} {counts.review === 1 ? "suggestion" : "suggestions"}</a> : null}
    </div> : null}
    <details ref={detailsRef} className="mt-1 min-w-0">
      <summary className="min-h-11 cursor-pointer py-3 text-xs focus-visible:outline-2">Text settings and history</summary>
      <div className="space-y-4 border-t border-border py-4">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-64">
        <h3 className="text-sm font-medium">Alt text from descriptions {status?.descriptionAltRevision === undefined ? "" : status.descriptionAltEnabled ? "is on" : "is off"}</h3>
        <p className="mt-1 max-w-prose text-xs leading-5">{!status ? "Settings could not be checked. Use Check progress to reload them; manual alt editing is locked until then."
          : status.descriptionAltRevision === undefined ? "The description-alt migration is required before this setting is available."
          : "Whole archive: AI writes concise alt text from your saved title and description. While enabled, edit those fields instead of alt text. Previous alt text stays live until generation succeeds."}</p>
        {status?.descriptionAltRevision !== undefined ? <p className="mt-1 max-w-prose text-xs leading-5">Generation runs after text changes, within the shared $5/month budget. Enabling this does not regenerate existing photos.</p> : null}
      </div>
      <Button type="button" variant="outline" aria-pressed={Boolean(status?.descriptionAltEnabled)} disabled={pending || status?.descriptionAltRevision === undefined || (!status?.descriptionAltEnabled && !active)} onClick={toggleAlt}>
        {status?.descriptionAltEnabled ? "Turn off automatic alt text" : "Enable automatic alt text"}
      </Button>
    </div>
    <p className="max-w-prose text-sm leading-6">After upload, only blank, unedited fields are filled. When description-driven alt text is enabled, later title/description changes replace alt text only; your saved title and description are never rewritten. Interrupted work is checked daily.</p>
    {status ? <>
      <p className="wrap-anywhere text-sm tabular-nums">{status.month} UTC · {dollars(status.committedMicros)} committed / {dollars(status.budgetMicros)} monthly limit</p>
       <p className="max-w-prose text-xs leading-5">Uploads and description-driven alt text share one $5 USD monthly budget, separate from the $20 catalogue backfill. Committed usage includes held reserves, not just settled charges. Budget-paused text resumes next UTC month; uploads and text saves still succeed.</p>
      <dl className="flex min-w-0 flex-wrap gap-x-6 gap-y-2 text-xs tabular-nums">
        <div className="flex gap-2"><dt>Queued / generating</dt><dd>{waiting}</dd></div>
        <div className="flex gap-2"><dt>Budget paused</dt><dd>{counts.budget_paused ?? 0}</dd></div>
        <div className="flex gap-2"><dt>Failed</dt><dd>{counts.failed ?? 0}</dd></div>
        <div className="flex gap-2"><dt>Charge unknown</dt><dd>{uncertain}</dd></div>
        <div className="flex gap-2"><dt>Draft review</dt><dd>{counts.review ?? 0}</dd></div>
      </dl>
      {uncertain > 0 ? <p className="max-w-prose text-sm">Requests with an unknown charge stay paused to prevent duplicate payments. Ask the site administrator to check the charge before any retry; the reserved amount stays in the budget.</p> : null}
      <details ref={historyRef} id={`${titleId}-history`} className="min-w-0 border-t border-border">
        <summary className="min-h-11 cursor-pointer py-3 text-xs focus-visible:outline-2 focus-visible:outline-black">Recent text updates ({status.jobs.length})</summary>
        <p className="mb-3 max-w-prose text-xs">Up to 100 recent jobs are shown. Counts above cover the queue. Retrying a failed job may make a paid request; unresolved charges are never eligible.</p>
        {status.jobs.length ? <ul className="min-w-0 divide-y divide-border">{status.jobs.map(job => <li key={job.id} className="flex min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="wrap-anywhere text-sm">{job.filename}</p>
             <p className="wrap-anywhere text-xs">{job.kind === "description_alt" ? "Description → alt text · " : ""}{labels[job.status] ?? "Status unavailable"} · {job.attempts} {job.attempts === 1 ? "attempt" : "attempts"}</p>
            <p className="wrap-anywhere text-xs">Updated <time dateTime={job.updatedAt}>{updatedAt(job.updatedAt)}</time></p>
             {job.status === "uncertain" ? <p className="max-w-prose text-xs">Do not retry. The reserved amount is held until the site administrator checks the payment.</p> : null}
            {job.status === "review" ? <p className="max-w-prose text-xs">Continue in Suggested text under Advanced tools.</p> : null}
            {job.status === "failed" && job.attempts >= 2 ? <p className="max-w-prose text-xs">Generation attempt limit reached. You can still edit the photograph text yourself.</p> : null}
          </div>
          {job.status === "failed" && job.attempts < 2 ? <Button type="button" variant="outline" className="self-start sm:shrink-0" disabled={pending || !active} aria-label={`Retry generation for ${job.filename}`} onClick={() => retry(job)}>Retry generation</Button> : null}
        </li>)}</ul> : <p className="pb-3 text-xs">No generation jobs recorded. New uploads are queued here, even while generation is disabled.</p>}
      </details>
    </> : null}
      </div>
    </details>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <p role="status" aria-live="polite" className="wrap-anywhere text-xs">{message || (pending ? "Working…" : "")}</p>
  </section>;
}
