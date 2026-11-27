-- revaluation-unit-prefix-schema.sql
-- Огледало на supabase/migrations/20261127084126_revaluation_unit_prefix.sql
-- (схема, приложена 27.11.2026) и 20261127084628_revaluation_unit_prefix_data.sql
-- (заварените номера, приложена 27.11.2026: 16 реда → SH1…SH10, KJ1, KJ2, KJ4, KJ5, GB1, GB2).
--
-- ЗАЩО (Преоценка, т.7 на Теодор, 27.11.2026). Номерът на бройката се пише на
-- ръка върху стоката — 'Гоце Делчев-П0123' е дълъг. Решение на Тенчо 27.11:
-- две латински букви на обекта + пореден номер без водещи нули — 'GD123'.
--
-- - stores.unit_prefix text NULL, UNIQUE, CHECK ^[A-Z]{2}$. 19 обекта с код;
--   складовете, офисът и сервизът — NULL (не номерират).
-- - assign_revaluation_unit_no(): unit_no = unit_prefix || номер. Обект без
--   unit_prefix → exception (клиентът показва маркера „без номер — опитай
--   пак"). Проверката е преди брояча. Броячът продължава отпреди (Шумен 10,
--   Кърджали 6, Габрово 2 към 27.11.2026).
-- - data: заварените 16 номера → префикс + числото от стария номер.
--
-- ПОРЕДНОСТ: схема → проверка → data → push на revaluation.js. Старият
-- клиент работи и с новия вид (rvUnitNum взима числото в края; съкращаването
-- по '-П' просто не намира нищо и показва номера цял).
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".
-- Rollback (обратен ред): 20261127084628_revaluation_unit_prefix_data_down.sql,
-- после 20261127084126_revaluation_unit_prefix_down.sql.

-- ═══ СХЕМА ═══
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

-- ═══ DATA ═══
update public.revaluation_units u
   set unit_no = s.unit_prefix || (substring(u.unit_no from '-П(\d+)$')::int)::text
  from public.stores s
 where s.name = u.store_name
   and s.unit_prefix is not null
   and u.unit_no ~ '-П\d+$';
