import assert from "node:assert/strict";
import test from "node:test";

import { inspectColourMasonry, planColourMasonry, planColourMasonryLayouts, repairColourMasonry } from "./plan-colour-masonry.ts";
import { rgbToOklab } from "../palette/oklab-k-medoids.js";
import { masonryGap, masonryGeometry } from "./masonry-geometry.ts";

function photo(filename, hex, options = {}) {
  return { filename, width: 1200, height: 800, palette: hex ? [{ hex, weight: 1 }] : [], ...options };
}

const colours = ["#d45c39", "#386dbc", "#7e3d9c", "#84a743"];
const catalogue = colours.flatMap((hex, group) => Array.from({ length: 12 }, (_, index) =>
  photo(`${group}-${index}`, hex, { height: index % 3 === 0 ? 1800 : 800 }),
)).concat(Array.from({ length: 24 }, (_, index) => photo(`bw-${index}`, index % 2 ? "#666666" : "#bbbbbb")));

function positions(columns) {
  return columns.flatMap((column, x) => {
    let top = 0;
    return column.map((item) => {
      const position = { item, x, top, bottom: top + item.height / item.width };
      top = position.bottom + masonryGap;
      return position;
    });
  });
}

for (const columnCount of [2, 3]) {
  test(`${columnCount} columns: complete, deterministic and does not mutate caller data`, () => {
    const input = structuredClone(catalogue);
    const before = structuredClone(input);
    for (const p of input) {
      p.palette.forEach(Object.freeze);
      Object.freeze(p.palette);
      Object.freeze(p);
    }
    Object.freeze(input);
    const plan = planColourMasonry(input, columnCount);
    assert.equal(plan.length, columnCount);
    assert.deepEqual(planColourMasonry(input, columnCount), plan);
    assert.deepEqual(input, before);
    assert.equal(new Set(plan.flat()).size, catalogue.length);
    assert.deepEqual(plan.flat().map(p => p.filename).sort(), input.map(p => p.filename).sort());
  });

  test(`${columnCount} columns: recurrent colours form connected neighbours, not one giant hue section`, () => {
    const layout = positions(planColourMasonry(catalogue, columnCount));
    let similarContacts = 0;
    let colourContacts = 0;
    for (const first of layout.filter(p => !p.item.filename.startsWith("bw"))) {
      for (const second of layout.filter(p => p !== first && !p.item.filename.startsWith("bw"))) {
        if (Math.abs(first.x - second.x) > 1) continue;
        const overlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        const above = first.x === second.x && Math.abs(first.top - second.bottom - masonryGap) < 0.001;
        if ((first.x !== second.x && overlap > 0) || above) {
          colourContacts++;
          if (first.item.palette[0].hex === second.item.palette[0].hex) similarContacts++;
        }
      }
    }
    const quality = inspectColourMasonry(planColourMasonry(catalogue, columnCount));
    assert.equal(quality.disconnectedBlobs, 0);
    const colouredCount = catalogue.filter(p => !p.filename.startsWith("bw")).length;
    assert.ok(similarContacts >= colouredCount - quality.blobCount,
      `Insufficient same-colour connections: ${similarContacts}/${colourContacts}`);
    const maxHeight = Math.max(...layout.map(p => p.bottom));
    const neutrals = layout.filter(p => p.item.filename.startsWith("bw"));
    assert.ok(neutrals.some(p => p.top < maxHeight / 3));
    assert.ok(neutrals.some(p => p.top > maxHeight * 2 / 3));
  });
}

test("empty, single-photo, all-neutral and missing-palette catalogues remain usable", () => {
  assert.deepEqual(planColourMasonry([], 2), [[], []]);
  for (const input of [
    [photo("only", "#cc3300")],
    [photo("black", "#000000"), photo("grey", "#888888"), photo("white", "#ffffff")],
    [photo("unknown", null), photo("invalid", "not-a-colour"), photo("known", "#33aa55")],
  ]) {
    assert.deepEqual(planColourMasonry(input, 3).flat().map(p => p.filename).sort(), input.map(p => p.filename).sort());
  }
});

test("missing weights and zero weights use a safe, deterministic palette fallback", () => {
  const weighted = catalogue.map(p => ({ ...p, palette: p.palette.map(({ hex }) => ({ hex, weight: 0 })) }));
  const unweighted = catalogue.map(p => ({ ...p, palette: p.palette.map(({ hex }) => ({ hex })) }));
  assert.deepEqual(planColourMasonry(weighted, 3).map(c => c.map(p => p.filename)),
    planColourMasonry(unweighted, 3).map(c => c.map(p => p.filename)));
});

test("opposing colour swatches are not mistaken for a monochrome photograph", () => {
  const mixed = Array.from({ length: 12 }, (_, index) => photo(`mixed-${index}`, null, {
    palette: [{ hex: "#ff0000", weight: 0.5 }, { hex: "#00ffff", weight: 0.5 }],
  }));
  const plan = planColourMasonry([...mixed, ...Array.from({ length: 12 }, (_, i) => photo(`grey-${i}`, "#888888"))], 3);
  assert.ok(inspectColourMasonry(plan).blobCount > 0, "Opposing coloured swatches were classified as neutral");
  assert.equal(inspectColourMasonry(plan).disconnectedBlobs, 0);
});

test("complementary patches meet side by side rather than filling the width with one hue", () => {
  const input = ["#ff2200", "#00aaaa", "#8844cc", "#80a822"].flatMap((hex, group) =>
    Array.from({ length: 10 }, (_, index) => photo(`${group}-${index}`, hex)));
  function hue(item) {
    const hex = item.palette[0].hex;
    const [, a, b] = rgbToOklab([1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
    return Math.atan2(b, a);
  }
  for (const count of [2, 3]) {
    const plan = planColourMasonry(input, count);
    const flat = plan.flat();
    const geometry = masonryGeometry(flat, plan.map(column => column.map(p => flat.indexOf(p))));
    const borders = geometry.contacts.filter(c => geometry.positions.get(c.first).column !== geometry.positions.get(c.second).column);
    assert.ok(borders.some(c => {
      const angle = Math.abs(hue(flat[c.first]) - hue(flat[c.second]));
      return Math.min(angle, 2 * Math.PI - angle) > Math.PI * 0.75;
    }), "No complementary border between geometrically adjacent columns");
  }
});

test("mixed panoramas and portraits form area-limited CONNECTED patches through the whole gallery", () => {
  const ratios = [0.18, 0.25, 0.67, 1, 1.5, 2.5];
  const input = [...colours, "#888888"].flatMap((hex, group) => Array.from({ length: 24 }, (_, i) =>
    photo(`mixed-${group}-${i}`, hex, { width: 1000, height: 1000 * ratios[(i + group) % ratios.length] })));
  for (const count of [2, 3]) {
    const plan = planColourMasonry(input, count);
    const quality = inspectColourMasonry(plan);
    assert.equal(quality.disconnectedBlobs, 0);
    assert.ok(quality.largestBlobArea <= 3.5 + 1e-8);
    assert.ok(quality.largestBlobHeight < 4.6, `An elongated blob spans ${quality.largestBlobHeight} column widths`);
    assert.ok(quality.columnSpread <= 2.6, `Unbalanced gallery finish: ${quality.columnSpread} column widths`);
    assert.equal(new Set(plan.flat()).size, input.length);
  }
});

test("an unusually tall photograph is allowed its own footprint without stretching a multi-photo patch", () => {
  const input = [...catalogue, photo("tall", "#dd3300", { width: 100, height: 600 })];
  for (const count of [2, 3]) {
    const quality = inspectColourMasonry(planColourMasonry(input, count));
    assert.equal(quality.disconnectedBlobs, 0);
    assert.equal(quality.largestBlobArea, 6);
    assert.ok(quality.largestBlobHeight <= 6 + 1e-8);
  }
});

test("bounded repairs improve a whole-layout score without changing caller arrays or losing photographs", () => {
  const input = colours.slice(0, 2).flatMap((hex, group) => Array.from({ length: 10 }, (_, i) => photo(`${group}-${i}`, hex)));
  const initial = [input.filter((_, i) => i % 2 === 0), input.filter((_, i) => i % 2 === 1)];
  const before = structuredClone(initial);
  const repaired = repairColourMasonry(initial);
  assert.deepEqual(initial, before);
  assert.equal(new Set(repaired.flat()).size, input.length);
  const first = inspectColourMasonry(initial), last = inspectColourMasonry(repaired);
  assert.ok(last.score < first.score);
  assert.ok(last.disconnectedBlobs <= first.disconnectedBlobs);
});

test("repair cannot exchange a broken blob for a DIFFERENT broken blob", () => {
  const hexes = ["#ff0000", "#0000ff", "#00ff00", "#ffff00"];
  const fixtures = [
    [["1-0", 79], ["1-1", 92], ["2-0", 66], ["2-1", 79]],
    [["0-2", 93], ["1-2", 68], ["2-2", 66], ["3-0", 91], ["3-1", 81]],
    [["0-0", 69], ["0-1", 69], ["3-2", 78]],
  ];
  const input = fixtures.map(column => column.map(([name, height]) => photo(name, hexes[Number(name[0])], { width: 100, height })));
  const before = new Set(inspectColourMasonry(input).disconnectedPhotographs);
  const after = inspectColourMasonry(repairColourMasonry(input)).disconnectedPhotographs;
  assert.ok(after.every(name => before.has(name)), "Repair disconnected a previously connected group");
});

test("stable filename priorities ignore upstream query ordering and share the responsive clustering", () => {
  const forward = planColourMasonryLayouts(catalogue);
  const reversed = planColourMasonryLayouts([...catalogue].reverse());
  for (const mode of ["mobile", "desktop"]) {
    assert.deepEqual(forward[mode].map(c => c.map(p => p.filename)), reversed[mode].map(c => c.map(p => p.filename)));
    assert.equal(inspectColourMasonry(forward[mode]).disconnectedBlobs, 0);
  }
  assert.deepEqual(forward.mobile, planColourMasonry(catalogue, 2));
  assert.deepEqual(forward.desktop, planColourMasonry(catalogue, 3));
});

test("appending a photograph does not rerank the entire synthetic catalogue", () => {
  for (const count of [2, 3]) {
    const initial = planColourMasonry(catalogue, count);
    const added = photo("new-upload.jpg", "#d45c39");
    const next = planColourMasonry([...catalogue, added], count);
    const locations = new Map(next.flatMap((column, x) => column.map(p => [p.filename, x])));
    const moved = initial.flatMap((column, x) => column.filter(p => locations.get(p.filename) !== x)).length;
    assert.ok(moved < catalogue.length / 2, `${moved}/${catalogue.length} photos changed columns`);
    assert.equal(next.flat().length, catalogue.length + 1);
    const deleted = planColourMasonry(catalogue.slice(1), count);
    assert.equal(deleted.flat().length, catalogue.length - 1);
    assert.ok(deleted.flat().every(p => p.filename !== catalogue[0].filename));
  }
});

test("monochrome contacts favour muted photographs over saturated ones", () => {
  const saturated = ["#ff2200", "#00aaaa", "#8844cc", "#80a822"];
  const muted = ["#90827f", "#7e8b8b", "#887f8e", "#888b7c"];
  const input = saturated.flatMap((hex, group) => [
    ...Array.from({ length: 4 }, (_, index) => photo(`sat-${group}-${index}`, hex)),
    ...Array.from({ length: 4 }, (_, index) => photo(`muted-${group}-${index}`, muted[group])),
  ]).concat(Array.from({ length: 16 }, (_, index) => photo(`bw-${index}`, "#888888")));
  for (const count of [2, 3]) {
    const plan = planColourMasonry(input, count);
    let contacts = 0, mutedContacts = 0;
    plan.forEach((column, x) => column.forEach((item, row) => {
      if (!item.filename.startsWith("bw")) return;
      for (const neighbour of [column[row - 1], column[row + 1], plan[x - 1]?.[row], plan[x + 1]?.[row]]) {
        if (!neighbour || neighbour.filename.startsWith("bw")) continue;
        contacts++;
        if (neighbour.filename.startsWith("muted")) mutedContacts++;
      }
    }));
    assert.ok(mutedContacts > contacts / 2, `${count} columns: ${mutedContacts}/${contacts} muted contacts`);
  }
});

test("neutral affinity cannot swallow the entire B&W catalogue into one stripe", () => {
  const input = ["#ff0000", "#0000ff", "#77846d", "#888888"].flatMap((hex, group) =>
    Array.from({ length: group === 3 ? 20 : 10 }, (_, index) => photo(`${group}-${index}`, hex)));
  for (const count of [2, 3]) {
    let maximumRun = 0;
    for (const column of planColourMasonry(input, count)) {
      let run = 0;
      for (const item of column) {
        run = item.filename.startsWith("3-") ? run + 1 : 0;
        maximumRun = Math.max(maximumRun, run);
      }
    }
    assert.ok(maximumRun <= 10, `A neutral stripe contains ${maximumRun}/20 B&W photographs`);
  }
});
