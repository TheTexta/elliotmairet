import type { Metadata } from "next";
import { AdminConfirmBoundary } from "./confirm-provider";
import "./admin.css";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="admin-ui min-h-svh bg-background text-foreground normal-case"><AdminConfirmBoundary>{children}</AdminConfirmBoundary></div>;
}
