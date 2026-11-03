import type { PhotographWithPalette } from "@/lib/photographs/types";

export function PaletteIndicator({
  photograph,
}: {
  photograph: PhotographWithPalette;
}) {
  if (!photograph.palette.length) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="size-1.5 rounded-full bg-foreground" />
        Palette pending
      </span>
    );
  }

  return (
    <div aria-label="Extracted palette" className="flex gap-1">
      {photograph.palette.map((colour) => (
        <span
          className="size-3.5 rounded-full border border-border"
          key={colour.rank}
          style={{ backgroundColor: colour.hex }}
          title={colour.hex}
        />
      ))}
    </div>
  );
}
