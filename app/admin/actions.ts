"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bucket = "elliotmairet";
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

function revalidatePhotographs(filename?: string) {
  revalidatePath("/");
  revalidatePath("/gallery");
  revalidatePath("/admin/photos");

  if (filename) {
    revalidatePath(`/gallery/${encodeURIComponent(filename)}`);
  }
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

export async function updatePhotographAction(id: string, formData: FormData) {
  if (!uuidPattern.test(id)) {
    throw new Error("Invalid photograph identifier.");
  }

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
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

  revalidatePhotographs(data.filename);
}

export async function deletePhotographAction(id: string) {
  if (!uuidPattern.test(id)) {
    throw new Error("Invalid photograph identifier.");
  }

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .rpc("queue_photograph_deletion", { p_photograph_id: id })
    .single();

  if (error) {
    throw new Error("The photograph could not be deleted.");
  }

  const deletedPhotograph = data as { filename: string; storage_path: string };
  const { data: cleanupReady, error: readinessError } = await supabase.rpc(
    "begin_storage_cleanup_job",
    { job_storage_path: deletedPhotograph.storage_path },
  );

  if (readinessError || !cleanupReady) {
    console.error("admin_storage_cleanup_not_ready", {
      photographId: id,
      storagePath: deletedPhotograph.storage_path,
      message: readinessError?.message ?? "Cleanup is not ready.",
    });
    revalidatePhotographs(deletedPhotograph.filename);
    return;
  }

  const { error: cleanupError } = await supabase.storage.from(bucket).remove([deletedPhotograph.storage_path]);

  if (cleanupError) {
    const { error: logError } = await supabase.rpc("record_storage_cleanup_job", {
      job_photograph_id: id,
      job_storage_path: deletedPhotograph.storage_path,
      job_operation: "cleanup",
      job_error_message: cleanupError.message,
      job_not_before: new Date().toISOString(),
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

  revalidatePhotographs(deletedPhotograph.filename);
}

export async function retryStorageCleanupAction(storagePath: string) {
  if (typeof storagePath !== "string") {
    throw new Error("Invalid storage path.");
  }

  const { supabase } = await requireAdmin();
  const { data: cleanupReady, error: readinessError } = await supabase.rpc(
    "begin_storage_cleanup_job",
    { job_storage_path: storagePath },
  );

  if (readinessError) {
    throw new Error("The cleanup job could not be checked.");
  }

  if (!cleanupReady) {
    throw new Error("Storage cleanup is not ready or the photograph is still public.");
  }

  const { error: cleanupError } = await supabase.storage.from(bucket).remove([storagePath]);

  if (cleanupError) {
    throw new Error("Storage cleanup failed again.");
  }

  const { error: resolveError } = await supabase.rpc("resolve_storage_cleanup_job", {
    job_storage_path: storagePath,
  });

  if (resolveError) {
    throw new Error("The cleanup job could not be resolved.");
  }

  revalidatePath("/admin/photos");
}