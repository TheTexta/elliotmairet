import { Images } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getSiteContent } from "@/lib/site-content/queries";
import { requireAdmin } from "@/lib/supabase/admin";

import { SignOutButton } from "../sign-out-button";
import { ContentForm } from "./content-form";

export const metadata: Metadata = {
  title: "Site content administration",
};

export default async function AdminContentPage() {
  await requireAdmin();
  const siteContent = await getSiteContent();

  return (
    <main className="min-h-svh bg-neutral-100 text-black normal-case">
      <header className="flex min-h-19 flex-wrap items-center justify-between gap-3 border-b border-neutral-300 px-4 py-4 sm:min-h-22 sm:px-12">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-lg font-medium uppercase sm:text-xl">Site content</h1>
        </div>
        <nav aria-label="Admin" className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:gap-3">
          <Link className="flex min-h-11 items-center gap-1 px-2 text-xs hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black" href="/admin/photos">
            <Images aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>Photos</span>
          </Link>
          <Link aria-current="page" className="flex min-h-11 items-center border-b border-black px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black" href="/admin/content">Site content</Link>
          <SignOutButton />
        </nav>
      </header>

      <section className="px-4 py-6 sm:px-12 sm:py-8">
        <ContentForm initialContent={siteContent} />
      </section>
    </main>
  );
}
