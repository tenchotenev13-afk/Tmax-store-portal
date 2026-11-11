-- 20261111083738_kasa_glavna_razlika_fix_2
-- Приложен дословно чрез apply_migration на 11.11.2026 (DO блокът; md5 на текста в schema_migrations 29e342cccfcd8a9a4e3f6bd0c94d2152).
-- Огледало: втори кръг на 20261108122441_kasa_glavna_razlika_fix — 5 реда на Главна каса
-- в Козлодуй, записани на 09.11, 10.11 и 11.11.2026 със СТАРАТА формула (раздел, незареждан
-- от преди деплоя на d87670f). Снимка 11.11.2026, execute_sql. Rollback: _down.sql
do $fix$
declare
  ids uuid[] := array[
    'af12102b-3d04-4ae3-bf39-52d02b37313b',  -- Козлодуй 06.11  −1571.90 → 7.10
    '9db08e34-d507-44f1-b721-81c8bdfdaa00',  -- Козлодуй 07.11  −1232.53 → 20.72
    'a7cc52d9-85cd-452d-be04-638affbcdd14',  -- Козлодуй 08.11   −753.34 → −2.94
    '5a80c417-0897-47bf-bf36-77d86c1b3b87',  -- Козлодуй 09.11  −2232.47 → 1.84
    '73683d90-d16c-4d4e-b145-da5e51f8d7d2'   -- Козлодуй 10.11  −1629.66 → −0.51
  ]::uuid[];
  n integer;
begin
  -- Проверка преди: точно тези 5 реда, всеки още със старата записана стойност.
  select count(*) into n from public.kasa_glavna k
    join (values ('af12102b-3d04-4ae3-bf39-52d02b37313b'::uuid, -1571.90::numeric),
                 ('9db08e34-d507-44f1-b721-81c8bdfdaa00'::uuid, -1232.53),
                 ('a7cc52d9-85cd-452d-be04-638affbcdd14'::uuid,  -753.34),
                 ('5a80c417-0897-47bf-bf36-77d86c1b3b87'::uuid, -2232.47),
                 ('73683d90-d16c-4d4e-b145-da5e51f8d7d2'::uuid, -1629.66)) o(id, razlika)
      on o.id = k.id and k.razlika = o.razlika;
  if n <> 5 then
    raise exception 'ПРОВЕРКАТА ПРЕДИ НЕ МИНА: очаквани 5 реда със старата стойност, има %', n;
  end if;

  with d(k,v) as (values ('bills_500',500),('bills_200',200),('bills_100',100),('bills_50',50),('bills_20',20),
      ('bills_10',10),('bills_5',5),('bills_2',2),('bills_1',1),('coins_50',0.5),('coins_20',0.2),
      ('coins_10',0.1),('coins_5',0.05),('coins_2',0.02),('coins_1',0.01)),
  calc as (select g.id, round(
         coalesce((select sum((coalesce((to_jsonb(g)->>d.k)::int,0)
            + coalesce((select sum(coalesce((to_jsonb(r)->>d.k)::int,0)) from public.kasa_reports r
                         where r.store_name=g.store_name and r.date=g.date),0)) * d.v) from d),0)
         + coalesce(g.slujebno,0) - coalesce(g.sap_balance,0), 2) as new_raz
         from public.kasa_glavna g where g.id = any(ids))
  update public.kasa_glavna k set razlika = c.new_raz
    from calc c where c.id = k.id and k.razlika is distinct from c.new_raz;
  get diagnostics n = row_count;
  if n <> 5 then
    raise exception 'UPDATE засегна % реда, очаквани 5 — връщам назад', n;
  end if;
end
$fix$;
