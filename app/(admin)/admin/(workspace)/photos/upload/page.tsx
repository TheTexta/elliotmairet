import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/admin";
import { AdminPageHeading } from "../../../page-heading";
import { galleryReturnHref } from "../../../photos/archive-state";
import { getAutomaticTextStatusAction } from "../../../photos/automatic-text-actions";
import { UploadForm } from "../../../photos/upload-form";

export const metadata: Metadata = { title: "Upload photograph" };
export const maxDuration = 300;

export default async function UploadPhotographPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  await requireAdmin();
  const [params, automatic] = await Promise.all([searchParams, getAutomaticTextStatusAction()]);
  return <main className="admin-page">
    <AdminPageHeading title="Upload photograph" backHref={galleryReturnHref(params.returnTo)} />
    <UploadForm returnHref={galleryReturnHref(params.returnTo)} automaticAlt={automatic.status ? automatic.status.descriptionAltEnabled ?? false : null} />
  </main>;
}
