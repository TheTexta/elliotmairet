import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 min-w-11 max-w-full shrink-0 items-center justify-center gap-2 rounded-none border border-transparent px-4 py-2 text-xs font-medium whitespace-normal transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-dashed disabled:border-foreground disabled:bg-background disabled:text-foreground aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-background hover:text-foreground",
        outline: "border-input bg-background text-foreground hover:bg-primary hover:text-primary-foreground",
        secondary: "border-input bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        destructive: "border-destructive bg-background text-destructive hover:bg-primary hover:text-primary-foreground",
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
