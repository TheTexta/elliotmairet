import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/supabase/admin";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Archive admin",
};

export default async function AdminLoginPage() {
  if (await getAdminSession()) {
    redirect("/admin/photos");
  }

  return (
    <main className="min-h-svh bg-neutral-100 px-4 py-20 text-black sm:px-[calc(100vw/6)]">
      <section className="mx-auto w-full max-w-sm border-t border-black pt-5">
        <p className="text-[10px] text-neutral-500">Archive administration</p>
        <h1 className="mt-3 text-lg font-medium">Photographs</h1>
        <p className="mt-4 max-w-xs text-[10px] leading-5 text-neutral-600">
          Sign in with an account authorised to manage the public archive.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
