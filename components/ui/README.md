# Admin shadcn/ui components

Locally owned adaptations of the official shadcn/ui **radix-nova** registry,
not a dashboard/theme. Upstream components are [MIT licensed](LICENSE).

Button, Input, Textarea, Label, NativeSelect, Alert, Separator and AlertDialog
serve the admin UI. Tokens are scoped to `.admin-ui`; preserve native form
contracts and the public site's styles.

Keep square, black/white controls, visible focus and 44px primary targets.
Compact header navigation is a scoped 24px exception. Do not run blanket shadcn
`init`, `--all` or `--overwrite`; preview additions before adapting them.

See [component maintenance](../../docs/admin-components.md) for provenance,
dependency pins, token/confirmation boundaries and safe CLI usage, and
[DESIGN.md](../../DESIGN.md) for the design system.
Run `npm run test:admin` from the repository root; verify Radix focus/keyboard/
portal behavior in a browser as well.
