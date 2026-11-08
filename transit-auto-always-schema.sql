-- „Стока на път" в Бюлетина — автоматична ВИНАГИ, и за многодневна задача
--
-- ═══ ЗАЩО ═══════════════════════════════════════════════════════════════
-- Дотук автоматичното отмятане беше по избор (bulletin_tasks.auto_complete) и
-- само за задача с един ден срок. Случай 08.11.2026: 379d9f9d… „СТОКА НА ПЪТ"
-- (05–08.11, auto_complete=false) — Кърджали е отговорила на всички 103 реда,
-- отметнала е ръчно 05 и 06.11, а 07 и 08.11 излизат неизпълнени. Решение на
-- Тенчо 08.11.2026: задача, свързана със Стока на път, се отмята ВИНАГИ
-- автоматично по решените редове — като Разлики / За връщане / Палети.
--
-- ═══ КАКВО ═════════════════════════════════════════════════════════════
-- 1. transit_sync_completions(p_store): без bt.auto_complete и без
--    cardinality(due_dates) <= 1. Отметка за ВСЕКИ ден от due_dates
--    (еднодневна / без due_dates — както досега, due_date). Прозорецът
--    „>= днес − 14" — по ПОСЛЕДНИЯ ден на задачата. Правилото
--    (transit_store_done_since) и on conflict — без промяна.
-- 2. bulletin_tasks_transit_sync_trg(): без проверката за auto_complete —
--    иначе нова transit задача без отметката не би тръгнала до следващ запис
--    в goods_transit.
-- Колоната auto_complete остава (не се чете за transit).
-- 3. transit_mark_empty_stores() (крон 22, обект БЕЗ входящи редове): същата
--    промяна (решение Б на Тенчо, 08.11.2026) — без auto_complete и без един
--    ден; отметка 'auto:transit-empty' за всеки ден от due_dates; прозорец по
--    последния ден; самопочистването (обектът получи редове) — за всеки ден
--    >= днес, както досега за срока. Иначе обект без редове остава със
--    заключена задача, която никой не може да отметне.
-- 4. Еднократен sync в края (решение А1 на Тенчо, 08.11.2026) — същото, което
--    прави тригерът при запис на задача: заварените задачи (379d9f9d…,
--    4818c841…) получават отметките си веднага, без да чакат импорт. Часов крон
--    НЕ се добавя — тригерите покриват останалото.
-- transit_store_done(_since) — без промяна.
--
-- ═══ ДАННИТЕ ПРЕДИ (правило 9, dry-run 08.11.2026) ══════════════════════
-- 2 задачи в прозореца (379d9f9d… 05–08.11, 4818c841… 09.11), и двете с
-- auto_complete=false. transit_sync_completions: 44 нови отметки (27 + 17),
-- 0 отложени → изпълнени; 0 за обект с необработен ред (Севлиево — 17 реда).
-- transit_mark_empty_stores: 0 — всички 17 отчетни обекта имат входящи редове.
--
-- Само функции → ред в zhivko-opashka.md не е нужен.
-- Rollback: transit-auto-always-schema-down.sql (живите дефиниции от 08.11.2026;
-- отметките от еднократния sync НЕ се махат от него).

create or replace function public.transit_sync_completions(p_store text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Sofia')::date;
  v_n     integer := 0;
begin
  if p_store is null then
    return 0;
  end if;

  insert into task_completions
         (task_id, bulletin_id, store_name, completed_by, completed_at,
          status, completion_date)
  select bt.id, bt.bulletin_id, p_store, 'auto:transit', now(),
         'done', d.day
    from bulletin_tasks bt
   cross join lateral unnest(
           case when coalesce(cardinality(bt.due_dates), 0) > 0
                then bt.due_dates
                else array[bt.due_date] end) as d(day)
   where bt.linked_module = 'transit'
     and d.day is not null
     and (select max(x)
            from unnest(case when coalesce(cardinality(bt.due_dates), 0) > 0
                             then bt.due_dates
                             else array[bt.due_date] end) as x) >= v_today - 14
     and (bt.target_stores is null
          or cardinality(bt.target_stores) = 0
          or p_store = any(bt.target_stores))
     and transit_store_done_since(p_store,
           case when bt.starts_on is null then null else bt.starts_on - 7 end)
  on conflict (task_id, store_name, completion_date)
     where task_id is not null and completion_date is not null
  do update set status       = 'done',
                completed_by = excluded.completed_by,
                completed_at = excluded.completed_at
          where task_completions.status = 'postponed';

  get diagnostics v_n = row_count;
  return v_n;
end
$$;

create or replace function public.bulletin_tasks_transit_sync_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
begin
  if new.linked_module is distinct from 'transit' then
    return null;
  end if;
  for s in select distinct store_name from goods_transit loop
    begin
      perform transit_sync_completions(s);
    exception when others then
      raise warning 'transit_sync_completions(%): %', s, sqlerrm;
    end;
  end loop;
  return null;
end
$$;

create or replace function public.transit_mark_empty_stores()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'Europe/Sofia')::date;
  v_excl    text[] := report_excluded_stores();
  v_quiet   interval := interval '10 minutes';
  t         record;
  v_from    timestamptz;
  v_rows    integer;
  v_last    timestamptz;
  v_stores  text[];
  v_n       integer := 0;
  v_d       integer := 0;
  v_tmp     integer;
begin
  if v_excl is null then
    raise warning 'transit_mark_empty_stores: няма app_settings.report_excluded_stores — нищо не се прави';
    return 0;
  end if;

  for t in
    select bt.id, bt.bulletin_id, bt.starts_on, bt.target_stores, dd.days
      from bulletin_tasks bt
     cross join lateral (
             select case when coalesce(cardinality(bt.due_dates), 0) > 0
                         then bt.due_dates
                         else array[bt.due_date] end as days) dd
     where bt.linked_module = 'transit'
       and (select max(x) from unnest(dd.days) as x) >= v_today - 14
  loop
    v_from := case when t.starts_on is null then null
                   else ((t.starts_on - 7)::timestamp at time zone 'Europe/Sofia') end;

    select count(*), max(imported_at) into v_rows, v_last
      from goods_transit
     where direction = 'incoming'
       and archived_at is null
       and (v_from is null or imported_at >= v_from);

    if v_rows = 0 then continue; end if;
    if v_last > now() - v_quiet then continue; end if;

    v_stores := case
      when t.target_stores is not null and cardinality(t.target_stores) > 0 then t.target_stores
      else array(select distinct u.store_name
                   from users u
                  where u.store_name is not null
                    and not (u.store_name = any(v_excl)))
    end;

    insert into task_completions
           (task_id, bulletin_id, store_name, completed_by, completed_at,
            status, completion_date)
    select t.id, t.bulletin_id, s, 'auto:transit-empty', now(), 'done', d.day
      from unnest(v_stores) as s
     cross join unnest(t.days) as d(day)
     where d.day is not null
       and not exists (
             select 1 from goods_transit g
              where g.store_name = s and g.direction = 'incoming'
                and g.archived_at is null
                and (v_from is null or g.imported_at >= v_from))
    on conflict (task_id, store_name, completion_date)
       where task_id is not null and completion_date is not null
    do nothing;
    get diagnostics v_tmp = row_count;
    v_n := v_n + coalesce(v_tmp, 0);

    -- Самопочистване: само за дните, които още не са минали — след деня
    -- историята не се пренаписва (както досега за срока).
    delete from task_completions tc
     where tc.task_id = t.id
       and tc.completion_date = any(t.days)
       and tc.completion_date >= v_today
       and tc.completed_by = 'auto:transit-empty'
       and exists (
             select 1 from goods_transit g
              where g.store_name = tc.store_name and g.direction = 'incoming'
                and g.archived_at is null
                and (v_from is null or g.imported_at >= v_from));
    get diagnostics v_tmp = row_count;
    v_d := v_d + coalesce(v_tmp, 0);
  end loop;

  return v_n + v_d;
end
$$;

-- Еднократно (решение А1): заварените задачи получават отметките си сега.
select public.transit_sync_completions(x.s)
  from (select distinct store_name as s
          from public.goods_transit
         where store_name is not null) x;
