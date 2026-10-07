-- Еднократна корекция на данните за седмицата от 05.10.2026.
-- Прилага се СЛЕД 20261007090000_stock_returns_auto_per_source (иска новите
-- функции за последната стъпка).
--
-- Проверено в базата на 07.10.2026 (преди писането на този файл):
--   · 5 реда auto:stock-returns на „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ"
--     (31351174-…): Габрово, Добрич, Карлово, Пирдоп, Троян — всички
--     completion_date 2026-10-07 (до прилагането може да има още: старата
--     функция още работи; затова броят не е заковен — бекъпът и изтриването
--     са един и същ филтър и се сравняват помежду си).
--   · linked_module='stock-returns' стои на основния запис на „Срок на
--     годност" (1) и на 4 версии: неговите две (28.09 и 05.10) и на двете
--     списъчни от 05.10. Други места няма (bulletin_tasks: 0).
--   · И трите задачи са със срок сряда 20:00 → v_due = 07.10.
--
-- „Срок на годност" е ИЗЦЯЛО без linked_module (решение на Тенчо, 07.10):
-- физическа проверка + SAP, „За връщане" няма връзка с нея. Старата стойност
-- 'stock-returns' не остава никъде — като „чист бутон" изглеждаше автоматична.
-- Затова се чисти и версията от 28.09 (минала седмица; за нея няма автоматика
-- и преди, така че за обектите нищо не се променя освен изчезналия бутон).
--
-- Всяка стъпка записва броя редове във временна таблица, а накрая блок
-- проверява очакваните. Миграцията гърми и връща назад всичко, ако нещо не
-- съвпада (напр. задачата е вече пренасочена).

-- 1. Копие на редовете, които се трият (по образеца на kasa_cleanup_bak_20260920).
--    Еднократна таблица — маха се с drop след ~седмица (виж claude/open-tasks.md).
create table public.stock_returns_auto_bak_20261007 as
  select * from public.task_completions
   where recurring_task_id = '31351174-4182-46a1-a1ce-91e877066297'
     and completed_by = 'auto:stock-returns';

-- RLS без политики: нито anon, нито authenticated я четат.
alter table public.stock_returns_auto_bak_20261007 enable row level security;

create temp table _sr_data_log (step text, n integer) on commit drop;

insert into _sr_data_log
  select '1 бекъп (stock_returns_auto_bak_20261007)', count(*) from public.stock_returns_auto_bak_20261007;

-- 2. Грешните автоматични отметки — САМО те. Ръчни отметки не се пипат
--    (completed_by е друго); филтърът е по задача + completed_by, не по обект.
with d as (
  delete from public.task_completions
   where recurring_task_id = '31351174-4182-46a1-a1ce-91e877066297'
     and completed_by = 'auto:stock-returns'
  returning 1)
insert into _sr_data_log select '2 изтрити auto:stock-returns на „Срок на годност"', count(*) from d;

-- 3. „Срок на годност" става ръчна — основният запис и ВСИЧКИ негови версии.
with u as (
  update public.recurring_tasks set linked_module = null
   where id = '31351174-4182-46a1-a1ce-91e877066297' and linked_module = 'stock-returns'
  returning 1)
insert into _sr_data_log select '3а linked_module→null: основен запис „Срок на годност"', count(*) from u;

with u as (
  update public.recurring_task_versions set linked_module = null
   where recurring_task_id = '31351174-4182-46a1-a1ce-91e877066297'
     and from_monday = date '2026-10-05' and linked_module = 'stock-returns'
  returning 1)
insert into _sr_data_log select '3б linked_module→null: версия 05.10 „Срок на годност"', count(*) from u;

with u as (
  update public.recurring_task_versions set linked_module = null
   where recurring_task_id = '31351174-4182-46a1-a1ce-91e877066297'
     and from_monday = date '2026-09-28' and linked_module = 'stock-returns'
  returning 1)
insert into _sr_data_log select '3в linked_module→null: версия 28.09 „Срок на годност" (минала седмица)', count(*) from u;

-- 4. Двете списъчни задачи — във версията от 05.10. Основните им записи са
--    linked_module=null и там си остават: версията печели, а миналите седмици
--    не трябва да стават „автоматични" със задна дата.
with u as (
  update public.recurring_task_versions set linked_module = 'stock-returns-complaint'
   where recurring_task_id = '0a20f6e8-c526-400b-bed5-57194f35e4e5'   -- СПИСЪК СТОКА ЗА ВРЪЩАНЕ
     and from_monday = date '2026-10-05' and linked_module = 'stock-returns'
  returning 1)
insert into _sr_data_log select '4а →stock-returns-complaint: „Списък стока за връщане" (версия 05.10)', count(*) from u;

with u as (
  update public.recurring_task_versions set linked_module = 'stock-returns-diff'
   where recurring_task_id = 'e9d418af-311a-45ec-b4da-0f9ad69205e7'   -- СПИСЪК СТОКА ЗА ИЗТЕГЛЯНЕ ПО РАЗЛИКИ
     and from_monday = date '2026-10-05' and linked_module = 'stock-returns'
  returning 1)
insert into _sr_data_log select '4б →stock-returns-diff: „Изтегляне по разлики" (версия 05.10)', count(*) from u;

-- 5. Проверка преди синхронизацията: нищо от старата стойност не е останало и
--    бекъпът е точно колкото изтритото.
do $check$
declare
  v_left integer;
  v_bak  integer;
  v_del  integer;
begin
  select count(*) into v_left from (
    select 1 from public.recurring_tasks         where linked_module = 'stock-returns'
    union all
    select 1 from public.recurring_task_versions where linked_module = 'stock-returns'
    union all
    select 1 from public.bulletin_tasks          where linked_module = 'stock-returns') x;
  if v_left <> 0 then
    raise exception 'stock-returns-per-source: остават % реда със старата стойност stock-returns', v_left;
  end if;
  select n into v_bak from _sr_data_log where step like '1 %';
  select n into v_del from _sr_data_log where step like '2 %';
  if v_bak <> v_del then
    raise exception 'stock-returns-per-source: бекъп % ≠ изтрити %', v_bak, v_del;
  end if;
  if exists (select 1 from _sr_data_log where step ~ '^(3а|3б|4а|4б)' and n <> 1) then
    raise exception 'stock-returns-per-source: очаквах точно по 1 ред на стъпките 3а/3б/4а/4б: %',
      (select string_agg(step || '=' || n, '; ') from _sr_data_log);
  end if;
end
$check$;

-- 6. Синхронизация за текущата седмица (всички обекти). Днес е сряда = срокът и
--    на трите задачи, затова пише; след срока щеше да върне 0.
insert into _sr_data_log select '6 sync (вмъкнати+изтрити отметки)', public.stock_returns_sync_completions();
