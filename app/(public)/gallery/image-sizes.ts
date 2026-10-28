export const galleryImageSizes =
  "(max-width: 639px) calc(50vw - 24px), (max-width: 767px) calc(33.333vw - 8px), calc(22.222vw - 10.667px)";

export function heroImageSizes(width: number, height: number) {
  const heightLimitedWidth = `${Number((80 * width / height).toFixed(6))}vh`;

  return `(max-width: 639px) min(calc(100vw - 32px), ${heightLimitedWidth}), min(66.667vw, ${heightLimitedWidth})`;
}
