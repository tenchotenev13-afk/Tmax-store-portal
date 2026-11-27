-- 20261127084126_revaluation_unit_prefix
-- Преоценка, т.7 на Теодор (27.11.2026): кратък номер на бройката.
-- Решение на Тенчо 27.11.2026: две латински букви на обекта + пореден номер
-- без водещи нули — 'GB7' вместо 'Габрово-П0007'.
-- Огледало и обяснение: revaluation-unit-prefix-schema.sql.
-- Rollback: 20261127084126_revaluation_unit_prefix_down.sql
-- (ПРЕДИ него — rollback-ът на data миграцията, ако е приложена).

alter table public.stores add column unit_prefix text null;
alter table public.stores add constraint stores_unit_prefix_key unique (unit_prefix);
alter table public.stores add constraint stores_unit_prefix_format check (unit_prefix ~ '^[A-Z]{2}$');
comment on column public.stores.unit_prefix is
  'Преоценка (27.11.2026): две латински букви за номера на бройката (GB → GB7). NULL = обектът не номерира (склад, офис, сервиз) — тригерът отказва.';

update public.stores s set unit_prefix = v.p
from (values
  ('Враца', 'VR'), ('Габрово', 'GB'), ('Гоце Делчев', 'GD'), ('Добрич', 'DB'),
  ('Дупница', 'DP'), ('Карлово', 'KV'), ('Козлодуй', 'KZ'), ('Кърджали', 'KJ'),
  ('Монтана', 'MN'), ('Пазарджик', 'PZ'), ('Петрич', 'PT'), ('Пирдоп', 'PR'),
  ('Раднево', 'RD'), ('Севлиево', 'SV'), ('Силистра', 'SS'), ('Сливен', 'SL'),
  ('Троян', 'TR'), ('Търговище', 'TG'), ('Шумен', 'SH')
) v(n, p)
where s.name = v.n;

-- Огледалото чете stores колонно (mirror-reader-all-schema.sql); anon и
-- authenticated имат SELECT на цялата таблица — за тях нищо не трябва.
grant select (unit_prefix) on public.stores to mirror_reader;

create or replace function public.assign_revaluation_unit_no()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  st  text;
  sub uuid;
  pf  text;
  n   integer;
begin
  select i.store_name, i.submission_id into st, sub
    from public.revaluation_items i where i.id = new.item_id;
  if sub is null then
    raise exception 'revaluation_units: няма ред % в revaluation_items', new.item_id;
  end if;
  st := nullif(btrim(st), '');
  select s.unit_prefix into pf from public.stores s where s.name = st;
  -- Проверката е ПРЕДИ брояча: отказ не харчи номер.
  if pf is null then
    raise exception 'Обектът „%“ няма код за номерата на бройките (stores.unit_prefix) — пиши на офиса', coalesce(st, '(празен)');
  end if;

  -- ON CONFLICT DO UPDATE заключва реда на обекта: два едновременни записа
  -- от един обект получават различни номера. Броячът продължава отпреди.
  insert into public.revaluation_unit_counters (store_name, last_num)
  values (st, 1)
  on conflict (store_name)
  do update set last_num = public.revaluation_unit_counters.last_num + 1
  returning last_num into n;

  new.store_name    := st;
  new.submission_id := sub;
  new.unit_no       := pf || n::text;
  return new;
end
$function$;
revoke all on function public.assign_revaluation_unit_no() from public, anon, authenticated;
