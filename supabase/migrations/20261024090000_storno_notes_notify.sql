-- 20261024090000_storno_notes_notify — огледало: storno-notes-notify-schema.sql.
-- Приложено 24.10.2026 с apply_migration; версия в базата 20261024125100.
-- „✍️ Счетоводител", етап 2: резултат от известието на всеки запис.

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
