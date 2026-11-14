-- ll_close_stale (13.11.2026, сесия ll-close-stale) — САМО ДАННИ, без схема.
--
-- Решение на Тенчо 13.11.2026: петте заварени товарни листа със status
-- 'sent', при които всеки ред е получен / неполучен / отхвърлен и
-- единствената пречка е чакащ извънреден ред (approval_status='pending'),
-- се затварят. Правилото е същото като llAutoDoneList() след eff1920:
-- partial, ако има missing ред, който не е rejected; иначе done.
-- Чакащите 11 реда в тях НЕ се пипат — остават 'pending' и се решават в
-- портала. Листът от 28.10 (1f35333d, Търговище → Габрово, Севлиево, Троян)
-- НЕ влиза: палет 3 от 4 за Габрово (80481479) е неотметнат — пречката там
-- не е само чакащият ред. Първоначалният списък от 6 беше от грешна заявка
-- (bool_and прескача NULL за ред с approval_status NULL), проверено 13.11.
-- done_at = последната отметка (received_at / missing_at) по редовете на
-- листа без отхвърлените, не now().
--
-- Без имейл: писмото при затваряне (llNotifyClosed) се праща от браузъра;
-- тригери върху loading_lists / loading_list_items няма (проверено 13.11).
-- Rollback: *_down.sql.

do $$
declare
  ids uuid[] := array[
    '6d15e057-92db-4342-8a2e-3ca0c292e49d',  -- 12.10 Търговище → Гоце Делчев, Петрич  → done
    '5e72fd85-a2be-42fd-840c-66845f33fa2c',  -- 15.10 Търговище → Карлово, Пирдоп       → done
    'a8a2d85b-0c2a-41cd-a489-c1c94fc8733d',  -- 16.10 Търговище → Враца, Козлодуй, Монтана → partial
    'faa8c0bf-fb23-4647-86c3-84a0e7d7f87b',  -- 19.10 Добрич → Дупница, Пирдоп         → done
    '98d9ec3b-8be3-4a3f-ba23-f466aeafa542'   -- 20.10 Търговище → Троян                 → done
  ]::uuid[];
  n_ok int;
  n_upd int;
begin
  -- Проверка преди: всичките 5 още са 'sent' и още отговарят на правилото.
  select count(*) into n_ok
  from loading_lists l
  where l.id = any(ids)
    and l.status = 'sent'
    and exists (select 1 from loading_list_items i
                where i.list_id = l.id and i.approval_status = 'pending')
    and not exists (select 1 from loading_list_items i
                    where i.list_id = l.id
                      and i.approval_status is distinct from 'rejected'
                      and not i.received and not i.missing);
  if n_ok <> 5 then
    raise exception 'll_close_stale: очаквах 5 листа по правилото, намерих %', n_ok;
  end if;

  -- done_at = най-късното received_at / missing_at по редовете на листа, без
  -- отхвърлените (решение на Тенчо 13.11.2026) — денят, в който приемането
  -- реално е приключило, не денят на миграцията. greatest() прескача NULL.
  -- Предпазител: лист без нито едно такова време → exception, не NULL.
  select count(*) into n_ok
  from loading_lists l
  where l.id = any(ids)
    and (select max(greatest(i.received_at, i.missing_at))
         from loading_list_items i
         where i.list_id = l.id
           and i.approval_status is distinct from 'rejected') is null;
  if n_ok <> 0 then
    raise exception 'll_close_stale: % листа без received_at / missing_at', n_ok;
  end if;

  update loading_lists l
     set status = case when exists (
                         select 1 from loading_list_items i
                         where i.list_id = l.id and i.missing
                           and i.approval_status is distinct from 'rejected')
                       then 'partial' else 'done' end,
         done_at = (select max(greatest(i.received_at, i.missing_at))
                    from loading_list_items i
                    where i.list_id = l.id
                      and i.approval_status is distinct from 'rejected')
   where l.id = any(ids)
     and l.status = 'sent';
  get diagnostics n_upd = row_count;
  if n_upd <> 5 then
    raise exception 'll_close_stale: очаквах 5 засегнати листа, засегнати %', n_upd;
  end if;
end $$;
