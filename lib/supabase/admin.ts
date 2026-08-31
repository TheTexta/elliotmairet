import { redirect } from "next/navigation";

import { createClient } from "./server";

export async function getAdminSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin");

  if (error) {
    throw new Error("Unable to verify administrator access.");
  }

  return isAdmin ? { supabase, user } : null;
}

export async function requireAdmin() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return session;
}