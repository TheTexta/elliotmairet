import { getPhotographsWithPalettes } from "@/lib/photographs/queries";
import { photographUrl } from "@/lib/photographs/storage";
import type { ColourSearchPhotograph } from "@/lib/photographs/find-colour-matches";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const photographs = await getPhotographsWithPalettes();
  const body: ColourSearchPhotograph[] = photographs.flatMap((photograph) =>
    photograph.palette.length
      ? [
          {
            filename: photograph.filename,
            width: photograph.width,
            height: photograph.height,
            year: photograph.year,
            imageUrl: photographUrl(photograph.storagePath),
            palette: photograph.palette.map(
              ({ hex, lightness, axisA, axisB, featureSpace }) => ({
                hex,
                lightness,
                axisA,
                axisB,
                featureSpace,
              }),
            ),
          },
        ]
      : [],
  );

  return Response.json(body);
}
