-- pallets-auto-schema.sql
-- Автоматично отмятане на „СПРАВКА ПРАЗНИ ПАЛЕТИ" от справката в Палети
-- (решение на Тенчо, 02.11.2026).
-- Приложено в Supabase (xiwkdiqqplgdcrkewgtv) на 02.11.2026, версия 20261102131415.
-- Миграция: supabase/migrations/20261102131415_pallets_auto_complete.sql
-- Rollback: дословно най-долу в този файл и в 20261102131415_pallets_auto_complete_down.sql
-- SQL тест: tests/sql/pallets-auto-complete.test.sql
-- Огледало (Живко): НЯМА ред — нова таблица/колона/статус няма; функции,
-- тригер и крон не са в огледалото.
--
-- ═══ ПОВОД ═══════════════════════════════════════════════════════════════
-- Монтана, 30.10.2026: справката е записана в 15:19 (transport_pallets.
-- created_at), задачата е отметната ръчно в 17:24 — след срока. Сверка за
-- 09/16/23/30.10: 4 отметки след 17:00 при справка преди срока (Севлиево 09.10,
-- Козлодуй 23.10, Габрово и Монтана 30.10) и 2 отметки БЕЗ справка за
-- седмицата (Габрово 09.10, Добрич 30.10). Ръчно отмятат 18 обекта.
--
-- ═══ ПРАВИЛОТО ═══════════════════════════════════════════════════════════
-- Обект X е изпълнил седмицата W ⇔ има ред в transport_pallets за X с
-- report_date в [понеделник W .. денят на срока], записан (created_at) до
-- срока: денят на срока + due_time на задачата по Europe/Sofia (днес петък
-- 17:00 — същото като заключването на формата, palletsIsLocked в pallets.js).
-- Липсва/невалиден due_time → 17:00.
--
-- completion_date = ДЕНЯТ НА СРОКА (петък), не денят на справката — така пише
-- и ръчната отметка (на 30.10 всичките 18 са с 2026-10-30) и така я броят
-- Бюлетинът, deadline_passed (bulletin-notify, status='done' и
-- completion_date = днес) и Чек листът (completion_date в дните на задачата).
-- Справка в сряда → ред с completion_date петък още в сряда; същото прави
-- stock_returns_sync_completions с v_due.
-- completed_by = 'auto:pallets', comment NULL (както transit, 14.09.2026:
-- еднакъв коментар на 18 обекта е шум в отчетите).
--
-- НЕ РАЗОТМЯТА (решение 13.10.2026 за Разлики): delete няма. Изтрит ред в
-- transport_pallets не маха отметката.
-- `on conflict do nothing` пази ръчната отметка, отлагането и „не се отнася".
-- „Само за информация" (task_type 'notice') не се отмята.
-- Обхват: target_stores на задачата за седмицата (NULL/празно = всички
-- обекти от users), без report_excluded_stores().
-- ЗАМРАЗЯВАНЕ: след деня на срока нищо не се пипа — без наваксване и без
-- backfill на минали седмици. v_start 2026-11-02 пази и от ръчно извикване
-- с минала дата; същата дата е AUTO_COMPLETE_FROM['pallets'] в shared.js.
--
-- ПУСКАНЕ: тригер AFTER INSERT на transport_pallets (формата прави insert при
-- първи запис за деня и patch след това — patch не може да направи справката
-- „по-навреме") + часов крон като мрежа, ако тригерът е хванал грешка. Часът
-- на крона не е важен → без двата UTC часа (CLAUDE.md „Схемни промени").

-- ═══ 1. ЗАДАЧАТА ЗА СЕДМИЦАТА, СЪС СЛЯТА ВЕРСИЯ ═════════════════════════
-- По образеца на supply_task_for_week; тук трябва и due_time (срокът).
create or replace function public.pallets_task_for_week(p_monday date)
returns table (task_id uuid, task_type text, due_idx int[], due_time text, target_stores text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id,
         case when v.id is null then t.task_type else v.task_type end,
         coalesce(
           case when v.id is null then t.due_weekdays else v.due_weekdays end,
           array[ case when v.id is null then t.due_weekday else v.due_weekday end ]
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
   where t.linked_module = 'pallets'
     and t.active
   order by t.created_at
   limit 1;
$$;

comment on function public.pallets_task_for_week(date) is
  'Постоянната задача с linked_module=''pallets'' за седмицата на p_monday, със СЛЯТА версия. due_idx е масив от дни (0=Пон), due_time е текст HH:MM.';

-- ═══ 2. УСЛОВИЕТО ════════════════════════════════════════════════════════
create or replace function public.pallets_store_done(
  p_store text, p_monday date, p_due date, p_deadline timestamptz)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from transport_pallets p
     where p.store_name = p_store
       and p.report_date between p_monday and p_due
       and p.created_at <= p_deadline);
$$;

comment on function public.pallets_store_done(text, date, date, timestamptz) is
  'true ⇔ обектът има справка в transport_pallets с report_date в [p_monday .. p_due], записана (created_at) до p_deadline.';

-- ═══ 3. СИНХРОНИЗАЦИЯТА ══════════════════════════════════════════════════
create or replace function public.pallets_sync_completions(
  p_store text default null, p_today date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  /* p_today е за тест и за ръчно препускане на конкретен ден; гейтовете важат
     спрямо него. Функцията не е достъпна на anon/authenticated. */
  v_today    date := coalesce(p_today, (now() at time zone 'Europe/Sofia')::date);
  v_monday   date;
  v_start    date := date '2026-11-02';   -- понеделник; по-рано не се пипа
  v_task     record;
  v_due      date;
  v_time     time;
  v_deadline timestamptz;
  v_excl     text[] := report_excluded_stores();
  v_stores   text[];
  v_n        integer := 0;
begin
  if v_excl is null then
    raise warning 'pallets_sync_completions: няма app_settings.report_excluded_stores — нищо не се прави';
    return 0;
  end if;

  v_monday := v_today - ((extract(isodow from v_today)::int) - 1);
  if v_monday < v_start then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtext('pallets-sync:' || coalesce(p_store, '*')));

  select * into v_task from pallets_task_for_week(v_monday);
  if v_task.task_id is null then
    return 0;
  end if;
  if coalesce(v_task.task_type, 'info') = 'notice' then
    return 0;
  end if;
  if v_task.due_idx is null or cardinality(v_task.due_idx) = 0 then
    return 0;
  end if;

  -- Денят на срока = последният ден от due_idx (днес [4] = петък).
  v_due := v_monday + (select max(d) from unnest(v_task.due_idx) as d where d between 0 and 6);
  if v_due is null then
    return 0;
  end if;
  -- ЗАМРАЗЯВАНЕ: след деня на срока нищо не се пипа.
  if v_today > v_due then
    return 0;
  end if;

  v_time := case when coalesce(v_task.due_time, '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
                 then v_task.due_time::time else time '17:00' end;
  v_deadline := (v_due + v_time) at time zone 'Europe/Sofia';

  v_stores := case
    when p_store is not null then array[p_store]
    else array(select distinct u.store_name
                 from users u
                where u.store_name is not null
                  and not (u.store_name = any(v_excl)))
  end;
  if v_task.target_stores is not null and cardinality(v_task.target_stores) > 0 then
    v_stores := array(select s from unnest(v_stores) as s
                       where s = any(v_task.target_stores));
  end if;
  if cardinality(v_stores) = 0 then
    return 0;
  end if;

  -- САМО ДОБАВЯНЕ. `do nothing` пази ръчна отметка, отлагане и „не се отнася".
  insert into task_completions
         (recurring_task_id, store_name, completed_by, completed_at,
          status, completion_date)
  select v_task.task_id, s, 'auto:pallets', now(), 'done', v_due
    from unnest(v_stores) as s
   where not (s = any(v_excl))
     and pallets_store_done(s, v_monday, v_due, v_deadline)
  on conflict (recurring_task_id, store_name, completion_date)
     where recurring_task_id is not null and completion_date is not null
  do nothing;
  get diagnostics v_n = row_count;

  return coalesce(v_n, 0);
end
$function$;

comment on function public.pallets_sync_completions(text, date) is
  'Отмята постоянната задача с linked_module=pallets (auto:pallets, completion_date = денят на срока) за обект или за всички при p_store NULL, ако има справка в transport_pallets от седмицата, записана до срока. Само добавя (не разотмята), не пипа ръчна отметка/отлагане/not_applicable, след деня на срока не прави нищо, преди 2026-11-02 — също.';

-- ═══ 4. ТРИГЕР върху transport_pallets ══════════════════════════════════
-- Statement-level; обектите в азбучен ред, всеки в собствен BEGIN/EXCEPTION —
-- записът на справката не пропада. Грешката е предупреждение; мрежата е кронът.
create or replace function public.pallets_sync_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
begin
  for s in select distinct store_name from new_rows
            where store_name is not null order by 1 loop
    begin perform pallets_sync_completions(s);
    exception when others then
      raise warning 'pallets_sync_completions(%): %', s, sqlerrm;
    end;
  end loop;
  return null;
end
$function$;

drop trigger if exists pallets_sync_ins on public.transport_pallets;
create trigger pallets_sync_ins
  after insert on public.transport_pallets
  referencing new table as new_rows
  for each statement execute function pallets_sync_trg();

-- ═══ 5. ПРАВА ═══════════════════════════════════════════════════════════
-- Водещото =X/ (EXECUTE на PUBLIC) се маха изрично — CLAUDE.md „Сигурност".
revoke execute on function public.pallets_task_for_week(date) from public, anon, authenticated;
revoke execute on function public.pallets_store_done(text, date, date, timestamptz) from public, anon, authenticated;
revoke execute on function public.pallets_sync_completions(text, date) from public, anon, authenticated;
revoke execute on function public.pallets_sync_trg() from public, anon, authenticated;

-- ═══ 6. ЧАСОВ КРОН (мрежа) ═══════════════════════════════════════════════
-- cron.schedule с име обновява съществуващата задача със същото име.
select cron.schedule('pallets-auto-complete', '0 * * * *',
                     'select public.pallets_sync_completions();');

-- ═══ ROLLBACK (дословно в 20261102131415_pallets_auto_complete_down.sql) ══════
-- Редовете в task_completions с completed_by='auto:pallets' ОСТАВАТ (история).
-- Ръчното отмятане се връща с rollback на ПОРТАЛА (BUL_AUTO_MODULES в
-- bulletin.js и AUTO_COMPLETE_FROM в shared.js). Върне ли се само базата,
-- задачата остава заключена в портала и никой не може да я отметне.
--
-- select cron.unschedule('pallets-auto-complete')
--  where exists (select 1 from cron.job where jobname='pallets-auto-complete');
-- drop trigger if exists pallets_sync_ins on public.transport_pallets;
-- drop function if exists public.pallets_sync_trg();
-- drop function if exists public.pallets_sync_completions(text, date);
-- drop function if exists public.pallets_store_done(text, date, date, timestamptz);
-- drop function if exists public.pallets_task_for_week(date);
