import type { Metadata } from "next";

import { PaletteExperiment } from "./palette-experiment";

export const metadata: Metadata = {
  title: "Palette Extraction Study — Elliot Mairet",
  description:
    "A comparison of image palette extraction methods across Elliot Mairet's archive.",
};

export default function PaletteExperimentPage() {
  return <PaletteExperiment />;
}
