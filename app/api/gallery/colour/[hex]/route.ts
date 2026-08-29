import { notFound } from "next/navigation";

import {
  archivePaletteColours,
  deltaE76,
  photographUrl,
  type PaletteColour,
} from "@/app/gallery/archive";
import { galleryPhotographs } from "@/app/gallery/photos";

const similarityThreshold = 20;

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/gallery/colour/[hex]">,
) {
  const { hex: hexParameter } = await params;
  const hexParameters = hexParameter.split(",");

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

  const matches = galleryPhotographs
    .flatMap((photograph) => {
      const colours = palettes.get(photograph.filename) ?? [];
      const closestMatch = selectedColours
        .flatMap((selectedColour) =>
          colours.map((closestColour) => ({
            closestColour,
            difference: deltaE76(selectedColour, closestColour),
          })),
        )
        .reduce<{ closestColour: PaletteColour; difference: number } | undefined>(
          (closest, match) =>
            !closest || match.difference < closest.difference ? match : closest,
        undefined,
      );

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