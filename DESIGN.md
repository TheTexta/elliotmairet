---
name: Elliot Mairet Admin
description: Admin-only design system — photographs first, restrained editorial admin; public gallery identity remains outside scope.
colors:
  ink: "#000"
  paper: "#fff"
typography:
  page-title:
    fontFamily: Montserrat
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  page-title-wide:
    fontFamily: Montserrat
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: "2.25rem"
    letterSpacing: "-0.025em"
  body:
    fontFamily: Montserrat
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: Montserrat
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1.5"
  control:
    fontFamily: Montserrat
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  button:
    fontFamily: Montserrat
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  navigation:
    fontFamily: Montserrat
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.04em"
rounded:
  none: "0"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0.5rem 1rem"
  button-outline-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-ghost:
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0.5rem 1rem"
  button-destructive:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0.5rem 1rem"
  button-link:
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0.5rem 1rem"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0.5rem 0.75rem"
    width: "100%"
  navigation-link:
    textColor: "{colors.ink}"
    typography: "{typography.navigation}"
    padding: "0.125rem 0.375rem"
  alert:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.75rem"
    width: "100%"
---

# Design System: Elliot Mairet Admin

## Overview

**Creative North Star: "Photographs first, restrained editorial admin"**

This system describes `/admin` only: a compact photographic workspace with white canvas, black ink, readable Montserrat and precise rules. The editorial header takes restrained cues from dextery.dev without importing oversized homepage whitespace or reducing task labels to decorative microtype.

Photographs lead; controls support finding and editing them. The public gallery's existing identity, layout and image motion are preserved outside this scope. These are admin-scoped decisions, not global portfolio defaults.

**Key Characteristics:**
- Black/white chrome; photographs and extracted palettes keep their colour.
- Square controls, thin rules and outlined keyboard focus.
- Natural-ratio thumbnails, separate editing and upload workspaces.
- One persistent header and readable, explicit form states.

## Colors

### Primary
- **Ink** is the primary action fill, text, border, focus outline, caret and native-control accent. Destructive actions use the same ink, with explicit wording rather than a red semantic colour.

### Neutral
- **Paper** is the canvas, field, popover and opaque dialog-overlay surface; it is also reversed action text.
- Admin semantic aliases in `admin.css` resolve to these two primitives; there is no additional neutral ramp. Photographs and palette data are content, not UI colour tokens.

**The Chrome Rule.** Admin chrome uses ink and paper only; retain the real colour of photographs and extracted palettes.

## Typography

Montserrat is retained through `next/font/google` in `app/layout.tsx`; no new font assets or alternative display family are introduced. Admin resets inherited uppercase to normal case; only brand/navigation and specific status labels are uppercase.

- **Page title:** `page-title`, switching to `page-title-wide` at the small breakpoint. Medium weight and tight tracking establish hierarchy without a hero-scale heading.
- **Body:** `body` for task copy; longer notices use observed relaxed leading (1.625) or explicit (1.5rem) leading.
- **Label:** `label` for field labels; filenames, metadata and helper text use the same small size at normal weight, with the default small-text line height (1rem).
- **Control:** `control` keeps inputs, selects and textareas at a readable (16px), including mobile. Textareas use relaxed leading (1.625).
- **Button / navigation:** compact action text uses `button`; brand and navigation use `navigation` with uppercase labels. Dialog titles use control-size text at medium weight.

The hierarchy is task-driven, not a synthetic modular scale. Source: `page-heading.tsx`, `photos/form-controls.tsx`, `components/ui/` and the installed Tailwind theme.

## Layout

- `admin.css` scopes tokens under `.admin-ui`; `admin/layout.tsx` owns this boundary. `(workspace)/layout.tsx` and `admin-workspace.tsx` retain one header across authenticated routes; login reuses the same header component independently.
- The sticky header has a thin bottom rule (1px), white background and stack level (40). Its height follows its content, with no fixed minimum header height. Below (48rem), the brand sits above a full-width navigation row with no inter-item gap and non-wrapping labels. Brand and navigation targets have a (24px) minimum height; navigation links and the header button hug their text with (0.125rem 0.375rem) padding. At (48rem), the section label appears in a single-row grid, `minmax(0, 1fr) auto minmax(max-content, 1fr)`, so the right navigation track cannot collapse.
- Page padding is (1.5rem 1rem 3rem), becoming (2rem 2rem 3rem) at (40rem); inline padding becomes (3rem) at (64rem). Title groups have a (1.5rem) bottom margin and wrapping actions. Reuse the extracted quarter-rem spacing steps rather than inventing a new density scale.
- Thumbnails use one justified, wrapping flex layout. Each photograph's flex basis and growth follow its original aspect ratio, giving every photo in a row the same height without cropping. The gap is (0.75rem), increasing to (1rem) at (40rem); no extra vertical holes remain beneath shorter photographs. Responsive target row heights are (4.8rem) and (7.2rem) from (40rem), explicitly reduced to 60% of the first justified layout's (8rem)/(12rem) targets at the owner's request. Actual row heights adjust with available width and proportions; a proportional 1.5× ceiling keeps incomplete rows left-aligned instead of enlarging a lone photograph. Reading and tab order run **left-to-right, top-to-bottom by capture date, newest first**. Empty or unknown dates come last; equal dates retain existing catalogue order. Filtering creates a new array, sorted before revealing increments, without changing caller data. There are no fixed column counts or separate batch wrappers. Lightweight, aria-hidden ratio slots reserve the full matching layout before previews appear, so loading cannot reflow existing rows or grow the page; viewport changes and explicit filtering can reflow it.
- The archive starts with 48 real thumbnails; remaining slots contain no image, edit link or focus target. An intersection observer watches unloaded slots with a (1000px 0px) root margin and reveals through the highest approaching index, rounded to 48-item increments. Direct scrolling into reserved space also loads that area rather than leaving it blank. Keyboard focus within eight photos of the revealed edge prepares another batch without moving focus. The keyboard-operable Load more photographs action sits in the stable top toolbar, remains mounted but disabled on completion and intentionally focuses the first newly revealed thumbnail when activated. There is no moving bottom loading footer or height animation. The mounted preview set grows with the catalogue, not a fixed 48-item cap or paginated navigation. Images preserve natural proportions, lazy-load with responsive sizes and link to dedicated editors without prefetching. Only search/filter state is encoded in the URL; legacy page parameters are ignored. The revealed count is restored from session storage before return scroll/focus, when storage is available. Thumbnail cards contain no visible captions or inline editors; accessible link names still identify the photograph.
- Search/filter fields stack on mobile and share a row from (40rem), where the filter is (16rem) wide. Edit preview and form stack until (64rem), then use two equal flexible tracks with a (3rem) gap; preview sticks at (6rem) from the top and remains uncropped with a maximum height of (70svh).
- Upload is a separate page with a form maximum width of (48rem), not a global page-width cap. Preserve flexible wrapping and long-filename handling at the supported minimum viewport (320px).

## Elevation & Depth

Admin surfaces have no shadows or grey tonal panels. Thin black rules, whitespace and black/white inversion establish separation. Confirmation dialogs use an **opaque white** viewport overlay, not a translucent scrim, with a black-bordered content panel above it (stack level 50). Keyboard outlines remain distinct from structural borders.

Motion is functional: buttons use the installed Tailwind colour-transition default (150ms, `cubic-bezier(0.4, 0, 0.2, 1)`); busy upload icons spin and stop under reduced motion. No ornamental admin motion is established. The public gallery's existing 300ms image motion is unrelated and must remain unchanged.

## Shapes

Controls and panels have square corners. Inputs, outlined buttons, alerts and confirmation panels use thin solid borders (1px). Disabled buttons and fields use dashed borders and retain black/white contrast, not grey opacity. Disabled header links are struck through. Focus uses a black outline (2px), offset (2px) on controls and (3px) on links/summaries. Thumbnail hover adds a thin black outline without cropping or lifting the image.

## Components

### Actions
`components/ui/button.tsx`: primary black fill reverses to white on hover; outline, secondary and destructive variants use a white surface and invert to black. Ghost actions invert without a resting visible border. Link actions are underlined and remove the underline on hover. Shared form actions retain square shape, wrapping labels, (44px) minimum height/width and outlined keyboard focus; icon-only controls are (44px) square. Only header navigation compacts its button to (24px) minimum height and no minimum width. Disabled buttons retain a dashed black border and explicit unavailable state.

### Fields
`components/ui/{input,textarea,native-select,label}.tsx` and `photos/form-controls.tsx`: visible labels, white fields, black borders, control-size text, (44px) minimum control height. Textareas resize vertically with a (6rem) minimum height. Native selects retain native interaction, with a non-interactive chevron. Read-only automatic alt text stays legible; disabled inputs have dashed borders. Do not substitute placeholder-only labels.

### Header and page heading
`admin-header.tsx`, `admin-workspace.tsx`, `page-heading.tsx`: brand, section location, Photos / Site content / Sign out remain predictable. Header labels retain (12px) text with (16px) line height and compact targets, distinct from full-size form controls. Current navigation and hover invert; enabled Sign out uses a pointer cursor, while its disabled state uses not-allowed. Upload locks retain clear disabled treatment. Page headings and back links sit beneath this single header rather than introducing another navigation bar. Admin route links explicitly disable prefetching.

### Photograph archive and editor
`photos/{photograph-archive,photograph-thumbnail,photograph-edit-form}.tsx` and `photos/archive-state.ts`: thumbnail-only natural-ratio contact sheet, ordered newest-first across compact justified rows with even gutters; a dedicated editor shows the uncropped photograph beside its text. File details and removal live in disclosures rather than competing with title/description. The declared-ratio slot owns the exact footprint; images are absolutely positioned with `object-contain` so transformed-image rounding cannot accumulate into page-height shifts. A missing preview has an identifiable, scrollable text fallback contained within the same footprint so long filenames cannot enlarge a row. Responsive image sizes account for each photograph's proportional maximum row width. Empty/filter states have textual guidance and a clear next action.

### Notices and confirmations
`components/ui/{alert,alert-dialog}.tsx`: restrained bordered notices, real status/error wording and no coloured semantic panels. Forms distinguish pending, saved, unsaved, stale and failed states; failed saves keep entered text. Unknown automatic settings conservatively keep manual alt text read-only. Confirmations use a square panel (maximum 32rem), viewport gutters (1rem each), scrollable details and stacked mobile actions, switching to a right-aligned action row at (40rem). No toast or floating-card visual language is established.

## Do's and Don'ts

### Do:
- **Do** keep admin chrome black and white while preserving colour in photographs and palette swatches.
- **Do** preserve Montserrat, readable control text, square controls and visible keyboard outlines.
- **Do** keep photographs at natural ratio and separate finding, editing and uploading.
- **Do** preserve the single responsive header and explicit text for empty, busy, unavailable and error states.

### Don't:
- **Don't** apply these admin rules to the public gallery or change its existing image motion.
- **Don't** add grey panels, opacity-muted disabled controls, semantic accent colours, shadows or decorative motion to admin chrome.
- **Don't** replace the thumbnail archive with caption cards, cropped tiles or repeated inline forms.
- **Don't** turn the compact editorial header into a giant homepage composition or shrink labels below the observed type roles.
