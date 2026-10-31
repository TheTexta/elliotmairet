\set ON_ERROR_STOP on
create function public.test_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is distinct from true then raise exception 'FAILED: %',message; end if; end $$;
select public.test_assert((select sources->>'title' = 'manual' from private.photograph_text_state where photograph_id = '00000000-0000-4000-8000-000000000012'),'existing text protected');
set role anon;
do $$ begin
  begin perform public.photograph_text_states(); raise exception 'anonymous RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform * from private.photograph_text_drafts; raise exception 'anonymous draft read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$ begin
  begin perform public.photograph_text_states(); raise exception 'non-admin RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform * from private.photograph_text_state; raise exception 'non-admin private read allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.test_assert(jsonb_array_length(public.photograph_text_snapshot()->'photos') = 2,'admin snapshot');
-- Legacy direct writes during deployment are tracked, including manual clearing.
update public.photographs set alt_text = 'Owner wording' where filename = 'one.jpg';
update public.photographs set alt_text = null where filename = 'one.jpg';
select public.test_assert(public.photograph_text_states()->'00000000-0000-4000-8000-000000000011'->>'alt_text' = 'manual','manual blank remains protected');
select public.test_assert((select text_revision = 2 from public.photographs where filename = 'one.jpg'),'legacy revisions advance');
-- Normal save of unchanged text must not make the title manual.
select public.save_photograph_text('00000000-0000-4000-8000-000000000011',2,
  '{"title":null,"description":null,"alt_text":null,"caption_mode":"description","custom_caption":null,"captured_at":null,"sort_order":null}');
select public.test_assert(public.photograph_text_states()->'00000000-0000-4000-8000-000000000011'->>'title' = 'unset','unchanged title stays unset');
do $$ begin
  begin perform public.save_photograph_text('00000000-0000-4000-8000-000000000011',2,
    '{"title":"Stale write","description":null,"alt_text":null,"caption_mode":"description","custom_caption":null,"captured_at":null,"sort_order":null}');
    raise exception 'stale save allowed'; exception when serialization_failure then null; end;
end $$;
-- The same import is idempotent; owner title/cleared alt stay protected.
select set_config('test.payload',jsonb_build_object('formatVersion',1,'runId','00000000-0000-4000-8000-000000000021',
  'config',jsonb_build_object('model','gpt-6.1-sol','promptVersion',repeat('a',64),'configHash',repeat('b',64)),
  'records',jsonb_build_array(jsonb_build_object('photographId','00000000-0000-4000-8000-000000000011',
    'storagePath','uploads/one.jpg','filename','one.jpg','width',6000,'height',4000,'textRevision',3,
    'previewSha256',repeat('c',64),'responseId','resp_test','model','gpt-6.1-sol','usage',null,
    'fields',jsonb_build_object('title','Birds above waves','description','Birds cross a pale sky above waves.',
      'altText','Bird silhouettes above waves.','filenameSuggestion','birds-above-waves.jpg','uncertainties','[]'::jsonb))))::text,false);
select public.test_assert(public.import_photograph_text_drafts(current_setting('test.payload')::jsonb) = 1,'import one');
select public.test_assert(public.import_photograph_text_drafts(current_setting('test.payload')::jsonb) = 0,'idempotent import');
select public.test_assert((public.list_photograph_text_drafts()->>'total')::integer = 1,'admin draft listing');
select set_config('test.draft',(public.list_photograph_text_drafts()->'drafts'->0->>'id'),false);
select set_config('test.preview',public.preview_photograph_text_batch('00000000-0000-4000-8000-000000000021',array['title','description','alt_text'])::text,false);
select public.test_assert(current_setting('test.preview')::jsonb->'rows'->0->'protectedFields' = '["alt_text"]','manual alt excluded');
select public.apply_photograph_text_batch((current_setting('test.preview')::jsonb->>'token')::uuid);
select public.test_assert((select title = 'Birds above waves' and description is not null and alt_text is null and caption_mode = 'description' from public.photographs where filename = 'one.jpg'),'eligible fields applied without caption/alt changes');
select public.test_assert(public.photograph_text_states()->'00000000-0000-4000-8000-000000000011'->>'title' = 'ai','AI ownership recorded');
select public.test_assert(public.apply_photograph_text_batch((current_setting('test.preview')::jsonb->>'token')::uuid)->'results'->0->>'status' = 'applied','completed batch resume recovers persisted results');
select public.test_assert((select text_revision = 4 from public.photographs where filename='one.jpg'),'completed batch resume does not repeat live writes');
select public.test_assert(public.get_photograph_text_batch((current_setting('test.preview')::jsonb->>'token')::uuid)->>'done' = 'true','approval status is recoverable after reload');
-- Rollback must not undo a later manual edit, even if it restores the same value.
update public.photographs set title = 'Owner final title' where filename = 'one.jpg';
select public.rollback_photograph_text_batch((current_setting('test.preview')::jsonb->>'token')::uuid);
select public.test_assert((select title = 'Owner final title' from public.photographs where filename = 'one.jpg'),'rollback preserves newer owner edit');
-- Draft edit after preview invalidates exact content approval.
select set_config('test.preview2',public.preview_photograph_text_batch('00000000-0000-4000-8000-000000000021',array['description'])::text,false);
select public.save_photograph_text_draft(current_setting('test.draft')::uuid,1,
  jsonb_set(current_setting('test.payload')::jsonb->'records'->0->'fields','{description}','"Owner edited draft description."'),true);
select public.apply_photograph_text_batch((current_setting('test.preview2')::jsonb->>'token')::uuid);
select public.test_assert((select description <> 'Owner edited draft description.' from public.photographs where filename = 'one.jpg'),'stale preview does not apply edited draft');
-- A genuinely ready second photo proves content-version invalidation (rather
-- than merely skipping an already-conflicted live row).
select set_config('test.payload2',jsonb_set(current_setting('test.payload')::jsonb,'{records}',jsonb_build_array(
  (current_setting('test.payload')::jsonb->'records'->0) || '{"photographId":"00000000-0000-4000-8000-000000000012","storagePath":"uploads/two.jpg","filename":"two.jpg","width":4000,"height":6000,"textRevision":0}'::jsonb
))::text,false);
select public.import_photograph_text_drafts(current_setting('test.payload2')::jsonb);
select set_config('test.draft2',(public.list_photograph_text_drafts(null,'00000000-0000-4000-8000-000000000012')->'drafts'->0->>'id'),false);
select set_config('test.ready',public.preview_photograph_text_batch('00000000-0000-4000-8000-000000000021',array['title','description','alt_text'],array[current_setting('test.draft2')::uuid])::text,false);
select public.test_assert(current_setting('test.ready')::jsonb->'rows'->0->>'status' = 'ready','second preview starts ready');
select public.save_photograph_text_draft(current_setting('test.draft2')::uuid,1,
  jsonb_set(current_setting('test.payload2')::jsonb->'records'->0->'fields','{description}','"Owner edited draft description."'),true);
select public.test_assert(public.apply_photograph_text_batch((current_setting('test.ready')::jsonb->>'token')::uuid)->'results'->0->>'status' = 'conflict','editing an approved draft invalidates approval');
select public.test_assert((select description is null from public.photographs where filename='two.jpg'),'unapproved edited text not applied');
select set_config('test.ready2',public.preview_photograph_text_batch('00000000-0000-4000-8000-000000000021',array['title','description','alt_text'],array[current_setting('test.draft2')::uuid])::text,false);
select public.apply_photograph_text_batch((current_setting('test.ready2')::jsonb->>'token')::uuid);
select public.test_assert((select title='Existing owner title' and description='Owner edited draft description.' from public.photographs where filename='two.jpg'),'owner title preserved; edited draft applied');
select public.test_assert(public.photograph_text_states()->'00000000-0000-4000-8000-000000000012'->>'description' = 'manual','edited draft becomes manual');
select public.test_assert(public.photograph_text_states()->'00000000-0000-4000-8000-000000000012'->>'alt_text' = 'ai','unedited draft becomes AI');
select public.rollback_photograph_text_batch((current_setting('test.ready2')::jsonb->>'token')::uuid);
select public.test_assert((select title='Existing owner title' and description is null and alt_text is null from public.photographs where filename='two.jpg'),'unchanged batch rollback restores only affected fields');
select public.test_assert(public.photograph_text_states()->'00000000-0000-4000-8000-000000000012'->>'description' = 'unset','rollback restores ownership');
-- Caption modes preserve custom text and never replace accessibility text.
select public.save_photograph_text('00000000-0000-4000-8000-000000000012',2,
  '{"title":"Existing owner title","description":null,"alt_text":null,"caption_mode":"custom","custom_caption":"Manual caption","captured_at":null,"sort_order":null}');
select public.save_photograph_text('00000000-0000-4000-8000-000000000012',3,
  '{"title":"Existing owner title","description":null,"alt_text":null,"caption_mode":"hidden","custom_caption":"Manual caption","captured_at":null,"sort_order":null}');
select public.accept_photograph_text_field(current_setting('test.draft2')::uuid,2,'title',4);
select public.test_assert((select caption_mode='hidden' and custom_caption='Manual caption' and title='Birds above waves' and alt_text is null from public.photographs where filename='two.jpg'),'explicit AI replacement affects one field only, preserving caption mode');
do $$ begin
  begin perform public.save_photograph_text('00000000-0000-4000-8000-000000000012',null,
    '{"title":"Stale","description":null,"alt_text":null,"caption_mode":"description","custom_caption":null,"captured_at":null,"sort_order":null}');
    raise exception 'null revision bypassed'; exception when serialization_failure then null; end;
end $$;
-- New publication inserts classify owner text without changing publication RPCs.
reset role;
insert into public.photographs (storage_path,filename,image_width,image_height,title) values('uploads/new.jpg','new.jpg',100,100,'Upload title');
select public.test_assert((select s.sources->>'title' = 'manual' from private.photograph_text_state s join public.photographs p on p.id=s.photograph_id where filename='new.jpg'),'upload text protected');
select public.test_assert(not has_table_privilege('anon','private.photograph_text_drafts','SELECT'),'no anonymous table grants');
select public.test_assert(not has_table_privilege('authenticated','private.photograph_text_drafts','SELECT'),'no authenticated table grants');
select public.test_assert((select count(*) > 5 from private.photograph_text_edit_history),'live before/after history recorded');
-- Two chunks prove that a lost committed response is recoverable, a changed
-- tail record is excluded, and rolling back an interrupted batch cancels it.
insert into public.photographs(id,storage_path,filename,image_width,image_height)
select ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'uploads/batch-'||n||'.jpg','batch-'||n||'.jpg',640,480
from generate_series(1,21) n;
set role authenticated;
do $$ declare records jsonb; payload jsonb; part integer; begin
  for part in 0..1 loop
    select jsonb_agg(jsonb_build_object('photographId',p.id,'storagePath',p.storage_path,'filename',p.filename,
      'width',p.image_width,'height',p.image_height,'textRevision',0,'previewSha256',repeat('c',64),
      'responseId','resp_'||p.id,'model','gpt-6.1-sol','usage',null,
      'fields',current_setting('test.payload')::jsonb->'records'->0->'fields') order by p.id) into records
    from public.photographs p where p.filename like 'batch-%'
      and p.id > ('00000000-0000-4000-8000-'||lpad((100+part*20)::text,12,'0'))::uuid
      and p.id <= ('00000000-0000-4000-8000-'||lpad((120+part*20)::text,12,'0'))::uuid;
    payload := jsonb_build_object('formatVersion',1,'runId','00000000-0000-4000-8000-000000000031',
      'config',current_setting('test.payload')::jsonb->'config','records',records);
    perform public.import_photograph_text_drafts(payload);
  end loop;
end $$;
select set_config('test.chunk',public.preview_photograph_text_batch('00000000-0000-4000-8000-000000000031',array['title','description','alt_text'])::text,false);
select public.test_assert(jsonb_array_length(public.apply_photograph_text_batch((current_setting('test.chunk')::jsonb->>'token')::uuid)->'results') = 20,'first chunk commits 20');
update public.photographs set title='New manual tail title' where filename='batch-21.jpg';
select set_config('test.resumed',public.apply_photograph_text_batch((current_setting('test.chunk')::jsonb->>'token')::uuid)::text,false);
select public.test_assert(jsonb_array_length(current_setting('test.resumed')::jsonb->'results') = 21,'resume recovers earlier committed results');
select public.test_assert(current_setting('test.resumed')::jsonb->'results'->20->>'status' = 'conflict','changed tail excluded at commit');
select public.test_assert((select bool_and(text_revision=1) from public.photographs where filename like 'batch-%'),'resuming does not duplicate prior writes');
do $$ declare records jsonb; part integer; begin
  for part in 0..1 loop
    select jsonb_agg(jsonb_build_object('photographId',p.id,'storagePath',p.storage_path,'filename',p.filename,
      'width',p.image_width,'height',p.image_height,'textRevision',1,'previewSha256',repeat('c',64),
      'responseId','resp_again_'||p.id,'model','gpt-6.1-sol','usage',null,
      'fields',current_setting('test.payload')::jsonb->'records'->0->'fields') order by p.id) into records
    from public.photographs p where p.filename like 'batch-%'
      and p.id > ('00000000-0000-4000-8000-'||lpad((100+part*20)::text,12,'0'))::uuid
      and p.id <= ('00000000-0000-4000-8000-'||lpad((120+part*20)::text,12,'0'))::uuid;
    perform public.import_photograph_text_drafts(jsonb_build_object('formatVersion',1,'runId','00000000-0000-4000-8000-000000000032',
      'config',current_setting('test.payload')::jsonb->'config','records',records));
  end loop;
end $$;
select set_config('test.partial',public.preview_photograph_text_batch('00000000-0000-4000-8000-000000000032',array['title','description','alt_text'])::text,false);
select public.apply_photograph_text_batch((current_setting('test.partial')::jsonb->>'token')::uuid);
select public.rollback_photograph_text_batch((current_setting('test.partial')::jsonb->>'token')::uuid);
select public.test_assert(public.apply_photograph_text_batch((current_setting('test.partial')::jsonb->>'token')::uuid)->>'done' = 'true','rolled-back partial batch cannot resume its tail');
select public.test_assert((select text_revision=1 and title='New manual tail title' and description is null from public.photographs where filename='batch-21.jpg'),'cancelled tail left unchanged');
select 'photograph text database checks passed' as result;
