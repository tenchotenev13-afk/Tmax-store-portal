-- Автоматично отмятане на „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М." от бланките в „Зареждане"
--
-- ЗАЩО. Задачата (recurring_tasks.linked_module='supply') се отмяташе ръчно, без
-- проверка за данни. 05.10.2026: Габрово отметнат 09:09 без нито един ред в
-- supply_entries; Силистра — нищо; Враца без „Подови", Раднево и Търговище без
-- „Кабели" — а Кърджали попълнил 11:19/11:21, отметнал 11:22 и в доклада в 11:00
-- излезе „неподал".
--
-- ПРАВИЛОТО за обект X и седмица W (W = понеделникът на деня на проверката):
--   изпълнено ⇔ за ВСЯКА активна бланка, която важи за X (target_stores NULL/
--   празно = всички), има поне един ред в supply_entries за (X, W) с поне една
--   непразна стойност. 0 се брои (отговор „нямаме"); NULL не се брои.
--   Бланка без нито един попълнен артикул = не е подадена. Частично попълнена
--   (1 от 12) = подадена — решение на Тенчо 05.10.2026; така брои и
--   send-routed-report (supplyHasVal).
--   Няма приложими бланки → false (няма какво да се докаже).
--
-- ПРОЗОРЕЦЪТ Е ДЕНЯТ. Функцията смята САМО за подадения (по подразбиране
-- днешния) ден и само ако задачата се пада днес (due_weekdays). Запис във
-- вторник НЕ отмята понеделника — без наваксване. Минал ден не се
-- преизчислява, тоест след края на деня резултатът е замразен.
--
-- ОТ КОГА: само за дни >= 2026-10-12. Същата дата е в AUTO_COMPLETE_FROM
-- ('supply') в shared.js и се сверява от tests/supply-auto-complete.test.js.
--
-- completed_by = 'auto:supply' — само по него се разпознава собствен ред при
-- махането. Кой е записал последната бланка остава в supply_entries.updated_by.
--
-- ПРЕДПАЗНА МРЕЖА: тригерът хваща грешката и пише RAISE WARNING, за да не
-- пропадне записът на бланката — но логовете никой не чете. Затова кронът
-- по-долу (на всеки час) преизчислява текущия ден за всички обекти и е
-- ЗАДЪЛЖИТЕЛЕН, не по избор. Пуска се отделно (cron.schedule не е идемпотентен):
--   select cron.schedule('supply-auto-complete', '0 * * * *',
--                        'select public.supply_sync_completions();');
--
-- Без нови таблици/колони → няма ред за Живко.
-- Rollback: 20261005120100_supply_auto_complete_down.sql

-- ═══ 1. ПОМОЩНИК: задачата за дадена седмица, със слята версия ═══════════
create or replace function public.supply_task_for_week(p_monday date)
returns table (task_id uuid, task_type text, due_idx int[], target_stores text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id,
         case when v.id is null then t.task_type else v.task_type end,
         coalesce(
           case when v.id is null then t.due_weekdays else v.due_weekdays end,
           array[ case when v.id is null then t.due_weekday else v.due_weekday end ]
         ),
         case when v.id is null then t.target_stores else v.target_stores end
    from recurring_tasks t
    left join lateral (
      select vv.id, vv.task_type, vv.due_weekdays, vv.due_weekday, vv.target_stores
        from recurring_task_versions vv
       where vv.recurring_task_id = t.id
         and vv.from_monday <= p_monday
         and (vv.to_monday is null or vv.to_monday >= p_monday)
       order by vv.from_monday desc
       limit 1
    ) v on true
   where t.linked_module = 'supply'
     and t.active
   limit 1;
$$;

comment on function public.supply_task_for_week(date) is
  'Постоянната задача с linked_module=''supply'' за седмицата на p_monday, със СЛЯТА версия (версията печели, не coalesce по поле). due_idx е масив от дни (0=Пон).';

-- ═══ 2. УСЛОВИЕТО ════════════════════════════════════════════════════════
create or replace function public.supply_store_done(p_store text, p_monday date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from supply_templates t
                  where coalesce(t.active, true)
                    and (t.target_stores is null
                         or cardinality(t.target_stores) = 0
                         or p_store = any(t.target_stores)))
     and not exists (
    select 1 from supply_templates t
     where coalesce(t.active, true)
       and (t.target_stores is null
            or cardinality(t.target_stores) = 0
            or p_store = any(t.target_stores))
       and not exists (
         select 1 from supply_entries e
          where e.template_id = t.id
            and e.store_name = p_store
            and e.week_start = p_monday
            and (e.qty1 is not null or e.qty2 is not null)));
$$;

comment on function public.supply_store_done(text, date) is
  'true ⇔ обектът има поне един ред с непразна стойност (0 се брои) във ВСЯКА активна бланка, която важи за него, за седмицата на p_monday. Без приложими бланки → false.';

-- ═══ 3. СИНХРОНИЗАЦИЯТА ══════════════════════════════════════════════════
create or replace function public.supply_sync_completions(
  p_store text default null, p_today date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today   date := coalesce(p_today, (now() at time zone 'Europe/Sofia')::date);
  v_monday  date;
  v_start   date := date '2026-10-12';   -- понеделник; по-рано не се пипа
  v_task    record;
  v_idx     int;
  v_excl    text[] := report_excluded_stores();
  v_stores  text[];
  v_n       integer := 0;
  v_tmp     integer;
begin
  if v_excl is null then
    raise warning 'supply_sync_completions: няма app_settings.report_excluded_stores — нищо не се прави';
    return 0;
  end if;

  if v_today < v_start then
    return 0;
  end if;

  v_monday := v_today - ((extract(isodow from v_today)::int) - 1);

  perform pg_advisory_xact_lock(hashtext('supply-sync:' || coalesce(p_store, '*')));

  select * into v_task from supply_task_for_week(v_monday);
  if v_task.task_id is null then
    return 0;
  end if;
  if coalesce(v_task.task_type, 'info') = 'notice' then
    return 0;
  end if;

  v_idx := (extract(isodow from v_today)::int) - 1;
  if v_task.due_idx is null or not (v_idx = any(v_task.due_idx)) then
    return 0;
  end if;

  v_stores := case
    when p_store is not null then array[p_store]
    else array(select distinct u.store_name
                 from users u
                where u.store_name is not null
                  and not (u.store_name = any(v_excl)))
  end;

  if v_task.target_stores is not null and cardinality(v_task.target_stores) > 0 then
    v_stores := array(select s from unnest(v_stores) as s
                       where s = any(v_task.target_stores));
  end if;
  if cardinality(v_stores) = 0 then
    return 0;
  end if;

  -- ДОБАВЯНЕ: `do nothing` пази ръчна отметка, отлагане и „не се отнася".
  insert into task_completions
         (recurring_task_id, store_name, completed_by, completed_at,
          status, completion_date)
  select v_task.task_id, s, 'auto:supply', now(), 'done', v_today
    from unnest(v_stores) as s
   where not (s = any(v_excl))
     and supply_store_done(s, v_monday)
  on conflict (recurring_task_id, store_name, completion_date)
     where recurring_task_id is not null and completion_date is not null
  do nothing;
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);

  -- МАХАНЕ: само свой ред и само за ДНЕС.
  delete from task_completions tc
   where tc.recurring_task_id = v_task.task_id
     and tc.completion_date = v_today
     and tc.completed_by = 'auto:supply'
     and tc.store_name = any(v_stores)
     and not supply_store_done(tc.store_name, v_monday);
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);

  return v_n;
end
$function$;

comment on function public.supply_sync_completions(text, date) is
  'Отмята/разотмята постоянната задача с linked_module=supply за обект (или за всички при p_store NULL) за ЕДИН ДЕН — подадения или днешния. Пише само ако денят се пада по due_weekdays и е >= 2026-10-12. Не пренаписва ръчна отметка/отлагане/not_applicable; трие само свои редове (auto:supply). Минал ден не се преизчислява.';

-- ═══ 4. ТРИГЕР върху supply_entries ══════════════════════════════════════
-- Statement-level с преходни таблици; обектите в азбучен ред (еднакъв ред на
-- ключалките), всеки в собствен BEGIN/EXCEPTION — записът на бланката не
-- пропада. Грешката е само предупреждение: мрежата е часовият крон.
create or replace function public.supply_sync_entries_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
  v_mon date := ((now() at time zone 'Europe/Sofia')::date)
              - ((extract(isodow from (now() at time zone 'Europe/Sofia')::date)::int) - 1);
begin
  if tg_op = 'INSERT' then
    for s in select distinct store_name from new_rows
              where week_start = v_mon order by 1 loop
      begin perform supply_sync_completions(s);
      exception when others then
        raise warning 'supply_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  elsif tg_op = 'DELETE' then
    for s in select distinct store_name from old_rows
              where week_start = v_mon order by 1 loop
      begin perform supply_sync_completions(s);
      exception when others then
        raise warning 'supply_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  else
    -- Само реална промяна на стойност/обект/седмица/бланка.
    for s in
      select distinct q.st from (
        select o.store_name as st, o.week_start as wk
          from old_rows o join new_rows n on n.id = o.id
         where n.qty1 is distinct from o.qty1 or n.qty2 is distinct from o.qty2
            or n.store_name is distinct from o.store_name
            or n.week_start is distinct from o.week_start
            or n.template_id is distinct from o.template_id
        union all
        select n.store_name, n.week_start
          from old_rows o join new_rows n on n.id = o.id
         where n.qty1 is distinct from o.qty1 or n.qty2 is distinct from o.qty2
            or n.store_name is distinct from o.store_name
            or n.week_start is distinct from o.week_start
            or n.template_id is distinct from o.template_id
      ) q
      where q.wk = v_mon
      order by 1 loop
      begin perform supply_sync_completions(s);
      exception when others then
        raise warning 'supply_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end
$function$;

drop trigger if exists supply_sync_entries_ins on public.supply_entries;
create trigger supply_sync_entries_ins
  after insert on public.supply_entries
  referencing new table as new_rows
  for each statement execute function supply_sync_entries_trg();

drop trigger if exists supply_sync_entries_del on public.supply_entries;
create trigger supply_sync_entries_del
  after delete on public.supply_entries
  referencing old table as old_rows
  for each statement execute function supply_sync_entries_trg();

drop trigger if exists supply_sync_entries_upd on public.supply_entries;
create trigger supply_sync_entries_upd
  after update on public.supply_entries
  referencing old table as old_rows new table as new_rows
  for each statement execute function supply_sync_entries_trg();

-- ═══ 5. ПРАВА ═══════════════════════════════════════════════════════════
-- Водещото =X/ (EXECUTE на PUBLIC) се маха изрично — вж. CLAUDE.md „Сигурност".
revoke execute on function public.supply_task_for_week(date) from public, anon, authenticated;
revoke execute on function public.supply_store_done(text, date) from public, anon, authenticated;
revoke execute on function public.supply_sync_completions(text, date) from public, anon, authenticated;
revoke execute on function public.supply_sync_entries_trg() from public, anon, authenticated;
