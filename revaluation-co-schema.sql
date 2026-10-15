-- revaluation-co-schema.sql
-- Огледало на supabase/migrations/20261015140000_revaluation_co.sql.
--
-- ЗАЩО (решение на Тенчо и Елица Гюрова, 13–15.10.2026). Преоценка, етап 3а —
-- обработка от Контролинг. Елица попълва за всеки ред преоценен код, цена на
-- преоценения код, коментар (вече има колони от етап 1: new_sap_code,
-- sale_price, co_comment) и ПРЕХВЪРЛЕНО количество — новата колона co_qty
-- (може да се различава от количеството на обекта). „Готово за обект"
-- отбелязва бланката като обработена: нов статус 'processed' + кой и кога.
--
-- - revaluation_items.co_qty — numeric(12,3) NULL; NULL = ЦО още не е
--   решило (износът пада към qty).
-- - revaluation_submissions.processed_at / processed_by — кога и кой е
--   натиснал „Готово за обект"; нулират се при „Отключи бланката".
-- - revaluation_submissions.status — нова стойност 'processed' (draft →
--   submitted → processed; „Отключи" връща към draft). Без CHECK, както
--   досега — стойностите са в коментара на колоната.
--
-- ПРАВА. Нищо ново: политиките на двете таблици от етап 1 покриват новите
-- колони (anon select / insert / update). Табличните GRANT-ове също.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9, 15.10.2026): 1 бланка в базата — Кърджали,
-- 'submitted', 3 реда (кампания „Тестова преоценка Кърджали 10.2026“). Новите
-- колони са NULL, не задължителни — 0 засегнати; бланката остава 'submitted'.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push-а на кода — revaluation.js чете
-- processed_at и пише co_qty при отваряне на бланка от ЦО.
--
-- Огледало (Живко): редове в zhivko-opashka.md, „Чака изпращане".
-- Rollback: supabase/migrations/20261015140000_revaluation_co_down.sql
--   alter table public.revaluation_items drop column co_qty;
--   alter table public.revaluation_submissions drop column processed_at, drop column processed_by;
--   (+ статус 'processed' → 'submitted', виж _down)

alter table public.revaluation_items add column co_qty numeric(12,3);
alter table public.revaluation_submissions add column processed_at timestamptz;
alter table public.revaluation_submissions add column processed_by text;

comment on column public.revaluation_items.co_qty is
  'Прехвърлено количество (ЦО, етап 3а); NULL = не е решено — износът ползва qty.';
comment on column public.revaluation_submissions.status is
  'draft = чернова | submitted = подадена (submitted_at / submitted_by) | processed = обработена от ЦО (processed_at / processed_by). ЦО отключва → обратно draft + reopened_at / reopened_by.';
comment on column public.revaluation_submissions.processed_at is
  'Кога ЦО е натиснал „Готово за обект" (етап 3а); NULL при отключване.';
