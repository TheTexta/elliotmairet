import type { ReactNode } from "react";

export function ContentFrame({ children }: { children: ReactNode }) {
  return <div className="px-4 sm:px-[calc(100vw/6)]">{children}</div>;
}