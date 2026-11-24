-- Чек лист: razliki_dostavka → заглавие като задачата в Бюлетина
-- („РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ"). Решение на Тенчо 23.11.2026. Само label.
-- Огледало: weekly-checklist-label-razliki-schema.sql.
update public.weekly_checklist_metrics
   set label = 'Разлики логистични складове'
 where key = 'razliki_dostavka' and label = 'Разлики от доставка';
