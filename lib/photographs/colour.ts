import type { PhotographPaletteColour } from "./types";

export type PaletteColour = Pick<
  PhotographPaletteColour,
  "hex" | "lightness" | "axisA" | "axisB" | "featureSpace"
>;

export function deltaE76(first: PaletteColour, second: PaletteColour) {
  const lightnessDelta = first.lightness - second.lightness;
  const greenRedDelta = first.axisA - second.axisA;
  const blueYellowDelta = first.axisB - second.axisB;

  return Math.hypot(lightnessDelta, greenRedDelta, blueYellowDelta);
}

export function paletteChroma(colours: PaletteColour[]) {
  const meanSquaredChroma =
    colours.reduce(
      (sum, colour) => sum + colour.axisA ** 2 + colour.axisB ** 2,
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
  if (!selectedColours.length || !candidateColours.length) return;

  let closestMatch: { closestColour: PaletteColour; difference: number } | undefined;
  const differences: number[] = [];
  const matchedColours: PaletteColour[] = [];
  const usedCandidates = candidateColours.map(() => 0);
  const allowReuse = selectedColours.length > candidateColours.length;
  const distances = selectedColours.map(selected => candidateColours.map(candidate => deltaE76(selected, candidate)));

  function matchColour(selectedIndex: number) {
    if (selectedIndex === selectedColours.length) {
      // With fewer target swatches, reuse is necessary, but every selected AND
      // candidate colour must participate. Do not silently match only a subset.
      if (allowReuse && usedCandidates.some(count => count === 0)) return;
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
      if (!allowReuse && usedCandidates[candidateIndex]) return;
      usedCandidates[candidateIndex]++;
      differences.push(distances[selectedIndex][candidateIndex]);
      matchedColours.push(candidateColour);
      matchColour(selectedIndex + 1);
      matchedColours.pop();
      differences.pop();
      usedCandidates[candidateIndex]--;
    });
  }

  matchColour(0);
  return closestMatch;
}
