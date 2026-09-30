import { AlertTriangle, Clock3 } from "lucide-react";

import { CleanupRetryButton } from "./cleanup-retry-button";

export type StorageCleanupJob = {
  storage_path: string;
  operation: "upload" | "delete" | "cleanup";
  error_message: string;
  not_before: string;
  cleanup_ready: boolean;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
    timeZoneName: "short",
  }).format(new Date(value));
}

function jobTitle(job: StorageCleanupJob) {
  if (job.operation === "upload") {
    return job.cleanup_ready ? "Unfinished upload" : "Recent upload";
  }

  return job.operation === "delete" ? "Deleted photograph file" : "Unused image file";
}

function CleanupJobRow({ job }: { job: StorageCleanupJob }) {
  return (
    <li className="flex flex-col gap-4 border-t border-neutral-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900">{jobTitle(job)}</p>
        <p className="mt-1 text-sm leading-6 text-neutral-600">
          {job.cleanup_ready ? (
            <>Not in the public archive · Recorded <time dateTime={job.created_at}>{formatDate(job.created_at)}</time></>
          ) : job.operation === "upload" ? (
            <>If this upload does not finish, removal will be available after <time dateTime={job.not_before}>{formatDate(job.not_before)}</time>.</>
          ) : (
            <>Removal will be available after <time dateTime={job.not_before}>{formatDate(job.not_before)}</time>.</>
          )}
        </p>
        <details className="mt-2 text-xs text-neutral-500">
          <summary className="w-fit cursor-pointer underline underline-offset-2 hover:text-neutral-900">
            Technical details
          </summary>
          <div className="mt-2 space-y-1 rounded-sm bg-neutral-100 p-3 leading-5">
            <p className="break-all">Storage path: {job.storage_path}</p>
            <p className="break-words">Recorded status: {job.error_message}</p>
          </div>
        </details>
      </div>
      {job.cleanup_ready ? (
        <CleanupRetryButton storagePath={job.storage_path} />
      ) : (
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-600">
          <Clock3 aria-hidden="true" size={15} />
          Waiting period
        </span>
      )}
    </li>
  );
}

export function CleanupNotice({
  jobs,
  loadError = false,
}: {
  jobs: StorageCleanupJob[];
  loadError?: boolean;
}) {
  if (loadError) {
    return (
      <section className="mb-8 border border-red-300 bg-red-50 p-5" role="alert">
        <h2 className="text-base font-semibold text-red-900">Could not check stored files</h2>
        <p className="mt-2 text-sm leading-6 text-red-900">
          The photo archive is still available. Refresh this page to check for unfinished uploads again.
        </p>
      </section>
    );
  }

  if (!jobs.length) return null;

  const readyJobs = jobs.filter((job) => job.cleanup_ready);
  const waitingJobs = jobs.filter((job) => !job.cleanup_ready);

  return (
    <section aria-labelledby="storage-housekeeping-title" className="mb-8 overflow-hidden border border-neutral-300 bg-white">
      <div className={`flex gap-4 px-5 py-5 sm:px-6 sm:py-6 ${readyJobs.length ? "bg-amber-50" : "bg-neutral-50"}`}>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${readyJobs.length ? "bg-amber-100 text-amber-800" : "bg-neutral-200 text-neutral-700"}`}>
          {readyJobs.length ? <AlertTriangle aria-hidden="true" size={18} /> : <Clock3 aria-hidden="true" size={18} />}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600">Storage housekeeping</p>
          <h2 className="mt-1 text-lg font-semibold leading-7 text-neutral-900" id="storage-housekeeping-title">
            {readyJobs.length
              ? `${readyJobs.length} unused ${readyJobs.length === 1 ? "file is" : "files are"} ready to remove`
              : `${waitingJobs.length} ${waitingJobs.length === 1 ? "file is" : "files are"} in a waiting period`}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-700">
            {readyJobs.length
              ? "These files are not in the public archive. This can happen when an upload is interrupted or a photograph is deleted. Removing them will not remove a published photograph."
              : "A recent upload may still be finishing. Files that do not become public photographs can be removed after the waiting period."}
          </p>
          {readyJobs.length > 0 && waitingJobs.length > 0 ? (
            <p className="mt-2 text-sm text-neutral-600">
              {waitingJobs.length} {waitingJobs.length === 1 ? "other file is" : "other files are"} still in the waiting period.
            </p>
          ) : null}
        </div>
      </div>

      {readyJobs.length > 0 ? (
        <div>
          <h3 className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-600 sm:px-6">
            Ready to remove
          </h3>
          <ul>
            {readyJobs.map((job) => <CleanupJobRow job={job} key={job.storage_path} />)}
          </ul>
        </div>
      ) : null}

      {waitingJobs.length > 0 ? (
        <div>
          <h3 className="border-t border-neutral-200 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-600 sm:px-6">
            Waiting period
          </h3>
          <ul>
            {waitingJobs.map((job) => <CleanupJobRow job={job} key={job.storage_path} />)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
