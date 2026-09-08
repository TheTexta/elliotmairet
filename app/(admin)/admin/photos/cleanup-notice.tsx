import { AlertTriangle, RotateCcw } from "lucide-react";

import { retryStorageCleanupAction } from "../actions";

export type StorageCleanupJob = {
  storage_path: string;
  operation: "upload" | "delete" | "cleanup";
  error_message: string;
  not_before: string;
  cleanup_ready: boolean;
};

export function CleanupNotice({ jobs }: { jobs: StorageCleanupJob[] }) {
  if (!jobs.length) return null;

  return (
    <div className="mb-6 border border-red-700 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 text-[9px] uppercase text-red-800">
        <AlertTriangle aria-hidden="true" size={14} />
        Storage cleanup required
      </div>
      {jobs.map((job) => {
        const action = retryStorageCleanupAction.bind(null, job.storage_path);

        return (
          <div
            className="flex flex-col gap-3 border-b border-neutral-200 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            key={job.storage_path}
          >
            <div className="min-w-0">
              <p className="truncate text-[10px]">{job.storage_path}</p>
              <p className="mt-1 text-[8px] uppercase text-neutral-500">
                {job.error_message}
              </p>
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
  );
}
