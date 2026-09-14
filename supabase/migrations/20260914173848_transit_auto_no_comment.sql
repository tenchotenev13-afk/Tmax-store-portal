-- Автоматичната отметка „Стока на път" — без коментар
--
-- ═══ ЗАЩО ═══════════════════════════════════════════════════════════════
-- transit_sync_completions (20260914125444) пишеше comment='всички редове
-- обработени'. Отчетите (report.js „💬 Коментари по обекти", send-scheduled-
-- report, send-routed-report) и „Днес" показват коментара на всяка изпълнена
-- задача — тоест до 18 еднакви реда седмично само от тази задача, без никаква
-- информация в тях. Решено 14.09.2026: автоматичната отметка е БЕЗ коментар.
-- Кой я е записал личи от completed_by='auto:transit'.
--
-- Отложена задача, превърната в done, ЗАПАЗВА коментара си (причината за
-- отлагането) — решение 5 от същия ден, не се пипа.
--
-- Нова миграция, не редакция на приложената: историята остава вярна.
-- Сменя се САМО тялото на функцията — сигнатура, права (revoke), тригери и
-- колони не се пипат. CREATE OR REPLACE пази EXECUTE правата на функцията.
--
-- ═══ ЗАВАРЕНИТЕ ДАННИ (правило 9, проверено 14.09.2026) ═════════════════
-- Автоматични отметки (completed_by='auto:transit'): 0 — нито една задача
-- още няма auto_complete. Backfill няма какво да чисти.
-- Засегнати съществуващи редове: 0.
--
-- Нови колони: няма → огледалото (Живко) не се засяга.
-- Rollback: supabase/migrations/20260914173848_transit_auto_no_comment_down.sql

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
$$;

comment on function public.transit_sync_completions(text) is
  'Записва done (без коментар, completed_by=auto:transit) за автоматичните transit задачи на обекта, ако transit_store_done. Не трие; postponed за същия ден става done (postponed_to и коментарът се пазят).';
