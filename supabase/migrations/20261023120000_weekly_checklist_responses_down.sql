-- Rollback на 20261023120000_weekly_checklist_responses
--
-- ⚠ Трие таблицата заедно с всички становища, писани от обектите. Ако вече
-- има редове, първо реши дали да се пазят:
--   select count(*) from public.weekly_checklist_responses;
-- Политиките и индексът падат заедно с таблицата.
-- След rollback checklist.js (етап 3А) пак се зарежда: sbGet връща [] за
-- липсваща таблица, но „Запази" в режима на обекта пада с червен toast.

drop table if exists public.weekly_checklist_responses;
