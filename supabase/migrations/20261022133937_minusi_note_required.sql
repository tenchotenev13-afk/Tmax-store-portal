-- 20261022133937_minusi_note_required — огледало: minusi-note-required-schema.sql.
-- Приложено 22.10.2026 с apply_migration; версията е дадена от базата.

alter table public.minus_reasons add column requires_note boolean not null default false;
comment on column public.minus_reasons.requires_note is
  'true = при тази причина „Бележка" е задължителна (напр. номер и дата на клиентската поръчка).';

update public.minus_reasons set requires_note = true
  where id = 1 and label = 'клиентска поръчка (номер/дата)';
