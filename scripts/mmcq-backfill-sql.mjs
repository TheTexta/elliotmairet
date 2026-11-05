// SQL generation only. No connections, credentials, persistent DDL or RPC calls.
export const TABLES = ["photographs", "photo_palette_analyses", "photo_palette_colours", "photo_oklab_analyses", "photo_oklab_features"];
export const PALETTE_TABLES = TABLES.slice(1);
// Ordered physical columns at production-base 6f0efc0. Unexpected schema fails closed.
const column = (name, type, nullable = false) => ({ name, type, notNull: !nullable });
const analysis = (count) => [column("photograph_id", "uuid"), column("algorithm", "text"), column("algorithm_iterations", "smallint"), column("sample_longest_side", "smallint"), column(count, "smallint"), column("analyzed_at", "timestamp with time zone")];
const colour = (space, rankType) => [column("photograph_id", "uuid"), column("rank", rankType), ...["red", "green", "blue"].map(name => column(name, "smallint")), column("hex", "text"), ...["l", "a", "b"].map(axis => column(`${space}_${axis}`, "real")), column("weight", "real")];
export const COLUMNS = {
  photographs: [column("id", "uuid"), column("storage_path", "text"), column("filename", "text"), column("image_width", "integer"), column("image_height", "integer"), column("captured_at", "date", true), column("title", "text", true), column("alt_text", "text", true), column("sort_order", "integer", true), column("created_at", "timestamp with time zone"), column("updated_at", "timestamp with time zone"), column("description", "text", true), column("caption_mode", "text"), column("custom_caption", "text", true), column("text_revision", "integer")],
  photo_palette_analyses: analysis("palette_size"),
  photo_palette_colours: colour("lab", "integer"),
  photo_oklab_analyses: analysis("feature_count"),
  photo_oklab_features: colour("oklab", "smallint"),
};
export const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const settings = `set local search_path = pg_catalog, pg_temp;
set local timezone = 'UTC';
set local extra_float_digits = 3;
set local row_security = off;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '60s';`;

export function schemaAssertions() {
  return `do $schema$
begin
  if not exists (select from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'A directly authorized BYPASSRLS database role is required';
  end if;
  if to_regclass('public.photo_palette_colours_new') is not null then
    raise exception 'Unexpected legacy _new relation; inspect schema before continuing';
  end if;
  ${TABLES.map(table => `
  if not exists (select from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='${table}' and c.relkind='r' and not c.relispartition) then
    raise exception 'Expected ordinary physical table: ${table}';
  end if;
  if exists (select from pg_inherits where inhparent='public.${table}'::regclass or inhrelid='public.${table}'::regclass) then
    raise exception 'Unexpected table inheritance: ${table}';
  end if;
  if (select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid,a.atttypmod), 'notNull', a.attnotnull) order by a.attnum)
    from pg_attribute a where a.attrelid='public.${table}'::regclass and a.attnum>0 and not a.attisdropped)
    is distinct from ${json(COLUMNS[table])} then
    raise exception 'Unexpected typed columns: ${table}';
  end if;
  if exists (select from pg_attribute where attrelid='public.${table}'::regclass and attnum>0 and not attisdropped and (attidentity<>'' or attgenerated<>'')) then
    raise exception 'Unexpected generated/identity columns: ${table}';
  end if;
  ${table === "photographs" ? "" : `if exists (select from pg_trigger where tgrelid='public.${table}'::regclass and not tgisinternal)
    or exists (select from pg_rewrite where ev_class='public.${table}'::regclass) then
    raise exception 'Unexpected palette trigger/rule: ${table}';
  end if;
  if exists (select from pg_constraint where contype='f' and confrelid='public.${table}'::regclass
    ${table === "photo_oklab_analyses" ? "and conrelid<>'public.photo_oklab_features'::regclass" : ""}) then
    raise exception 'Unexpected inbound palette foreign key: ${table}';
  end if;`}`).join("\n")}
end $schema$;`;
}

export function snapshotSql() {
  return `set standard_conforming_strings=on;
begin isolation level repeatable read read only;
${settings}
${schemaAssertions()}
select jsonb_build_object('formatVersion',1,'paletteTable','photo_palette_colours','tables',jsonb_build_object(
${TABLES.map(table => `'${table}',(select coalesce(jsonb_agg(to_jsonb(t) order by ${table === "photographs" ? "t.id" : "t.photograph_id"}${table.endsWith("colours") || table.endsWith("features") ? ",t.rank" : ""}), '[]'::jsonb) from public.${table} t)`).join(",\n")}));
commit;`;
}

function stage(prefix, rows) {
  return TABLES.map(table => `create temp table ${prefix}_${table} (like public.${table} including constraints);
insert into pg_temp.${prefix}_${table} select * from jsonb_populate_recordset(null::public.${table}, ${json(rows[table])});`).join("\n");
}
function equal(prefix, table) {
  return `not exists ((select * from public.${table} except all select * from pg_temp.${prefix}_${table}) union all (select * from pg_temp.${prefix}_${table} except all select * from public.${table}))`;
}
const allEqual = prefix => TABLES.map(table => `(${equal(prefix, table)})`).join(" and\n");

function desiredAssertions() {
  return `do $desired$
begin
  if exists ((select * from pg_temp.b_photographs except all select * from pg_temp.a_photographs) union all
    (select * from pg_temp.a_photographs except all select * from pg_temp.b_photographs)) then
    raise exception 'Desired catalogue differs from frozen photograph rows';
  end if;
  ${["photo_palette_analyses", "photo_oklab_analyses"].map((table, i) => {
    const children = i ? "photo_oklab_features" : "photo_palette_colours";
    const count = i ? "feature_count" : "palette_size";
    return `if exists (select from pg_temp.a_${table} a full join pg_temp.a_photographs p on p.id=a.photograph_id
      where p.id is null or a.photograph_id is null or a.algorithm<>'mmcq64-vibrant-oklab-v1' or a.algorithm_iterations<>2 or a.sample_longest_side<>256 or a.${count} not between 1 and 5)
      or (select count(*) from pg_temp.a_${table})<>(select count(*) from pg_temp.a_photographs)
      or exists (select photograph_id from pg_temp.a_${table} group by photograph_id having count(*)<>1)
      or exists (select from pg_temp.a_${table} a left join pg_temp.a_${children} c using(photograph_id)
        group by a.photograph_id,a.${count} having count(c.rank)<>a.${count} or count(distinct c.rank)<>a.${count} or min(c.rank)<>1 or max(c.rank)<>a.${count} or abs(sum(c.weight::double precision)-1)>0.000005)
      or exists (select from pg_temp.a_${children} c left join pg_temp.a_${table} a using(photograph_id) where a.photograph_id is null) then
      raise exception 'Invalid desired counts/model/ranks/weights: ${table}';
    end if;`;
  }).join("\n")}
  if exists (select from pg_temp.a_photo_palette_analyses p join pg_temp.a_photo_oklab_analyses o using(photograph_id)
    where p.palette_size<>o.feature_count or p.analyzed_at<>o.analyzed_at)
    or exists (select from pg_temp.a_photo_palette_colours p full join pg_temp.a_photo_oklab_features o using(photograph_id,rank)
      where p.photograph_id is null or o.photograph_id is null or (p.red,p.green,p.blue,p.hex,p.weight) is distinct from (o.red,o.green,o.blue,o.hex,o.weight)) then
    raise exception 'Colour-space payloads differ';
  end if;
  ${[["photo_palette_colours", "lab"], ["photo_oklab_features", "oklab"]].map(([table, space]) => `if exists (select from pg_temp.a_${table} c where
    c.hex <> '#' || lpad(to_hex(c.red::integer),2,'0') || lpad(to_hex(c.green::integer),2,'0') || lpad(to_hex(c.blue::integer),2,'0')
    or ${["l", "a", "b"].map(axis => `c.${space}_${axis}::text in ('NaN','Infinity','-Infinity')`).join(" or ")}) then
    raise exception 'Invalid finite coordinates/hex: ${table}';
  end if;`).join("\n")}
  if exists (select from pg_temp.a_photo_oklab_features x join pg_temp.a_photo_oklab_features y on x.photograph_id=y.photograph_id and x.rank<y.rank
    where power(x.oklab_l::double precision-y.oklab_l,2)+power(x.oklab_a::double precision-y.oklab_a,2)+power(x.oklab_b::double precision-y.oklab_b,2) < power(0.055-0.000001,2)) then
    raise exception 'Insufficient desired pairwise separation';
  end if;
end $desired$;`;
}

// verify uses temp staging before a genuinely READ ONLY transaction. No public writes.
export function transitionSql(before, after, action = "verify") {
  if (!["apply", "rollback", "verify"].includes(action)) throw new Error("Invalid transition action");
  const staging = `${stage("b", before.tables)}\n${stage("a", after.tables)}`;
  const start = action === "verify"
    ? `${staging}\nbegin isolation level repeatable read read only;`
    : `begin isolation level read committed;\n${settings}\n${schemaAssertions()}\n${staging}`;
  const classification = `case when ${allEqual("a")} then 'after' when ${allEqual("b")} then 'before' else 'stale' end`;
  if (action === "verify") return `set standard_conforming_strings=on;\n${start}\n${settings}\n${schemaAssertions()}\n${desiredAssertions()}\nselect ${classification};\ncommit;`;
  const target = action === "apply" ? "a" : "b";
  const expected = action === "apply" ? "b" : "a";
  return `set standard_conforming_strings=on;\n${start}
${desiredAssertions()}
create temp table backfill_result (state text);
lock table public.photographs in share mode;
lock table ${PALETTE_TABLES.map(table => `public.${table}`).join(", ")} in share row exclusive mode;
${schemaAssertions()}
do $transition$
begin
  if ${allEqual(target)} then
    insert into pg_temp.backfill_result values ('${action === "apply" ? "already-applied" : "already-rolled-back"}');
    return;
  end if;
  if not (${allEqual(expected)}) then
    raise exception 'Stale/partial catalogue or palette state; no changes permitted';
  end if;
  delete from public.photo_palette_colours;
  delete from public.photo_oklab_features;
  delete from public.photo_palette_analyses;
  delete from public.photo_oklab_analyses;
  insert into public.photo_palette_analyses select * from pg_temp.${target}_photo_palette_analyses;
  insert into public.photo_palette_colours select * from pg_temp.${target}_photo_palette_colours;
  -- offline-test-midwrite-failure-point
  insert into public.photo_oklab_analyses select * from pg_temp.${target}_photo_oklab_analyses;
  insert into public.photo_oklab_features select * from pg_temp.${target}_photo_oklab_features;
  if not (${allEqual(target)}) then
    raise exception 'Post-write full-row verification failed';
  end if;
  insert into pg_temp.backfill_result values ('${action === "apply" ? "applied" : "rolled-back"}');
end $transition$;
select state from pg_temp.backfill_result;
commit;`;
}
