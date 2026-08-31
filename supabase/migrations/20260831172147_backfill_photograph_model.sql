create function pg_temp.try_parse_capture_date(value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
	parsed date;
begin
	if value !~ '^[0-9]{8}$' then
		return null;
	end if;

	parsed := to_date(value, 'YYYYMMDD');

	if to_char(parsed, 'YYYYMMDD') <> value then
		return null;
	end if;

	return parsed;
exception
	when others then
		return null;
end
$$;

create temporary table migrated_photo_filenames (
	storage_path text primary key,
	filename text not null unique
) on commit drop;

insert into migrated_photo_filenames (storage_path, filename)
with recursive ranked as (
	select
		palette.storage_path,
		coalesce(
			palette.filename,
			'__legacy_storage_path__' || encode(convert_to(palette.storage_path, 'UTF8'), 'hex')
		) as filename,
		row_number() over (
			partition by coalesce(
				palette.filename,
				'__legacy_storage_path__' || encode(convert_to(palette.storage_path, 'UTF8'), 'hex')
			)
			order by palette.storage_path
		) as duplicate_rank
	from public.photo_palettes as palette
), candidates as (
	select
		ranked.storage_path,
		ranked.filename,
		case
			when ranked.duplicate_rank = 1 then ranked.filename
			else '__legacy_storage_path__' || encode(convert_to(ranked.storage_path, 'UTF8'), 'hex')
		end as candidate,
		'__' || encode(convert_to(ranked.storage_path, 'UTF8'), 'hex') as suffix,
		ranked.duplicate_rank
	from ranked
), resolved as (
	select
		candidate.storage_path,
		candidate.filename,
		candidate.candidate,
		candidate.suffix,
		candidate.duplicate_rank
	from candidates as candidate

	union all

	select
		resolved.storage_path,
		resolved.filename,
		resolved.candidate || resolved.suffix,
		resolved.suffix,
		resolved.duplicate_rank
	from resolved
	where resolved.duplicate_rank > 1
		and exists (
			select 1
			from ranked as existing
			where existing.filename = resolved.candidate
		)
)
select
	resolved.storage_path,
	resolved.candidate
from resolved
	where resolved.duplicate_rank = 1
		or (
			resolved.duplicate_rank > 1
			and not exists (
		select 1
		from ranked as existing
		where existing.filename = resolved.candidate
			)
		);

insert into public.photographs (
	storage_path,
	filename,
	image_width,
	image_height,
	captured_at
)
select
	palette.storage_path,
	migrated_filename.filename,
	greatest(coalesce(palette.image_width, 1), 1),
	greatest(coalesce(palette.image_height, 1), 1),
	pg_temp.try_parse_capture_date(substring(migrated_filename.filename from 1 for 8))
from public.photo_palettes as palette
join migrated_photo_filenames as migrated_filename
	on migrated_filename.storage_path = palette.storage_path
on conflict (storage_path) do update set
	filename = excluded.filename,
	image_width = excluded.image_width,
	image_height = excluded.image_height,
	captured_at = excluded.captured_at,
	updated_at = timezone('utc', now());

insert into public.photo_palette_analyses (
	photograph_id,
	algorithm,
	algorithm_iterations,
	sample_longest_side,
	palette_size,
	analyzed_at
)
select
	photograph.id,
	coalesce(nullif(palette.algorithm, ''), 'legacy-k-means'),
	greatest(coalesce(palette.algorithm_iterations, 1), 1),
	greatest(coalesce(palette.sample_longest_side, 1), 1),
	greatest(coalesce(palette.palette_size, 1), 1),
	coalesce(palette.analyzed_at, timezone('utc', now()))
from public.photo_palettes as palette
join public.photographs as photograph
	on photograph.storage_path = palette.storage_path
on conflict (photograph_id) do update set
	algorithm = excluded.algorithm,
	algorithm_iterations = excluded.algorithm_iterations,
	sample_longest_side = excluded.sample_longest_side,
	palette_size = excluded.palette_size,
	analyzed_at = excluded.analyzed_at;

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
	photograph.id,
	row_number() over (
		partition by colour.storage_path
		order by colour.rank
	)::integer,
	least(greatest(coalesce(colour.red, 0), 0), 255),
	least(greatest(coalesce(colour.green, 0), 0), 255),
	least(greatest(coalesce(colour.blue, 0), 0), 255),
	'#' || lpad(to_hex(least(greatest(coalesce(colour.red, 0), 0), 255)), 2, '0')
		|| lpad(to_hex(least(greatest(coalesce(colour.green, 0), 0), 255)), 2, '0')
		|| lpad(to_hex(least(greatest(coalesce(colour.blue, 0), 0), 255)), 2, '0'),
	coalesce(colour.lab_l, 0),
	coalesce(colour.lab_a, 0),
	coalesce(colour.lab_b, 0),
	least(greatest(coalesce(colour.weight, 0), 0), 1)
from public.photo_palette_colours as colour
join public.photographs as photograph
	on photograph.storage_path = colour.storage_path
on conflict (photograph_id, rank) do update set
	red = excluded.red,
	green = excluded.green,
	blue = excluded.blue,
	hex = excluded.hex,
	lab_l = excluded.lab_l,
	lab_a = excluded.lab_a,
	lab_b = excluded.lab_b,
	weight = excluded.weight;

do $$
declare
	old_photograph_count bigint;
	new_photograph_count bigint;
	old_colour_count bigint;
	new_colour_count bigint;
	orphan_count bigint;
begin
	select count(*) into old_photograph_count from public.photo_palettes;
	select count(*) into new_photograph_count from public.photographs;

	if old_photograph_count <> new_photograph_count then
		raise exception 'Photograph backfill count mismatch: old %, new %',
			old_photograph_count, new_photograph_count;
	end if;

	select count(*) into old_colour_count from public.photo_palette_colours;
	select count(*) into new_colour_count from public.photo_palette_colours_new;

	if old_colour_count <> new_colour_count then
		raise exception 'Palette colour backfill count mismatch: old %, new %',
			old_colour_count, new_colour_count;
	end if;

	select count(*) into orphan_count
	from public.photo_palette_analyses as analysis
	left join public.photographs as photograph
		on photograph.id = analysis.photograph_id
	where photograph.id is null;

	if orphan_count <> 0 then
		raise exception 'Palette analysis backfill produced % orphan rows', orphan_count;
	end if;

	select count(*) into orphan_count
	from public.photo_palette_colours_new as colour
	left join public.photographs as photograph
		on photograph.id = colour.photograph_id
	where photograph.id is null;

	if orphan_count <> 0 then
		raise exception 'Palette colour backfill produced % orphan rows', orphan_count;
	end if;
end
$$;

notify pgrst, 'reload schema';
