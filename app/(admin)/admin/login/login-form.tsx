"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { loginAction, type AdminActionState } from "../actions";

const initialState: AdminActionState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-10 flex w-full flex-col gap-5">
      <Label className="flex flex-col gap-2">
        Email
        <Input
          autoComplete="email"
          name="email"
          required
          type="email"
        />
      </Label>
      <Label className="flex flex-col gap-2">
        Password
        <Input
          autoComplete="current-password"
          name="password"
          required
          type="password"
        />
      </Label>
      {state.error ? (
        <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>
      ) : null}
      <Button
        className="mt-2 justify-between"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in" : "Sign in"}
        <ArrowRight aria-hidden="true" size={15} strokeWidth={1.8} />
      </Button>
    </form>
  );
}
