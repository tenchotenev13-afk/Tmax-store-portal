-- weekly-checklist-label-razliki-schema.sql — Чек лист: заглавието на колоната
-- razliki_dostavka става като задачата в Бюлетина (23.11.2026, сесия
-- checklist-label-razliki).
-- Миграция supabase/migrations/20261123140000_weekly_checklist_label_razliki.sql
-- (rollback — …_down.sql). Този файл е ОГЛЕДАЛО на миграцията, не източник.
--
-- ЗАЩО. Миглена Павлова пита „разлики — от склада или от доставчик?". Колоната
-- се пълни от постоянната задача „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ" (Пон–Пет → „3/5"),
-- а заглавието „Разлики от доставка" се чете като доставчик. Решение на Тенчо
-- 23.11.2026: заглавието като задачата.
--
-- Само label. sublabel („дни без необработени разлики"), key, source,
-- portal_mode и стойностите не се пипат. Другите колони — също (Миглена още
-- решава за „Срок на годност/рекламации" и „Стока за връщане").
-- Кодът (checklist.js, report.js, today.js, send-scheduled-report) чете
-- заглавието от базата — заковано е само в тестови данни и стари миграции.
--
-- Огледало (Живко): нищо — само данни, без нова колона / таблица / статус.
--
-- ROLLBACK:
--   update public.weekly_checklist_metrics
--      set label = 'Разлики от доставка'
--    where key = 'razliki_dostavka' and label = 'Разлики логистични складове';

update public.weekly_checklist_metrics
   set label = 'Разлики логистични складове'
 where key = 'razliki_dostavka' and label = 'Разлики от доставка';
