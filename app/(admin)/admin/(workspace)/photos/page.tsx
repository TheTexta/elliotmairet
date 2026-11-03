import type { Metadata } from "next";
import { getPhotographs } from "@/lib/photographs/queries";
import { requireAdmin } from "@/lib/supabase/admin";
import { getAutomaticTextStatusAction } from "../../photos/automatic-text-actions";
import { photographPreview } from "../../photos/archive-state";
import { PhotographArchive } from "../../photos/photograph-archive";

export const metadata: Metadata = { title: "Photograph administration" };

export default async function AdminPhotosPage() {
  const { supabase } = await requireAdmin();
  const [photographs, cleanup, automatic] = await Promise.all([
    getPhotographs(), supabase.rpc("list_storage_cleanup_jobs"), getAutomaticTextStatusAction(),
  ]);
  const status = automatic.status;
  const counts = status?.counts ?? {};
  const waiting = (counts.pending ?? 0) + (counts.processing ?? 0);
  const attention = (counts.failed ?? 0) + (counts.budget_paused ?? 0) + Math.max(status?.uncertainCount ?? 0, counts.uncertain ?? 0) + (counts.review ?? 0);
  const notices: string[] = [];
  if (!status) notices.push("Text settings are unavailable. You can still upload and edit titles and descriptions; manual alt editing stays locked.");
  if (waiting) notices.push(`${waiting} text ${waiting === 1 ? "update is" : "updates are"} queued or generating.`);
  if (attention) notices.push(`${attention} text ${attention === 1 ? "update needs" : "updates need"} attention.`);
  if (cleanup.error) notices.push("File maintenance status could not be checked.");
  else if (cleanup.data?.length) notices.push(`${cleanup.data.length} unfinished ${cleanup.data.length === 1 ? "file is" : "files are"} tracked for cleanup. Archive removals stay effective.`);
  return <main className="admin-page">
    <PhotographArchive photographs={photographs.map(photographPreview)} automaticAlt={status ? status.descriptionAltEnabled ?? false : null} notices={notices} />
  </main>;
}
