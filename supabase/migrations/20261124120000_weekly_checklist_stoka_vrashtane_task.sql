-- Чек лист: „Стока за връщане- ТАБЛИЦИ" (stoka_vrashtane) ← постоянната задача
-- „СПИСЪК СТОКА ЗА ИЗТЕГЛЯНЕ ПО РАЗЛИКИ" (сряда), както srok_godnost взима
-- „СПИСЪК СТОКА ЗА ВРЪЩАНЕ". Решение на Тенчо 24.11.2026 (писмо на Миглена
-- Павлова „чек лист"). Само данни. Огледало: weekly-checklist-stoka-vrashtane-task-schema.sql.
-- Rollback: *_down.sql. Седмиците 40–47 (замразени) не се пипат — остават с брой.
update public.weekly_checklist_metrics
   set source = 'recurring:e9d418af-311a-45ec-b4da-0f9ad69205e7',
       portal_mode = 'any'
 where key = 'stoka_vrashtane' and source = 'module:returns';
