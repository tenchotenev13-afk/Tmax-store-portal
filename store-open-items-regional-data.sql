-- store-open-items-regional-data.sql
-- Тема „Незавършено за вашите обекти" (store_open_items_regional) в
-- bulletin-notify, бележка v26. Решения на Тенчо 19.11.2026. САМО ДАННИ —
-- без нова таблица, колона или стойност на статус (ред в zhivko-opashka.md
-- НЯМА).
--
-- Делник 08:00 по ЕДНО писмо на регионален, с част за всеки негов обект —
-- същите секции като писмото на обекта (store_open_items, 07:45). Отделен час,
-- за да не се съберат двете теми в едно пускане под тавана на обажданията.
-- Получатели — soirRecipients() в едж функцията: users.is_regional +
-- assigned_stores (без notify_groups 'regional') + app_settings
-- 'soi_regional_extra'. Матрица НЕ трябва — превключвателят е active.
--
-- Темата е ИЗКЛЮЧЕНА (active = false) и с test_email — включването и
-- махането на регионалните от overdue_tasks са ОТДЕЛЕН файл
-- (store-open-items-regional-enable-data.sql), за да няма ден, в който
-- регионалните не получават нищо за задачите.
--
-- soi_regional_extra: Тенчо за Кърджали и Раднево (решение 19.11 — акаунтът
-- му НЕ се пипа: assigned_stores на admin стеснява списъците му в портала).
-- app_settings е публичен за четене (политика using (true)) — тук стоят само
-- служебен имейл и имена на обекти.
--
-- Преди (прочетено 19.11): темата я няма, ключът го няма; max sort_order = 60
-- (store_open_items = 12). Условието е точно това — друго → грешка.

do $$
begin
  if exists (select 1 from public.notification_topics where key = 'store_open_items_regional') then
    raise exception 'store_open_items_regional: темата вече съществува';
  end if;
  if exists (select 1 from public.app_settings where key = 'soi_regional_extra') then
    raise exception 'soi_regional_extra: ключът вече съществува';
  end if;

  insert into public.notification_topics
    (key, label, description, schedule_type, weekdays, scheduled_time, active, test_email, sort_order)
  values
    ('store_open_items_regional',
     'Незавършено — регионални',
     'Делник 08:00 по едно писмо на регионален с отделна част за всеки негов обект — същото съдържание като писмото „Незавършено за обекта“ (просрочени задачи, клиентски заявки, разлики). Получатели: регионалните (is_regional, обектите от assigned_stores) и допълнителните от app_settings soi_regional_extra. Обект без редове се пропуска; без нищо — без писмо.',
     'daily', '{1,2,3,4,5}', '08:00', false, 'ten.tenev@temax.bg', 13);

  insert into public.app_settings (key, value, updated_by)
  values ('soi_regional_extra',
          '[{"email":"ten.tenev@temax.bg","stores":["Кърджали","Раднево"]}]',
          'sutreshno-regionalni');
end $$;

-- ROLLBACK
-- delete from public.notification_topics where key = 'store_open_items_regional';
-- delete from public.app_settings where key = 'soi_regional_extra';
-- (notification_log с topic_key 'store_open_items_regional' — само при
--  истинско пращане; ако трябва: delete from public.notification_log
--  where topic_key = 'store_open_items_regional';)
