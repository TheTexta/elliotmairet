"use client";

import type { ComponentProps } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function AlertDialog(props: ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root {...props} />;
}
export function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay data-slot="alert-dialog-overlay" className="admin-ui fixed inset-0 z-50 bg-background" />
    <AlertDialogPrimitive.Content data-slot="alert-dialog-content"
      className={cn("admin-ui fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-hidden rounded-none border border-border bg-popover p-5 text-popover-foreground normal-case outline-none sm:p-6", className)} {...props} />
  </AlertDialogPrimitive.Portal>;
}
export function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-dialog-header" role="region" aria-label="Confirmation details" tabIndex={0}
    className={cn("min-h-0 space-y-3 overflow-y-auto overscroll-contain text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring", className)} {...props} />;
}
export function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-dialog-footer" className={cn("flex shrink-0 flex-col gap-3 sm:flex-row sm:justify-end", className)} {...props} />;
}
export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title data-slot="alert-dialog-title" className={cn("wrap-anywhere text-base font-medium", className)} {...props} />;
}
export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description data-slot="alert-dialog-description" className={cn("whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}
export function AlertDialogAction({ variant = "default", ...props }: ComponentProps<typeof AlertDialogPrimitive.Action> & Pick<ComponentProps<typeof Button>, "variant">) {
  return <Button variant={variant} asChild><AlertDialogPrimitive.Action data-slot="alert-dialog-action" {...props} /></Button>;
}
export function AlertDialogCancel(props: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <Button variant="outline" asChild><AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" {...props} /></Button>;
}
