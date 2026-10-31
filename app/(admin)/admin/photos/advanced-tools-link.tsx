"use client";

import type { ReactNode } from "react";

export function AdvancedToolsLink({ children = "Advanced tools" }: { children?: ReactNode }) {
  return <a href="#admin-tools" className="inline-flex min-h-11 items-center text-xs underline underline-offset-4 focus-visible:outline-2" onClick={() => {
    const tools = document.getElementById("admin-tools");
    if (tools instanceof HTMLDetailsElement) tools.open = true;
  }}>{children}</a>;
}
