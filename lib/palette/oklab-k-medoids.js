/** @typedef {[number, number, number]} Rgb */
/** @typedef {[number, number, number]} Oklab */

export const OKLAB_K_MEDOIDS_ALGORITHM = "kmedoids-oklab-v1";
export const OKLAB_K_MEDOIDS_ITERATIONS = 10;

function linearSrgb(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

/** @param {Rgb} rgb */
export function rgbToOklab([red, green, blue]) {
  const linearRed = linearSrgb(red);
  const linearGreen = linearSrgb(green);
  const linearBlue = linearSrgb(blue);
  const long = Math.cbrt(
    0.4122214708 * linearRed + 0.5363325363 * linearGreen + 0.0514459929 * linearBlue,
  );
  const medium = Math.cbrt(
    0.2119034982 * linearRed + 0.6806995451 * linearGreen + 0.1073969566 * linearBlue,
  );
  const short = Math.cbrt(
    0.0883024619 * linearRed + 0.2817188376 * linearGreen + 0.6299787005 * linearBlue,
  );

  return [
    Number((0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short).toFixed(6)),
    Number((1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short).toFixed(6)),
    Number((0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short).toFixed(6)),
  ];
}

function squaredDistance(first, second) {
  return (
    (first[0] - second[0]) ** 2 +
    (first[1] - second[1]) ** 2 +
    (first[2] - second[2]) ** 2
  );
}

function quantizedColours(pixels) {
  const bins = new Map();

  for (const [red, green, blue] of pixels) {
    /** @type {Rgb} */
    const rgb = [
      Math.min(255, Math.floor(red / 32) * 32 + 16),
      Math.min(255, Math.floor(green / 32) * 32 + 16),
      Math.min(255, Math.floor(blue / 32) * 32 + 16),
    ];
    const key = rgb.join(",");
    const existing = bins.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      bins.set(key, { rgb, oklab: rgbToOklab(rgb), count: 1 });
    }
  }

  return [...bins.values()].sort(
    (first, second) => second.count - first.count || first.rgb.join(",").localeCompare(second.rgb.join(",")),
  );
}

function initialMedoids(colours, featureCount) {
  const medoids = [0];

  while (medoids.length < Math.min(featureCount, colours.length)) {
    let nextIndex = 0;
    let nextScore = Number.NEGATIVE_INFINITY;

    colours.forEach((colour, index) => {
      if (medoids.includes(index)) return;
      const nearestDistance = Math.min(
        ...medoids.map((medoidIndex) =>
          squaredDistance(colour.oklab, colours[medoidIndex].oklab),
        ),
      );
      const score = nearestDistance * colour.count;

      if (score > nextScore) {
        nextIndex = index;
        nextScore = score;
      }
    });

    medoids.push(nextIndex);
  }

  return medoids;
}

/**
 * Extracts representative, observed colour bins using weighted k-medoids in
 * OKLab. Quantization bounds the medoid update cost while pixel counts retain
 * each bin's contribution to the image.
 *
 * @param {Rgb[]} pixels
 * @param {number} [featureCount]
 */
export function extractOklabKMedoids(pixels, featureCount = 5) {
  if (!pixels.length) {
    throw new Error("Cannot extract colour features from an empty pixel sample.");
  }
  if (!Number.isInteger(featureCount) || featureCount < 1) {
    throw new Error("Feature count must be a positive integer.");
  }

  const colours = quantizedColours(pixels);
  const targetCount = Math.min(featureCount, colours.length);
  let medoids = initialMedoids(colours, targetCount);
  let assignments = new Array(colours.length).fill(0);

  for (let iteration = 0; iteration < OKLAB_K_MEDOIDS_ITERATIONS; iteration += 1) {
    assignments = colours.map((colour) => {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      medoids.forEach((medoidIndex, index) => {
        const distance = squaredDistance(colour.oklab, colours[medoidIndex].oklab);
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      });

      return nearest;
    });

    const nextMedoids = medoids.map((currentMedoid, clusterIndex) => {
      const members = colours
        .map((_, index) => index)
        .filter((index) => assignments[index] === clusterIndex);
      let bestMedoid = currentMedoid;
      let bestCost = Number.POSITIVE_INFINITY;

      for (const candidateIndex of members) {
        const cost = members.reduce(
          (sum, memberIndex) =>
            sum +
            squaredDistance(colours[candidateIndex].oklab, colours[memberIndex].oklab) *
              colours[memberIndex].count,
          0,
        );
        if (cost < bestCost) {
          bestMedoid = candidateIndex;
          bestCost = cost;
        }
      }

      return bestMedoid;
    });

    if (nextMedoids.every((medoid, index) => medoid === medoids[index])) break;
    medoids = nextMedoids;
  }

  assignments = colours.map((colour) => {
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    medoids.forEach((medoidIndex, index) => {
      const distance = squaredDistance(colour.oklab, colours[medoidIndex].oklab);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });

    return nearest;
  });

  const totalPixels = pixels.length;
  return medoids
    .map((medoidIndex, clusterIndex) => ({
      rgb: colours[medoidIndex].rgb,
      oklab: colours[medoidIndex].oklab,
      weight:
        colours.reduce(
          (sum, colour, index) => sum + (assignments[index] === clusterIndex ? colour.count : 0),
          0,
        ) / totalPixels,
    }))
    .sort((first, second) => second.weight - first.weight);
}