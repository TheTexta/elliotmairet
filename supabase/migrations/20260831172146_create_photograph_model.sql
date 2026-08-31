create table public.photographs (
	id uuid primary key default gen_random_uuid(),
	storage_path text not null unique,
	filename text not null unique,
	image_width integer not null check (image_width > 0),
	image_height integer not null check (image_height > 0),
	captured_at date,
	title text,
	alt_text text,
	sort_order integer,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table public.photo_palette_analyses (
	photograph_id uuid primary key
		references public.photographs(id)
		on delete cascade,
	algorithm text not null,
	algorithm_iterations smallint not null check (algorithm_iterations > 0),
	sample_longest_side smallint not null check (sample_longest_side > 0),
	palette_size smallint not null check (palette_size > 0),
	analyzed_at timestamptz not null default timezone('utc', now())
);

create table public.photo_palette_colours_new (
	photograph_id uuid not null
		references public.photographs(id)
		on delete cascade,
	rank integer not null check (rank > 0),
	red smallint not null check (red between 0 and 255),
	green smallint not null check (green between 0 and 255),
	blue smallint not null check (blue between 0 and 255),
	hex text not null check (hex ~ '^#[0-9a-fA-F]{6}$'),
	lab_l real not null,
	lab_a real not null,
	lab_b real not null,
	weight real not null check (weight >= 0 and weight <= 1),
	primary key (photograph_id, rank)
);

create index photographs_public_order_idx
	on public.photographs (sort_order asc nulls last, captured_at desc nulls last, filename desc);

create index photo_palette_colours_new_lab_idx
	on public.photo_palette_colours_new (lab_l, lab_a, lab_b);

grant usage on schema public to anon, authenticated, service_role;
grant select on public.photographs, public.photo_palette_analyses, public.photo_palette_colours_new
	to anon, authenticated;
grant all on public.photographs, public.photo_palette_analyses, public.photo_palette_colours_new
	to service_role;

alter table public.photographs enable row level security;
alter table public.photo_palette_analyses enable row level security;
alter table public.photo_palette_colours_new enable row level security;

create policy "public photograph read"
	on public.photographs for select
	to anon, authenticated
	using (true);

create policy "public palette analysis read"
	on public.photo_palette_analyses for select
	to anon, authenticated
	using (true);

create policy "public palette colour read"
	on public.photo_palette_colours_new for select
	to anon, authenticated
	using (true);

create function public.replace_photo_palette_analysis(
	photograph_id uuid,
	algorithm text,
	algorithm_iterations smallint,
	sample_longest_side smallint,
	palette_size smallint,
	analyzed_at timestamptz,
	colours jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
	insert into public.photo_palette_analyses (
		photograph_id,
		algorithm,
		algorithm_iterations,
		sample_longest_side,
		palette_size,
		analyzed_at
	)
	values (
		photograph_id,
		algorithm,
		algorithm_iterations,
		sample_longest_side,
		palette_size,
		analyzed_at
	)
	on conflict on constraint photo_palette_analyses_pkey do update set
		algorithm = excluded.algorithm,
		algorithm_iterations = excluded.algorithm_iterations,
		sample_longest_side = excluded.sample_longest_side,
		palette_size = excluded.palette_size,
		analyzed_at = excluded.analyzed_at;

	delete from public.photo_palette_colours_new as existing
	where existing.photograph_id = replace_photo_palette_analysis.photograph_id;

	insert into public.photo_palette_colours_new (
		photograph_id,
		rank,
		red,
		green,
		blue,
		hex,
		lab_l,
		lab_a,
		lab_b,
		weight
	)
	select
		replace_photo_palette_analysis.photograph_id,
		colour.rank,
		colour.red,
		colour.green,
		colour.blue,
		colour.hex,
		colour.lab_l,
		colour.lab_a,
		colour.lab_b,
		colour.weight
	from jsonb_to_recordset(colours) as colour(
		rank integer,
		red smallint,
		green smallint,
		blue smallint,
		hex text,
		lab_l real,
		lab_a real,
		lab_b real,
		weight real
	);
end
$$;

revoke all on function public.replace_photo_palette_analysis(
	uuid, text, smallint, smallint, smallint, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.replace_photo_palette_analysis(
	uuid, text, smallint, smallint, smallint, timestamptz, jsonb
) to service_role;

notify pgrst, 'reload schema';
