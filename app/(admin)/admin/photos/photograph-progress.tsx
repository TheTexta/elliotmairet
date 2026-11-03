"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { refreshAutomaticTextStatusAction, type AutomaticTextSummary } from "./automatic-text-actions";

export function PhotographProgress({ photographId, initialStatus, returnHref = "/admin/photos" }: { photographId: string; initialStatus: AutomaticTextSummary | null; returnHref?: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [received, setReceived] = useState(initialStatus);
  if (received !== initialStatus && !pending) { setReceived(initialStatus); setStatus(initialStatus); }
  const jobs = status?.jobs.filter(job => job.photographId === photographId) ?? [];
  const active = jobs.filter(job => job.status === "pending" || job.status === "processing").length;
  const attention = jobs.some(job => ["failed", "uncertain", "budget_paused", "review"].includes(job.status));
  return <section aria-label="Photograph text progress" className="space-y-3 border-t border-border pt-5 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-medium">Text progress</h2>
      <Button type="button" variant="outline" disabled={pending} onClick={() => {
        setError(""); setMessage("");
        startTransition(async () => {
          try {
            const result = await refreshAutomaticTextStatusAction();
            if (!result.status || result.error) { setError(result.error ?? "Progress could not be checked. Your photo edits are still here."); return; }
            setStatus(result.status); setMessage("Progress checked. Unsaved photo edits have been kept.");
          } catch { setError("Progress could not be checked. Your photo edits are still here; try again."); }
        });
      }}>{pending ? "Checking…" : "Check progress"}</Button>
    </div>
    <p>{!status ? "Text settings could not be checked. Editing titles and descriptions is still available."
      : active ? "Text is queued or generating. Previous alt text stays live until generation succeeds."
      : attention ? "This photograph has a text update that needs attention. Review it in Photo tools."
      : "Save a changed title or description to update automatic alt text when enabled."}</p>
    <Link prefetch={false} href={`/admin/photos/tools?returnTo=${encodeURIComponent(returnHref)}#automatic-text`} className="admin-back-link">Text settings and history</Link>
    {error ? <p role="alert">{error}</p> : null}
    <p role="status">{message}</p>
  </section>;
}
