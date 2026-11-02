-- Enabled by default at the owner's request. Applying the migration makes no
-- archive backfill, paid calls or changes to existing photograph text.
alter table private.photograph_auto_text_settings
  add column description_alt_enabled boolean not null default true,
  add column description_alt_revision integer not null default 0 check (description_alt_revision >= 0);
alter table private.photograph_auto_text_jobs
  add column kind text not null default 'upload' check (kind in ('upload','description_alt')),
  add column source_revision integer check (source_revision >= 0),
  add constraint photograph_auto_text_source_revision check ((kind = 'upload') = (source_revision is null));
alter table private.photograph_auto_text_jobs drop constraint photograph_auto_text_jobs_photograph_id_key;
create unique index photograph_auto_text_upload_unique on private.photograph_auto_text_jobs(photograph_id) where kind = 'upload';
create unique index photograph_auto_text_alt_unique on private.photograph_auto_text_jobs(photograph_id,source_revision) where kind = 'description_alt';
create unique index photograph_auto_text_alt_processing_unique on private.photograph_auto_text_jobs(photograph_id)
  where kind = 'description_alt' and status = 'processing';

create function public.set_photograph_description_alt(p_enabled boolean,p_revision integer) returns void
language plpgsql security definer set search_path = '' as $$
declare settings private.photograph_auto_text_settings%rowtype;
begin
  perform private.require_photograph_text_admin();
  select * into settings from private.photograph_auto_text_settings for update;
  if p_enabled is null or settings.description_alt_revision is distinct from p_revision then
    raise exception 'Settings changed. Refresh before saving.' using errcode = '40001';
  end if;
  if p_enabled and not settings.enabled then raise exception 'The automatic text worker must be enabled first.'; end if;
  if settings.description_alt_enabled is distinct from p_enabled then
    update private.photograph_auto_text_settings set description_alt_enabled = p_enabled,
      description_alt_revision = description_alt_revision + 1;
  end if;
end $$;
revoke all on function public.set_photograph_description_alt(boolean,integer) from public,anon,authenticated;
grant execute on function public.set_photograph_description_alt(boolean,integer) to authenticated;

-- RLS denies anonymous table writes. The capability-checked worker uses a
-- stateless anonymous client; signed-in users must never bypass the read-only UI
-- via direct updates, old forms, draft acceptance, batch apply or rollback.
create function private.protect_description_generated_alt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (select description_alt_enabled from private.photograph_auto_text_settings) then
    if (tg_op = 'INSERT' and new.alt_text is not null) or
      (tg_op = 'UPDATE' and new.alt_text is distinct from old.alt_text) then
      raise exception 'Alt text is generated from the saved description. Disable automatic alt text before editing it.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger protect_description_generated_alt before insert or update on public.photographs
for each row execute function private.protect_description_generated_alt();

create function private.enqueue_description_generated_alt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare settings private.photograph_auto_text_settings%rowtype;
begin
  select * into settings from private.photograph_auto_text_settings for share;
  if not settings.description_alt_enabled then return new; end if;
  if tg_op = 'UPDATE' and row(new.title,new.description) is not distinct from row(old.title,old.description) then return new; end if;
  -- Supersede unpaid work, never mutate an active paid lease or an unknown hold.
  update private.photograph_auto_text_jobs set status = 'skipped',error_code = 'source_changed',updated_at = clock_timestamp()
    where photograph_id = new.id and kind = 'description_alt' and status in ('pending','failed','budget_paused');
  if nullif(btrim(new.description),'') is not null then
    insert into private.photograph_auto_text_jobs(photograph_id,kind,source_revision,snapshot)
    values(new.id,'description_alt',new.text_revision,jsonb_build_object(
      'title',new.title,'description',new.description,'settingsRevision',settings.description_alt_revision));
  end if;
  return new;
end $$;
create trigger zz_enqueue_description_generated_alt after insert or update on public.photographs
for each row execute function private.enqueue_description_generated_alt();
revoke all on function private.protect_description_generated_alt(),private.enqueue_description_generated_alt() from public,anon,authenticated;

-- Keep the validated/revisioned save implementation private and wrap it, so old
-- forms cannot overwrite alt text or mark it manual while automation owns it.
alter function public.save_photograph_text(uuid,integer,jsonb,uuid,integer,text[]) set schema private;
revoke all on function private.save_photograph_text(uuid,integer,jsonb,uuid,integer,text[]) from public,anon,authenticated;
create function public.save_photograph_text(p_id uuid,p_revision integer,p_values jsonb,
  p_draft_id uuid default null,p_draft_version integer default null,p_ai_fields text[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare photo public.photographs%rowtype; automatic boolean; result jsonb;
begin
  perform private.require_photograph_text_admin();
  select * into photo from public.photographs where id = p_id for update;
  select description_alt_enabled into automatic from private.photograph_auto_text_settings for share;
  if automatic then
    if 'alt_text' = any(p_ai_fields) then raise exception 'Alt text is generated from the description; accept title or description instead.'; end if;
    -- Validate the original touch list in the base function. Reject explicit alt
    -- touches rather than silently changing the ownership of a generated field.
    if coalesce(p_values->'manual_fields','[]') @> '["alt_text"]' then
      raise exception 'Alt text is read-only. Reload the editor and change the description instead.';
    end if;
    p_values := jsonb_set(p_values,'{alt_text}',coalesce(to_jsonb(photo.alt_text),'null'));
  end if;
  result := private.save_photograph_text(p_id,p_revision,p_values,p_draft_id,p_draft_version,p_ai_fields);
  return result || jsonb_build_object('descriptionAltQueued',automatic and nullif(btrim(p_values->>'description'),'') is not null
    and row(photo.title,photo.description) is distinct from row(nullif(btrim(p_values->>'title'),''),nullif(btrim(p_values->>'description'),'')));
end $$;
revoke all on function public.save_photograph_text(uuid,integer,jsonb,uuid,integer,text[]) from public,anon,authenticated;
grant execute on function public.save_photograph_text(uuid,integer,jsonb,uuid,integer,text[]) to authenticated;

create or replace function public.claim_photograph_auto_text(p_secret text,p_photograph_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job private.photograph_auto_text_jobs%rowtype; photo public.photographs%rowtype; sources jsonb;
  settings private.photograph_auto_text_settings%rowtype;
begin
  perform private.require_photograph_auto_text_worker(p_secret);
  select * into settings from private.photograph_auto_text_settings;
  if not settings.enabled then return null; end if;
  for job in select * from private.photograph_auto_text_jobs
    where status = 'processing' and lease_expires_at <= clock_timestamp() order by id for update skip locked loop
    update private.photograph_auto_text_jobs set status = case when exists (
      select 1 from private.photograph_auto_text_attempts a where a.job_id = job.id and a.lease_id = job.lease_id
    ) then 'uncertain' else 'pending' end,
      error_code = case when exists (select 1 from private.photograph_auto_text_attempts a
        where a.job_id = job.id and a.lease_id = job.lease_id) then 'request_uncertain' else null end,
      updated_at = clock_timestamp() where id = job.id;
  end loop;
  for job in select * from private.photograph_auto_text_jobs
    where (p_photograph_id is null or photograph_id = p_photograph_id)
      and (status in ('pending','budget_paused') or (status = 'failed' and attempts = 0))
      and attempts < 2 and preflight_failures < 3 and next_attempt_at <= clock_timestamp()
    order by next_attempt_at,created_at,id for update skip locked loop
    select * into photo from public.photographs where id = job.photograph_id;
    select s.sources into sources from private.photograph_text_state s where photograph_id = photo.id;
    if job.kind = 'description_alt' then
      if not settings.description_alt_enabled or job.snapshot->>'settingsRevision' is distinct from settings.description_alt_revision::text
        or row(photo.title,photo.description) is distinct from row(job.snapshot->>'title',job.snapshot->>'description') then
        update private.photograph_auto_text_jobs set status = 'skipped',error_code = 'source_changed',updated_at = clock_timestamp() where id = job.id;
        continue;
      end if;
      -- Never repeat potentially billed alt work for this photograph while an
      -- earlier alt request still has an unresolved charge, even after edits.
      if exists(select 1 from private.photograph_auto_text_jobs j join private.photograph_auto_text_attempts a on a.job_id = j.id
        where j.photograph_id = photo.id and j.kind = 'description_alt' and a.charged_micros is null) then continue; end if;
      if exists(select 1 from private.photograph_auto_text_jobs j where j.photograph_id = photo.id
        and j.kind = 'description_alt' and j.status = 'processing' and j.id <> job.id) then continue; end if;
    elsif not exists (select 1 from unnest(array['title','description','alt_text']) field
      where sources->>field = 'unset' and nullif(btrim(to_jsonb(photo)->>field),'') is null
        and (field <> 'alt_text' or not settings.description_alt_enabled)) then
      update private.photograph_auto_text_jobs set status = 'skipped',updated_at = clock_timestamp() where id = job.id;
      continue;
    end if;
    job.lease_id := gen_random_uuid();
    job.snapshot := coalesce(job.snapshot,'{}') || jsonb_build_object('photographId',photo.id,'filename',photo.filename,
      'storagePath',photo.storage_path,'width',photo.image_width,'height',photo.image_height,'textRevision',photo.text_revision);
    update private.photograph_auto_text_jobs set status = 'processing',lease_id = job.lease_id,
      lease_expires_at = clock_timestamp() + interval '10 minutes',snapshot = job.snapshot,
      error_code = null,updated_at = clock_timestamp() where id = job.id;
    return job.snapshot || jsonb_build_object('jobId',job.id,'leaseId',job.lease_id,'attempts',job.attempts,'kind',job.kind);
  end loop;
  return null;
end $$;

-- The same existing reservation function owns both job kinds: one atomic $5
-- monthly cap, not separate allowances. Gate settings/source before reserving.
alter function public.reserve_photograph_auto_text(text,uuid,uuid,integer) set schema private;
revoke all on function private.reserve_photograph_auto_text(text,uuid,uuid,integer) from public,anon,authenticated;
create function public.reserve_photograph_auto_text(p_secret text,p_job_id uuid,p_lease_id uuid,p_input_tokens integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job private.photograph_auto_text_jobs%rowtype; settings private.photograph_auto_text_settings%rowtype;
begin
  perform private.require_photograph_auto_text_worker(p_secret);
  select * into settings from private.photograph_auto_text_settings for share;
  select * into job from private.photograph_auto_text_jobs where id = p_job_id for update;
  if job.id is null or p_lease_id is null or job.lease_id is distinct from p_lease_id then raise exception 'Invalid lease'; end if;
  if job.kind = 'description_alt' and not exists(select 1 from private.photograph_auto_text_attempts where job_id = p_job_id and lease_id = p_lease_id) then
    if not settings.description_alt_enabled or job.snapshot->>'settingsRevision' is distinct from settings.description_alt_revision::text
      or not exists(select 1 from public.photographs p where p.id = job.photograph_id
        and row(p.title,p.description) is not distinct from row(job.snapshot->>'title',job.snapshot->>'description')) then
      update private.photograph_auto_text_jobs set status = 'skipped',error_code = 'source_changed',updated_at = clock_timestamp() where id = job.id;
      return jsonb_build_object('reserved',false,'status','skipped');
    end if;
  end if;
  return private.reserve_photograph_auto_text(p_secret,p_job_id,p_lease_id,p_input_tokens);
end $$;
revoke all on function public.reserve_photograph_auto_text(text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_photograph_auto_text(text,uuid,uuid,integer) to anon,authenticated;

create or replace function public.finish_photograph_auto_text(p_secret text,p_job_id uuid,p_lease_id uuid,p_attempt_id uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job private.photograph_auto_text_jobs%rowtype; attempt private.photograph_auto_text_attempts%rowtype;
  photo public.photographs%rowtype; photo_id uuid; v_sources jsonb; vals jsonb; field text; key text;
  v_status text; applied boolean := false; usage_valid boolean := false; cost bigint;
  v_input integer; v_output integer; v_result jsonb; fields jsonb; metadata_valid boolean;
  settings private.photograph_auto_text_settings%rowtype; alt_only boolean;
begin
  perform private.require_photograph_auto_text_worker(p_secret);
  select photograph_id into photo_id from private.photograph_auto_text_jobs where id = p_job_id;
  select * into photo from public.photographs where id = photo_id for update;
  select * into settings from private.photograph_auto_text_settings for share;
  select * into job from private.photograph_auto_text_jobs where id = p_job_id for update;
  select * into attempt from private.photograph_auto_text_attempts where id = p_attempt_id for update;
  if attempt.id is null or attempt.job_id is distinct from p_job_id or attempt.lease_id is distinct from p_lease_id
    or p_lease_id is null then raise exception 'Invalid paid attempt'; end if;
  if attempt.result is not null then
    if attempt.result is distinct from p_result then raise exception 'Conflicting finish result'; end if;
    return attempt.finish_result;
  end if;
  -- Deletion retains paid audit/holds; an operator reconciles a removed job.
  if job.id is null then
    raise exception 'Photograph removed; paid attempt requires operator reconciliation';
  end if;
  if job.lease_id is distinct from p_lease_id or job.status not in ('processing','uncertain') then raise exception 'Inactive attempt'; end if;
  alt_only := job.kind = 'description_alt';
  if jsonb_typeof(p_result) is distinct from 'object' or pg_column_size(p_result) > 16000
    or coalesce(p_result->>'outcome','') not in ('completed','review','failed','uncertain')
    or exists(select 1 from jsonb_object_keys(p_result) k where k not in
      ('outcome','fields','altText','responseId','model','previewSha256','configHash','promptVersion','inputTokens','outputTokens','errorCode'))
    or (p_result ? 'errorCode' and coalesce(p_result->>'errorCode','') not in
      ('provider_error','invalid_response','refused','incomplete','request_uncertain'))
    or (alt_only and p_result ? 'fields') or (not alt_only and p_result ? 'altText')
    or (p_result ? 'fields' and not coalesce(private.valid_photograph_text_fields(p_result->'fields'),false))
    or (p_result ? 'altText' and (jsonb_typeof(p_result->'altText') is distinct from 'string'
      or nullif(btrim(p_result->>'altText'),'') is null or length(p_result->>'altText') > 180
      or p_result->>'altText' ~ '[<>\x00-\x1f\x7f]')) then raise exception 'Invalid result'; end if;
  if p_result ? 'fields' and (length(p_result->'fields'->>'title') > 80 or length(p_result->'fields'->>'description') > 240
    or length(p_result->'fields'->>'altText') > 180 or jsonb_array_length(p_result->'fields'->'uncertainties') > 2) then
    raise exception 'Automatic text exceeds generation limits'; end if;
  if jsonb_typeof(p_result->'inputTokens') = 'number' and jsonb_typeof(p_result->'outputTokens') = 'number'
    and coalesce(p_result->>'inputTokens','') ~ '^[0-9]{1,6}$' and coalesce(p_result->>'outputTokens','') ~ '^[0-9]{1,4}$' then
    v_input := (p_result->>'inputTokens')::integer; v_output := (p_result->>'outputTokens')::integer;
    usage_valid := v_input between 0 and attempt.input_tokens and v_output between 0 and 4096
      and p_result->>'model' = 'gpt-6.1-sol' and coalesce(p_result->>'responseId','') ~ '^resp_[A-Za-z0-9_-]{1,195}$';
  end if;
  usage_valid := coalesce(usage_valid,false);
  fields := p_result->'fields';
  metadata_valid := coalesce(p_result->>'configHash','') ~ '^[0-9a-f]{64}$'
    and coalesce(p_result->>'promptVersion','') ~ '^[0-9a-f]{64}$'
    and case when alt_only then nullif(btrim(p_result->>'altText'),'') is not null
      else coalesce(private.valid_photograph_text_fields(fields),false) and coalesce(p_result->>'previewSha256','') ~ '^[0-9a-f]{64}$' end;
  v_status := p_result->>'outcome';
  if not usage_valid or v_status = 'uncertain' then v_status := 'uncertain';
  elsif v_status in ('completed','review') and not metadata_valid then v_status := 'failed';
  elsif not alt_only and v_status = 'completed' and jsonb_array_length(fields->'uncertainties') > 0 then v_status := 'review'; end if;
  if v_status <> 'uncertain' then
    cost := ceil(v_input::numeric * 2.5 + v_output * 10)::bigint;
    update private.photograph_auto_text_months set reserved_micros = reserved_micros - attempt.reserved_micros,
      used_micros = used_micros + cost where month = attempt.month;
    update private.photograph_auto_text_attempts set charged_micros = cost where id = attempt.id;
  end if;
  if alt_only and v_status = 'completed' then
    if not settings.enabled or not settings.description_alt_enabled
      or job.snapshot->>'settingsRevision' is distinct from settings.description_alt_revision::text
      or row(photo.title,photo.description,photo.storage_path,photo.filename) is distinct from
        row(job.snapshot->>'title',job.snapshot->>'description',job.snapshot->>'storagePath',job.snapshot->>'filename') then v_status := 'skipped';
    else
      update public.photographs set alt_text = btrim(p_result->>'altText') where id = photo.id;
      update private.photograph_text_state set sources = jsonb_set(sources,'{alt_text}','"ai"') where photograph_id = photo.id;
      applied := true;
    end if;
  elsif not alt_only then
    if v_status = 'completed' and row(photo.filename,photo.storage_path,photo.image_width,photo.image_height)
      is distinct from row(job.snapshot->>'filename',job.snapshot->>'storagePath',
        (job.snapshot->>'width')::integer,(job.snapshot->>'height')::integer) then v_status := 'review'; end if;
    if v_status = 'completed' then
      select s.sources into v_sources from private.photograph_text_state s where photograph_id = photo.id for update;
      vals := jsonb_build_object('title',photo.title,'description',photo.description,'alt_text',photo.alt_text);
      foreach field in array array['title','description','alt_text'] loop
        if (field <> 'alt_text' or not settings.description_alt_enabled) and v_sources->>field = 'unset' and nullif(btrim(vals->>field),'') is null then
          key := case field when 'alt_text' then 'altText' else field end;
          vals := jsonb_set(vals,array[field],fields->key);
          v_sources := jsonb_set(v_sources,array[field],'"ai"'); applied := true;
        end if;
      end loop;
      if applied then
        update public.photographs set title = vals->>'title',description = vals->>'description',alt_text = vals->>'alt_text'
          where id = photo.id returning * into photo;
        update private.photograph_text_state set sources = v_sources where photograph_id = photo.id;
      end if;
    end if;
    if v_status = 'review' and metadata_valid then
      insert into private.photograph_text_drafts(run_id,photograph_id,source,config,original_fields,fields,baseline_revision)
      values(job.id,photo.id,job.snapshot || jsonb_build_object('previewSha256',p_result->>'previewSha256',
        'responseId',p_result->>'responseId','model',p_result->>'model','fields',fields),
        jsonb_build_object('model','gpt-6.1-sol','promptVersion',p_result->>'promptVersion','configHash',p_result->>'configHash'),fields,fields,photo.text_revision);
    end if;
  end if;
  v_result := jsonb_build_object('status',v_status,'applied',applied,'filename',job.snapshot->>'filename');
  update private.photograph_auto_text_jobs set status = v_status,
    error_code = case when v_status = 'uncertain' then 'request_uncertain' when v_status = 'skipped' then 'source_changed'
      when v_status = 'failed' then coalesce(p_result->>'errorCode','invalid_response') else null end,
    next_attempt_at = clock_timestamp() + interval '15 minutes',updated_at = clock_timestamp() where id = job.id;
  update private.photograph_auto_text_attempts set result = p_result,finish_result = v_result where id = attempt.id;
  return v_result;
end $$;

create or replace function public.photograph_auto_text_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_month date := date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
begin
  perform private.require_photograph_text_admin();
  return jsonb_build_object('enabled',(select enabled from private.photograph_auto_text_settings),
    'descriptionAltEnabled',(select description_alt_enabled from private.photograph_auto_text_settings),
    'descriptionAltRevision',(select description_alt_revision from private.photograph_auto_text_settings),
    'month',v_month,'budgetMicros',5000000,'committedMicros',coalesce((select used_micros + reserved_micros
      from private.photograph_auto_text_months where month = v_month),0),
    'priorMonthHolds',(select count(*) from private.photograph_auto_text_attempts where month < v_month and charged_micros is null),
    'counts',coalesce((select jsonb_object_agg(status,n) from (select status,count(*) n from private.photograph_auto_text_jobs group by status) c),'{}'),
    'jobs',coalesce((select jsonb_agg(item order by updated_at desc,id) from (
      select j.updated_at,j.id,jsonb_build_object('id',j.id,'photographId',j.photograph_id,'filename',p.filename,
        'kind',j.kind,'status',j.status,'errorCode',j.error_code,'attempts',j.attempts,'updatedAt',j.updated_at) item
      from private.photograph_auto_text_jobs j join public.photographs p on p.id = j.photograph_id
      order by j.updated_at desc,j.id limit 100) recent),'[]'));
end $$;
