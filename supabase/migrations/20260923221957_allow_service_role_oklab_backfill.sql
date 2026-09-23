create or replace function public.replace_photo_oklab_analysis(
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
	if not public.is_admin()
		and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
		raise exception 'Administrator access is required';
	end if;

	if jsonb_typeof(p_features) is distinct from 'array' then
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

notify pgrst, 'reload schema';
