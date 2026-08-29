"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

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

export function SimilarColourGallery({ palette }: { palette: string[] }) {
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
        const result = await fetch(`/api/gallery/colour/${colourPath}`, {
          signal: controller.signal,
        });

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
  }, [palette, selectedHex]);

  return (
    <>
      <nav
        aria-label="Photograph colour palette"
        className="grid grid-cols-5 border-t border-[#050505]"
      >
        {palette.map((hex, index) => (
          <button
            aria-label={`Show photographs similar to ${hex}`}
            aria-pressed={selectedHex === hex}
            className="group relative block aspect-[3/1] cursor-pointer border-0 border-l border-[#050505] bg-white p-0 first:border-l-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#050505]"
            key={`${hex}-${index}`}
            onClick={() => setSelectedHex(hex)}
            title={`Find similar colours to ${hex}`}
            type="button"
          >
            <span
              aria-hidden="true"
              className={`absolute inset-0 border border-[#050505] transition-transform duration-300 ease-out motion-reduce:transition-none ${
                selectedHex ? (selectedHex === hex ? "scale-100" : "scale-25") : "scale-50"
              }`}
              style={{ backgroundColor: hex }}
            />
          </button>
        ))}
      </nav>

      <section aria-live="polite">
        <header className="flex min-h-8 items-center gap-[0.4rem] border-y border-[#050505] px-[0.625rem] text-[0.8125rem] font-normal tracking-[-0.035em]">
          <span className="flex" aria-label="Colours used for matching">
            {(selectedHex ? [selectedHex] : palette).map((hex) => (
              <span
                className="block size-[0.875rem] border border-[#050505] first:border-l"
                key={hex}
                style={{ backgroundColor: hex }}
              />
            ))}
          </span>
            {status === "loading" ? <span>Matching</span> : null}
            {status === "error" ? <span>Colour matches unavailable</span> : null}
            {status === "idle" && response ? (
              <>
                <span>Delta E ≤ {response.threshold}</span>
                <span aria-hidden="true">/</span>
                <span>{response.matches.length}</span>
              </>
            ) : null}
        </header>

        {status === "idle" && response ? (
          <div
            aria-label="Photographs ordered by colour similarity"
            className="columns-1 gap-0 pt-[0.3125rem] sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6"
          >
            {response.matches.map((match, index) => (
              <article
                className="group break-inside-avoid px-[0.3125rem] py-[0.3125rem]"
                key={match.filename}
              >
                <Link
                  className="block no-underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
                  href={`/gallery/${encodeURIComponent(match.filename)}`}
                >
                  <figure className="relative m-0 min-h-[3.75rem] bg-[#050505]">
                    <Image
                      alt={`Photograph with a colour difference of ${match.difference.toFixed(1)}`}
                      className="block h-auto w-full"
                      height={match.height}
                      priority={index < 4}
                      quality={74}
                      sizes="(max-width: 639px) calc(100vw - 20px), (max-width: 767px) calc(50vw - 20px), (max-width: 1023px) calc(33vw - 20px), (max-width: 1279px) calc(25vw - 20px), (max-width: 1535px) calc(20vw - 20px), calc(16.6vw - 20px)"
                      src={match.imageUrl}
                      width={match.width}
                    />
                    <span
                      aria-label={`Closest palette colour ${match.closestHex}`}
                      className="absolute top-2 right-2 block size-[0.875rem] border border-white"
                      style={{ backgroundColor: match.closestHex }}
                    />
                    <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-10 flex items-start justify-between text-white leading-[1.35] opacity-0 translate-y-1 transition-[opacity,transform] duration-160 ease-in-out group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
                      <span className="block min-w-0 overflow-hidden p-[0.3125rem] text-ellipsis whitespace-nowrap">
                        {match.filename}
                      </span>
                      <span className="block p-[0.3125rem] whitespace-nowrap">
                        ΔE {match.difference.toFixed(1)}
                      </span>
                    </div>
                  </figure>
                </Link>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}