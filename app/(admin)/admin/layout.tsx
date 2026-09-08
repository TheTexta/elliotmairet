export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="min-h-svh bg-neutral-100 text-black normal-case">{children}</div>;
}
