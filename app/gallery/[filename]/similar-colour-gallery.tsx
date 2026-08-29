"use client";

import { useEffect, useState } from "react";

import { PhotoGallery } from "../photo-gallery";

type ColourMatch = {
  filename: string;
  width: number;
  height: number;
  year: string;
  imageUrl: string;
  closestHex: string;
  difference: number;
};

type MatchResponse = {
  selectedHexes: string[];
  threshold: number;
  matches: ColourMatch[];
};

export function SimilarColourGallery({
  currentFilename,
  palette,
}: {
  currentFilename: string;
  palette: string[];
}) {
  const [selectedHex, setSelectedHex] = useState<string>();
  const [response, setResponse] = useState<MatchResponse>();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const hexes = selectedHex ? [selectedHex] : palette;
    const colourPath = hexes.map((hex) => hex.slice(1)).join(",");
    const controller = new AbortController();

    async function loadMatches() {
      setStatus("loading");

      try {
        const result = await fetch(
          `/api/gallery/colour/${colourPath}?exclude=${encodeURIComponent(currentFilename)}`,
          { signal: controller.signal },
        );

        if (!result.ok) {
          throw new Error(`Colour search failed with ${result.status}.`);
        }

        setResponse((await result.json()) as MatchResponse);
        setStatus("idle");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setStatus("error");
      }
    }

    void loadMatches();

    return () => controller.abort();
  }, [currentFilename, palette, selectedHex]);

  return (
    <>
      <nav
        aria-label="Photograph colour palette"
        className="grid w-full grid-cols-5 py-4"
      >
        {palette.map((hex, index) => (
          <button
            aria-label={`Show photographs similar to ${hex}`}
            aria-pressed={selectedHex === hex}
            className="group relative block aspect-[3/1] cursor-pointer border-0 bg-white p-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#050505]"
            key={`${hex}-${index}`}
            onClick={() => setSelectedHex(hex)}
            title={`Find similar colours to ${hex}`}
            type="button"
          >
            <span
              aria-hidden="true"
              className={`absolute inset-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${
                selectedHex ? (selectedHex === hex ? "scale-100" : "scale-25") : "scale-50"
              }`}
              style={{ backgroundColor: hex }}
            />
          </button>
        ))}
      </nav>

      <section aria-live="polite">
        {status === "idle" && response ? (
          <PhotoGallery
            ariaLabel="Photographs ordered by colour similarity"
            photographs={response.matches}
          />
        ) : null}
      </section>
    </>
  );
}