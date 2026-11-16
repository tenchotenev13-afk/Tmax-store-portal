-- store-open-items-schema.sql
-- Тема „Незавършено за обекта" (store_open_items) в bulletin-notify, v19.
-- Решение на Тенчо 15.11.2026, етап 1 от 2. САМО ДАННИ — без нова таблица,
-- колона или стойност на статус (ред в zhivko-opashka.md НЯМА).
--
-- Делник 07:45 по ЕДНО писмо на обект до ролите manager / sklad / info на
-- обекта: (А) просрочените задачи на обекта от Бюлетина, (Б) клиентски
-- заявки — закъснели и със срок до 2 работни дни, като заявител и като
-- изпълнител. Получателите НЕ са групата 'store' на resolveRecipients (тя
-- включва и kasa) — правилото е в soiRecipients() в едж функцията. Редът в
-- матрицата решава само дали темата праща имейл (превключвателят в
-- Администрация → Известия).
--
-- Темата е ИЗКЛЮЧЕНА (active = false) и с test_email — включването за
-- обектите (active = true, test_email = null) е отделна стъпка след теста на
-- Тенчо. Часът 07:45 се пада на крон 15 (*/15) — isDue пуска в
-- [07:45; 08:00) по София, веднъж на ден (last_run_at).

insert into public.notification_topics
  (key, label, description, schedule_type, weekdays, scheduled_time, active, test_email, sort_order)
values
  ('store_open_items',
   'Незавършено за обекта',
   'Делник сутрин по едно писмо на обект до управителя, склада и инфо акаунта на обекта (без каса): просрочените задачи на обекта от Бюлетина и клиентските заявки — закъснели и със срок до 2 работни дни, като заявител и като изпълнител. Обект без нито един ред не получава писмо.',
   'daily', '{1,2,3,4,5}', '07:45', false, 'ten.tenev@temax.bg', 12);

insert into public.notification_matrix (topic_key, group_key, channel, scope)
values ('store_open_items', 'store', 'email', 'own_stores');

-- ROLLBACK
-- delete from public.notification_topics where key = 'store_open_items';
-- (редът в notification_matrix пада с каскадата —
--  notification_matrix_topic_key_fkey ... on delete cascade)
