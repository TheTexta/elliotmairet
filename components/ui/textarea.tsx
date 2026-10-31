import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { inputVariants } from "./input";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(inputVariants, "min-h-24 resize-y py-3 leading-relaxed", className)} {...props} />;
}
