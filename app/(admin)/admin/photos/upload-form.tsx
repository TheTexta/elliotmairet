"use client";

import { Plus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  PHOTOGRAPH_BUCKET,
  PHOTOGRAPH_UPLOAD_FORMATS,
  uploadSizeError,
} from "@/lib/photographs/config";
import { createClient } from "@/lib/supabase/client";

const inputClassName =
  "h-10 w-full border border-neutral-300 bg-white px-3 text-base text-black outline-none focus:border-black";

export function UploadForm() {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  const [pending, setPending] = useState(false);

  async function upload(formData: FormData) {
    const file = formData.get("file");

    if (!(file instanceof File)) {
      setState({ error: "Choose an image to upload." });
      return;
    }

    const sizeError = uploadSizeError(file.size);

    if (sizeError) {
      setState({ error: sizeError });
      return;
    }

    if (!(file.type in PHOTOGRAPH_UPLOAD_FORMATS)) {
      setState({ error: "Use a JPG, PNG, or WEBP image." });
      return;
    }

    setPending(true);
    setState({});

    try {
      const originalFilename = file.name.split(/[\\/]/).pop();
      const metadata = {
        filename: originalFilename,
        capturedAt: formData.get("capturedAt"),
        title: formData.get("title"),
        altText: formData.get("altText"),
        sortOrder: formData.get("sortOrder"),
      };
      const prepareResponse = await fetch("/api/admin/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "prepare",
          contentType: file.type,
          size: file.size,
          ...metadata,
        }),
      });
      const prepared = await prepareResponse.json();

      if (!prepareResponse.ok) {
        throw new Error(prepared.error);
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(PHOTOGRAPH_BUCKET)
        .uploadToSignedUrl(prepared.storagePath, prepared.token, file, {
          cacheControl: "31536000",
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error("The image could not be uploaded.");
      }

      const publishResponse = await fetch("/api/admin/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "publish",
          storagePath: prepared.storagePath,
          contentType: file.type,
          ...metadata,
        }),
      });
      const published = await publishResponse.json();

      if (!publishResponse.ok) {
        throw new Error(published.error);
      }

      setState({ message: published.message });
      router.refresh();
      if (detailsRef.current) detailsRef.current.open = false;
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : "The upload failed." });
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="group" ref={detailsRef}>
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 bg-black px-4 text-[10px] text-white marker:hidden">
        <Plus aria-hidden="true" size={15} />
        Upload
      </summary>
      <form
        action={upload}
        className="absolute right-4 z-20 mt-3 grid w-[calc(100vw-2rem)] max-w-xl grid-cols-1 gap-4 border border-neutral-300 bg-white p-5 normal-case shadow-[0_10px_35px_rgba(0,0,0,0.12)] sm:right-[calc(100vw/6)] sm:grid-cols-2"
      >
        <label className="flex flex-col gap-2 text-[9px] uppercase text-neutral-500 sm:col-span-2">
          Image
          <input
            accept="image/jpeg,image/png,image/webp"
            className="w-full border border-dashed border-neutral-400 bg-neutral-50 p-4 text-base text-black file:mr-3 file:border-0 file:bg-black file:px-3 file:py-2 file:text-[9px] file:uppercase file:text-white"
            name="file"
            required
            type="file"
          />
        </label>
        <label className="flex flex-col gap-2 text-[9px] uppercase text-neutral-500">
          Title
          <input className={inputClassName} maxLength={200} name="title" />
        </label>
        <label className="flex flex-col gap-2 text-[9px] uppercase text-neutral-500">
          Captured
          <input className={inputClassName} name="capturedAt" type="date" />
        </label>
        <label className="flex flex-col gap-2 text-[9px] uppercase text-neutral-500 sm:col-span-2">
          Alt text
          <input className={inputClassName} maxLength={500} name="altText" />
        </label>
        <label className="flex flex-col gap-2 text-[9px] uppercase text-neutral-400">
          Sort order
          <input
            className={`${inputClassName} cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400`}
            disabled
            step="1"
            type="number"
          />
        </label>
        <div className="flex items-end justify-end sm:col-span-2">
          <button
            className="flex h-10 items-center gap-2 bg-black px-4 text-[9px] uppercase text-white disabled:cursor-wait disabled:bg-neutral-500"
            disabled={pending}
            type="submit"
          >
            <Upload aria-hidden="true" size={14} />
            {pending ? "Publishing" : "Publish photograph"}
          </button>
        </div>
        {state.error || state.message ? (
          <p
            aria-live="polite"
            className={`text-[9px] uppercase sm:col-span-2 ${state.error ? "border-l-2 border-red-700 pl-3 text-red-800" : "text-neutral-600"}`}
          >
            {state.error ?? state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
