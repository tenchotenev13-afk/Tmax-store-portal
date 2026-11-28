-- razliki-id-nomer-schema.sql — 28.11.2026, сесия razliki-id-nomer
-- Междускладова бланка за разлики: ИД № (изходящата доставка на склада, 80…)
-- отделно от ВД № на обекта (180…, остава в document_number).
-- Решение на Тенчо 28.11.2026. Приложена 28.11.2026 като миграция
-- razliki_id_nomer, версия 20261128152633. Порталът пише колоната само при посока
-- 'interstore'; при Доставчик и Сторна е null.
--
-- Права: differences_reports е с изключено RLS и с права на НИВО ТАБЛИЦА —
-- anon/authenticated SELECT/INSERT/UPDATE, mirror_reader SELECT (проверено
-- 28.11.2026). Новата колона ги наследява; колонен grant не е нужен (таблицата
-- не е users/stores). Таблицата вече е в tools/mirror-key/mirror-tables.txt.
--
-- Nullable колона без default — заварените редове не се пипат; кодът я чете
-- с `|| ''`, затова миграцията може да мине ПРЕДИ push-а на кода. Обратното
-- (код без колона) НЕ работи: POST с outbound_doc би върнал 400.

alter table public.differences_reports
  add column if not exists outbound_doc text null;

comment on column public.differences_reports.outbound_doc is
  'ИД № — изходящата доставка на логистичния склад (80…), само при direction=interstore. ВД № на обекта е в document_number. razliki-id-nomer, 28.11.2026.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────
-- Губи въведените ИД — преди това: select id, outbound_doc from
-- public.differences_reports where outbound_doc is not null;
-- alter table public.differences_reports drop column if exists outbound_doc;
