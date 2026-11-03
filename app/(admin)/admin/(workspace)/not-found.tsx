import Link from "next/link";
import { AdminPageHeading } from "../page-heading";

export default function AdminNotFound() {
  return <main className="admin-page">
    <AdminPageHeading title="Photograph not found" backHref="/admin/photos" />
    <p className="max-w-prose text-sm leading-6">This photograph may have been removed, or its address is incorrect.</p>
    <Link href="/admin/photos" className="admin-back-link">Find another photograph</Link>
  </main>;
}
