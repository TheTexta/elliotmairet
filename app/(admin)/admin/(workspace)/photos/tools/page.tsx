import type { Metadata } from "next";
import { getPhotographs } from "@/lib/photographs/queries";
import { requireAdmin } from "@/lib/supabase/admin";
import { AdminPageHeading } from "../../../page-heading";
import { galleryReturnHref } from "../../../photos/archive-state";
import { getAutomaticTextStatusAction } from "../../../photos/automatic-text-actions";
import AutomaticTextStatus from "../../../photos/automatic-text-status";
import { CleanupNotice, type StorageCleanupJob } from "../../../photos/cleanup-notice";
import { PhotographTextReview } from "../../../photos/text-review";

export const metadata: Metadata = { title: "Photo tools" };
export const maxDuration = 300;

export default async function PhotoToolsPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { supabase } = await requireAdmin();
  const [params, photographs, cleanup, automatic] = await Promise.all([
    searchParams, getPhotographs(), supabase.rpc("list_storage_cleanup_jobs"), getAutomaticTextStatusAction(),
  ]);
  const available = photographs.every(photo => photo.textMetadataAvailable);
  const states = available ? await supabase.rpc("photograph_text_states") : null;
  const automaticAlt = automatic.status ? automatic.status.descriptionAltEnabled ?? false : null;
  return <main className="admin-page">
    <AdminPageHeading title="Photo tools" backHref={galleryReturnHref(params.returnTo)} />
    <div className="max-w-4xl space-y-8">
      <section id="automatic-text" className="scroll-mt-32"><AutomaticTextStatus initialStatus={automatic.status ?? null} loadError={automatic.error} /></section>
      <details id="admin-tools" className="border-t border-border pt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-2">Advanced tools</summary>
        <p className="my-3 max-w-prose text-sm leading-6">Review suggested text, import a catalogue run or recover a batch. These tools are not needed for normal uploads and editing.</p>
        <PhotographTextReview automaticAlt={automaticAlt} available={available && !states?.error} />
      </details>
      <section id="file-maintenance" className="scroll-mt-32"><CleanupNotice jobs={(cleanup.data ?? []) as StorageCleanupJob[]} loadError={Boolean(cleanup.error)} /></section>
    </div>
  </main>;
}
