# Photograph text: generation, editing and recovery

Implemented locally on 2026-10-30; production migration applied on 2026-10-31 UTC.
The first editor deployment is live at `https://elliotmairet.com` (deployment
`dpl_BpZvtpeJ8NNRYGapqb7VuGLvNp2a`). The owner subsequently requested automatic
generation for future uploads and selected **US$5/month**, separate from the
approved **US$20 catalogue backfill**. Automatic processing is now deployed and
enabled; the rollout evidence and remaining acceptance limit are recorded below.
See [the design plan](photograph-text-generation-plan.md) for
the agreed scope and approval gates.

## What is editable

On `/admin/photos`, each photograph's editor supports title, description,
accessibility alt text, captured date and caption settings. Text saves check the
current revision and preserve input on errors. Actual filenames and storage
paths are not editable here.

Caption modes are independent of accessibility and SEO text:

- **Description:** display the approved description, or no caption if it is empty.
- **Custom:** display the owner's nonempty custom caption instead.
- **Hidden:** show no caption. The saved custom caption is retained.

**Use description** switches the display mode without deleting custom wording.
Editing a description changes its default caption and metadata; a custom caption
does not change the description or alt text.

Sources are tracked per title/description/alt-text field. A manual change,
including clearing previously populated text, protects that field from bulk AI
updates and automatic generation. Explicitly touching then clearing an already
empty text field is also recorded by the upgraded editor. Unchanged sibling
fields in the same save keep their previous ownership. Direct
legacy edits and owner-supplied upload text are tracked by database triggers.

## Local generation (explicit paid authorization required)

The original GPT-4.1 pilot remains reproducible. **Catalogue mode is separate**:

```bash
# Public reads/local files only. Downloads or verifies <=1024px JPEG previews;
# does not call OpenAI and does not mutate Supabase or R2.
node --env-file=.env.local scripts/seo/label-photographs.mjs --catalogue

# Optional: use the snapshot downloaded from the admin review panel.
node --env-file=.env.local scripts/seo/label-photographs.mjs --catalogue --snapshot=photograph-text-snapshot.json
```

The preserved pilot manifest defaults to
`.local/photograph-labeling/2026-10-30-pilot-gpt-4.1/manifest.json`. Override with
`--pilot-manifest=path/to/manifest.json` when necessary. The same 20 photographs
are selected by verified source identity, not by their current archive positions.
If one is missing or changed, stop and reconcile the sample rather than silently
substitute another photograph.

Only after explicit permission to spend against the fresh US$20 ceiling:

```bash
# Paid: generate the 20-photo Sol sample only, then stop for review.
node --env-file=.env.local scripts/seo/label-photographs.mjs --catalogue --generate --max-usd=20

# Paid: requires a completed, reviewed sample from an earlier invocation.
# Reuses those 20 drafts and generates only the remaining frozen entries.
node --env-file=.env.local scripts/seo/label-photographs.mjs --catalogue --generate --continue-after-sample --max-usd=20
```

The exact model is `gpt-6.1-sol`, high image detail, low reasoning, standard
service tier, no tools, `store: false`, and 4096 maximum total output tokens.
The local catalogue command has no fallback model or automatic publication.
Future uploads use the separate server-side workflow below, not this command.
The provider sees EXIF-stripped JPEG previews, not original files, filenames,
existing captions or catalogue context.

Default outputs are ignored under
`.local/photograph-labeling/2026-10-30-catalogue-gpt-6.1-sol-v2/`: frozen source
snapshot/manifest, previews, raw responses, per-photo checkpoints, `drafts.json`,
`drafts.csv`, `outcomes.json`, `REVIEW.html`, a usage ledger copy and summary.
The importable JSON contains valid unreviewed drafts only; refused, invalid or
incomplete outputs remain separately accounted for and stop continuation.

The downloader uses the existing allowlisted 1200px/quality-82/auto public
transform, then creates the final <=1024px JPEG locally. An initial prepare-only
attempt using unsupported image options stopped before any preview or Sol call;
its original directory is preserved. The v2 run records the corrected download
configuration without resetting the shared spend ledger.

### Budget and interrupted requests

All catalogue outputs/worktrees share the main repository's ignored
`.local/photograph-labeling/sol-spend-ledger.json` and exclusive lock. Changing
`--output`, restarting or changing configuration does not reset its ceiling or
per-photo attempt history. Generation is sequential; at most two reconciled
attempts per photograph are allowed across these outputs/configurations.

Before sending, each request reserves **US$4.68**: an intentionally loose bound
covering Sol's entire documented maximum input at long-context cache-write
pricing, plus its bounded output. This avoids assuming an undocumented image
tokenizer. Trustworthy completed usage replaces that reserve with a conservative
estimate (all input at at least cache-write price, reasoning included once in
output). The actual likely cost is much smaller; it is measured, not promised.
The next full reservation must fit inside the remaining US$20 allowance.

Unknown usage, timeouts, malformed responses, unexpected models/service tiers and
HTTP failures retain reservations and stop. Raw response/checkpoint identity is
preserved before settlement. Missing usage is never assumed free. Do not delete
the ledger, change an entry to `retryable`, remove a lock or repeat a potentially
billed request without verifying the process/provider usage and explicitly
authorizing reconciliation. A completed run resumes without network requests.

This is an application-level conservative cap, not a billing guarantee. OpenAI
billing is authoritative; use provider-side project controls as a second layer.
Never put the key in `NEXT_PUBLIC_*`, an import file, a screenshot or Git.

## Automatic future-upload text

The additive migration `20261031015837_photograph_auto_text.sql` has been applied
to production (SHA-256
`02f19b007a67777e1f8881f4b8087b4430d666efd77b47a825d755c66e351ffe`).
All 271 existing rows were retained; zero old-photo jobs or paid attempts were
created. Private queue reads and anonymous admin-status execution remain denied.
The migration initially left automatic generation disabled until the following
application deployment and checks completed.

Production enablement completed on 2026-10-31 UTC after deployment
`dpl_Cu9Gmdhopy9FcXo4opsLSB3LQYkh` reached READY at `https://elliotmairet.com`.
Vercel confirms the active `17 4 * * *` recovery cron on that deployment. All
three server secrets are production-only/sensitive. The capability digest was
installed while disabled, then enabled only after live checks passed. The
authenticated admin shows enabled, zero jobs, and US$0 / US$5. Authorized cron
returns three idle results; anonymous cron returns 401 and anonymous admin access
redirects to login. The existing 271 rows/fields are byte-for-byte unchanged by
the migration. Mobile 320px and desktop 1400px rendering were checked without
horizontal overflow.

**Acceptance limitation:** no new photograph was uploaded just for this test, so
the first real production upload-to-generated-caption cycle is not yet observed.
The provider's exact count endpoint was exercised with a real resized preview;
generation/failure orchestration was tested offline, and real isolated Postgres
tests cover locking, publication queueing, manual/cleared text, caption modes,
budget concurrency, lease recovery and completion idempotence.

After publication, missing title, description and alt text are generated
automatically. Description supplies the default visible caption. User-entered
upload text stays manual; caption Custom/Hidden and deliberately cleared fields
are never replaced. If a description is generated while the owner has selected
Custom or Hidden, that selection remains in force.

The publication transaction inserts one private job for a new photograph. No
existing catalogue rows are enqueued by this extension. Both initial publication
and publication replay kick the job using Next.js `after()`; OpenAI never blocks
the successful upload response. A daily Vercel cron at `17 4 * * *` UTC rescues up
to three jobs concurrently. Normal processing is immediate; recovery may wait
until that next daily run, and a larger stranded queue drains over later runs.

Admin's **Automatic text · future uploads** panel shows configuration/enablement,
the current UTC month, committed usage including reservations, counts and the
latest 100 jobs. **Refresh status** does not reload unsaved photograph edits.
Known failed jobs have **Retry generation**, which may incur a paid request.
Unknown-charge jobs have no retry; valid drafts with uncertainty notes are held
in the existing private review panel rather than published automatically.

**Refresh status** also expires public photograph text caches without generating
again. Use it if completion committed just before the worker lost its database
response or stopped before cache invalidation. Otherwise daily public cache
revalidation recovers that bounded stale-cache window automatically.

## Catalogue rollout and unresolved request

The 20-photo sample was visually reviewed against its previews. Continuation
generated **119 valid drafts in total** before a request lost its response (zero
response bytes). The shared local ledger records **US$0.5438875 known estimated
usage plus US$4.68 held**, US$5.2238875 committed/reserved within the US$20 cap.
The uncertain attempt is `5e58f9e4-bcba-4f2e-be0a-7a3f49b3a41a` for photograph
`61b3b988-2217-446b-8c72-48d4c0340f80`. It was not replayed; all further catalogue
generation initially paused for explicit reconciliation. No automatic workflow ledger
was charged. Import/application status is separate from generation.

The owner subsequently authorized **continuing only untouched photographs** while
retaining the full unknown-charge hold and never replaying that photograph.
The 119 saved drafts were imported through the authenticated admin UI; no live
text was applied at that checkpoint. The explicit continuation command is:

```bash
node --env-file=.env.local scripts/seo/label-photographs.mjs --catalogue --generate --continue-after-sample --skip-uncertain --max-usd=20
```

`--skip-uncertain` is an additional approval, not reconciliation or release: it
keeps every full reserve in the cap, skips those photograph IDs before requesting,
and records the held attempt identities in `continuation-approvals.json`. It
cannot skip received/unparsed checkpoints, permit an uncertain photo retry,
reset the frozen run/configuration or raise the US$20 ceiling. Invocation without
that flag still stops on uncertainty.

The authorized untouched-photo continuation completed with **270 valid drafts**,
zero refusals/incomplete/invalid outcomes, and the same one unresolved request.
Known conservative estimated usage is **US$1.2340425** plus the unchanged
**US$4.68 hold**, **US$5.9140425 total committed/reserved** within the US$20 cap.
Do not release that hold or retry the skipped photograph without explicit billing
reconciliation. Its filename is `20260607-DSCF3297.jpg`; its original empty text,
revision 0, source object and routes remain unchanged.

All 270 drafts were visually reviewed against contact sheets, with individual
previews inspected where needed. Three private drafts were corrected: sea-lion
group rather than true seals, an unsupported “steel” material claim removed,
and ambiguous hand coverings left unidentified. Five safe uncertainty notes were
reviewed without introducing speculative public wording. Immutable AI originals
were retained. Re-importing all 270 preserved those eight version-2 reviews/edits.

The authenticated admin then previewed and applied **270 photographs / 810 text
fields** using approval `70500f61-7e4c-4b65-a38b-dda97408380c` (exact preview hash
`2eadd119b9ee30dfb1cd0705d152e00c`). The preview had zero source/revision
conflicts, manual-live rows, unresolved notes or nonempty before-values. All 270
persisted results report applied. Ownership is **803 AI fields, seven corrected
manual fields, and three unset fields on the one skipped photograph**. The two
existing admins and future-upload settings are unchanged. No automatic paid
attempt or old-catalogue job was created by the backfill/application.

Read-only public verification passed for **all 271 photograph pages**: HTTP 200,
exact approved titles/descriptions/alt text, resolved visible captions, JSON-LD
and unchanged filename/canonical routes. Every unrelated catalogue field matches
the fresh pre-application backup, and the skipped row is entirely unchanged.
The signed-in editor was reloaded and confirmed to expose the populated fields,
revision 1 and editable caption controls. A 500px public rendering preserved the
80vh image frame and placed the caption below the photograph without overflow.

The application ledger is separate from the generator's unchanged
`approved: false` export marker: generated files remain original suggestions;
the private authenticated approval/application history records what became live.
Keep the approval token for conditional rollback; do not roll back entire rows.

With explicit owner approval, the exposed Vercel deployment-protection bypass
was revoked/regenerated and its automatic environment-variable setting preserved.
The old value was verified absent. Neither value is recorded in this guide.

## Automatic monthly budget and failures

The hard application ledger cap is **US$5 per UTC calendar month**, independent
of the local catalogue ledger. Exact input is counted before creation through
OpenAI's image/schema-aware `/v1/responses/input_tokens`; unsupported/failed counts
stop before a generation call. Inputs above 250,000 are rejected, so long-context
pricing cannot apply. Each request atomically reserves
`ceil(inputTokens * 2.5 + 4096 * 10)` micro-USD (conservative cache-write input and
maximum output). Concurrent workers share the same locked monthly ledger.
For example the initial preflight counted 1,261 input tokens, reserving 44,113
micro-USD (US$0.044113), without creating a response.

Trustworthy model/tier/usage settles the reserve downward. Missing usage,
timeouts, network/HTTP errors or unexpected models/tiers keep the full reserve;
never assume the charge was zero. Paid requests are not automatically repeated.
Explicit retry permits at most two paid attempts per job. Pre-request preview or
count failures can recover after 15 minutes, with a bounded preflight-failure
limit. A ten-minute lease interrupted before reservation can resume; one with a
reservation becomes uncertain rather than duplicating a possibly billed request.

Budget-paused jobs resume in the next UTC month. Older uncertain reserves remain
in their original month's ledger and are never released just because the month
changed. Provider billing remains authoritative; recheck rates before changing
model/settings and use provider-side project controls as a second layer.

## Automatic configuration and deployment

Production-only server variables:

```env
OPENAI_API_KEY=
PHOTOGRAPH_TEXT_WORKER_SECRET=
CRON_SECRET=
```

Keep these in the deployment secret store, not `NEXT_PUBLIC_*`, imports, client
props, logs or Git. Generate independent high-entropy worker and cron secrets.
Worker RPCs use the stateless public-key Supabase client plus the narrow worker
capability; no service-role key is introduced. Only the SHA-256 worker-secret
digest is installed in the private settings row through an authorized operator
operation. Anonymous callers without that capability cannot claim, reserve,
finish or fail jobs; ordinary authenticated users cannot read the queue/ledger.
Admin status/retry still require existing `is_admin()` membership.

Apply the new additive auto-text migration (not an edit of the applied draft
migration), deploy the application/cron with the three production secrets, verify
access and zero old-catalogue jobs, then enable the private settings row. A
rollback disables that row before reverting application code, retaining jobs,
charges, manual text and audit history. Do not delete reservations or tables.
A lost completion may safely repeat the same completion RPC/result; it must not
repeat the provider create request. Unknown-charge reconciliation is an explicit
operator procedure: inspect provider usage and private attempt/result history,
then obtain approval for any accounting adjustment; no UI release shortcut exists.

## Admin review and application

After the migration and application deployment have been separately approved:

1. Open **Photograph text · private AI draft review** on `/admin/photos`.
2. Optionally download the current catalogue snapshot for local generation.
3. Import the generated `drafts.json`. Only metadata is sent, in idempotent chunks
   of up to 20 records. Re-importing an identical export is safe; changed original
   output/configuration under an existing run is rejected.
4. Review the run, private uncertainty notes and field sources. Editing a private
   draft does not change the public site. Edited suggestions become manual-owned
   if applied; immutable model originals remain available for comparison.
5. Enter/select the run and optionally select photographs and text fields. With
   no photograph selection, the preview covers the whole specified run, not just
   the current 50-row review page.
6. **Preview exact changes**, inspect before/after values and protected/conflicted
   rows, then explicitly confirm application. Each call commits up to 20 entries.
   Ownership, source identity, live revisions, draft versions and content are
   checked again transactionally. Preview approvals expire after 30 minutes.

Manual fields are skipped in bulk. An explicit per-field **Use AI suggestion**
confirmation can replace a manual value with the immutable original suggestion;
it changes only that field and still checks current draft/live revisions. It
does not change a caption mode or use a later edited draft as an unseen override.

Approvals belong to the administrator who created them. The UI retains only the
last approval token in session storage and displays it for copying. After a lost
response or reload, **Recover approval and results** fetches the exact server
preview and cumulative committed results. Resume the same approval when valid;
an expired approval needs a fresh preview. **Release local preview** unlocks the
review controls without undoing committed changes or deleting server history.

**Roll back unchanged applied fields** restores only matching applied values,
ownership and revisions. Newer manual edits are skipped. It also cancels any
unprocessed tail of an interrupted batch, so resuming its old token cannot apply
the rest after rollback. Review all restored/skipped/cancelled results.

## Migration, compatibility and rollout

The migration is
`supabase/migrations/20261031000944_photograph_text_drafts.sql`. It adds live
description/caption/revision columns and private state, draft, approval,
application and text-history tables. Private tables have RLS, no public/admin
table grants, and admin-checked narrow RPCs. Existing `is_admin()` membership,
catalogue publication and upload reservation/RPC contracts are preserved.

Production migration was explicitly approved and applied on 2026-10-31 UTC.
The MCP-assigned version above matches the live migration history; the SQL bytes
are unchanged from the reviewed local migration (SHA-256
`1ba1bb8be36c561be4ec69aeb1575c8a1268abac2a24e741324448e6fc4c04f4`).
All 271 pre-existing rows/fields were verified unchanged, 271 private ownership
rows were initialized, and private draft access remained denied to public/direct
authenticated reads. Deployment and generation status are recorded separately.

Before migration, public reads fall back only for missing metadata columns; the
new editor keeps legacy title/alt/date editing and disables new caption/review
features. Network/authorization failures are not treated as a missing migration.
Once migrated, the old action reference rejects legacy writes in this code;
database triggers also track older deployed clients during the rollout interval.

Production rollout still requires explicit permission: back up existing text,
apply the migration, deploy the application, verify authenticated editing and
public fallbacks, then import/preview/apply the selected run. Apply the migration
before deployment. If this code was run against the old schema first, invalidate
its photograph cache tags during the approved rollout or wait for daily
revalidation; a browser refresh alone does not clear server-side legacy reads.
Live saves/application/rollback invalidate the existing photograph
caches; direct SQL imports bypassing that application path are not supported.

Do not drop the new metadata/state tables for an application rollback. The old
application ignores additive columns, and the tracking triggers keep manual work
protected. Reverting applied copy is a separate, conditional admin rollback.

## Verification

```bash
npm run test:text
npm run test:text:db
npm run test:images
npm run test:upload
npm run lint
npm run build
git diff --check
```

`test:text:db` creates and stops its own disposable `postgres:17-alpine` Docker
container with no network, published ports, host mounts or Supabase credentials.
It applies the real migration to a minimal catalogue/auth fixture and checks
permissions, ownership, stale writes/approvals, edited suggestions, caption modes,
idempotence, chunk recovery and conditional rollback. Docker and the image must
be available. Never run the bootstrap/test SQL against an existing database.
Builds still read the public Supabase catalogue. The deployed rollout additionally
passed authenticated editor/import/batch checks, preview-based review of 270 Sol
drafts, real token-count preflight, and all-271-page public text/cache verification.
The first real future-upload-to-generated-caption production cycle remains an
explicit acceptance limitation; local fixtures do not claim that observation.
