import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 min-w-11 max-w-full shrink-0 items-center justify-center gap-2 rounded-none border border-transparent px-4 py-2 text-xs font-medium whitespace-normal transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        outline: "border-input bg-background text-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        destructive: "border-destructive/30 bg-background text-destructive hover:bg-destructive/10",
        link: "text-primary underline underline-offset-4 hover:no-underline",
      },
      size: { default: "", icon: "size-11 p-0" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({ className, variant = "default", size = "default", asChild = false, ...props }:
  ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" data-variant={variant} data-size={size}
    className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
