begin;

drop view public.photo_palette_colours;

alter table public.photo_palette_colours_new
	rename to photo_palette_colours;

alter table public.photo_palette_colours
	rename constraint photo_palette_colours_new_pkey
	to photo_palette_colours_pkey;

alter index public.photo_palette_colours_new_lab_idx
	rename to photo_palette_colours_lab_idx;

do $$
declare
	function_definition text;
begin
	select pg_get_functiondef(
		'public.replace_photo_palette_analysis(uuid,text,smallint,smallint,smallint,timestamp with time zone,jsonb)'::regprocedure
	)
	into function_definition;

	execute replace(
		function_definition,
		'photo_palette_colours_new',
		'photo_palette_colours'
	);

	select pg_get_functiondef(
		'public.publish_photograph(uuid,text,text,integer,integer,date,text,text,integer,text,smallint,smallint,smallint,timestamp with time zone,jsonb)'::regprocedure
	)
	into function_definition;

	execute replace(
		function_definition,
		'photo_palette_colours_new',
		'photo_palette_colours'
	);
end
$$;

revoke all on function public.replace_photo_palette_analysis(
	uuid, text, smallint, smallint, smallint, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_photo_palette_analysis(
	uuid, text, smallint, smallint, smallint, timestamptz, jsonb
) to service_role;

revoke all on function public.publish_photograph(
	uuid, text, text, integer, integer, date, text, text, integer,
	text, smallint, smallint, smallint, timestamptz, jsonb
) from public, anon;
grant execute on function public.publish_photograph(
	uuid, text, text, integer, integer, date, text, text, integer,
	text, smallint, smallint, smallint, timestamptz, jsonb
) to authenticated;

notify pgrst, 'reload schema';

commit;
