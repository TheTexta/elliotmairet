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
        <h1 className="text-xl font-medium">Elliot Mairêt</h1>
        <p className="mt-3 max-w-xs text-sm leading-6 text-neutral-600">
          Sign in to manage photographs and site content.
        </p>
        <LoginForm />
        <details className="mt-5 border-t border-neutral-300 text-sm">
          <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2">Trouble signing in?</summary>
          <p className="pb-3 leading-6 text-neutral-600">Use an account authorised for this archive. If you need access or a password reset, contact the site administrator.</p>
        </details>
      </section>
    </main>
  );
}
