import { Images, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getFooterText } from "@/lib/site-content/queries";
import { requireAdmin } from "@/lib/supabase/admin";

import { signOutAction } from "../actions";
import { ContentForm } from "./content-form";

export const metadata: Metadata = {
  title: "Content administration",
};

export default async function AdminContentPage() {
  await requireAdmin();
  const footerText = await getFooterText();

  return (
    <main className="min-h-svh bg-neutral-100 text-black normal-case">
      <header className="flex h-19 items-center justify-between border-b border-neutral-300 px-4 sm:h-22 sm:px-12">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
          <h1 className="text-sm font-medium uppercase sm:text-xl">Content</h1>
          <span className="text-[9px] uppercase text-neutral-500">Public site</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <Link className="flex h-10 items-center gap-2 px-2 text-[9px] uppercase" href="/admin/photos">
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
        <ContentForm initialText={footerText} />
      </section>
    </main>
  );
}