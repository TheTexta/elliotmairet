# Elliot Mairêt

A Next.js photography archive backed by Supabase. The public site contains the
gallery; authorized users can manage photographs and site content from the
admin area.

## Setup

Requires Node.js 22 or later.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>.

Set these variables in `.env.local` when using a different Supabase instance:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Apply the SQL files in `supabase/migrations` to the target database before
deploying. The public gallery and admin tools depend on that schema.

## Colour features

The live CIELAB palette model remains in `photo_palette_analyses` and
`photo_palette_colours`. This preview also extracts five weighted medoids in
OKLab and stores them independently in `photo_oklab_analyses` and
`photo_oklab_features`. Upload publication writes both representations in one
transaction, without changing or replacing the live palette fields.

The preview prefers OKLab features for each photograph and falls back to its
CIELAB palette until that photograph has been processed. Similarity matching
only compares photographs that use the same feature space.

After applying the OKLab migration, backfill the existing catalogue with an
authorized admin account. Server environments that already provide
`SUPABASE_SERVICE_ROLE_KEY` can run the command directly:

```bash
npm run features:backfill:oklab
```

Otherwise, authenticate as an allowlisted admin:

```bash
read -s SUPABASE_ADMIN_PASSWORD
export SUPABASE_ADMIN_PASSWORD
SUPABASE_ADMIN_EMAIL=admin@example.com npm run features:backfill:oklab
unset SUPABASE_ADMIN_PASSWORD
```

The command reads Supabase configuration from `.env.local`. The admin password
is used only for the command's Auth session and must not be added to an
environment file or committed.

## Admin access

Open `/admin/login`. Create the user in Supabase Auth, then allowlist the user
in the database:

```sql
insert into private.admin_users (user_id)
select id from auth.users where email = 'admin@example.com';
```

## Commands

```bash
npm run dev             # Start the development server
npm run build           # Create a production build
npm run start           # Start the production server
npm run lint            # Run ESLint
npm run test:palette    # Run OKLab feature extraction tests
npm run test:similarity # Run photograph similarity tests
```
