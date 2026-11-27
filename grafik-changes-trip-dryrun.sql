-- grafik-changes-trip-dryrun.sql — СУХ ТЕСТ на grafik-changes-trip-schema.sql (+ rollback).
-- Един DO блок с raise exception накрая — в базата не остава нищо.

do $dry$
declare r text := ''; n int; t text; mid uuid; sid uuid; cid uuid;
begin
  select count(*), string_agg(distinct actual, ',') into n, t from public.grafik_changes;
  r := r || E'\n0 преди: grafik_changes — ' || n || ' реда (' || coalesce(t, '—') || ')';

  alter table public.grafik_changes drop constraint grafik_changes_actual_check;
  alter table public.grafik_changes add constraint grafik_changes_actual_check
    check (actual in ('ЛД','ЗД','П','В','М','К','почивка','О','Б','Н','Д','А','С','Майч'));
  alter table public.grafik_changes add column trip_store text;
  alter table public.grafik_changes add constraint grafik_changes_trip_store_check
    check ((actual = 'К') = (trip_store is not null and btrim(trip_store) <> ''));

  select count(*) into n from public.grafik_changes where trip_store is not null;
  r := r || E'\n1 колона trip_store — ' || (select data_type || ', NULL ' || is_nullable from information_schema.columns where table_name = 'grafik_changes' and column_name = 'trip_store')
        || '; заварени с обект — ' || n;
  if has_column_privilege('anon', 'public.grafik_changes', 'trip_store', 'SELECT') then raise exception 'anon чете trip_store'; end if;
  r := r || E'\n2 anon — без права (като цялата таблица)';

  -- проби върху реален месец и човек (ако има)
  select c.month_id, c.staff_id into mid, sid from public.grafik_changes c limit 1;
  if mid is null then
    r := r || E'\n3 проби — няма заварени промени, пропуснати';
  else
    insert into public.grafik_changes (month_id, staff_id, day, actual, reason, trip_store) values (mid, sid, 31, 'К', 'сух тест', 'Шумен') returning id into cid;
    r := r || E'\n3 К с обект — минава';
    begin
      update public.grafik_changes set trip_store = null where id = cid;
      raise exception 'К без обект МИНА';
    exception when check_violation then r := r || E'\n4 К без обект — отказ'; end;
    begin
      update public.grafik_changes set trip_store = '  ' where id = cid;
      raise exception 'К с празен обект МИНА';
    exception when check_violation then r := r || E'\n5 К с празен обект — отказ'; end;
    begin
      update public.grafik_changes set actual = 'Б' where id = cid;
      raise exception 'Б с обект МИНА';
    exception when check_violation then r := r || E'\n6 Б с обект — отказ'; end;
    begin
      update public.grafik_changes set actual = 'Х' where id = cid;
      raise exception 'непознато реално МИНА';
    exception when check_violation then r := r || E'\n7 непознато „реално“ — отказ'; end;
    delete from public.grafik_changes where id = cid;
  end if;

  -- rollback
  delete from public.grafik_changes where actual = 'К';
  alter table public.grafik_changes drop constraint grafik_changes_trip_store_check;
  alter table public.grafik_changes drop column trip_store;
  alter table public.grafik_changes drop constraint grafik_changes_actual_check;
  alter table public.grafik_changes add constraint grafik_changes_actual_check
    check (actual in ('ЛД','ЗД','П','В','М','почивка','О','Б','Н','Д','А','С','Майч'));
  select count(*) into n from public.grafik_changes;
  r := r || E'\n8 след rollback: ' || n || ' реда; колона trip_store — ' || (select count(*) from information_schema.columns where table_name = 'grafik_changes' and column_name = 'trip_store')
        || '; ' || (select pg_get_constraintdef(oid) from pg_constraint where conname = 'grafik_changes_actual_check');

  raise exception 'СУХ ТЕСТ ОК%', r;
end
$dry$;
