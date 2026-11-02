-- ISOLATED ONLY: run after photograph-text-bootstrap.sql, the applied text
-- migration, photograph_auto_text.sql and description_generated_alt.sql.
-- No Supabase/network credentials.
\set ON_ERROR_STOP on
create function public.auto_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is distinct from true then raise exception 'FAILED: %',message; end if; end $$;
create function public.auto_photo(name text) returns uuid language plpgsql as $$
declare photo uuid;
begin
  insert into public.photographs(storage_path,filename,image_width,image_height)
    values('uploads/'||name||'.jpg',name||'.jpg',640,480) returning id into photo;
  return photo;
end $$;
create function public.auto_result() returns jsonb language sql as $$
  select jsonb_build_object('outcome','completed','responseId','resp_test','model','gpt-6.1-sol',
    'inputTokens',100,'outputTokens',100,'previewSha256',repeat('a',64),'configHash',repeat('b',64),
    'promptVersion',repeat('c',64),'fields',jsonb_build_object('title','Birds above waves',
      'description','Birds cross a pale sky.','altText','Bird silhouettes above waves.',
      'filenameSuggestion','birds-above-waves.jpg','uncertainties','[]'::jsonb))
$$;
select public.auto_assert((select count(*) = 0 from private.photograph_auto_text_jobs),'no seed/backfill jobs');
select public.auto_assert((select not enabled and worker_secret_hash is null from private.photograph_auto_text_settings),'disabled/unconfigured by default');
select public.auto_assert((select description_alt_enabled and description_alt_revision = 0
  from private.photograph_auto_text_settings),'whole-archive description alt is enabled by default');
-- Explicitly turn off the new mode for the legacy upload-compatibility suite.
-- The following alt suite exercises switching it back on through the admin RPC.
update private.photograph_auto_text_settings set description_alt_enabled = false;
set role anon;
do $$ begin
  begin perform public.claim_photograph_auto_text(null); raise exception 'null secret accepted'; exception when insufficient_privilege then null; end;
  begin perform public.claim_photograph_auto_text(''); raise exception 'empty secret accepted'; exception when insufficient_privilege then null; end;
  begin perform public.claim_photograph_auto_text(repeat('w',32)); raise exception 'unconfigured secret accepted'; exception when insufficient_privilege then null; end;
  begin perform * from private.photograph_auto_text_settings; raise exception 'private read accepted'; exception when insufficient_privilege then null; end;
  begin perform public.photograph_auto_text_status(); raise exception 'anonymous admin accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.photograph_auto_text_settings set worker_secret_hash = encode(sha256(convert_to(repeat('w',32),'UTF8')),'hex');
select public.auto_photo('paused');
set role anon;
select public.auto_assert(public.claim_photograph_auto_text(repeat('w',32)) is null,'disabled queue pauses');
do $$ begin
  begin perform public.claim_photograph_auto_text(repeat('x',32)); raise exception 'wrong secret accepted'; exception when insufficient_privilege then null; end;
  begin perform public.reserve_photograph_auto_text(null,null,null,100); raise exception 'null reserve secret'; exception when insufficient_privilege then null; end;
  begin perform public.finish_photograph_auto_text(null,null,null,null,'{}'); raise exception 'null finish secret'; exception when insufficient_privilege then null; end;
  begin perform public.fail_photograph_auto_text(null,null,null,'preview_unavailable'); raise exception 'null failure secret'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.photograph_auto_text_settings set enabled = true;
select public.auto_assert((select count(*) = 1 from private.photograph_auto_text_jobs),'inserts queue while disabled');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$ begin
  begin perform public.photograph_auto_text_status(); raise exception 'nonadmin status accepted'; exception when insufficient_privilege then null; end;
  begin perform public.retry_photograph_auto_text(null); raise exception 'nonadmin retry accepted'; exception when insufficient_privilege then null; end;
  begin perform * from private.photograph_auto_text_jobs; raise exception 'authenticated private read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare name text; begin
  foreach name in array array['settings','months','jobs','attempts'] loop
    perform public.auto_assert(not has_table_privilege('anon','private.photograph_auto_text_'||name,'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated','private.photograph_auto_text_'||name,'SELECT,INSERT,UPDATE,DELETE'),'no direct grants: '||name);
  end loop;
end $$;

-- Claim exclusivity, persisted image snapshot, unreserved lease reclamation,
-- protected/skipped photos, and a maximum of three delayed preflight failures.
do $$ declare p uuid := public.auto_photo('preflight'); c jsonb; d jsonb; n integer;
begin
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  perform public.auto_assert(c->>'filename' = 'preflight.jpg' and c->>'width' = '640' and c->>'textRevision' = '0','claim contract');
  perform public.auto_assert(public.claim_photograph_auto_text(repeat('w',32),p) is null,'active lease exclusive');
  begin perform public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,null,100); raise exception 'null lease accepted'; exception when raise_exception then
    if sqlerrm = 'null lease accepted' then raise; end if; end;
  update private.photograph_auto_text_jobs set lease_expires_at = now() - interval '1 minute' where photograph_id = p;
  d := public.claim_photograph_auto_text(repeat('w',32),p);
  perform public.auto_assert(d->>'leaseId' <> c->>'leaseId','unreserved expired lease reclaims');
  for n in 1..3 loop
    perform public.fail_photograph_auto_text(repeat('w',32),(d->>'jobId')::uuid,(d->>'leaseId')::uuid,'preview_unavailable');
    perform public.fail_photograph_auto_text(repeat('w',32),(d->>'jobId')::uuid,(d->>'leaseId')::uuid,'preview_unavailable');
    perform public.auto_assert((select preflight_failures = n and next_attempt_at >= now() + interval '14 minutes'
      from private.photograph_auto_text_jobs where photograph_id = p),'preflight idempotent/delayed');
    perform public.auto_assert(public.claim_photograph_auto_text(repeat('w',32),p) is null,'no immediate automatic retry');
    update private.photograph_auto_text_jobs set next_attempt_at = now() - interval '1 second' where photograph_id = p;
    d := public.claim_photograph_auto_text(repeat('w',32),p);
  end loop;
  perform public.auto_assert(d is null,'three preflight failures stop');
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  perform public.auto_assert(public.retry_photograph_auto_text((c->>'jobId')::uuid) = p,'operator can retry preflight');
  p := public.auto_photo('all-manual');
  update public.photographs set title = 'Owner title',description = 'Owner description',alt_text = 'Owner alt' where id = p;
  perform public.auto_assert(public.claim_photograph_auto_text(repeat('w',32),p) is null,'all protected skipped');
  perform public.auto_assert((select status = 'skipped' and attempts = 0 from private.photograph_auto_text_jobs where photograph_id = p),'skip costs nothing');
end $$;

-- Live completion only fills still-empty unset fields. Edits and captions made
-- AFTER claim are retained, including hidden/custom caption presentation.
do $$ declare p uuid; c jsonb; r jsonb; result jsonb; mode text; cost bigint;
begin
  foreach mode in array array['hidden','custom'] loop
    p := public.auto_photo('caption-'||mode);
    c := public.claim_photograph_auto_text(repeat('w',32),p);
    r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
    perform public.auto_assert(public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000) = r,'reservation idempotent');
    update public.photographs set title = 'Owner during generation',caption_mode = mode,custom_caption = 'Keep my caption' where id = p;
    result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.auto_result());
    perform public.auto_assert(result->>'applied' = 'true','eligible description/alt applied');
    perform public.auto_assert((select title = 'Owner during generation' and description = 'Birds cross a pale sky.'
      and alt_text = 'Bird silhouettes above waves.' and caption_mode = mode and custom_caption = 'Keep my caption'
      from public.photographs where id = p),'newer owner text/caption preserved');
    perform public.auto_assert((select sources = '{"title":"manual","description":"ai","alt_text":"ai"}'
      from private.photograph_text_state where photograph_id = p),'AI sources only eligible fields');
    select used_micros into cost from private.photograph_auto_text_months;
    update private.photograph_auto_text_jobs set lease_expires_at = now() - interval '1 day' where photograph_id = p;
    perform public.auto_assert(public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.auto_result()) = result,'finish idempotent after expiry');
    perform public.auto_assert((select used_micros = cost from private.photograph_auto_text_months),'no duplicate accounting');
    begin
      perform public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.auto_result()||'{"outputTokens":101}');
      raise exception 'conflicting finish accepted';
    exception when raise_exception then if sqlerrm = 'conflicting finish accepted' then raise; end if; end;
  end loop;
end $$;

-- Only explicitly touched empty->empty fields are protected. Unchanged siblings,
-- older full-form callers, and legacy date-only writes retain ownership.
do $$ declare p uuid := public.auto_photo('intentional-clear'); c jsonb; r jsonb; result jsonb;
begin
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
  perform public.save_photograph_text(p,0,'{"title":null,"description":null,"alt_text":null,"caption_mode":"hidden","custom_caption":"Owner caption","captured_at":null,"sort_order":null,"manual_fields":["title"]}');
  perform public.auto_assert((select sources = '{"title":"manual","description":"unset","alt_text":"unset"}'
    from private.photograph_text_state where photograph_id = p),'only explicitly touched blank becomes manual');
  result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.auto_result());
  perform public.auto_assert(result->>'applied' = 'true','unchanged siblings remain eligible');
  perform public.auto_assert((select title is null and description is not null and alt_text is not null and caption_mode = 'hidden' and custom_caption = 'Owner caption'
    from public.photographs where id = p),'clear and caption protected');
  p := public.auto_photo('older-save');
  perform public.save_photograph_text(p,0,'{"title":null,"description":null,"alt_text":null,"caption_mode":"description","custom_caption":null,"captured_at":null,"sort_order":null}');
  perform public.auto_assert((select sources = '{"title":"unset","description":"unset","alt_text":"unset"}'
    from private.photograph_text_state where photograph_id = p),'older callers leave unchanged blanks unset');
  -- Invalid touch lists cannot silently protect/overwrite unexpected fields.
  begin
    perform public.save_photograph_text(p,1,'{"title":null,"description":null,"alt_text":null,"caption_mode":"description","custom_caption":null,"captured_at":null,"sort_order":null,"manual_fields":["title","title"]}');
    raise exception 'duplicate manual fields accepted';
  exception when raise_exception then if sqlerrm = 'duplicate manual fields accepted' then raise; end if; end;
  begin
    perform public.save_photograph_text(p,1,'{"title":null,"description":null,"alt_text":null,"caption_mode":"description","custom_caption":null,"captured_at":null,"sort_order":null,"manual_fields":[null]}');
    raise exception 'null manual field accepted';
  exception when raise_exception then if sqlerrm = 'null manual field accepted' then raise; end if; end;
  begin
    perform public.save_photograph_text(p,1,'{"title":null,"description":null,"alt_text":null,"caption_mode":"description","custom_caption":null,"captured_at":null,"sort_order":null,"manual_fields":["title"]}',null,null,array['title']);
    raise exception 'manual AI overlap accepted';
  exception when raise_exception then if sqlerrm = 'manual AI overlap accepted' then raise; end if; end;
  p := public.auto_photo('legacy-date');
  update public.photographs set captured_at = '2020-01-01' where id = p;
  perform public.auto_assert((select sources = '{"title":"unset","description":"unset","alt_text":"unset"}' from private.photograph_text_state where photograph_id = p),'legacy unrelated update preserves unset');
end $$;

-- Automatic provider shape limits are narrower than the editable draft limits.
do $$ declare p uuid := public.auto_photo('bounded-result'); c jsonb; r jsonb; payload jsonb; field text;
begin
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
  foreach field in array array['title','description','altText','uncertainties'] loop
    payload := public.auto_result();
    payload := jsonb_set(payload,array['fields',field],case when field = 'uncertainties' then '["One","Two","Three"]'::jsonb
      else to_jsonb(repeat('x',case field when 'title' then 81 when 'description' then 241 else 181 end)) end);
    begin
      perform public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,payload);
      raise exception 'unbounded automatic text accepted';
    exception when raise_exception then if sqlerrm = 'unbounded automatic text accepted' then raise; end if; end;
  end loop;
  perform public.auto_assert((select result is null and charged_micros is null from private.photograph_auto_text_attempts
    where id = (r->>'attemptId')::uuid),'rejected result cannot settle reservation');
  perform public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.auto_result());
end $$;

-- Review drafts use the existing UI contract. Image identity mismatches also
-- produce a review draft, never an automatic live write.
do $$ declare p uuid; c jsonb; r jsonb; result jsonb; payload jsonb; scenario text; listing jsonb;
begin
  foreach scenario in array array['uncertainties','image-mismatch'] loop
    p := public.auto_photo(scenario); c := public.claim_photograph_auto_text(repeat('w',32),p);
    r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
    payload := public.auto_result();
    if scenario = 'uncertainties' then payload := jsonb_set(payload,'{fields,uncertainties}','["Location is unknown."]');
    else update public.photographs set image_width = 641,filename = 'changed-image.jpg' where id = p; end if;
    result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,payload);
    perform public.auto_assert(result->>'status' = 'review' and result->>'applied' = 'false','review no live apply');
    perform public.auto_assert((select title is null from public.photographs where id = p),'review leaves live fields blank');
    listing := public.list_photograph_text_drafts((c->>'jobId')::uuid,p);
    perform public.auto_assert(listing->>'total' = '1' and listing->'drafts'->0->'originalFields' = payload->'fields','review compatible with list/edit UI');
    perform public.save_photograph_text_draft((listing->'drafts'->0->>'id')::uuid,1,payload->'fields',true);
    begin perform public.retry_photograph_auto_text((c->>'jobId')::uuid); raise exception 'review rerun accepted';
    exception when raise_exception then if sqlerrm = 'review rerun accepted' then raise; end if; end;
  end loop;
end $$;

-- Known failures settle actual usage and permit at most two explicit paid attempts.
-- Missing/invalid usage, explicit uncertainty, and expired paid leases keep holds.
do $$ declare p uuid; c jsonb; r jsonb; result jsonb; scenario text; n integer; payload jsonb;
begin
  p := public.auto_photo('known-failure');
  for n in 1..2 loop
    c := public.claim_photograph_auto_text(repeat('w',32),p);
    r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
    result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,
      (public.auto_result()-'fields')||'{"outcome":"failed","errorCode":"refused"}');
    perform public.auto_assert(result->>'status' = 'failed','known failure settles');
    perform public.auto_assert((select charged_micros = 1250 from private.photograph_auto_text_attempts where id = (r->>'attemptId')::uuid),'ceil micro-dollar accounting');
    if n = 1 then
      update private.photograph_auto_text_jobs set next_attempt_at = now() - interval '1 second' where photograph_id = p;
      perform public.auto_assert(public.claim_photograph_auto_text(repeat('w',32),p) is null,'known paid failure needs explicit retry');
      perform public.retry_photograph_auto_text((c->>'jobId')::uuid);
    end if;
  end loop;
  begin perform public.retry_photograph_auto_text((c->>'jobId')::uuid); raise exception 'third paid attempt allowed';
  exception when raise_exception then if sqlerrm = 'third paid attempt allowed' then raise; end if; end;
  foreach scenario in array array['missing-usage','excess-input','excess-output','wrong-model','null-response','explicit-uncertain','expired-paid','reserved-failure'] loop
    p := public.auto_photo(scenario); c := public.claim_photograph_auto_text(repeat('w',32),p);
    r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
    payload := public.auto_result();
    case scenario
      when 'missing-usage' then payload := payload - 'inputTokens';
      when 'excess-input' then payload := payload || '{"inputTokens":1001}';
      when 'excess-output' then payload := payload || '{"outputTokens":4097}';
      when 'wrong-model' then payload := payload || '{"model":"gpt-4.1"}';
      when 'null-response' then payload := payload || '{"responseId":null}';
      when 'explicit-uncertain' then payload := payload || '{"outcome":"uncertain"}';
      else null;
    end case;
    if scenario = 'expired-paid' then
      update private.photograph_auto_text_jobs set lease_expires_at = now() - interval '1 minute' where photograph_id = p;
      perform public.auto_assert(public.claim_photograph_auto_text(repeat('w',32),p) is null,'expired paid request cannot reclaim');
    elsif scenario = 'reserved-failure' then
      perform public.fail_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,'preview_unavailable');
    else
      result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,payload);
      perform public.auto_assert(result->>'status' = 'uncertain','invalid usage uncertain: '||scenario);
    end if;
    perform public.auto_assert((select charged_micros is null from private.photograph_auto_text_attempts where id = (r->>'attemptId')::uuid),'uncertain reserve retained: '||scenario);
    perform public.auto_assert((select status = 'uncertain' from private.photograph_auto_text_jobs where photograph_id = p),'uncertain terminal: '||scenario);
    begin perform public.retry_photograph_auto_text((c->>'jobId')::uuid); raise exception 'uncertain retry accepted';
    exception when raise_exception then if sqlerrm = 'uncertain retry accepted' then raise; end if; end;
  end loop;
end $$;

-- Simulate a reservation immediately before UTC rollover by relocating just its
-- immutable accounting month in the isolated fixture. Finish must debit that
-- original month, never a new current-month counter.
do $$ declare p uuid := public.auto_photo('month-split'); c jsonb; r jsonb; old_month date;
  current_month date := date_trunc('month',now() at time zone 'UTC')::date; held bigint; current_used bigint;
begin
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1001);
  select reserved_micros into held from private.photograph_auto_text_attempts where id = (r->>'attemptId')::uuid;
  perform public.auto_assert(held = 43463,'reservation rounds fractional micro-dollar up');
  old_month := (current_month - interval '1 month')::date;
  insert into private.photograph_auto_text_months(month,reserved_micros) values(old_month,held);
  update private.photograph_auto_text_months set reserved_micros = reserved_micros - held where month = current_month;
  update private.photograph_auto_text_attempts set month = old_month where id = (r->>'attemptId')::uuid;
  select used_micros into current_used from private.photograph_auto_text_months where month = current_month;
  perform public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.auto_result());
  perform public.auto_assert((select reserved_micros = 0 and used_micros = 1250 from private.photograph_auto_text_months where month = old_month),'frozen month settled');
  perform public.auto_assert((select used_micros = current_used from private.photograph_auto_text_months where month = current_month),'new month untouched');
end $$;

-- Real independent sessions prove SKIP LOCKED and serialization at the cap.
-- dblink exists only in this disposable database; migration does not need it.
create extension dblink;
select dblink_connect('auto_one','host=127.0.0.1 dbname=postgres user=postgres');
select dblink_connect('auto_two','host=127.0.0.1 dbname=postgres user=postgres');
-- A truly concurrent caption edit holds the photograph lock while finish waits.
-- A partial manual clear and a nonempty AI-owned title must also survive.
select set_config('test.race_photo',public.auto_photo('caption-race')::text,false);
update public.photographs set title = 'Existing AI title',alt_text = 'Previously written alt'
  where id = current_setting('test.race_photo')::uuid;
update public.photographs set alt_text = null where id = current_setting('test.race_photo')::uuid;
update private.photograph_text_state set sources = jsonb_set(sources,'{title}','"ai"')
  where photograph_id = current_setting('test.race_photo')::uuid;
select set_config('test.race_claim',public.claim_photograph_auto_text(repeat('w',32),current_setting('test.race_photo')::uuid)::text,false);
select set_config('test.race_reserve',public.reserve_photograph_auto_text(repeat('w',32),
  (current_setting('test.race_claim')::jsonb->>'jobId')::uuid,
  (current_setting('test.race_claim')::jsonb->>'leaseId')::uuid,1000)::text,false);
select dblink_exec('auto_one','begin');
select dblink_exec('auto_one',format('update public.photographs set caption_mode = %L,custom_caption = %L where id = %L::uuid',
  'custom','Simultaneous owner caption',current_setting('test.race_photo')));
select dblink_send_query('auto_two',format('select public.finish_photograph_auto_text(%L,%L::uuid,%L::uuid,%L::uuid,%L::jsonb)',
  repeat('w',32),current_setting('test.race_claim')::jsonb->>'jobId',current_setting('test.race_claim')::jsonb->>'leaseId',
  current_setting('test.race_reserve')::jsonb->>'attemptId',public.auto_result()));
select pg_sleep(0.1);
select public.auto_assert(dblink_is_busy('auto_two') = 1,'finish waits on concurrent photo edit');
select dblink_exec('auto_one','commit');
select public.auto_assert(result->>'applied' = 'true','concurrent finish applies eligible description')
  from dblink_get_result('auto_two') as t(result jsonb);
-- Drain libpq's trailing empty result before reusing this connection.
select * from dblink_get_result('auto_two') as t(result jsonb);
select public.auto_assert((select caption_mode = 'custom' and custom_caption = 'Simultaneous owner caption'
  and title = 'Existing AI title' and alt_text is null and description = 'Birds cross a pale sky.'
  from public.photographs where id = current_setting('test.race_photo')::uuid),'concurrent caption, partial clear, and nonempty AI field preserved');
select public.auto_photo('concurrent-one');
select public.auto_photo('concurrent-two');
select dblink_exec('auto_one','begin');
select * from dblink('auto_one',$q$ select id::text from private.photograph_auto_text_jobs
  where photograph_id = (select id from public.photographs where filename = 'concurrent-one.jpg') for update $q$) as t(id text);
select public.auto_assert(public.claim_photograph_auto_text(repeat('w',32),(select id from public.photographs where filename = 'concurrent-one.jpg')) is null,'SKIP LOCKED excludes independently locked job');
select dblink_exec('auto_one','commit');
select set_config('test.c1',public.claim_photograph_auto_text(repeat('w',32),(select id from public.photographs where filename = 'concurrent-one.jpg'))::text,false);
select set_config('test.c2',public.claim_photograph_auto_text(repeat('w',32),(select id from public.photographs where filename = 'concurrent-two.jpg'))::text,false);
-- Leave exactly one 43,460-micro reservation available. Existing unknown holds
-- remain reserved; synthetic used spend simply fills the rest of the fixture.
update private.photograph_auto_text_months set used_micros = 5000000 - reserved_micros - 43460
  where month = date_trunc('month',now() at time zone 'UTC')::date;
select dblink_exec('auto_one','begin');
select * from dblink('auto_one',format('select public.reserve_photograph_auto_text(%L,%L::uuid,%L::uuid,1000)',
  repeat('w',32),current_setting('test.c1')::jsonb->>'jobId',current_setting('test.c1')::jsonb->>'leaseId')) as t(result jsonb);
select dblink_send_query('auto_two',format('select public.reserve_photograph_auto_text(%L,%L::uuid,%L::uuid,1000)',
  repeat('w',32),current_setting('test.c2')::jsonb->>'jobId',current_setting('test.c2')::jsonb->>'leaseId'));
select pg_sleep(0.1);
select public.auto_assert(dblink_is_busy('auto_two') = 1,'second reservation waits on monthly lock');
select dblink_exec('auto_one','commit');
select public.auto_assert(result->>'reserved' = 'false' and result->>'status' = 'budget_paused','concurrent cap cannot overspend')
  from dblink_get_result('auto_two') as t(result jsonb);
select public.auto_assert((select used_micros + reserved_micros = 5000000 from private.photograph_auto_text_months
  where month = date_trunc('month',now() at time zone 'UTC')::date),'hard atomic five-dollar cap');
select public.auto_assert(public.claim_photograph_auto_text(repeat('w',32),(current_setting('test.c2')::jsonb->>'photographId')::uuid) is null,'budget pause cannot reclaim this month');
select public.auto_assert((select next_attempt_at = ((date_trunc('month',now() at time zone 'UTC') + interval '1 month') at time zone 'UTC')
  from private.photograph_auto_text_jobs where id = (current_setting('test.c2')::jsonb->>'jobId')::uuid),'pause ends at next UTC month');
select public.auto_assert(public.photograph_auto_text_status()->>'budgetMicros' = '5000000'
  and public.photograph_auto_text_status()->>'committedMicros' = '5000000'
  and not public.photograph_auto_text_status() ? 'worker_secret_hash','admin status does not expose capability');
-- Simulate the paused deadline having elapsed and a fresh monthly allowance;
-- only the UTC-derived deadline controls rollover eligibility, not admin retry.
update private.photograph_auto_text_jobs set next_attempt_at = now() - interval '1 second'
  where id = (current_setting('test.c2')::jsonb->>'jobId')::uuid;
update private.photograph_auto_text_months set used_micros = 0
  where month = date_trunc('month',now() at time zone 'UTC')::date;
select set_config('test.rollover',public.claim_photograph_auto_text(repeat('w',32),
  (current_setting('test.c2')::jsonb->>'photographId')::uuid)::text,false);
select public.auto_assert(current_setting('test.rollover')::jsonb->>'leaseId' <> current_setting('test.c2')::jsonb->>'leaseId','elapsed budget pause gets a fresh lease');
select public.auto_assert(public.reserve_photograph_auto_text(repeat('w',32),
  (current_setting('test.rollover')::jsonb->>'jobId')::uuid,(current_setting('test.rollover')::jsonb->>'leaseId')::uuid,1000)->>'reserved' = 'true','rollover can reserve again');
select dblink_disconnect('auto_one');
select dblink_disconnect('auto_two');
select 'photograph-auto-text: all isolated assertions passed' as result;
