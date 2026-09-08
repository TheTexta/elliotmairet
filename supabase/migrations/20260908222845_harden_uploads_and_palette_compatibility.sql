do $$
begin
	if exists (
		select 1
		from public.photo_palette_analyses as analysis
		left join public.photo_palette_colours_new as colour
			on colour.photograph_id = analysis.photograph_id
		group by analysis.photograph_id, analysis.palette_size
		having count(colour.photograph_id) <> analysis.palette_size
	) then
		raise exception 'Palette migration preflight failed: active palette colour counts are incomplete';
	end if;

	if exists (
		select 1
		from public.photo_palette_colours_new as colour
		left join public.photo_palette_analyses as analysis
			on analysis.photograph_id = colour.photograph_id
		where analysis.photograph_id is null
	) then
		raise exception 'Palette migration preflight failed: an active colour has no analysis';
	end if;
end
$$;

drop table public.photo_palette_colours;
drop table public.photo_palettes;

create view public.photo_palette_colours
with (security_invoker = true)
as
select
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
from public.photo_palette_colours_new;

revoke all on table public.photo_palette_colours from public, anon, authenticated;
grant select on table public.photo_palette_colours to anon, authenticated;

drop policy if exists "public palette analysis read"
	on public.photo_palette_analyses;
revoke select on table public.photo_palette_analyses from anon, authenticated;

update storage.buckets
set
	file_size_limit = 536870912,
	allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'elliotmairet';

do $$
begin
	if not exists (
		select 1
		from storage.buckets
		where id = 'elliotmairet'
			and file_size_limit = 536870912
			and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
	) then
		raise exception 'Upload-limit migration failed: Storage bucket elliotmairet is missing or incorrectly configured';
	end if;
end
$$;

notify pgrst, 'reload schema';
