begin;

create table public.photo_oklab_analyses (
	photograph_id uuid primary key
		references public.photographs(id)
		on delete cascade,
	algorithm text not null,
	algorithm_iterations smallint not null check (algorithm_iterations > 0),
	sample_longest_side smallint not null check (sample_longest_side > 0),
	feature_count smallint not null check (feature_count > 0),
	analyzed_at timestamptz not null default timezone('utc', now())
);

create table public.photo_oklab_features (
	photograph_id uuid not null
		references public.photo_oklab_analyses(photograph_id)
		on delete cascade,
	rank smallint not null check (rank > 0),
	red smallint not null check (red between 0 and 255),
	green smallint not null check (green between 0 and 255),
	blue smallint not null check (blue between 0 and 255),
	hex text not null check (hex ~ '^#[0-9a-f]{6}$'),
	oklab_l real not null check (oklab_l between 0 and 1),
	oklab_a real not null check (oklab_a between -1 and 1),
	oklab_b real not null check (oklab_b between -1 and 1),
	weight real not null check (weight between 0 and 1),
	primary key (photograph_id, rank)
);

revoke all on table public.photo_oklab_analyses from public, anon, authenticated;
revoke all on table public.photo_oklab_features from public, anon, authenticated;
grant select on table public.photo_oklab_features to anon, authenticated;
grant all on table public.photo_oklab_analyses, public.photo_oklab_features to service_role;

alter table public.photo_oklab_analyses enable row level security;
alter table public.photo_oklab_features enable row level security;

create policy "public OKLab feature read"
	on public.photo_oklab_features for select
	to anon, authenticated
	using (true);

create function public.replace_photo_oklab_analysis(
	p_photograph_id uuid,
	p_algorithm text,
	p_algorithm_iterations smallint,
	p_sample_longest_side smallint,
	p_feature_count smallint,
	p_analyzed_at timestamptz,
	p_features jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public.is_admin() then
		raise exception 'Administrator access is required';
	end if;

	if jsonb_typeof(p_features) is distinct from 'array'
	then
		raise exception 'OKLab features must be a JSON array';
	end if;

	if jsonb_array_length(p_features) <> p_feature_count then
		raise exception 'OKLab feature count does not match its analysis';
	end if;

	insert into public.photo_oklab_analyses (
		photograph_id,
		algorithm,
		algorithm_iterations,
		sample_longest_side,
		feature_count,
		analyzed_at
	)
	values (
		p_photograph_id,
		p_algorithm,
		p_algorithm_iterations,
		p_sample_longest_side,
		p_feature_count,
		p_analyzed_at
	)
	on conflict on constraint photo_oklab_analyses_pkey do update set
		algorithm = excluded.algorithm,
		algorithm_iterations = excluded.algorithm_iterations,
		sample_longest_side = excluded.sample_longest_side,
		feature_count = excluded.feature_count,
		analyzed_at = excluded.analyzed_at;

	delete from public.photo_oklab_features as existing
	where existing.photograph_id = p_photograph_id;

	insert into public.photo_oklab_features (
		photograph_id,
		rank,
		red,
		green,
		blue,
		hex,
		oklab_l,
		oklab_a,
		oklab_b,
		weight
	)
	select
		p_photograph_id,
		feature.rank,
		feature.red,
		feature.green,
		feature.blue,
		feature.hex,
		feature.oklab_l,
		feature.oklab_a,
		feature.oklab_b,
		feature.weight
	from jsonb_to_recordset(p_features) as feature(
		rank smallint,
		red smallint,
		green smallint,
		blue smallint,
		hex text,
		oklab_l real,
		oklab_a real,
		oklab_b real,
		weight real
	);
end
$$;

revoke all on function public.replace_photo_oklab_analysis(
	uuid, text, smallint, smallint, smallint, timestamptz, jsonb
) from public, anon;
grant execute on function public.replace_photo_oklab_analysis(
	uuid, text, smallint, smallint, smallint, timestamptz, jsonb
) to authenticated, service_role;

create function public.publish_photograph_with_oklab(
	p_photograph_id uuid,
	p_storage_path text,
	p_filename text,
	p_image_width integer,
	p_image_height integer,
	p_captured_at date,
	p_title text,
	p_alt_text text,
	p_sort_order integer,
	p_algorithm text,
	p_algorithm_iterations smallint,
	p_sample_longest_side smallint,
	p_palette_size smallint,
	p_analyzed_at timestamptz,
	p_colours jsonb,
	p_oklab_algorithm text,
	p_oklab_algorithm_iterations smallint,
	p_oklab_sample_longest_side smallint,
	p_oklab_feature_count smallint,
	p_oklab_analyzed_at timestamptz,
	p_oklab_features jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.publish_photograph(
		p_photograph_id,
		p_storage_path,
		p_filename,
		p_image_width,
		p_image_height,
		p_captured_at,
		p_title,
		p_alt_text,
		p_sort_order,
		p_algorithm,
		p_algorithm_iterations,
		p_sample_longest_side,
		p_palette_size,
		p_analyzed_at,
		p_colours
	);

	perform public.replace_photo_oklab_analysis(
		p_photograph_id,
		p_oklab_algorithm,
		p_oklab_algorithm_iterations,
		p_oklab_sample_longest_side,
		p_oklab_feature_count,
		p_oklab_analyzed_at,
		p_oklab_features
	);
end
$$;

revoke all on function public.publish_photograph_with_oklab(
	uuid, text, text, integer, integer, date, text, text, integer,
	text, smallint, smallint, smallint, timestamptz, jsonb,
	text, smallint, smallint, smallint, timestamptz, jsonb
) from public, anon;
grant execute on function public.publish_photograph_with_oklab(
	uuid, text, text, integer, integer, date, text, text, integer,
	text, smallint, smallint, smallint, timestamptz, jsonb,
	text, smallint, smallint, smallint, timestamptz, jsonb
) to authenticated;

notify pgrst, 'reload schema';

commit;
