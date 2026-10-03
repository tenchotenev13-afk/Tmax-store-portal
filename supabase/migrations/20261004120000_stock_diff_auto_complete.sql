-- Автоматично отмятане на „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ" от „Разлики"
--
-- ЗАЩО. Задачата се отмяташе или от sdMarkDiffTask (всяко действие на обекта по
-- подадена бланка), или ръчно — а в базата двете са НЕРАЗЛИЧИМИ (completed_by е
-- името на човека). За 01.10.2026: 13 от 18 обекта отметнати, но девет от тях с
-- чакащи редове, а четири от петте неотметнати — без нищо чакащо. Вярна е била
-- 5 от 18.
--
-- ПРАВИЛОТО: изпълнено ⇔ в момента на проверката обектът няма ред, чакащ
-- НЕГОВОТО действие по МЕЖДУСКЛАДОВА разлика. Условието е дословният близнак
-- на sdUnreviewedCountFor() в stock-differences.js — същото, по което порталът
-- брои балончето на таба.
--
-- ПРОЗОРЕЦЪТ Е ДЕНЯТ. Задачата е пон–пет с пет отделни дни и без час, затова
-- completion_date = самият ден, функцията смята САМО за подадения (по
-- подразбиране днешния) ден, а минал ден никога не се преизчислява — оттам
-- идва и замразяването.
--
-- ОТ КОГА: само за дни >= 2026-10-12 (понеделник). Дните до 11.10 включително
-- не се пипат: дотогава задачата работи както досега, с ръчна отметка.
-- Същата дата стои и в портала (AUTO_COMPLETE_FROM в shared.js) и се сверява
-- от тест — разминат ли се, един ден задачата няма да е нито ръчна, нито
-- автоматична.
--
-- Пълното обяснение (кои статуси са извън сметката и защо, защо не „тих
-- период", какво точно е тествано и измерено) е в
-- stock-diff-auto-complete-schema.sql, който е огледало на този файл.
--
-- Кронът НЕ е тук — пуска се отделно (cron.schedule не е идемпотентен):
--   select cron.schedule('stock-diff-auto-complete', '0 * * * *',
--                        'select public.stock_diff_sync_completions();');
--
-- Rollback: 20261004120100_stock_diff_auto_complete_down.sql

-- ═══ 1. ПОМОЩНИК: задачата за дадена седмица, със слята версия ═══════════
-- Връща due_weekdays като МАСИВ (за разлика от „За връщане", където денят е
-- един): задачата се пада пет пъти в седмицата и всеки ден е отделна отметка.
create or replace function public.stock_diff_task_for_week(p_monday date)
returns table (task_id uuid, task_type text, due_idx int[], target_stores text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id,
         case when v.id is null then t.task_type else v.task_type end,
         /* due_weekdays, иначе един ден от due_weekday. Версията печели и
            когато е NULL — coalesce по поле би се разминал с екрана. */
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
   where t.linked_module = 'stock-diff'
     and t.active
   limit 1;
$$;

comment on function public.stock_diff_task_for_week(date) is
  'Постоянната задача „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ" за седмицата на p_monday, със СЛЯТА версия (recurring_task_versions). due_idx е МАСИВ от дни (0=Пон), защото задачата се пада пон–пет. Сливането е „версията печели", не coalesce по поле — както recurringApplyVersion() в shared.js.';

-- ═══ 2. УСЛОВИЕТО: чака ли нещо действието на обекта ═════════════════════
-- Дословен превод на sdUnreviewedCountFor() (клонът за магазин) от
-- stock-differences.js. Без прозорец по дата: въпросът е „в ТОЗИ момент".
create or replace function public.stock_diff_store_done(p_store text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not exists (
    /* 1. Складът е отговорил, обектът още не. 'will_send' не влиза — стоката
          още не е тръгнала; NULL не влиза — чака СКЛАДА; store_response
          'no_stock' вече е отговор, тоест ходът е на склада. */
    select 1
      from stock_differences d
      join differences_reports r on r.id = d.report_id
     where r.store_name = p_store
       and not coalesce(r.reviewed, false)
       and r.direction = 'interstore'
       and d.warehouse_response in ('sent','sent_sap','return')
       and d.store_response is null
       and coalesce(d.status, '') <> 'received'
    union all
    /* 2. Размяна, по която ходът е на обекта. И двете условия се искат —
          редът да е в НЕГОВА бланка И той да е съответната страна — точно
          както порталът пресича myMove с редовете на бланката.
          НЕПРОВЕРЕНО НА РЕАЛНИ ДАННИ: stock_diff_swaps е празна таблица
          (0 реда на 04.10.2026). Клонът е тестван само с fixture в
          транзакция. */
    select 1
      from stock_diff_swaps sw
      join stock_differences d
        on d.id = case when sw.status = 'linked' then sw.from_line_id else sw.to_line_id end
      join differences_reports r on r.id = d.report_id
     where r.store_name = p_store
       and not coalesce(r.reviewed, false)
       and r.direction = 'interstore'
       and ((sw.status = 'linked' and sw.from_store = p_store)
         or (sw.status = 'sent'   and sw.to_store   = p_store)));
$$;

comment on function public.stock_diff_store_done(text) is
  'Има ли обектът ред, чакащ НЕГОВОТО действие по междускладова разлика: непрегледана бланка, складът е отговорил sent/sent_sap/return, обектът не е отговорил и редът не е приключен; или размяна, по която ходът е негов. true = няма такъв ред (включително когато обектът няма разлики изобщо). will_send, празен отговор на склада и store_response=no_stock НЕ се броят — там ходът е на склада. Дословният близнак на sdUnreviewedCountFor() в stock-differences.js.';

-- ═══ 3. СИНХРОНИЗАЦИЯТА ══════════════════════════════════════════════════
create or replace function public.stock_diff_sync_completions(
  p_store text default null, p_today date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  /* p_today е за тест и за ръчно препускане на конкретен ден. Гейтът по дата
     важи спрямо него, тоест подаден ден не отваря вратичка. Функцията не е
     достъпна на anon/authenticated. */
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
    raise warning 'stock_diff_sync_completions: няма app_settings.report_excluded_stores — нищо не се прави';
    return 0;
  end if;

  /* Гейтът е по ДЕН, не по седмица (за разлика от „За връщане"): всеки ден е
     отделна отметка, значи 09.10 не бива да се пипа дори когато 12.10 вече е
     настъпил. Оттук идва и замразяването: функцията смята САМО за v_today и
     никога не преизчислява минал ден. */
  if v_today < v_start then
    return 0;
  end if;

  v_monday := v_today - ((extract(isodow from v_today)::int) - 1);

  /* ЗАКЛЮЧВАНЕ ПО ОБЕКТ вместо „тих период" (защо: виж заглавието). Ключалката
     е за транзакцията, значи редът на вземането ѝ съвпада с реда на комитите и
     последното пресмятане вижда всичко. При p_store = NULL (кронът) се взема
     една обща ключалка, за да не се застъпват две пускания. */
  perform pg_advisory_xact_lock(hashtext('sd-sync:' || coalesce(p_store, '*')));

  select * into v_task from stock_diff_task_for_week(v_monday);
  if v_task.task_id is null then
    return 0;                       -- няма такава активна задача
  end if;
  -- „Само за информация" НЕ се отмята: редове по нея никой не чете.
  if coalesce(v_task.task_type, 'info') = 'notice' then
    return 0;
  end if;

  -- Пада ли се задачата ДНЕС. 0 = понеделник, както в due_weekdays.
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

  -- target_stores — същото правило като на екрана: празно/NULL значи „всички".
  if v_task.target_stores is not null and cardinality(v_task.target_stores) > 0 then
    v_stores := array(select s from unnest(v_stores) as s
                       where s = any(v_task.target_stores));
  end if;
  if cardinality(v_stores) = 0 then
    return 0;
  end if;

  -- ДОБАВЯНЕ: само където няма чакащ ред. `do nothing` пази ръчната отметка,
  -- отлагането и „не се отнася за нас" — редът вече е там.
  insert into task_completions
         (recurring_task_id, store_name, completed_by, completed_at,
          status, completion_date)
  select v_task.task_id, s, 'auto:stock-diff', now(), 'done', v_today
    from unnest(v_stores) as s
   where not (s = any(v_excl))
     and stock_diff_store_done(s)
  on conflict (recurring_task_id, store_name, completion_date)
     where recurring_task_id is not null and completion_date is not null
  do nothing;
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);

  -- МАХАНЕ: появил се е нов чакащ ред. Трие се САМО свой ред и САМО за ДНЕС —
  -- миналите дни са замразени.
  delete from task_completions tc
   where tc.recurring_task_id = v_task.task_id
     and tc.completion_date = v_today
     and tc.completed_by = 'auto:stock-diff'
     and tc.store_name = any(v_stores)
     and not stock_diff_store_done(tc.store_name);
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);

  return v_n;
end
$function$;

comment on function public.stock_diff_sync_completions(text, date) is
  'Отмята/разотмята постоянната задача „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ" за обект (или за всички, ако p_store е NULL) за ЕДИН ДЕН — подадения или днешния. Пише само ако денят се пада по due_weekdays и е >= 2026-10-12; минал ден никога не се преизчислява, тоест след края на деня резултатът е замразен. Не пренаписва ръчна отметка, отлагане и not_applicable; трие само свои редове (auto:stock-diff). Взема advisory lock по обект.';

-- ═══ 4. ТРИГЕРИ — три таблици, защото условието зависи от три места ══════
-- Общият вид: statement-level, преходни таблици, по един обект наведнъж в
-- АЗБУЧЕН ред (ключалката се взема в един и същ ред от всички транзакции,
-- иначе две успоредни се заключват взаимно) и всеки в собствен
-- BEGIN/EXCEPTION, за да не събори чуждия запис.

-- 4а. РЕДОВЕТЕ на разликите. Обектът идва от БЛАНКАТА (differences_reports),
--     защото правилото брои по нея; преходната таблица носи само редовете,
--     затова има join. Отсява се по РЕАЛНА промяна на трите колони — списък с
--     колони в самия тригер е невъзможен заедно с преходни таблици (0A000) и
--     при PostgREST не би помогнал: тялото на PATCH-а носи колоната и когато
--     стойността е същата.
create or replace function public.stock_diff_sync_lines_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
begin
  if tg_op = 'INSERT' then
    for s in select distinct r.store_name
               from new_rows n join differences_reports r on r.id = n.report_id
              order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  elsif tg_op = 'DELETE' then
    for s in select distinct r.store_name
               from old_rows o join differences_reports r on r.id = o.report_id
              order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  else
    for s in
      select distinct r.store_name
        from old_rows o
        join new_rows n on n.id = o.id
        join differences_reports r on r.id = coalesce(n.report_id, o.report_id)
       where n.warehouse_response is distinct from o.warehouse_response
          or n.store_response     is distinct from o.store_response
          or n.status             is distinct from o.status
       order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end
$function$;

drop trigger if exists stock_diff_sync_lines_ins on public.stock_differences;
create trigger stock_diff_sync_lines_ins
  after insert on public.stock_differences
  referencing new table as new_rows
  for each statement execute function stock_diff_sync_lines_trg();

drop trigger if exists stock_diff_sync_lines_del on public.stock_differences;
create trigger stock_diff_sync_lines_del
  after delete on public.stock_differences
  referencing old table as old_rows
  for each statement execute function stock_diff_sync_lines_trg();

drop trigger if exists stock_diff_sync_lines_upd on public.stock_differences;
create trigger stock_diff_sync_lines_upd
  after update on public.stock_differences
  referencing old table as old_rows new table as new_rows
  for each statement execute function stock_diff_sync_lines_trg();

-- 4б. БЛАНКИТЕ. Приключването (reviewed) маха всичките ѝ чакащи редове от
--     сметката наведнъж, затова е отделен тригер. Обектът е в самата бланка.
create or replace function public.stock_diff_sync_reports_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
begin
  if tg_op = 'INSERT' then
    for s in select distinct store_name from new_rows order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  elsif tg_op = 'DELETE' then
    for s in select distinct store_name from old_rows order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  else
    /* Само реална промяна на reviewed или на обекта/посоката. Редакция на
       коментар или прикачена снимка не пипа условието. */
    for s in
      select distinct q.st from (
        select o.store_name as st from old_rows o join new_rows n on n.id = o.id
         where n.reviewed is distinct from o.reviewed
            or n.store_name is distinct from o.store_name
            or n.direction is distinct from o.direction
        union all
        select n.store_name from old_rows o join new_rows n on n.id = o.id
         where n.reviewed is distinct from o.reviewed
            or n.store_name is distinct from o.store_name
            or n.direction is distinct from o.direction
      ) q
      order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end
$function$;

drop trigger if exists stock_diff_sync_reports_ins on public.differences_reports;
create trigger stock_diff_sync_reports_ins
  after insert on public.differences_reports
  referencing new table as new_rows
  for each statement execute function stock_diff_sync_reports_trg();

drop trigger if exists stock_diff_sync_reports_del on public.differences_reports;
create trigger stock_diff_sync_reports_del
  after delete on public.differences_reports
  referencing old table as old_rows
  for each statement execute function stock_diff_sync_reports_trg();

drop trigger if exists stock_diff_sync_reports_upd on public.differences_reports;
create trigger stock_diff_sync_reports_upd
  after update on public.differences_reports
  referencing old table as old_rows new table as new_rows
  for each statement execute function stock_diff_sync_reports_trg();

-- 4в. РАЗМЕНИТЕ. Ходът се мести между двата обекта със смяната на status,
--     затова се пресмятат И двете страни — и старата, и новата стойност на
--     from_store/to_store, в случай че някой пренасочи размяната.
create or replace function public.stock_diff_sync_swaps_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
begin
  if tg_op = 'INSERT' then
    for s in select distinct st from (
               select from_store as st from new_rows
               union all select to_store from new_rows) q
             where st is not null order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  elsif tg_op = 'DELETE' then
    for s in select distinct st from (
               select from_store as st from old_rows
               union all select to_store from old_rows) q
             where st is not null order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  else
    for s in select distinct st from (
               select o.from_store as st from old_rows o join new_rows n on n.id = o.id
                where n.status is distinct from o.status
                   or n.from_store is distinct from o.from_store
                   or n.to_store is distinct from o.to_store
               union all
               select o.to_store from old_rows o join new_rows n on n.id = o.id
                where n.status is distinct from o.status
                   or n.from_store is distinct from o.from_store
                   or n.to_store is distinct from o.to_store
               union all
               select n.from_store from old_rows o join new_rows n on n.id = o.id
                where n.status is distinct from o.status
                   or n.from_store is distinct from o.from_store
                   or n.to_store is distinct from o.to_store
               union all
               select n.to_store from old_rows o join new_rows n on n.id = o.id
                where n.status is distinct from o.status
                   or n.from_store is distinct from o.from_store
                   or n.to_store is distinct from o.to_store) q
             where st is not null order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end
$function$;

drop trigger if exists stock_diff_sync_swaps_ins on public.stock_diff_swaps;
create trigger stock_diff_sync_swaps_ins
  after insert on public.stock_diff_swaps
  referencing new table as new_rows
  for each statement execute function stock_diff_sync_swaps_trg();

drop trigger if exists stock_diff_sync_swaps_del on public.stock_diff_swaps;
create trigger stock_diff_sync_swaps_del
  after delete on public.stock_diff_swaps
  referencing old table as old_rows
  for each statement execute function stock_diff_sync_swaps_trg();

drop trigger if exists stock_diff_sync_swaps_upd on public.stock_diff_swaps;
create trigger stock_diff_sync_swaps_upd
  after update on public.stock_diff_swaps
  referencing old table as old_rows new table as new_rows
  for each statement execute function stock_diff_sync_swaps_trg();

-- ═══ 4г. ПРАВА ═══════════════════════════════════════════════════════════
-- По образеца на stock_returns_* и transit_sync_completions: само postgres и
-- service_role. Водещото `=X/` (EXECUTE на PUBLIC) се маха ИЗРИЧНО — revoke
-- само от anon/authenticated не върши нищо, защото правото се наследява от
-- PUBLIC (случаят perform_daily_backup, 23.09.2026). Тригерите пак работят:
-- изпълнението на тригерна функция не проверява EXECUTE, а самите те са
-- security definer, значи вътрешните извиквания минават като собственика.
revoke execute on function public.stock_diff_task_for_week(date) from public, anon, authenticated;
revoke execute on function public.stock_diff_store_done(text) from public, anon, authenticated;
revoke execute on function public.stock_diff_sync_completions(text, date) from public, anon, authenticated;
revoke execute on function public.stock_diff_sync_lines_trg() from public, anon, authenticated;
revoke execute on function public.stock_diff_sync_reports_trg() from public, anon, authenticated;
revoke execute on function public.stock_diff_sync_swaps_trg() from public, anon, authenticated;
