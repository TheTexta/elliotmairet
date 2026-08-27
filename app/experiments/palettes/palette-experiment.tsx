"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { extractKMeansPalette } from "@/lib/palette/k-means";

type Rgb = [number, number, number];
type MethodId = "histogram" | "medianCut" | "kMeans";
type PaletteResult = Record<MethodId, Rgb[]>;
type AnalysisStatus = "loading" | "ready" | "error";

type AnalysisResult = {
  status: AnalysisStatus;
  palettes?: PaletteResult;
  error?: string;
};

const storageBaseUrl =
  "https://api.dextery.dev/storage/v1/render/image/public/elliotmairet";

const testImages = [
  {
    filename: "20260623-DSCF5971.jpg",
    width: 4364,
    height: 6546,
    label: "Test image 01",
  },
  {
    filename: "20260508-DSCF2612.jpg",
    width: 14804,
    height: 9856,
    label: "Test image 02",
  },
  {
    filename: "20260412-IMG_8519.jpg",
    width: 5790,
    height: 3860,
    label: "Test image 03",
  },
  {
    filename: "20260611-DSCF3748.jpg",
    width: 6827,
    height: 4551,
    label: "Test image 04",
  },
  {
    filename: "20260822-DSCF4355.jpg",
    width: 6983,
    height: 4655,
    label: "Test image 05",
  },
] as const;

const methods: Array<{
  id: MethodId;
  name: string;
  description: string;
}> = [
  {
    id: "histogram",
    name: "Quantized histogram",
    description: "Most frequent 32-level RGB bins.",
  },
  {
    id: "medianCut",
    name: "Median cut",
    description: "Balanced splits across the widest colour ranges.",
  },
  {
    id: "kMeans",
    name: "K-means",
    description: "Iterative clusters around representative colours.",
  },
];

function imageUrl(filename: string) {
  return (
    storageBaseUrl +
    "/" +
    encodeURIComponent(filename) +
    "?width=640&quality=82"
  );
}

function rgbToHex([red, green, blue]: Rgb) {
  return (
    "#" +
    [red, green, blue]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")
  );
}

function readableTextColor([red, green, blue]: Rgb) {
  const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  return luminance > 0.56 ? "#101010" : "#ffffff";
}

function averageColor(pixels: Rgb[]): Rgb {
  const total = pixels.reduce(
    (sum, [red, green, blue]) => [
      sum[0] + red,
      sum[1] + green,
      sum[2] + blue,
    ],
    [0, 0, 0],
  );

  return [
    Math.round(total[0] / pixels.length),
    Math.round(total[1] / pixels.length),
    Math.round(total[2] / pixels.length),
  ];
}

function quantizedHistogram(pixels: Rgb[], paletteSize = 5): Rgb[] {
  const bins = new Map<string, { color: Rgb; count: number }>();

  for (const [red, green, blue] of pixels) {
    const color: Rgb = [
      Math.min(255, Math.floor(red / 32) * 32 + 16),
      Math.min(255, Math.floor(green / 32) * 32 + 16),
      Math.min(255, Math.floor(blue / 32) * 32 + 16),
    ];
    const key = color.join(",");
    const existing = bins.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      bins.set(key, { color, count: 1 });
    }
  }

  return [...bins.values()]
    .sort((first, second) => second.count - first.count)
    .slice(0, paletteSize)
    .map(({ color }) => color);
}

function channelRange(pixels: Rgb[], channel: number) {
  let smallest = 255;
  let largest = 0;

  for (const pixel of pixels) {
    smallest = Math.min(smallest, pixel[channel]);
    largest = Math.max(largest, pixel[channel]);
  }

  return largest - smallest;
}

function medianCut(pixels: Rgb[], paletteSize = 5): Rgb[] {
  const boxes: Rgb[][] = [pixels];

  while (boxes.length < paletteSize) {
    const candidates = boxes
      .map((box, index) => ({
        index,
        box,
        range: Math.max(
          channelRange(box, 0),
          channelRange(box, 1),
          channelRange(box, 2),
        ),
      }))
      .filter(({ box }) => box.length > 1)
      .sort(
        (first, second) =>
          second.range * second.box.length - first.range * first.box.length,
      );
    const candidate = candidates[0];

    if (!candidate) {
      break;
    }

    const channel = [0, 1, 2].sort(
      (first, second) =>
        channelRange(candidate.box, second) - channelRange(candidate.box, first),
    )[0];
    const ordered = [...candidate.box].sort(
      (first, second) => first[channel] - second[channel],
    );
    const midpoint = Math.floor(ordered.length / 2);

    boxes.splice(candidate.index, 1, ordered.slice(0, midpoint), ordered.slice(midpoint));
  }

  return boxes.map(averageColor);
}

function kMeans(pixels: Rgb[], paletteSize = 5): Rgb[] {
  return extractKMeansPalette(pixels, paletteSize).map(({ rgb }) => rgb as Rgb);
}

function readPixels(source: string): Promise<Rgb[]> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = Math.min(1, 96 / longestSide);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        reject(new Error("Canvas is unavailable in this browser."));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixels: Rgb[] = [];

      for (let index = 0; index < imageData.length; index += 4) {
        if (imageData[index + 3] > 200) {
          pixels.push([imageData[index], imageData[index + 1], imageData[index + 2]]);
        }
      }

      resolve(pixels);
    };

    image.onerror = () => reject(new Error("The test image could not be loaded."));
    image.src = source;
  });
}

function initialResults() {
  return Object.fromEntries(
    testImages.map((image) => [image.filename, { status: "loading" }]),
  ) as Record<string, AnalysisResult>;
}

export function PaletteExperiment() {
  const [results, setResults] = useState<Record<string, AnalysisResult>>(
    initialResults,
  );

  useEffect(() => {
    let cancelled = false;

    async function analyseImage(filename: string) {
      try {
        const pixels = await readPixels(imageUrl(filename));
        const palettes: PaletteResult = {
          histogram: quantizedHistogram(pixels),
          medianCut: medianCut(pixels),
          kMeans: kMeans(pixels),
        };

        if (!cancelled) {
          setResults((current) => ({
            ...current,
            [filename]: { status: "ready", palettes },
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setResults((current) => ({
            ...current,
            [filename]: {
              status: "error",
              error:
                error instanceof Error
                  ? error.message
                  : "Analysis could not be completed.",
            },
          }));
        }
      }
    }

    testImages.forEach((image) => {
      void analyseImage(image.filename);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-[100svh] p-3 sm:p-4 bg-[#efeee9] text-[#11110f] text-[0.8125rem] font-medium tracking-[-0.035em]">
      <header className="w-[min(100%,90rem)] mx-auto pt-1">
        <div className="flex gap-[0.45rem] text-xs">
          <Link
            className="no-underline hover:underline focus-visible:underline"
            href="/"
          >
            Elliot Mairet
          </Link>
          <span>/</span>
          <span>Experiment 01</span>
        </div>
        <div className="block sm:grid sm:grid-cols-12 gap-4 mt-20 sm:mt-[clamp(5rem,12vw,10rem)] mb-16 sm:mb-[clamp(4rem,8vw,7rem)]">
          <h1 className="m-0 mb-8 sm:mb-0 sm:col-span-9 min-[961px]:col-span-8 text-[clamp(2.8rem,15vw,4.8rem)] sm:text-[clamp(2.8rem,7vw,7rem)] font-medium tracking-[-0.09em] leading-[0.88]">
            Palette extraction study
          </h1>
          <p className="m-0 max-w-[24rem] sm:max-w-none sm:col-start-10 sm:col-span-3 sm:self-end text-sm leading-[1.3]">
            Five photographs, three browser-side extraction methods, and one
            small sample raster per image. Compare the character of each
            result before choosing a method for the full archive.
          </p>
        </div>
      </header>

      <section
        className="w-[min(100%,90rem)] mx-auto grid grid-cols-1 sm:grid-cols-3 gap-px mb-4 border border-[#11110f] bg-[#11110f]"
        aria-label="Extraction methods"
      >
        {methods.map((method) => (
          <article
            className="min-h-0 sm:min-h-[7.5rem] p-3 bg-[#efeee9]"
            key={method.id}
          >
            <h2 className="m-0 mb-5 sm:mb-[2.5rem] text-sm font-bold">
              {method.name}
            </h2>
            <p className="m-0 max-w-[20rem] leading-[1.25]">
              {method.description}
            </p>
          </article>
        ))}
      </section>

      <section
        className="w-[min(100%,90rem)] mx-auto grid grid-cols-1 min-[961px]:grid-cols-2 gap-4 pb-20"
        aria-label="Palette comparison results"
      >
        {testImages.map((image) => {
          const result = results[image.filename];

          return (
            <article
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] min-w-0 border border-[#11110f] bg-[#fafaf7]"
              key={image.filename}
            >
              <div className="relative min-w-0 bg-[#d8d7d1] max-sm:aspect-[4/3]">
                <Image
                  alt={image.label}
                  className="block w-full h-full object-cover"
                  height={image.height}
                  priority
                  sizes="(max-width: 760px) calc(100vw - 32px), 34vw"
                  src={imageUrl(image.filename)}
                  unoptimized
                  width={image.width}
                />
                <span className="absolute right-2 bottom-2 px-[0.3rem] py-[0.2rem] bg-[#efeee9] text-[0.6875rem] tracking-[-0.02em]">
                  {image.label}
                </span>
              </div>

              <div className="min-w-0 p-3">
                <div className="flex justify-between gap-3 pb-3 border-b border-[#b8b7b0] text-[0.6875rem] tracking-[-0.02em]">
                  <span>{image.filename}</span>
                  <span className="flex-none text-right" aria-live="polite">
                    {result.status === "loading" ? "Analysing…" : null}
                    {result.status === "ready" ? "Complete" : null}
                    {result.status === "error" ? "Unavailable" : null}
                  </span>
                </div>

                {result.status === "error" ? (
                  <p className="mt-3 mb-0 text-xs">{result.error}</p>
                ) : (
                  methods.map((method) => {
                    const colors = result.palettes?.[method.id];

                    return (
                      <section
                        className="grid grid-cols-1 sm:grid-cols-[6.6rem_minmax(0,1fr)] gap-2 sm:gap-3 py-3 border-b border-[#b8b7b0] last:border-b-0"
                        key={method.id}
                      >
                        <h3 className="m-0 text-xs font-bold leading-[1.15]">
                          {method.name}
                        </h3>
                        <div className="grid grid-cols-5 min-w-0">
                          {colors
                            ? colors.map((color) => {
                                const hex = rgbToHex(color);

                                return (
                                  <span
                                    className="grid min-w-0 min-h-[3.2rem] sm:min-h-[2.6rem] items-end justify-items-start p-[0.2rem] font-mono text-[0.55rem] tracking-[-0.08em] leading-none"
                                    key={hex}
                                    style={{
                                      backgroundColor: hex,
                                      color: readableTextColor(color),
                                    }}
                                    title={hex}
                                  >
                                    {hex}
                                  </span>
                                );
                              })
                            : Array.from({ length: 5 }, (_, index) => (
                                <span
                                  aria-label="Colour extraction in progress"
                                  className="grid min-w-0 min-h-[3.2rem] sm:min-h-[2.6rem] items-end justify-items-start p-[0.2rem] font-mono text-[0.55rem] tracking-[-0.08em] leading-none animate-palette-loading bg-[linear-gradient(110deg,#d8d7d1_25%,#efeee9_45%,#d8d7d1_65%)] bg-[length:220%_100%]"
                                  key={index}
                                />
                              ))}
                        </div>
                      </section>
                    );
                  })
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
