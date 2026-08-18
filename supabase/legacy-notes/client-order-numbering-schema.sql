-- ═══ ПОКРИТА ОТ МИГРАЦИЯ ═══════════════════════════════════════════════
-- Записът за схемата е supabase/migrations/20260818071737_client_order_numbering_per_store.sql
-- Този файл е историческа бележка: не го пускай и не го приемай за
-- източник на истината. Сверено на 18.08.2026.
-- ══════════════════════════════════════════════════════════════════════

-- Пореден номер на клиентска заявка ПО ОБЕКТ, раздаван от базата
-- Приложена в Supabase на 18.08.2026 (миграция: client_order_numbering_per_store)
--
-- ПРОБЛЕМЪТ: номерът се смяташе в браузъра като clientOrders.length+1 — бройката
-- заявки, които ТЕКУЩИЯТ потребител вижда. Всеки обект броеше от 1, затова
-- 883 от 908 заявки излязоха с дублиран номер (№0004 при 14 различни клиента
-- в 13 обекта).
--
-- РЕШЕНИЕТО: таблица-брояч + BEFORE INSERT тригер. Формат "Троян-0042".
-- Старите заявки НЕ са пипани — новата номерация важи само занапред.

create table if not exists client_order_counters (
  store_name text primary key,
  last_num   integer not null default 0
);

-- Всеки обект продължава от най-големия си досегашен номер, за да не се
-- получи нов "0042" срещу стар "0042" в същия обект.
insert into client_order_counters (store_name, last_num)
select store_name,
       coalesce(max(nullif(regexp_replace(coalesce(in_num,''), '\D', '', 'g'), '')::int), 0)
from client_orders
where store_name is not null and btrim(store_name) <> ''
group by store_name
on conflict (store_name) do nothing;

create or replace function assign_client_order_num()
returns trigger
language plpgsql
as $$
declare
  st text;
  n  integer;
begin
  st := coalesce(nullif(btrim(new.store_name), ''), 'Без обект');

  -- ON CONFLICT DO UPDATE заключва реда на обекта, така че два едновременни
  -- записа от един магазин получават различни номера.
  insert into client_order_counters (store_name, last_num)
  values (st, 1)
  on conflict (store_name)
  do update set last_num = client_order_counters.last_num + 1
  returning last_num into n;

  -- Номерът се задава ВИНАГИ от базата — стойност, подадена от клиента,
  -- се игнорира, за да не може да се върне старото поведение.
  new.in_num := st || '-' || lpad(n::text, 4, '0');
  return new;
end
$$;

drop trigger if exists trg_assign_client_order_num on client_orders;
create trigger trg_assign_client_order_num
before insert on client_orders
for each row execute function assign_client_order_num();

-- Бележки:
--   * Нов обект без ред в брояча започва от 0001 автоматично.
--   * Празни бройки (gaps) са възможни при провален запис — това е нормално.
--   * Клиентът вече НЕ изпраща in_num; чете го от отговора
--     (Prefer: return=representation).
