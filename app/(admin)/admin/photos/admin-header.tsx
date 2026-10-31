"use client";

import { FileText, Images } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { SignOutButton } from "../sign-out-button";
import { UploadForm } from "./upload-form";

export function AdminPhotographsHeader({ count }: { count: number }) {
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const onBusyChange = useCallback((busy: boolean) => {
    uploadingRef.current = busy;
    setUploading(busy);
  }, []);

  return (
    <header className="relative grid min-h-19 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-b border-neutral-300 bg-neutral-100 px-4 py-4 sm:px-12 xl:min-h-22 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:py-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-lg font-medium uppercase sm:text-xl">Photographs</h1>
        <span className="text-xs text-neutral-600">
          {count} images
        </span>
      </div>
      <nav aria-label="Admin" className="col-span-full col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1 sm:gap-3 xl:col-span-1 xl:col-start-2 xl:row-start-1">
        <Link aria-current="page" href="/admin/photos" className="flex min-h-11 items-center gap-1 border-b border-black px-2 text-xs uppercase focus-visible:outline-2">
          <Images aria-hidden="true" size={15} strokeWidth={1.8} />Photos
        </Link>
        <Link
          aria-disabled={uploading}
          aria-label="Manage site content"
          className={`flex min-h-11 items-center gap-1 px-2 text-xs uppercase focus-visible:outline-2 ${uploading ? "cursor-not-allowed text-neutral-500" : "hover:bg-neutral-200"}`}
          href="/admin/content"
          onClick={(event) => {
            if (uploadingRef.current) event.preventDefault();
          }}
          onNavigate={(event) => {
            if (uploadingRef.current) event.preventDefault();
          }}
          tabIndex={uploading ? -1 : undefined}
        >
          <FileText aria-hidden="true" size={15} strokeWidth={1.8} />
          <span>Site content</span>
        </Link>
        <SignOutButton disabled={uploading} onAttempt={() => !uploadingRef.current} />
      </nav>
      <UploadForm onBusyChange={onBusyChange} />
    </header>
  );
}
