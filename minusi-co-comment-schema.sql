-- minusi-co-comment-schema.sql — Минуси, т.3: „Коментар (офис)“ в „📋 Дневен“
-- (09.11.2026, сесия minusi-co-values). Искане на Миглена 06.11 (оранжевите
-- колони в нейния файл „за корекции“). Решение от 21.10: обектът НЕ вижда суми —
-- и тази колона е само за офиса (minusi.js: MN_CO_ROLES — admin, accounting,
-- controlling).
--
-- ПРИЛОЖЕНО в Supabase на 09.11.2026 като миграция 20261109102704 (minusi_co_comment).
--
-- minus_movements.co_comment — text, NULL, без default. Свободен текст на офиса
-- по ред 955. Пише се САМО с отделен PATCH на тази колона (mnSaveCoComment),
-- не през mnSave на обекта; обектът не я чете (select-ът на обекта е без нея).
-- Nullable, без default → съществуващите редове не се пипат; кодът я чете само
-- при офиса → миграцията минава преди push-а.
--
-- ЗАВАРЕНИ ДАННИ: няма — колоната е нова, NULL за всички редове.
--
-- Огледало (Живко): ред в zhivko-opashka.md „Чака изпращане“.
--
-- ROLLBACK:
--   alter table public.minus_movements drop column if exists co_comment;

alter table public.minus_movements add column if not exists co_comment text;
comment on column public.minus_movements.co_comment is
  'Коментар на офиса (Минуси, „Дневен“, само за офиса) — пише се с отделен PATCH, обектът не го вижда.';
