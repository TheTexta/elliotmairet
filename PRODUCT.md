# Elliot Mairet

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Elliot's public photography archive presents the photographs. Authorised archive
administrators upload photographs, find and edit their text, review generation
progress and maintain site content. The public archive and privileged admin
workspace have separate responsibilities and access boundaries.

## Capabilities and constraints

- A catalogue entry is public; there is no separate publication flag.
- Uploads use the existing private-staging/publication/recovery workflow. Keep
  originals, stable storage paths, palette data and provider-aware cleanup intact.
- Photo text has optimistic revisions and protected manual ownership. Automatic
  alt text follows saved titles/descriptions and remains read-only while enabled
  or when its setting cannot be checked.
- Automatic requests share the existing US$5/month budget. Unknown charges cannot
  be blindly retried. Catalogue review and its separate budget remain available.
- Authenticated server actions and database authorisation remain mandatory.
- Public photo pages remain image-only. This admin redesign does not change the
  public site's appearance, schema, storage or generation policy.

## Confirmed admin direction

The owner selected a natural-ratio thumbnail archive, a dedicated edit
page per photograph, a separate upload page and one consistent admin header.
Admin chrome should use black and white, taking restrained editorial cues from
dextery.dev. Photographs and extracted palette swatches retain their real colour.
Search/filter context and gallery position should survive a visit to the editor.
The owner subsequently requested infinite scrolling instead of pages and a
text-fitted, more compact header/nav. Enabled sign-out navigation must visibly
behave as clickable; active-upload locks remain intact.
The latest direction uses plain **Elliot Mairet** and capture-date order: newest
first, left-to-right across rows, then down. Reflow is allowed; chronological
reading order now takes priority over column-first masonry. Keep photos uncropped.
The owner subsequently requested even vertical gaps and rows about three-fifths
of their first justified height. Use compact justified rows: equal height within
each row, proportional widths, consistent gutters and no cropping or date reordering.
Infinite preview loading must not jolt the page or push a visible footer down:
reserve photo geometry before loading, keep loaded rows stable and prefetch ahead.
The owner then removed the manual loading button and requested a properly
clickable native gallery filter. Keep loading automatic, including a lazy-image
fallback when IntersectionObserver is unavailable.

## Product principles

- Finding photographs and editing one photograph are separate tasks.
- Keep routine automation out of the primary photographic workspace, while
  making actionable failures and recovery findable.
- Keep navigation predictable and protect unfinished work.
- Preserve useful native controls, accessible names, keyboard use and readable
  forms across mobile and desktop.

## Evidence

The existing application, `README.md`, `docs/admin-usability-plan.md` and
`docs/photograph-text-generation.md` describe the live workflows and safety
boundaries. The redesign was confirmed in conversation on 2026-11-02. The owner
approved commit/push on 2026-11-03, explicitly requiring preservation of Elliot's
recent deletions; release evidence is recorded in the admin usability plan.
