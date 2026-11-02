-- Disposable local fixture only. Never apply test helpers to Supabase.
\set ON_ERROR_STOP on
reset role;
select set_config('request.jwt.claim.sub','',false);
select public.auto_assert((select not description_alt_enabled and description_alt_revision = 0
  from private.photograph_auto_text_settings),'manual-mode compatibility fixture leaves revision unchanged');
select public.auto_assert(not exists(select 1 from private.photograph_auto_text_jobs where kind = 'description_alt'),'migration does not backfill');
select public.auto_assert(not has_function_privilege('authenticated','private.save_photograph_text(uuid,integer,jsonb,uuid,integer,text[])','execute')
  and not has_function_privilege('anon','private.reserve_photograph_auto_text(text,uuid,uuid,integer)','execute'),'base RPCs stay private');

create function public.alt_result() returns jsonb language sql as $$
  select (public.auto_result() - 'fields' - 'previewSha256') || '{"altText":"Meat Computer holds a microphone beneath orange stage lighting."}'::jsonb
$$;
create function public.alt_save(p_id uuid,p_title text,p_description text) returns jsonb language plpgsql as $$
declare photo public.photographs%rowtype;
begin
  select * into photo from public.photographs where id = p_id;
  return public.save_photograph_text(p_id,photo.text_revision,jsonb_build_object('title',p_title,'description',p_description,
    'alt_text','Stale client alt must be ignored','caption_mode',photo.caption_mode,'custom_caption',photo.custom_caption,
    'captured_at',photo.captured_at,'sort_order',photo.sort_order,'manual_fields',jsonb_build_array('title','description')));
end $$;
select set_config('test.alt_photo',public.auto_photo('description-derived')::text,false);
update public.photographs set title = 'Original title',description = 'Original description',alt_text = 'Previous manual alt'
  where id = current_setting('test.alt_photo')::uuid;

set role anon;
do $$ begin
  begin perform public.set_photograph_description_alt(true,0); raise exception 'anonymous setting accepted'; exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$ begin
  begin perform public.set_photograph_description_alt(true,0); raise exception 'nonadmin setting accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.set_photograph_description_alt(true,0);
select public.auto_assert(public.photograph_auto_text_status()->>'descriptionAltEnabled' = 'true','admin setting/status');
do $$ begin
  begin perform public.set_photograph_description_alt(false,0); raise exception 'stale setting accepted';
  exception when serialization_failure then null; end;
  begin update public.photographs set alt_text = 'Bypass' where id = current_setting('test.alt_photo')::uuid;
    raise exception 'direct alt update accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select public.auto_assert(not exists(select 1 from private.photograph_auto_text_jobs where kind = 'description_alt'),'enabling does not enqueue or rewrite archive');

-- The normal save ignores a stale alt field, retains caption metadata, and
-- transactionally queues exactly one source-bound alt job.
select public.auto_assert(public.alt_save(current_setting('test.alt_photo')::uuid,'Meat Computer performing',
  'Meat Computer holds a microphone beneath orange stage lighting.')->>'descriptionAltQueued' = 'true','changed text durably queues');
select public.auto_assert((select alt_text = 'Previous manual alt' and title = 'Meat Computer performing'
  from public.photographs where id = current_setting('test.alt_photo')::uuid),'previous alt retained while queued');
select public.auto_assert((select count(*) = 1 from private.photograph_auto_text_jobs
  where photograph_id = current_setting('test.alt_photo')::uuid and kind = 'description_alt'),'one job per source revision');
select public.auto_assert(public.alt_save(current_setting('test.alt_photo')::uuid,'Meat Computer performing',
  'Meat Computer holds a microphone beneath orange stage lighting.')->>'descriptionAltQueued' = 'false','unchanged saves do not spend');
select set_config('request.jwt.claim.sub','',false);
do $$ declare c jsonb; r jsonb; result jsonb; before_used bigint;
begin
  c := public.claim_photograph_auto_text(repeat('w',32),current_setting('test.alt_photo')::uuid);
  perform public.auto_assert(c->>'kind' = 'description_alt' and c->>'title' = 'Meat Computer performing'
    and c->>'description' like 'Meat Computer holds%','alt claim includes exact saved text');
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
  perform public.auto_assert(r->>'reserved' = 'true','alt uses existing shared reserve');
  select used_micros into before_used from private.photograph_auto_text_months where month = date_trunc('month',now() at time zone 'UTC')::date;
  result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.alt_result());
  perform public.auto_assert(result->>'applied' = 'true','alt result applied');
  perform public.auto_assert((select title = 'Meat Computer performing' and description like 'Meat Computer holds%'
    and alt_text = public.alt_result()->>'altText' from public.photographs where id = current_setting('test.alt_photo')::uuid),'only alt is rewritten');
  perform public.auto_assert((select sources->>'alt_text' = 'ai' and sources->>'title' = 'manual'
    from private.photograph_text_state where photograph_id = current_setting('test.alt_photo')::uuid),'generated alt ownership');
  perform public.auto_assert(public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.alt_result()) = result,'alt completion replay is idempotent');
  perform public.auto_assert((select used_micros = before_used + 1250 from private.photograph_auto_text_months
    where month = date_trunc('month',now() at time zone 'UTC')::date),'alt charges once');
end $$;

-- Edits during generation settle known usage but cannot apply stale text. A
-- later job remains independent of the upload job and earlier paid attempts.
do $$ declare p uuid := current_setting('test.alt_photo')::uuid; c jsonb; r jsonb; result jsonb;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  perform public.alt_save(p,'Changed title','A performer under blue lighting.');
  perform set_config('request.jwt.claim.sub','',false);
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  perform public.alt_save(p,'Latest title','A performer holding a microphone under green lighting.');
  perform set_config('request.jwt.claim.sub','',false);
  perform public.auto_assert(public.claim_photograph_auto_text(repeat('w',32),p) is null,'active alt lease blocks duplicate generation');
  result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.alt_result());
  perform public.auto_assert(result->>'status' = 'skipped' and result->>'applied' = 'false','stale result rejected');
  perform public.auto_assert((select charged_micros = 1250 from private.photograph_auto_text_attempts where id = (r->>'attemptId')::uuid),'stale known charge settled');
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  perform public.auto_assert(c->>'title' = 'Latest title','latest revision can generate independently');
  -- Disabling between claim and reservation cannot incur a paid request.
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  perform public.set_photograph_description_alt(false,1);
  perform set_config('request.jwt.claim.sub','',false);
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
  perform public.auto_assert(r->>'reserved' = 'false','disabled setting stops reservation');
end $$;

-- Disabling and re-enabling invalidates earlier setting epochs, even with the
-- same source wording. Paid uncertain results keep holds and block blind replay.
do $$ declare p uuid := current_setting('test.alt_photo')::uuid; c jsonb; r jsonb; result jsonb;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  perform public.set_photograph_description_alt(true,2);
  perform public.alt_save(p,'New epoch','A performer holds a microphone.');
  perform set_config('request.jwt.claim.sub','',false);
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  perform public.set_photograph_description_alt(false,3);
  perform public.set_photograph_description_alt(true,4);
  perform set_config('request.jwt.claim.sub','',false);
  result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.alt_result());
  perform public.auto_assert(result->>'status' = 'skipped','old setting epoch cannot apply');
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  perform public.alt_save(p,'Unknown charge source','A performer in a dark room.');
  perform set_config('request.jwt.claim.sub','',false);
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
  result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,'{"outcome":"uncertain","errorCode":"request_uncertain"}');
  perform public.auto_assert(result->>'status' = 'uncertain','unknown alt outcome retained');
  perform public.auto_assert((select charged_micros is null from private.photograph_auto_text_attempts where id = (r->>'attemptId')::uuid),'unknown alt reserve held');
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  perform public.alt_save(p,'Later source','A performer holding a microphone in a dark room.');
  perform set_config('request.jwt.claim.sub','',false);
  perform public.auto_assert(public.claim_photograph_auto_text(repeat('w',32),p) is null,'unknown charge prevents repeat after edits');
end $$;

-- New uploads still generate missing title/description from the image. Their
-- image-only alt is ignored in this mode; saved text queues the alt-only job.
do $$ declare p uuid := public.auto_photo('derived-upload'); c jsonb; r jsonb; result jsonb;
begin
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  perform public.auto_assert(c->>'kind' = 'upload','upload job remains independent');
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
  result := public.finish_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,(r->>'attemptId')::uuid,public.auto_result());
  perform public.auto_assert(result->>'applied' = 'true','upload title/description still generated');
  perform public.auto_assert((select alt_text is null and description is not null from public.photographs where id = p),'image-only alt does not override description mode');
  c := public.claim_photograph_auto_text(repeat('w',32),p);
  perform public.auto_assert(c->>'kind' = 'description_alt' and c->>'description' = 'Birds cross a pale sky.','upload queues derived alt');
  -- Both paths see the exact same ledger and hard cap.
  update private.photograph_auto_text_months set used_micros = 5000000 - reserved_micros
    where month = date_trunc('month',now() at time zone 'UTC')::date;
  r := public.reserve_photograph_auto_text(repeat('w',32),(c->>'jobId')::uuid,(c->>'leaseId')::uuid,1000);
  perform public.auto_assert(r->>'reserved' = 'false' and r->>'status' = 'budget_paused','alt cannot bypass upload monthly cap');
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.set_photograph_description_alt(false,5);
update public.photographs set alt_text = 'Editable again' where id = current_setting('test.alt_photo')::uuid;
select public.auto_assert((select alt_text = 'Editable again' from public.photographs where id = current_setting('test.alt_photo')::uuid),'disable restores manual editing without deleting text');
select 'description-generated-alt: all isolated assertions passed' as result;
