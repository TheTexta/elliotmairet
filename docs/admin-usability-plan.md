# Admin usability cleanup and shadcn/ui plan

## Goal and constraints

Make uploading and editing photographs understandable to a photographer rather
than exposing generation/storage operations first. Keep Elliot's monochrome,
square-edged editorial identity, responsive image-led archive and existing routes.
Public photograph pages remain image-only, per the separate caption-removal change.

No authorization migration, schema change, new publication state, real test upload,
paid generation or catalogue reapplication is part of this cleanup. Preserve the
US$5/month UTC future-upload limit, separate US$20 catalogue cap and unresolved
catalogue reservation. Never replay an unknown-charge request.

## Findings → initial cleanup

- Operational panels dominated the first screen → compact automation summary,
  archive first, budget/history/import/bulk recovery under disclosures.
- Tiny labels and icon-only navigation → visible Photos / Site content / Sign out,
  readable labels, 16px input text and 44px primary controls.
- Storage paths overshadowed photograph text → title, caption-text preview,
  capture date and View on site; technical file details remain available.
- Irrelevant custom-caption input → conditional input without clearing its value;
  explicit accessibility help and image-only public-page explanation.
- No archive search → search title/description/filename/date and missing-text or
  hidden-caption filters. Hidden rows stay mounted to preserve edits.
- Unsaved/stale state gaps → shared navigation/sign-out guard, prepared-upload
  protection, content saved baseline, per-photo clean/dirty revision reconciliation.
- Saving one draft reloaded siblings → targeted saved-draft refresh.
- Ambiguous delete result → filename-specific permanent-removal confirmation,
  distinguish archive removal from pending file cleanup; cleanup summary remains
  visible even with Advanced tools closed.
- Google title included Photography and snippet included footer links → separate
  search description, clean fallback, exact owner-requested title **Elliot Mairet**,
  contact/credit `data-nosnippet`. Preserve visible biography/contact content.

## Phase 2 — integrate shadcn/ui (requested, not yet implemented)

Adopt shadcn/ui as the admin component foundation, not a new visual theme. Scope
it to `/admin`; do not restyle the public portfolio or import a stock dashboard.

1. **Foundation:** verify the current shadcn CLI's Next.js 16 / React 19 /
   Tailwind v4 instructions; add reproducible `components.json`, locally owned
   component source and only required dependencies. Map tokens to the existing
   neutral palette, Montserrat typography, square edges and focus styles. Avoid
   global CSS changes that affect public pages.
2. **Low-risk controls first:** Button, Input, Textarea, Label, Separator and
   accessible form/status patterns. Retain native date/file controls and current
   server-action field names, validation limits, disabled and pending behavior.
   Use native Select where it remains the simpler accessible choice.
3. **Confirmations:** use AlertDialog for permanent removal and deliberate
   discard/paid retry confirmations. Preserve filenames, financial warning,
   least-destructive default, focus return and keyboard behavior. Do not replace
   synchronous navigation guards with asynchronous dialogs until the navigation
   contract is explicitly implemented and tested.
4. **Progressive disclosure and feedback:** evaluate Collapsible/Accordion where
   they improve native details; retain visible exception counts and batch recovery
   tokens. Optional toast notifications supplement—not replace—persistent inline
   success/error/recovery messages. Keep the upload form in-flow unless a tested
   Dialog/Sheet demonstrably improves the task; do not add a modal by default.
5. **Ship in bounded steps:** migrate and test one workflow at a time, then
   independently review, commit and deploy. Keep a behavior-preserving rollback
   commit; no database/storage migration should be needed.

### shadcn/ui acceptance gates

- Mobile 320px through desktop; no horizontal overflow, usable long filenames,
  44px primary targets, 16px input text, adequate contrast and visible focus.
- Keyboard-only and screen-reader labels; modal focus trap/return and Escape
  behavior where a modal is actually used; reduced motion respected.
- Search retains dirty editors, newer revisions never overwrite dirty input,
  sibling draft saves retain edits, intentional blank fields stay manual-owned.
- Caption Description/Custom/Hidden semantics and retained custom text unchanged.
- Auth checks/RLS, publication reservations, checksums, upload retry/recovery,
  provider-aware cleanup and unknown-charge denial unchanged.
- Exact bulk preview, manual-field exclusions, interrupted-batch recovery and
  rollback remain available and correctly scoped.
- Site title/search description/footer remain separate; search metadata and
  public gallery routes/image-only rendering unchanged by the component migration.
- Run `test:admin`, `test:text`, `test:upload`, `test:images`, lint, TypeScript and
  production build. No real paid/upload/delete acceptance without owner approval.

## Verification and rollout record

Initial cleanup checks on 2026-10-31: `test:admin` (28), `test:text`, `test:upload`
(33), `test:images` (28), lint, TypeScript and production build. Tests are offline
except the build's normal read-only catalogue fetches. The source design scan had
no regex findings; this alone is not a visual/accessibility assessment.

An independent local browser harness rendered the actual React components with
compiled Tailwind/global styles and Montserrat at 320px and 1400px. It verified no
horizontal overflow, readable controls, keyboard focus and upload-panel focus
return, dirty-edit retention through filtering, retained custom caption text,
mocked failures, advanced review and empty/unavailable states. Axe reported zero
violations on expanded photos and site content. This is not full WCAG
certification; Next adapters, persistence, image and upload transport were mocked.
No physical-device or screen-reader testing was performed.

Independent review's two findings (hidden pending-cleanup feedback and an outdated
description submission test harness) were fixed. Rollout uses a sanitized committed
snapshot, excluding environment files/private local artifacts. Production acceptance
is limited to read-only UI plus the explicitly requested title/search-description
edit. Confirm the exact title **Elliot Mairet**, clean description across regular,
Open Graph and Twitter metadata, contact/credit `data-nosnippet`, admin protection,
and anonymous cron denial. Google recrawling/snippet rewriting remains outside the
application's control; no Search Console submission is assumed.

The separate initial caption feature was committed as `5f7ee63` and deployed
successfully. The later `1076785` image-only public-page change is preserved.
shadcn/ui remains a planned second phase, not part of that deployed caption feature.
