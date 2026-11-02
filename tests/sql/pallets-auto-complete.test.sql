-- SQL тест: автоматично отмятане на „СПРАВКА ПРАЗНИ ПАЛЕТИ" (pallets-auto-schema.sql,
-- решение на Тенчо 02.11.2026).
--
-- КАК СЕ ПУСКА. Като ЕДНА транзакция през Supabase MCP (execute_sql).
-- Преди прилагането на миграцията — слепен СЛЕД pallets-auto-schema.sql; след
-- прилагането — сам. Файлът завършва с raise exception → връща се назад ВСИЧКО
-- (и схемата, и тестовите редове). Гейтът е текстът „SQL-ТЕСТ ОК" в
-- съобщението, не това, че има грешка.
--
-- ОБЕКТИТЕ СА ИЗМИСЛЕНИ ('__sqltest_p*'), задачата е РЕАЛНАТА
-- ceb052e6-… (петък 17:00). Седмицата е първата с автоматиката: пон 02.11,
-- срок пет 06.11.2026. created_at се задава изрично по Europe/Sofia. Тригерът
-- се изключва за сценариите а–и (всяко извикване на sync е ръчно) и се пуска
-- отделно в к.
--
-- СЦЕНАРИИТЕ:
--   а  p1: справка в сряда 10:00 → отметка с completion_date ПЕТЪК,
--          auto:pallets, done, без коментар
--   б  p2: справка в петък 17:30 → НЯМА отметка
--   б2 p5: справка в петък 16:59:59 → отметка (границата)
--   в  p3: ръчна отметка вече има + справка във вторник → ръчната е НЕПИПНАТА
--   г  p4: две справки (пон и чет), sync два пъти → ЕДИН ред
--   д  p6: справка в четвъртък, sync в събота 07.11 → няма (замразяване)
--   е  p7: справка в миналата седмица (30.10), sync 30.10 → 0 (преди v_start)
--   ж  p8: отложена задача → остава 'postponed'
--   з  p9: задача 'notice' → няма отметка
--   и  p10: изтрита справка след отметката → отметката ОСТАВА (не разотмята)
--   к  тригерът: insert на справка за ДНЕС (ако днес е пон–пет на седмица
--          >= 02.11 и преди срока) → отметка за срока на текущата седмица
--
-- МУТАНТИ (всеки трябва да е „убит"):
--   M1 без проверката created_at <= срока                (убива б)
--   M2 completion_date = v_today вместо v_due            (убива а)
--   M3 `do update set completed_by=…` вместо do nothing   (убива в)
--   M4 без замразяването след срока                      (убива д)
--   M5 срокът по UTC вместо Europe/Sofia                 (убива б)

create or replace function pg_temp.t(cond boolean, msg text) returns text
language sql as $$ select case when coalesce(cond, false) then '' else E'\n  ПАДНА: ' || msg end $$;

create or replace function pg_temp.cnt(p_store text, p_date date) returns int
language sql as $$
  select count(*)::int from public.task_completions
   where recurring_task_id = 'ceb052e6-872f-425d-bb78-cd1e7db2909f'
     and store_name = p_store and completion_date = p_date $$;

create or replace function pg_temp.auto(p_store text, p_date date) returns boolean
language sql as $$
  select exists (select 1 from public.task_completions
                  where recurring_task_id = 'ceb052e6-872f-425d-bb78-cd1e7db2909f'
                    and store_name = p_store and completion_date = p_date
                    and completed_by = 'auto:pallets' and status = 'done'
                    and comment is null) $$;

create or replace function pg_temp.rep(p_store text, p_date date, p_at text) returns void
language sql as $$
  insert into public.transport_pallets
         (store_name, report_date, euro_pallets, small_pallets, nonstandard_pallets,
          grate_pallets, bilka_pallets, created_by, created_at)
  values (p_store, p_date, 1, 0, 0, 0, 0, 'sqltest',
          (p_at::timestamp) at time zone 'Europe/Sofia') $$;

create or replace function pg_temp.run_checks() returns text language plpgsql as $f$
declare
  TID  uuid := 'ceb052e6-872f-425d-bb78-cd1e7db2909f';
  MON  date := date '2026-11-02';
  TUE  date := date '2026-11-03';
  WED  date := date '2026-11-04';
  THU  date := date '2026-11-05';
  FRI  date := date '2026-11-06';
  SAT  date := date '2026-11-07';
  v_today date := (now() at time zone 'Europe/Sofia')::date;
  v_mon date;
  v_fri date;
  v_n int;
  fails text := '';
begin
  alter table public.transport_pallets disable trigger pallets_sync_ins;

  -- а
  perform pg_temp.rep('__sqltest_p1', WED, '2026-11-04 10:00');
  perform public.pallets_sync_completions('__sqltest_p1', WED);
  fails := fails || pg_temp.t(pg_temp.auto('__sqltest_p1', FRI), 'а: справка в сряда → отметка за петък');
  fails := fails || pg_temp.t(pg_temp.cnt('__sqltest_p1', WED) = 0, 'а: не на деня на справката');

  -- б / б2
  perform pg_temp.rep('__sqltest_p2', FRI, '2026-11-06 17:30');
  perform public.pallets_sync_completions('__sqltest_p2', FRI);
  fails := fails || pg_temp.t(pg_temp.cnt('__sqltest_p2', FRI) = 0, 'б: справка в петък 17:30 → без отметка');
  perform pg_temp.rep('__sqltest_p5', FRI, '2026-11-06 16:59:59');
  perform public.pallets_sync_completions('__sqltest_p5', FRI);
  fails := fails || pg_temp.t(pg_temp.auto('__sqltest_p5', FRI), 'б2: справка 16:59:59 → отметка');

  -- в
  insert into public.task_completions (recurring_task_id, store_name, completed_by, completed_at, status, completion_date, comment)
  values (TID, '__sqltest_p3', 'Управител', now(), 'done', FRI, 'ръчно');
  perform pg_temp.rep('__sqltest_p3', TUE, '2026-11-03 09:00');
  perform public.pallets_sync_completions('__sqltest_p3', TUE);
  fails := fails || pg_temp.t(pg_temp.cnt('__sqltest_p3', FRI) = 1, 'в: един ред');
  fails := fails || pg_temp.t(exists(select 1 from public.task_completions where recurring_task_id = TID
           and store_name = '__sqltest_p3' and completion_date = FRI and completed_by = 'Управител' and comment = 'ръчно'),
           'в: ръчната отметка е непипната');

  -- г
  perform pg_temp.rep('__sqltest_p4', MON, '2026-11-02 09:00');
  perform pg_temp.rep('__sqltest_p4', THU, '2026-11-05 09:00');
  perform public.pallets_sync_completions('__sqltest_p4', MON);
  perform public.pallets_sync_completions('__sqltest_p4', THU);
  fails := fails || pg_temp.t(pg_temp.cnt('__sqltest_p4', FRI) = 1, 'г: две справки → един ред');

  -- д
  perform pg_temp.rep('__sqltest_p6', THU, '2026-11-05 09:00');
  perform public.pallets_sync_completions('__sqltest_p6', SAT);
  fails := fails || pg_temp.t(pg_temp.cnt('__sqltest_p6', FRI) = 0, 'д: след срока → без отметка');

  -- е
  perform pg_temp.rep('__sqltest_p7', date '2026-10-30', '2026-10-30 09:00');
  v_n := public.pallets_sync_completions('__sqltest_p7', date '2026-10-30');
  fails := fails || pg_temp.t(v_n = 0 and pg_temp.cnt('__sqltest_p7', date '2026-10-30') = 0, 'е: миналата седмица → нищо');

  -- ж
  insert into public.task_completions (recurring_task_id, store_name, completed_by, completed_at, status, completion_date, postponed_to, comment)
  values (TID, '__sqltest_p8', 'Управител', now(), 'postponed', FRI, date '2026-11-09', 'отлагам');
  perform pg_temp.rep('__sqltest_p8', WED, '2026-11-04 09:00');
  perform public.pallets_sync_completions('__sqltest_p8', WED);
  fails := fails || pg_temp.t(exists(select 1 from public.task_completions where recurring_task_id = TID
           and store_name = '__sqltest_p8' and completion_date = FRI and status = 'postponed'), 'ж: отлагането остава');

  -- и
  perform pg_temp.rep('__sqltest_p10', WED, '2026-11-04 09:00');
  perform public.pallets_sync_completions('__sqltest_p10', WED);
  delete from public.transport_pallets where store_name = '__sqltest_p10';
  perform public.pallets_sync_completions('__sqltest_p10', THU);
  fails := fails || pg_temp.t(pg_temp.auto('__sqltest_p10', FRI), 'и: изтрита справка → отметката остава');

  -- з (последен — пипа самата задача)
  update public.recurring_tasks set task_type = 'notice' where id = TID;
  perform pg_temp.rep('__sqltest_p9', WED, '2026-11-04 09:00');
  perform public.pallets_sync_completions('__sqltest_p9', WED);
  fails := fails || pg_temp.t(pg_temp.cnt('__sqltest_p9', FRI) = 0, 'з: notice → без отметка');
  update public.recurring_tasks set task_type = 'comment' where id = TID;

  -- к: тригерът
  alter table public.transport_pallets enable trigger pallets_sync_ins;
  v_mon := v_today - ((extract(isodow from v_today)::int) - 1);
  v_fri := v_mon + 4;
  if v_mon >= MON and extract(isodow from v_today) between 1 and 5
     and now() < ((v_fri + time '17:00') at time zone 'Europe/Sofia') then
    insert into public.transport_pallets (store_name, report_date, euro_pallets, small_pallets,
           nonstandard_pallets, grate_pallets, bilka_pallets, created_by)
    values ('__sqltest_p11', v_today, 2, 0, 0, 0, 0, 'sqltest');
    fails := fails || pg_temp.t(pg_temp.auto('__sqltest_p11', v_fri), 'к: тригерът отмята при insert');
  else
    raise notice 'к: прескочен — днес не е пон–пет преди срока';
  end if;

  return fails;
end $f$;

do $$
declare f text := pg_temp.run_checks();
begin
  if f = '' then raise exception 'SQL-ТЕСТ ОК (rollback)';
  else raise exception 'SQL-ТЕСТ ПАДНА:%', f;
  end if;
end $$;
