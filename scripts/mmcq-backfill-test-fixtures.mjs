import { COLUMNS, TABLES } from "./mmcq-backfill-sql.mjs";
import { desiredSnapshot } from "./backfill-mmcq-palettes.mjs";
import { rgbToLab } from "../lib/palette/k-means.js";
import { rgbToOklab } from "../lib/palette/oklab-k-medoids.js";

export function payload(id, colours = [[200, 30, 10], [20, 60, 220]]) {
  const timestamp = "2026-11-05T00:00:00.123Z";
  const common = rgb => ({ red: rgb[0], green: rgb[1], blue: rgb[2], hex: `#${rgb.map(n => n.toString(16).padStart(2, "0")).join("")}`, weight: 1 / colours.length });
  const metadata = { photograph_id: id, algorithm: "mmcq64-vibrant-oklab-v1", algorithm_iterations: 2, sample_longest_side: 256, analyzed_at: timestamp };
  return {
    ...metadata, palette_size: colours.length,
    colours: colours.map((rgb, i) => { const [lab_l, lab_a, lab_b] = rgbToLab(rgb); return { ...common(rgb), rank: i + 1, lab_l, lab_a, lab_b }; }),
    oklab_features: { ...metadata, feature_count: colours.length, features: colours.map((rgb, i) => { const [oklab_l, oklab_a, oklab_b] = rgbToOklab(rgb); return { ...common(rgb), rank: i + 1, oklab_l, oklab_a, oklab_b }; }) },
  };
}
export function fixture() {
  const tables = Object.fromEntries(TABLES.map(t => [t, []]));
  for (let i = 1; i <= 2; i += 1) {
    tables.photographs.push({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, storage_path: `uploads/${i}'back\\slash.jpg`, filename: `${i}.jpg`, image_width: 4000, image_height: 3000, captured_at: null, title: "Owner's text", alt_text: null, sort_order: null, created_at: "2026-10-01T00:00:00.123456+00:00", updated_at: "2026-10-02T00:00:00+00:00", description: "Preserve all text", caption_mode: "description", custom_caption: null, text_revision: 7 });
  }
  const before = { formatVersion: 1, paletteTable: "photo_palette_colours", tables };
  // Photograph 2 deliberately lacks both analyses; rollback must restore absence.
  const old = payload(tables.photographs[0].id, [[70, 80, 90]]);
  tables.photo_palette_analyses.push({ photograph_id: old.photograph_id, algorithm: "legacy", algorithm_iterations: 10, sample_longest_side: 96, palette_size: 1, analyzed_at: "2026-10-01T00:00:00.654321+00:00" });
  tables.photo_oklab_analyses.push({ ...tables.photo_palette_analyses[0], feature_count: 1 });
  delete tables.photo_oklab_analyses[0].palette_size;
  tables.photo_palette_colours.push({ photograph_id: old.photograph_id, ...old.colours[0] });
  tables.photo_oklab_features.push({ photograph_id: old.photograph_id, ...old.oklab_features.features[0] });
  const journals = tables.photographs.map(p => ({ payload: payload(p.id) }));
  return { before, after: desiredSnapshot(before, journals) };
}
export function fixtureDdl() {
  return TABLES.map(table => `create table public.${table} (${COLUMNS[table].map(c => `${c.name} ${c.type}${c.notNull ? " not null" : ""}`).join(",")});`).join("\n") + `
alter table public.photographs add primary key(id);
alter table public.photo_palette_analyses add primary key(photograph_id), add foreign key(photograph_id) references public.photographs(id) on delete cascade;
alter table public.photo_palette_colours add primary key(photograph_id,rank), add foreign key(photograph_id) references public.photographs(id) on delete cascade;
alter table public.photo_oklab_analyses add primary key(photograph_id), add foreign key(photograph_id) references public.photographs(id) on delete cascade;
alter table public.photo_oklab_features add primary key(photograph_id,rank), add foreign key(photograph_id) references public.photo_oklab_analyses(photograph_id) on delete cascade;
create table public.text_sentinel(n integer not null);
insert into public.text_sentinel values(0);
create function public.test_photo_trigger() returns trigger language plpgsql as $$ begin update public.text_sentinel set n=n+1; return NEW; end $$;
create trigger test_photo_trigger after insert or update on public.photographs for each row execute function public.test_photo_trigger();
`;
}
