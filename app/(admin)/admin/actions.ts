"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  invalidatePhotographs,
  invalidatePhotographsAndPalettes,
  invalidateSiteContent,
} from "@/lib/cache-invalidation";
import { PHOTOGRAPH_BUCKET } from "@/lib/photographs/config";
import {
  deletePublishedObject,
  deleteR2ObjectForCleanup,
} from "@/lib/r2/server";
import { requireAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminActionState = {
  error?: string;
  message?: string;
};

function optionalText(formData: FormData, name: string, maximumLength: number) {
  const value = formData.get(name);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length > maximumLength) {
    throw new Error(`${name} is too long.`);
  }

  return trimmed || null;
}

function optionalDate(formData: FormData, fallback?: string | null) {
  const value = optionalText(formData, "capturedAt", 10) ?? fallback ?? null;

  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Captured date must use YYYY-MM-DD.");
  }

  return value;
}

function optionalSortOrder(formData: FormData) {
  const value = optionalText(formData, "sortOrder", 12);

  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Sort order must be a whole number.");
  }

  return parsed;
}

export async function loginAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const email = optionalText(formData, "email", 320);
  const password = formData.get("password");

  if (!email || typeof password !== "string" || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "The email or password is incorrect." };
  }

  const { data: isAdmin, error: authorizationError } = await supabase.rpc("is_admin");

  if (authorizationError || !isAdmin) {
    await supabase.auth.signOut();
    return { error: "This account does not have administrator access." };
  }

  redirect("/admin/photos");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function updateSiteContentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const value = formData.get("footerText");

  if (typeof value !== "string") {
    return { error: "Footer text is required." };
  }

  const footerText = value.replace(/\r\n?/g, "\n");

  if (footerText.length > 2000) {
    return { error: "Footer text must be 2,000 characters or fewer." };
  }

  let seoTitle: string | null;

  try {
    seoTitle = optionalText(formData, "seoTitle", 120);
  } catch {
    return { error: "The SEO fields are too long." };
  }

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("site_content")
    .update({
      footer_text: footerText,
      seo_title: seoTitle,
      updated_at: new Date().toISOString(),
    })
    .eq("singleton", true)
    .select("singleton")
    .maybeSingle();

  if (error || !data) {
    return { error: "The footer text could not be updated." };
  }

  invalidateSiteContent();
  return { message: "Site content updated." };
}

export async function updatePhotographAction(id: string, formData: FormData) {
  if (!uuidPattern.test(id)) {
    throw new Error("Invalid photograph identifier.");
  }

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("photographs")
    .update({
      captured_at: optionalDate(formData),
      title: optionalText(formData, "title", 200),
      alt_text: optionalText(formData, "altText", 500),
      sort_order: optionalSortOrder(formData),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("filename")
    .single();

  if (error) {
    throw new Error("The photograph could not be updated.");
  }

  invalidatePhotographs();
}

export async function deletePhotographAction(id: string) {
  if (!uuidPattern.test(id)) {
    throw new Error("Invalid photograph identifier.");
  }

  const { supabase } = await requireAdmin();
  const storageProvider = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL?.trim()
    ? "r2"
    : "supabase";
  const { data, error } = await supabase
    .rpc("queue_photograph_deletion", {
      p_photograph_id: id,
      p_storage_provider: storageProvider,
    })
    .single();

  if (error) {
    throw new Error("The photograph could not be deleted.");
  }

  const deletedPhotograph = data as { filename: string; storage_path: string };
  const { data: cleanupReady, error: readinessError } = await supabase.rpc(
    "begin_storage_cleanup_job",
    { job_storage_path: deletedPhotograph.storage_path },
  );

  if (readinessError || cleanupReady !== storageProvider) {
    console.error("admin_storage_cleanup_not_ready", {
      photographId: id,
      storagePath: deletedPhotograph.storage_path,
      message: readinessError?.message ?? "Cleanup is not ready.",
    });
    invalidatePhotographsAndPalettes();
    return;
  }

  let cleanupError: Error | null = null;

  try {
    if (storageProvider === "r2") {
      await deletePublishedObject(deletedPhotograph.storage_path);
    } else {
      const { error } = await supabase.storage
        .from(PHOTOGRAPH_BUCKET)
        .remove([deletedPhotograph.storage_path]);

      if (error) throw error;
    }
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error("Unknown R2 cleanup error.");
  }

  if (cleanupError) {
    const { error: logError } = await supabase.rpc("record_storage_cleanup_job", {
      job_photograph_id: id,
      job_storage_path: deletedPhotograph.storage_path,
      job_operation: "cleanup",
      job_error_message: cleanupError.message,
      job_not_before: new Date().toISOString(),
      job_storage_provider: storageProvider,
    });

    console.error("admin_storage_cleanup_failed", {
      photographId: id,
      storagePath: deletedPhotograph.storage_path,
      message: cleanupError.message,
      persisted: !logError,
    });
  } else {
    const { error: resolveError } = await supabase.rpc("resolve_storage_cleanup_job", {
      job_storage_path: deletedPhotograph.storage_path,
    });

    if (resolveError) {
      console.error("admin_storage_cleanup_resolution_failed", {
        storagePath: deletedPhotograph.storage_path,
        message: resolveError.message,
      });
    }
  }

  invalidatePhotographsAndPalettes();
}

export async function retryStorageCleanupAction(
  storagePath: string,
  // useActionState supplies the previous state before the form data.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _previousState: AdminActionState,
): Promise<AdminActionState> {
  if (typeof storagePath !== "string") {
    return { error: "This file could not be identified. Refresh the page and try again." };
  }

  const { supabase } = await requireAdmin();
  const { data: cleanupProvider, error: readinessError } = await supabase.rpc(
    "begin_storage_cleanup_job",
    { job_storage_path: storagePath },
  );

  if (readinessError) {
    console.error("admin_storage_cleanup_check_failed", {
      storagePath,
      message: readinessError.message,
    });
    return { error: "We couldn't check this file. Please try again." };
  }

  if (cleanupProvider !== "r2" && cleanupProvider !== "supabase") {
    return { error: "This file isn't ready to remove. Refresh the page to see its current status." };
  }

  let cleanupError: Error | null = null;

  try {
    if (cleanupProvider === "r2") {
      await deleteR2ObjectForCleanup(storagePath);
    } else {
      const { error } = await supabase.storage.from(PHOTOGRAPH_BUCKET).remove([storagePath]);

      if (error) throw error;
    }
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error("Unknown R2 cleanup error.");
  }

  if (cleanupError) {
    console.error("admin_storage_cleanup_retry_failed", {
      storagePath,
      message: cleanupError.message,
    });
    return { error: "We couldn't remove this file. Please try again later." };
  }

  const { error: resolveError } = await supabase.rpc("resolve_storage_cleanup_job", {
    job_storage_path: storagePath,
  });

  if (resolveError) {
    console.error("admin_storage_cleanup_resolution_failed", {
      storagePath,
      message: resolveError.message,
    });
    return { error: "The file was removed, but its notice could not be cleared. Please try again." };
  }

  invalidatePhotographsAndPalettes();
  revalidatePath("/admin/photos");
  return { message: "Unused file removed." };
}
