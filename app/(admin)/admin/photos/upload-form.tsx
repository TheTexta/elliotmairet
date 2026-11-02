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
import { useUnsavedChanges } from "./unsaved-changes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAdminConfirm } from "../confirm-provider";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function UploadForm({ onBusyChange, automaticAlt = false }: { onBusyChange: (busy: boolean) => void; automaticAlt?: boolean | null }) {
  const confirm = useAdminConfirm();
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
  useUnsavedChanges(busy || Boolean(selection && !succeeded));

  useEffect(() => {
    if (!selection) return;
    return () => URL.revokeObjectURL(selection.preview);
  }, [selection]);

  useEffect(() => () => { dateReadRef.current++; }, []);

  function close() {
    if (upload.isActive()) return;
    setOpen(false);
    toggleRef.current?.focus();
  }

  async function reset() {
    if (selection && !succeeded && !await confirm({ title: "Discard unfinished upload?", description: "Discard this unfinished upload and choose another photo? Any reserved files remain tracked for safe cleanup.", confirmLabel: "Choose another photo", destructive: true })) return;
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
      <Button
        aria-controls={panelId}
        aria-expanded={open}
        className="row-start-3 w-full sm:col-start-2 sm:row-start-1 sm:w-auto sm:justify-self-end xl:col-start-3"
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
        {busy ? "Uploading" : "Upload photo"}
      </Button>
      <section
        aria-labelledby={`${panelId}-title`}
        className={`col-span-full row-start-4 min-w-0 w-full max-w-3xl justify-self-end border border-neutral-300 bg-white p-4 normal-case sm:row-start-3 sm:p-6 xl:row-start-2 ${open ? "" : "hidden"}`}
        hidden={!open}
        id={panelId}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="min-w-0 wrap-anywhere text-base font-medium" id={`${panelId}-title`}>Upload photograph</h2>
          <Button
            aria-label="Close upload panel"
            variant="outline" size="icon"
            disabled={busy}
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </Button>
        </div>
        <p className="mb-5 max-w-prose text-sm leading-6 text-neutral-700">Choose an image and check its capture date. It becomes public when upload finishes. Missing text is generated afterwards; edit its title and description in the archive.</p>
        <form onSubmit={submit} ref={formRef}>
          <fieldset aria-busy={busy} className="grid min-w-0 grid-cols-1 gap-4 disabled:opacity-60 sm:grid-cols-2" disabled={busy || succeeded || retryPublication}>
            <FormField className="sm:col-span-2" label="Image">
              <Input
                accept="image/jpeg,image/png,image/webp"
                className="border-dashed border-neutral-400 bg-neutral-50 p-4"
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
              <span className="text-xs font-normal">JPG, PNG or WEBP · Up to 512 MiB</span>
            </FormField>
            <FormField className="sm:col-span-2" label="Date captured">
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
              <span aria-live="polite" className="text-xs font-normal">
                {readingDate ? "Reading photo date…"
                  : dateSource === "metadata" ? "From photo metadata · Editable"
                  : dateSource === "filename" ? "From filename · Editable"
                  : dateSource === "modified" ? "Using file modification date · Editable" : null}
              </span>
            </FormField>
            <details className="sm:col-span-2">
              <summary className="min-h-11 cursor-pointer py-3 text-sm focus-visible:outline-2">Add your own text (optional)</summary>
              <div className="space-y-4">
                <p className="text-sm text-neutral-600">Leave these blank for automatic text. Anything you write is protected from generation.</p>
                <FormField label="Title"><AdminInput maxLength={200} name="title" /></FormField>
                {automaticAlt !== false ? <p className="text-sm text-neutral-600">{automaticAlt === null ? "Alt text settings could not be checked. Uploads still work without manual alt text; use Check progress to reload the setting."
                  : "Alt text is generated from the saved title and description after upload. Update those fields in Edit photo; alt text is read-only."}</p>
                  : <FormField label="Image description for screen readers (alt text)"><AdminInput maxLength={500} name="altText" /></FormField>}
              </div>
            </details>
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
                <p className="wrap-anywhere text-sm font-medium">{selection.file.name}</p>
                <p className="mt-1 text-xs text-neutral-600">{formatSize(selection.file.size)}</p>
              </div>
            </div>
          ) : null}

          <div aria-atomic="true" className="mt-4 text-sm" role="status">
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
                <div className="min-w-0 wrap-anywhere">
                  <p className="font-medium uppercase">Uploaded</p>
                  <p className="mt-1 text-neutral-600">The photograph is now public.</p>
                  {state.status === "success" && state.automaticText === "queued" ? (
                    <p className="mt-1 text-neutral-600">Your photo is uploaded. Text is generated next; use Check progress in Automatic text to see when it is ready.</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {state.status === "error" ? (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>{state.stage ? `${uploadStageLabels[state.stage]} failed` : "Check your image"}</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
              {retryPublication ? <p className="mt-1">Retry uses the same photo and details.</p> : null}
            </Alert>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {succeeded ? (
              <>
                <Button variant="outline" onClick={close} type="button">Close</Button>
                <Button onClick={reset} type="button"><Plus aria-hidden="true" size={14} />Upload another</Button>
              </>
            ) : (
              <>
                {retryPublication ? <Button variant="outline" onClick={reset} type="button">Choose another photo</Button> : null}
                <Button disabled={busy || readingDate || !selection} type="submit">
                  {busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" size={14} /> : <Upload aria-hidden="true" size={14} />}
                  {busy ? "Uploading" : retryPublication ? "Retry publication" : state.status === "error" ? "Retry upload" : "Upload photograph"}
                </Button>
              </>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
