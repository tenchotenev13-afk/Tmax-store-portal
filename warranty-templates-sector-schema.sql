-- warranty-templates-sector-schema.sql
-- Рекламации → Гаранционен справочник: бланките (warranty_templates) се
-- закачат към сектор. Редът „Гаранционни карти по сектори:“ в reference.js
-- групира бланките по тази колона; изборът е в „⚙️ Управление на записи“.
--
-- Колоната е nullable и без CHECK: списъкът с 8-те сектора е константа в
-- кода (REF_SECTORS), стойност извън него просто не се показва в реда.
-- NULL = бланката е само в общото меню „🖨 Гаранционна карта ▾“.
-- Права: anon/authenticated вече имат UPDATE на ниво таблица (RLS изключено) —
-- новата колона се пише без отделен grant.

-- ── UP (миграция warranty_templates_sector, версия 20261124110821, приложена 24.11.2026) ──
alter table public.warranty_templates add column sector text;

-- ── DATA (отделна стъпка, след сверка на колоната; изпълнено 24.11.2026 13:09
--    София с execute_sql, с „and sector is null“ — 3 + 2 реда) ──
-- update public.warranty_templates set sector = 'Машини'
--   where filename in ('tayfun.pdf', 'mehanik.pdf', 'hobby.pdf');
-- update public.warranty_templates set sector = 'Баня'
--   where filename in ('smesiteli.pdf', 'monoblok.pdf');
-- Rollback на данните: update public.warranty_templates set sector = null;

-- ── ROLLBACK ──
-- alter table public.warranty_templates drop column sector;
