"use client";

import { useLayoutEffect } from "react";

import { clearScrollReset, hasScrollReset } from "./transition-link";

export function ScrollToTop({
  routeKey,
  transitionType,
}: {
  routeKey: string;
  transitionType: string;
}) {
  useLayoutEffect(() => {
    if (!hasScrollReset(transitionType)) {
      return;
    }

    if (transitionType === "photo-to-gallery") {
      document
        .querySelector('[aria-label="Complete photograph archive"]')
        ?.classList.add("suppress-gallery-fade");
    }

    window.scrollTo({
      behavior: "instant" as ScrollBehavior,
      left: 0,
      top: 0,
    });

    const clearResetTimeout = window.setTimeout(
      () => clearScrollReset(transitionType),
      0,
    );

    return () => {
      window.clearTimeout(clearResetTimeout);
    };
  }, [routeKey, transitionType]);

  return null;
}
