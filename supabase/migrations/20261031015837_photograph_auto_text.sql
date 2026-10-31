-- Future inserts only. Enabling the worker and provisioning its secret are
-- separate operator actions; this migration neither enqueues nor edits old rows.
create table private.photograph_auto_text_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  worker_secret_hash text check (worker_secret_hash ~ '^[0-9a-f]{64}$')
);
insert into private.photograph_auto_text_settings(singleton) values(true);
create table private.photograph_auto_text_months (
  month date primary key check (extract(day from month) = 1),
  used_micros bigint not null default 0 check (used_micros >= 0),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  check (used_micros + reserved_micros <= 5000000)
);
create table private.photograph_auto_text_jobs (
  id uuid primary key default gen_random_uuid(),
  photograph_id uuid not null unique references public.photographs(id) on delete cascade,
  status text not null default 'pending' check (status in
    ('pending','processing','failed','uncertain','completed','review','skipped','budget_paused')),
  lease_id uuid,
  lease_expires_at timestamptz,
  snapshot jsonb,
  attempts integer not null default 0 check (attempts between 0 and 2),
  preflight_failures integer not null default 0 check (preflight_failures between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index photograph_auto_text_ready_idx on private.photograph_auto_text_jobs(next_attempt_at,created_at,id)
  where status in ('pending','failed','budget_paused','processing');
create table private.photograph_auto_text_attempts (
  id uuid primary key default gen_random_uuid(),
  -- Keep paid audit/holds even if the original photograph and its job are deleted.
  job_id uuid not null,
  lease_id uuid not null,
  month date not null references private.photograph_auto_text_months(month),
  input_tokens integer not null check (input_tokens between 1 and 250000),
  reserved_micros bigint not null check (reserved_micros > 0),
  charged_micros bigint,
  result jsonb,
  finish_result jsonb,
  created_at timestamptz not null default now(),
  unique(job_id,lease_id),
  check (charged_micros between 0 and reserved_micros)
);
alter table private.photograph_auto_text_settings enable row level security;
alter table private.photograph_auto_text_months enable row level security;
alter table private.photograph_auto_text_jobs enable row level security;
alter table private.photograph_auto_text_attempts enable row level security;
revoke all on private.photograph_auto_text_settings, private.photograph_auto_text_months,
  private.photograph_auto_text_jobs, private.photograph_auto_text_attempts from public,anon,authenticated;

create function private.require_photograph_auto_text_worker(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or length(p_secret) < 32 or not exists (
    select 1 from private.photograph_auto_text_settings
    where worker_secret_hash = encode(sha256(convert_to(p_secret,'UTF8')),'hex')
  ) then raise exception 'Invalid worker capability' using errcode = '42501'; end if;
end $$;
create function private.enqueue_photograph_auto_text() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.photograph_auto_text_jobs(photograph_id) values(new.id);
  return new;
end $$;
-- Alphabetical AFTER trigger ordering ensures text sources already exist.
create trigger z_enqueue_photograph_auto_text after insert on public.photographs
for each row execute function private.enqueue_photograph_auto_text();
revoke all on function private.require_photograph_auto_text_worker(text),
  private.enqueue_photograph_auto_text() from public,anon,authenticated;

create function public.claim_photograph_auto_text(p_secret text,p_photograph_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job private.photograph_auto_text_jobs%rowtype; photo public.photographs%rowtype; sources jsonb;
begin
  perform private.require_photograph_auto_text_worker(p_secret);
  if not (select enabled from private.photograph_auto_text_settings) then return null; end if;
  -- Recovery never releases a paid hold or guesses whether an external call ran.
  for job in select * from private.photograph_auto_text_jobs
    where status = 'processing' and lease_expires_at <= clock_timestamp()
    order by id for update skip locked loop
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
      and attempts < 2 and preflight_failures < 3
      and next_attempt_at <= clock_timestamp()
    order by next_attempt_at,created_at,id for update skip locked loop
    select * into photo from public.photographs where id = job.photograph_id;
    select s.sources into sources from private.photograph_text_state s where photograph_id = photo.id;
    if not exists (select 1 from unnest(array['title','description','alt_text']) field
      where sources->>field = 'unset' and nullif(btrim(to_jsonb(photo)->>field),'') is null) then
      update private.photograph_auto_text_jobs set status = 'skipped',updated_at = clock_timestamp() where id = job.id;
      continue;
    end if;
    job.lease_id := gen_random_uuid();
    job.snapshot := jsonb_build_object('photographId',photo.id,'filename',photo.filename,'storagePath',photo.storage_path,
      'width',photo.image_width,'height',photo.image_height,'textRevision',photo.text_revision);
    update private.photograph_auto_text_jobs set status = 'processing',lease_id = job.lease_id,
      lease_expires_at = clock_timestamp() + interval '10 minutes',snapshot = job.snapshot,
      error_code = null,updated_at = clock_timestamp() where id = job.id;
    return job.snapshot || jsonb_build_object('jobId',job.id,'leaseId',job.lease_id,'attempts',job.attempts);
  end loop;
  return null;
end $$;

create function public.reserve_photograph_auto_text(p_secret text,p_job_id uuid,p_lease_id uuid,p_input_tokens integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job private.photograph_auto_text_jobs%rowtype; attempt private.photograph_auto_text_attempts%rowtype;
  v_month date := date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
  cost bigint; committed bigint;
begin
  perform private.require_photograph_auto_text_worker(p_secret);
  if p_input_tokens is null or p_input_tokens not between 1 and 250000 then raise exception 'Invalid input token count'; end if;
  select * into job from private.photograph_auto_text_jobs where id = p_job_id for update;
  if not found or job.lease_id is distinct from p_lease_id or p_lease_id is null then raise exception 'Invalid lease'; end if;
  select * into attempt from private.photograph_auto_text_attempts where job_id = job.id and lease_id = p_lease_id;
  if found then
    if attempt.input_tokens <> p_input_tokens then raise exception 'Reservation input changed'; end if;
    if job.status = 'processing' and job.lease_expires_at <= clock_timestamp() then
      update private.photograph_auto_text_jobs set status = 'uncertain',error_code = 'request_uncertain',
        updated_at = clock_timestamp() where id = job.id;
      job.status := 'uncertain';
    end if;
    -- Never authorizes another call: reserved=true only describes the persisted
    -- reservation. The worker must create once, not repeat on HTTP retries.
    return jsonb_build_object('reserved',true,'status',job.status,'attemptId',attempt.id);
  end if;
  if job.status <> 'processing' or job.lease_expires_at <= clock_timestamp() or job.attempts >= 2 then raise exception 'Inactive lease'; end if;
  if not (select enabled from private.photograph_auto_text_settings) then
    return jsonb_build_object('reserved',false,'status','disabled');
  end if;
  cost := ceil(p_input_tokens::numeric * 2.5 + 4096 * 10)::bigint;
  insert into private.photograph_auto_text_months(month) values(v_month) on conflict do nothing;
  select used_micros + reserved_micros into committed from private.photograph_auto_text_months where month = v_month for update;
  if committed + cost > 5000000 then
    update private.photograph_auto_text_jobs set status = 'budget_paused',
      next_attempt_at = ((v_month + interval '1 month')::timestamp at time zone 'UTC'),
      updated_at = clock_timestamp() where id = job.id;
    return jsonb_build_object('reserved',false,'status','budget_paused');
  end if;
  insert into private.photograph_auto_text_attempts(job_id,lease_id,month,input_tokens,reserved_micros)
    values(job.id,p_lease_id,v_month,p_input_tokens,cost) returning * into attempt;
  update private.photograph_auto_text_months set reserved_micros = reserved_micros + cost where month = v_month;
  update private.photograph_auto_text_jobs set attempts = attempts + 1,updated_at = clock_timestamp() where id = job.id;
  return jsonb_build_object('reserved',true,'status','processing','attemptId',attempt.id);
end $$;

create function public.finish_photograph_auto_text(p_secret text,p_job_id uuid,p_lease_id uuid,p_attempt_id uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job private.photograph_auto_text_jobs%rowtype; attempt private.photograph_auto_text_attempts%rowtype;
  photo public.photographs%rowtype; photo_id uuid; v_sources jsonb; vals jsonb; field text; key text;
  v_status text; applied boolean := false; usage_valid boolean := false; cost bigint;
  v_input integer; v_output integer; v_result jsonb; fields jsonb; metadata_valid boolean;
begin
  perform private.require_photograph_auto_text_worker(p_secret);
  if jsonb_typeof(p_result) is distinct from 'object' or pg_column_size(p_result) > 16000
    or coalesce(p_result->>'outcome','') not in ('completed','review','failed','uncertain')
    or exists(select 1 from jsonb_object_keys(p_result) k where k not in
      ('outcome','fields','responseId','model','previewSha256','configHash','promptVersion','inputTokens','outputTokens','errorCode'))
    or (p_result ? 'errorCode' and coalesce(p_result->>'errorCode','') not in
      ('provider_error','invalid_response','refused','incomplete','request_uncertain'))
    or (p_result ? 'fields' and not coalesce(private.valid_photograph_text_fields(p_result->'fields'),false))
    then raise exception 'Invalid result'; end if;
  if p_result ? 'fields' and (length(p_result->'fields'->>'title') > 80
    or length(p_result->'fields'->>'description') > 240 or length(p_result->'fields'->>'altText') > 180
    or jsonb_array_length(p_result->'fields'->'uncertainties') > 2) then raise exception 'Automatic text exceeds generation limits'; end if;
  -- Photo first, then job/attempt/state: consistent with manual/live writes.
  select photograph_id into photo_id from private.photograph_auto_text_jobs where id = p_job_id;
  select * into photo from public.photographs where id = photo_id for update;
  select * into job from private.photograph_auto_text_jobs where id = p_job_id for update;
  select * into attempt from private.photograph_auto_text_attempts where id = p_attempt_id for update;
  if attempt.id is null or attempt.job_id is distinct from p_job_id or attempt.lease_id is distinct from p_lease_id
    or p_lease_id is null then raise exception 'Invalid paid attempt'; end if;
  if attempt.result is not null then
    if attempt.result is distinct from p_result then raise exception 'Conflicting finish result'; end if;
    return attempt.finish_result;
  end if;
  if job.id is null or job.lease_id is distinct from p_lease_id or job.status not in ('processing','uncertain') then raise exception 'Inactive attempt'; end if;
  -- Strict JSON integer/range checks avoid casts or JSON null bypasses.
  if jsonb_typeof(p_result->'inputTokens') = 'number' and jsonb_typeof(p_result->'outputTokens') = 'number'
    and coalesce(p_result->>'inputTokens','') ~ '^[0-9]{1,6}$'
    and coalesce(p_result->>'outputTokens','') ~ '^[0-9]{1,4}$' then
    v_input := (p_result->>'inputTokens')::integer; v_output := (p_result->>'outputTokens')::integer;
    usage_valid := v_input between 0 and attempt.input_tokens and v_output between 0 and 4096
      and p_result->>'model' = 'gpt-6.1-sol'
      and coalesce(p_result->>'responseId','') ~ '^resp_[A-Za-z0-9_-]{1,195}$';
  end if;
  usage_valid := coalesce(usage_valid,false);
  fields := p_result->'fields';
  metadata_valid := coalesce(private.valid_photograph_text_fields(fields),false)
    and coalesce(p_result->>'previewSha256','') ~ '^[0-9a-f]{64}$'
    and coalesce(p_result->>'configHash','') ~ '^[0-9a-f]{64}$'
    and coalesce(p_result->>'promptVersion','') ~ '^[0-9a-f]{64}$';
  v_status := p_result->>'outcome';
  if not usage_valid or v_status = 'uncertain' then v_status := 'uncertain';
  elsif v_status in ('completed','review') and not metadata_valid then v_status := 'failed';
  elsif v_status = 'completed' and jsonb_array_length(fields->'uncertainties') > 0 then v_status := 'review'; end if;
  -- An explicit uncertain outcome retains the full hold even with token counts.
  if v_status <> 'uncertain' then
    cost := ceil(v_input::numeric * 2.5 + v_output * 10)::bigint;
    update private.photograph_auto_text_months set reserved_micros = reserved_micros - attempt.reserved_micros,
      used_micros = used_micros + cost where month = attempt.month;
    update private.photograph_auto_text_attempts set charged_micros = cost where id = attempt.id;
  end if;
  if v_status = 'completed' and row(photo.filename,photo.storage_path,photo.image_width,photo.image_height)
      is distinct from row(job.snapshot->>'filename',job.snapshot->>'storagePath',
        (job.snapshot->>'width')::integer,(job.snapshot->>'height')::integer) then v_status := 'review'; end if;
  if v_status = 'completed' then
    select s.sources into v_sources from private.photograph_text_state s where photograph_id = photo.id for update;
    vals := jsonb_build_object('title',photo.title,'description',photo.description,'alt_text',photo.alt_text);
    foreach field in array array['title','description','alt_text'] loop
      if v_sources->>field = 'unset' and nullif(btrim(vals->>field),'') is null then
        key := case field when 'alt_text' then 'altText' else field end;
        vals := jsonb_set(vals,array[field],fields->key);
        v_sources := jsonb_set(v_sources,array[field],'"ai"'); applied := true;
      end if;
    end loop;
    if applied then
      -- Do not write caption/date/order columns from a claim-time snapshot.
      update public.photographs set title = vals->>'title',description = vals->>'description',alt_text = vals->>'alt_text'
        where id = photo.id returning * into photo;
      update private.photograph_text_state set sources = v_sources where photograph_id = photo.id;
    end if;
  end if;
  if v_status = 'review' and metadata_valid then
    insert into private.photograph_text_drafts(run_id,photograph_id,source,config,original_fields,fields,baseline_revision)
    values(job.id,photo.id,job.snapshot || jsonb_build_object('previewSha256',p_result->>'previewSha256',
      'responseId',p_result->>'responseId','model',p_result->>'model','fields',fields),
      jsonb_build_object('model','gpt-6.1-sol','promptVersion',p_result->>'promptVersion','configHash',p_result->>'configHash'),
      fields,fields,photo.text_revision);
  end if;
  v_result := jsonb_build_object('status',v_status,'applied',applied,'filename',job.snapshot->>'filename');
  update private.photograph_auto_text_jobs set status = v_status,
    error_code = case when v_status = 'uncertain' then 'request_uncertain'
      when v_status = 'failed' then coalesce(p_result->>'errorCode','invalid_response') else null end,
    next_attempt_at = clock_timestamp() + interval '15 minutes',updated_at = clock_timestamp() where id = job.id;
  update private.photograph_auto_text_attempts set result = p_result,finish_result = v_result where id = attempt.id;
  return v_result;
end $$;

create function public.fail_photograph_auto_text(p_secret text,p_job_id uuid,p_lease_id uuid,p_error_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare job private.photograph_auto_text_jobs%rowtype;
begin
  perform private.require_photograph_auto_text_worker(p_secret);
  if p_error_code is null or p_error_code not in ('preview_unavailable','token_count_failed','configuration_error') then raise exception 'Invalid preflight error'; end if;
  select * into job from private.photograph_auto_text_jobs where id = p_job_id for update;
  if not found or p_lease_id is null or job.lease_id is distinct from p_lease_id then raise exception 'Invalid lease'; end if;
  if exists(select 1 from private.photograph_auto_text_attempts where job_id = job.id and lease_id = p_lease_id) then
    if job.status in ('processing','uncertain') then
      update private.photograph_auto_text_jobs set status = 'uncertain',error_code = 'request_uncertain',updated_at = clock_timestamp() where id = job.id;
    end if;
    return;
  end if;
  if job.status = 'failed' then return; end if;
  if job.status <> 'processing' or job.lease_expires_at <= clock_timestamp() then raise exception 'Inactive lease'; end if;
  update private.photograph_auto_text_jobs set status = 'failed',preflight_failures = preflight_failures + 1,
    error_code = p_error_code,next_attempt_at = clock_timestamp() + interval '15 minutes',updated_at = clock_timestamp() where id = job.id;
end $$;

create function public.photograph_auto_text_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_month date := date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
begin
  perform private.require_photograph_text_admin();
  return jsonb_build_object('enabled',(select enabled from private.photograph_auto_text_settings),
    'month',v_month,'budgetMicros',5000000,'committedMicros',coalesce((select used_micros + reserved_micros
      from private.photograph_auto_text_months where month = v_month),0),
    'priorMonthHolds',(select count(*) from private.photograph_auto_text_attempts where month < v_month and charged_micros is null),
    'counts',coalesce((select jsonb_object_agg(status,n) from (select status,count(*) n from private.photograph_auto_text_jobs group by status) c),'{}'),
    'jobs',coalesce((select jsonb_agg(item order by updated_at desc,id) from (
      select j.updated_at,j.id,jsonb_build_object('id',j.id,'photographId',j.photograph_id,'filename',p.filename,
        'status',j.status,'errorCode',j.error_code,'attempts',j.attempts,'updatedAt',j.updated_at) item
      from private.photograph_auto_text_jobs j join public.photographs p on p.id = j.photograph_id
      order by j.updated_at desc,j.id limit 100) recent),'[]'));
end $$;

create function public.retry_photograph_auto_text(p_job_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare job private.photograph_auto_text_jobs%rowtype;
begin
  perform private.require_photograph_text_admin();
  select * into job from private.photograph_auto_text_jobs where id = p_job_id for update;
  if not found or job.status <> 'failed' or job.attempts >= 2 or exists (
    select 1 from private.photograph_auto_text_attempts where job_id = job.id and charged_micros is null
  ) then raise exception 'Job cannot be retried'; end if;
  -- Explicit operator retry may reset exhausted preflight failures, never paid attempts.
  update private.photograph_auto_text_jobs set status = 'pending',preflight_failures = 0,
    next_attempt_at = clock_timestamp(),updated_at = clock_timestamp() where id = job.id;
  return job.photograph_id;
end $$;

revoke all on function public.claim_photograph_auto_text(text,uuid),
  public.reserve_photograph_auto_text(text,uuid,uuid,integer),public.finish_photograph_auto_text(text,uuid,uuid,uuid,jsonb),
  public.fail_photograph_auto_text(text,uuid,uuid,text),public.photograph_auto_text_status(),
  public.retry_photograph_auto_text(uuid) from public,anon,authenticated;
-- Capability-checked worker RPCs deliberately work with the ordinary anon key.
grant execute on function public.claim_photograph_auto_text(text,uuid),
  public.reserve_photograph_auto_text(text,uuid,uuid,integer),public.finish_photograph_auto_text(text,uuid,uuid,uuid,jsonb),
  public.fail_photograph_auto_text(text,uuid,uuid,text) to anon,authenticated;
grant execute on function public.photograph_auto_text_status(),public.retry_photograph_auto_text(uuid) to authenticated;

-- Explicitly touched fields protect intentional empty->empty clears. Unchanged
-- siblings and legacy callers keep their ownership; direct updates still mark
-- only changed text, never unrelated dates.
create or replace function public.save_photograph_text(p_id uuid,p_revision integer,p_values jsonb,
  p_draft_id uuid default null,p_draft_version integer default null,p_ai_fields text[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare photo public.photographs%rowtype; draft private.photograph_text_drafts%rowtype; field text; key text;
  manual_fields text[] := '{}';
begin
  perform private.require_photograph_text_admin();
  if jsonb_typeof(p_values) is distinct from 'object' or exists (select 1 from jsonb_object_keys(p_values) k
    where k not in ('title','description','alt_text','caption_mode','custom_caption','captured_at','sort_order','manual_fields'))
    or not p_values ?& array['title','description','alt_text','caption_mode','custom_caption','captured_at','sort_order']
    or p_ai_fields is null or not p_ai_fields <@ array['title','description','alt_text']::text[]
    or array_position(p_ai_fields,null) is not null then raise exception 'Invalid text fields'; end if;
  if p_values ? 'manual_fields' then
    if jsonb_typeof(p_values->'manual_fields') is distinct from 'array' then raise exception 'Invalid manual fields'; end if;
    if jsonb_array_length(p_values->'manual_fields') > 3 or exists (
      select 1 from jsonb_array_elements(p_values->'manual_fields') value
      where jsonb_typeof(value) <> 'string' or value#>>'{}' not in ('title','description','alt_text')
    ) then raise exception 'Invalid manual fields'; end if;
    select coalesce(array_agg(value),'{}') into manual_fields from jsonb_array_elements_text(p_values->'manual_fields') value;
    if cardinality(manual_fields) <> (select count(distinct value) from unnest(manual_fields) value)
      or manual_fields && p_ai_fields then raise exception 'Invalid manual fields'; end if;
  end if;
  select * into photo from public.photographs where id = p_id for update;
  if not found or photo.text_revision is distinct from p_revision then raise exception 'The photograph changed. Reload before saving.' using errcode = '40001'; end if;
  if cardinality(p_ai_fields) > 0 then
    select * into draft from private.photograph_text_drafts where id = p_draft_id for update;
    if not found or draft.photograph_id <> p_id or draft.version is distinct from p_draft_version
      or draft.source->>'storagePath' <> photo.storage_path then raise exception 'The AI suggestion changed. Reload before saving.'; end if;
    foreach field in array p_ai_fields loop
      key := case field when 'alt_text' then 'altText' else field end;
      if p_values->>field is distinct from draft.original_fields->>key then raise exception 'The AI field no longer matches its original suggestion'; end if;
    end loop;
  end if;
  update public.photographs set title = nullif(btrim(p_values->>'title'),''),
    description = nullif(btrim(p_values->>'description'),''),alt_text = nullif(btrim(p_values->>'alt_text'),''),
    caption_mode = p_values->>'caption_mode',custom_caption = nullif(btrim(p_values->>'custom_caption'),''),
    captured_at = (p_values->>'captured_at')::date,sort_order = (p_values->>'sort_order')::integer,
    text_revision = photo.text_revision + 1 where id = p_id returning * into photo;
  foreach field in array p_ai_fields loop
    update private.photograph_text_state set sources = jsonb_set(sources,array[field],'"ai"') where photograph_id = p_id;
  end loop;
  foreach field in array manual_fields loop
    update private.photograph_text_state set sources = jsonb_set(sources,array[field],'"manual"') where photograph_id = p_id;
  end loop;
  return jsonb_build_object('revision',photo.text_revision);
end $$;
