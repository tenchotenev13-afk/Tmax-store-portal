-- „За връщане": автоматичното отмятане минава от „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ"
-- към двете списъчни задачи, всяка със своя source.
--
-- ЗАЩО. „Срок на годност" е физическа проверка в магазина + въвеждане в SAP —
-- порталът няма откъде да знае дали е направена, значи трябва да е ръчна.
-- Двете списъчни задачи имат смислено условие в данните:
--   „СПИСЪК СТОКА ЗА ВРЪЩАНЕ"               ← stock_returns.source = 'complaint'
--   „СПИСЪК СТОКА ЗА ИЗТЕГЛЯНЕ ПО РАЗЛИКИ"  ← stock_returns.source = 'diff'
--
-- КАК ЗАДАЧАТА КАЗВА КОЙ SOURCE ГЛЕДА. Две стойности на linked_module:
--   'stock-returns-complaint' → 'complaint'
--   'stock-returns-diff'      → 'diff'
-- Съответствието е на ЕДНО място — CASE в stock_returns_tasks_for_week. Без
-- сравнение по заглавие и без uuid-та. Старата стойност 'stock-returns' вече НЕ
-- е автоматична (функцията я не търси) — остава само като бутон към таба.
--
-- ЧЕТЕНЕ ОТ СЛЯТАТА ВЕРСИЯ. Старата функция четеше `t.linked_module` от
-- основния запис (`limit 1`) — затова не виждаше списъчните задачи, вързани
-- само във версията от 05.10. Сега linked_module се слива като останалите
-- полета („версията печели, и при NULL" — recurringApplyVersion() в shared.js)
-- и се обработва ВСЯКА свързана задача.
--
-- ПРОМЕНЯ СИГНАТУРИ (затова drop, не create or replace):
--   stock_returns_task_for_week(date)           → stock_returns_tasks_for_week(date)
--                                                  (set of; нова колона source)
--   stock_returns_store_done(text,date,date)    → (text,date,date,text)
-- Единствен викач и на двете е stock_returns_sync_completions (проверено в
-- pg_proc). Тригерната функция и самите тригери не се пипат — викат
-- sync_completions(обект), чиято сигнатура е същата.
--
-- Данните (изтриване на грешните отметки, пренасочване на linked_module) са в
-- 20261007090100_stock_returns_auto_per_source_data.sql — прилага се СЛЕД тази.
--
-- Нова таблица/колона няма (ред за Живко не е нужен).
--
-- Rollback: 20261007090000_stock_returns_auto_per_source_down.sql

-- ═══ 1. ЗАДАЧИТЕ ЗА СЕДМИЦАТА — със слят linked_module, без limit 1 ══════
drop function if exists public.stock_returns_task_for_week(date);

create or replace function public.stock_returns_tasks_for_week(p_monday date)
returns table (task_id uuid, source text, task_type text, due_idx int,
               due_time text, target_stores text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.id,
         /* ЕДИНСТВЕНОТО място, което знае кой linked_module на кой source
            отговаря. Нова стойност, която не е тук, се игнорира (source IS NULL
            отпада по-долу) — не се отмята „всичко". */
         case m.linked_module
           when 'stock-returns-complaint' then 'complaint'
           when 'stock-returns-diff'      then 'diff'
         end,
         m.task_type,
         coalesce(m.due_weekdays[1], m.due_weekday),
         m.due_time,
         m.target_stores
    from (
      select t.id,
             case when v.id is null then t.linked_module else v.linked_module end as linked_module,
             case when v.id is null then t.task_type     else v.task_type     end as task_type,
             case when v.id is null then t.due_weekdays  else v.due_weekdays  end as due_weekdays,
             case when v.id is null then t.due_weekday   else v.due_weekday   end as due_weekday,
             case when v.id is null then t.due_time      else v.due_time      end as due_time,
             /* target_stores също е седмично съдържание — виж бележката в
                20261002090100: иначе базата отмята обект, който екранът не
                показва. */
             case when v.id is null then t.target_stores else v.target_stores end as target_stores
        from recurring_tasks t
        left join lateral (
          select vv.id, vv.linked_module, vv.task_type, vv.due_weekdays,
                 vv.due_weekday, vv.due_time, vv.target_stores
            from recurring_task_versions vv
           where vv.recurring_task_id = t.id
             and vv.from_monday <= p_monday
             and (vv.to_monday is null or vv.to_monday >= p_monday)
           order by vv.from_monday desc
           limit 1
        ) v on true
       where t.active
    ) m
   where m.linked_module in ('stock-returns-complaint', 'stock-returns-diff');
$$;

comment on function public.stock_returns_tasks_for_week(date) is
  'Активните постоянни задачи за седмицата на p_monday, вързани към „За връщане" (linked_module stock-returns-complaint / stock-returns-diff), със СЛЯТА версия — „версията печели", както recurringApplyVersion() в shared.js. source е stock_returns.source, по който задачата се отмята. Връща ВСИЧКИ такива задачи (без limit 1).';

-- ═══ 2. УСЛОВИЕТО — вече по source ═══════════════════════════════════════
drop function if exists public.stock_returns_store_done(text, date, date);

create or replace function public.stock_returns_store_done(
  p_store text, p_from date, p_upto date, p_source text)
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
       and (confirmed_date is null
            or confirmed_date < p_from
            or confirmed_date > p_upto
            /* АКТУАЛИЗАЦИЯТА ТРЯБВА ДА Е НА ОБЕКТА — виж 20261002090100 и
               stock-returns-confirmed-by-schema.sql. Непроменено. */
            or confirmed_by is distinct from ('store:' || p_store)));
$$;

comment on function public.stock_returns_store_done(text, date, date, text) is
  'Има ли обектът НЕВЗЕТ запис от този source (complaint/diff) без актуализация в [p_from .. p_upto], направена ОТ САМИЯ ОБЕКТ (confirmed_by = store:<обект>). true = всичко е актуализирано, включително когато обектът няма невзети записи от този source. Бъдеща дата не се зачита. Дата от офис или импорт не се зачита.';

-- ═══ 3. СИНХРОНИЗАЦИЯТА — цикъл по задачите ══════════════════════════════
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
    insert into task_completions
           (recurring_task_id, store_name, completed_by, completed_at,
            status, completion_date)
    select v_task.task_id, s, 'auto:stock-returns', now(), 'done', v_due
      from unnest(v_stores) as s
     where not (s = any(v_excl))
       and stock_returns_store_done(s, v_monday, v_upto, v_task.source)
    on conflict (recurring_task_id, store_name, completion_date)
       where recurring_task_id is not null and completion_date is not null
    do nothing;
    get diagnostics v_tmp = row_count;
    v_n := v_n + coalesce(v_tmp, 0);

    -- МАХАНЕ: само свой ред ('auto:stock-returns') и само на тази задача.
    delete from task_completions tc
     where tc.recurring_task_id = v_task.task_id
       and tc.completion_date = v_due
       and tc.completed_by = 'auto:stock-returns'
       and tc.store_name = any(v_stores)
       and not stock_returns_store_done(tc.store_name, v_monday, v_upto, v_task.source);
    get diagnostics v_tmp = row_count;
    v_n := v_n + coalesce(v_tmp, 0);
  end loop;

  return v_n;
end
$function$;

comment on function public.stock_returns_sync_completions(text, date) is
  'Отмята/разотмята постоянните задачи, вързани към „За връщане" (linked_module stock-returns-complaint / stock-returns-diff), за обект (или за всички, ако p_store е NULL) за ТЕКУЩАТА седмица — всяка по записите от своя source. Пише само в прозореца понеделник..ден на срока на задачата; след него замразява. Не пренаписва ръчна отметка, отлагане и not_applicable; трие само свои редове (auto:stock-returns). Седмици преди 2026-10-05 не се пипат. Advisory lock по обект. p_today е само за тест/ръчно препускане.';

-- ═══ 4. ПРАВА ════════════════════════════════════════════════════════════
-- Новите функции получават EXECUTE на PUBLIC по подразбиране — маха се
-- изрично (случаят perform_daily_backup, 23.09.2026). create or replace на
-- sync_completions запазва ACL-а му, но се повтаря за сигурност.
revoke execute on function public.stock_returns_tasks_for_week(date) from public, anon, authenticated;
revoke execute on function public.stock_returns_store_done(text, date, date, text) from public, anon, authenticated;
revoke execute on function public.stock_returns_sync_completions(text, date) from public, anon, authenticated;
