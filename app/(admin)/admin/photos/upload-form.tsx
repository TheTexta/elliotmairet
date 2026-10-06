"use client";

import { Check, ImageIcon, LoaderCircle, Plus, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { detectUploadDate, type UploadDate } from "@/lib/photographs/upload-date";
import {
  createPhotographUpload,
  isUploading,
  uploadStageLabels,
  type UploadState,
} from "@/lib/photographs/upload";

import { AdminInput, FormField } from "./form-controls";

const buttonClassName =
  "flex h-10 items-center justify-center gap-2 bg-black px-4 text-[9px] uppercase text-white disabled:cursor-not-allowed disabled:bg-neutral-500";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function UploadForm({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const panelId = useId();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const dateReadRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [capturedAt, setCapturedAt] = useState("");
  const [dateSource, setDateSource] = useState<UploadDate["source"] | null>(null);
  const [readingDate, setReadingDate] = useState(false);
  const [selection, setSelection] = useState<{ file: File; preview: string } | null>(null);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [upload] = useState(() => createPhotographUpload((next) => {
    setState(next);
    onBusyChange(isUploading(next));
  }));
  const busy = isUploading(state);
  const succeeded = state.status === "success";
  const retryPublication = state.status === "error" && state.retryPublication;

  useEffect(() => {
    if (!selection) return;
    return () => URL.revokeObjectURL(selection.preview);
  }, [selection]);

  useEffect(() => () => { dateReadRef.current++; }, []);

  useEffect(() => {
    if (!busy) return;

    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [busy]);

  function close() {
    if (upload.isActive()) return;
    setOpen(false);
    toggleRef.current?.focus();
  }

  function reset() {
    if (!upload.reset()) return;
    dateReadRef.current++;
    formRef.current?.reset();
    setSelection(null);
    setCapturedAt("");
    setDateSource(null);
    setReadingDate(false);
    requestAnimationFrame(() => fileRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (upload.isActive() || succeeded || readingDate) return;

    // Read the entire form before any fields are disabled.
    const data = new FormData(event.currentTarget);
    const file = selection?.file;
    if (!file) {
      fileRef.current?.focus();
      return;
    }

    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === "string" ? value : null;
    };
    const completed = await upload.submit(file, {
      filename: file.name.split(/[\\/]/).pop() ?? file.name,
      capturedAt: text("capturedAt"),
      title: text("title"),
      altText: text("altText"),
      sortOrder: text("sortOrder"),
    });

    if (completed) router.refresh();
  }

  return (
    <div className="contents" onKeyDown={(event) => {
      if (event.key !== "Escape" || !open) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={`${buttonClassName} col-start-2 row-start-2 justify-self-end text-[10px] xl:col-start-3 xl:row-start-1`}
        disabled={busy}
        onClick={() => {
          if (upload.isActive()) return;
          if (open) close();
          else {
            setOpen(true);
            requestAnimationFrame(() => fileRef.current?.focus());
          }
        }}
        ref={toggleRef}
        type="button"
      >
        {busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" size={15} /> : <Plus aria-hidden="true" size={15} />}
        {busy ? "Uploading" : "Upload"}
      </button>
      <section
        aria-labelledby={`${panelId}-title`}
        className={`col-span-full row-start-3 min-w-0 w-full border border-neutral-300 bg-white p-4 normal-case sm:p-5 xl:absolute xl:top-full xl:right-12 xl:z-20 xl:col-auto xl:row-auto xl:mt-3 xl:max-h-[calc(100dvh-7rem)] xl:w-[calc(100%-6rem)] xl:max-w-xl xl:overflow-y-auto xl:overscroll-contain xl:shadow-[0_10px_35px_rgba(0,0,0,0.12)] ${open ? "" : "hidden"}`}
        hidden={!open}
        id={panelId}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="min-w-0 wrap-anywhere text-[11px] font-medium uppercase" id={`${panelId}-title`}>Upload photograph</h2>
          <button
            aria-label="Close upload panel"
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-neutral-300 disabled:cursor-not-allowed disabled:text-neutral-400"
            disabled={busy}
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
        <form onSubmit={submit} ref={formRef}>
          <fieldset aria-busy={busy} className="grid min-w-0 grid-cols-1 gap-4 disabled:opacity-60 sm:grid-cols-2" disabled={busy || succeeded || retryPublication}>
            <FormField className="sm:col-span-2" label="Image">
              <input
                accept="image/jpeg,image/png,image/webp"
                className="w-full min-w-0 border border-dashed border-neutral-400 bg-neutral-50 p-4 text-base text-black file:mr-3 file:border-0 file:bg-black file:px-3 file:py-2 file:text-[9px] file:uppercase file:text-white disabled:cursor-not-allowed"
                name="file"
                onChange={(event) => {
                  if (upload.isActive()) return;
                  const file = event.currentTarget.files?.[0];
                  const dateRead = ++dateReadRef.current;
                  upload.reset(Boolean(file));
                  setSelection(file ? { file, preview: URL.createObjectURL(file) } : null);
                  setCapturedAt("");
                  setDateSource(null);
                  setReadingDate(Boolean(file));
                  if (file) void detectUploadDate(file).then((date) => {
                    if (dateReadRef.current !== dateRead) return;
                    setCapturedAt(date?.value ?? "");
                    setDateSource(date?.source ?? null);
                    setReadingDate(false);
                  });
                }}
                ref={fileRef}
                required
                type="file"
              />
              <span className="text-[9px] normal-case">JPG, PNG or WEBP · Up to 512 MiB</span>
            </FormField>
            <FormField label="Title"><AdminInput maxLength={200} name="title" /></FormField>
            <FormField label="Captured">
              <AdminInput
                name="capturedAt"
                onChange={(event) => {
                  dateReadRef.current++;
                  setCapturedAt(event.currentTarget.value);
                  setDateSource(null);
                  setReadingDate(false);
                }}
                type="date"
                value={capturedAt}
              />
              <span aria-live="polite" className="text-[9px] normal-case">
                {readingDate ? "Reading photo date…"
                  : dateSource === "metadata" ? "From photo metadata · Editable"
                  : dateSource === "filename" ? "From filename · Editable"
                  : dateSource === "modified" ? "Using file modification date · Editable" : null}
              </span>
            </FormField>
            <FormField className="sm:col-span-2" label="Alt text"><AdminInput maxLength={500} name="altText" /></FormField>
          </fieldset>

          {selection ? (
            <div className="mt-4 flex items-center gap-3 border border-neutral-200 bg-neutral-50 p-3">
              <div className="relative h-16 w-20 shrink-0 overflow-hidden bg-neutral-200">
                <ImageIcon aria-hidden="true" className="absolute inset-0 m-auto text-neutral-400" size={20} />
                {/* A local blob URL needs no server image optimization. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Selected photograph preview"
                  className="relative h-full w-full object-cover"
                  key={selection.preview}
                  onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                  src={selection.preview}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium" title={selection.file.name}>{selection.file.name}</p>
                <p className="mt-1 text-[9px] text-neutral-500">{formatSize(selection.file.size)}</p>
              </div>
            </div>
          ) : null}

          <div aria-atomic="true" className="mt-4 text-[10px]" role="status">
            {busy ? (
              <div className="flex items-start gap-2">
                <LoaderCircle aria-hidden="true" className="shrink-0 animate-spin motion-reduce:animate-none" size={15} />
                <div className="min-w-0 wrap-anywhere">
                  <p className="font-medium uppercase">Uploading</p>
                  <p className="mt-1 text-neutral-600">{uploadStageLabels[state.status]}</p>
                  <p className="mt-1 text-neutral-600">Keep this page open until the photograph is uploaded.</p>
                </div>
              </div>
            ) : succeeded ? (
              <div className="flex items-start gap-2">
                <Check aria-hidden="true" className="shrink-0" size={15} />
                <div className="min-w-0 wrap-anywhere"><p className="font-medium uppercase">Uploaded</p><p className="mt-1 text-neutral-600">The photograph is now public.</p></div>
              </div>
            ) : null}
          </div>

          {state.status === "error" ? (
            <div className="mt-4 min-w-0 wrap-anywhere border-l-2 border-red-700 pl-3 text-[10px] text-red-800" role="alert">
              <p className="font-medium">{state.stage ? `${uploadStageLabels[state.stage]} failed` : "Check your image"}</p>
              <p className="mt-1">{state.message}</p>
              {retryPublication ? <p className="mt-1">Retry uses the same photo and details.</p> : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {succeeded ? (
              <>
                <button className="h-10 border border-neutral-300 px-4 text-[9px] uppercase" onClick={close} type="button">Close</button>
                <button className={buttonClassName} onClick={reset} type="button"><Plus aria-hidden="true" size={14} />Upload another</button>
              </>
            ) : (
              <>
                {retryPublication ? <button className="h-10 border border-neutral-300 px-4 text-[9px] uppercase" onClick={reset} type="button">Choose another photo</button> : null}
                <button className={buttonClassName} disabled={busy || readingDate || !selection} type="submit">
                  {busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" size={14} /> : <Upload aria-hidden="true" size={14} />}
                  {busy ? "Uploading" : retryPublication ? "Retry publication" : state.status === "error" ? "Retry upload" : "Upload photograph"}
                </button>
              </>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
