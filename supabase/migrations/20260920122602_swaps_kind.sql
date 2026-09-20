-- Приложено в Supabase на 20.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: swaps_kind (version 20260920122602)
--
-- Файлът е записан СЛЕД прилагането. SQL-ът отдолу е сверен машинно
-- (md5 4648289e… + дължина 983) със statements в
-- supabase_migrations.schema_migrations — един statement, байт в байт същият.
--
-- Нова колона → огледалото (Живко): mirror-schema.sql и $TableColumns за
-- stock_diff_swaps в sync-mirror.ps1.
--
-- Rollback: supabase/migrations/20260920122602_swaps_kind_down.sql
--
-- ЗНАЕ СЕ И НЕ СЕ НАЛАГА ОТ БАЗАТА: „при doc transport_mode остава null" е
-- правило на UI-а, не check. Редът kind='doc', transport_mode='van' минава и
-- двата constraint-а. Отделен check (kind <> 'doc' or transport_mode is null)
-- е възможен и днес е безплатен (0 реда), но засяга и потока status='sent',
-- който още не е написан в клиента — затова е отделно решение, не рутина.

-- Размяна по документи срещу физическа (решение 20.09.2026)
-- doc      = само по документи: трансфер магазин→магазин в SAP, стоката НЕ
--            пътува. Най-честият случай, затова е подразбиращият се.
-- physical = стоката пътува с бус или камион → transport_mode се попълва.
-- При kind='doc' transport_mode остава null.
--
-- Правило 9 (проверено непосредствено преди прилагане): stock_diff_swaps има
-- 0 реда, 0 с transport_mode — нито един заварен ред не става невалиден от
-- not null default 'doc'. Името kind и stock_diff_swaps_kind_check са свободни.
--
-- Rollback: alter table public.stock_diff_swaps drop column kind;

alter table public.stock_diff_swaps add column kind text not null default 'doc'
  check (kind in ('doc','physical'));

comment on column public.stock_diff_swaps.kind is
  'doc = само по документи (трансфер магазин→магазин в SAP, стоката не пътува; най-честият случай); physical = стоката пътува с бус/камион. При doc transport_mode остава null.';
