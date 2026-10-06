import { Images, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getSiteContent } from "@/lib/site-content/queries";
import { requireAdmin } from "@/lib/supabase/admin";

import { signOutAction } from "../actions";
import { ContentForm } from "./content-form";

export const metadata: Metadata = {
  title: "Content administration",
};

export default async function AdminContentPage() {
  await requireAdmin();
  const siteContent = await getSiteContent();

  return (
    <main className="min-h-svh bg-neutral-100 text-black normal-case">
      <header className="flex min-h-19 flex-wrap items-center justify-between gap-3 border-b border-neutral-300 px-4 py-4 sm:min-h-22 sm:px-12">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-sm font-medium uppercase sm:text-xl">Content</h1>
          <span className="text-[9px] uppercase text-neutral-500">Public site</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:gap-3">
          <Link aria-label="Manage photographs" className="flex h-10 items-center gap-2 px-2 text-[9px] uppercase" href="/admin/photos">
            <Images aria-hidden="true" size={15} strokeWidth={1.8} />
            <span className="hidden sm:inline">Photographs</span>
          </Link>
          <form action={signOutAction}>
            <button aria-label="Sign out" className="flex h-10 items-center gap-2 px-2 text-[9px] uppercase" type="submit">
              <LogOut aria-hidden="true" size={15} strokeWidth={1.8} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </header>

      <section className="px-4 py-8 sm:px-12 sm:py-12">
        <ContentForm initialContent={siteContent} />
      </section>
    </main>
  );
}
