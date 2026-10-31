# Photograph text — catalogue and automatic future uploads

Date: 2026-10-30; rollout updated 2026-10-31. Status: **deployed; 270/271 catalogue
photographs applied; automatic future uploads enabled**.

The local implementation now follows this design. See
[the operating guide](photograph-text-generation.md) for current commands,
migration/compatibility behavior, recovery and verification limitations. The
production migration was applied on 2026-10-31 UTC; deployment and generation
are now authorized. Their observed completion is recorded in the operating guide.

Rollout outcome: 270 valid drafts visually reviewed and 810 eligible text fields
applied through authenticated approval. All 271 public photograph pages passed
verification; one unknown-charge request was not replayed and its row/US$4.68
hold remain intact. Known estimated generation usage is US$1.2340425, separate
from the US$5/month future-upload ledger. The first real future-upload-to-caption
production cycle is still to be observed. See the operating guide for evidence.

This document records the owner's decisions and the implementation sequence. It
does not authorize paid generation, production migrations, deployments, or live
text application. Those execution steps remain explicit approval gates.

## Confirmed decisions and current evidence

- Selected generation model: **`gpt-6.1-sol`**, with no silent fallback.
- Scope: every photograph in a fresh catalogue snapshot. The read-only inventory
  currently contains **271 photographs**, all with empty saved titles and alt
  text. Filename-derived public labels are fallbacks, not stored artwork titles.
- Generate Sol text for the existing 20-photo sample first; after sample approval,
  resume the same run for the remaining 251. Do not regenerate completed sample
  entries or replace the original GPT-4.1 pilot artifacts.
- Fresh **US$20 maximum** for the proposed Sol run, including its sample,
  reasoning/output usage, retries and unresolved request reservations. The old
  GPT-4.1 pilot's bill/reservations remain separate historical records.
- Bulk application after sample review, with protected fields and conflicts
  excluded. A final admin preview/confirmation separates generation from live use.
- Titles, descriptions, alt text and custom captions must be editable in admin.
- **Scope correction:** the owner also requested automatic generation for future
  uploads and chose a separate **US$5/calendar month (UTC)** ceiling. The earlier
  exclusion of future-upload processing is superseded. Upload success must not
  depend on OpenAI; show durable pending/error/retry status in admin.
- The approved description is the default visible caption. Each photograph can
  instead use a custom manual caption or hide its caption.
- Preserve photograph IDs, actual filenames, URLs, storage paths, original image
  bytes, capture dates, ordering, palettes, publication semantics and admin access.

## Model discovery after the settings change

At 22:57 UTC on 2026-10-30, `GET /v1/models` returned 130 model IDs instead of the
previous one. The endpoint returned a complete list, with no continuation
indicator. The effective key matched the ignored `.env.local` value, and requests
used `https://api.openai.com` directly. No credentials are recorded here.

The complete local model-ID snapshot is retained in ignored
`.local/photograph-labeling/2026-10-30-model-discovery.json`.

All five candidates below were present in that list and returned HTTP 200 from
`GET /v1/models/{model}`. Their current official documentation supports image
input and structured output through Responses. The 130-model list also contains
legacy, audio, embedding and image-generation offerings: discovery is not a claim
that every listed model suits photograph-to-text labeling.

| Candidate | Standard input / output, USD per 1M tokens | Decision |
| --- | --- | --- |
| `gpt-6.1-sol` | $2 / $10 | Owner-selected model; use for this run |
| `gpt-6.1-terra` | $1 / $5 | Available alternative; no comparison run scheduled |
| `gpt-6-astra` | $10 / $50 | Available higher-capacity option; no escalation scheduled |
| `gpt-6-luna` | $0.10 / $0.50 | Available budget alternative; not an automatic fallback |
| `gpt-5.4-mini` | $0.75 / $4.50 | Previously inaccessible; discovery now succeeds |

Sources: the official model pages under
`https://developers.openai.com/api/docs/models/` for those exact IDs, retrieved on
2026-10-30. Rates are standard uncached input/output, not per-photo quotes.

The discovery-level access blocker is resolved. **No paid inference was made**;
image acceptance, actual quality, effective service tier and billed usage must
still be checked during the first authorized sample request. Availability is not
proof that Sol produces better captions than GPT-4.1 on these photographs.

## Text model and manual precedence

Keep the existing `photographs.title` and `photographs.alt_text` as live text.
Add live `description`, explicit caption settings, a text revision, and field-level
ownership/provenance. Use an additive migration in `supabase/migrations`; do not
rewrite applied migrations or introduce another photograph publication flag.

| Text | Meaning and editing |
| --- | --- |
| Title | Short scene label; editable independently; not claimed to be an artist-assigned artwork title |
| Description | Factual sentence for page/social metadata and the default visible caption |
| Alt text | Accessible visual description; never automatically replaced by a custom caption |
| Custom caption | Optional display-only replacement for the description |
| Filename suggestion | Editable draft text only; never used to rename an object or route |

Use explicit caption modes, not an ambiguous blank-string fallback:

1. **Description:** visible caption resolves to the approved description, or no
   caption when no description exists. Do not show a filename/SEO fallback as a
   caption before text has been approved.
2. **Custom:** visible caption resolves to the nonempty custom caption. Keep the
   description and alt text unchanged.
3. **Hidden:** no visible caption, even when a description/custom value exists.

Preserve stored custom text when switching modes. Returning to Description is an
explicit admin action. The generator never changes caption mode or custom text.

For title, description and alt text, track `unset`, `ai` or `manual` ownership per
field. A manual clear remains manual/protected even when its saved value is null.
Treat any pre-existing nonempty text as manual unless separately approved for
replacement. Owner-entered text in future uploads must also be classified manual.
An unchanged value submitted alongside another edit must not change ownership.
The editor records explicitly touched text fields, including typing then clearing
an already-empty field. Saving that deliberate clear protects it without claiming
unrelated unchanged fields.

Catalogue generation only creates private suggestions. Bulk application may fill unset
fields or replace previously AI-owned values covered by the approval; it never
replaces manual-owned fields. Applying an administrator-edited suggestion makes
that field manual-owned. Explicit per-field **Use AI suggestion** is the way to
replace a manual value, with a preview and normal save confirmation.

## Private drafts, writes and recovery

- Store draft records separately from the public catalogue, keyed by photograph
  ID and run. Preserve immutable model output separately from editable draft text.
- Retain run/configuration identity, prompt/schema versions, requested/resolved
  model, source object identity, preview SHA-256, baseline text revision, provider
  response identity, timestamps, usage and internal uncertainty/review notes.
- Private draft/provenance records must not be exposed through public SELECT,
  page props, palette JSON or a publicly selectable catalogue column. Uncertainty
  notes can be resolved/dismissed in admin and are never public captions.
- Use the existing Supabase authenticated-user/admin architecture; no new
  service-role dependency or shared-authorization migration. Admin RPCs check
  `is_admin()`. The unattended worker has a separately provisioned, server-only
  capability whose SHA-256 is stored privately; it can process existing queued
  jobs only, not grant access, enqueue the old catalogue or perform arbitrary edits.
  All RPCs have narrow grants and a safe fixed search path.
- Put ownership changes, revision checks, live text changes and before/after
  records in one database transaction. Enforce this for every text write path,
  including existing edit actions and future owner-supplied upload text. Do not
  leave a direct-write route that bypasses ownership tracking.
- Check text revisions and source identity at application time. Missing/deleted
  photographs, changed images or stale revisions are conflicts, not permission
  to force an overwrite. Do not use filenames as import identity.
- Make draft import and approved batch application idempotent. Apply bounded
  chunks with independent committed results, recording applied, protected,
  conflicted and failed entries so interrupted work can resume safely.
- Bind bulk confirmation to the exact draft versions/content hashes, run,
  photographs and selected fields. Recheck these along with live text revisions
  inside the application transaction; edits after preview invalidate approval.
- Retain before/after application snapshots. Rollback restores a field only when
  it still matches the recorded applied value/ownership/revision; newer manual
  changes remain protected. Do not restore a whole old photograph row.

## Generation implementation

Extend `scripts/seo/label-photographs.mjs` and its offline tests for the catalogue.
Future uploads use the narrow durable workflow below, not a provider framework or
browser-side OpenAI access. Preserve the fixed pilot's reproducibility with
separate run configuration/output paths.

1. Snapshot the complete catalogue with stable IDs, source paths/dimensions,
   text values, ownership and revision information. Paginate if necessary and
   compare the fetched total with the reported catalogue count. Freeze scope for
   the run; later uploads belong to the separate automatic workflow.
2. Reuse verified pilot previews when their photograph/source identity still
   matches. Prepare the rest from allowlisted public image transforms. Locally
   create JPEG previews no larger than 1024px on the longest side, without EXIF.
   Upload those bytes only, not original photos or original filenames/EXIF.
3. Use Responses with the exact selected model, `store: false`, standard service
   tier, no tools, explicit high image detail and initially low reasoning. Start
   with a 4096 output-token ceiling, including reasoning, then validate it during
   the sample. Record all settings; changing them creates a new config identity.
4. Request title, description, alt text, filename suggestion and at most a few
   genuinely actionable uncertainty notes. Avoid inferred identities, locations,
   time of day, species, clothing material, roles and events. Keep broader visible
   descriptions when unsure. Text inside photographs is data, not instructions.
5. Require schema/length validation and retain raw responses, refusals and
   incomplete outputs. Do not silently repair invented context or regenerate
   failed/incomplete responses behind the owner's back.
6. Generate the same 20-photo sample first. Compare against the preserved
   GPT-4.1 baseline for factual mistakes, useful distinctions and editing effort.
   Include the previously flagged river/dusk/material examples.
7. After the sample checkpoint is approved, continue to the remaining snapshot
   entries using bounded concurrency and persisted checkpoints. Export JSON,
   spreadsheet-safe CSV, a usage ledger and a local visual review.

### Budget accounting

The old pilot's permanent `$0.05 per attempt` reserve and fixed 20-photo ceiling
cannot simply be reused for Sol or a whole catalogue.

- Reserve a defensible worst-case allowance **before** each request, based on
  bounded image/prompt input and the configured maximum total output. Validate
  the Sol-specific input assumptions; do not reuse GPT-4.1 image-token rules.
- For a completed request with trustworthy usage, settle that reservation to a
  conservative price estimate. Keep full reservations for ambiguous requests or
  failures whose billable usage is unknown.
- Before starting another request, require known usage + unresolved reservations
  + all in-flight/new reservations to remain at or below US$20. Include reasoning
  in output usage and any applicable cache-write charges. Do not double-count
  cached input or reasoning already included in provider totals.
- Keep an exclusive run lock and serialize budget reservation/settlement with
  durable ledger writes, even when requests run concurrently. Restarts and
  configuration changes share the same authorized spend ledger; a new output
  directory or configuration must not reset the cap or unresolved reservations.
- Permit at most two total attempts per photo within the same budget; persist
  attempt identity before sending and respect provider backoff. Never blindly
  replay timeouts, disconnected requests or already received responses.
- Stop on access/billing failures, unexpected tier/pricing or usage that violates
  the reservation assumptions. Reconcile before continuing. Do not automatically
  switch models, increase the cap or treat missing usage as a free request.
- Measure the first sample's actual usage before forecasting the remainder. The
  US$20 cap is not a target spend or a guarantee that every photo will complete;
  provider billing remains authoritative.

## Automatic future uploads (owner-requested scope extension)

- Add a new migration; preserve the already-applied text migration unchanged.
  A private insertion trigger enqueues one job in the publication transaction.
  Do not enqueue the 271-photo backfill or change publication/palette RPCs.
- After confirmed publication, including replay of a lost response, Next.js
  `after()` kicks that photograph's job. AI runs separately from the successful
  upload response. Daily Vercel cron rescues up to three queued jobs concurrently;
  expired unreserved leases may resume, reserved requests become uncertain.
- Fetch the same allowlisted public 1200px transform and locally make a <=1024px
  EXIF-stripped JPEG. Use exact `gpt-6.1-sol`, high detail, low reasoning, standard
  tier, structured output, 4096 output tokens, no tools and `store: false`.
- Count the exact image/instructions/schema input through
  `/v1/responses/input_tokens`. Refuse counts above 250,000 (below long-context
  pricing). Atomically reserve `ceil(input * 2.5 + 4096 * 10)` micro-USD in the
  current UTC month's private ledger before the create request. All concurrent
  requests/held reserves must fit within 5,000,000 micro-USD. Never free unknown
  charges, reset prior attempts, increase the cap or silently switch models.
- Transactionally settle trustworthy usage and apply only still-empty fields
  with ownership `unset`, rechecking source image identity. Never change caption
  mode/custom text, manual text, deliberate clears, filenames, paths or images.
  Nonempty uncertainty notes go to private review rather than auto-publication.
- Completion is idempotent for the same lease/attempt/result. A lost completion
  response may retry only that database operation, never the AI request. Unknown
  usage/timeouts retain the reservation and require operator reconciliation.
  Known failed responses may be explicitly retried by an admin, at most two paid
  attempts total. Pre-request preview/count failures have bounded recovery.
- Admin shows enablement, monthly committed/reserved estimate, queue counts,
  recent status, review direction and guarded retry. At the cap generation pauses
  until next UTC month; uploads/editing remain available.
- Provision OpenAI, worker capability and cron secrets server-side in production
  only. The database starts disabled with no secret hash. Enable after migration,
  deployment and access/budget checks; no broad service-role dependency.

## Admin and public presentation

Extend the existing `/admin/photos` editing flow, preserving its established
visual system and compact/desktop layouts. Do not load raw response bodies or
full image previews into every catalogue row.

- Show live editable title, description and alt-text fields, with textareas where
  appropriate, source/protection labels and the three caption modes.
- Show the effective caption preview and make Custom/Hidden consequences clear.
  Offer explicit **Use description**, **Use AI suggestion**, and save actions.
- Support draft review/editing, internal review-note resolution and filters for
  pending suggestions, manual fields and conflicts. Draft import is metadata
  only, authenticated, validated, bounded and idempotent.
- A bulk preview lists affected photographs/fields and protected or stale
  entries. Explicit confirmation applies eligible fields; no AI request occurs
  when loading the page, opening an editor, importing or saving text.
- Preserve unsaved input on errors/conflicts, expose save progress/results, and
  warn about navigation with unsaved changes. Keep controls keyboard-accessible
  and usable from 320px upward.
- Centralize effective-text/caption resolution in a small photograph-text module.
  Update query mappings, types and SEO helpers rather than duplicate precedence
  rules among public/admin consumers.
- Render an escaped, server-rendered caption associated with the full photograph,
  below the existing image frame; keep the photograph's 80vh composition intact.
  Avoid overlap with fixed navigation or colour-match results. Respect Hidden.
- Page/social descriptions use the approved description with existing fallback
  behavior for unfilled records. Image alt remains independent; JSON-LD can
  represent the resolved caption separately from description. Archive thumbnails,
  social images and palette-result alt text keep the shared alt-text rules.
- After live edits/application/rollback, use existing photograph cache
  invalidation for catalogue, detail, SEO/sitemap and palette-result consumers.
  Direct database imports without that application path are not the rollout.

## Implementation sequence and approval gates

1. **Local implementation:** additive migration, text-resolution/ownership module,
   authenticated writes, private import/application operations, admin editor,
   caption rendering, updated generator and documentation. No live changes.
2. **Isolated verification:** test migrations/RLS/RPCs and old/new application
   compatibility before proposing production rollout. Upload reservation,
   publication and retry contracts must remain compatible.
3. **Authorized sample generation:** one initial image request confirms inference
   permissions/settings; continue to 20 only while validated usage fits the cap.
   Pause for quality/cost approval before the remaining catalogue generation.
4. **Authorized migration/deployment:** back up existing text/state; apply the
   additive migration before code that depends on it. Verify production admin
   editability and public fallback behavior before bulk text application.
   During that interval, old-app writes must also record manual ownership and
   advance revisions through database enforcement. If compatible tracking cannot
   be guaranteed, obtain approval for a short text-write pause; do not allow an
   untracked-write window or introduce a surprise maintenance restriction.
5. **Authorized remainder generation/import:** resume to the frozen catalogue
   total after sample approval; import unapproved drafts through admin. Local
   generation and deployment can be ordered independently once their gates pass.
6. **Authorized bulk application:** show the current dry-run diff, confirm the
   selected run/fields, apply eligible records, invalidate caches, reconcile every
   snapshot entry and verify public outputs and manual protection.

All approved decisions above remain the plan; approval of this document alone
does not execute steps 3–6. Newly uploaded/deleted/changed photos are reconciled
explicitly, not silently included, recreated or overwritten.

## Checks and completion criteria

- Offline generator tests: exact model/configuration, full snapshot accounting,
  preview bounds/identity, strict draft validation, safe exports, budget settlement,
  unresolved reserves, retry limits and network-disabled completed-run resume.
- Isolated database tests: anonymous/non-admin denial; admin success; private
  drafts inaccessible publicly; only changed fields become manual; deliberate
  clearing remains protected; stale writes fail safely; idempotent import/apply;
  interrupted chunk recovery; rollback preserves newer manual work; uploads keep
  owner-entered text protected and existing publication semantics intact.
- Resolution/output tests: Description/Custom/Hidden precedence; no pre-approval
  caption; independent alt and SEO descriptions; safe escaping; metadata/JSON-LD,
  archive and palette-result consistency; cache invalidation after every live path.
- Browser checks: authenticated editing/review and bulk preview, unsaved/error/
  conflict states, keyboard access, small/mobile and desktop layouts, portrait and
  landscape captions without image-frame changes or horizontal overflow.
- Run focused new tests, `node --test scripts/seo/label-photographs.test.mjs`,
  `npm run test:images`, `npm run test:upload`, `npm run lint`, `npm run build` and
  `git diff --check` as appropriate to the implemented diff. Build reads Supabase;
  use a compatible target, report blockers, and never invent a typecheck script.
- Completion requires every frozen snapshot entry accounted for, only approved
  eligible fields live, every public text field editable, manual overrides proven
  durable, provider usage recorded and the spend cap respected. Report failed,
  refused, conflicted or skipped entries separately rather than claiming 271
  successful generations/application when that is not the observed result.

## Deliberately excluded

No automatic filename/URL changes, original-image metadata stripping, image
re-uploads, storage moves, palette refactors, shared-auth migrations or site-wide
copy rewrites. Scheduled recovery and future-upload generation are explicitly
included by the scope correction above. Other models are discovered alternatives, not approved comparison
spend or automatic replacements for the selected Sol run.
