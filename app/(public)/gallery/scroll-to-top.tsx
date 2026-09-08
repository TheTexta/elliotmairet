"use client";

import { useLayoutEffect } from "react";

import { clearScrollReset, hasScrollReset } from "./transition-link";

export function ScrollToTop({
  routeKey,
  transitionTypes,
}: {
  routeKey: string;
  transitionTypes: string | string[];
}) {
  useLayoutEffect(() => {
    const types = Array.isArray(transitionTypes)
      ? transitionTypes
      : [transitionTypes];
    const pendingType = types.find(hasScrollReset);

    if (!pendingType) {
      return;
    }

    if (pendingType === "photo-to-gallery") {
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
      () => clearScrollReset(pendingType),
      0,
    );

    return () => {
      window.clearTimeout(clearResetTimeout);
    };
  }, [routeKey, transitionTypes]);

  return null;
}
