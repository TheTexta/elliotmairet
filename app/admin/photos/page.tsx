import { AlertTriangle, LogOut, Pencil, RotateCcw, Save } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";

import { photographUrl } from "@/app/gallery/archive";
import { getPhotographsWithPalettes } from "@/lib/photographs/queries";
import type { PhotographWithPalette } from "@/lib/photographs/types";
import { requireAdmin } from "@/lib/supabase/admin";

import { retryStorageCleanupAction, signOutAction, updatePhotographAction } from "../actions";
import { DeleteButton } from "./delete-button";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = {
  title: "Photograph administration",
};

const inputClassName =
  "h-10 w-full border border-neutral-300 bg-white px-3 text-base text-black outline-none focus:border-black sm:h-9";

type StorageCleanupJob = {
  storage_path: string;
  operation: "upload" | "delete" | "cleanup";
  error_message: string;
  not_before: string;
  cleanup_ready: boolean;
};

function formatCapturedDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function Palette({ photograph }: { photograph: PhotographWithPalette }) {
  if (!photograph.palette.length) {
    return (
      <span className="flex items-center gap-2 text-[8px] text-neutral-500">
        <span className="size-1.5 rounded-full bg-neutral-500" />
        Palette pending
      </span>
    );
  }

  return (
    <div aria-label="Extracted palette" className="flex gap-1">
      {photograph.palette.map((colour) => (
        <span
          className="size-3.5 rounded-full border border-black/10"
          key={colour.rank}
          style={{ backgroundColor: colour.hex }}
          title={colour.hex}
        />
      ))}
    </div>
  );
}

function EditForm({ photograph }: { photograph: PhotographWithPalette }) {
  const action = updatePhotographAction.bind(null, photograph.id);

  return (
    <details className="relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 px-2 text-[9px] marker:hidden">
        <Pencil aria-hidden="true" size={14} strokeWidth={1.8} />
        Edit
      </summary>
      <form
        action={action}
        className="absolute right-0 z-10 mt-2 grid w-[min(32rem,calc(100vw-3rem))] grid-cols-1 gap-3 border border-neutral-300 bg-white p-4 normal-case shadow-[0_10px_35px_rgba(0,0,0,0.12)] sm:grid-cols-2"
      >
        <label className="flex flex-col gap-2 text-[8px] uppercase text-neutral-500">
          Title
          <input className={inputClassName} defaultValue={photograph.title ?? ""} maxLength={200} name="title" />
        </label>
        <label className="flex flex-col gap-2 text-[8px] uppercase text-neutral-500">
          Captured
          <input className={inputClassName} defaultValue={photograph.capturedAt ?? ""} name="capturedAt" type="date" />
        </label>
        <label className="flex flex-col gap-2 text-[8px] uppercase text-neutral-500 sm:col-span-2">
          Alt text
          <input className={inputClassName} defaultValue={photograph.altText ?? ""} maxLength={500} name="altText" />
        </label>
        <label className="flex flex-col gap-2 text-[8px] uppercase text-neutral-400">
          Sort order
          <input
            className={`${inputClassName} cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400`}
            defaultValue={photograph.sortOrder ?? ""}
            disabled
            step="1"
            type="number"
          />
          <input defaultValue={photograph.sortOrder ?? ""} name="sortOrder" type="hidden" />
        </label>
        <div className="flex items-end justify-end">
          <button className="flex h-9 items-center gap-2 bg-black px-4 text-[8px] uppercase text-white" type="submit">
            <Save aria-hidden="true" size={13} />
            Save
          </button>
        </div>
      </form>
    </details>
  );
}

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
      <header className="flex h-19 items-center justify-between border-b border-neutral-300 bg-neutral-100 px-4 sm:h-22 sm:px-12">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
          <h1 className="text-sm font-medium uppercase sm:text-xl">Photographs</h1>
          <span className="text-[9px] uppercase text-neutral-500">{photographs.length} images</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <form action={signOutAction}>
            <button aria-label="Sign out" className="flex h-10 items-center gap-2 px-2 text-[9px] uppercase" type="submit">
              <LogOut aria-hidden="true" size={15} strokeWidth={1.8} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
          <UploadForm />
        </div>
      </header>

      <section className="px-4 py-6 sm:px-12 sm:py-8">
        {cleanupJobs.length ? (
          <div className="mb-6 border border-red-700 bg-white">
            <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 text-[9px] uppercase text-red-800">
              <AlertTriangle aria-hidden="true" size={14} />
              Storage cleanup required
            </div>
            {cleanupJobs.map((job) => {
              const action = retryStorageCleanupAction.bind(null, job.storage_path);

              return (
                <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between" key={job.storage_path}>
                  <div className="min-w-0">
                    <p className="truncate text-[10px]">{job.storage_path}</p>
                    <p className="mt-1 text-[8px] uppercase text-neutral-500">{job.error_message}</p>
                  </div>
                  <form action={action}>
                    <button
                      className="flex h-9 items-center gap-2 bg-black px-3 text-[8px] uppercase text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
                      disabled={!job.cleanup_ready}
                      type="submit"
                    >
                      <RotateCcw aria-hidden="true" size={13} />
                      {job.cleanup_ready ? "Retry cleanup" : "Waiting for expiry"}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[9px] font-medium uppercase text-neutral-600">Public archive</p>
            <p className="mt-1 text-[10px]">Every row shown here is immediately public.</p>
          </div>
          <p className="text-[8px] uppercase text-neutral-500">JPG · PNG · WEBP / 200 MB max</p>
        </div>

        <div className="border border-neutral-300 bg-white">
          {photographs.map((photograph) => (
            <article
              className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 border-b border-neutral-200 p-3 last:border-b-0 sm:grid-cols-[116px_minmax(210px,1fr)_128px_128px_145px_150px] sm:items-center sm:gap-4 sm:p-4"
              key={photograph.id}
            >
              <Image
                alt={photograph.altText ?? ""}
                className="h-18 w-22.5 bg-neutral-200 object-cover sm:h-19.5 sm:w-29"
                height={photograph.height}
                sizes="(min-width: 640px) 116px, 90px"
                src={photographUrl(photograph.storagePath)}
                width={photograph.width}
              />
              <div className="min-w-0">
                <p className="truncate text-[10px] font-medium sm:text-[11px]">{photograph.filename}</p>
                <p className="mt-2 truncate text-[8px] uppercase text-neutral-500">{photograph.storagePath}</p>
                <div className="mt-2 flex items-center gap-3 sm:hidden">
                  <span className="text-[8px] uppercase text-neutral-500">{formatCapturedDate(photograph.capturedAt)}</span>
                  <Palette photograph={photograph} />
                </div>
              </div>
              <div className="hidden flex-col gap-1.5 sm:flex">
                <span className="text-[8px] uppercase text-neutral-500">Captured</span>
                <span className="text-[9px] uppercase">{formatCapturedDate(photograph.capturedAt)}</span>
              </div>
              <div className="hidden flex-col gap-1.5 sm:flex">
                <span className="text-[8px] uppercase text-neutral-500">Dimensions</span>
                <span className="text-[9px]">{photograph.width} × {photograph.height}</span>
              </div>
              <div className="hidden flex-col gap-2 sm:flex">
                <span className="text-[8px] uppercase text-neutral-500">Palette</span>
                <Palette photograph={photograph} />
              </div>
              <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
                <EditForm photograph={photograph} />
                <DeleteButton id={photograph.id} />
              </div>
            </article>
          ))}
          {!photographs.length ? (
            <p className="p-8 text-center text-[10px] uppercase text-neutral-500">No public photographs</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}