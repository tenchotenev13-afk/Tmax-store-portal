-- Rollback на 20261024090000_storno_notes_notify.
--
-- Губи само записа на известията (notify_error / notified_at), не съобщенията.
-- Преди него върни stock-differences.js без етап 2 — иначе PATCH-ът след
-- известие пада с 42703 (записът на съобщението си остава).
alter table public.storno_note_replies drop column if exists notified_at, drop column if exists notify_error;
alter table public.storno_notes drop column if exists notified_at, drop column if exists notify_error;
