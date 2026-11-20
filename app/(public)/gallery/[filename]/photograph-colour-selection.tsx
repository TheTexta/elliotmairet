"use client";

import { useState, type ReactNode } from "react";

import { FullPhotographImage } from "./full-photograph-image";
import { SimilarColourGallery } from "./similar-colour-gallery";

// The server keys this owner by photograph. Neither selection nor in-flight
// matching work can leak into a different photograph during navigation.
export function PhotographColourSelection({ children, currentFilename, palette }: {
  children: ReactNode;
  currentFilename: string;
  palette: string[];
}) {
  const [selectedHex, setSelectedHex] = useState<string>();

  return <section>
    <figure className="m-0 mt-[8vh] mb-[4vh]">
      <div className="h-[80vh] bg-white flex content-center items-center justify-center">
        <FullPhotographImage isPaletteFiltered={Boolean(selectedHex)} onReset={() => setSelectedHex(undefined)}>
          {children}
        </FullPhotographImage>
      </div>
    </figure>
    <div className="" />
    {palette.length > 0 ? <SimilarColourGallery
      currentFilename={currentFilename}
      palette={palette}
      selectedHex={selectedHex}
      onSelect={setSelectedHex}
    /> : null}
  </section>;
}
