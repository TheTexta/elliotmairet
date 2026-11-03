# Admin shadcn/ui components

Locally owned adaptations of the official shadcn/ui **radix-nova** registry,
reviewed using CLI **4.23.0** on 2026-10-31. Upstream components are MIT licensed;
see `LICENSE`. This is a component foundation, not a stock dashboard/theme.

- Button, Input, Textarea, Label, NativeSelect, Alert, Separator, AlertDialog.
- Exact runtime pins: `radix-ui@1.8.1`, `class-variance-authority@0.7.1`,
  `cn@0.5.1`; existing Lucide icons are reused. `lib/utils.ts` re-exports `cn`.
- Keep square edges, 44px primary targets, 16px form inputs and visible black
  focus rings. No dark-mode, toast, form-library or animation dependency is needed.
- The owner-selected compact header is a deliberate exception: its navigation
  uses 24px targets around 12px text. Scoped header CSS overrides only its action
  sizing/cursor; do not shrink shared form controls or their primary actions.
- Admin chrome is strictly black and white: use inversion for hover/active states,
  dashed borders for disabled controls and text/icons for semantic feedback, not
  grey opacity or coloured alert panels. Only photographs and palette swatches
  retain colour. Confirmation overlays use opaque white.
- `components.json` targets `app/(admin)/admin/admin.css`. Token **values** exist
  only within `.admin-ui`, including portaled AlertDialog content/overlay.
  `app/globals.css` references those theme definitions so Tailwind generates the
  semantic utilities; it does not import global token values or base overrides.
  Do not replace public `:root`, body, colour defaults or radius utilities.
- The shared admin confirmation provider owns one dialog, resolves Cancel/Escape/
  navigation/unmount as false, and returns focus to a connected opener. Await a
  decision **before** starting an async React transition or dispatching an action.
  Route changes cancel only the decision, never key/remount the whole workspace.
  Keep the synchronous browser navigation/unload guard separate.

Preview any future additions before writing:

```bash
npx shadcn@4.23.0 add <component> --dry-run
```

Inspect the generated diff, then adapt intentionally. Do not run blanket `init`,
`--all` or `--overwrite`: upstream defaults have smaller/rounded controls and may
write global CSS. Tests: `npm run test:admin` (native form contracts, confirmation
decisions, editor state and compiled theme utilities), plus browser verification
of real Radix focus/keyboard/portal behavior.
