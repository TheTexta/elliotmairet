"use client";

import type { ReactNode } from "react";

export function FullPhotographImage({ children, isPaletteFiltered, onReset }: {
  children: ReactNode;
  isPaletteFiltered: boolean;
  onReset: () => void;
}) {
  return (
    <button
      aria-label="Show photographs matched across the full colour palette"
      className="inline-flex max-h-full max-w-full cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050505]"
      disabled={!isPaletteFiltered}
      onClick={() => {
        if (isPaletteFiltered) {
          onReset();
        }
      }}
      type="button"
    >
      {children}
    </button>
  );
}
