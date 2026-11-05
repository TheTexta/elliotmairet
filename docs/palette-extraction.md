# MMCQ vibrant palettes

## Scope and rollout

Implemented locally on `feature/colour-blobs`; **not deployed or backfilled**.
The owner explicitly selected the new swatches for **display, colour matching
and blob placement**, not a separate display-only palette.

On release, new uploads use the new analyser through the existing authenticated,
transactional publication flow. Existing photograph palettes do not change merely
because application code is deployed. Reanalysing the catalogue requires separate
approval, an original-file review, backups/rollback and invalidation of catalogue,
palette and photograph-detail caches. No schema migration is required by this change.

`features:backfill:oklab` is a **legacy k-medoids** writer. It is not an MMCQ
backfill tool and must not be used to upgrade this model: it would replace only
the OKLab side with the old algorithm. The old extraction modules remain for
comparison/rollback; no automatic reprocessing or production writer was added.

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

## Matching and UI compatibility

Swatches/controls render for any nonempty palette, using its actual column count.
Matching retains the previous one-to-one assignment when the target palette is
at least as large as the source selection. When it is shorter, target swatches may
be reused, but **every source and target swatch participates** in the RMS distance.
This avoids dropping valid one/two-colour photographs or matching only a convenient
subset. Single-swatch search behaviour is unchanged.

The extraction intentionally changes future matching and blob composition.
Mixed old/new model catalogues remain readable, but rankings and monochrome
classification should be reviewed before a whole-catalogue rollout.

## Read-only comparison

```bash
npm run palette:review -- --count=24
```

This fetches the public catalogue and **640px derivatives only**, stratifies
monochrome/muted/vibrant examples, and runs the exact new sampler/selector locally.
Outputs are ignored under `.local/palette-review/<timestamp>/`: images,
`results.json` and `index.html`. Optional `--output=NEW_DIRECTORY` refuses to
overwrite an existing directory. `--count` is bounded to 1–60. There is **no apply
mode**, privileged credential, database write, R2 mutation, original download,
paid AI call or remote image-analysis service.

These derivatives are suitable for visual comparison, not an exact original-file
backfill: prior compression/resizing can slightly change selected colours.

The 2026-11-05 local review completed **24 photographs** (eight per stratum).
Muted/vibrant samples had higher mean swatch chroma; the monochrome sample stayed
low-chroma on average, with some subtle sampled colour casts newly visible.
This is initial evidence, **not owner approval of palette quality or a production
backfill**. Review the images, colour-search results and composition together.

## Verification

Use `npm run test:palette`, `test:similarity`, `test:upload`, `test:layout`,
`test:images`, `lint`, and `build`. Tests cover support/noise, real-sample swatches,
pairwise diversity, muted/flat/transparent inputs, determinism, separate coordinate
spaces/counts, unequal palette sizes and controls with one through five swatches.
