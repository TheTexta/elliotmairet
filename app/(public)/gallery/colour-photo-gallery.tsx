import type { CSSProperties } from "react";

import { masonryGap, masonryGeometry } from "@/lib/photographs/masonry-geometry";
import { GalleryItem, type PhotoGalleryItem } from "./photo-gallery";
import styles from "./colour-photo-gallery.module.css";

export function ColourPhotoGallery({
  photographs,
  columnPlans,
}: {
  photographs: PhotoGalleryItem[];
  columnPlans: { mobile: number[][]; desktop: number[][] };
}) {
  const mobile = masonryGeometry(photographs, columnPlans.mobile);
  const desktop = masonryGeometry(photographs, columnPlans.desktop);
  const eager = new Set([
    ...columnPlans.mobile.slice(0, 2).flatMap((column) => column.slice(0, 1)),
    ...columnPlans.desktop.slice(0, 2).flatMap((column) => column.slice(0, 1)),
  ]);
  const height = (geometry: typeof mobile, breakpoint: string) =>
    `calc(var(--${breakpoint}-width) * ${Math.max(...geometry.heights)})`;
  // One image/link tree, in desktop spatial order. CSS selects positions without
  // mounting a second hidden archive, client-side sorting, or hydration shifts.
  const order = [...desktop.positions].sort(([, a], [, b]) =>
    a.top - b.top || a.column - b.column,
  );

  return (
    <div className={styles.canvas}>
      <section
        aria-label="Complete photograph archive"
        className={`${styles.gallery} animate-gallery-fade-in motion-reduce:animate-none`}
        style={{
          "--mobile-height": height(mobile, "mobile"),
          "--desktop-height": height(desktop, "desktop"),
          "--mobile-tracks": 2 + masonryGap,
          "--desktop-tracks": 3 + 2 * masonryGap,
        } as CSSProperties}
      >
        {order.map(([itemIndex], index) => {
          const positionStyles: Record<string, string> = {};
          for (const [breakpoint, geometry] of [["mobile", mobile], ["desktop", desktop]] as const) {
            const position = geometry.positions.get(itemIndex)!;
            positionStyles[`--${breakpoint}-left`] = `calc(var(--${breakpoint}-width) * ${position.column * (1 + masonryGap)})`;
            positionStyles[`--${breakpoint}-top`] = `calc(var(--${breakpoint}-width) * ${position.top})`;
          }
          return (
            <GalleryItem
              className={styles.photograph}
              eager={eager.has(itemIndex)}
              index={index}
              key={photographs[itemIndex].filename}
              layout="positioned"
              photograph={photographs[itemIndex]}
              style={positionStyles as CSSProperties}
            />
          );
        })}
      </section>
    </div>
  );
}
