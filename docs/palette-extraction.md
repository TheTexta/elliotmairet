# MMCQ vibrant palettes

## Scope and rollout

The owner approved the palette change and catalogue backfill on **2026-11-05**.
Release and backfill are **pending**. This is a **palette-only release** for
display and colour matching. The experimental blob/colour-neighbourhood layout
is not releasing; the production gallery layout and catalogue ordering remain.

On release, new uploads use the new analyser through the existing authenticated,
transactional publication flow. Existing photograph palettes do not change merely
because application code is deployed. The approved catalogue backfill still needs
original-file analysis, backups/rollback, verification and invalidation of catalogue,
palette and photograph-detail caches. No schema migration is required.

`features:backfill:oklab` is a **legacy k-medoids** writer. It is not an MMCQ
backfill tool and must not be used to upgrade this model: it would replace only
the OKLab side with the old algorithm. The old extraction modules remain for
comparison/rollback. This transfer adds no backfill tooling or automatic reprocessing.

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

## Review and verification

The 2026-11-05 feature-checkout review compared **24 photographs** using 640px
derivatives (eight each of monochrome, muted and vibrant examples). Those
derivatives support visual comparison, not an exact original-file backfill.
Read-only review scripts remain feature-only and are not included in this release.

Use `npm run test:palette`, `test:similarity`, `test:upload`, `test:images`,
`lint`, and `build`. Tests cover support/noise, real-sample swatches, pairwise
diversity, muted/flat/transparent inputs, determinism, separate coordinate
spaces/counts, unequal palette sizes and variable-swatch controls.
