import {
  closestPaletteMatch,
  palettesShareColourMode,
  type PaletteColour,
} from "./colour.ts";
import { selectSimilarMatches } from "./select-similar-matches.ts";

const cielabSimilarityThreshold = 20;
const oklabSimilarityThreshold = 0.1;
const cielabMonochromeThreshold = 1;
const oklabMonochromeThreshold = 0.01;

export type ColourSearchPhotograph = {
  filename: string;
  width: number;
  height: number;
  year: string;
  imageUrl: string;
  palette: PaletteColour[];
};

export type ColourMatch = Omit<ColourSearchPhotograph, "palette"> & {
  palette: string[];
  closestHex: string;
  difference: number;
};

export function findColourMatches(
  photographs: readonly ColourSearchPhotograph[],
  hexes: readonly string[],
  excludedFilename: string | null,
): { matches: ColourMatch[]; threshold: number } | null {
  const selectedHexes = hexes.map(
    (hex) => `#${hex.replace(/^#/, "").toLowerCase()}`,
  );

  if (
    selectedHexes.length < 1 ||
    selectedHexes.length > 5 ||
    selectedHexes.some((hex) => !/^#[0-9a-f]{6}$/.test(hex))
  ) {
    return null;
  }

  const excludedPhotograph = photographs.find(
    ({ filename }) => filename === excludedFilename,
  );
  const sourcePalette = excludedPhotograph?.palette ?? [];
  const paletteColours = sourcePalette.length
    ? sourcePalette
    : photographs.flatMap(({ palette }) => palette);
  const selectedColours = selectedHexes.flatMap((selectedHex) => {
    const colour = paletteColours.find(
      ({ hex }) => hex.toLowerCase() === selectedHex,
    );

    return colour ? [colour] : [];
  });

  if (
    selectedColours.length !== selectedHexes.length ||
    selectedColours.some(
      ({ featureSpace }) => featureSpace !== selectedColours[0].featureSpace,
    )
  ) {
    return null;
  }

  const featureSpace = selectedColours[0].featureSpace;
  const similarityThreshold = featureSpace === "oklab"
    ? oklabSimilarityThreshold
    : cielabSimilarityThreshold;
  const monochromeThreshold = featureSpace === "oklab"
    ? oklabMonochromeThreshold
    : cielabMonochromeThreshold;
  const sourceColours = excludedPhotograph?.palette ?? selectedColours;

  const candidates = photographs
    .filter((photograph) => photograph.filename !== excludedFilename)
    .flatMap((photograph) => {
      const colours = photograph.palette;

      if (
        colours.length === 0 ||
        colours[0].featureSpace !== featureSpace ||
        !palettesShareColourMode(sourceColours, colours, monochromeThreshold)
      ) {
        return [];
      }

      const closestMatch = closestPaletteMatch(selectedColours, colours);

      if (!closestMatch) {
        return [];
      }

      return [
        {
          filename: photograph.filename,
          width: photograph.width,
          height: photograph.height,
          year: photograph.year,
          imageUrl: photograph.imageUrl,
          palette: colours.map(({ hex }) => hex),
          closestHex: closestMatch.closestColour.hex,
          difference: closestMatch.difference,
        },
      ];
    });

  return selectSimilarMatches(candidates, similarityThreshold);
}
