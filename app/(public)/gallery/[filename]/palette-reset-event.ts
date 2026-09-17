export const paletteResetEventName = "elliotmairet:palette-reset";
export const paletteSelectionStateEventName = "elliotmairet:palette-selection-state";

export type PaletteSelectionStateEvent = CustomEvent<{
  isFiltered: boolean;
}>;

export function announcePaletteSelectionState(isFiltered: boolean) {
  window.dispatchEvent(
    new CustomEvent(paletteSelectionStateEventName, {
      detail: { isFiltered },
    }),
  );
}

export function resetPaletteSelection() {
  window.dispatchEvent(new Event(paletteResetEventName));
}