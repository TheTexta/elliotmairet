import type { PhotographPaletteColour } from "./types";

export type PaletteColour = PhotographPaletteColour;

export function deltaE76(first: PaletteColour, second: PaletteColour) {
  const lightnessDelta = first.lab_l - second.lab_l;
  const greenRedDelta = first.lab_a - second.lab_a;
  const blueYellowDelta = first.lab_b - second.lab_b;

  return Math.hypot(lightnessDelta, greenRedDelta, blueYellowDelta);
}

export function paletteChroma(colours: PaletteColour[]) {
  const meanSquaredChroma =
    colours.reduce(
      (sum, colour) => sum + colour.lab_a ** 2 + colour.lab_b ** 2,
      0,
    ) / colours.length;

  return Math.sqrt(meanSquaredChroma);
}

export function palettesShareColourMode(
  sourceColours: PaletteColour[],
  candidateColours: PaletteColour[],
  monochromeThreshold = 1,
) {
  const sourceIsMonochrome = paletteChroma(sourceColours) <= monochromeThreshold;
  const candidateIsMonochrome = paletteChroma(candidateColours) <= monochromeThreshold;

  return sourceIsMonochrome === candidateIsMonochrome;
}

export function closestPaletteMatch(
  selectedColours: PaletteColour[],
  candidateColours: PaletteColour[],
) {
  if (!selectedColours.length || candidateColours.length < selectedColours.length) return;

  let closestMatch: { closestColour: PaletteColour; difference: number } | undefined;
  const differences: number[] = [];
  const matchedColours: PaletteColour[] = [];
  const usedCandidateIndexes = new Set<number>();

  function matchColour(selectedIndex: number) {
    if (selectedIndex === selectedColours.length) {
      const difference = Math.hypot(...differences) / Math.sqrt(differences.length);

      if (!closestMatch || difference < closestMatch.difference) {
        const closestIndex = differences.reduce(
          (bestIndex, componentDifference, index) =>
            componentDifference < differences[bestIndex] ? index : bestIndex,
          0,
        );
        closestMatch = { closestColour: matchedColours[closestIndex], difference };
      }
      return;
    }

    candidateColours.forEach((candidateColour, candidateIndex) => {
      if (usedCandidateIndexes.has(candidateIndex)) return;
      usedCandidateIndexes.add(candidateIndex);
      differences.push(deltaE76(selectedColours[selectedIndex], candidateColour));
      matchedColours.push(candidateColour);
      matchColour(selectedIndex + 1);
      matchedColours.pop();
      differences.pop();
      usedCandidateIndexes.delete(candidateIndex);
    });
  }

  matchColour(0);
  return closestMatch;
}
