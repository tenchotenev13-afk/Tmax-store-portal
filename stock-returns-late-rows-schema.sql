-- stock-returns-late-rows-schema.sql
-- „За връщане": ред, влязъл в деня на срока, не се брои за тази седмица.
-- Приложено в Supabase (xiwkdiqqplgdcrkewgtv) на 23.10.2026, версия 20261023085400.
-- Миграция: supabase/migrations/20261023085400_stock_returns_late_rows.sql
-- Rollback: supabase/migrations/20261023085400_stock_returns_late_rows_down.sql
--   (дословно и в коментар най-долу в този файл).
-- SQL тест: tests/sql/stock-returns-late-rows.test.sql
-- Огледало (Живко): НЯМА ред — нова таблица/колона/статус няма.

-- „За връщане": ред, влязъл В ДЕНЯ НА СРОКА, не се брои за тази седмица
-- (решение на Тенчо с Цветелина и Миглена, 22.10.2026).
--
-- ПОВОД. На 21.10.2026 (сряда, срок на „Изтегляне по разлики") между 16:34 и
-- 17:52 влязоха 7 реда source='diff' (Козлодуй, Троян, Пирдоп, Севлиево ×2,
-- Силистра, Търговище) — всичките от решенията на Цветелина в „Разлики"
-- (resolveDiffLine → autoCreateReturnFromDiff). Обектите бяха потвърдили
-- списъците си по-рано през деня и получиха хикс за ред, който не са имали
-- как да видят навреме.
--
-- ПРАВИЛОТО. Ред в stock_returns, създаден в деня на срока на задачата (дата
-- по Europe/Sofia = v_due), НЕ се брои за тази седмица — независимо кой го е
-- създал. Не маха вече поставена отметка и не пречи на поставянето ѝ. От
-- следващия понеделник се брои нормално: обектът трябва да го потвърди в
-- новата седмица (прозорецът p_from тогава е новият понеделник, а p_due —
-- новият срок, значи изключението вече не го хваща).
-- Ред, влязъл ПРЕДИ деня на срока, се брои както досега (маха отметката,
-- докато обектът не го потвърди).
--
-- ПРОМЕНЯ СИГНАТУРА (затова drop, не create or replace):
--   stock_returns_store_done(text,date,date,text) → (text,date,date,text,date)
--   p_due default null = старото поведение (няма изключение).
-- Единствен викач е stock_returns_sync_completions (проверено в pg_proc,
-- 22.10.2026) — той подава v_due и в insert-а, и в delete-а. Нищо друго в
-- двете функции не е пипнато. Тригерите и кронът не се пипат.
--
-- Огледало (Живко): НЯМА ред — нова таблица/колона/статус няма, функциите не
-- са в огледалото.
--
-- Rollback: 20261023085400_stock_returns_late_rows_down.sql

-- ═══ 1. УСЛОВИЕТО — с изключение за деня на срока ═══════════════════════
drop function if exists public.stock_returns_store_done(text, date, date, text);

create or replace function public.stock_returns_store_done(
  p_store text, p_from date, p_upto date, p_source text, p_due date default null)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not exists (
    select 1 from stock_returns
     where store_name = p_store
       and status = 'pending'
       and source = p_source
       /* ВЛЯЗЪЛ В ДЕНЯ НА СРОКА — не се брои за тази седмица (22.10.2026).
          Датата е по Europe/Sofia, не UTC: ред в 01:30 българско е от същия
          ден, а по UTC е от предишния. */
       and (p_due is null
            or (created_at at time zone 'Europe/Sofia')::date <> p_due)
       and (confirmed_date is null
            or confirmed_date < p_from
            or confirmed_date > p_upto
            /* АКТУАЛИЗАЦИЯТА ТРЯБВА ДА Е НА ОБЕКТА — виж 20261002090100 и
               stock-returns-confirmed-by-schema.sql. Непроменено. */
            or confirmed_by is distinct from ('store:' || p_store)));
$$;

comment on function public.stock_returns_store_done(text, date, date, text, date) is
  'Има ли обектът НЕВЗЕТ запис от този source (complaint/diff) без актуализация в [p_from .. p_upto], направена ОТ САМИЯ ОБЕКТ (confirmed_by = store:<обект>). true = всичко е актуализирано, включително когато обектът няма невзети записи от този source. Бъдеща дата не се зачита. Дата от офис или импорт не се зачита. Запис, създаден в деня p_due (Europe/Sofia), не се брои (22.10.2026); p_due NULL = без изключение.';

-- ═══ 2. СИНХРОНИЗАЦИЯТА — подава v_due; иначе дословно живата версия ═════
create or replace function public.stock_returns_sync_completions(
  p_store text default null, p_today date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  /* p_today е САМО за тест и за ръчно препускане на конкретен ден. Всички
     гейтове (началната седмица, замразяването след срока) важат спрямо него.
     Функцията не е достъпна на anon/authenticated. */
  v_today   date := coalesce(p_today, (now() at time zone 'Europe/Sofia')::date);
  v_monday  date;
  v_start   date := date '2026-10-05';   -- от тази седмица нататък, не по-рано
  v_task    record;
  v_due     date;
  v_upto    date;
  v_excl    text[] := report_excluded_stores();
  v_stores  text[];
  v_n       integer := 0;
  v_tmp     integer;
begin
  v_monday := v_today - ((extract(isodow from v_today)::int) - 1);

  if v_excl is null then
    raise warning 'stock_returns_sync_completions: няма app_settings.report_excluded_stores — нищо не се прави';
    return 0;
  end if;

  -- Миналото не се пипа. Проверката е по СЕДМИЦАТА, не по днешната дата.
  if v_monday < v_start then
    return 0;
  end if;

  /* ЗАКЛЮЧВАНЕ ПО ОБЕКТ — непроменено (защо: 20261002090100). Една ключалка за
     цялото извикване, не по задача: двете задачи на един обект се пресмятат
     последователно в една транзакция. */
  perform pg_advisory_xact_lock(hashtext('sr-sync:' || coalesce(p_store, '*')));

  for v_task in select * from stock_returns_tasks_for_week(v_monday) loop
    -- „Само за информация" не се отмята. continue, не return: другата задача
    -- може да е за отмятане.
    if coalesce(v_task.task_type, 'info') = 'notice' then continue; end if;
    if v_task.due_idx is null then continue; end if;   -- няма ден → няма прозорец

    v_due  := v_monday + v_task.due_idx;
    v_upto := least(v_today, v_due);

    -- ЗАМРАЗЯВАНЕ: след деня на срока на ТАЗИ задача нищо не се пипа.
    if v_today > v_due then continue; end if;

    v_stores := case
      when p_store is not null then array[p_store]
      else array(select distinct u.store_name
                   from users u
                  where u.store_name is not null
                    and not (u.store_name = any(v_excl)))
    end;

    -- target_stores: празно/NULL значи „всички обекти".
    if v_task.target_stores is not null and cardinality(v_task.target_stores) > 0 then
      v_stores := array(select s from unnest(v_stores) as s
                         where s = any(v_task.target_stores));
    end if;
    if cardinality(v_stores) = 0 then continue; end if;

    -- ДОБАВЯНЕ: `do nothing` пази ръчната отметка, отлагането и „не се отнася".
    -- v_due: запис, влязъл в деня на срока, не пречи (22.10.2026).
    insert into task_completions
           (recurring_task_id, store_name, completed_by, completed_at,
            status, completion_date)
    select v_task.task_id, s, 'auto:stock-returns', now(), 'done', v_due
      from unnest(v_stores) as s
     where not (s = any(v_excl))
       and stock_returns_store_done(s, v_monday, v_upto, v_task.source, v_due)
    on conflict (recurring_task_id, store_name, completion_date)
       where recurring_task_id is not null and completion_date is not null
    do nothing;
    get diagnostics v_tmp = row_count;
    v_n := v_n + coalesce(v_tmp, 0);

    -- МАХАНЕ: само свой ред ('auto:stock-returns') и само на тази задача.
    -- v_due: запис, влязъл в деня на срока, не маха отметката (22.10.2026).
    delete from task_completions tc
     where tc.recurring_task_id = v_task.task_id
       and tc.completion_date = v_due
       and tc.completed_by = 'auto:stock-returns'
       and tc.store_name = any(v_stores)
       and not stock_returns_store_done(tc.store_name, v_monday, v_upto, v_task.source, v_due);
    get diagnostics v_tmp = row_count;
    v_n := v_n + coalesce(v_tmp, 0);
  end loop;

  return v_n;
end
$function$;

-- ═══ 3. ПРАВА ════════════════════════════════════════════════════════════
-- Новата функция получава EXECUTE на PUBLIC по подразбиране — маха се
-- изрично (случаят perform_daily_backup, 23.09.2026). Живият ACL и на двете е
-- {postgres, service_role} — повтаря се и за sync_completions.
revoke execute on function public.stock_returns_store_done(text, date, date, text, date) from public, anon, authenticated;
revoke execute on function public.stock_returns_sync_completions(text, date) from public, anon, authenticated;
grant execute on function public.stock_returns_store_done(text, date, date, text, date) to service_role;

-- ═══ ROLLBACK (дословно _down.sql; закоментиран, за да не се пусне с горното) ═══
-- -- Rollback на 20261023085400_stock_returns_late_rows
-- --
-- -- Връща двете функции ДОСЛОВНО към живите дефиниции отпреди промяната
-- -- (pg_get_functiondef, 22.10.2026): store_done с 4 параметъра, без
-- -- изключението за деня на срока; sync_completions без v_due в двете извиквания.
-- -- РЕДЪТ: старата store_done първо, после sync_completions (вика нея), накрая
-- -- drop на новата 5-параметрова.
--
-- -- 1. Старата store_done (4 параметъра) — дословно.
-- create or replace function public.stock_returns_store_done(p_store text, p_from date, p_upto date, p_source text)
--  returns boolean
--  language sql
--  stable security definer
--  set search_path to 'public'
-- as $function$
--   select not exists (
--     select 1 from stock_returns
--      where store_name = p_store
--        and status = 'pending'
--        and source = p_source
--        and (confirmed_date is null
--             or confirmed_date < p_from
--             or confirmed_date > p_upto
--             /* АКТУАЛИЗАЦИЯТА ТРЯБВА ДА Е НА ОБЕКТА — виж 20261002090100 и
--                stock-returns-confirmed-by-schema.sql. Непроменено. */
--             or confirmed_by is distinct from ('store:' || p_store)));
-- $function$;
--
-- comment on function public.stock_returns_store_done(text, date, date, text) is
--   'Има ли обектът НЕВЗЕТ запис от този source (complaint/diff) без актуализация в [p_from .. p_upto], направена ОТ САМИЯ ОБЕКТ (confirmed_by = store:<обект>). true = всичко е актуализирано, включително когато обектът няма невзети записи от този source. Бъдеща дата не се зачита. Дата от офис или импорт не се зачита.';
--
-- revoke execute on function public.stock_returns_store_done(text, date, date, text) from public, anon, authenticated;
-- grant execute on function public.stock_returns_store_done(text, date, date, text) to service_role;
--
-- -- 2. sync_completions — дословно живата версия отпреди промяната.
-- create or replace function public.stock_returns_sync_completions(
--   p_store text default null, p_today date default null)
-- returns integer
-- language plpgsql
-- security definer
-- set search_path to 'public'
-- as $function$
-- declare
--   /* p_today е САМО за тест и за ръчно препускане на конкретен ден. Всички
--      гейтове (началната седмица, замразяването след срока) важат спрямо него.
--      Функцията не е достъпна на anon/authenticated. */
--   v_today   date := coalesce(p_today, (now() at time zone 'Europe/Sofia')::date);
--   v_monday  date;
--   v_start   date := date '2026-10-05';   -- от тази седмица нататък, не по-рано
--   v_task    record;
--   v_due     date;
--   v_upto    date;
--   v_excl    text[] := report_excluded_stores();
--   v_stores  text[];
--   v_n       integer := 0;
--   v_tmp     integer;
-- begin
--   v_monday := v_today - ((extract(isodow from v_today)::int) - 1);
--
--   if v_excl is null then
--     raise warning 'stock_returns_sync_completions: няма app_settings.report_excluded_stores — нищо не се прави';
--     return 0;
--   end if;
--
--   -- Миналото не се пипа. Проверката е по СЕДМИЦАТА, не по днешната дата.
--   if v_monday < v_start then
--     return 0;
--   end if;
--
--   /* ЗАКЛЮЧВАНЕ ПО ОБЕКТ — непроменено (защо: 20261002090100). Една ключалка за
--      цялото извикване, не по задача: двете задачи на един обект се пресмятат
--      последователно в една транзакция. */
--   perform pg_advisory_xact_lock(hashtext('sr-sync:' || coalesce(p_store, '*')));
--
--   for v_task in select * from stock_returns_tasks_for_week(v_monday) loop
--     -- „Само за информация" не се отмята. continue, не return: другата задача
--     -- може да е за отмятане.
--     if coalesce(v_task.task_type, 'info') = 'notice' then continue; end if;
--     if v_task.due_idx is null then continue; end if;   -- няма ден → няма прозорец
--
--     v_due  := v_monday + v_task.due_idx;
--     v_upto := least(v_today, v_due);
--
--     -- ЗАМРАЗЯВАНЕ: след деня на срока на ТАЗИ задача нищо не се пипа.
--     if v_today > v_due then continue; end if;
--
--     v_stores := case
--       when p_store is not null then array[p_store]
--       else array(select distinct u.store_name
--                    from users u
--                   where u.store_name is not null
--                     and not (u.store_name = any(v_excl)))
--     end;
--
--     -- target_stores: празно/NULL значи „всички обекти".
--     if v_task.target_stores is not null and cardinality(v_task.target_stores) > 0 then
--       v_stores := array(select s from unnest(v_stores) as s
--                          where s = any(v_task.target_stores));
--     end if;
--     if cardinality(v_stores) = 0 then continue; end if;
--
--     -- ДОБАВЯНЕ: `do nothing` пази ръчната отметка, отлагането и „не се отнася".
--     insert into task_completions
--            (recurring_task_id, store_name, completed_by, completed_at,
--             status, completion_date)
--     select v_task.task_id, s, 'auto:stock-returns', now(), 'done', v_due
--       from unnest(v_stores) as s
--      where not (s = any(v_excl))
--        and stock_returns_store_done(s, v_monday, v_upto, v_task.source)
--     on conflict (recurring_task_id, store_name, completion_date)
--        where recurring_task_id is not null and completion_date is not null
--     do nothing;
--     get diagnostics v_tmp = row_count;
--     v_n := v_n + coalesce(v_tmp, 0);
--
--     -- МАХАНЕ: само свой ред ('auto:stock-returns') и само на тази задача.
--     delete from task_completions tc
--      where tc.recurring_task_id = v_task.task_id
--        and tc.completion_date = v_due
--        and tc.completed_by = 'auto:stock-returns'
--        and tc.store_name = any(v_stores)
--        and not stock_returns_store_done(tc.store_name, v_monday, v_upto, v_task.source);
--     get diagnostics v_tmp = row_count;
--     v_n := v_n + coalesce(v_tmp, 0);
--   end loop;
--
--   return v_n;
-- end
-- $function$;
--
-- -- 3. Новата store_done долу.
-- drop function if exists public.stock_returns_store_done(text, date, date, text, date);
--
