"use client";

import { useEffect, useRef, useState } from "react";

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

const galleryFadeOutDurationMs = 100;
const galleryFadeInDurationMs = 300;

function waitForGalleryFadeOut(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", finish);
      resolve();
    };

    const timeoutId = window.setTimeout(finish, galleryFadeOutDurationMs);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export function SimilarColourGallery({
  currentFilename,
  palette,
}: {
  currentFilename: string;
  palette: string[];
}) {
  const [selectedHex, setSelectedHex] = useState<string>();
  const [response, setResponse] = useState<MatchResponse>();
  const responseRef = useRef<MatchResponse | undefined>(undefined);
  const [status, setStatus] = useState<
    "idle" | "loading" | "fading-out" | "error"
  >("idle");

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

        const nextResponse = (await result.json()) as MatchResponse;

        if (responseRef.current) {
          setStatus("fading-out");
          await waitForGalleryFadeOut(controller.signal);

          if (controller.signal.aborted) {
            return;
          }
        }

        responseRef.current = nextResponse;
        setResponse(nextResponse);
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
        className="grid w-full grid-cols-5 pb-4 h-[8vh]"
      >
        {palette.map((hex, index) => (
          <button
            aria-label={`Show photographs similar to ${hex}`}
            aria-pressed={selectedHex === hex}
            className="group relative block cursor-pointer border-0 bg-white p-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#050505]"
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

      <section
        aria-busy={status === "loading" || status === "fading-out"}
        aria-live="polite"
        className={`transition-opacity ease-linear motion-reduce:transition-none ${
          status === "fading-out" ? "opacity-0" : "opacity-100"
        }`}
        style={{
          transitionDuration: `${
            status === "fading-out"
              ? galleryFadeOutDurationMs
              : galleryFadeInDurationMs
          }ms`,
        }}
      >
        {response ? (
          <PhotoGallery
            ariaLabel="Photographs ordered by colour similarity"
            photographs={response.matches}
          />
        ) : null}
      </section>
    </>
  );
}