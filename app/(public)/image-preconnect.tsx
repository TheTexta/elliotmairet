"use client";

import { preconnect } from "react-dom";

export function ImagePreconnect({ origin }: { origin: string }) {
  preconnect(origin);
  return null;
}
