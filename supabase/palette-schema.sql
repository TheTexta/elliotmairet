-- K-means palettes for the Elliot Mairet archive.
-- One parent row per photograph, and five ranked colour rows per palette.

create table if not exists public.photo_palettes (
  storage_path text primary key,
  filename text not null,
  image_width integer not null,
  image_height integer not null,
  algorithm text not null,
  algorithm_iterations smallint not null,
  sample_longest_side smallint not null,
  palette_size smallint not null,
  analyzed_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.photo_palette_colours (
  storage_path text not null references public.photo_palettes(storage_path) on delete cascade,
  rank smallint not null,
  red smallint not null check (red between 0 and 255),
  green smallint not null check (green between 0 and 255),
  blue smallint not null check (blue between 0 and 255),
  hex text not null,
  lab_l real not null,
  lab_a real not null,
  lab_b real not null,
  weight real not null check (weight >= 0 and weight <= 1),
  primary key (storage_path, rank)
);

create index if not exists photo_palette_colours_lab_idx
  on public.photo_palette_colours (lab_l, lab_a, lab_b);

-- Palette data is derived from the already public photographs, so it can be
-- read from the public site without exposing any write capability.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.photo_palettes, public.photo_palette_colours to anon, authenticated;
grant all on public.photo_palettes, public.photo_palette_colours to service_role;

alter table public.photo_palettes enable row level security;
alter table public.photo_palette_colours enable row level security;

drop policy if exists "public palette read" on public.photo_palettes;
create policy "public palette read"
  on public.photo_palettes for select
  to anon, authenticated
  using (true);

drop policy if exists "public palette colour read" on public.photo_palette_colours;
create policy "public palette colour read"
  on public.photo_palette_colours for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
