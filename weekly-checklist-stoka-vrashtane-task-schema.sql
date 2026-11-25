-- weekly-checklist-stoka-vrashtane-task-schema.sql — Чек лист: „Стока за
-- връщане- ТАБЛИЦИ" (stoka_vrashtane) от постоянната задача „СПИСЪК СТОКА ЗА
-- ИЗТЕГЛЯНЕ ПО РАЗЛИКИ" (24.11.2026, сесия checklist-returns-from-task).
-- ПРИЛОЖЕНО В SUPABASE НА 24.11.2026 като миграция
-- 20261124120000_weekly_checklist_stoka_vrashtane_task (версия в базата
-- 20261124151504) и прочетено обратно. Този файл е ОГЛЕДАЛО на миграцията.
-- Rollback: supabase/migrations/20261124120000_weekly_checklist_stoka_vrashtane_task_down.sql.
--
-- ЗАЩО. Писмо на Миглена Павлова 24.11 „чек лист": колоната броеше ВСИЧКИ
-- записи stock_returns source='diff' към момента на затварянето (неделя
-- вечер), тоест ред, влязъл в четвъртък или петък, излизаше като
-- необработен и колоната — „10/11". Решение на Тенчо 24.11: стойността идва
-- от задачата в сряда (recurring_tasks e9d418af-311a-45ec-b4da-0f9ad69205e7),
-- точно както srok_godnost от „СПИСЪК СТОКА ЗА ВРЪЩАНЕ" (0a20f6e8…).
--
-- Отметката на задачата я поставя stock_returns_sync_completions() (крон 23,
-- всеки час + тригерите на stock_returns): source='diff', потвърдени от
-- обекта, без редовете от деня на срока (20261023085400); след срядата се
-- замразява. Проверено 24.11.2026: от 14.10 всички отметки по задачата са
-- completed_by 'auto:stock-returns' (на 07.10 — и 7 ръчни).
--
-- 1. weekly_checklist_metrics.stoka_vrashtane: source
--    'recurring:e9d418af-311a-45ec-b4da-0f9ad69205e7', portal_mode 'any'.
--    value_type (yes_no), label и sublabel не се пипат.
--    checklist_portal_values() е по source/portal_mode — промяна в нея няма;
--    клонът ѝ за module:returns остава, но вече нищо не го ползва.
-- 2. Седмиците 40–47 са замразени (weekly_checklist_freezes) с по 18
--    portal_value във вид „N/M" — НЕ се пипат. Първата седмица с да/не е 48
--    (стойността — след срядата 25.11).
--
-- Огледало (Живко): промяна само в данни, без промяна за огледалото.

update public.weekly_checklist_metrics
   set source = 'recurring:e9d418af-311a-45ec-b4da-0f9ad69205e7',
       portal_mode = 'any'
 where key = 'stoka_vrashtane' and source = 'module:returns';

-- ROLLBACK:
-- update public.weekly_checklist_metrics
--    set source = 'module:returns', portal_mode = null
--  where key = 'stoka_vrashtane'
--    and source = 'recurring:e9d418af-311a-45ec-b4da-0f9ad69205e7';
