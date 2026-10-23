-- Rollback на 20261023094357_storno_notes.
--
-- ГУБИ ДАННИ: всички съобщения от счетоводството и отговорите им. Преди rollback:
--   select status, count(*) from storno_notes group by status;
-- stock-differences.js чете storno_notes при отваряне на Разлики — върни и
-- кода, иначе подтабът „Сторна по грешен прием" показва червен ред.
drop table if exists public.storno_note_replies;
drop table if exists public.storno_notes;
