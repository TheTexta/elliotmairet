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

## Phase 2 — shadcn/ui integration

Adopt shadcn/ui as the admin component foundation, not a new visual theme. Scope
it to `/admin`; do not restyle the public portfolio or import a stock dashboard.

1. **Foundation:** current manual installation and official radix-nova registry
   checked with CLI 4.23.0. Added `components.json` and eight locally owned
   components. Runtime dependencies are pinned to `radix-ui@1.8.1`,
   `class-variance-authority@0.7.1`, `cn@0.5.1`. Tokens live under `.admin-ui`,
   including portals; the global Tailwind entry uses a reference only. No public
   body/base, radius, colour values, font or dark-mode override was added.
2. **Controls:** login, site content, archive filters, photo editing, uploads,
   automatic text, private review and file cleanup use the shared components.
   Native input names, validation limits, date/file controls, selects and
   disabled/pending semantics remain intact.
3. **Confirmations:** one shared AlertDialog handles permanent removal, deliberate
   discard, paid retry, live original-suggestion replacement, exact batch apply,
   preview release and rollback. Warnings retain filename, budget and scope.
   Concurrent prompts cannot overwrite a decision; unmount resolves false.
   Decisions are awaited before async transitions/action dispatch. Native
   synchronous navigation and document-unload guards are intentionally unchanged.
4. **Disclosure/feedback:** native details already meet the workflow and remain;
   no gratuitous Accordion/Sheet/sidebar was installed. Upload stays in-flow.
   Inline errors use Alert and retain persistent recovery/status text; no toast
   dependency or transient-only feedback was added.
5. **Release:** no database, storage, auth, AI request or production-content change
   is required. After disclosure of the pre-existing security advisories below,
   the owner explicitly approved committing and deploying this integration as-is.
   No security/framework upgrade is bundled into that approval.

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
shadcn/ui is a separate second-phase change, not part of that deployed caption
feature. Release uses a sanitized committed snapshot, excluding private artifacts.

### shadcn verification and security baseline

Offline checks: 39 admin/component/confirmation tests, 58 text tests, 33 upload
tests, 28 image/SEO tests; lint, TypeScript and production build. The compiled-CSS
test explicitly checks semantic utilities: defining `@theme` only in the nested
admin stylesheet was insufficient, so the global entry now references it.
Independent browser verification used actual components and Radix at 320px and
1400px, mocking only Next adapters/actions, transport and photo delivery. Cancel,
Escape, outside-click behavior, keyboard trap/return, exactly-once mocked removal,
paid-retry/manual-replacement/batch warnings and cancellation, retained draft/photo
edits and prepared-upload navigation guards passed. Expanded admin and content
axe scans reported zero violations. Modal scans had no violations but disclosed
incomplete background/focus-guard and contrast checks; manual focus/opaque token
contrast checks supplemented them. This is not full WCAG or screen-reader testing.

Review caught two confirmation lifecycle issues: awaiting a modal inside an async
transition could defer the modal itself (confirmation now precedes dispatch), and
the persistent layout could retain a decision after browser Back (the decision
scope is now keyed by pathname and unmount cancels). A long-description mobile
check also required keeping actions fixed while the focusable details region
scrolls, rather than scrolling the whole dialog. Focused browser regression at
320×800 passed with a valid 1,000-character description and extreme unbroken
tokens: both 44px actions remain visible, Cancel starts focused, keyboard scrolling
works and focus stays trapped/returns correctly. Those dialog axe scans had zero
violations or incomplete checks. A reactive local pathname adapter also verified
scope remount, false resolution and zero stale delete/paid-retry action calls.
Actual signed-in Next routing, real persistence, touch devices and screen readers
were not exercised; no production mutations were performed.

A read-only local Next production-server smoke verified the real login uses the
components and compiled semantic styles, public pages serve without admin
components, and anonymous admin visits redirect. Its existing daily local ISR
cache still held the old homepage title; direct public database and live homepage
reads confirmed **Elliot Mairet** and the clean description. No SEO values were
changed by this integration.

`npm audit` reports 20 affected packages (one critical, three high, 16 moderate).
Independent comparison against the pre-integration lockfile confirmed all 22
implicated installation paths have identical versions; no advisory was introduced
by this integration and no existing package version was silently upgraded.
Pre-existing baseline includes Next 16.3.3 (critical), Sharp 0.35.4,
source-map-js 1.2.1 (high), development Zod 4.6.5 (high), and minimatch/lint tooling
(moderate). Do not run `npm audit fix --force` or silently include framework/image
pipeline upgrades. Owner-approved remediation and fresh compatibility verification
remain separate follow-up work. The owner approved this UI release after these
findings were disclosed; that approval does not resolve the advisories.
