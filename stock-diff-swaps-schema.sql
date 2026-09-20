-- Разлики (междускладови): размяна на артикул между два магазина
-- Приложено в Supabase на 16.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: stock_diff_swaps
--
-- ═══ ЗАЩО ═══════════════════════════════════════════════════════════════
-- Сигналът sdSwapCandidates (stock-differences.js) вече показва на склада,
-- че липсата на един магазин е излишъкът на друг. Тази таблица записва
-- самата размяна: складът свързва двата реда, магазинът с излишъка изпраща,
-- магазинът с липсата приема, складът приключва. UI е отделна задача.
--
-- Посоката: from = ИЗПРАЩАЩИЯТ = редът с ИЗЛИШЪК (excess);
--           to   = ПОЛУЧАВАЩИЯТ = редът с ЛИПСА (undelivered).
--
-- Статуси:
--   linked   — складът е свързал двата реда;
--   sent     — изпращащият магазин е изпратил (transport_mode van/truck, sap_doc_num);
--   received — получаващият магазин е приел физически;
--   closed   — складът е приключил и двата реда.
--
-- ═══ ЗАВАРЕНИТЕ ДАННИ (правило 9, проверено 16.09.2026) ═════════════════
-- Двойки по правилата на sdSwapCandidates, в SQL: различен store_name, същият
-- counterpart, direction='interstore', код след trim + ltrim('0'), undelivered
-- срещу excess, двата status<>'received', created_at в рамките на 14 дни.
-- 16 двойки, всички към „Логистичен склад Търговище":
--   код     липса (кол./реално)          излишък (кол./реално)       дни
--   100447  Сливен    60/—              Дупница    —/24                 8.9
--   101273  Раднево   10/7              Карлово    30/41                3.0
--   27738   Сливен    120/100           Търговище  80464309/200 (*)     1.0
--   27738   Троян     200/—             Търговище  80464309/200 (*)     4.3
--   78594   Козлодуй  20/—              Сливен     20/50                2.1
--   87773   Сливен    10/—              Козлодуй   —/10                 2.2
--   87799   Козлодуй  20/—              Раднево    —/10                 3.3
--   87801   Козлодуй  20/—              Раднево    —/20                 3.3
--   87803   Козлодуй  20/9              Раднево    10/11                3.3
--   91868   Козлодуй  20/—              Сливен     20/40                2.1
--   94150   Козлодуй  10/—              Раднево    —/10                 3.3
--   94150   Сливен    20/—              Раднево    —/10                 1.1
--   94152   Козлодуй  20/—              Раднево    —/20                 3.3
--   94152   Сливен    20/—              Раднево    —/20                 1.1
--   99450   Троян     10/— (бл. 4600185576)  Кърджали 10/60            10.0
--   99450   Троян     10/— (бл. 4600185299)  Кърджали 10/60            10.0
--   (*) quantity=80464309 е номер на документ, въведен в полето за количество.
--
-- ═══ ВИД НА РАЗМЯНАТА — kind (20.09.2026, миграция swaps_kind) ══════════
-- doc      = само по документи: трансфер магазин→магазин в SAP, стоката НЕ
--            пътува. Това е НАЙ-ЧЕСТИЯТ случай и затова е default-ът.
-- physical = стоката пътува с бус или камион; тогава transport_mode се
--            попълва при изпращането.
-- При doc transport_mode остава null.
--
-- Правило 9: при прилагането таблицата беше ПРАЗНА (0 реда, 0 с
-- transport_mode), тоест not null default 'doc' не направи нито един заварен
-- ред невалиден.
--
-- НЕ се налага от базата: редът kind='doc', transport_mode='van' минава и
-- двата check-а. Инвариантът се пази само от UI-а. Отделен check
-- (kind <> 'doc' or transport_mode is null) е възможен, но засяга и потока
-- status='sent', който още не е написан в клиента — отделно решение.
--
-- UI: openSwapLinkModal() в stock-differences.js дава избор с два radio-а
-- („📄 Документална" по подразбиране / „🚚 Физическа") и слага kind в POST-а;
-- sdSwapHeadline() показва вида ПРЕДИ статуса, защото „чака изпращане" значи
-- различно нещо при двата вида. Заковано в tests/sd-swap-link.test.js.
--
-- ═══ РЕШЕНИЕ ЗА ИНДЕКСИТЕ (16.09.2026) ══════════════════════════════════
-- 4 реда с излишък стоят срещу ПО ДВЕ липси (8 от 16-те двойки): Търговище
-- 27738, Раднево 94150, Раднево 94152, Кърджали 99450. Затова partial unique
-- е САМО по to_line_id: една липса се покрива от една отворена размяна, а
-- един излишък може да захрани няколко (qty > 0 на размяна поема дялбата).
-- Индекс по from_line_id нарочно НЯМА.
--
-- stock_differences.swap_id сочи размяната, в която редът е ЛИПСА (to_line_id)
-- - последната, отворена или затворена. След приключване НЕ се чисти: остава
-- като история (решение 16.09.2026, миграция comment_swap_id). Ред с излишък
-- може да участва в няколко размени и една колона не може да ги побере - те
-- се търсят през stock_diff_swaps.from_line_id.
--
-- ═══ RLS — ИЗРИЧЕН КОМПРОМИС ═══════════════════════════════════════════
-- Режимът е ТОЧНО като на stock_differences (проверено 16.09.2026):
--   RLS изключен; политика anon_all_sd (anon, ALL, true/true) съществува, но
--   е неактивна при изключен RLS; anon/authenticated/service_role с пълни права.
-- Таблицата се чете и пише от браузъра с anon ключа наравно със
-- stock_differences, към чиито редове сочи. По-строг режим само тук не пази
-- нищо, докато съседната таблица е отворена - и би счупил UI-а. Затягането
-- става заедно за двете, не поотделно.
--
-- Нова таблица + нова колона → огледалото (Живко): mirror-schema.sql и
-- $TableColumns в sync-mirror.ps1.
-- Миграция: supabase/migrations/20260916090050_stock_diff_swaps.sql
-- Rollback: supabase/migrations/20260916090050_stock_diff_swaps_down.sql
-- Миграция (kind): supabase/migrations/20260920122602_swaps_kind.sql
-- Rollback (kind): supabase/migrations/20260920122602_swaps_kind_down.sql

create table public.stock_diff_swaps (
  id uuid primary key default gen_random_uuid(),
  from_line_id uuid not null references public.stock_differences(id),
  to_line_id   uuid not null references public.stock_differences(id),
  from_store   text not null,
  to_store     text not null,
  warehouse    text not null,
  material_code text,
  material_name text,
  qty numeric not null check (qty > 0),
  status text not null default 'linked'
    check (status in ('linked','sent','received','closed')),
  kind text not null default 'doc'
    check (kind in ('doc','physical')),   -- миграция swaps_kind, 20.09.2026
  transport_mode text check (transport_mode in ('van','truck')),
  sap_doc_num text,
  note text,
  created_by text,  created_at timestamptz not null default now(),
  sent_by text,     sent_at timestamptz,
  received_by text, received_at timestamptz,
  closed_by text,   closed_at timestamptz,
  constraint stock_diff_swaps_distinct_lines check (from_line_id <> to_line_id)
);

create unique index stock_diff_swaps_to_open
  on public.stock_diff_swaps(to_line_id) where status <> 'closed';

alter table public.stock_differences add column swap_id uuid
  references public.stock_diff_swaps(id);

comment on table public.stock_diff_swaps is 'Размяна на артикул между два магазина през логистичния склад: from = магазинът с излишък (изпраща), to = магазинът с липса (получава).';
comment on column public.stock_diff_swaps.status is 'linked = складът е свързал двата реда; sent = изпращащият магазин е изпратил (van/truck, sap_doc_num); received = получаващият е приел физически; closed = складът е приключил и двата реда.';
comment on column public.stock_diff_swaps.kind is 'doc = само по документи (трансфер магазин→магазин в SAP, стоката не пътува; най-честият случай); physical = стоката пътува с бус/камион. При doc transport_mode остава null.';
comment on column public.stock_diff_swaps.transport_mode is 'Как е изпратено при sent: van = бус, truck = камион.';
comment on column public.stock_differences.swap_id is 'размяната, в която редът е липса — последната; отворена или затворена';
-- ↑ текстът от миграция comment_swap_id (16.09.2026). Първоначалният (в
--   20260916090050_stock_diff_swaps) казваше "Отворената размяна, в която
--   редът е ЛИПСА (to_line_id)..." - върнат е в _down на comment_swap_id.

-- RLS: като stock_differences - изключен, пълни права, неактивна anon политика.
alter table public.stock_diff_swaps disable row level security;
grant all on table public.stock_diff_swaps to anon, authenticated, service_role;
create policy anon_all_sd_swaps on public.stock_diff_swaps
  for all to anon using (true) with check (true);

-- ── ROLLBACK ──
-- alter table public.stock_differences drop column swap_id;
-- drop index if exists public.stock_diff_swaps_to_open;
-- drop table public.stock_diff_swaps;
-- Внимание: rollback трие всички записани размени и връзките от
-- stock_differences.swap_id безвъзвратно.
