import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="min-h-svh bg-neutral-100 text-black normal-case">{children}</div>;
}
