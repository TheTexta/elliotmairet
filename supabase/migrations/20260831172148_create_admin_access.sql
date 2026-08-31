create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table private.admin_users (
	singleton boolean primary key default true check (singleton),
	user_id uuid not null unique references auth.users(id) on delete cascade,
	created_at timestamptz not null default timezone('utc', now())
);

revoke all on private.admin_users from public, anon, authenticated;
grant select on private.admin_users to authenticated;

alter table private.admin_users enable row level security;

create policy "admin can verify own access"
	on private.admin_users for select
	to authenticated
	using ((select auth.uid()) = user_id);

create function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
	select exists (
		select 1
		from private.admin_users
		where user_id = (select auth.uid())
	);
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table private.storage_cleanup_jobs (
	storage_path text primary key,
	photograph_id uuid not null,
	operation text not null check (operation in ('upload', 'delete', 'cleanup')),
	error_message text not null,
	not_before timestamptz not null default timezone('utc', now()),
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

revoke all on private.storage_cleanup_jobs from public, anon, authenticated;

alter table private.storage_cleanup_jobs enable row level security;

create policy "admin can view storage cleanup jobs"
	on private.storage_cleanup_jobs for select
	to authenticated
	using ((select public.is_admin()));

create policy "admin can create storage cleanup jobs"
	on private.storage_cleanup_jobs for insert
	to authenticated
	with check ((select public.is_admin()));

create policy "admin can update storage cleanup jobs"
	on private.storage_cleanup_jobs for update
	to authenticated
	using ((select public.is_admin()))
	with check ((select public.is_admin()));

create policy "admin can resolve storage cleanup jobs"
	on private.storage_cleanup_jobs for delete
	to authenticated
	using ((select public.is_admin()));

create function public.record_storage_cleanup_job(
	job_photograph_id uuid,
	job_storage_path text,
	job_operation text,
	job_error_message text,
	job_not_before timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
	declare
		affected_rows integer;
	begin
		if not public.is_admin() then
			raise exception 'Administrator access is required';
		end if;

		if job_operation not in ('upload', 'cleanup') then
			raise exception 'Invalid cleanup operation';
		end if;

	insert into private.storage_cleanup_jobs as existing (
		photograph_id,
		storage_path,
		operation,
		error_message,
		not_before
	)
	values (
		job_photograph_id,
		job_storage_path,
		job_operation,
		job_error_message,
		job_not_before
	)
	on conflict (storage_path) do update set
		photograph_id = excluded.photograph_id,
		operation = excluded.operation,
		error_message = excluded.error_message,
		not_before = greatest(existing.not_before, excluded.not_before),
		updated_at = timezone('utc', now())
	where existing.photograph_id = excluded.photograph_id
		and existing.operation = excluded.operation;

		get diagnostics affected_rows = row_count;

		if affected_rows <> 1 then
			raise exception 'Cleanup reservation conflicts with an existing job';
		end if;
	end
$$;

revoke all on function public.record_storage_cleanup_job(uuid, text, text, text, timestamptz)
	from public, anon;
grant execute on function public.record_storage_cleanup_job(uuid, text, text, text, timestamptz)
	to authenticated;

create function public.begin_storage_cleanup_job(job_storage_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
	declare
		cleanup_job private.storage_cleanup_jobs%rowtype;
	begin
		if not public.is_admin() then
			raise exception 'Administrator access is required';
		end if;

		select *
		into cleanup_job
		from private.storage_cleanup_jobs as job
		where job.storage_path = job_storage_path
		for update;

		if not found
			or cleanup_job.operation not in ('upload', 'delete', 'cleanup')
			or cleanup_job.not_before > timezone('utc', now()) then
			return false;
		end if;

		if exists (
			select 1
			from public.photographs as photograph
			where photograph.storage_path = cleanup_job.storage_path
		) then
			return false;
		end if;

		update private.storage_cleanup_jobs as job
		set
			operation = 'cleanup',
			updated_at = timezone('utc', now())
		where job.storage_path = cleanup_job.storage_path;

		return true;
	end
$$;

revoke all on function public.begin_storage_cleanup_job(text) from public, anon;
grant execute on function public.begin_storage_cleanup_job(text) to authenticated;

create function public.resolve_storage_cleanup_job(job_storage_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
	declare
		cleanup_job private.storage_cleanup_jobs%rowtype;
	begin
		if not public.is_admin() then
			raise exception 'Administrator access is required';
		end if;

		select *
		into cleanup_job
		from private.storage_cleanup_jobs as job
		where job.storage_path = job_storage_path
			and job.operation = 'cleanup'
			and job.not_before <= timezone('utc', now())
		for update;

		if not found then
			return;
		end if;

		if exists (
			select 1
			from public.photographs as photograph
			where photograph.storage_path = cleanup_job.storage_path
		) then
			return;
		end if;

		delete from private.storage_cleanup_jobs as job
		where job.storage_path = cleanup_job.storage_path;
	end
$$;

revoke all on function public.resolve_storage_cleanup_job(text) from public, anon;
grant execute on function public.resolve_storage_cleanup_job(text) to authenticated;

create function public.cancel_storage_upload_reservation(
	job_photograph_id uuid,
	job_storage_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
	declare
		upload_job private.storage_cleanup_jobs%rowtype;
	begin
		if not public.is_admin() then
			raise exception 'Administrator access is required';
		end if;

		select *
		into upload_job
		from private.storage_cleanup_jobs as job
		where job.storage_path = job_storage_path
			and job.photograph_id = job_photograph_id
			and job.operation = 'upload'
		for update;

		if not found then
			return;
		end if;

		if exists (
			select 1
			from public.photographs as photograph
			where photograph.storage_path = upload_job.storage_path
		) then
			return;
		end if;

		delete from private.storage_cleanup_jobs as job
		where job.storage_path = upload_job.storage_path;
	end
$$;

revoke all on function public.cancel_storage_upload_reservation(uuid, text) from public, anon;
grant execute on function public.cancel_storage_upload_reservation(uuid, text) to authenticated;

create function public.list_storage_cleanup_jobs()
returns table (
	photograph_id uuid,
	storage_path text,
	operation text,
	error_message text,
	not_before timestamptz,
	cleanup_ready boolean,
	created_at timestamptz,
	updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
	begin
		if not public.is_admin() then
			raise exception 'Administrator access is required';
		end if;

		return query
		select
			job.photograph_id,
			job.storage_path,
			job.operation,
			job.error_message,
			job.not_before,
			job.not_before <= timezone('utc', now()),
			job.created_at,
			job.updated_at
		from private.storage_cleanup_jobs as job
		where not exists (
			select 1
			from public.photographs as photograph
			where photograph.storage_path = job.storage_path
		)
		order by job.updated_at asc;
	end
$$;

revoke all on function public.list_storage_cleanup_jobs() from public, anon;
grant execute on function public.list_storage_cleanup_jobs() to authenticated;

revoke insert, update, delete, truncate, references, trigger
	on public.photographs, public.photo_palette_analyses, public.photo_palette_colours_new
	from public, anon, authenticated;

grant update (captured_at, title, alt_text, sort_order, updated_at)
	on public.photographs to authenticated;

create policy "admin photograph update"
	on public.photographs for update
	to authenticated
	using ((select public.is_admin()))
	with check ((select public.is_admin()));

create function public.publish_photograph(
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
	p_colours jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	existing_photograph public.photographs%rowtype;
	queued_operation text;
	palette_matches boolean;
begin
	if not public.is_admin() then
		raise exception 'Administrator access is required';
	end if;

	select job.operation
	into queued_operation
	from private.storage_cleanup_jobs as job
	where job.storage_path = p_storage_path
		and job.photograph_id = p_photograph_id
	for update;

	if not found then
		raise exception 'Upload reservation does not exist';
	end if;

	select *
	into existing_photograph
	from public.photographs
	where id = p_photograph_id;

	if found then
		select true
		into palette_matches
		from public.photo_palette_analyses as analysis
		where analysis.photograph_id = p_photograph_id
			and analysis.algorithm = p_algorithm
			and analysis.algorithm_iterations = p_algorithm_iterations
			and analysis.sample_longest_side = p_sample_longest_side
			and analysis.palette_size = p_palette_size
			and (
				select count(*)
				from public.photo_palette_colours_new as colour
				where colour.photograph_id = p_photograph_id
			) = jsonb_array_length(p_colours)
			and not exists (
				(
					select
						colour.rank,
						colour.red,
						colour.green,
						colour.blue,
						colour.hex,
						colour.lab_l,
						colour.lab_a,
						colour.lab_b,
						colour.weight
					from jsonb_to_recordset(p_colours) as colour(
						rank integer,
						red smallint,
						green smallint,
						blue smallint,
						hex text,
						lab_l real,
						lab_a real,
						lab_b real,
						weight real
					)
					except
					select
						colour.rank,
						colour.red,
						colour.green,
						colour.blue,
						colour.hex,
						colour.lab_l,
						colour.lab_a,
						colour.lab_b,
						colour.weight
					from public.photo_palette_colours_new as colour
					where colour.photograph_id = p_photograph_id
				)
				union all
				(
					select
						colour.rank,
						colour.red,
						colour.green,
						colour.blue,
						colour.hex,
						colour.lab_l,
						colour.lab_a,
						colour.lab_b,
						colour.weight
					from public.photo_palette_colours_new as colour
					where colour.photograph_id = p_photograph_id
					except
					select
						colour.rank,
						colour.red,
						colour.green,
						colour.blue,
						colour.hex,
						colour.lab_l,
						colour.lab_a,
						colour.lab_b,
						colour.weight
					from jsonb_to_recordset(p_colours) as colour(
						rank integer,
						red smallint,
						green smallint,
						blue smallint,
						hex text,
						lab_l real,
						lab_a real,
						lab_b real,
						weight real
					)
				)
			);

		if existing_photograph.storage_path is distinct from p_storage_path
			or existing_photograph.filename is distinct from p_filename
			or existing_photograph.image_width is distinct from p_image_width
			or existing_photograph.image_height is distinct from p_image_height
			or existing_photograph.captured_at is distinct from p_captured_at
			or existing_photograph.title is distinct from p_title
			or existing_photograph.alt_text is distinct from p_alt_text
			or existing_photograph.sort_order is distinct from p_sort_order
			or not coalesce(palette_matches, false) then
			raise exception 'Photograph identifier is already in use';
		end if;

		return;
	end if;

	if queued_operation <> 'upload' then
		raise exception 'Upload reservation is no longer publishable';
	end if;

	insert into public.photographs (
		id,
		storage_path,
		filename,
		image_width,
		image_height,
		captured_at,
		title,
		alt_text,
		sort_order
	)
	values (
		p_photograph_id,
		p_storage_path,
		p_filename,
		p_image_width,
		p_image_height,
		p_captured_at,
		p_title,
		p_alt_text,
		p_sort_order
	);

	perform public.replace_photo_palette_analysis(
		p_photograph_id,
		p_algorithm,
		p_algorithm_iterations,
		p_sample_longest_side,
		p_palette_size,
		p_analyzed_at,
		p_colours
	);

end
$$;

revoke all on function public.publish_photograph(
	uuid, text, text, integer, integer, date, text, text, integer,
	text, smallint, smallint, smallint, timestamptz, jsonb
) from public, anon;
grant execute on function public.publish_photograph(
	uuid, text, text, integer, integer, date, text, text, integer,
	text, smallint, smallint, smallint, timestamptz, jsonb
) to authenticated;

create function public.queue_photograph_deletion(p_photograph_id uuid)
returns table (
	filename text,
	storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
	photograph public.photographs%rowtype;
begin
	if not public.is_admin() then
		raise exception 'Administrator access is required';
	end if;

	select *
	into photograph
	from public.photographs
	where id = p_photograph_id;

	if not found then
		raise exception 'Photograph does not exist';
	end if;

	insert into private.storage_cleanup_jobs as existing (
		photograph_id,
		storage_path,
		operation,
		error_message,
		not_before
	)
	values (
		photograph.id,
		photograph.storage_path,
		'delete',
		'Photograph deleted; storage cleanup is pending.',
		timezone('utc', now())
	)
	on conflict on constraint storage_cleanup_jobs_pkey do update set
		photograph_id = excluded.photograph_id,
		operation = excluded.operation,
		error_message = excluded.error_message,
		not_before = greatest(existing.not_before, excluded.not_before),
		updated_at = timezone('utc', now());

	select *
	into photograph
	from public.photographs
	where id = p_photograph_id
	for update;

	if not found then
		raise exception 'Photograph does not exist';
	end if;

	delete from public.photographs
	where id = photograph.id;

	return query select photograph.filename, photograph.storage_path;
end
$$;

revoke all on function public.queue_photograph_deletion(uuid) from public, anon;
grant execute on function public.queue_photograph_deletion(uuid) to authenticated;

create function public.can_delete_storage_object(object_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	cleanup_job private.storage_cleanup_jobs%rowtype;
begin
	if not public.is_admin() then
		return false;
	end if;

	select *
	into cleanup_job
	from private.storage_cleanup_jobs as job
	where job.storage_path = object_name
		and job.operation = 'cleanup'
		and job.not_before <= timezone('utc', now())
	for update;

	if not found then
		return false;
	end if;

	return not exists (
		select 1
		from public.photographs as photograph
		where photograph.storage_path = object_name
	);
end
$$;

revoke all on function public.can_delete_storage_object(text) from public, anon;
grant execute on function public.can_delete_storage_object(text) to authenticated;

insert into storage.buckets (
	id,
	name,
	public,
	file_size_limit,
	allowed_mime_types
)
values (
	'elliotmairet',
	'elliotmairet',
	true,
	26214400,
	array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

create policy "admin photo read"
	on storage.objects for select
	to authenticated
	using (
		bucket_id = 'elliotmairet'
		and (select public.is_admin())
	);

create policy "admin photo upload"
	on storage.objects for insert
	to authenticated
	with check (
		bucket_id = 'elliotmairet'
		and (storage.foldername(name))[1] = 'uploads'
		and (select public.is_admin())
	);

create policy "admin photo delete"
	on storage.objects for delete
	to authenticated
	using (
		bucket_id = 'elliotmairet'
		and (select public.is_admin())
		and public.can_delete_storage_object(name)
	);

notify pgrst, 'reload schema';