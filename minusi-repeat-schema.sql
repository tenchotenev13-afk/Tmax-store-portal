-- minusi-repeat-schema.sql — Минуси, етап 2: повторения (22.10.2026).
-- Огледало на supabase/migrations/20261022130434_minusi_repeat.sql (версията — от базата).
--
-- ЗАЩО. Теодор (06.10.2026): при повторен минус за същия обект и артикул до
-- ~10 дни обектът е длъжен да напише действие („грешен етикет — ще
-- преетикираме"). Миглена (21.10): обектът да вижда повторенията и да вземе
-- мерки. Броят дни е настройка: app_settings.minus_repeat_days (липсва или е
-- невалиден → 10 в minusi.js).
--
-- minus_movements.action — текстът на действието; записва се само при
-- „Запази" на ред, който е повторение (minusi.js, mnSave). NULL за всичко
-- останало — колоната е nullable и без default.
--
-- ЗАВАРЕНИ ДАННИ (правило 9, проверено 22.10.2026): 91 реда 955 (само Гоце
-- Делчев); попълнени от обекта — 1, той НЕ е повторение; повторения до 10 дни
-- — 12, всичките непопълнени. Изискването важи само при ново „Запази", тоест
-- нищо записано не става невалидно.
--
-- ПОРЕДНОСТ: миграция → push на кода. minusi.js иска колоната action в
-- select-а; ако кодът е на живо преди миграцията, „Минуси" показва грешка.
--
-- Огледало (Живко): два реда в zhivko-opashka.md, „Чака изпращане".
--
-- ROLLBACK (губи въведените действия):
--   delete from public.app_settings where key = 'minus_repeat_days';
--   alter table public.minus_movements drop column if exists action;

alter table public.minus_movements add column action text null;
comment on column public.minus_movements.action is
  'Действие срещу повторен минус (до app_settings.minus_repeat_days дни след предишния 955 за същия обект и материал). Попълва обектът; задължително при повторение.';

insert into public.app_settings (key, value, updated_at, updated_by)
  values ('minus_repeat_days', '10', now(), 'minusi-repeats')
  on conflict (key) do nothing;
