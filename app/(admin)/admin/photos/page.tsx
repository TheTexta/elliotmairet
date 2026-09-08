import type { Metadata } from "next";

import { getPhotographsWithPalettes } from "@/lib/photographs/queries";
import { requireAdmin } from "@/lib/supabase/admin";

import { AdminPhotographsHeader } from "./admin-header";
import {
  CleanupNotice,
  type StorageCleanupJob,
} from "./cleanup-notice";
import { PhotographRow } from "./photograph-row";

export const metadata: Metadata = {
  title: "Photograph administration",
};

export default async function AdminPhotosPage() {
  const { supabase } = await requireAdmin();
  const [photographs, cleanupResult] = await Promise.all([
    getPhotographsWithPalettes(),
    supabase.rpc("list_storage_cleanup_jobs"),
  ]);
  const cleanupJobs = (cleanupResult.data ?? []) as StorageCleanupJob[];

  if (cleanupResult.error) {
    console.error("admin_storage_cleanup_jobs_failed", {
      message: cleanupResult.error.message,
    });
  }

  return (
    <main className="min-h-svh bg-neutral-100 text-black normal-case">
      <AdminPhotographsHeader count={photographs.length} />
      <section className="px-4 py-6 sm:px-12 sm:py-8">
        <CleanupNotice jobs={cleanupJobs} />

        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[9px] font-medium uppercase text-neutral-600">
              Public archive
            </p>
            <p className="mt-1 text-[10px]">
              Every row shown here is immediately public.
            </p>
          </div>
          <p className="text-[8px] uppercase text-neutral-500">
            JPG · PNG · WEBP
          </p>
        </div>

        <div className="border border-neutral-300 bg-white">
          {photographs.map((photograph) => (
            <PhotographRow key={photograph.id} photograph={photograph} />
          ))}
          {!photographs.length ? (
            <p className="p-8 text-center text-[10px] uppercase text-neutral-500">
              No public photographs
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
