import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputVariants } from "./input";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <div data-slot="native-select-wrapper" className="relative w-full min-w-0">
    <select data-slot="native-select" className={cn(inputVariants, "appearance-none pr-10", className)} {...props} />
    <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />
  </div>;
}
