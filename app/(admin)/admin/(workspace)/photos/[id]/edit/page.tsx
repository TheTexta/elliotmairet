import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPhotographById, getPhotographPalette } from "@/lib/photographs/queries";
import { photographUrl } from "@/lib/photographs/storage";
import { uuidPattern, type TextSources } from "@/lib/photographs/text";
import { requireAdmin } from "@/lib/supabase/admin";
import { photographPath } from "@/lib/seo";
import { AdminPageHeading } from "../../../../page-heading";
import { galleryReturnHref } from "../../../../photos/archive-state";
import { getAutomaticTextStatusAction } from "../../../../photos/automatic-text-actions";
import { PhotographEditForm } from "../../../../photos/photograph-edit-form";
import { PhotographProgress } from "../../../../photos/photograph-progress";

export const metadata: Metadata = { title: "Edit photograph" };
export const maxDuration = 300;

export default async function EditPhotographPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const [photograph, palette, automatic, search] = await Promise.all([
    getPhotographById(id), getPhotographPalette(id), getAutomaticTextStatusAction(), searchParams,
  ]);
  if (!photograph) notFound();
  const states = photograph.textMetadataAvailable ? await supabase.rpc("photograph_text_states") : null;
  const sources = (states?.data ?? {}) as Record<string, TextSources>;
  const returnHref = galleryReturnHref(search.returnTo);
  return <main className="admin-page">
    <AdminPageHeading title="Edit photograph" backHref={returnHref}>
      <a className="admin-back-link" aria-label={`View on site: ${photograph.filename}`} href={photographPath(photograph.filename)} target="_blank" rel="noreferrer">View on site</a>
    </AdminPageHeading>
    <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
      <div className="min-w-0 space-y-3 lg:sticky lg:top-24">
        <Image alt={photograph.altText ?? photograph.title ?? ""} src={photographUrl(photograph.storagePath)} width={photograph.width} height={photograph.height}
          sizes="(min-width: 1024px) 46vw, 100vw" className="h-auto max-h-[70svh] w-full object-contain object-top" />
        <p className="wrap-anywhere text-xs">{photograph.filename}</p>
      </div>
      <div className="min-w-0 space-y-6">
        <PhotographEditForm photograph={{ ...photograph, palette, textSources: sources[id] }} returnHref={returnHref}
          automaticAlt={automatic.status ? automatic.status.descriptionAltEnabled ?? false : null} />
        <PhotographProgress photographId={id} initialStatus={automatic.status ?? null} returnHref={returnHref} />
      </div>
    </div>
  </main>;
}
