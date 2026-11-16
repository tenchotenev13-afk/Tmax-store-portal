-- store-open-items-enable-data.sql
-- Включване на „Незавършено за обекта" (store_open_items, bulletin-notify
-- версия 36) за обектите — решение на Тенчо 16.11.2026. Първото писмо —
-- вторник 17.11.2026 в 07:45 (крон 15, isDue в [07:45; 08:00) по София).
-- САМО ДАННИ: без код, без схема, без ред за Живко.
--
-- Преди (прочетено 16.11): active=false, test_email='ten.tenev@temax.bg',
-- 07:45, weekdays {1,2,3,4,5}; матрица store/email/own_stores; overrides — 0.
-- Условието е точно това състояние — друго → грешка, нищо не се мени.

do $$
declare n int;
begin
  update public.notification_topics
     set active = true, test_email = null
   where key = 'store_open_items' and active = false and test_email = 'ten.tenev@temax.bg';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'store_open_items: очакван 1 ред за включване, засегнати %', n;
  end if;
end $$;

-- ROLLBACK
-- update public.notification_topics
--    set active = false, test_email = 'ten.tenev@temax.bg'
--  where key = 'store_open_items';
