"use client";

import { FileText, LogOut } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { signOutAction } from "../actions";
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
      <div className="col-span-full flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 xl:col-span-1">
        <h1 className="text-sm font-medium uppercase sm:text-xl">Photographs</h1>
        <span className="text-[9px] uppercase text-neutral-500">
          {count} images
        </span>
      </div>
      <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1 sm:gap-3 xl:col-start-2 xl:row-start-1">
        <Link
          aria-disabled={uploading}
          aria-label="Manage site content"
          className={`flex h-10 items-center gap-2 px-2 text-[9px] uppercase ${uploading ? "cursor-not-allowed text-neutral-400" : ""}`}
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
          <span className="hidden sm:inline">Content</span>
        </Link>
        <form action={signOutAction} onSubmit={(event) => {
          if (uploadingRef.current) event.preventDefault();
        }}>
          <button
            aria-label="Sign out"
            className="flex h-10 items-center gap-2 px-2 text-[9px] uppercase disabled:cursor-not-allowed disabled:text-neutral-400"
            disabled={uploading}
            type="submit"
          >
            <LogOut aria-hidden="true" size={15} strokeWidth={1.8} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
      </div>
      <UploadForm onBusyChange={onBusyChange} />
    </header>
  );
}
