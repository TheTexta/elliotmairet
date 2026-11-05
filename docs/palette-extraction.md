# MMCQ vibrant palettes

## Scope and rollout

The owner approved the palette change and catalogue backfill on **2026-11-05**.
The application code is **deployed** and the catalogue backfill is **complete**.
This is a **palette-only release** for
display and colour matching. The experimental blob/colour-neighbourhood layout
is not releasing; the production gallery layout and catalogue ordering remain.

On release, new uploads use the new analyser through the existing authenticated,
transactional publication flow. Existing photograph palettes do not change merely
because application code is deployed. The approved catalogue backfill used
original-file analysis, backups/rollback, verification and fresh catalogue,
palette and photograph-detail caches. These gates are recorded below;
no schema migration was needed.

`features:backfill:oklab` is a **legacy k-medoids** writer. It is not an MMCQ
backfill tool and must not be used to upgrade this model: it would replace only
the OKLab side with the old algorithm. The old extraction modules remain for
comparison/rollback. The guarded operator workflow is documented in
[`mmcq-backfill.md`](mmcq-backfill.md); no automatic reprocessing is enabled.

## Model

- Version: `mmcq64-vibrant-oklab-v1`.
- Shared sampler: `lib/palette/analyse-buffer.ts`; Sharp auto-orientation,
  maximum 256px longest side, existing input-pixel limit, no enlargement, and
  transparent pixels with alpha at most 200 excluded.
- Quantiser: deterministic 5-bit/channel modified median cut. Split by population
  toward 48 boxes, then by population × box volume toward **64 candidates**.
  Stop early when no occupied box can split.
- Each candidate is snapped to an actually sampled RGB value near its box's
  weighted OKLab mean. No synthetic named roles or recoloured fill swatches.
- Reject candidate regions smaller than **max(3 pixels, 0.1% of the sample)**.
  A tiny image with no eligible region retains its most-supported real candidate.
- Greedy selection favours chroma, reasonable exposure, pixel support and
  perceptual diversity. A coverage-gain term keeps substantial muted backgrounds
  represented rather than treating a tiny bright accent as the entire image.
- Select **up to five** swatches, with pairwise Euclidean OKLab separation at
  least **0.055**. Flat/near-flat images can legitimately return fewer; muted and
  grayscale input is not forced into a vibrant palette.

Selection scores determine palette order, **not population weights**. Weights
come from assigning the full sampled pixel population to its nearest selected
swatch in OKLab. They sum to one before six-decimal database serialization and
are a perceptual region assignment, not the frequency of an exact RGB triplet.

Both database payloads use the same selected RGB values and weights, with
separately computed CIELAB and OKLab coordinates. `palette_size` and
`feature_count` are actual row counts. The existing positive
`algorithm_iterations` field stores **2 quantisation phases** for this version;
it does not claim two k-means iterations.

## Shared production analyser

`analyseImage(buffer, photographId)` in `lib/photographs/analyse-image.ts` is
the production upload analyser and the single owner of both database payload
mappings. Its explicit relative `.ts`/`.js` imports allow future backfill tooling
to import it directly with Node.js 22 `--experimental-strip-types`, without
duplicating payload mapping or adding dependencies. Pass original bytes, not a
compressed/resized derivative, for a catalogue backfill.

Uploads retain the existing 120-megapixel input guard. A bounded, explicit
operator option permits verified archive originals up to 150 megapixels, covering
the one existing 146-megapixel photograph. This changes only input eligibility,
not sampling or palette calculations; no upload route accepts that option from
request data. The backfill pins this allowance and the analyser/runtime hashes.

## Matching and UI compatibility

Swatches/controls render for any nonempty palette, using its actual column count.
Matching retains the previous one-to-one assignment when the target palette is
at least as large as the source selection. When it is shorter, target swatches may
be reused, but **every source and target swatch participates** in the RMS distance.
This avoids dropping valid one/two-colour photographs or matching only a convenient
subset. Single-swatch search behaviour is unchanged.

Mixed old/new model catalogues remain readable, but rankings and monochrome
classification should be verified during the whole-catalogue rollout. Cache
namespace changes and rollout execution remain separate from this transfer.

## Production application release — 2026-11-05

- Project: `elliotmairet` (`prj_M8P1Nz13urCvN1V37yiPL3jLfTUW`), existing
  team `team_2HILKt3irP09F0Knja9Vv9z1` and domain `https://elliotmairet.com`.
- Palette-only application commit: `538e260` on local `release/mmcq-palette`.
  Source was uploaded with the authenticated Vercel CLI, without a Git push.
  Integrate this branch before a future main-branch deployment; the remote main
  branch does not yet contain this release.
- Deployment: `dpl_21CKXa1zKUvmx4b8vPEXtkR2UeLn`, `READY`, aliased to the
  production domains; deployment URL:
  `elliotmairet-iavyzyirz-thetextas-projects.vercel.app`.
- Previous deployment retained as the application rollback:
  `dpl_ExnZSNMQhPyvY4zfHMJStTS4tFuo` (base commit `6f0efc0`). After a palette
  backfill, restore the previous palette data before reverting to that app,
  which did not fully support shorter palettes.
- Normal `npm run build` (Turbopack and TypeScript), lint, palette **17/17**,
  similarity **15/15**, upload **45/45**, images **32/32**, and diff checks pass.
  Independent review found no app regression or blob-layout leakage.
- Public home, palette JSON and four-swatch photograph requests returned **200**.
  The four-swatch photograph rendered four columns and completed full-palette
  and single-colour browser matching. All **271** archive items remain; ordering,
  column positions/widths and absence of overflow were verified at **1440px** and
  **390px**. Subpixel image-height differences below 0.5px reflect decoded
  derivative aspect-ratio rounding, not layout-code changes.
- Fresh pre-backfill reads found **271** photographs, **1,355** CIELAB colours
  and **1,354** OKLab features. Public palettes remain **270 × five + one × four**.
  R2 HEAD checks found all **271** originals with source SHA-256 metadata
  (2.86 GiB total, largest 46.42 MiB). No objects or palette rows were changed.
- That first application deployment preceded all database changes. The completed
  backfill and subsequent cache-refresh release are recorded below.

## Production catalogue backfill — 2026-11-05

- Operator tooling/input-allowance commit: `e306d79`. Independent review resolved
  two concurrency findings with explicit READ COMMITTED and independently connected
  writer/timeout/racing-apply tests. Backfill safeguards **8/8**, PostgreSQL 15
  transaction/concurrency checks **13/13**, palette **18/18**, upload **45/45**,
  lint and the normal production build pass.
- Live schema inspection confirmed the five ordinary physical tables, the final
  `photo_palette_colours` name, **15** photograph columns / **47** total columns,
  and no user triggers on palette tables. No persistent schema/function/grant
  changes were made.
- Consistent preflight custom-format backup of all five tables:
  `.local/palette-backfill/2026-11-05-preflight/photographs-and-palettes-before.dump`.
  SHA-256: `0492cfbc9f38b7e31bf88f8d8758f318fa395110c86c0106bf8a834cf258c387`.
  The archive parsed successfully with all five table-data entries.
- Frozen run: `.local/palette-backfill/2026-11-05-mmcq-v2/` (private directory,
  mode-600 files). Snapshot SHA-256:
  `ff310d5257aacbf8834d190fd714bc3d0ee71391d7e62241e03775802fb0cc40`.
  Manifest SHA-256:
  `efef91b393c453020247df4619f2a632472438b6ad615ad56b89a8add24c5d22`.
- All **271 originals / 3,074,453,766 bytes** passed conditional GET, size and
  recorded source-SHA verification. No derivative was used for backfill. One
  legacy original required the explicit 150MP archive allowance; the first run
  stopped safely after 15 preparations and is retained, with no database writes.
  The fresh v2 run pins the changed code/allowance and completed all originals.
- Independent private backup of the entire frozen run:
  `~/.local/share/opencode/backups/elliot-mmcq-20261105/frozen-mmcq-run.tar.gz`.
  SHA-256: `e21f7ce645928c296a36720bc6fe9590afc0040093b0c2b0650f75aee2ba4df0`.
- The actual **271-row dataset** and live production constraints were rehearsed
  in isolated, networkless PostgreSQL 15: apply, target verification and exact
  rollback passed, with zero photograph writes. This was not a production rollback.
- Production apply returned `applied`; immediate guarded verification returned
  `after`. Both spaces now contain **271 analyses / 1,352 swatches**: 270 palettes
  of five and `20260416-IMG_0080.jpg` with two genuine greys (`#8c8c8c`, `#a1a1a1`).
  RGB, hex, weights and rank order agree between the separate coordinate spaces.
- Post-apply snapshot: `.local/palette-backfill/2026-11-05-after/before.json`,
  SHA-256 `0dfe7eff1044f5b63eccea22c0ce271bc9d37badca2eafa5f2910ca0ecd918e0`.
  All **271 complete photograph rows** match the before snapshot exactly, including
  filenames, paths, dates, text, ordering, timestamps and revisions. All 271 R2
  originals retained their ETag, byte count and recorded source SHA after apply.
- Before/after constraints, RLS, policies, grants and triggers have identical
  SHA-256 `b4f85107600a2fcd3552cac64e5b32504660d3e2fd9b34c0f4e5379eb1eebc8d`.
  No originals, reservations, cleanup jobs, text-generation state or other projects
  were mutated. Detailed local evidence is in `rehearsal.json`,
  `production-apply.json`, and the preflight schema-security snapshots.
- Cache epoch `2026-11-05-mmcq-v1` replaces every photograph/palette query key
  together; a fresh production build/deployment publishes the backfilled home,
  palette JSON and photograph-detail routes. Refresh already-open browser tabs
  to discard their in-memory palette JSON.

### Guarded recovery

Use the pinned manifest with the `verify` and `rollback` commands in
[`mmcq-backfill.md`](mmcq-backfill.md). Restore **both** palette representations
before an application rollback to the pre-compatibility deployment. Rollback
refuses later catalogue/text/palette edits and never restores photograph rows.
Do not bypass a stale-state refusal, edit the immutable run, or restore the raw
custom dump over current production data. Any later recovery requires a separately
reviewed plan if the frozen state no longer matches.

## Review and verification

The 2026-11-05 feature-checkout review compared **24 photographs** using 640px
derivatives (eight each of monochrome, muted and vibrant examples). Those
derivatives support visual comparison, not an exact original-file backfill.
Read-only review scripts remain feature-only and are not included in this release.

Use `npm run test:palette`, `test:similarity`, `test:upload`, `test:images`,
`lint`, and `build`. Tests cover support/noise, real-sample swatches, pairwise
diversity, muted/flat/transparent inputs, determinism, separate coordinate
spaces/counts, unequal palette sizes and variable-swatch controls.
