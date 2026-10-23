-- Rollback на 20261023085400_stock_returns_late_rows
--
-- Връща двете функции ДОСЛОВНО към живите дефиниции отпреди промяната
-- (pg_get_functiondef, 22.10.2026): store_done с 4 параметъра, без
-- изключението за деня на срока; sync_completions без v_due в двете извиквания.
-- РЕДЪТ: старата store_done първо, после sync_completions (вика нея), накрая
-- drop на новата 5-параметрова.

-- 1. Старата store_done (4 параметъра) — дословно.
create or replace function public.stock_returns_store_done(p_store text, p_from date, p_upto date, p_source text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
$function$;

comment on function public.stock_returns_store_done(text, date, date, text) is
  'Има ли обектът НЕВЗЕТ запис от този source (complaint/diff) без актуализация в [p_from .. p_upto], направена ОТ САМИЯ ОБЕКТ (confirmed_by = store:<обект>). true = всичко е актуализирано, включително когато обектът няма невзети записи от този source. Бъдеща дата не се зачита. Дата от офис или импорт не се зачита.';

revoke execute on function public.stock_returns_store_done(text, date, date, text) from public, anon, authenticated;
grant execute on function public.stock_returns_store_done(text, date, date, text) to service_role;

-- 2. sync_completions — дословно живата версия отпреди промяната.
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

-- 3. Новата store_done долу.
drop function if exists public.stock_returns_store_done(text, date, date, text, date);
