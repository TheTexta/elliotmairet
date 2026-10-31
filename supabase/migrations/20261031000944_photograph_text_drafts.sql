-- Additive metadata only. Catalogue presence, filenames, objects and upload RPCs
-- remain unchanged. Triggers protect edits made by old clients during rollout.
alter table public.photographs
  add column description text,
  add column caption_mode text not null default 'description'
    check (caption_mode in ('description', 'custom', 'hidden')),
  add column custom_caption text,
  add column text_revision integer not null default 0 check (text_revision >= 0),
  add constraint photograph_text_lengths check (
    coalesce(length(title), 0) <= 200 and coalesce(length(alt_text), 0) <= 500
    and coalesce(length(description), 0) <= 1000 and coalesce(length(custom_caption), 0) <= 1000),
  add constraint photograph_custom_caption_present check
    (caption_mode <> 'custom' or nullif(btrim(custom_caption), '') is not null);

create table private.photograph_text_state (
  photograph_id uuid primary key references public.photographs(id) on delete cascade,
  sources jsonb not null default '{"title":"unset","description":"unset","alt_text":"unset"}'
);
insert into private.photograph_text_state (photograph_id, sources)
select id, jsonb_build_object('title', case when nullif(btrim(title),'') is null then 'unset' else 'manual' end,
  'description','unset','alt_text',case when nullif(btrim(alt_text),'') is null then 'unset' else 'manual' end)
from public.photographs;

create table private.photograph_text_drafts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  photograph_id uuid not null,
  source jsonb not null,
  config jsonb not null,
  original_fields jsonb not null,
  fields jsonb not null,
  version integer not null default 1,
  baseline_revision integer not null,
  applied_revision integer,
  applied_fields text[] not null default '{}',
  notes_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, photograph_id)
);
create index photograph_text_drafts_photo_idx on private.photograph_text_drafts (photograph_id);
create table private.photograph_text_approvals (
  token uuid primary key default gen_random_uuid(),
  actor uuid not null,
  run_id uuid not null,
  items jsonb not null,
  cursor integer not null default 0,
  cancelled boolean not null default false,
  results jsonb not null default '[]',
  expires_at timestamptz not null default (now() + interval '30 minutes')
);
create table private.photograph_text_applications (
  id uuid primary key default gen_random_uuid(),
  token uuid not null references private.photograph_text_approvals(token),
  draft_id uuid not null references private.photograph_text_drafts(id),
  draft_version integer not null,
  photograph_id uuid not null,
  field text not null check (field in ('title','description','alt_text')),
  before_value text,
  before_source text not null,
  after_value text,
  after_source text not null,
  applied_revision integer not null,
  rolled_back boolean not null default false,
  unique (draft_id, draft_version, field)
);
create table private.photograph_text_edit_history (
  id bigint generated always as identity primary key,
  photograph_id uuid not null,
  actor uuid,
  before_values jsonb not null,
  after_values jsonb not null,
  revision integer not null,
  created_at timestamptz not null default now()
);
create index photograph_text_applications_token_idx on private.photograph_text_applications (token, photograph_id);
alter table private.photograph_text_state enable row level security;
alter table private.photograph_text_drafts enable row level security;
alter table private.photograph_text_approvals enable row level security;
alter table private.photograph_text_applications enable row level security;
alter table private.photograph_text_edit_history enable row level security;
revoke all on private.photograph_text_state, private.photograph_text_drafts,
  private.photograph_text_approvals, private.photograph_text_applications,
  private.photograph_text_edit_history from public, anon, authenticated;
revoke all on sequence private.photograph_text_edit_history_id_seq from public, anon, authenticated;

create function private.require_photograph_text_admin() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
end $$;
revoke all on function private.require_photograph_text_admin() from public, anon, authenticated;

create function private.revise_photograph_text() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.text_revision := 0;
  elsif row(new.title,new.description,new.alt_text,new.caption_mode,new.custom_caption,
      new.captured_at,new.sort_order,new.storage_path,new.filename,new.image_width,new.image_height)
    is distinct from row(old.title,old.description,old.alt_text,old.caption_mode,old.custom_caption,
      old.captured_at,old.sort_order,old.storage_path,old.filename,old.image_width,old.image_height)
    or new.text_revision is distinct from old.text_revision then
    new.text_revision := old.text_revision + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;
create function private.track_photograph_text_sources() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sources jsonb; field text;
begin
  if tg_op = 'INSERT' then
    v_sources := '{"title":"unset","description":"unset","alt_text":"unset"}';
    foreach field in array array['title','description','alt_text'] loop
      if nullif(btrim(to_jsonb(new)->>field),'') is not null then
        v_sources := jsonb_set(v_sources,array[field],'"manual"');
      end if;
    end loop;
    insert into private.photograph_text_state values (new.id,v_sources);
  else
    select s.sources into v_sources from private.photograph_text_state s where photograph_id = new.id for update;
    foreach field in array array['title','description','alt_text'] loop
      if to_jsonb(new)->field is distinct from to_jsonb(old)->field then
        v_sources := jsonb_set(v_sources,array[field],'"manual"');
      end if;
    end loop;
    update private.photograph_text_state s set sources = v_sources
      where s.photograph_id = new.id;
    if new.text_revision is distinct from old.text_revision then
      insert into private.photograph_text_edit_history(photograph_id,actor,before_values,after_values,revision)
      values(new.id,auth.uid(),jsonb_build_object('title',old.title,'description',old.description,'alt_text',old.alt_text,
        'caption_mode',old.caption_mode,'custom_caption',old.custom_caption),
        jsonb_build_object('title',new.title,'description',new.description,'alt_text',new.alt_text,
        'caption_mode',new.caption_mode,'custom_caption',new.custom_caption),new.text_revision);
    end if;
  end if;
  return new;
end $$;
revoke all on function private.revise_photograph_text(), private.track_photograph_text_sources() from public, anon, authenticated;
create trigger revise_photograph_text before insert or update on public.photographs
for each row execute function private.revise_photograph_text();
create trigger track_photograph_text_sources after insert or update on public.photographs
for each row execute function private.track_photograph_text_sources();
grant update (description, caption_mode, custom_caption) on public.photographs to authenticated;

create function private.valid_photograph_text_fields(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare field text; maximum integer;
begin
  if jsonb_typeof(value) <> 'object' or (select count(*) from jsonb_object_keys(value)) <> 5
    or not value ?& array['title','description','altText','filenameSuggestion','uncertainties'] then return false; end if;
  foreach field in array array['title','description','altText','filenameSuggestion'] loop
    maximum := case field when 'title' then 200 when 'description' then 1000 when 'altText' then 500 else 160 end;
    if jsonb_typeof(value->field) <> 'string' or nullif(btrim(value->>field),'') is null
      or length(value->>field) > maximum or (value->>field) ~ '[<>[:cntrl:]]' then return false; end if;
  end loop;
  if (value->>'filenameSuggestion') !~ '^[a-z0-9]+(-[a-z0-9]+){1,11}\.jpg$'
    or jsonb_typeof(value->'uncertainties') <> 'array' then return false; end if;
  if jsonb_array_length(value->'uncertainties') > 5 or exists (
    select 1 from jsonb_array_elements(value->'uncertainties') note
    where jsonb_typeof(note) <> 'string' or length(note#>>'{}') > 300 or (note#>>'{}') ~ '[<>[:cntrl:]]'
  ) then return false; end if;
  return true;
end $$;
revoke all on function private.valid_photograph_text_fields(jsonb) from public, anon, authenticated;

create function public.photograph_text_states() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_photograph_text_admin();
  return coalesce((select jsonb_object_agg(photograph_id,sources) from private.photograph_text_state),'{}');
end $$;

create function public.photograph_text_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_photograph_text_admin();
  return jsonb_build_object('formatVersion',1,'photos',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'filename',p.filename,'storagePath',p.storage_path,'width',p.image_width,'height',p.image_height,
    'textRevision',p.text_revision,'title',p.title,'description',p.description,'altText',p.alt_text
  ) order by p.sort_order asc nulls last,p.captured_at desc nulls last,p.filename desc,p.id) from public.photographs p),'[]'));
end $$;

create function public.save_photograph_text(p_id uuid,p_revision integer,p_values jsonb,
  p_draft_id uuid default null,p_draft_version integer default null,p_ai_fields text[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare photo public.photographs%rowtype; draft private.photograph_text_drafts%rowtype; field text; key text;
begin
  perform private.require_photograph_text_admin();
  if jsonb_typeof(p_values) <> 'object' or exists (select 1 from jsonb_object_keys(p_values) k
    where k not in ('title','description','alt_text','caption_mode','custom_caption','captured_at','sort_order'))
    or not p_values ?& array['title','description','alt_text','caption_mode','custom_caption','captured_at','sort_order']
    or not p_ai_fields <@ array['title','description','alt_text']::text[] then raise exception 'Invalid text fields'; end if;
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
    description = nullif(btrim(p_values->>'description'),''), alt_text = nullif(btrim(p_values->>'alt_text'),''),
    caption_mode = p_values->>'caption_mode', custom_caption = nullif(btrim(p_values->>'custom_caption'),''),
    captured_at = (p_values->>'captured_at')::date, sort_order = (p_values->>'sort_order')::integer,
    text_revision = photo.text_revision + 1 where id = p_id returning * into photo;
  foreach field in array p_ai_fields loop
    update private.photograph_text_state set sources = jsonb_set(sources,array[field],'"ai"') where photograph_id = p_id;
  end loop;
  return jsonb_build_object('revision',photo.text_revision);
end $$;

create function public.import_photograph_text_drafts(p_payload jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare row jsonb; existing private.photograph_text_drafts%rowtype; imported integer := 0; run uuid; v_config jsonb;
begin
  perform private.require_photograph_text_admin();
  v_config := p_payload->'config'; run := (p_payload->>'runId')::uuid;
  if p_payload->>'formatVersion' is distinct from '1' or run is null or v_config->>'model' is distinct from 'gpt-6.1-sol'
    or coalesce(v_config->>'promptVersion','') !~ '^[0-9a-f]{64}$' or coalesce(v_config->>'configHash','') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_payload->'records') is distinct from 'array' or pg_column_size(p_payload) > 500000 then raise exception 'Invalid Sol draft export'; end if;
  if jsonb_array_length(p_payload->'records') not between 1 and 20 then raise exception 'Import 1 to 20 drafts per request'; end if;
  -- Same run cannot quietly change its model/prompt/configuration identity.
  perform pg_advisory_xact_lock(hashtextextended(run::text,0));
  if exists (select 1 from private.photograph_text_drafts d where d.run_id = run and d.config is distinct from v_config) then
    raise exception 'The run configuration changed'; end if;
  for row in select value from jsonb_array_elements(p_payload->'records') loop
    if not coalesce(private.valid_photograph_text_fields(row->'fields'),false)
      or coalesce(row->>'previewSha256','') !~ '^[0-9a-f]{64}$'
      or coalesce(row->>'model','') !~ '^gpt-6\.1-sol(-[a-z0-9-]+)?$'
      or coalesce(length(row->>'responseId'),0) not between 1 and 200
      or coalesce(length(row->>'storagePath'),0) not between 1 and 1024
      or coalesce(length(row->>'filename'),0) not between 1 and 255
      or coalesce((row->>'textRevision')::integer,-1) < 0 or coalesce((row->>'width')::integer,0) <= 0 or coalesce((row->>'height')::integer,0) <= 0
      or not row ?& array['photographId','textRevision','width','height'] then raise exception 'Invalid draft record'; end if;
    select * into existing from private.photograph_text_drafts where run_id = run and photograph_id = (row->>'photographId')::uuid;
    if found then
      if existing.source is distinct from row or existing.original_fields is distinct from row->'fields' then
        raise exception 'An imported original cannot be replaced'; end if;
    else
      insert into private.photograph_text_drafts (run_id,photograph_id,source,config,original_fields,fields,baseline_revision)
      values (run,(row->>'photographId')::uuid,row,v_config,row->'fields',row->'fields',(row->>'textRevision')::integer);
      imported := imported + 1;
    end if;
  end loop;
  return imported;
end $$;

create function public.list_photograph_text_drafts(p_run_id uuid default null,p_photograph_id uuid default null,
  p_offset integer default 0,p_filter text default 'all') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.require_photograph_text_admin();
  if p_offset < 0 or p_filter not in ('all','pending','manual','conflict') then raise exception 'Invalid draft filter'; end if;
  with rows as (
    select d.created_at,jsonb_build_object('id',d.id,'runId',d.run_id,'photographId',d.photograph_id,
      'filename',d.source->>'filename','storagePath',d.source->>'storagePath','fields',d.fields,
      'originalFields',d.original_fields,'version',d.version,'baselineRevision',d.baseline_revision,
      'currentRevision',coalesce(p.text_revision,-1),'sources',coalesce(s.sources,'{}'),
      'notesResolved',d.notes_resolved,'status',case
        when p.id is null or p.storage_path <> d.source->>'storagePath'
          or p.image_width <> (d.source->>'width')::integer or p.image_height <> (d.source->>'height')::integer
          or p.text_revision <> coalesce(d.applied_revision,d.baseline_revision) then 'conflict'
        when d.applied_fields @> array['title','description','alt_text'] then 'applied'
        when s.sources->>'title' = 'manual' and s.sources->>'description' = 'manual' and s.sources->>'alt_text' = 'manual' then 'protected'
        else 'pending' end) item
    from private.photograph_text_drafts d left join public.photographs p on p.id = d.photograph_id
    left join private.photograph_text_state s on s.photograph_id = p.id
    where (p_run_id is null or d.run_id = p_run_id) and (p_photograph_id is null or d.photograph_id = p_photograph_id)
  ), filtered as (
    select * from rows where p_filter = 'all' or (p_filter = 'pending' and item->>'status' = 'pending')
      or (p_filter = 'conflict' and item->>'status' = 'conflict')
      or (p_filter = 'manual' and (item->'sources') @> '{"title":"manual"}')
      or (p_filter = 'manual' and (item->'sources') @> '{"description":"manual"}')
      or (p_filter = 'manual' and (item->'sources') @> '{"alt_text":"manual"}')
  ) select jsonb_build_object('total',(select count(*) from filtered),'drafts',coalesce((
    select jsonb_agg(item) from (select item from filtered order by created_at desc,item->>'id' limit 50 offset p_offset) page
  ),'[]')) into result;
  return result;
end $$;

create function public.save_photograph_text_draft(p_id uuid,p_version integer,p_fields jsonb,p_notes_resolved boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_photograph_text_admin();
  if not coalesce(private.valid_photograph_text_fields(p_fields),false) or p_notes_resolved is null then raise exception 'Invalid draft text'; end if;
  update private.photograph_text_drafts set fields = p_fields,notes_resolved = p_notes_resolved,
    version = version + 1,applied_fields = '{}',updated_at = now() where id = p_id and version = p_version;
  if not found then raise exception 'The draft changed. Reload before saving.' using errcode = '40001'; end if;
end $$;

create function public.preview_photograph_text_batch(p_run_id uuid,p_fields text[],p_draft_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare draft private.photograph_text_drafts%rowtype; photo public.photographs%rowtype; sources jsonb;
  field text; eligible text[]; protected text[]; before_values jsonb; after_values jsonb; status text;
  items jsonb := '[]'; item jsonb; approval private.photograph_text_approvals%rowtype;
begin
  perform private.require_photograph_text_admin();
  if coalesce(cardinality(p_fields),0) not between 1 and 3 or not p_fields <@ array['title','description','alt_text']::text[]
    or (p_draft_ids is not null and cardinality(p_draft_ids) > 1000) then raise exception 'Select valid text fields'; end if;
  for draft in select * from private.photograph_text_drafts where run_id = p_run_id
    and (p_draft_ids is null or id = any(p_draft_ids)) order by photograph_id limit 1001 loop
    if jsonb_array_length(items) >= 1000 then raise exception 'Preview at most 1000 photographs'; end if;
    select * into photo from public.photographs where id = draft.photograph_id;
    select s.sources into sources from private.photograph_text_state s where photograph_id = draft.photograph_id;
    eligible := '{}'; protected := '{}';
    foreach field in array p_fields loop
      if sources->>field = 'manual' then protected := array_append(protected,field);
      elsif not field = any(draft.applied_fields) then eligible := array_append(eligible,field); end if;
    end loop;
    before_values := jsonb_build_object('title',photo.title,'description',photo.description,'alt_text',photo.alt_text);
    after_values := before_values;
    foreach field in array eligible loop
      after_values := jsonb_set(after_values,array[field],draft.fields->(case field when 'alt_text' then 'altText' else field end));
    end loop;
    status := case when photo.id is null or photo.text_revision <> coalesce(draft.applied_revision,draft.baseline_revision)
      or photo.storage_path <> draft.source->>'storagePath' or photo.filename <> draft.source->>'filename'
      or photo.image_width <> (draft.source->>'width')::integer or photo.image_height <> (draft.source->>'height')::integer then 'conflict'
      when cardinality(eligible) = 0 and cardinality(protected) > 0 then 'protected'
      when cardinality(eligible) = 0 then 'applied' else 'ready' end;
    item := jsonb_build_object('draftId',draft.id,'photographId',draft.photograph_id,'filename',draft.source->>'filename',
      'version',draft.version,'hash',md5(draft.fields::text),'notesResolved',draft.notes_resolved,
      'revision',photo.text_revision,'status',status,'eligibleFields',eligible,'protectedFields',protected,
      'before',before_values,'after',after_values);
    items := items || jsonb_build_array(item);
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'No drafts match this run/selection'; end if;
  insert into private.photograph_text_approvals(actor,run_id,items) values(auth.uid(),p_run_id,items) returning * into approval;
  return jsonb_build_object('token',approval.token,'runId',p_run_id,'rows',items,'expiresAt',approval.expires_at);
end $$;

create function public.get_photograph_text_batch(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare approval private.photograph_text_approvals%rowtype;
begin
  perform private.require_photograph_text_admin();
  select * into approval from private.photograph_text_approvals where token = p_token and actor = auth.uid();
  if not found then raise exception 'Batch not found'; end if;
  return jsonb_build_object('preview',jsonb_build_object('token',approval.token,'runId',approval.run_id,
    'rows',approval.items,'expiresAt',approval.expires_at),'results',approval.results,
    'done',approval.cancelled or approval.cursor >= jsonb_array_length(approval.items));
end $$;

create function public.apply_photograph_text_batch(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare approval private.photograph_text_approvals%rowtype; draft private.photograph_text_drafts%rowtype;
  photo public.photographs%rowtype; item jsonb; sources jsonb; new_sources jsonb; vals jsonb; field text; key text;
  v_fields text[]; status text; chunk jsonb := '[]'; result jsonb; finish integer;
begin
  perform private.require_photograph_text_admin();
  select * into approval from private.photograph_text_approvals where token = p_token and actor = auth.uid() for update;
  if not found or approval.expires_at < now() then raise exception 'The preview expired. Preview the batch again.'; end if;
  if approval.cancelled then return jsonb_build_object('results',approval.results,'done',true); end if;
  finish := least(approval.cursor + 20,jsonb_array_length(approval.items));
  for item in select value from jsonb_array_elements(approval.items) with ordinality x(value,n)
    where n > approval.cursor and n <= finish order by n loop
    v_fields := '{}'; status := item->>'status';
    if status = 'ready' then
      -- All live-write paths lock the photograph before its draft/state.
      select * into photo from public.photographs where id = (item->>'photographId')::uuid for update;
      select * into draft from private.photograph_text_drafts where id = (item->>'draftId')::uuid for update;
      select s.sources into sources from private.photograph_text_state s where photograph_id = photo.id for update;
      if photo.id is null or draft.id is null or draft.version <> (item->>'version')::integer
        or md5(draft.fields::text) <> item->>'hash' or draft.notes_resolved is distinct from (item->>'notesResolved')::boolean
        or photo.text_revision <> (item->>'revision')::integer or photo.storage_path <> draft.source->>'storagePath'
        or photo.filename <> draft.source->>'filename' or photo.image_width <> (draft.source->>'width')::integer
        or photo.image_height <> (draft.source->>'height')::integer then status := 'conflict';
      else
        vals := jsonb_build_object('title',photo.title,'description',photo.description,'alt_text',photo.alt_text);
        new_sources := sources;
        for field in select jsonb_array_elements_text(item->'eligibleFields') loop
          if sources->>field <> 'manual' and not field = any(draft.applied_fields) then
            key := case field when 'alt_text' then 'altText' else field end;
            v_fields := array_append(v_fields,field);
            vals := jsonb_set(vals,array[field],draft.fields->key);
            new_sources := jsonb_set(new_sources,array[field],to_jsonb(case when draft.fields->key = draft.original_fields->key then 'ai'::text else 'manual'::text end));
            insert into private.photograph_text_applications(token,draft_id,draft_version,photograph_id,field,
              before_value,before_source,after_value,after_source,applied_revision)
            values(p_token,draft.id,draft.version,photo.id,field,to_jsonb(photo)->>field,sources->>field,
              vals->>field,new_sources->>field,photo.text_revision+1);
          end if;
        end loop;
        if cardinality(v_fields) > 0 then
          update public.photographs set title = vals->>'title',description = vals->>'description',alt_text = vals->>'alt_text',
            text_revision = photo.text_revision+1 where id = photo.id returning * into photo;
          update private.photograph_text_state set sources = new_sources where photograph_id = photo.id;
          update private.photograph_text_drafts set applied_revision = photo.text_revision,
            applied_fields = applied_fields || v_fields where id = draft.id;
          status := 'applied';
        else status := 'protected'; end if;
      end if;
    end if;
    result := jsonb_build_object('draftId',item->>'draftId','filename',item->>'filename','status',status,'fields',v_fields);
    chunk := chunk || jsonb_build_array(result);
  end loop;
  update private.photograph_text_approvals set cursor = finish,results = results || chunk where token = p_token;
  -- Return cumulative persisted results: a retry after a committed/lost HTTP
  -- response reconciles the earlier chunk instead of losing its audit outcome.
  return jsonb_build_object('results',approval.results || chunk,'done',finish >= jsonb_array_length(approval.items));
end $$;

create function public.accept_photograph_text_field(p_id uuid,p_version integer,p_field text,p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare photo public.photographs%rowtype; draft private.photograph_text_drafts%rowtype; photo_id uuid; values jsonb;
begin
  perform private.require_photograph_text_admin();
  if p_field not in ('title','description','alt_text') then raise exception 'Invalid text field'; end if;
  select photograph_id into photo_id from private.photograph_text_drafts where id = p_id;
  select * into photo from public.photographs where id = photo_id for update;
  if not found or photo.text_revision is distinct from p_revision then raise exception 'The photograph changed. Reload before applying.' using errcode = '40001'; end if;
  select * into draft from private.photograph_text_drafts where id = p_id for update;
  if draft.version is distinct from p_version or draft.source->>'storagePath' <> photo.storage_path
    or (draft.source->>'width')::integer <> photo.image_width or (draft.source->>'height')::integer <> photo.image_height then
    raise exception 'The draft or image changed. Reload before applying.' using errcode = '40001'; end if;
  values := jsonb_build_object('title',photo.title,'description',photo.description,'alt_text',photo.alt_text,
    'caption_mode',photo.caption_mode,'custom_caption',photo.custom_caption,'captured_at',photo.captured_at,'sort_order',photo.sort_order);
  values := jsonb_set(values,array[p_field],draft.original_fields->(case p_field when 'alt_text' then 'altText' else p_field end));
  return public.save_photograph_text(photo.id,p_revision,values,p_id,p_version,array[p_field]);
end $$;

create function public.rollback_photograph_text_batch(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare photo_id uuid; photo public.photographs%rowtype; entry private.photograph_text_applications%rowtype;
  v_sources jsonb; vals jsonb; fields text[]; ids uuid[]; results jsonb := '[]'; approval private.photograph_text_approvals%rowtype;
  item jsonb; recovered jsonb; reconciled jsonb := '[]';
begin
  perform private.require_photograph_text_admin();
  select * into approval from private.photograph_text_approvals where token = p_token and actor = auth.uid() for update;
  if not found then raise exception 'Batch not found'; end if;
  for photo_id in select distinct photograph_id from private.photograph_text_applications where token = p_token and not rolled_back order by photograph_id loop
    select * into photo from public.photographs where id = photo_id for update;
    select s.sources into v_sources from private.photograph_text_state s where photograph_id = photo_id for update;
    vals := jsonb_build_object('title',photo.title,'description',photo.description,'alt_text',photo.alt_text);
    fields := '{}'; ids := '{}';
    for entry in select * from private.photograph_text_applications where token = p_token and photograph_id = photo_id and not rolled_back loop
      if photo.text_revision = entry.applied_revision and vals->>entry.field is not distinct from entry.after_value
        and v_sources->>entry.field = entry.after_source then
        vals := jsonb_set(vals,array[entry.field],coalesce(to_jsonb(entry.before_value),'null'));
        v_sources := jsonb_set(v_sources,array[entry.field],to_jsonb(entry.before_source));
        fields := array_append(fields,entry.field); ids := array_append(ids,entry.id);
      end if;
    end loop;
    if cardinality(fields) > 0 then
      update public.photographs set title = vals->>'title',description = vals->>'description',alt_text = vals->>'alt_text',
        text_revision = photo.text_revision+1 where id = photo_id;
      update private.photograph_text_state set sources = v_sources where photograph_id = photo_id;
      update private.photograph_text_applications set rolled_back = true where id = any(ids);
    end if;
    results := results || jsonb_build_array(jsonb_build_object('draftId',entry.draft_id,'filename',photo.filename,
      'status',case when cardinality(fields)>0 then 'restored' else 'skipped_newer_edit' end,'fields',fields));
  end loop;
  -- Rolling back an interrupted batch also cancels its unprocessed tail. A
  -- retained token must never reapply that tail after the owner's rollback.
  for item in select value from jsonb_array_elements(approval.items) loop
    select value into recovered from jsonb_array_elements(results) where value->>'draftId' = item->>'draftId';
    if recovered is null then
      select value into recovered from jsonb_array_elements(approval.results) where value->>'draftId' = item->>'draftId';
    end if;
    reconciled := reconciled || jsonb_build_array(coalesce(recovered,jsonb_build_object(
      'draftId',item->>'draftId','filename',item->>'filename','status','cancelled_by_rollback','fields','[]'::jsonb)));
  end loop;
  update private.photograph_text_approvals set cancelled = true,cursor = jsonb_array_length(items),results = reconciled where token = p_token;
  return jsonb_build_object('results',reconciled);
end $$;

-- Every exposed entry point is admin-checked; no private table/schema grants.
revoke all on function public.photograph_text_states(), public.photograph_text_snapshot(),
  public.save_photograph_text(uuid,integer,jsonb,uuid,integer,text[]), public.import_photograph_text_drafts(jsonb),
  public.list_photograph_text_drafts(uuid,uuid,integer,text), public.save_photograph_text_draft(uuid,integer,jsonb,boolean),
  public.preview_photograph_text_batch(uuid,text[],uuid[]), public.apply_photograph_text_batch(uuid),
  public.rollback_photograph_text_batch(uuid), public.get_photograph_text_batch(uuid),
  public.accept_photograph_text_field(uuid,integer,text,integer) from public, anon, authenticated;
grant execute on function public.photograph_text_states(), public.photograph_text_snapshot(),
  public.save_photograph_text(uuid,integer,jsonb,uuid,integer,text[]), public.import_photograph_text_drafts(jsonb),
  public.list_photograph_text_drafts(uuid,uuid,integer,text), public.save_photograph_text_draft(uuid,integer,jsonb,boolean),
  public.preview_photograph_text_batch(uuid,text[],uuid[]), public.apply_photograph_text_batch(uuid),
  public.rollback_photograph_text_batch(uuid), public.get_photograph_text_batch(uuid),
  public.accept_photograph_text_field(uuid,integer,text,integer) to authenticated;
