"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

type TransitionLinkProps = Omit<
  ComponentProps<typeof Link>,
  "scroll" | "transitionTypes"
> & {
  resetScroll?: boolean;
  transitionType: string;
};

let pendingScrollReset: string | undefined;

export function clearScrollReset(transitionType: string) {
  if (pendingScrollReset === transitionType) {
    pendingScrollReset = undefined;
  }
}

export function hasScrollReset(transitionType: string) {
  return pendingScrollReset === transitionType;
}

export function TransitionLink({
  onNavigate,
  resetScroll = false,
  transitionType,
  ...props
}: TransitionLinkProps) {
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        onNavigate?.(event);

        if (resetScroll) {
          pendingScrollReset = transitionType;
        }
      }}
      scroll={resetScroll ? false : undefined}
      transitionTypes={[transitionType]}
    />
  );
}