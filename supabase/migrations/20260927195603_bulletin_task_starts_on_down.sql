-- Rollback на bulletin_task_starts_on
--
-- Три неща, в обратен ред: тригерът се връща без starts_on, двете функции се
-- връщат към версията без прозорец, колоната и двата CHECK-а падат.
--
-- Отмятанията в task_completions НЕ се пипат: те са валидни и при двете
-- версии (completion_date = срокът). Губи се само знанието коя задача от кога
-- е в сила, тоест многоседмичните се връщат към „в сила от понеделника на
-- седмицата си".
--
-- ВНИМАНИЕ: докато колоната още съществува, връщането на старата
-- transit_sync_completions() значи, че задача с starts_on в бъдещето ще се
-- отмята по СТАРАТА партида (точно бъгът, заради който прозорецът съществува).
-- Затова редът е такъв: първо тригерът и функциите, после колоната — а ако
-- има живи задачи със starts_on, те трябва да се изчистят ПРЕДИ това.

drop trigger if exists bulletin_tasks_transit_sync on public.bulletin_tasks;
create trigger bulletin_tasks_transit_sync
  after insert or update of auto_complete, linked_module, due_date, due_dates,
                            target_stores
  on public.bulletin_tasks
  for each row execute function bulletin_tasks_transit_sync_trg();

create or replace function public.transit_store_done(p_store text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
           select 1 from goods_transit
            where store_name = p_store and direction = 'incoming')
     and not exists (
           select 1 from goods_transit
            where store_name = p_store and direction = 'incoming'
              and coalesce(status, 'pending') = 'pending'
              and reviewed_at is null);
$function$;

create or replace function public.transit_sync_completions(p_store text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/Sofia')::date;
  v_n     integer := 0;
begin
  if p_store is null or not transit_store_done(p_store) then
    return 0;
  end if;

  insert into task_completions
         (task_id, bulletin_id, store_name, completed_by, completed_at,
          status, completion_date)
  select bt.id, bt.bulletin_id, p_store, 'auto:transit', now(),
         'done', coalesce(bt.due_dates[1], bt.due_date)
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
$function$;

drop function if exists public.transit_store_done_since(text, date);

alter table public.bulletin_tasks
  drop constraint if exists bulletin_tasks_starts_on_range_chk,
  drop constraint if exists bulletin_tasks_starts_on_span_chk;

alter table public.bulletin_tasks
  drop column if exists starts_on;
