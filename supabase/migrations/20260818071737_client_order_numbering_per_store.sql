-- Пореден номер на клиентска заявка ПО ОБЕКТ, раздаван от базата.
-- Досега номерът се смяташе в браузъра от clientOrders.length+1, тоест от
-- бройката заявки, които текущият потребител вижда → 883 от 908 заявки
-- излязоха с дублиран номер (№0004 при 14 различни клиента в 13 обекта).

create table if not exists public.client_order_counters (
  store_name text primary key,
  last_num   integer not null default 0
);

-- Всеки обект продължава от най-големия си досегашен номер, за да не се
-- получи нов "0042" срещу стар "0042" в същия обект.
insert into public.client_order_counters (store_name, last_num)
select store_name,
       coalesce(max(nullif(regexp_replace(coalesce(in_num,''), '\D', '', 'g'), '')::int), 0)
from public.client_orders
where store_name is not null and btrim(store_name) <> ''
group by store_name
on conflict (store_name) do nothing;

create or replace function public.assign_client_order_num()
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
  insert into public.client_order_counters (store_name, last_num)
  values (st, 1)
  on conflict (store_name)
  do update set last_num = public.client_order_counters.last_num + 1
  returning last_num into n;

  -- Номерът се задава ВИНАГИ от базата — стойност, подадена от клиента,
  -- се игнорира, за да не може да се върне старото поведение.
  new.in_num := st || '-' || lpad(n::text, 4, '0');
  return new;
end
$$;

drop trigger if exists trg_assign_client_order_num on public.client_orders;
create trigger trg_assign_client_order_num
before insert on public.client_orders
for each row execute function public.assign_client_order_num();
