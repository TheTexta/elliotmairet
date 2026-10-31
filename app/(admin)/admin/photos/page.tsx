import type { Metadata } from "next";

import { getPhotographsWithPalettes } from "@/lib/photographs/queries";
import { requireAdmin } from "@/lib/supabase/admin";
import type { TextSources } from "@/lib/photographs/text";

import { AdminPhotographsHeader } from "./admin-header";
import {
  CleanupNotice,
  type StorageCleanupJob,
} from "./cleanup-notice";
import { PhotographArchive } from "./photograph-archive";
import { PhotographTextReview } from "./text-review";
import AutomaticTextStatus from "./automatic-text-status";
import { getAutomaticTextStatusAction } from "./automatic-text-actions";
import { AdvancedToolsLink } from "./advanced-tools-link";

export const metadata: Metadata = {
  title: "Photograph administration",
};

export default async function AdminPhotosPage() {
  const { supabase } = await requireAdmin();
  const [photographs, cleanupResult, automaticTextResult] = await Promise.all([
    getPhotographsWithPalettes(),
    supabase.rpc("list_storage_cleanup_jobs"),
    getAutomaticTextStatusAction(),
  ]);
  const cleanupJobs = (cleanupResult.data ?? []) as StorageCleanupJob[];
  const textAvailable = photographs.every(photo => photo.textMetadataAvailable);
  const stateResult = textAvailable ? await supabase.rpc("photograph_text_states") : null;
  const sources = (stateResult?.data ?? {}) as Record<string, TextSources>;

  if (cleanupResult.error) {
    console.error("admin_storage_cleanup_jobs_failed", {
      message: cleanupResult.error.message,
    });
  }

  return (
    <main className="min-h-svh bg-neutral-100 text-black normal-case">
      <AdminPhotographsHeader count={photographs.length} />
      <section className="px-4 py-6 sm:px-12 sm:py-8">
        <p className="mb-5 text-sm text-neutral-700">Manage the photographs on your site. Uploads are public immediately; captions can be edited at any time.</p>
        <div className="mb-6"><AutomaticTextStatus initialStatus={automaticTextResult.status ?? null} loadError={automaticTextResult.error} /></div>
        {cleanupResult.error || cleanupJobs.length ? <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 text-sm text-neutral-800">
          <p>{cleanupResult.error ? "File maintenance status could not be checked." : `${cleanupJobs.length} unfinished ${cleanupJobs.length === 1 ? "file is" : "files are"} tracked for cleanup. Archive removals stay effective while file cleanup is pending.`}</p>
          <AdvancedToolsLink>Review file maintenance</AdvancedToolsLink>
        </div> : null}
        <PhotographArchive photographs={photographs.map(photo => ({ ...photo, textSources: sources[photo.id] }))} />
        <details id="admin-tools" className="mt-8 min-w-0 border-t border-neutral-300 pt-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-2">Advanced tools</summary>
          <p className="my-3 max-w-prose text-sm text-neutral-600">Review suggested text, import a catalogue run or recover a batch. These tools are not needed for normal uploads and editing.</p>
          <div className="space-y-6">
            <PhotographTextReview available={textAvailable && !stateResult?.error} />
            <CleanupNotice jobs={cleanupJobs} loadError={Boolean(cleanupResult.error)} />
            {!cleanupJobs.length && !cleanupResult.error ? <p className="text-sm text-neutral-600">File maintenance: no unfinished files need attention.</p> : null}
          </div>
        </details>
      </section>
    </main>
  );
}
