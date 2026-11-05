import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { cacheTags } from "../cache-tags.ts";

const live = {
  id: "live-photo", filename: "live.jpg", storage_path: "uploads/live.jpg",
  image_width: 1200, image_height: 800, captured_at: "2026-11-03", updated_at: "2026-11-03T00:00:00Z",
  title: null, alt_text: null, description: null, caption_mode: "description",
  custom_caption: null, text_revision: 0, sort_order: null,
};

function queries() {
  const scopes = [], reads = [];
  const tables = {
    photographs: [live],
    photo_palette_colours: ["live-photo", "deleted-photo"].map(photograph_id => ({
      photograph_id, rank: 1, hex: "#000000", lab_l: 0, lab_a: 0, lab_b: 0,
    })),
    photo_oklab_features: [],
  };
  const supabase = { from(table) {
    reads.push(table);
    let rows = tables[table];
    assert.ok(rows, `Unexpected table: ${table}`);
    return {
      select() { return this; }, order() { return this; },
      eq(field, value) { rows = rows.filter(row => row[field] === value); return this; },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    };
  } };
  const source = ts.transpileModule(readFileSync(new URL("./queries.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require(name) {
    if (name === "next/cache") return { unstable_cache(fetcher, keys, options) {
      scopes.push({ keys: [...keys], options });
      return fetcher;
    } };
    if (name === "@/lib/cache-tags") return { cacheTags };
    if (name === "@/lib/supabase/public") return { createPublicClient: () => supabase };
    throw new Error(`Unexpected import: ${name}`);
  } });
  return { ...exports, scopes, reads };
}

test("all photograph caches leave the pre-deletion namespace together and retain invalidation", () => {
  const { scopes, reads } = queries();
  assert.equal(scopes.length, 6);
  assert.equal(new Set(scopes.map(scope => scope.keys.join(":"))).size, 6);
  for (const { keys, options } of scopes) {
    assert.equal(keys[0], "2026-11-05-mmcq-v1");
    assert.equal(keys[1], "photographs");
    assert.equal(options.revalidate, 86400);
    assert.ok(options.tags.includes(cacheTags.photographCatalogue)
      || options.tags.includes(cacheTags.photographDetails) || options.tags.includes(cacheTags.palettes));
  }
  assert.equal(reads.length, 0);
});

test("deleted photographs stay absent from catalogue and direct lookups", async () => {
  const q = queries();
  assert.equal((await q.getPhotographs()).map(photo => photo.filename).join(","), "live.jpg");
  assert.equal(await q.getPhotographByFilename("deleted.jpg"), null);
  assert.equal(await q.getPhotographById("deleted-photo"), null);
  assert.equal((await q.getPhotographByFilename("live.jpg")).id, live.id);
});

test("cached palette rows cannot resurrect a deleted photograph", async () => {
  const q = queries();
  const photographs = await q.getPhotographsWithPalettes();
  assert.equal(photographs.length, 1);
  assert.equal(photographs[0].id, live.id);
  assert.equal(photographs[0].palette.length, 1);
  assert.equal(photographs[0].palette[0].photographId, live.id);
});
