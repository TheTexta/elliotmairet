<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project

This repository contains Elliot Mairêt's photography portfolio and archive.

The public site displays the photograph catalogue. Authorized users can manage photographs and site content through the `/admin` area.

The application uses:

* Next.js App Router
* React
* TypeScript
* Tailwind CSS v4
* Motion
* Supabase Postgres, Auth, and Storage
* Sharp and `exif-reader` for photograph processing and metadata
* Vercel for frontend hosting

The Supabase backend is self-hosted through Coolify.

## Backend / Server Access

The backend server is reachable over Tailscale using the MagicDNS hostname:

`gmkserver.tail077753.ts.net`

SSH using:

```bash
ssh dextery@gmkserver.tail077753.ts.net
```

SSH may require authentication or approval from the human developer.

Only access the server when the task actually requires inspecting or modifying server-side infrastructure, Coolify, Supabase, storage, networking, or other backend services. Do not SSH into the server for ordinary frontend or application changes that can be completed from the repository.

Never store SSH credentials, API keys, service-role keys, access tokens, database passwords, or other secrets in the repository.

Treat the server and its Supabase instance as production infrastructure. Do not perform destructive operations such as deleting production data, resetting databases, deleting storage buckets, recreating services, removing volumes, changing networking, or modifying unrelated Coolify services unless the human developer explicitly requests it.

Database schema, RLS, storage-policy, and database-function changes should be represented by migrations in `supabase/migrations` rather than being made only against the live database whenever practical.

## Supabase

The project uses Supabase for:

* photograph metadata
* photograph storage
* photograph palette metadata
* admin authentication and authorization
* editable site content and SEO content

The primary photograph catalogue is stored in `public.photographs`.

A photograph's presence in the catalogue represents its public availability. Do not introduce a separate `published` flag or parallel publication state unless the task explicitly requires changing this architecture.

Palette-analysis data is associated with photographs and is used by the site's photograph matching and colour functionality. Preserve the existing palette schema, compatibility views, database functions, and matching behavior unless the task explicitly requires changing them.

Admin authorization is database-backed through Supabase Auth and `private.admin_users`. Do not weaken admin checks, RLS policies, storage policies, or database-function authorization to simplify application code.

The production Supabase Storage bucket is:

`elliotmairet`

Preserve compatibility with this bucket and the existing photograph `storage_path` values unless the task explicitly requires a storage migration.

Photo uploads use the existing upload, publication, and cleanup workflow. Be careful when changing upload or deletion logic: database records and Storage objects are coordinated through database functions and `private.storage_cleanup_jobs` to avoid orphaned objects or accidental deletion.

Keep privileged Supabase credentials server-side. Never expose a service-role key or other privileged credential through a `NEXT_PUBLIC_*` environment variable or commit it to the repository.

The normal browser-facing configuration uses:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Do not introduce a service-role key when the existing authenticated-user/RLS architecture can perform the operation safely.

## Database Migrations

Treat `supabase/migrations` as the source of truth for schema evolution.

When changing database behavior:

* add a new migration rather than rewriting an already-applied production migration
* preserve existing photograph data and storage paths unless migration of that data is explicitly required
* consider RLS, grants, Storage policies, functions, views, and admin permissions together
* make migrations safe for the existing production dataset
* add preflight checks when a destructive transformation could otherwise silently lose or corrupt data
* keep application code compatible with the resulting schema

Do not manually change production schema and leave the repository migrations out of sync.

## Admin

The admin application lives under `/admin` and uses Supabase Auth.

Preserve authentication and authorization boundaries between the public site and admin functionality.

Operations that mutate photographs, Storage objects, site content, or other privileged data must remain restricted to authorized admins.

Do not move privileged admin operations into publicly callable code paths or rely only on hiding UI elements for access control.

When modifying upload, edit, delete, or cleanup behavior, account for partial failures between database and Storage operations. Do not bypass the existing cleanup/reservation mechanisms merely to simplify the implementation.

## Development

Node.js 22 or later is required.

Use the existing project scripts where applicable:

```bash
npm run dev
npm run lint
npm run test:similarity
npm run build
```

Before considering a code change complete, run the relevant validation commands.

For normal application changes, run at least:

```bash
npm run lint
```

Run:

```bash
npm run test:similarity
```

when changing photograph matching, palette processing, similarity selection, or related logic.

Run:

```bash
npm run build
```

when the change could affect production builds, routing, server/client boundaries, Next.js configuration, environment handling, authentication, Supabase integration, or deployment behavior.

Because this project does not currently define an `npm run typecheck` script, do not assume that command exists.

Fix issues introduced by your changes. Do not make unrelated refactors solely to clean up pre-existing warnings or errors unless requested.

## Next.js

This project uses a current Next.js version whose APIs and conventions may differ from older training knowledge.

Follow the Next.js agent instructions at the top of this file. Before implementing unfamiliar Next.js behavior, consult the relevant documentation installed under `node_modules/next/dist/docs/`.

Prefer the project's existing App Router patterns over introducing alternate routing or data-fetching architectures without a clear reason.

Be deliberate about server and client component boundaries. Do not add `"use client"` unnecessarily.

## Documentation

Update `README.md` in the same change whenever a feature or modification changes:

* application behavior that developers need to understand
* setup or
