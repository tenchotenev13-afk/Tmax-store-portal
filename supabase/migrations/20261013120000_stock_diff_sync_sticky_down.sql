-- Rollback на 20261013120000_stock_diff_sync_sticky
--
-- Връща stock_diff_sync_completions ДОСЛОВНО както е от 20261004120000
-- (отметка auto:stock-diff и се добавя, и се трие в рамките на деня).
-- Отметките, дадени междувременно, ОСТАВАТ — при следващото пресмятане за
-- ДНЕС функцията пак ще маха тези, чийто обект има чакащ ред; миналите дни
-- не се пипат. Правата не се променят: create or replace пази ACL-а
-- (postgres, service_role).

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
