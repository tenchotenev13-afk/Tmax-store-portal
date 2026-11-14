-- revaluation-approve-schema.sql
-- Огледало на supabase/migrations/20261114203015_revaluation_approve.sql
-- (приложена 14.11.2026).
--
-- ЗАЩО (решение на Тенчо, 13.11.2026, по искане на Теодор). Всяка подадена
-- бланка в Преоценка минава през одобрение от регионалния на обекта, преди да
-- стигне до Контролинг. Регионален на обект = активен потребител с
-- is_regional = true и обекта в assigned_stores (всяка роля).
--
-- - revaluation_submissions.status — нова стойност 'approved':
--   draft → submitted (= чака регионалния) → approved → processed.
--   Обект без регионален: draft → approved направо (approved_by
--   'без регионален'). „Върни на обекта" → draft + return_note.
--   „Отключи бланката" (ЦО) → draft и чисти approved_*. Без CHECK, както
--   досега — стойностите са в коментара на колоната.
-- - approved_at / approved_by — кога и кой е одобрил (или 'без регионален').
-- - return_note / returned_at / returned_by — последното връщане от
--   регионалния; обектът вижда бележката, докато бланката е чернова след него.
--
-- ПРАВА. Нищо ново: политиките на revaluation_submissions (anon select /
-- insert / update) покриват новите колони; табличните GRANT-ове също.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9, 13.11.2026): 4 бланки. Новите колони са NULL,
-- не задължителни — 0 невалидни. Трите 'submitted' в „Задължителна преоценка
-- 11.2026" (Шумен, Габрово, Кърджали) след push-а биха станали „чака
-- регионалния" и Елица не би могла да ги обработи — затова беше планиран
-- отделен DML (стъпка 3). При прилагането (14.11.2026) и четирите бланки
-- вече са 'processed' (Елица е обработила трите) — DML за бланките няма
-- какво да промени; остава само ключът revaluation_approvers.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push-а на кода — revaluation.js пише
-- approved_* и return_* при „Подай".
--
-- Огледало (Живко): редове в zhivko-opashka.md, „Чака изпращане".
-- Rollback: supabase/migrations/20261114203015_revaluation_approve_down.sql
--   update public.revaluation_submissions set status = 'submitted' where status = 'approved';
--   alter table public.revaluation_submissions
--     drop column approved_at, drop column approved_by,
--     drop column return_note, drop column returned_at, drop column returned_by;
--   comment on column public.revaluation_submissions.status is <старият текст, етап 3а>;

alter table public.revaluation_submissions
  add column approved_at timestamptz,
  add column approved_by text,
  add column return_note text,
  add column returned_at timestamptz,
  add column returned_by text;

comment on column public.revaluation_submissions.status is
  'draft = чернова | submitted = подадена, чака регионалния (submitted_at / submitted_by) | approved = одобрена от регионалния или обект без регионален (approved_at / approved_by) | processed = обработена от ЦО (processed_at / processed_by). Регионалният връща → draft + return_note; ЦО отключва → draft + reopened_at / reopened_by.';
comment on column public.revaluation_submissions.approved_at is
  'Кога регионалният е одобрил (13.11.2026); при обект без регионален = submitted_at. NULL при връщане / отключване.';
comment on column public.revaluation_submissions.approved_by is
  'Кой е одобрил; ''без регионален'' — обектът няма регионален; ''преди одобрението (13.11.2026)'' — заварените.';
comment on column public.revaluation_submissions.return_note is
  'Коментар на регионалния при последното „Върни на обекта" (задължителен).';
comment on column public.revaluation_submissions.returned_at is
  'Кога е последното връщане от регионалния.';
comment on column public.revaluation_submissions.returned_by is
  'Кой регионален е върнал бланката последно.';
