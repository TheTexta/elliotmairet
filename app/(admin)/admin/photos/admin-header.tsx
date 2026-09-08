import { FileText, LogOut } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "../actions";
import { UploadForm } from "./upload-form";

export function AdminPhotographsHeader({ count }: { count: number }) {
  return (
    <header className="flex h-19 items-center justify-between border-b border-neutral-300 bg-neutral-100 px-4 sm:h-22 sm:px-12">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
        <h1 className="text-sm font-medium uppercase sm:text-xl">Photographs</h1>
        <span className="text-[9px] uppercase text-neutral-500">
          {count} images
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-3">
        <Link
          className="flex h-10 items-center gap-2 px-2 text-[9px] uppercase"
          href="/admin/content"
        >
          <FileText aria-hidden="true" size={15} strokeWidth={1.8} />
          <span className="hidden sm:inline">Content</span>
        </Link>
        <form action={signOutAction}>
          <button
            aria-label="Sign out"
            className="flex h-10 items-center gap-2 px-2 text-[9px] uppercase"
            type="submit"
          >
            <LogOut aria-hidden="true" size={15} strokeWidth={1.8} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
        <UploadForm />
      </div>
    </header>
  );
}
