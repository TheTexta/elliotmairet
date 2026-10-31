-- Minimal isolated catalogue/auth fixture. NEVER apply this to Supabase.
create role anon;
create role authenticated;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table private.admin_users(user_id uuid primary key);
insert into private.admin_users values ('00000000-0000-4000-8000-000000000001');
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
grant select on private.admin_users to authenticated;
alter table private.admin_users enable row level security;
create policy admin_self on private.admin_users for select to authenticated using(user_id=auth.uid());
create function public.is_admin() returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from private.admin_users where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;
create table public.photographs (
  id uuid primary key default gen_random_uuid(), storage_path text not null unique,filename text not null unique,
  image_width integer not null,image_height integer not null,captured_at date,title text,alt_text text,sort_order integer,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
grant usage on schema public,auth to anon,authenticated;
grant select on public.photographs to anon,authenticated;
grant update(title,alt_text,captured_at,sort_order,updated_at) on public.photographs to authenticated;
alter table public.photographs enable row level security;
create policy public_read on public.photographs for select to anon,authenticated using(true);
create policy admin_update on public.photographs for update to authenticated using(public.is_admin()) with check(public.is_admin());
insert into public.photographs (id,storage_path,filename,image_width,image_height,title) values
  ('00000000-0000-4000-8000-000000000011','uploads/one.jpg','one.jpg',6000,4000,null),
  ('00000000-0000-4000-8000-000000000012','uploads/two.jpg','two.jpg',4000,6000,'Existing owner title');
