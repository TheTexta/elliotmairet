"use client";

import { useId, useState, useTransition } from "react";

import { getAutomaticTextStatusAction, refreshAutomaticTextStatusAction, retryAutomaticTextAction, type AutomaticTextSummary } from "./automatic-text-actions";

const button = "min-h-11 max-w-full border border-neutral-300 bg-white px-3 py-2 text-xs text-black hover:bg-neutral-100 active:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-50";
const labels: Record<AutomaticTextSummary["jobs"][number]["status"], string> = {
  pending: "Queued", processing: "Generating", budget_paused: "Budget paused", failed: "Failed",
  uncertain: "Charge unknown · operator review", review: "Private draft review needed", completed: "Completed", skipped: "Skipped",
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
  const titleId = useId();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(loadError ? "Automatic text status could not be loaded. Refresh status to try again; uploads are unaffected." : "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const counts = status?.counts ?? {};
  const waiting = (counts.pending ?? 0) + (counts.processing ?? 0);
  const uncertain = Math.max(status?.uncertainCount ?? 0, counts.uncertain ?? 0);
  const active = status?.enabled && status.serverConfigured;

  async function load() {
    const result = await getAutomaticTextStatusAction();
    if (result.error || !result.status) throw new Error(result.error ?? "No status was returned. Refresh status to try again.");
    setStatus(result.status);
  }

  function task(work: () => Promise<void>) {
    if (pending) return;
    setError(""); setMessage("");
    startTransition(async () => {
      try { await work(); }
      catch { setError("The operation could not be confirmed. Refresh status before retrying; uploads are unaffected."); }
    });
  }

  function retry(job: AutomaticTextSummary["jobs"][number]) {
    if (!window.confirm(`Retry generation for ${job.filename}? This may send an image preview for a paid AI request, within the separate $5 monthly future-upload budget.`)) return;
    task(async () => {
      const result = await retryAutomaticTextAction(job.id);
      if (result.error) { setError(result.error); return; }
      setMessage(result.message ?? "Generation retry queued. Refresh status to check progress.");
      try { await load(); }
      catch { setError("The retry was queued, but status could not be refreshed. Refresh status before attempting another retry."); }
    });
  }

  return <section aria-labelledby={titleId} aria-busy={pending} className="min-w-0 space-y-4 border border-neutral-300 bg-white p-3 normal-case sm:p-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <h2 id={titleId} className="text-xs uppercase">Automatic text · future uploads</h2>
      <button type="button" className={button} disabled={pending} onClick={() => task(async () => {
        const result = await refreshAutomaticTextStatusAction();
        if (result.error || !result.status) { setError(result.error ?? "No status was returned. Try refreshing status again."); return; }
        setStatus(result.status); setMessage("Automatic text status and public text cache refreshed. Photograph edits were not reloaded.");
      })}>{pending ? "Working…" : "Refresh status"}</button>
    </div>
    <p className="max-w-prose text-sm text-neutral-700">
      {!status ? "Automatic generation availability has not been verified. Uploads are unaffected."
        : !status.serverConfigured ? "Not configured on this server. Automatic generation is not active; uploads still succeed."
        : !status.enabled ? "Automatic generation is disabled. Uploads still succeed without generated text."
        : "Automatic generation is enabled for future uploads. Text is processed after upload, with a daily rescue job for queued work."}
    </p>
    <p className="max-w-prose text-xs leading-5 text-neutral-700">Only unset, blank text fields are auto-filled. Manual text and deliberately cleared fields stay protected. Caption choices—Description, Custom and Hidden—are preserved.</p>
    {status ? <>
      <p className="wrap-anywhere text-sm tabular-nums">{status.month} UTC · {dollars(status.committedMicros)} committed / {dollars(status.budgetMicros)} monthly limit</p>
      <p className="max-w-prose text-xs leading-5 text-neutral-700">Future uploads have a $5 USD monthly budget, separate from the $20 catalogue backfill. Committed usage includes held reserves, not just settled charges. Budget-paused text resumes next UTC month; uploads still succeed.</p>
      <dl className="flex min-w-0 flex-wrap gap-x-6 gap-y-2 text-xs tabular-nums">
        <div className="flex gap-2"><dt>Queued / generating</dt><dd>{waiting}</dd></div>
        <div className="flex gap-2"><dt>Budget paused</dt><dd>{counts.budget_paused ?? 0}</dd></div>
        <div className="flex gap-2"><dt>Failed</dt><dd>{counts.failed ?? 0}</dd></div>
        <div className="flex gap-2"><dt>Charge unknown</dt><dd>{uncertain}</dd></div>
        <div className="flex gap-2"><dt>Draft review</dt><dd>{counts.review ?? 0}</dd></div>
      </dl>
      {uncertain > 0 ? <p className="max-w-prose text-sm text-neutral-700">Unknown-charge jobs cannot be retried. Their budget reserve is held until an operator reviews the provider charge; this prevents duplicate paid requests.</p> : null}
      {(counts.review ?? 0) > 0 ? <p className="max-w-prose text-sm text-neutral-700">Open the existing “Private AI draft review” panel to review uncertain text suggestions. No generation retry is needed.</p> : null}
      <details className="min-w-0 border-t border-neutral-300">
        <summary className="min-h-11 cursor-pointer py-3 text-xs focus-visible:outline-2 focus-visible:outline-black">Recent generation history · latest {status.jobs.length} jobs</summary>
        <p className="mb-3 max-w-prose text-xs text-neutral-700">Up to 100 recent jobs are shown. Counts above cover the queue. Retrying a failed job may make a paid request; unresolved charges are never eligible.</p>
        {status.jobs.length ? <ul className="min-w-0 divide-y divide-neutral-200">{status.jobs.map(job => <li key={job.id} className="flex min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="wrap-anywhere text-sm">{job.filename}</p>
            <p className="wrap-anywhere text-xs text-neutral-700">{labels[job.status] ?? "Status unavailable"} · {job.attempts} {job.attempts === 1 ? "attempt" : "attempts"}</p>
            <p className="wrap-anywhere text-xs text-neutral-700">Updated <time dateTime={job.updatedAt}>{updatedAt(job.updatedAt)}</time></p>
            {job.status === "uncertain" ? <p className="max-w-prose text-xs text-neutral-700">Reserve held. Operator charge review required; do not retry.</p> : null}
            {job.status === "review" ? <p className="max-w-prose text-xs text-neutral-700">Continue in the “Private AI draft review” panel.</p> : null}
          </div>
          {job.status === "failed" ? <button type="button" className={`${button} self-start sm:shrink-0`} disabled={pending || !active} aria-label={`Retry generation for ${job.filename}`} onClick={() => retry(job)}>Retry generation</button> : null}
        </li>)}</ul> : <p className="pb-3 text-xs text-neutral-700">No generation jobs recorded. New uploads are queued here, even while generation is disabled.</p>}
      </details>
    </> : null}
    <p role={error ? "alert" : "status"} aria-live="polite" className="wrap-anywhere text-xs text-neutral-700">{error || message || (pending ? "Working…" : "Refresh status to check progress without reloading your photograph edits.")}</p>
  </section>;
}
