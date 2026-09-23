-- Rollback на 20260923080350_revoke_public_execute_perform_daily_backup.sql
--
-- ВНИМАНИЕ: този rollback НЕ връща гранта на PUBLIC. Съзнателно е.
-- PUBLIC EXECUTE върху SECURITY DEFINER функция е самият дефект, а не
-- състоянието, към което се връщаме — възстановяването му би значело
-- „всеки с публичния anon ключ може да пуска бекъпи", включително роли,
-- за които никой не е мислил. Връща се само явното право на anon и
-- authenticated, тоест толкова, колкото е нужно, за да проработи отново
-- triggerManualBackup() в admin.js.
--
-- Кронът не се пипа — job 7 върви като postgres (собственик) и не зависи
-- от нито един от двата гранта.

grant execute on function public.perform_daily_backup(text, text) to anon, authenticated;
