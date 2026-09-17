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
npm run test:similarity # Run photograph similarity tests
```
