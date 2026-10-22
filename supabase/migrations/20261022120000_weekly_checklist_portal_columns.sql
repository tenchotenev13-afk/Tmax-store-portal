-- Чек лист: три ръчни колони се пълнят от портала (22.10.2026).
-- Само данни в weekly_checklist_metrics, без DDL. Rollback: *_down.sql.
-- Чек листът взема СЪЩАТА отметка, която Бюлетинът вече прави автоматично;
-- режимът на всяка колона е в checklist.js (CHECKLIST_PORTAL_MODE).
-- Етикетите (label) не се пипат.

-- 1. Срок на годност/рекламации ← „СПИСЪК СТОКА ЗА ВРЪЩАНЕ" (сряда; отмята се
--    от stock_returns source='complaint' при потвърждение от обекта).
update public.weekly_checklist_metrics
   set source = 'recurring:0a20f6e8-c526-400b-bed5-57194f35e4e5',
       sublabel = 'потвърдено от обекта (За връщане — рекламации/срок)'
 where key = 'srok_godnost';

-- 2. Разлики от доставка ← „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ" (Пон–Пет) → „3/5".
update public.weekly_checklist_metrics
   set source = 'recurring:166a22f8-c884-4019-862d-4f20175baa12',
       sublabel = 'дни без необработени разлики'
 where key = 'razliki_dostavka';

-- 3. Таблица зануляване л.м. ← „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М." (понеделник).
update public.weekly_checklist_metrics
   set source = 'recurring:72aed3fc-1720-4205-be89-feb242b2627f',
       sublabel = 'бланка Зареждане или „нямам нужда“'
 where key = 'zanulyavane_lm';

-- 4. Стока за връщане — от 22.10 само изтеглянето по разлики
--    (checklist.js чете stock_returns с source=eq.diff). Source остава.
update public.weekly_checklist_metrics
   set sublabel = 'изтегляне по разлики — потвърдено от обекта'
 where key = 'stoka_vrashtane';
