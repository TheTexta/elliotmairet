import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const inputVariants = "min-h-11 w-full min-w-0 max-w-full rounded-none border border-input bg-background px-3 py-2 text-base text-foreground outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive file:mr-3 file:min-h-11 file:border-0 file:bg-primary file:px-3 file:text-xs file:text-primary-foreground";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" type={type} className={cn(inputVariants, className)} {...props} />;
}
