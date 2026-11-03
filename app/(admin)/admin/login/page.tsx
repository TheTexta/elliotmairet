import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/supabase/admin";

import { LoginForm } from "./login-form";
import { AdminHeader } from "../admin-header";

export const metadata: Metadata = {
  title: "Archive admin",
};

export default async function AdminLoginPage() {
  if (await getAdminSession()) {
    redirect("/admin/photos");
  }

  return (
    <>
    <AdminHeader anonymous />
    <main className="admin-page py-12 sm:py-20">
      <section className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-medium">Sign in</h1>
        <p className="mt-3 max-w-xs text-sm leading-6">
          Sign in to manage photographs and site content.
        </p>
        <LoginForm />
        <details className="mt-5 border-t border-border text-sm">
          <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2">Trouble signing in?</summary>
          <p className="pb-3 leading-6">Use an account authorised for this archive. If you need access or a password reset, contact the site administrator.</p>
        </details>
      </section>
    </main>
    </>
  );
}
