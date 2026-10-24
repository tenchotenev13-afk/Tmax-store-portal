-- storno-notes-notify-schema.sql — Разлики → „Сторна по грешен прием":
-- „✍️ Счетоводител", етап 2 — известия (24.10.2026).
-- Огледало на миграцията supabase/migrations/20261024090000_storno_notes_notify.sql
-- (+ _down.sql); приложена 24.10.2026 с apply_migration, версия в базата 20261024125100.
--
-- ЗАЩО. При „Запиши" (ново съобщение) и „Изпрати" (отговор) клиентът праща
-- push + имейл (sdNoteNotify в stock-differences.js; бутон, не зареждане —
-- CLAUDE.md т.14). Записът остава при провал на известието; провалът се
-- записва в notify_error и картата показва „⚠️ Известието не тръгна" с
-- „🔁 Прати пак". Успех → notified_at = now(), notify_error = null.
-- Образец: picking_shipments.notify_error / notified_at (Пикинг 2Б).
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): само nullable колони без default — 0 засегнати
-- реда; заварените записи остават с null (= „не е опитвано", без знак).
-- ПОРЕДНОСТ: колоните могат преди push-а — кодът само ги чете/пише при
-- натиснат бутон; без тях PATCH-ът след известието би паднал (42703).
-- RLS: политиките storno_*_update (anon, using true) вече покриват PATCH-а.
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".

alter table public.storno_notes
  add column notify_error text,
  add column notified_at timestamptz;
alter table public.storno_note_replies
  add column notify_error text,
  add column notified_at timestamptz;

comment on column public.storno_notes.notify_error is
  'Етап 2: причината, ако push/имейлът при запис не е тръгнал; null = наред или не е опитвано.';
comment on column public.storno_notes.notified_at is
  'Етап 2: кога известието (push + имейл) е тръгнало успешно.';
comment on column public.storno_note_replies.notify_error is
  'Етап 2: причината, ако push/имейлът при отговор не е тръгнал; null = наред или не е опитвано.';
comment on column public.storno_note_replies.notified_at is
  'Етап 2: кога известието (push + имейл) е тръгнало успешно.';

-- ── ROLLBACK ──────────────────────────────────────────────────────────────
-- Губи само записа на известията (не самите съобщения). Преди него — push на
-- stock-differences.js без етап 2, иначе PATCH-ът след известие пада.
--
-- alter table public.storno_note_replies drop column if exists notified_at, drop column if exists notify_error;
-- alter table public.storno_notes drop column if exists notified_at, drop column if exists notify_error;
