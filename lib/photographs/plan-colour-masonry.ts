import { rgbToOklab } from "../palette/oklab-k-medoids.js";
import { masonryGap, masonryGeometry, photographAspectRatio } from "./masonry-geometry.ts";

type ColourPhotograph = {
  filename: string;
  width: number;
  height: number;
  palette: readonly { hex: string; weight?: number }[];
};

type Swatch = { lightness: number; a: number; b: number; weight: number };
type Profile = {
  swatches: Swatch[];
  lightness: number;
  chroma: number;
  hue: number;
};
type Entry<Item> = { item: Item; profile: Profile; key: number; index: number; group: number };

const monochromeChroma = 0.012;
const targetBlobArea = 3.5;
const maximumBlobMembers = 16;

function stableKey(filename: string) {
  let hash = 2166136261;
  for (let index = 0; index < filename.length; index++) hash = Math.imul(hash ^ filename.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function colourProfile(palette: ColourPhotograph["palette"]): Profile {
  const valid = palette.filter(({ hex }) => /^#[0-9a-f]{6}$/i.test(hex));
  const totalWeight = valid.reduce((sum, { weight }) =>
    sum + (Number.isFinite(weight) && weight! > 0 ? weight! : 0), 0);
  const swatches = valid.map(({ hex, weight }) => {
    const rgb: [number, number, number] = [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
    const [lightness, a, b] = rgbToOklab(rgb);
    return {
      lightness, a, b,
      weight: totalWeight > 0
        ? (Number.isFinite(weight) && weight! > 0 ? weight! / totalWeight : 0)
        : 1 / valid.length,
    };
  });
  // RMS chroma, not the chroma of an averaged colour: red + cyan is not B&W.
  const chroma = Math.sqrt(swatches.reduce((sum, colour) =>
    sum + colour.weight * (colour.a ** 2 + colour.b ** 2), 0));
  const dominant = swatches.reduce<Swatch | undefined>((best, colour) =>
    !best || colour.weight * Math.hypot(colour.a, colour.b)
      > best.weight * Math.hypot(best.a, best.b) ? colour : best, undefined);
  return {
    swatches,
    lightness: swatches.reduce((sum, colour) => sum + colour.weight * colour.lightness, 0),
    chroma,
    hue: dominant ? Math.atan2(dominant.b, dominant.a) : 0,
  };
}

function hueDistance(first: Profile, second: Profile) {
  const angle = Math.abs(first.hue - second.hue) % (2 * Math.PI);
  return Math.min(angle, 2 * Math.PI - angle) / Math.PI;
}

function paletteDistance(first: Profile, second: Profile) {
  function nearest(source: Profile, target: Profile) {
    return source.swatches.reduce((sum, colour) => sum + colour.weight * Math.min(
      ...target.swatches.map((candidate) => Math.hypot(
        (colour.lightness - candidate.lightness) * 0.45,
        colour.a - candidate.a,
        colour.b - candidate.b,
      )),
    ), 0);
  }
  return (nearest(first, second) + nearest(second, first)) / 2;
}

function makeBlobs<Item extends ColourPhotograph>(entries: Entry<Item>[]) {
  const remaining = [...entries];
  const blobs: Entry<Item>[][] = [];
  while (remaining.length) {
    const seed = remaining.shift()!;
    const blob = [seed];
    let area = photographAspectRatio(seed.item);
    const candidates = remaining.map((entry) => ({
      entry,
      distance: paletteDistance(seed.profile, entry.profile) + hueDistance(seed.profile, entry.profile) * 0.12,
    })).filter(({ entry, distance }) =>
      hueDistance(seed.profile, entry.profile) < 0.28 && distance < 0.15,
    ).sort((a, b) => a.distance - b.distance || a.entry.key - b.entry.key);
    for (const { entry } of candidates) {
      const nextArea = photographAspectRatio(entry.item);
      if (blob.length < maximumBlobMembers && area + nextArea <= targetBlobArea) {
        blob.push(entry);
        area += nextArea;
      }
    }
    const members = new Set(blob);
    for (let index = remaining.length - 1; index >= 0; index--) {
      if (members.has(remaining[index])) remaining.splice(index, 1);
    }
    blob.forEach((entry) => { entry.group = blobs.length; });
    blobs.push(blob);
  }
  return blobs;
}

function relation(first: Profile, second: Profile) {
  if (!first.swatches.length || !second.swatches.length) return 0.2;
  if (first.chroma <= monochromeChroma || second.chroma <= monochromeChroma) {
    return Math.max(first.chroma, second.chroma) * 18 + Math.abs(first.lightness - second.lightness) * 0.4;
  }
  // Near-neutral hues are unreliable; do not treat their hue contrast like a
  // saturated red/blue boundary merely because they cross a binary threshold.
  return (1 - hueDistance(first, second)) * 1.8 * Math.min(1, Math.min(first.chroma, second.chroma) / 0.05);
}

function context<Item extends ColourPhotograph>(photographs: readonly Item[]) {
  const entries: Entry<Item>[] = photographs.map((item) => ({
    item, profile: colourProfile(item.palette), key: stableKey(item.filename), index: 0, group: -1,
  })).sort((a, b) => a.key - b.key || a.item.filename.localeCompare(b.item.filename));
  entries.forEach((entry, index) => { entry.index = index; });
  const groups = makeBlobs(entries.filter(({ profile }) => profile.swatches.length && profile.chroma > monochromeChroma));
  const costs = new Map<number, number>();
  function cost(a: number, b: number) {
    const key = Math.min(a, b) * entries.length + Math.max(a, b);
    const cached = costs.get(key);
    if (cached !== undefined) return cached;
    const first = entries[a], second = entries[b];
    const value = first.group >= 0 && first.group === second.group
      ? -0.8 + paletteDistance(first.profile, second.profile)
      : relation(first.profile, second.profile);
    costs.set(key, value);
    return value;
  }
  const tallestPhotograph = Math.max(0, ...entries.map(entry => photographAspectRatio(entry.item)));
  return { entries, groups, cost, tallestPhotograph, dimensions: entries.map(({ item }) => item) };
}

type Context<Item extends ColourPhotograph> = ReturnType<typeof context<Item>>;

function quality<Item extends ColourPhotograph>(state: Context<Item>, columns: number[][]) {
  const geometry = masonryGeometry(state.dimensions, columns);
  const adjacency: number[][] = Array.from({ length: state.entries.length }, () => []);
  const disconnectedGroups = new Set<number>();
  let score = 0, disconnectedBlobs = 0, largestBlobHeight = 0, largestBlobArea = 0;
  for (const contact of geometry.contacts) {
    score += contact.length * state.cost(contact.first, contact.second);
    adjacency[contact.first].push(contact.second);
    adjacency[contact.second].push(contact.first);
  }
  for (const group of state.groups) {
    const positions = group.map(({ index }) => geometry.positions.get(index)!);
    const height = Math.max(...positions.map(p => p.bottom)) - Math.min(...positions.map(p => p.top));
    const width = Math.max(...positions.map(p => p.column)) - Math.min(...positions.map(p => p.column)) + 1;
    const area = group.reduce((sum, entry) => sum + photographAspectRatio(entry.item), 0);
    score += Math.max(0, width * height - area) * 0.8;
    if (group.length > 1) score += Math.max(0, height - width * 2.4) ** 2 * 0.3;
    largestBlobHeight = Math.max(largestBlobHeight, height);
    largestBlobArea = Math.max(largestBlobArea, area);
    const seen = new Set<number>(), todo = [group[0].index];
    while (todo.length) {
      const index = todo.pop()!;
      if (seen.has(index)) continue;
      seen.add(index);
      for (const neighbour of adjacency[index]) {
        if (state.entries[neighbour].group === group[0].group && !seen.has(neighbour)) todo.push(neighbour);
      }
    }
    if (seen.size < group.length) {
      disconnectedBlobs++; score += 1000;
      disconnectedGroups.add(group[0].group);
    }
  }
  let maximumNeutralRunArea = 0;
  for (const column of columns) {
    let run = 0;
    for (const index of [...column, -1]) {
      if (index >= 0 && state.entries[index].group < 0) {
        run += photographAspectRatio(state.entries[index].item);
      } else {
        maximumNeutralRunArea = Math.max(maximumNeutralRunArea, run);
        score += Math.max(0, run - 2) ** 2 * 0.6;
        run = 0;
      }
    }
  }
  const columnSpread = Math.max(...geometry.heights) - Math.min(...geometry.heights);
  // A pleasing middle is not worth a long, single-column tail. Allow a natural
  // portrait's height difference, but strongly penalise extra unfinished rows.
  score += columnSpread * 0.5 + Math.max(0, columnSpread - state.tallestPhotograph - masonryGap) ** 2 * 8;
  return { score, blobCount: state.groups.length, disconnectedBlobs, largestBlobHeight, largestBlobArea, maximumNeutralRunArea, columnSpread, disconnectedGroups, geometry };
}

function repair<Item extends ColourPhotograph>(state: Context<Item>, columns: number[][]) {
  let best = quality(state, columns);
  function improves(next: typeof best) {
    return next.score < best.score - 0.02
      && [...next.disconnectedGroups].every(group => best.disconnectedGroups.has(group));
  }
  // At most 1,200 whole-layout checks, sampling anchors evenly from beginning
  // THROUGH end. Larger archives must not consume the budget on the first page.
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    const all = [...best.geometry.positions].sort(([, a], [, b]) => a.top - b.top || a.column - b.column).map(([index]) => index);
    const count = Math.min(100, all.length);
    const order = Array.from({ length: count }, (_, i) => all[count === 1 ? 0 : Math.round(i * (all.length - 1) / (count - 1))]);
    const buckets = new Map<string, number[]>();
    function indexPositions() {
      buckets.clear();
      for (const [index, p] of best.geometry.positions) {
        const key = `${p.column}:${Math.floor(p.top / 3)}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(index);
        buckets.set(key, bucket);
      }
    }
    indexPositions();
    for (const index of order) {
      const position = best.geometry.positions.get(index)!;
      const nearby: number[] = [];
      for (let column = position.column - 1; column <= position.column + 1; column++) {
        for (let band = Math.floor(position.top / 3) - 1; band <= Math.floor(position.top / 3) + 1; band++) {
          nearby.push(...(buckets.get(`${column}:${band}`) ?? []));
        }
      }
      const candidates = nearby.filter(other => {
        const p = best.geometry.positions.get(other)!;
        return other !== index && Math.abs(p.column - position.column) <= 1 && Math.abs(p.top - position.top) <= 3;
      }).sort((a, b) => Math.abs(best.geometry.positions.get(a)!.top - position.top)
        - Math.abs(best.geometry.positions.get(b)!.top - position.top)).slice(0, 4);
      for (const other of candidates) {
        const a = best.geometry.positions.get(index)!, b = best.geometry.positions.get(other)!;
        if (Math.abs(a.column - b.column) > 1 || Math.abs(a.top - b.top) > 3) continue;
        [columns[a.column][a.row], columns[b.column][b.row]] = [other, index];
        const next = quality(state, columns);
        if (improves(next)) {
          best = next; changed = true;
          indexPositions();
        } else [columns[a.column][a.row], columns[b.column][b.row]] = [index, other];
      }
      const a = best.geometry.positions.get(index)!;
      for (const column of [a.column - 1, a.column + 1]) {
        if (!columns[column]) continue;
        const row = columns[column].findIndex(other => best.geometry.positions.get(other)!.top >= a.top);
        const target = row < 0 ? columns[column].length : row;
        columns[a.column].splice(a.row, 1);
        columns[column].splice(target, 0, index);
        const next = quality(state, columns);
        if (improves(next)) {
          best = next; changed = true;
          indexPositions();
          break;
        }
        columns[column].splice(target, 1);
        columns[a.column].splice(a.row, 0, index);
      }
    }
    if (!changed) break;
  }
  return columns;
}

/** Quality diagnostics use exactly the geometry rendered at every viewport. */
export function inspectColourMasonry<Item extends ColourPhotograph>(columns: readonly Item[][]) {
  const state = context(columns.flat());
  const indexes = new Map(state.entries.map(entry => [entry.item, entry.index]));
  const result = quality(state, columns.map(column => column.map(item => indexes.get(item)!)));
  return {
    score: result.score, blobCount: result.blobCount, disconnectedBlobs: result.disconnectedBlobs,
    largestBlobHeight: result.largestBlobHeight, largestBlobArea: result.largestBlobArea,
    maximumNeutralRunArea: result.maximumNeutralRunArea,
    columnSpread: result.columnSpread,
    disconnectedPhotographs: [...result.disconnectedGroups].flatMap(group => state.groups[group].map(entry => entry.item.filename)),
  };
}

/** Repair an existing composition without mutating its arrays or photographs. */
export function repairColourMasonry<Item extends ColourPhotograph>(columns: readonly Item[][]): Item[][] {
  const state = context(columns.flat());
  const indexes = new Map(state.entries.map(entry => [entry.item, entry.index]));
  return repair(state, columns.map(column => column.map(item => indexes.get(item)!)))
    .map(column => column.map(index => state.entries[index].item));
}

/** Pure, deterministic, area-aware composition; no image-load measurements. */
export function planColourMasonry<Item extends ColourPhotograph>(photographs: readonly Item[], columnCount: 2 | 3): Item[][] {
  return compose(context(photographs), columnCount);
}

/** Share palette clustering and lazy pair costs between the two SSR plans. */
export function planColourMasonryLayouts<Item extends ColourPhotograph>(photographs: readonly Item[]) {
  const state = context(photographs);
  return { mobile: compose(state, 2), desktop: compose(state, 3) };
}

function compose<Item extends ColourPhotograph>(state: Context<Item>, columnCount: 2 | 3): Item[][] {
  const { entries, cost } = state;
  const blobs = [...state.groups];
  const neutrals = entries.filter(entry => entry.group < 0);
  const columns: number[][] = Array.from({ length: columnCount }, () => []);
  const heights = Array<number>(columnCount).fill(0);
  const positions = new Map<number, { column: number; top: number; bottom: number }>();
  const colourArea = state.groups.flat().reduce((sum, entry) => sum + photographAspectRatio(entry.item), 0);
  const neutralArea = neutrals.reduce((sum, entry) => sum + photographAspectRatio(entry.item), 0);
  let placedColourArea = 0, placedNeutralArea = 0;
  const recentBlobs: Profile[] = [];

  function neighbours(column: number, top: number, bottom: number) {
    const contacts: { index: number; length: number }[] = [];
    const above = columns[column].at(-1);
    if (above !== undefined) contacts.push({ index: above, length: 1 });
    for (const side of [column - 1, column + 1]) {
      if (!columns[side]) continue;
      for (let row = columns[side].length - 1; row >= 0; row--) {
        const index = columns[side][row], p = positions.get(index)!;
        if (p.bottom < top) break;
        const length = Math.min(bottom, p.bottom) - Math.max(top, p.top);
        if (length > 1e-8) contacts.push({ index, length });
      }
    }
    return contacts;
  }
  function place(entry: Entry<Item>, column: number) {
    const top = heights[column], bottom = top + photographAspectRatio(entry.item);
    columns[column].push(entry.index);
    positions.set(entry.index, { column, top, bottom });
    heights[column] = bottom + masonryGap;
  }

  while (blobs.length) {
    const floor = Math.min(...heights);
    const frontier = [...positions].filter(([, p]) => p.bottom >= floor - 1).map(([index]) => index);
    let nextBlob = 0, bestBlobScore = Infinity;
    // Stable filename priority + limited lookahead, not a globally re-ranked
    // catalogue each time a single new saturated photograph is uploaded.
    blobs.slice(0, 4).forEach((blob, index) => {
      const border = frontier.reduce((sum, other) => sum + relation(blob[0].profile, entries[other].profile), 0) / Math.max(1, frontier.length);
      const recurrence = recentBlobs.reduce((sum, p) => sum + (hueDistance(blob[0].profile, p) < 0.2 ? 0.18 : 0), 0);
      if (border + recurrence < bestBlobScore) { bestBlobScore = border + recurrence; nextBlob = index; }
    });
    const pending = [...blobs.splice(nextBlob, 1)[0]];
    const anchorColumn = pending[0].key % columnCount;
    recentBlobs.push(pending[0].profile);
    if (recentBlobs.length > 3) recentBlobs.shift();
    const placed: number[] = [];
    let area = 0;
    while (pending.length) {
      let chosenEntry = 0, chosenColumn = 0, bestScore = Infinity;
      pending.forEach((entry, candidate) => {
        for (let column = 0; column < columnCount; column++) {
          const top = heights[column], bottom = top + photographAspectRatio(entry.item);
          const adjacent = neighbours(column, top, bottom);
          if (placed.length && !adjacent.some(p => entries[p.index].group === entry.group)) continue;
          const boxes = placed.map(index => positions.get(index)!);
          const width = Math.max(column, ...boxes.map(p => p.column)) - Math.min(column, ...boxes.map(p => p.column)) + 1;
          if (width > 2) continue;
          const height = Math.max(bottom, ...boxes.map(p => p.bottom)) - Math.min(top, ...boxes.map(p => p.top));
          const contact = adjacent.reduce((sum, p) => sum + p.length, 0);
          const border = adjacent.reduce((sum, p) => sum + cost(entry.index, p.index) * p.length, 0) / Math.max(1, contact);
          const holes = Math.max(0, width * height - area - photographAspectRatio(entry.item));
          const anchor = placed.length ? 0 : Math.abs(column - anchorColumn) * 1.1;
          const score = border + holes * 0.6 + Math.max(0, height - width * 2.4) * 0.4 + (top - Math.min(...heights)) * 0.7 + anchor;
          if (score < bestScore) { bestScore = score; chosenEntry = candidate; chosenColumn = column; }
        }
      });
      const entry = pending.splice(chosenEntry, 1)[0];
      place(entry, chosenColumn);
      placed.push(entry.index);
      area += photographAspectRatio(entry.item);
    }
    placedColourArea += area;
    const target = placedColourArea / colourArea * neutralArea;
    const budget = (neutralArea - placedNeutralArea) / (blobs.length + 1) * 1.2;
    let allocatedArea = 0;
    while (neutrals.length && columns.every(c => c.length) && placedNeutralArea < target && allocatedArea < budget) {
      let chosenEntry = 0, chosenColumn = 0, bestScore = Infinity;
      neutrals.forEach((entry, candidate) => {
        for (let column = 0; column < columnCount; column++) {
          const top = heights[column];
          const adjacent = neighbours(column, top, top + photographAspectRatio(entry.item));
          const contact = adjacent.reduce((sum, p) => sum + p.length, 0);
          let run = 0;
          for (let row = columns[column].length - 1; row >= 0; row--) {
            const previous = entries[columns[column][row]];
            if (previous.group >= 0) break;
            run += photographAspectRatio(previous.item);
          }
          const score = adjacent.reduce((sum, p) => sum + cost(entry.index, p.index) * p.length, 0) / Math.max(1, contact)
            + (top - Math.min(...heights)) * 0.7 + Math.max(0, run - 1.5) * 0.8;
          if (score < bestScore) { bestScore = score; chosenEntry = candidate; chosenColumn = column; }
        }
      });
      const entry = neutrals.splice(chosenEntry, 1)[0];
      place(entry, chosenColumn);
      const area = photographAspectRatio(entry.item);
      allocatedArea += area; placedNeutralArea += area;
    }
  }
  for (const entry of neutrals) place(entry, heights.indexOf(Math.min(...heights)));
  return repair(state, columns).map(column => column.map(index => entries[index].item));
}
