-- transit-direction-fix-data.sql — „Стока на път“, етап 2 (03.11.2026):
-- трите реда от импорта на 03.11, записани като 'outgoing', стават 'incoming'.
--
-- ЗАЩО. Доставчикът е „Логистичен склад Търговище“, а заводът е с код от
-- „изпращащ“ тип (2520 Силистра, 2521 Раднево, 2522 Дупница). Старото правило
-- plantIsOutgoingType ги правеше 'outgoing' — обектът не ги виждаше в
-- „Получавам“ и tMarkStatus не му позволяваше „Прието“. От етап 2 импортът
-- прави доставка от логистичен склад винаги 'incoming' (TRANSIT_WAREHOUSE_CODES
-- в transit.js); тези три реда са внесени преди поправката.
--
-- Редовете (проверени в базата на 03.11.2026, по purchase_doc + material_code
-- + store_name):
--   148ed86c-c463-459a-b080-b1bb660c3300  Силистра  4600191999 / 91868
--   070ffe3c-e641-4f66-bd34-c993e656c353  Дупница   4600192031 / 91967
--   4be0d06b-c361-4745-b8a5-8bf2d8678f75  Раднево   4600192651 / 78471
--
-- СЛЕДСТВИЕ. UPDATE-ът пуска goods_transit_sync_trg за трите обекта. Като
-- 'incoming' и 'pending' редовете вече се броят в авто-отметката на „Стока на
-- път“ (transit_store_done_since) и в колоната на Чек листа
-- (checklist_portal_values) — точно както всяка друга входяща доставка.
--
-- Схема няма → ред за Живко НЕ трябва: огледалото взема данните с UPSERT.
-- Прилага се с apply_migration, СЛЕД push-а на кода (иначе следващ импорт
-- със стария transit.js би ги върнал на 'outgoing').

do $fix$
declare
  ids uuid[] := array[
    '148ed86c-c463-459a-b080-b1bb660c3300',
    '070ffe3c-e641-4f66-bd34-c993e656c353',
    '4be0d06b-c361-4745-b8a5-8bf2d8678f75'
  ]::uuid[];
  n integer;
begin
  -- Проверка преди: точно тези 3 реда, всичките 'outgoing', доставчик склад.
  select count(*) into n from public.goods_transit
   where id = any(ids) and direction = 'outgoing'
     and supplier = 'Логистичен склад Търговище';
  if n <> 3 then
    raise exception 'ПРОВЕРКАТА ПРЕДИ НЕ МИНА: очаквани 3 реда outgoing от склад Търговище, има %', n;
  end if;

  update public.goods_transit set direction = 'incoming'
   where id = any(ids) and direction = 'outgoing';
  get diagnostics n = row_count;
  if n <> 3 then
    raise exception 'UPDATE засегна % реда, очаквани 3 — връщам назад', n;
  end if;
end
$fix$;

-- ── ROLLBACK (отделно, при нужда) ───────────────────────────────────────────
-- do $rb$
-- declare
--   ids uuid[] := array[
--     '148ed86c-c463-459a-b080-b1bb660c3300',
--     '070ffe3c-e641-4f66-bd34-c993e656c353',
--     '4be0d06b-c361-4745-b8a5-8bf2d8678f75'
--   ]::uuid[];
--   n integer;
-- begin
--   update public.goods_transit set direction = 'outgoing'
--    where id = any(ids) and direction = 'incoming';
--   get diagnostics n = row_count;
--   if n <> 3 then
--     raise exception 'ROLLBACK засегна % реда, очаквани 3 — връщам назад', n;
--   end if;
-- end
-- $rb$;
