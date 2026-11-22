# Admin component maintenance

The locally owned controls in [`components/ui`](../components/ui) adapt the
official shadcn/ui **radix-nova** registry, reviewed with CLI **4.23.0** on
2026-10-31. Upstream code is MIT licensed; see
[`components/ui/LICENSE`](../components/ui/LICENSE). This is a component
foundation, not a stock dashboard/theme.

Components: Button, Input, Textarea, Label, NativeSelect, Alert, Separator and
AlertDialog. Runtime pins are `radix-ui@1.8.1`,
`class-variance-authority@0.7.1` and `cn@0.5.1`; existing Lucide icons are reused,
and `lib/utils.ts` re-exports `cn`. Check `package.json` before future maintenance.

## Visual and token boundaries

- Preserve square edges, 44px primary targets, 16px form inputs and visible black
  focus rings. No dark-mode, toast, form-library or animation dependency is needed.
- Compact header navigation deliberately uses 24px targets around 12px text.
  Header-scoped CSS overrides action sizing/cursor only; do not shrink shared
  fields or primary actions.
- Admin chrome is black/white: inversion on hover/active, dashed disabled borders
  and text/icons for semantic feedback, not grey opacity/coloured panels.
  Photographs and palette swatches retain colour; dialog overlays are opaque white.
- `components.json` targets `app/(admin)/admin/admin.css`. Token values live only
  within `.admin-ui`, including portaled AlertDialog content/overlay.
  `app/globals.css` references theme definitions for Tailwind utilities, not global
  token values/base overrides. Do not replace public `:root`, body, colour defaults
  or radius utilities.

## Confirmation and native contracts

The shared confirmation provider owns one dialog. Cancel, Escape, navigation or
unmount resolve false; focus returns to a connected opener. Await the decision
**before** an async React transition/action. Route changes cancel the decision,
not key/remount the workspace. Keep synchronous native navigation/unload guards
separate. Preserve native names, validation and disabled/pending semantics.

## Adding controls

Preview before writing:

```bash
npx shadcn@4.23.0 add <component> --dry-run
```

Inspect the diff and adapt intentionally. Never run blanket `init`, `--all` or
`--overwrite`: defaults can round/shrink controls and overwrite global CSS.
`npm run test:admin` checks native forms, confirmations, editor state and compiled
theme utilities. Browser verification must also cover actual Radix focus,
keyboard and portal behavior. See [`DESIGN.md`](../DESIGN.md) and
[`admin-usability-plan.md`](admin-usability-plan.md) for design/release evidence.
