-- grafik-sector-coverage-dryrun.sql — СУХ ТЕСТ на grafik-sector-coverage-schema.sql (+ rollback).
-- Целият тест е в ЕДИН DO блок, който завършва с raise exception: изключението отменя всичко
-- (ALTER, UPDATE, INSERT, DROP) — в базата не остава нищо, дори ако някоя стъпка мине.
-- Резултатът е в текста на грешката (ERROR: СУХ ТЕСТ ОК …). Друга грешка = тестът е паднал.
-- Заключването: ALTER TABLE взима ACCESS EXCLUSIVE върху grafik_sectors за милисекунди.

do $$
declare r text := ''; n int; t text;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'grafik_sectors' and column_name = 'track_coverage';
  r := r || E'\n0 преди: колоната я има — ' || n;
  select count(*) into n from public.grafik_sectors;
  if n <> 25 then raise exception 'очаквани 25 сектора, намерени %', n; end if;

  -- миграцията
  alter table public.grafik_sectors add column track_coverage boolean not null default true;

  select data_type || ' / NULL: ' || is_nullable || ' / default: ' || column_default into t
    from information_schema.columns
   where table_schema = 'public' and table_name = 'grafik_sectors' and column_name = 'track_coverage';
  r := r || E'\n1 след: ' || t;
  select count(*) filter (where track_coverage) || ' true / ' || count(*) filter (where not track_coverage) || ' false / ' || count(*) || ' общо'
    into t from public.grafik_sectors;
  r := r || E'\n2 заварените: ' || t;

  -- проба: изключване (както ще го прави grafik-api) и нов ред без стойност
  update public.grafik_sectors set track_coverage = false
   where store_name = 'Кърджали' and name in ('Управление', 'Хигиена', 'Машинки');
  select string_agg(name, ', ' order by name) into t from public.grafik_sectors where not track_coverage;
  r := r || E'\n3 изключени (проба): ' || coalesce(t, '—');
  insert into public.grafik_sectors (store_name, name) values ('Кърджали', '__сух_тест__') returning track_coverage::text into t;
  r := r || E'\n4 нов сектор без стойност → ' || t;
  select coalesce(string_agg(grantee || ':' || privilege_type, ', '), 'няма') into t
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'grafik_sectors' and column_name = 'track_coverage'
     and grantee in ('anon', 'authenticated');
  r := r || E'\n5 права anon / authenticated: ' || t;

  -- rollback-ът (grafik-sector-coverage-schema-down.sql)
  alter table public.grafik_sectors drop column track_coverage;
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'grafik_sectors' and column_name = 'track_coverage';
  r := r || E'\n6 след rollback: колоната я има — ' || n;

  raise exception 'СУХ ТЕСТ ОК (всичко е отменено):%', r;
end $$;
