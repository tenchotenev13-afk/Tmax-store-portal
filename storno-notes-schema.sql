-- storno-notes-schema.sql — Разлики → „Сторна по грешен прием":
-- „✍️ Счетоводител", етап 1 (Цветелина, 23.10.2026).
--
-- ЗАЩО. Оперативният счетоводител (role accounting, обектите му в
-- users.assigned_stores) пише на обекта свободен текст + документ; обектът
-- отговаря; ако е реално сторно — „🧾 Направи сторно" отваря обичайната
-- бланка за грешен прием (differences_reports, direction='wrong_receipt') и
-- след успешното ѝ подаване съобщението става status='storno' с report_id.
-- „✓ Затвори" (без сторно) → status='closed' + closed_by/closed_at.
-- Без категории „фактурирано/нефактурирано". Чек листът (storna_priem)
-- брои сторната както досега — през бланките; тези таблици не влизат там.
-- Известията са етап 2.
--
-- СТАТУСИ: 'open' / 'storno' / 'closed'. Страна на отговора:
-- 'store' / 'accounting' / 'co'. CHECK-овете са в Supabase; огледалото на
-- Живко не носи value CHECK-ове.
--
-- ПРАВА. RLS включено; политики за anon: select / insert / update, БЕЗ
-- delete — както supply_store_notes / supply_entries. Компромисът е
-- същият: anon ключът е общ, тоест „кой вижда / кой пише" е проверка в
-- клиента (sdNoteVisible / sdNoteCanAct / sdNoteCanCreate в
-- stock-differences.js), не в базата. Табличните GRANT-ове идват от default
-- privileges на public.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): таблиците са нови — 0 засегнати реда.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push на stock-differences.js. Модулът чете
-- storno_notes при отваряне; без таблицата подтабът показва червен ред
-- „Съобщенията не се заредиха" (бланките си работят).
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".

create table public.storno_notes (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  supplier text,
  document_number text,
  body text not null,
  files jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  report_id uuid references public.differences_reports(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  closed_by text,
  closed_at timestamptz,
  constraint storno_notes_status_chk check (status in ('open','storno','closed'))
);

create table public.storno_note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.storno_notes(id) on delete cascade,
  body text not null,
  files jsonb not null default '[]'::jsonb,
  side text not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint storno_note_replies_side_chk check (side in ('store','accounting','co'))
);

create index storno_notes_store_status_idx on public.storno_notes (store_name, status);
create index storno_note_replies_note_idx on public.storno_note_replies (note_id);

comment on table public.storno_notes is
  'Разлики / Сторна по грешен прием: съобщение от оперативния счетоводител към обект (текст + файлове). status open/storno/closed; report_id = бланката от „Направи сторно".';
comment on table public.storno_note_replies is
  'Отговори по storno_notes. side: store / accounting / co.';

alter table public.storno_notes enable row level security;
create policy storno_notes_select on public.storno_notes for select to anon using (true);
create policy storno_notes_insert on public.storno_notes for insert to anon with check (true);
create policy storno_notes_update on public.storno_notes for update to anon using (true) with check (true);

alter table public.storno_note_replies enable row level security;
create policy storno_note_replies_select on public.storno_note_replies for select to anon using (true);
create policy storno_note_replies_insert on public.storno_note_replies for insert to anon with check (true);
create policy storno_note_replies_update on public.storno_note_replies for update to anon using (true) with check (true);

-- ── ROLLBACK ──────────────────────────────────────────────────────────────
-- Трие и данните. Преди него — push на версия на stock-differences.js без
-- секцията, иначе подтабът показва червен ред.
--
-- drop table public.storno_note_replies;
-- drop table public.storno_notes;
