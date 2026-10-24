-- storno-notes-delete-schema.sql — Разлики → „✍️ Счетоводител": изтриване на
-- съобщение (решение на Тенчо 24.10.2026; Цветелина 23.10 „Тези уж ги изтрих,
-- ама стоят скрити").
-- Огледало на миграцията supabase/migrations/20261024150000_storno_notes_delete.sql
-- (+ _down.sql); версията в базата се дописва след apply_migration.
--
-- ЗАЩО. Етап 1 нарочно беше без delete политика. „🗑 Изтрий" на картата
-- (sdNoteDelete в stock-differences.js) — само Цвети и admin
-- (canSendDiffEmail), с confirm. Както при останалите таблици с anon ключ,
-- „кой може" е проверка в клиента, не в базата.
--
-- ОТГОВОРИТЕ: storno_note_replies.note_id → storno_notes on delete cascade.
-- Cascade НЕ минава през RLS — проверено 24.10.2026 в транзакция с rollback
-- (като anon, политика само на storno_notes: 1 съобщение изтрито, 0 отговора
-- останали). Затова delete политика на storno_note_replies НЕ се добавя —
-- отговор поотделно не се трие от клиента.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): само политика — 0 засегнати реда.
-- ОГЛЕДАЛО (Живко): ред НЯМА — политиките не отиват в огледалото.
-- ПОРЕДНОСТ: миграцията преди push-а. Без нея бутонът трие 0 реда и казва
-- „НЕ е изтрито" (count 0) — не мълчи.

create policy storno_notes_delete on public.storno_notes for delete to anon using (true);

-- ── ROLLBACK ──────────────────────────────────────────────────────────────
-- drop policy if exists storno_notes_delete on public.storno_notes;
