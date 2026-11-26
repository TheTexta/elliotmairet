"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { loadColourPalettes } from "@/lib/photographs/colour-palettes";
import {
  findColourMatches,
  type ColourMatch,
} from "@/lib/photographs/find-colour-matches";

import { PhotoGallery } from "../photo-gallery";

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

export function SimilarColourGallery({
  currentFilename,
  palette,
  selectedHex,
  onSelect,
}: {
  currentFilename: string;
  palette: string[];
  selectedHex?: string;
  onSelect: (hex: string) => void;
}) {
  const [matches, setMatches] = useState<ColourMatch[]>();
  const [visibleCount, setVisibleCount] = useState(colourResultPageSize);
  const matchesRef = useRef<ColourMatch[] | undefined>(undefined);
  const loadTriggerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<ReturnType<typeof loadColourPalettes>>(undefined);
  const retryAfterRef = useRef<ReturnType<typeof loadColourPalettes>>(undefined);
  const retryPendingRef = useRef(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<
    "idle" | "loading" | "fading-out" | "error"
  >("loading");
  const hasMore = Boolean(matches && visibleCount < matches.length);
  const isPending = status === "loading" || status === "fading-out";
  const hasPreviousResults = Boolean(matches?.length);
  const feedback = status === "error"
    ? hasPreviousResults
      ? "Similar photographs could not be updated. Previous results are still shown."
      : "Similar photographs could not be loaded."
    : isPending
      ? `${isRetrying ? "Trying again…" : "Finding similar photographs…"}${hasPreviousResults ? " Previous results are still shown." : ""}`
      : matches?.length === 0
        ? "No similar photographs found."
        : "";

  function retry() {
    if (status !== "error" || retryPendingRef.current) return;
    retryPendingRef.current = true;
    retryAfterRef.current = requestRef.current;
    setIsRetrying(true);
    setRetryAttempt((attempt) => attempt + 1);
  }

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
    const hexes = selectedHex ? [selectedHex] : palette;
    const controller = new AbortController();

    async function loadMatches() {
      setStatus("loading");

      try {
        const request = loadColourPalettes(retryAfterRef.current);
        retryAfterRef.current = undefined;
        requestRef.current = request;
        const photographs = await request;

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
      } finally {
        if (!controller.signal.aborted) {
          retryPendingRef.current = false;
          setIsRetrying(false);
        }
      }
    }

    void loadMatches();

    return () => controller.abort();
  }, [currentFilename, palette, selectedHex, retryAttempt]);

  return (
    <>
      <nav
        aria-label="Photograph colour palette"
        className="grid w-full pb-4 h-[8vh]"
        style={{ gridTemplateColumns: `repeat(${palette.length}, minmax(0, 1fr))` }}
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
            onClick={() => onSelect(hex)}
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

      <div className={feedback ? "mb-4" : undefined}>
        <p aria-atomic="true" role="status">{feedback}</p>
        {status === "error" || isRetrying ? (
          <button
            aria-disabled={isRetrying}
            className="min-h-11 cursor-pointer border-0 bg-transparent px-2 py-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050505] aria-disabled:cursor-wait"
            onClick={retry}
            type="button"
          >
            {isRetrying ? "Trying again…" : "Try again"}
          </button>
        ) : null}
      </div>

      <section
        aria-busy={isPending}
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
