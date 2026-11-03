"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SignOutButton } from "./sign-out-button";

export function AdminHeader({ uploading = false, canLeave = () => true, anonymous = false }: {
  uploading?: boolean; canLeave?: () => boolean; anonymous?: boolean;
}) {
  const pathname = usePathname();
  const content = pathname.startsWith("/admin/content");
  const location = anonymous ? "Sign in" : content ? "Site content"
    : pathname.endsWith("/edit") ? "Photos / Edit" : pathname.endsWith("/upload") ? "Photos / Upload"
      : pathname.endsWith("/tools") ? "Photos / Tools" : "Photos";
  function link(href: string, children: ReactNode, active = false, className = "admin-nav-link") {
    return <Link href={href} prefetch={false} className={className} aria-current={active ? "page" : undefined}
      aria-disabled={uploading || undefined} tabIndex={uploading ? -1 : undefined}
      onClick={event => { if (!canLeave()) event.preventDefault(); }}
      onNavigate={event => { if (!canLeave()) event.preventDefault(); }}>{children}</Link>;
  }
  return <header className="admin-header">
    {link(anonymous ? "/" : "/admin/photos", "Elliot Mairet", false, "admin-brand")}
    <p className="admin-location">{location}</p>
    <nav aria-label={anonymous ? "Archive" : "Admin"} className="admin-navigation">
      {anonymous ? link("/", "View site") : <>
        {link("/admin/photos", "Photos", !content)}
        {link("/admin/content", "Site content", content)}
        <SignOutButton disabled={uploading} onAttempt={canLeave} />
      </>}
    </nav>
  </header>;
}
