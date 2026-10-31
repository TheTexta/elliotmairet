# Dependency refresh — 2026-10-31

## Scope and approval

The owner requested updating all packages, then explicitly authorized committing
and deploying once verification passes. This refresh updates every direct package
to its latest stable **compatible** release and refreshes transitive packages
within their declared ranges. Packages already current remain unchanged.

No database/schema, RLS, storage, public content, caption policy, auth mechanism,
AI generation, upload/publication or cleanup behavior is intentionally changed.
No migration, paid request, real upload/delete, backfill or shared-infrastructure
operation is needed. Preserve the separate US$5/month future-upload and US$20
catalogue limits and the unresolved catalogue reservation.

## Updated installed versions

| Package | Before | After |
| --- | --- | --- |
| Next.js / eslint-config-next | 16.3.3 | 16.4.3 |
| React / React DOM | 19.2.8 | 19.3.1 |
| Motion | 13.4.0 | 14.9.0 |
| Sharp | 0.35.4 | 0.35.5 |
| Supabase SSR | 0.12.5 | 0.12.7 |
| Supabase JS | 2.112.4 | 2.118.0 |
| AWS S3 client / presigner | 3.1144.0 | 3.1161.0 |
| Lucide React | 1.38.0 | 1.66.0 |
| Node typings | 22.20.3 | 22.20.5 |
| TypeScript | 5.9.3 | 6.0.3 |
| source-map-js (transitive) | 1.2.1 | 1.2.2 |
| Zod (transitive, development) | 4.6.5 | 4.6.7 |

Tailwind/PostCSS 4.3.3, React typings 19.3.0, Radix 1.8.1, cn 0.5.1, CVA 0.7.1,
Vercel Analytics/Speed Insights and EXIF packages were already current. Their
resolved versions remain current; broad dependency ranges now declare the tested
minor/patch floor. No direct canary/prerelease versions, forced peer resolution
or blanket `npm audit fix --force` were selected. Existing transitive prerelease
packages such as gensync/resolve retain their upstream-selected versions.

## Explicit compatibility exceptions

- **TypeScript 7.0.2 deferred:** its root JavaScript export contains version
  information, not the `transpileModule`/enum compiler API used by six test files.
  Next 16.4.3 itself supports the newer CLI checker, but current
  `typescript-eslint@8.72.1` requires TypeScript `>=4.8.4 <6.1.0`. Use `~6.0.3`
  rather than breaking tests, adding a second compiler or disabling lint/type
  checks. Next's installed `useTypeScriptCli` documentation was consulted; no
  experimental configuration or ignored diagnostics was added.
- **ESLint 10.14.0 deferred:** current Next-config dependencies
  `eslint-plugin-react@7.37.5`, `eslint-plugin-import@2.32.0` and
  `eslint-plugin-jsx-a11y@6.10.2` declare peers only through ESLint 9. An initial
  ESLint 10 resolution produced invalid peers; it was replaced with the latest
  compatible 9.39.5. ESLint 9 is marked unsupported upstream: revisit this hold
  when the plugin stack supports 10. Do not force peers or remove useful lint
  rules merely to make an outdated-package report empty.
- **Node typings 26.6.6 deferred:** runtime support remains Node 22+, so typings
  use the latest 22.x patch rather than advertise newer unavailable APIs.

These three packages are the expected remaining entries in `npm outdated`.
Supabase SSR and JS were upgraded together to satisfy SSR's `^2.114.0` peer.
React and React DOM remain exactly matched. A clean `npm ci --ignore-scripts`
succeeded with no invalid peers; native Sharp functionality is checked separately.

## Security result

Audit scope matters: these are package-version findings, not a penetration test or
proof that the site was previously exploited.

| Audit | Before | After |
| --- | --- | --- |
| Full tree | 1 critical, 3 high, 16 moderate | 16 moderate; no critical/high |
| Production (`npm audit --omit=dev`) | vulnerable Next / Sharp | **0 findings** |

All remaining audit nodes are marked development-only in the lockfile. They are
the minimatch `<11.0.1` glob-processing denial-of-service advisory propagated
through ESLint/Next lint plugins. Those tools still require older minimatch API
families; overriding them to 11 or accepting npm's suggested ancient framework/
lint downgrades is not a safe fix. Keep this limitation visible and revisit
upstream-compatible releases. A zero production audit is not a claim that all
development advisories are fixed.

## Verification and release

Executed after a clean lockfile install:

- `test:admin` — 39 passed.
- `test:text` — 58 passed; no paid requests.
- `test:upload` — 33 passed with mocked transport.
- `test:palette` — 4 passed.
- `test:similarity` — 13 passed.
- `test:images` — 28 passed.
- Lint, `npx tsc --noEmit`, and production build — passed. Build normally reads
  the public Supabase catalogue; no data mutations are part of the build.

Independent offline runtime checks (11 passed) exercised the actual updated
libraries: native Sharp orientation 6/8, finite application palette features,
malformed/pixel-limit rejection, transparent metadata-free text previews; AWS
presigned uploads and conditional-copy serialization/checksum configuration;
derivative-before-original cleanup and denied-cleanup safety; Supabase SSR
chunked-cookie refresh/header forwarding; server cookie adapters and anonymous/
non-admin guard denial. Endpoints/credentials/transports were fabricated and
network guarded. These checks do not establish live R2/Auth/RLS behavior.

Independent browser verification passed with actual React 19.3.1/Motion 14.9.0
components and mocked Next adapters/actions/transports. At 320px and 1400px,
successful held form actions reset natively without losing controlled values,
saved baselines, custom captions or dirty sibling edits; errors retain values.
Confirmation focus/Cancel/Escape, bulk-transition safety and browser Back
cancellation passed. Expanded admin/content axe scans had zero violations or
incomplete checks; modal axe had no violations but a layered-contrast incomplete
check. These are not screen-reader or physical-device tests.

Actual Motion fixtures verified palette scales .5 → selected 1 / others .25,
reduced-motion handling, shared palette-request caching and footer `useInView`.
The local Next production server separately served the 271-photo archive and
real photo navigation, rapid palette switching, reset and browser Back. Images
loaded at an initial 320px mobile viewport without horizontal overflow; title
remained **Elliot Mairet**, and no visible photo captions/admin theme tokens leaked
into public pages. Changing viewport emulation after browser Back briefly left
image elements with decode errors; the same URL fetched HTTP 200 and a fresh
mobile reload decoded normally. No cause or dependency regression was established.
The only local console resource
errors were the two Vercel analytics scripts, which the standalone Next server
does not provide; verify those on Vercel after deployment rather than hiding them.

Final independent diff review found no release blockers. It independently checked
manifest/lockfile/install consistency, valid peers, focused compiler/confirmation
tests and fresh audits (16 moderate findings across 21 development-only paths;
production zero). No production content or storage mutation was performed during
verification.

Deploy only a sanitized committed snapshot, excluding private `.local` artifacts,
environment files and agent directories. Verify production readiness, exact
homepage title **Elliot Mairet**, clean description/contact snippet exclusion,
anonymous admin/upload/cron denial, authenticated admin rendering and safe
confirmation cancellation, unchanged catalogue count and skipped-photo revision.
Do not test publication, deletion, paid retry or catalogue batch application as
part of release smoke checks.

Rollback is the previous application/lockfile commit, without schema changes or
data restoration. That rollback reinstates the old security advisories, so prefer
a bounded forward fix when practical; production rollback still needs owner
authorization.
