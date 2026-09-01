This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The app defaults to the production Supabase URL and public anon key. To use a
different instance, copy `.env.example` to `.env.local` and override those
values. `SUPABASE_SERVICE_ROLE_KEY` is only needed by the palette backfill
script and must never be exposed to browser code.

## Photograph catalogue migration

The public gallery reads from `public.photographs`. Apply the migrations in
`supabase/migrations` before deploying the database-backed application. The
backfill migration copies the existing palette parent rows into the new
photograph model and aborts if photograph counts, palette-colour counts, or
foreign-key relationships do not match.

The legacy `supabase/palette-schema.sql`, `photo_palettes`, and
`photo_palette_colours` structures are retained for rollback and verification.
Do not drop them until the migrated gallery has been verified in production.

To generate palettes for catalogue rows without the current analysis:

```bash
npm run palettes:backfill
```

## Photograph administration

The admin interface is available at `/admin/login`. Create each email/password
user in Supabase Auth, then allowlist the user after applying the migrations:

```sql
insert into private.admin_users (user_id)
select id
from auth.users
where email = 'admin@example.com';
```

The table accepts multiple authorized users, and all photograph and Storage
mutations recheck that allowlist through RLS. The browser uses only the publishable key;
the service-role key remains reserved for the palette backfill script.

Storage contains the image files, while `public.photographs` defines the public
site. Uploading creates the Storage object before the row and compensates if
the insert fails. Deleting removes the row first, immediately unpublishing the
photograph, then cleans up its Storage object.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
