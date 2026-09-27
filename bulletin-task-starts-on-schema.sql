-- „В СИЛА ОТ" за многоседмична задача: bulletin_tasks.starts_on
--
-- Многоседмичната задача (spans_from, 25.09.2026) се виждаше от понеделника на
-- седмицата, в която е поставена. Понякога трябва по-късно: задачата се пише
-- предварително, но влиза в сила на конкретна дата. Пример от 27.09.2026 —
-- поставена на 28.09 (С40), в сила от 01.10, срок 08.10.
--
--   starts_on IS NULL      → както досега: от понеделника на седмицата (spans_from);
--   starts_on IS NOT NULL  → обектите не я виждат преди тази дата, чекбоксът е
--                            заключен, а офисът я вижда с бадж „в сила от ДД.ММ".
--
-- Действителното начало е coalesce(starts_on, spans_from) — виж taskSpanStart()
-- в shared.js. СРОКЪТ не се променя: броенето и отчетите пак се задействат в
-- седмицата на due_date, а due_date >= starts_on е гарантирано от CHECK-а
-- отдолу. Точно затова дневният отчет, „Днес", известията и личният отчет НЕ
-- се пипат — докато задачата започне да се брои, starts_on отдавна е минал.
--
-- ═══ ОГРАНИЧЕНИЯТА ═════════════════════════════════════════════════════════
--   · starts_on без spans_from няма смисъл: „в сила от" е свойство на
--     многоседмичната задача, обикновената живее в своята седмица;
--   · spans_from <= starts_on <= due_date. Долната граница пази от дата преди
--     поставянето, горната — от дата след срока (задача, влизаща в сила след
--     срока си, е невъзможна за изпълнение).
--
-- ═══ СТОКА НА ПЪТ — ЗАЩО ПРОЗОРЕЦ ПО created_at ════════════════════════════
-- transit_sync_completions() отмята автоматично задача с linked_module='transit'
-- и auto_complete, когато обектът е приключил своите редове в goods_transit.
-- Дотук критерият (transit_store_done) гледаше ВСИЧКИ редове на обекта, без
-- прозорец. За задача с starts_on това е грешно и опасно:
--
--   На 27.09.2026 в goods_transit има 2070 реда за 19 обекта, ВСИЧКИТЕ от един
--   импорт (01.09, 05:50:42–05:50:50 UTC), и 11 от 19 обекта вече са
--   „приключили". Задача в сила от 01.10 би се отметнала за тези 11 в момента,
--   в който нещо задейства синхронизацията — а тя се вика от тригер при всеки
--   INSERT/UPDATE/DELETE по goods_transit. Достатъчно е един обект да отметне
--   СТАР ред сутринта на 01.10, преди импорта на новия месец.
--
-- Затова критерият за задача с starts_on гледа само редове, ВНЕСЕНИ от
-- starts_on − 7 дни насам (transit_store_done_since). Преди новия импорт няма
-- такива редове, тоест „има поне един" е невярно и никой не се отмята. Щом
-- импортът дойде, редовете са pending; щом обектът приключи последния, UPDATE
-- тригерът пуска синхронизацията и тя отмята. НЯМА нов крон и не бива да има:
-- крон в 00:00 на starts_on би отметнал точно обектите по старата партида.
--
-- ЗАЩО СЕДЕМ ДНИ, а не нула: ако импортът дойде по-рано (30.09 за задача в
-- сила от 01.10), при нулев допуск задачата не би се отметнала НИКОГА, колкото
-- и да работи обектът — на starts_on няма тригер. Партидите са МЕСЕЧНИ, тоест
-- предишната е ~30 дни по-стара и прозорец от 7 дни няма как да я захване.
-- ДОПУСКАНЕТО Е ИМЕННО ТОВА: импортът е един на месец и вътре в месеца в
-- goods_transit не се добавят редове на ръка. Появят ли се такива (ръчно
-- добавен ред посред месеца), прозорецът може да захване стар ред и задачата
-- да се отметне по-рано — тогава числото 7 трябва да се свие.
-- tests/sql/transit-starts-on.test.sql проверява и това: колко реда са създадени
-- извън месечния импорт (днес: 0).
--
-- Синхронизацията НЕ се спира по starts_on > днес (решение на Тенчо,
-- 27.09.2026): обект, приключил ранен импорт, трябва да се отметне, а на
-- starts_on няма кой да го задейства. Прозорецът е достатъчен — той гарантира,
-- че отметката е по редове от НОВАТА партида.
--
-- Rollback: supabase/migrations/20260927195603_bulletin_task_starts_on_down.sql

alter table public.bulletin_tasks
  add column if not exists starts_on date;

alter table public.bulletin_tasks
  add constraint bulletin_tasks_starts_on_span_chk
    check (starts_on is null or spans_from is not null),
  add constraint bulletin_tasks_starts_on_range_chk
    check (starts_on is null or (starts_on >= spans_from and starts_on <= due_date));

comment on column public.bulletin_tasks.starts_on is
  'Дата, от която многоседмичната задача е в сила: обектите не я виждат по-рано и чекбоксът е заключен. NULL = от понеделника на седмицата на поставяне (spans_from). Изисква spans_from и spans_from <= starts_on <= due_date.';

-- Индекс НЕ се добавя: заявките филтрират по spans_from/due_date (частичният
-- bt_spans_from_due_idx ги покрива), а starts_on се чете на ред. При 63 задачи
-- нов индекс е разход без полза.

-- ═══ ПРОЗОРЕЦЪТ ПО ИМПОРТ ══════════════════════════════════════════════════
-- Логиката на transit_store_done() се изнася тук с параметър. p_since IS NULL
-- дава ТОЧНО старото поведение (всички редове), затова обвивката по-долу и
-- всички задачи без starts_on се държат непроменено.
create or replace function public.transit_store_done_since(p_store text, p_since date)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
           select 1 from goods_transit
            where store_name = p_store and direction = 'incoming'
              and (p_since is null
                   or created_at >= (p_since::timestamp at time zone 'Europe/Sofia')))
     and not exists (
           select 1 from goods_transit
            where store_name = p_store and direction = 'incoming'
              and (p_since is null
                   or created_at >= (p_since::timestamp at time zone 'Europe/Sofia'))
              and coalesce(status, 'pending') = 'pending'
              and reviewed_at is null);
$function$;

comment on function public.transit_store_done_since(text, date) is
  'Приключил ли е обектът редовете си в „Стока на път" от p_since насам (по created_at = момента на импорта). p_since NULL = всички редове, тоест старото поведение на transit_store_done().';

create or replace function public.transit_store_done(p_store text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.transit_store_done_since(p_store, null);
$function$;

-- ═══ САМАТА СИНХРОНИЗАЦИЯ ══════════════════════════════════════════════════
-- Разликата с предишната версия е ЕДНА: проверката „обектът е приключил" вече
-- не е веднъж в началото за целия обект, а условие НА ВСЯКА ЗАДАЧА, със своя
-- прозорец. Иначе задача с starts_on и задача без него не могат да съществуват
-- едновременно — първата би се решавала по критерия на втората.
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
  if p_store is null then
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
     -- ЕДИНСТВЕНАТА промяна: прозорец по импорта за задачите с „в сила от".
     -- Виж обяснението за седемте дни в главата на файла.
     and transit_store_done_since(p_store,
           case when bt.starts_on is null then null else bt.starts_on - 7 end)
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

-- Тригерът върху bulletin_tasks трябва да реагира и на starts_on: смяната на
-- датата сменя прозореца, тоест и отговора на „приключил ли е обектът".
drop trigger if exists bulletin_tasks_transit_sync on public.bulletin_tasks;
create trigger bulletin_tasks_transit_sync
  after insert or update of auto_complete, linked_module, due_date, due_dates,
                            target_stores, starts_on
  on public.bulletin_tasks
  for each row execute function bulletin_tasks_transit_sync_trg();

-- ═══ ПРАВА ═════════════════════════════════════════════════════════════════
-- Новата функция получава подразбиращите се права на схема public: водещо =X/
-- (PUBLIC) плюс anon и authenticated. Трите ѝ съседни (transit_store_done,
-- transit_sync_completions и двата тригера) са само postgres + service_role.
-- SECURITY DEFINER функция, която по подадено име на обект чете goods_transit,
-- не бива да се вика с анонимния ключ, затова posture-ът се изравнява.
-- Revoke само от anon/authenticated НЕ върши работа, докато PUBLIC го има —
-- наследява се. Затова и трите. (Същият капан като perform_daily_backup,
-- 23.09.2026.)
revoke execute on function public.transit_store_done_since(text, date) from public;
revoke execute on function public.transit_store_done_since(text, date) from anon;
revoke execute on function public.transit_store_done_since(text, date) from authenticated;
