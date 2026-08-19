-- Разлики: полета за отговорност (кой реши / кой изпълни)
-- Приложено в Supabase на 19.08.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: stock_differences_responsibility_fields

alter table public.stock_differences
  add column if not exists resolved_by    text,
  add column if not exists resolved_at    timestamptz,
  add column if not exists completed_by   text,
  add column if not exists completed_at   timestamptz;

comment on column public.stock_differences.resolved_by  is 'Кой определи типа на решението (Цвети/admin/логистика). Презаписва се при всяка смяна на типа.';
comment on column public.stock_differences.resolved_at  is 'Кога е определен типът на решението.';
comment on column public.stock_differences.completed_by is 'Кой маркира реда като взет/заприходен. Изчиства се при връщане към pending.';
comment on column public.stock_differences.completed_at is 'Кога е маркиран като взет/заприходен. Изчиства се при връщане към pending.';

-- Без backfill: за 7-те вече решени реда авторът не е записан никъде.
