begin;

alter table private.storage_cleanup_jobs
	add column storage_provider text not null default 'supabase';

alter table private.storage_cleanup_jobs
	add constraint storage_cleanup_jobs_storage_provider_check
	check (storage_provider in ('supabase', 'r2')) not valid;

alter table private.storage_cleanup_jobs
	validate constraint storage_cleanup_jobs_storage_provider_check;

drop function public.record_storage_cleanup_job(uuid, text, text, text, timestamptz);

create function public.record_storage_cleanup_job(
	job_photograph_id uuid,
	job_storage_path text,
	job_operation text,
	job_error_message text,
	job_not_before timestamptz,
	job_storage_provider text default 'supabase'
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

		if job_storage_provider not in ('supabase', 'r2') then
			raise exception 'Invalid storage provider';
		end if;

		insert into private.storage_cleanup_jobs as existing (
			photograph_id,
			storage_path,
			storage_provider,
			operation,
			error_message,
			not_before
		)
		values (
			job_photograph_id,
			job_storage_path,
			job_storage_provider,
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
			and existing.storage_provider = excluded.storage_provider
			and existing.operation = excluded.operation;

		get diagnostics affected_rows = row_count;

		if affected_rows <> 1 then
			raise exception 'Cleanup reservation conflicts with an existing job';
		end if;
	end
$$;

revoke all on function public.record_storage_cleanup_job(
	uuid, text, text, text, timestamptz, text
) from public, anon;
grant execute on function public.record_storage_cleanup_job(
	uuid, text, text, text, timestamptz, text
) to authenticated;

drop function public.begin_storage_cleanup_job(text);

create function public.begin_storage_cleanup_job(job_storage_path text)
returns text
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
			return null;
		end if;

		if exists (
			select 1
			from public.photographs as photograph
			where photograph.storage_path = cleanup_job.storage_path
		) then
			return null;
		end if;

		update private.storage_cleanup_jobs as job
		set
			operation = 'cleanup',
			updated_at = timezone('utc', now())
		where job.storage_path = cleanup_job.storage_path;

		return cleanup_job.storage_provider;
	end
$$;

revoke all on function public.begin_storage_cleanup_job(text) from public, anon;
grant execute on function public.begin_storage_cleanup_job(text) to authenticated;

drop function public.queue_photograph_deletion(uuid);

create function public.queue_photograph_deletion(
	p_photograph_id uuid,
	p_storage_provider text default 'supabase'
)
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

	if p_storage_provider not in ('supabase', 'r2') then
		raise exception 'Invalid storage provider';
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
		storage_provider,
		operation,
		error_message,
		not_before
	)
	values (
		photograph.id,
		photograph.storage_path,
		p_storage_provider,
		'delete',
		'Photograph deleted; storage cleanup is pending.',
		timezone('utc', now())
	)
	on conflict on constraint storage_cleanup_jobs_pkey do update set
		photograph_id = excluded.photograph_id,
		storage_provider = excluded.storage_provider,
		operation = excluded.operation,
		error_message = excluded.error_message,
		not_before = greatest(existing.not_before, excluded.not_before),
		updated_at = timezone('utc', now())
	where existing.photograph_id = excluded.photograph_id;

	if not found then
		raise exception 'Cleanup reservation conflicts with an existing job';
	end if;

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

revoke all on function public.queue_photograph_deletion(uuid, text) from public, anon;
grant execute on function public.queue_photograph_deletion(uuid, text) to authenticated;

create or replace function public.can_delete_storage_object(object_name text)
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
		and job.storage_provider = 'supabase'
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

notify pgrst, 'reload schema';

commit;