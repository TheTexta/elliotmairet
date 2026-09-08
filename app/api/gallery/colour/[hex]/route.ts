import { notFound } from "next/navigation";

import {
  closestPaletteMatch,
  palettesShareColourMode,
} from "@/lib/photographs/colour";
import { getPhotographsWithPalettes } from "@/lib/photographs/queries";
import { paginateOrderedItems } from "@/lib/photographs/pagination";
import { selectSimilarMatches } from "@/lib/photographs/select-similar-matches";
import { photographUrl } from "@/lib/photographs/storage";

const singleColourSimilarityThreshold = 20;
const fiveColourSimilarityThreshold = 20;
const fiveDimensionalVectorSize = 5;

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/gallery/colour/[hex]">,
) {
  const { hex: hexParameter } = await params;
  const hexParameters = hexParameter.split(",");
  const excludedFilename = new URL(request.url).searchParams.get("exclude");
  const cursor = new URL(request.url).searchParams.get("cursor");

  if (
    hexParameters.length < 1 ||
    hexParameters.length > 5 ||
    hexParameters.some((hex) => !/^[0-9a-f]{6}$/i.test(hex))
  ) {
    notFound();
  }

  const selectedHexes = hexParameters.map((hex) => `#${hex.toLowerCase()}`);
  const photographs = await getPhotographsWithPalettes();
  const palettes = new Map(
    photographs.map((photograph) => [
      photograph.storagePath,
      photograph.palette,
    ]),
  );
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
  const excludedPhotograph = photographs.find(
    ({ filename }) => filename === excludedFilename,
  );
  const sourceColours = excludedPhotograph
    ? palettes.get(excludedPhotograph.storagePath) ?? selectedColours
    : selectedColours;

  const candidates = photographs
    .filter((photograph) => photograph.filename !== excludedFilename)
    .flatMap((photograph) => {
      const colours = palettes.get(photograph.storagePath) ?? [];

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

      return [
        {
          ...photograph,
          imageUrl: photographUrl(photograph.storagePath),
          palette: colours.map(({ hex }) => hex),
          closestHex: closestMatch.closestColour.hex,
          difference: closestMatch.difference,
        },
      ];
    });
  const { matches, threshold } = selectSimilarMatches(
    candidates,
    similarityThreshold,
  );
  const page = paginateOrderedItems(matches, cursor);

  if (!page) {
    return Response.json({ error: "Invalid colour-result cursor." }, { status: 400 });
  }

  return Response.json(
    { selectedHexes, threshold, matches: page.items, nextCursor: page.nextCursor },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
