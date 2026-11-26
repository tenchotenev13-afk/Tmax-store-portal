-- kasa-etap2-schema.sql
-- Каса, етап 2: публичният ключ (anon, authenticated) спира да чете
-- съдържанието на седемте касови таблици и файловете в kasa-docs.
-- Решение на Тенчо 26.11.2026 — ВАРИАНТ А: отнема се SELECT на таблицата,
-- но остава колонен SELECT само за колоните, по които браузърът филтрира при
-- запис (PATCH с WHERE изисква SELECT върху колоните във филтъра). Записите
-- минават през kasa-api в етап 3. Проект: claude/kasa-api-dizajn.md.
--
-- Миграция kasa_etap2_revoke_reads — НЕ Е ПРИЛОЖЕНА (прилага се отделно, рано
-- сутрин, след като живият kasa.js / kasa-docs.js е сверен с HEAD и kasa-api
-- със storno_items_save / storno_delete е деплойната).
--
-- Колоните (фаза 0, 26.11.2026 — опис на W1–W23, kasaUpsert, confirmZoborot):
--   kasa_reports    (id)                         — PATCH по id
--   kasa_glavna     (id, store_name, date, status) — PATCH по id; kasaUpsert
--                    409 → PATCH по store_name+date; W3 + status=eq.returned
--   kasa_zoborot    (id, store_name, date, status) — същото
--   kasa_storno     (id)                         — PATCH по id
--   daily_turnover  (id)                         — PATCH по id
--   kasa_documents  —  само INSERT (браузърът само качва; четенето е kasa-api)
--   kasa_storno_items — нищо (stornoSaveItems → kasa-api storno_items_save)
-- Всички записи от браузъра са с Prefer: return=minimal и без on_conflict.
-- Проба (временна таблица, set local role anon, PostgREST вид на заявката,
-- отменена): select id → минава; select на друга колона / * → 42501; PATCH
-- по id и по store_name+date+status с returning 1 → минава; POST масив →
-- минава; дубликат → 23505 (пътят към 409); PATCH с филтър по колона без
-- права → 42501; returning * → 42501.
--
-- Сверка преди (26.11.2026):
-- - ACL на седемте: anon=arwDxtm, authenticated=arwDxtm (kasa_storno и
--   kasa_storno_items — arwdDxtm); mirror_reader=r; колонни ACL — няма.
--   REVOKE на таблица маха и колонните права, затова първо revoke, после
--   grant select (колони).
-- - Тригери: само kasa_reports_strip_dash_trg (INVOKER, не чете таблици).
--   Изгледи върху тях — няма. SQL функции — само perform_daily_backup
--   (DEFINER, EXECUTE само postgres и service_role). Кронове — не ги пипат.
-- - Едж функциите (kasa-api, send-oborot-report, send-scheduled-report) —
--   service ключ. Огледалото — mirror_reader (своите политики
--   mirror_reader_select и mirror_reader_kasa_docs_read) — НЕ се пипа.
-- - Storage kasa-docs (bucket public=false): kasa_docs_read, kasa_docs_sign
--   (SELECT), kasa_docs_delete (DELETE, не се ползва от кода),
--   kasa_docs_upload (INSERT — остава). Качването е с x-upsert: false
--   (kasa-docs.js, същият комит) — upsert би искал и SELECT + UPDATE.
--
-- Проверка след прилагане:
-- - в транзакция, set local role anon: select на колона със сума → 42501;
--   select id → минава; PATCH по id → минава (rollback);
-- - като mirror_reader: броевете на седемте таблици = като postgres;
-- - HTTP с anon ключа: GET kasa_reports?select=id → 200;
--   ?select=* → 401/403; подписване/сваляне от kasa-docs → отказ.

-- kasa_reports
revoke select, truncate, references, trigger on public.kasa_reports from anon, authenticated;
grant select (id) on public.kasa_reports to anon, authenticated;

-- kasa_glavna
revoke select, truncate, references, trigger on public.kasa_glavna from anon, authenticated;
grant select (id, store_name, date, status) on public.kasa_glavna to anon, authenticated;

-- kasa_zoborot
revoke select, truncate, references, trigger on public.kasa_zoborot from anon, authenticated;
grant select (id, store_name, date, status) on public.kasa_zoborot to anon, authenticated;

-- kasa_storno (+ DELETE — решение 1 от 19.11; триенето е kasa-api storno_delete)
revoke select, delete, truncate, references, trigger on public.kasa_storno from anon, authenticated;
grant select (id) on public.kasa_storno to anon, authenticated;

-- daily_turnover
revoke select, truncate, references, trigger on public.daily_turnover from anon, authenticated;
grant select (id) on public.daily_turnover to anon, authenticated;

-- kasa_documents — остава само INSERT
revoke all on public.kasa_documents from anon, authenticated;
grant insert on public.kasa_documents to anon, authenticated;

-- kasa_storno_items — нищо за браузъра (kasa-api storno_items_save)
revoke all on public.kasa_storno_items from anon, authenticated;

-- Storage kasa-docs: остава само kasa_docs_upload (INSERT)
drop policy kasa_docs_read on storage.objects;
drop policy kasa_docs_sign on storage.objects;
drop policy kasa_docs_delete on storage.objects;

-- ROLLBACK (дословно обратното; ACL-ът се връща на arwDxtm / arwdDxtm):
-- revoke select (id) on public.kasa_reports from anon, authenticated;
-- grant select, truncate, references, trigger on public.kasa_reports to anon, authenticated;
-- revoke select (id, store_name, date, status) on public.kasa_glavna from anon, authenticated;
-- grant select, truncate, references, trigger on public.kasa_glavna to anon, authenticated;
-- revoke select (id, store_name, date, status) on public.kasa_zoborot from anon, authenticated;
-- grant select, truncate, references, trigger on public.kasa_zoborot to anon, authenticated;
-- revoke select (id) on public.kasa_storno from anon, authenticated;
-- grant select, delete, truncate, references, trigger on public.kasa_storno to anon, authenticated;
-- revoke select (id) on public.daily_turnover from anon, authenticated;
-- grant select, truncate, references, trigger on public.daily_turnover to anon, authenticated;
-- grant select, update, truncate, references, trigger, maintain on public.kasa_documents to anon, authenticated;
-- grant all on public.kasa_storno_items to anon, authenticated;
-- create policy kasa_docs_read on storage.objects as permissive for select to anon using (bucket_id = 'kasa-docs'::text);
-- create policy kasa_docs_sign on storage.objects as permissive for select to anon using (bucket_id = 'kasa-docs'::text);
-- create policy kasa_docs_delete on storage.objects as permissive for delete to anon using (bucket_id = 'kasa-docs'::text);
