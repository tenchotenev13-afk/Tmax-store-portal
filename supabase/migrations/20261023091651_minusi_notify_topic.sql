-- 20261023091651_minusi_notify_topic — тема minus_unfilled в notification_topics.
-- Приложено 23.10.2026 с apply_migration (active = false); версията е дадена от базата.
--
-- Само ДАННИ, без схема: нов ред в notification_topics (колоните вече ги има),
-- тоест ред за Живко НЯМА. Нарочно без *-schema.sql огледало — то би
-- изисквало ред в опашката, а нова колона / таблица / статус няма.
--
-- Темата се обслужва от bulletin-notify (v13, runMinusUnfilled): push до
-- обекта, делник 10:00 българско, веднъж на ден на обект (notification_log,
-- ref_key 'minus:<обект>:<гггг-мм-дд>'), само ако има незакрити и
-- непопълнени минуси. Създава се НЕАКТИВНА — активирането е отделно решение
-- на Тенчо след dry_run на живите данни.

insert into public.notification_topics
  (key, label, description, schedule_type, weekdays, day_of_week, scheduled_time, active, sort_order)
values
  ('minus_unfilled', 'Минуси — непопълнени',
   'Всеки делник 10:00: push до обекта, ако има НЕЗАКРИТИ минуси, които са непопълнени — без причина, повторение до minus_repeat_days дни без действие, или причина с requires_note без бележка. Закритите не се броят. Само обектите от app_settings.minus_stores; веднъж на ден на обект. Без имейл.',
   'daily', array[1,2,3,4,5], null, '10:00', false, 60)
on conflict (key) do nothing;
