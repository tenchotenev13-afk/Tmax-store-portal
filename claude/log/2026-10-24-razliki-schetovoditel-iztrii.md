# 24.10 — razliki-schetovoditel-iztrii

- Разлики → „✍️ Счетоводител“: „🗑 Изтрий“ на картата на съобщение — само Цвети и admin (`canSendDiffEmail`), с confirm; `sbDelete('storno_notes', id=eq.…)`, отговорите — FK on delete cascade; провал или 0 изтрити реда → червен тост, картата остава.
- `sdDeleteReport`: бланка „грешен прием“ → преди всичко необратимо `PATCH storno_notes?report_id=eq.<id>` {status:'open', report_id:null}; паднал PATCH → бланката не се трие (`sdDeleteReportFiles` — старите стъпки а–в).
- Миграция `20261024150000_storno_notes_delete` (+ `_down.sql`, огледало `storno-notes-delete-schema.sql`): delete политика за anon само на `storno_notes` — cascade не минава през RLS (проверено в транзакция с rollback). Ред за Живко няма — политиките не отиват в огледалото.
- Данни: `storno-notes-test-cleanup.sql` (изтриване + машинно генериран rollback) — 5 тестови съобщения (2 Кърджали, 3 Гоце Делчев) и 2 отговора.
- Тест: `tests/storno-notes.test.js` + к) л) м); мутации X1–X6 — и шестте убити. SHA е комитът, който добавя този файл.
