"use client";

import { useEffect } from "react";

export function ScrollToTop({ routeKey }: { routeKey: string }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  return null;
}