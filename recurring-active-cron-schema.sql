-- Кешът recurring_tasks.active се вдига/сваля от крон в понеделник
--
-- От 18.09.2026 „+ Добави" и „▶ Активирай" работят и от БЪДЕЩ бюлетин:
-- периодът (recurring_task_periods) тръгва от понеделника на показаната
-- седмица, а active се записва true само ако този понеделник вече е
-- настъпил. Иначе active=false — консуматорите на ТЕКУЩАТА седмица („Днес",
-- notifications, daily-turnover, today_deadlines/deadline_passed в
-- bulletin-notify) четат active=eq.true и не бива да виждат задача, която
-- още не важи.
--
-- Някой трябва да вдигне active в понеделника, в който периодът започва.
-- Това е recurring_tasks_refresh_active():
--   active = exists(период с from_monday <= this_monday
--                   и (to_monday is null или to_monday >= this_monday)),
--   this_monday — понеделникът на днешната седмица по Europe/Sofia.
-- Функцията оправя и обратната посока (затворен период → false), тоест
-- active отново е точно „важи тази седмица" — както го описва
-- recurring-task-periods-schema.sql.
--
-- ═══ Задачи БЕЗ нито един период не се пипат ════════════════════════════
-- Клиентът (recurringTasksForWeek в shared.js) води такава задача по кеша
-- active — създадена е от кеширан стар клиент. exists(...) за нея е false и
-- кронът тихо би я спрял. Днес такива няма (0 от 14), но правилото трябва
-- да съвпада с клиента, иначе двете места започват да казват различно.
--
-- ═══ Пише само реалните разлики ═════════════════════════════════════════
-- update ... where active is distinct from want — без празни записи в
-- таблицата, която огледалото тегли. Връща броя сменени редове.
--
-- ═══ Кронът: 00:05 София ════════════════════════════════════════════════
-- cron.timezone е GMT. София е UTC+3 лятно / UTC+2 зимно, затова двата часа
-- 21:05 и 22:05 UTC — същият идиом като daily-report-21h ('0 18,19 * * *').
-- Лятно 21:05 UTC = 00:05 София; 22:05 е повторение без ефект. Зимно 21:05
-- UTC = 23:05 София (още неделя → this_monday е миналият, без промени), а
-- 22:05 = 00:05. Функцията е идемпотентна — двойното пускане е безвредно.
-- Пуска се всеки ден, не само в понеделник: пропуснат понеделник (изпаднал
-- крон) се наваксва на следващия ден, вместо да чака седмица.
--
-- ═══ Права ══════════════════════════════════════════════════════════════
-- Кронът е postgres. anon/authenticated нямат нужда да я викат — execute
-- се отнема (Supabase я дава на anon по подразбиране през pg_default_acl).
--
-- Засегнати редове при прилагане: 0 — сверено на 18.09.2026 (С38) по 14-те
-- задачи: active съвпада с периодите навсякъде.
--
-- Няма нова таблица/колона → Живко: само за сведение, огледалото не се
-- засяга (функцията и кронът не се теглят през PostgREST).
-- Rollback: supabase/migrations/20260918093536_recurring_active_cron_down.sql

create or replace function public.recurring_tasks_refresh_active()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  this_monday date := date_trunc('week', now() at time zone 'Europe/Sofia')::date;
  n integer;
begin
  update public.recurring_tasks t
     set active = v.want
    from (
      select rt.id,
             exists (
               select 1 from public.recurring_task_periods p
                where p.recurring_task_id = rt.id
                  and p.from_monday <= this_monday
                  and (p.to_monday is null or p.to_monday >= this_monday)
             ) as want
        from public.recurring_tasks rt
       where exists (select 1 from public.recurring_task_periods p0 where p0.recurring_task_id = rt.id)
    ) v
   where t.id = v.id
     and t.active is distinct from v.want;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.recurring_tasks_refresh_active() is
  'active = има период, покриващ понеделника на днешната седмица (Europe/Sofia). Задачи без период не се пипат. Връща броя сменени редове. Крон recurring-active-refresh, 00:05 София.';

revoke execute on function public.recurring_tasks_refresh_active() from public, anon, authenticated;

select cron.schedule(
  'recurring-active-refresh',
  '5 21,22 * * *',
  $$select public.recurring_tasks_refresh_active()$$
);
