-- ROLLBACK на ll_close_stale (13.11.2026) — връща петте листа в 'sent' със
-- старото done_at (и при петте то беше NULL преди миграцията — проверено
-- 13.11.2026). Само ако листът е още в статуса, който миграцията е сложила;
-- предпазител — точно 5 засегнати. Редовете (loading_list_items) не се пипат.

do $$
declare
  n_upd int;
begin
  update loading_lists l
     set status = 'sent',
         done_at = v.old_done_at
    from (values
      ('6d15e057-92db-4342-8a2e-3ca0c292e49d'::uuid, 'done',    null::timestamptz),
      ('5e72fd85-a2be-42fd-840c-66845f33fa2c'::uuid, 'done',    null::timestamptz),
      ('a8a2d85b-0c2a-41cd-a489-c1c94fc8733d'::uuid, 'partial', null::timestamptz),
      ('faa8c0bf-fb23-4647-86c3-84a0e7d7f87b'::uuid, 'done',    null::timestamptz),
      ('98d9ec3b-8be3-4a3f-ba23-f466aeafa542'::uuid, 'done',    null::timestamptz)
    ) as v(id, set_status, old_done_at)
   where l.id = v.id
     and l.status = v.set_status;
  get diagnostics n_upd = row_count;
  if n_upd <> 5 then
    raise exception 'll_close_stale rollback: очаквах 5 листа в статуса от миграцията, засегнати %', n_upd;
  end if;
end $$;
