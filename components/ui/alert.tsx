import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full min-w-0 space-y-2 rounded-none border p-3 text-sm leading-relaxed", {
  variants: { variant: { default: "border-border bg-background text-foreground", destructive: "border-destructive/30 bg-background text-destructive" } },
  defaultVariants: { variant: "default" },
});
export function Alert({ className, variant, ...props }: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
export function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("font-medium", className)} {...props} />;
}
export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("whitespace-pre-wrap wrap-anywhere", className)} {...props} />;
}
