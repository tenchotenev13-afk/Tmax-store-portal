-- weekly-checklist-zanulyavane-manual-schema.sql — Чек лист: „таблица
-- зануляване л.м." (zanulyavane_lm) обратно на РЪЧНА отметка (28.10.2026,
-- сесия checklist-zanulyavane-manual).
-- ПРИЛОЖЕНО В SUPABASE НА 28.10.2026 като миграция
-- 20261028120335_weekly_checklist_zanulyavane_manual и прочетено обратно.
-- Този файл е ОГЛЕДАЛО на миграцията, не източник.
-- Rollback: supabase/migrations/20261028120335_weekly_checklist_zanulyavane_manual_down.sql.
--
-- ЗАЩО. Решение на Тенчо 28.10: „таблица зануляване л.м." е друг вид задача —
-- Миглена я отмята ръчно; НЕ е „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М." (постоянна задача
-- 72aed3fc). Връзката беше от 23.10 (24f6f2f, миграция
-- weekly_checklist_portal_columns, версия в базата 20261023080810).
--
-- 1. weekly_checklist_metrics.zanulyavane_lm: source 'manual', portal_mode
--    NULL, sublabel NULL — както до 23.10. checklist_portal_values() смята само
--    source 'recurring:%' / 'module:%' → колоната спира да идва от функцията,
--    а кронът за замразяване (checklist_freeze_week) не я пише.
-- 2. Замразените седмици 35–43: portal_value = NULL САМО по zanulyavane_lm
--    (control_value, control_num и comment не се пипат; редовете остават).
--    Преди изтриването (28.10): 72 реда със стойност, всички в седмици 40–43
--    (35–39 нямат редове по колоната); control_value — 0 реда. Стойностите по
--    обект са записани в claude/log/2026-10-28-checklist-zanulyavane-manual.md —
--    rollback-ът НЕ може да ги върне.
--
-- Становището „проверка 23.10" (weekly_checklist_responses, седмица 42,
-- Кърджали) НЕ се трие.
--
-- Огледало (Живко): нищо — само данни, без нова колона / таблица / статус.
--
-- ROLLBACK (връща връзката; изчистените portal_value — НЕ):
--   update public.weekly_checklist_metrics
--      set source = 'recurring:72aed3fc-1720-4205-be89-feb242b2627f',
--          portal_mode = 'any',
--          sublabel = 'бланка Зареждане или „нямам нужда“'
--    where key = 'zanulyavane_lm';

update public.weekly_checklist_metrics
   set source = 'manual', portal_mode = null, sublabel = null
 where key = 'zanulyavane_lm';

update public.weekly_checklist
   set portal_value = null
 where metric_key = 'zanulyavane_lm'
   and year = 2026 and week_number between 35 and 43
   and portal_value is not null;
