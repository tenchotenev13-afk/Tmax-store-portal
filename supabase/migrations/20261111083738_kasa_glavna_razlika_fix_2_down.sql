-- Rollback на 20261111083738_kasa_glavna_razlika_fix_2
-- Връща старите записани стойности на петте реда в Козлодуй (снимка 11.11.2026, execute_sql).
do $rb$
declare n integer;
begin
  update public.kasa_glavna k set razlika = o.razlika
    from (values ('af12102b-3d04-4ae3-bf39-52d02b37313b'::uuid, -1571.90::numeric),
                 ('9db08e34-d507-44f1-b721-81c8bdfdaa00'::uuid, -1232.53),
                 ('a7cc52d9-85cd-452d-be04-638affbcdd14'::uuid,  -753.34),
                 ('5a80c417-0897-47bf-bf36-77d86c1b3b87'::uuid, -2232.47),
                 ('73683d90-d16c-4d4e-b145-da5e51f8d7d2'::uuid, -1629.66)) o(id, razlika)
   where o.id = k.id and k.razlika is distinct from o.razlika;
  get diagnostics n = row_count;
  if n > 5 then
    raise exception 'ROLLBACK засегна % реда, очаквани до 5 — връщам назад', n;
  end if;
end
$rb$;
