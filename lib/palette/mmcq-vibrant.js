import { rgbToOklab } from "./oklab-k-medoids.js";

/** @typedef {[number, number, number]} Rgb */
/** @typedef {{rgb: Rgb, count: number, oklab: Rgb}} ObservedColour */
/** @typedef {{coordinates: Rgb, count: number, colours: ObservedColour[]}} Bin */

export const MMCQ_VIBRANT_ALGORITHM = "mmcq64-vibrant-oklab-v1";
export const MMCQ_CANDIDATE_COUNT = 64;
export const MMCQ_PASSES = 2;
export const MMCQ_SAMPLE_LONGEST_SIDE = 256;
export const MMCQ_MINIMUM_DISTANCE = 0.055;

/** @param {Rgb} first @param {Rgb} second */
function distance(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

/** @param {Rgb} rgb */
function key(rgb) { return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]; }

/** @param {Bin[]} bins */
function box(bins) {
  const minimum = [31, 31, 31], maximum = [0, 0, 0];
  let count = 0;
  for (const bin of bins) {
    count += bin.count;
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], bin.coordinates[axis]);
      maximum[axis] = Math.max(maximum[axis], bin.coordinates[axis]);
    }
  }
  const ranges = maximum.map((value, axis) => value - minimum[axis] + 1);
  return { bins, count, ranges, volume: ranges[0] * ranges[1] * ranges[2] };
}

/** @param {ReturnType<typeof box>} source */
function split(source) {
  const axis = source.ranges.indexOf(Math.max(...source.ranges));
  const bins = [...source.bins].sort((a, b) => a.coordinates[axis] - b.coordinates[axis]
    || key(a.coordinates) - key(b.coordinates));
  let population = 0, cut = 1, nearestMedian = Infinity;
  for (let index = 0; index < bins.length - 1; index++) {
    population += bins[index].count;
    // Cut between occupied positions, never inside one quantised coordinate.
    const delta = Math.abs(population - source.count / 2);
    if (bins[index].coordinates[axis] !== bins[index + 1].coordinates[axis] && delta < nearestMedian) {
      nearestMedian = delta;
      cut = index + 1;
    }
  }
  return [box(bins.slice(0, cut)), box(bins.slice(cut))];
}

/**
 * Population-first modified median cut, then population × RGB-box volume.
 * Empty boxes cannot consume candidate slots. Representatives are snapped to
 * sampled colours; no synthetic vibrant/muted roles or invented fill swatches.
 * @param {ObservedColour[]} observed
 */
function candidates(observed) {
  /** @type {Map<number, Bin>} */
  const histogram = new Map();
  for (const colour of observed) {
    /** @type {Rgb} */
    const coordinates = [colour.rgb[0] >> 3, colour.rgb[1] >> 3, colour.rgb[2] >> 3];
    const index = key(coordinates);
    const bin = histogram.get(index) ?? { coordinates, count: 0, colours: [] };
    bin.count += colour.count;
    bin.colours.push(colour);
    histogram.set(index, bin);
  }
  let boxes = [box([...histogram.values()])];
  for (const [target, byVolume] of [[Math.ceil(MMCQ_CANDIDATE_COUNT * 0.75), false], [MMCQ_CANDIDATE_COUNT, true]]) {
    while (boxes.length < Number(target)) {
      let chosen = -1, best = -1;
      boxes.forEach((item, index) => {
        if (item.bins.length < 2) return;
        const priority = item.count * (byVolume ? item.volume : 1);
        if (priority > best) { chosen = index; best = priority; }
      });
      if (chosen < 0) break;
      const source = boxes.splice(chosen, 1)[0];
      boxes.push(...split(source));
    }
  }
  return boxes.map((item) => {
    const colours = item.bins.flatMap(bin => bin.colours);
    /** @type {Rgb} */
    const mean = [0, 0, 0];
    for (const colour of colours) {
      for (let axis = 0; axis < 3; axis++) mean[axis] += colour.oklab[axis] * colour.count / item.count;
    }
    colours.sort((a, b) => distance(a.oklab, mean) - distance(b.oklab, mean)
      || b.count - a.count || key(a.rgb) - key(b.rgb));
    return { rgb: colours[0].rgb, oklab: colours[0].oklab, count: item.count };
  }).sort((a, b) => b.count - a.count || key(a.rgb) - key(b.rgb));
}

/**
 * Select up to five supported, vibrant and perceptually distinct MMCQ colours.
 * Scores select/rank swatches; weights independently measure the full sample's
 * nearest-selected OKLab populations. Missing roles are never synthesised.
 * @param {Rgb[]} pixels
 * @param {number} [paletteSize]
 */
export function extractMmcqVibrantPalette(pixels, paletteSize = 5) {
  if (!pixels.length) throw new Error("Cannot extract a palette from an empty pixel sample.");
  if (!Number.isInteger(paletteSize) || paletteSize < 1 || paletteSize > 5) {
    throw new Error("Palette size must be an integer between one and five.");
  }
  /** @type {Map<number, ObservedColour>} */
  const histogram = new Map();
  for (const pixel of pixels) {
    if (pixel.length !== 3 || pixel.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new Error("RGB samples must contain three integer channels from 0 to 255.");
    }
    const index = key(pixel);
    const existing = histogram.get(index);
    if (existing) existing.count++;
    else histogram.set(index, { rgb: [...pixel], count: 1, oklab: rgbToOklab(pixel) });
  }
  const observed = [...histogram.values()].sort((a, b) => key(a.rgb) - key(b.rgb));
  const all = candidates(observed);
  const minimumSupport = Math.max(3, Math.ceil(pixels.length * 0.001));
  let available = all.filter(colour => colour.count >= minimumSupport);
  // Tiny/flat photographs must still have a real, supported colour.
  if (!available.length) available = all.slice(0, 1);
  const maximumPopulation = all[0].count;
  /** @type {typeof available} */
  const selected = [];
  const nearest = all.map(() => 0.5);
  while (selected.length < paletteSize && available.length) {
    let chosen = -1, best = -Infinity;
    available.forEach((colour, index) => {
      const separation = selected.length ? Math.min(...selected.map(swatch => distance(colour.oklab, swatch.oklab))) : 0.25;
      if (separation < MMCQ_MINIMUM_DISTANCE) return;
      const [lightness, a, b] = colour.oklab;
      const chroma = Math.min(1, Math.hypot(a, b) / 0.22);
      const exposure = Math.min(1, lightness / 0.15, (1 - lightness) / 0.1);
      const population = Math.sqrt(colour.count / maximumPopulation);
      const base = chroma * exposure * 0.65 + population * 0.25 + (1 - Math.abs(lightness - 0.6)) * 0.1;
      // Coverage gain keeps substantial muted backgrounds represented without
      // forcing six named roles or making tiny vivid accents dominate weights.
      const coverage = selected.length ? all.reduce((sum, candidate, i) =>
        sum + candidate.count / pixels.length * Math.max(0, nearest[i] - distance(colour.oklab, candidate.oklab)), 0) / 0.25 : 0;
      const score = base * (0.35 + 0.65 * Math.min(1, separation / 0.25)) + coverage * 1.2;
      if (score > best) { best = score; chosen = index; }
    });
    if (chosen < 0) break;
    const colour = available.splice(chosen, 1)[0];
    selected.push(colour);
    all.forEach((candidate, index) => { nearest[index] = Math.min(nearest[index], distance(colour.oklab, candidate.oklab)); });
  }
  const populations = selected.map(() => 0);
  for (const colour of observed) {
    let chosen = 0, nearest = Infinity;
    selected.forEach((swatch, index) => {
      const difference = distance(colour.oklab, swatch.oklab);
      if (difference < nearest) { nearest = difference; chosen = index; }
    });
    populations[chosen] += colour.count;
  }
  return selected.map((colour, index) => ({ rgb: colour.rgb, oklab: colour.oklab, weight: populations[index] / pixels.length }));
}
