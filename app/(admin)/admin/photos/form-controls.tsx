import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormField({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <Label
      className={`flex min-w-0 flex-col gap-2 wrap-anywhere text-xs font-medium ${className}`}
    >
      {label}
      {children}
    </Label>
  );
}

export function AdminInput(props: ComponentProps<"input">) {
  return <Input {...props} />;
}
