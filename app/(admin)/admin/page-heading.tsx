import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function AdminPageHeading({ title, backHref, children }: { title: string; backHref?: string; children?: ReactNode }) {
  return <div className="mb-6 space-y-3">
    {backHref ? <Link className="admin-back-link" prefetch={false} href={backHref}><ArrowLeft aria-hidden="true" size={15} />Back to Photos</Link> : null}
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>
      {children ? <div className="flex flex-wrap items-center gap-3">{children}</div> : null}
    </div>
  </div>;
}
