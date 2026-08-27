/** @typedef {[number, number, number]} Rgb */

export const K_MEANS_ALGORITHM = "kmeans-rgb-v1";
export const K_MEANS_ITERATIONS = 10;

function squaredDistance(first, second) {
  return (
    (first[0] - second[0]) ** 2 +
    (first[1] - second[1]) ** 2 +
    (first[2] - second[2]) ** 2
  );
}

function quantizedHistogram(pixels, paletteSize) {
  const bins = new Map();

  for (const [red, green, blue] of pixels) {
    /** @type {Rgb} */
    const color = [
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

/**
 * Produces stable K-means palette clusters: 32-level histogram seeds, then
 * ten RGB-space refinement passes. The cluster share lets us retain both a
 * palette's order and the relative visual weight of every colour.
 *
 * @param {Rgb[]} pixels
 * @param {number} [paletteSize]
 */
export function extractKMeansPalette(pixels, paletteSize = 5) {
  if (!pixels.length) {
    throw new Error("Cannot extract a palette from an empty pixel sample.");
  }

  /** @type {Rgb[]} */
  const centroids = [...quantizedHistogram(pixels, paletteSize)];

  while (centroids.length < paletteSize) {
    const index = Math.min(
      pixels.length - 1,
      Math.floor((centroids.length / paletteSize) * pixels.length),
    );
    centroids.push(pixels[index]);
  }

  let clusterSizes = new Array(paletteSize).fill(0);

  for (let iteration = 0; iteration < K_MEANS_ITERATIONS; iteration += 1) {
    const clusters = centroids.map(() => ({ red: 0, green: 0, blue: 0, count: 0 }));

    for (const pixel of pixels) {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      centroids.forEach((centroid, index) => {
        const distance = squaredDistance(pixel, centroid);
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      });

      clusters[nearest].red += pixel[0];
      clusters[nearest].green += pixel[1];
      clusters[nearest].blue += pixel[2];
      clusters[nearest].count += 1;
    }

    clusterSizes = clusters.map(({ count }) => count);
    clusters.forEach((cluster, index) => {
      if (cluster.count > 0) {
        centroids[index] = [
          Math.round(cluster.red / cluster.count),
          Math.round(cluster.green / cluster.count),
          Math.round(cluster.blue / cluster.count),
        ];
      }
    });
  }

  return centroids
    .map((rgb, index) => ({
      rgb,
      weight: clusterSizes[index] / pixels.length,
    }))
    .sort((first, second) => second.weight - first.weight);
}

/** @param {Rgb} rgb */
export function rgbToHex(rgb) {
  return (
    "#" +
    rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")
  );
}

/**
 * Converts an sRGB colour to CIE Lab (D65). Lab values make a later
 * "near this colour" search perceptual instead of treating all RGB channel
 * changes as equally visible.
 *
 * @param {Rgb} rgb
 */
export function rgbToLab([red, green, blue]) {
  const linear = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883;
  const pivot = (value) =>
    value > 216 / 24389 ? Math.cbrt(value) : ((24389 / 27) * value + 16) / 116;
  const pivotX = pivot(x);
  const pivotY = pivot(y);
  const pivotZ = pivot(z);

  return [
    Number((116 * pivotY - 16).toFixed(4)),
    Number((500 * (pivotX - pivotY)).toFixed(4)),
    Number((200 * (pivotY - pivotZ)).toFixed(4)),
  ];
}
