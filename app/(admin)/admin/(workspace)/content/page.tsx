import type { Metadata } from "next";

import { getSiteContent } from "@/lib/site-content/queries";
import { requireAdmin } from "@/lib/supabase/admin";

import { ContentForm } from "../../content/content-form";
import { AdminPageHeading } from "../../page-heading";

export const metadata: Metadata = {
  title: "Site content administration",
};

export default async function AdminContentPage() {
  await requireAdmin();
  const siteContent = await getSiteContent();

  return (
    <main className="admin-page">
      <AdminPageHeading title="Site content" />
      <ContentForm initialContent={siteContent} />
    </main>
  );
}
