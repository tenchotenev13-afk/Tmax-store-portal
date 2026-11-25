-- warranty-templates-sectors-schema.sql
-- Рекламации → Гаранционен справочник: една бланка може да е в НЯКОЛКО
-- сектора (решение на Тенчо 25.11.2026 — марки собствен внос, напр. и Градина,
-- и Машини). Заменя единичната колона warranty_templates.sector
-- (warranty-templates-sector-schema.sql, 24.11.2026).
--
-- Колоната е nullable, без CHECK и без default: списъкът с 8-те сектора е
-- константа в кода (REF_SECTORS), стойност извън него просто не се показва.
-- NULL = бланката е само в общото меню „🖨 Гаранционна карта ▾“. Кодът никога
-- не пише празен масив — без отметка пише NULL.
-- Права: anon/authenticated вече имат UPDATE на ниво таблица — новата колона
-- се пише без отделен grant.

-- ── UP (миграция warranty_templates_sectors, версия 20261125182251, приложена 25.11.2026) ──
alter table public.warranty_templates add column sectors text[];

-- ── DATA (отделна стъпка НЕПОСРЕДСТВЕНО ПРЕДИ push-а на reference.js, след
--    комита — дотогава живото „Управление“ още пише в sector и по-ранно копие
--    би изпуснало промяна; решение на Тенчо 25.11.2026) ──
-- update public.warranty_templates set sectors = array[sector] where sector is not null;
-- Rollback на данните: update public.warranty_templates set sectors = null;

-- ── ROLLBACK ──
-- alter table public.warranty_templates drop column sectors;

-- ── DROP на старата колона sector (ОТДЕЛНА миграция, след push, сверка на
--    Pages и проверка на живо — live кодът вече не чете .sector; преди нея
--    сверка, че sectors = array[sector] за всеки ред със sector) ──
-- alter table public.warranty_templates drop column sector;
-- Rollback:
-- alter table public.warranty_templates add column sector text;
-- update public.warranty_templates set sector = sectors[1];
