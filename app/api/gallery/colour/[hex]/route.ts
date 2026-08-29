import { notFound } from "next/navigation";

import {
  archivePaletteColours,
  deltaE76,
  photographUrl,
  type PaletteColour,
} from "@/app/gallery/archive";
import { galleryPhotographs } from "@/app/gallery/photos";

const singleColourSimilarityThreshold = 20;
const fiveColourSimilarityThreshold = 20;
const fiveDimensionalVectorSize = 5;
const monochromePaletteChromaThreshold = 1;

function paletteChroma(colours: PaletteColour[]) {
  const meanSquaredChroma =
    colours.reduce(
      (sum, colour) => sum + colour.lab_a ** 2 + colour.lab_b ** 2,
      0,
    ) / colours.length;

  return Math.sqrt(meanSquaredChroma);
}

function palettesShareColourMode(
  sourceColours: PaletteColour[],
  candidateColours: PaletteColour[],
) {
  const sourceIsMonochrome =
    paletteChroma(sourceColours) <= monochromePaletteChromaThreshold;
  const candidateIsMonochrome =
    paletteChroma(candidateColours) <= monochromePaletteChromaThreshold;

  return sourceIsMonochrome === candidateIsMonochrome;
}

function closestPaletteMatch(
  selectedColours: PaletteColour[],
  candidateColours: PaletteColour[],
) {
  if (
    selectedColours.length === 0 ||
    candidateColours.length < selectedColours.length
  ) {
    return;
  }

  let closestMatch:
    | { closestColour: PaletteColour; difference: number }
    | undefined;
  const differences: number[] = [];
  const matchedColours: PaletteColour[] = [];
  const usedCandidateIndexes = new Set<number>();

  function matchColour(selectedIndex: number) {
    if (selectedIndex === selectedColours.length) {
      const difference =
        Math.hypot(...differences) / Math.sqrt(differences.length);

      if (!closestMatch || difference < closestMatch.difference) {
        const closestIndex = differences.reduce(
          (bestIndex, componentDifference, index) =>
            componentDifference < differences[bestIndex] ? index : bestIndex,
          0,
        );

        closestMatch = {
          closestColour: matchedColours[closestIndex],
          difference,
        };
      }

      return;
    }

    candidateColours.forEach((candidateColour, candidateIndex) => {
      if (usedCandidateIndexes.has(candidateIndex)) {
        return;
      }

      usedCandidateIndexes.add(candidateIndex);
      const colourDelta = deltaE76(
        selectedColours[selectedIndex],
        candidateColour,
      );

      differences.push(colourDelta);
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

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/gallery/colour/[hex]">,
) {
  const { hex: hexParameter } = await params;
  const hexParameters = hexParameter.split(",");
  const excludedFilename = new URL(request.url).searchParams.get("exclude");

  if (
    hexParameters.length < 1 ||
    hexParameters.length > 5 ||
    hexParameters.some((hex) => !/^[0-9a-f]{6}$/i.test(hex))
  ) {
    notFound();
  }

  const selectedHexes = hexParameters.map((hex) => `#${hex.toLowerCase()}`);
  const palettes = await archivePaletteColours();
  const paletteColours = [...palettes.values()].flat();
  const selectedColours = selectedHexes.flatMap((selectedHex) => {
    const colour = paletteColours.find(
      ({ hex }) => hex.toLowerCase() === selectedHex,
    );

    return colour ? [colour] : [];
  });

  if (selectedColours.length !== selectedHexes.length) {
    notFound();
  }

  const similarityThreshold =
    selectedColours.length === fiveDimensionalVectorSize
      ? fiveColourSimilarityThreshold
      : singleColourSimilarityThreshold;
  const sourceColours =
    (excludedFilename ? palettes.get(excludedFilename) : undefined) ??
    selectedColours;

  const matches = galleryPhotographs
    .filter((photograph) => photograph.filename !== excludedFilename)
    .flatMap((photograph) => {
      const colours = palettes.get(photograph.filename) ?? [];

      if (
        colours.length === 0 ||
        !palettesShareColourMode(sourceColours, colours)
      ) {
        return [];
      }

      const closestMatch = closestPaletteMatch(selectedColours, colours);

      if (!closestMatch) {
        return [];
      }

      return closestMatch.difference <= similarityThreshold
        ? [
            {
              ...photograph,
              imageUrl: photographUrl(photograph.filename),
              closestHex: closestMatch.closestColour.hex,
              difference: closestMatch.difference,
            },
          ]
        : [];
    })
    .sort((first, second) => first.difference - second.difference);

  return Response.json(
    { selectedHexes, threshold: similarityThreshold, matches },
    { headers: { "Cache-Control": "public, s-maxage=3600" } },
  );
}