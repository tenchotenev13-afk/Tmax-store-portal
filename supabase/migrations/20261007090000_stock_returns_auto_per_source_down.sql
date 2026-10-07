-- Rollback на 20261007090000_stock_returns_auto_per_source
--
-- Връща функциите към вида от 20261002090100 (task_for_week с limit 1 по
-- основния запис; store_done без source). ⚠ РЕДЪТ: първо се връща
-- 20261007090100_..._data_down (връща linked_module), чак после тази —
-- иначе старата функция търси 'stock-returns' в основния запис и не намира нищо
-- (безвредно, но безсмислено).
--
-- Не връща изтритите отметки — те се връщат от _bak таблицата (data_down).

-- 1. Нови функции долу — sync_completions първо (зависи от тях).
drop function if exists public.stock_returns_sync_completions(text, date);
drop function if exists public.stock_returns_store_done(text, date, date, text);
drop function if exists public.stock_returns_tasks_for_week(date);

-- 2. Старите, дословно от 20261002090100_stock_returns_auto_complete.sql.
create or replace function public.stock_returns_task_for_week(p_monday date)
returns table (task_id uuid, task_type text, due_idx int, due_time text, target_stores text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id,
         case when v.id is null then t.task_type else v.task_type end,
         coalesce(
           (case when v.id is null then t.due_weekdays else v.due_weekdays end)[1],
           (case when v.id is null then t.due_weekday  else v.due_weekday  end)
         ),
         case when v.id is null then t.due_time else v.due_time end,
         case when v.id is null then t.target_stores else v.target_stores end
    from recurring_tasks t
    left join lateral (
      select vv.id, vv.task_type, vv.due_weekdays, vv.due_weekday, vv.due_time, vv.target_stores
        from recurring_task_versions vv
       where vv.recurring_task_id = t.id
         and vv.from_monday <= p_monday
         and (vv.to_monday is null or vv.to_monday >= p_monday)
       order by vv.from_monday desc
       limit 1
    ) v on true
   where t.linked_module = 'stock-returns'
     and t.active
   limit 1;
$$;

create or replace function public.stock_returns_store_done(
  p_store text, p_from date, p_upto date)
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
       and (confirmed_date is null
            or confirmed_date < p_from
            or confirmed_date > p_upto
            or confirmed_by is distinct from ('store:' || p_store)));
$$;

create or replace function public.stock_returns_sync_completions(
  p_store text default null, p_today date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today   date := coalesce(p_today, (now() at time zone 'Europe/Sofia')::date);
  v_monday  date;
  v_start   date := date '2026-10-05';
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
  if v_monday < v_start then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('sr-sync:' || coalesce(p_store, '*')));
  select * into v_task from stock_returns_task_for_week(v_monday);
  if v_task.task_id is null then return 0; end if;
  if coalesce(v_task.task_type, 'info') = 'notice' then return 0; end if;
  if v_task.due_idx is null then return 0; end if;
  v_due  := v_monday + v_task.due_idx;
  v_upto := least(v_today, v_due);
  if v_today > v_due then return 0; end if;
  v_stores := case
    when p_store is not null then array[p_store]
    else array(select distinct u.store_name from users u
                where u.store_name is not null and not (u.store_name = any(v_excl)))
  end;
  if v_task.target_stores is not null and cardinality(v_task.target_stores) > 0 then
    v_stores := array(select s from unnest(v_stores) as s where s = any(v_task.target_stores));
  end if;
  if cardinality(v_stores) = 0 then return 0; end if;
  insert into task_completions
         (recurring_task_id, store_name, completed_by, completed_at, status, completion_date)
  select v_task.task_id, s, 'auto:stock-returns', now(), 'done', v_due
    from unnest(v_stores) as s
   where not (s = any(v_excl))
     and stock_returns_store_done(s, v_monday, v_upto)
  on conflict (recurring_task_id, store_name, completion_date)
     where recurring_task_id is not null and completion_date is not null
  do nothing;
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);
  delete from task_completions tc
   where tc.recurring_task_id = v_task.task_id
     and tc.completion_date = v_due
     and tc.completed_by = 'auto:stock-returns'
     and tc.store_name = any(v_stores)
     and not stock_returns_store_done(tc.store_name, v_monday, v_upto);
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);
  return v_n;
end
$function$;

revoke execute on function public.stock_returns_task_for_week(date) from public, anon, authenticated;
revoke execute on function public.stock_returns_store_done(text, date, date) from public, anon, authenticated;
revoke execute on function public.stock_returns_sync_completions(text, date) from public, anon, authenticated;
