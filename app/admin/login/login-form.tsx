"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";

import { loginAction, type AdminActionState } from "../actions";

const initialState: AdminActionState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-10 flex w-full flex-col gap-5">
      <label className="flex flex-col gap-2 text-[10px] text-neutral-500">
        Email
        <input
          autoComplete="email"
          className="h-11 border border-neutral-300 bg-white px-3 text-base text-black outline-none focus:border-black"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="flex flex-col gap-2 text-[10px] text-neutral-500">
        Password
        <input
          autoComplete="current-password"
          className="h-11 border border-neutral-300 bg-white px-3 text-base text-black outline-none focus:border-black"
          name="password"
          required
          type="password"
        />
      </label>
      {state.error ? (
        <p aria-live="polite" className="border-l-2 border-red-700 pl-3 text-[10px] text-red-800">
          {state.error}
        </p>
      ) : null}
      <button
        className="mt-2 flex h-11 items-center justify-between bg-black px-4 text-[10px] text-white disabled:cursor-wait disabled:bg-neutral-500"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in" : "Sign in"}
        <ArrowRight aria-hidden="true" size={15} strokeWidth={1.8} />
      </button>
    </form>
  );
}