import type { ComponentProps, ReactNode } from "react";

export const adminInputClassName =
  "h-10 min-w-0 w-full max-w-full border border-neutral-300 bg-white px-3 text-base text-black outline-none focus:border-black sm:h-9";

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
    <label
      className={`flex min-w-0 flex-col gap-2 wrap-anywhere text-[8px] uppercase text-neutral-500 ${className}`}
    >
      {label}
      {children}
    </label>
  );
}

export function AdminInput(props: ComponentProps<"input">) {
  const { className = "", ...inputProps } = props;

  return (
    <input
      {...inputProps}
      className={`${adminInputClassName} ${className}`}
    />
  );
}
