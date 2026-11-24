-- grafik-approve-dryrun.sql — СУХ ТЕСТ на grafik-approve-schema.sql (+ rollback).
-- Един DO блок, който завършва с raise exception: изключението отменя всичко — в базата
-- не остава нищо. Резултатът е в текста на грешката (СУХ ТЕСТ ОК …).

do $$
declare r text := ''; n int; t text; mid uuid;
begin
  select string_agg(status || ':' || c, ', ' order by status) into t from (select status, count(*) c from public.grafik_months group by status) x;
  r := r || E'\n0 преди: статуси — ' || coalesce(t, '—') || '; CHECK — ' || (select pg_get_constraintdef(oid) from pg_constraint where conname = 'grafik_months_status_check');
  select count(*) into n from public.grafik_months where status not in ('draft', 'submitted');
  if n <> 0 then raise exception 'очаквани само draft / submitted, намерени други: %', n; end if;

  -- миграцията
  alter table public.grafik_months drop constraint grafik_months_status_check;
  alter table public.grafik_months add constraint grafik_months_status_check check (status in ('draft', 'submitted', 'approved'));
  alter table public.grafik_months
    add column approved_at timestamptz, add column approved_by text, add column approved_by_name text,
    add column return_comment text, add column returned_at timestamptz, add column returned_by_name text;

  select string_agg(column_name || ':' || data_type || ':' || is_nullable, ', ' order by ordinal_position) into t
    from information_schema.columns where table_schema = 'public' and table_name = 'grafik_months'
     and column_name in ('approved_at', 'approved_by', 'approved_by_name', 'return_comment', 'returned_at', 'returned_by_name');
  r := r || E'\n1 нови колони: ' || t;
  r := r || E'\n2 CHECK след: ' || (select pg_get_constraintdef(oid) from pg_constraint where conname = 'grafik_months_status_check');
  select count(*) into n from public.grafik_months where approved_at is not null or return_comment is not null;
  r := r || E'\n3 заварени редове с данни в новите колони: ' || n;

  -- проба: одобряване на подадения, после невалиден статус
  select id into mid from public.grafik_months where status = 'submitted' limit 1;
  if mid is not null then
    update public.grafik_months set status = 'approved', approved_at = now(), approved_by = 'dry@test', approved_by_name = 'Сух тест' where id = mid;
    select status || ' / ' || approved_by_name into t from public.grafik_months where id = mid;
    r := r || E'\n4 проба одобряване: ' || t;
  else
    r := r || E'\n4 проба одобряване: няма подаден месец';
  end if;
  begin
    update public.grafik_months set status = 'xyz' where id = mid;
    r := r || E'\n5 невалиден статус: МИНА (лошо)';
  exception when check_violation then
    r := r || E'\n5 невалиден статус ''xyz'': отказан (check_violation)';
  end;
  select coalesce(string_agg(grantee || ':' || privilege_type, ', '), 'няма') into t
    from information_schema.role_table_grants where table_schema = 'public' and table_name = 'grafik_months' and grantee in ('anon', 'authenticated');
  r := r || E'\n6 права anon / authenticated върху таблицата: ' || t;

  -- rollback-ът (grafik-approve-schema-down.sql)
  update public.grafik_months set status = 'submitted' where status = 'approved';
  alter table public.grafik_months drop constraint grafik_months_status_check;
  alter table public.grafik_months add constraint grafik_months_status_check check (status in ('draft', 'submitted'));
  alter table public.grafik_months drop column approved_at, drop column approved_by, drop column approved_by_name,
    drop column return_comment, drop column returned_at, drop column returned_by_name;
  select string_agg(status || ':' || c, ', ' order by status) into t from (select status, count(*) c from public.grafik_months group by status) x;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'grafik_months' and column_name like 'approved%';
  r := r || E'\n7 след rollback: статуси — ' || t || '; колони approved_* — ' || n || '; CHECK — ' || (select pg_get_constraintdef(oid) from pg_constraint where conname = 'grafik_months_status_check');

  raise exception 'СУХ ТЕСТ ОК (всичко е отменено):%', r;
end $$;
