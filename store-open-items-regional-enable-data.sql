-- store-open-items-regional-enable-data.sql
-- Включване на „Незавършено за вашите обекти" (store_open_items_regional) и
-- излизане на регионалните от overdue_tasks — решения на Тенчо 19.11.2026.
-- САМО ДАННИ. Прилага се СЛЕД тестовото писмо до Тенчо, отделно „давай".
--
-- Двете промени са в ЕДНА транзакция нарочно: регионалните получават
-- задачите или по overdue_tasks, или в новото писмо — никога в нито едно.
-- ЦО, Контролинг и override-ът на Тенчо (overdue_tasks include / all) остават.
--
-- Преди (прочетено 19.11): store_open_items_regional active=false,
-- test_email='ten.tenev@temax.bg'; notification_matrix overdue_tasks /
-- regional / email / own_stores — точно 1 ред. Друго → грешка, нищо не се мени.

do $$
declare n int;
begin
  update public.notification_topics
     set active = true, test_email = null
   where key = 'store_open_items_regional' and active = false and test_email = 'ten.tenev@temax.bg';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'store_open_items_regional: очакван 1 ред за включване, засегнати %', n;
  end if;

  delete from public.notification_matrix
   where topic_key = 'overdue_tasks' and group_key = 'regional'
     and channel = 'email' and scope = 'own_stores';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'overdue_tasks / regional: очакван 1 ред за махане, засегнати %', n;
  end if;
end $$;

-- ROLLBACK
-- update public.notification_topics
--    set active = false, test_email = 'ten.tenev@temax.bg'
--  where key = 'store_open_items_regional';
-- insert into public.notification_matrix (topic_key, group_key, channel, scope)
-- values ('overdue_tasks', 'regional', 'email', 'own_stores');
