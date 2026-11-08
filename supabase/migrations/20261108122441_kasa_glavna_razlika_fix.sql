-- 20261108122441_kasa_glavna_razlika_fix
-- Огледало: kasa-glavna-razlika-fix-data.sql, секция 2 (DO блокът, приложен дословно чрез apply_migration на 08.11.2026; md5 на текста в schema_migrations f25f62a21ff21518bef83218750194f3). Rollback: _down.sql
do $$
declare n int;
begin
  with d(k,v) as (values ('bills_500',500),('bills_200',200),('bills_100',100),('bills_50',50),('bills_20',20),
      ('bills_10',10),('bills_5',5),('bills_2',2),('bills_1',1),('coins_50',0.5),('coins_20',0.2),
      ('coins_10',0.1),('coins_5',0.05),('coins_2',0.02),('coins_1',0.01)),
  calc as (select g.id, round(
         coalesce((select sum((coalesce((to_jsonb(g)->>d.k)::int,0)
            + coalesce((select sum(coalesce((to_jsonb(r)->>d.k)::int,0)) from public.kasa_reports r
                         where r.store_name=g.store_name and r.date=g.date),0)) * d.v) from d),0)
         + coalesce(g.slujebno,0) - coalesce(g.sap_balance,0), 2) as new_raz from public.kasa_glavna g)
  update public.kasa_glavna k set razlika = c.new_raz
    from calc c where c.id = k.id and k.razlika is distinct from c.new_raz;
  get diagnostics n = row_count;
  raise notice 'kasa_glavna razlika fixed: % rows', n;
  if n < 1 or n > 2300 then raise exception 'неочакван брой: % (очаква се ~2112)', n; end if;
end $$;
