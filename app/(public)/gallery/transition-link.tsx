"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

type TransitionLinkProps = Omit<
  ComponentProps<typeof Link>,
  "scroll" | "transitionTypes"
> & {
  resetScroll?: boolean;
  prefetchOnIntent?: boolean;
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
  onFocus,
  onMouseEnter,
  onNavigate,
  onTouchStart,
  prefetch,
  prefetchOnIntent = false,
  resetScroll = false,
  transitionType,
  ...props
}: TransitionLinkProps) {
  const router = useRouter();

  function prefetchDestination() {
    if (prefetchOnIntent && typeof props.href === "string") {
      router.prefetch(props.href);
    }
  }

  return (
    <Link
      {...props}
      prefetch={prefetchOnIntent ? false : prefetch}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) prefetchDestination();
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (!event.defaultPrevented) prefetchDestination();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        if (!event.defaultPrevented) prefetchDestination();
      }}
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
