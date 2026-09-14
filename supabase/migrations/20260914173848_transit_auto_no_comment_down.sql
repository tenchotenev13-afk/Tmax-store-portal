-- Rollback на 20260914173848_transit_auto_no_comment.sql
--
-- Връща тялото на transit_sync_completions от 20260914125444: автоматичната
-- отметка отново пише comment='всички редове обработени'. Вече записаните
-- отметки без коментар НЕ се попълват със задна дата.
-- Права и тригери не се пипат — CREATE OR REPLACE ги пази.

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
  if p_store is null or not transit_store_done(p_store) then
    return 0;
  end if;

  insert into task_completions
         (task_id, bulletin_id, store_name, completed_by, completed_at,
          status, completion_date, comment)
  select bt.id, bt.bulletin_id, p_store, 'auto:transit', now(),
         'done', coalesce(bt.due_dates[1], bt.due_date), 'всички редове обработени'
    from bulletin_tasks bt
   where bt.linked_module = 'transit'
     and bt.auto_complete
     and coalesce(cardinality(bt.due_dates), 0) <= 1
     and coalesce(bt.due_dates[1], bt.due_date) is not null
     and coalesce(bt.due_dates[1], bt.due_date) >= v_today - 14
     and (bt.target_stores is null
          or cardinality(bt.target_stores) = 0
          or p_store = any(bt.target_stores))
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

comment on function public.transit_sync_completions(text) is
  'Записва done за автоматичните transit задачи на обекта, ако transit_store_done. Не трие; postponed за същия ден става done (postponed_to и коментарът се пазят).';
