"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import {
  findColourMatches,
  type ColourMatch,
  type ColourSearchPhotograph,
} from "@/lib/photographs/find-colour-matches";

import { PhotoGallery } from "../photo-gallery";
import {
  announcePaletteSelectionState,
  paletteResetEventName,
} from "./palette-reset-event";

const colourResultPageSize = 36;
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

let palettesRequest: Promise<ColourSearchPhotograph[]> | undefined;

// Shared across photo navigations so the catalogue palette JSON is fetched once.
function loadPalettes() {
  palettesRequest ??= fetch("/api/gallery/palettes").then((result) => {
    if (!result.ok) {
      throw new Error(`Palette request failed with ${result.status}.`);
    }

    return result.json() as Promise<ColourSearchPhotograph[]>;
  });
  palettesRequest.catch(() => {
    palettesRequest = undefined;
  });

  return palettesRequest;
}

export function SimilarColourGallery({
  currentFilename,
  palette,
}: {
  currentFilename: string;
  palette: string[];
}) {
  const [selectedHex, setSelectedHex] = useState<string>();
  const [matches, setMatches] = useState<ColourMatch[]>();
  const [visibleCount, setVisibleCount] = useState(colourResultPageSize);
  const matchesRef = useRef<ColourMatch[] | undefined>(undefined);
  const loadTriggerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<
    "idle" | "loading" | "fading-out" | "error"
  >("idle");
  const hasMore = Boolean(matches && visibleCount < matches.length);

  useEffect(() => {
    const trigger = loadTriggerRef.current;

    if (!trigger || !hasMore || status !== "idle") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => count + colourResultPageSize);
        }
      },
      { rootMargin: "1000px 0px" },
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore, status, visibleCount]);

  useEffect(() => {
    function handlePaletteReset() {
      setSelectedHex(undefined);
    }

    window.addEventListener(paletteResetEventName, handlePaletteReset);
    return () => window.removeEventListener(paletteResetEventName, handlePaletteReset);
  }, []);

  useEffect(() => {
    announcePaletteSelectionState(Boolean(selectedHex));
  }, [selectedHex]);

  useEffect(() => {
    const hexes = selectedHex ? [selectedHex] : palette;
    const controller = new AbortController();

    async function loadMatches() {
      setStatus("loading");

      try {
        const photographs = await loadPalettes();

        if (controller.signal.aborted) {
          return;
        }

        const result = findColourMatches(photographs, hexes, currentFilename);

        if (!result) {
          throw new Error("Colour search could not match the selected palette.");
        }

        if (matchesRef.current) {
          setStatus("fading-out");
          await waitForGalleryFadeOut(controller.signal);

          if (controller.signal.aborted) {
            return;
          }
        }

        matchesRef.current = result.matches;
        setMatches(result.matches);
        setVisibleCount(colourResultPageSize);
        setStatus("idle");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("error");
        }
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
          <motion.button
            aria-label={`Show photographs similar to ${hex}`}
            aria-pressed={selectedHex === hex}
            animate={{
              opacity: 1,
              scale: selectedHex ? (selectedHex === hex ? 1 : 0.25) : 0.5,
            }}
            className="block cursor-pointer border-0 p-0 transition-transform duration-300 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#050505]"
            initial={{ opacity: 0, scale: 0 }}
            key={`${hex}-${index}`}
            onClick={() => setSelectedHex(hex)}
            style={{ backgroundColor: hex }}
            title={`Find similar colours to ${hex}`}
            transition={{
              delay: 0,
              duration: reduceMotion ? 0 : 0.36,
              ease: [0.22, 1, 0.36, 1],
            }}
            type="button"
          />
        ))}
      </nav>

      <section
        aria-busy={status === "loading" || status === "fading-out"}
        aria-live="polite"
        className={`transition-opacity ease-out motion-reduce:transition-none ${
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
        {matches ? (
          <>
            <PhotoGallery
              ariaLabel="Photographs ordered by colour similarity"
              layout="grid"
              photographs={matches.slice(0, visibleCount)}
            />
            {hasMore ? (
              <div aria-hidden="true" className="h-px" ref={loadTriggerRef} />
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}
