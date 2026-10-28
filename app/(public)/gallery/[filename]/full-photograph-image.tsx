"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  paletteSelectionStateEventName,
  type PaletteSelectionStateEvent,
  resetPaletteSelection,
} from "./palette-reset-event";

export function FullPhotographImage({ children }: { children: ReactNode }) {
  const [isPaletteFiltered, setIsPaletteFiltered] = useState(false);

  useEffect(() => {
    function handlePaletteSelectionState(event: Event) {
      setIsPaletteFiltered(
        (event as PaletteSelectionStateEvent).detail.isFiltered,
      );
    }

    window.addEventListener(
      paletteSelectionStateEventName,
      handlePaletteSelectionState,
    );
    return () => window.removeEventListener(
      paletteSelectionStateEventName,
      handlePaletteSelectionState,
    );
  }, []);

  return (
    <button
      aria-label="Show photographs matched across the full colour palette"
      className="inline-flex max-h-full max-w-full cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050505]"
      disabled={!isPaletteFiltered}
      onClick={() => {
        if (isPaletteFiltered) {
          resetPaletteSelection();
        }
      }}
      type="button"
    >
      {children}
    </button>
  );
}
