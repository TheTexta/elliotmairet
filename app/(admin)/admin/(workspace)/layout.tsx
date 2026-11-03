import { requireAdmin } from "@/lib/supabase/admin";
import { AdminWorkspace } from "../admin-workspace";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
