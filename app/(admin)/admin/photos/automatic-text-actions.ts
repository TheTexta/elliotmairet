"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { invalidatePhotographs } from "@/lib/cache-invalidation";
import { processAutomaticPhotographText } from "@/lib/photographs/automatic-text";
import { requireAdmin } from "@/lib/supabase/admin";

export type AutomaticTextSummary = {
  enabled: boolean;
  serverConfigured: boolean;
  descriptionAltEnabled?: boolean;
  descriptionAltRevision?: number;
  month: string;
  budgetMicros: number;
  committedMicros: number;
  counts: Record<string, number>;
  uncertainCount?: number;
  jobs: Array<{
    id: string;
    photographId: string;
    filename: string;
    kind?: "upload" | "description_alt";
    status: "pending" | "processing" | "budget_paused" | "failed" | "uncertain" | "review" | "completed" | "skipped";
    errorCode: string | null;
    attempts: number;
    updatedAt: string;
  }>;
};

function serverConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && (process.env.PHOTOGRAPH_TEXT_WORKER_SECRET?.length ?? 0) >= 32);
}

export async function setDescriptionAltAction(enabled: boolean, revision: number): Promise<{ message?: string; error?: string }> {
  const { supabase } = await requireAdmin();
  if (typeof enabled !== "boolean" || !Number.isSafeInteger(revision) || revision < 0) return { error: "Refresh status before changing automatic alt text." };
  if (enabled && !serverConfigured()) return { error: "Automatic text is not configured on this server. The setting was not changed." };
  const { error } = await supabase.rpc("set_photograph_description_alt", { p_enabled: enabled, p_revision: revision });
  if (error) return { error: "The setting could not be confirmed. Check progress to reload its current value before trying again." };
  revalidatePath("/admin/photos");
  return { message: enabled ? "Automatic alt text enabled. Saving a title or description will queue generation; existing text has not been changed." : "Automatic alt text disabled. Alt text can be edited manually again." };
}

function statusError(code?: string) {
  return code && ["PGRST202", "42883"].includes(code)
    ? "Automatic text is not available until its database migration is installed. Uploads are unaffected."
    : "Automatic text status could not be loaded. Refresh status to try again; uploads are unaffected.";
}

export async function getAutomaticTextStatusAction(): Promise<{ status?: AutomaticTextSummary; error?: string }> {
  const { supabase } = await requireAdmin();
  try {
    const { data, error } = await supabase.rpc("photograph_auto_text_status");
    if (error || !data) return { error: statusError(error?.code) };
    return { status: { ...(data as Omit<AutomaticTextSummary, "serverConfigured">), serverConfigured: serverConfigured() } };
  } catch {
    return { error: statusError() };
  }
}

export async function refreshAutomaticTextStatusAction(): Promise<{ status?: AutomaticTextSummary; error?: string }> {
  // getAutomaticTextStatusAction authenticates before returning any result.
  const result = await getAutomaticTextStatusAction();
  if (result.status) {
    // Explicit recovery for completion committed just before a lost response or
    // process shutdown. Never rerun the provider merely to refresh public text.
    invalidatePhotographs();
    revalidatePath("/admin/photos");
  }
  return result;
}

export async function retryAutomaticTextAction(jobId: string): Promise<{ message?: string; error?: string }> {
  const { supabase } = await requireAdmin();
  if (typeof jobId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return { error: "Choose a valid generation job, then retry." };
  }
  if (!serverConfigured()) return { error: "Automatic text is not configured on this server. No retry was requested." };
  try {
    const { data: photographId, error } = await supabase.rpc("retry_photograph_auto_text", { p_job_id: jobId });
    if (error || typeof photographId !== "string") {
      return { error: "This job could not be retried. Refresh status; only failed jobs without unresolved charges are eligible." };
    }
    after(async () => { await processAutomaticPhotographText({ photographId }); });
    revalidatePath("/admin/photos");
    return { message: "Generation retry queued. It may make a paid request within the monthly budget. Refresh status to check progress." };
  } catch {
    return { error: "The retry could not be confirmed. Refresh status before trying again; a queued job may still run." };
  }
}
