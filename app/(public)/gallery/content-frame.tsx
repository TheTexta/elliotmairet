import type { ReactNode } from "react";

export function ContentFrame({ children }: { children: ReactNode }) {
  return <div className="px-[var(--gallery-frame-inset)]">{children}</div>;
}
