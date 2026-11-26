-- revaluation-valid-from-schema.sql
-- Миграция revaluation_valid_from (25.11.2026, сесия preocenka-etiketi-proces).
-- Приложена 26.11.2026 — версия 20261126062108 (apply_migration). Проверено:
-- колоната е date, NULL, без default; 0 от 7 бланки с попълнена дата.
--
-- ЗАЩО. „Валидна от" (#rv-vk-from) се ползваше само за VK11 файла и не се
-- пазеше — обектът не знаеше от кога важат новите цени и кога да слага
-- етикетите. „✅ Готово за обект" вече иска датата и я записва в същия PATCH
-- със status 'processed'; „🔓 Отключи" я нулира заедно с processed_at.
-- Показва се в бланката (обект / регионален / ЦО), в „📁 История", на етикета
-- и в известието „обработена". VK11 при processed бланка взима нея.
--
-- - revaluation_submissions.prices_valid_from — date, NULL, без default.
--   NULL = бланката не е обработена или е обработена преди тази промяна
--   (4 бланки към 25.11.2026); тогава етикетът ползва processed_at, както досега.
--
-- ПРАВА. Нищо ново: политиките на revaluation_submissions (anon select /
-- insert / update) и табличните GRANT-ове покриват новата колона.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): колоната е nullable и не е задължителна —
-- 0 невалидни реда. Старият код не я чете → миграцията може да мине преди
-- push-а на клиента.

alter table public.revaluation_submissions
  add column if not exists prices_valid_from date;

comment on column public.revaluation_submissions.prices_valid_from is
  'От кога важат новите цени (въвежда ЦО при „Готово за обект"). NULL = необработена или обработена преди 25.11.2026 — тогава се ползва processed_at.';

-- ROLLBACK (данните в колоната се губят — само датите на обработените след
-- прилагането бланки; processed_at остава):
-- alter table public.revaluation_submissions drop column if exists prices_valid_from;
