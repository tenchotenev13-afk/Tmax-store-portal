-- storno-notes-test-cleanup.sql — Разлики → „✍️ Счетоводител": изтриване на
-- тестовите съобщения (решение на Тенчо 24.10.2026; Цветелина 23.10 „Тези уж ги
-- изтрих, ама стоят скрити"). DML, не миграция.
--
-- 5 съобщения + 2 отговора (и двата side 'store', по тестовите на Кърджали):
--   038ed55e… Кърджали „проверка 23.10…" closed · bd841493… Кърджали „проверка 24.10…" closed
--   1efa6149… / 71a048d5… / d533d446… — Гоце Делчев, „Цветелина Тенева", 23.10,
--   status 'storno', report_id null (бланките са изтрити — FK on delete set null).
-- И петте са тестови по СЪДЪРЖАНИЕ (сверено от чата 24.10): Кърджали — „не е
-- истинско“; Гоце Делчев — „=test“, „тест“, „артикул 11111“ / док. 410000001.
-- Отговор от обект или счетоводител по трите на Гоце Делчев няма.
--
-- ROLLBACK-ът по-долу е генериран машинно (node → PostgREST, anon) от редовете
-- в базата ПРЕДИ изтриването, всички колони. json_populate_recordset по типа
-- на таблицата — колоните се взимат по име.
--
-- ИЗПЪЛНЕНО 24.10.2026 (execute_sql): преди това rollback-ът е проверен в
-- транзакция с rollback (изтриване → insert от този файл → сравнение по всички
-- колони в двете посоки: 0 разлики). Изтрити 5 съобщения, 2 отговора по cascade;
-- след това storno_notes = 0, storno_note_replies = 0, сираци 0.

-- ── ИЗТРИВАНЕ (една транзакция, гард по броя) ─────────────────────────────
-- begin;
-- do $$
-- declare n int; r int;
-- begin
--   select count(*) into n from public.storno_notes where id in (
--     '038ed55e-46b0-44ff-bfd1-e77af12f0978',
--       'bd841493-858b-4d8d-b3eb-697203f53e84',
--       '1efa6149-effa-437b-8e55-9aff5c7087d2',
--       '71a048d5-04a0-433c-9710-c026ebc851c5',
--       'd533d446-0486-4fd8-a4d7-19900b4204ea');
--   select count(*) into r from public.storno_note_replies where note_id in (
--     '038ed55e-46b0-44ff-bfd1-e77af12f0978',
--       'bd841493-858b-4d8d-b3eb-697203f53e84',
--       '1efa6149-effa-437b-8e55-9aff5c7087d2',
--       '71a048d5-04a0-433c-9710-c026ebc851c5',
--       'd533d446-0486-4fd8-a4d7-19900b4204ea');
--   if n <> 5 or r <> 2 then raise exception 'броят не съвпада: % съобщения / % отговора (очаквани 5 / 2)', n, r; end if;
--   delete from public.storno_notes where id in (
--     '038ed55e-46b0-44ff-bfd1-e77af12f0978',
--       'bd841493-858b-4d8d-b3eb-697203f53e84',
--       '1efa6149-effa-437b-8e55-9aff5c7087d2',
--       '71a048d5-04a0-433c-9710-c026ebc851c5',
--       'd533d446-0486-4fd8-a4d7-19900b4204ea');  -- отговорите: on delete cascade
-- end $$;
-- commit;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────
begin;
insert into public.storno_notes
select * from json_populate_recordset(null::public.storno_notes, $json$[
 {
  "id": "038ed55e-46b0-44ff-bfd1-e77af12f0978",
  "store_name": "Кърджали",
  "supplier": "ПРОВЕРКА",
  "document_number": "0000",
  "body": "проверка 23.10 — тестово съобщение от Тенчо, не е истинско",
  "files": [],
  "status": "closed",
  "report_id": null,
  "created_by": "Тен Тенев",
  "created_at": "2026-10-23T10:40:26.383582+00:00",
  "closed_by": "Тен Тенев",
  "closed_at": "2026-10-23T10:43:33.898+00:00",
  "notify_error": null,
  "notified_at": null
 },
 {
  "id": "1efa6149-effa-437b-8e55-9aff5c7087d2",
  "store_name": "Гоце Делчев",
  "supplier": "БУЛТЕКС 99 ЕООД",
  "document_number": "410000001",
  "body": "Фактурирани са 5 броя, а сте приели 4-  артикул 11111\nПроверете и върнете отговор",
  "files": [],
  "status": "storno",
  "report_id": null,
  "created_by": "Цветелина Тенева",
  "created_at": "2026-10-23T10:50:41.29583+00:00",
  "closed_by": null,
  "closed_at": null,
  "notify_error": null,
  "notified_at": null
 },
 {
  "id": "71a048d5-04a0-433c-9710-c026ebc851c5",
  "store_name": "Гоце Делчев",
  "supplier": "ДФХ БЪЛГАРИЯ ЕООД",
  "document_number": "4100203602",
  "body": "=test",
  "files": [],
  "status": "storno",
  "report_id": null,
  "created_by": "Цветелина Тенева",
  "created_at": "2026-10-23T10:58:51.672949+00:00",
  "closed_by": null,
  "closed_at": null,
  "notify_error": null,
  "notified_at": null
 },
 {
  "id": "d533d446-0486-4fd8-a4d7-19900b4204ea",
  "store_name": "Гоце Делчев",
  "supplier": "ДОМКО",
  "document_number": "4100203602",
  "body": "тест",
  "files": [],
  "status": "storno",
  "report_id": null,
  "created_by": "Цветелина Тенева",
  "created_at": "2026-10-23T11:36:27.880363+00:00",
  "closed_by": null,
  "closed_at": null,
  "notify_error": null,
  "notified_at": null
 },
 {
  "id": "bd841493-858b-4d8d-b3eb-697203f53e84",
  "store_name": "Кърджали",
  "supplier": "ПРОВЕРКА",
  "document_number": "0000",
  "body": "проверка 24.10 — тест на известията (етап 2), не е истинско",
  "files": [],
  "status": "closed",
  "report_id": null,
  "created_by": "Тен Тенев",
  "created_at": "2026-10-24T13:05:42.556502+00:00",
  "closed_by": "Управител Кърджали",
  "closed_at": "2026-10-24T13:08:01.633+00:00",
  "notify_error": null,
  "notified_at": "2026-10-24T13:05:46.289+00:00"
 }
]$json$);
insert into public.storno_note_replies
select * from json_populate_recordset(null::public.storno_note_replies, $json$[
 {
  "id": "e0de5454-1a71-481a-a1fe-a37185ccc7d8",
  "note_id": "038ed55e-46b0-44ff-bfd1-e77af12f0978",
  "body": "проверка 23.10 — тестов отговор от обекта",
  "files": [],
  "side": "store",
  "created_by": "Управител Кърджали",
  "created_at": "2026-10-23T10:42:20.55502+00:00",
  "notify_error": null,
  "notified_at": null
 },
 {
  "id": "b983dc25-f7c7-4bb3-8ee4-6b5fb17d08f5",
  "note_id": "bd841493-858b-4d8d-b3eb-697203f53e84",
  "body": "проверка 24.10 — тестов отговор от обекта (етап 2)",
  "files": [],
  "side": "store",
  "created_by": "Управител Кърджали",
  "created_at": "2026-10-24T13:07:36.790514+00:00",
  "notify_error": null,
  "notified_at": "2026-10-24T13:07:38.031+00:00"
 }
]$json$);
commit;
