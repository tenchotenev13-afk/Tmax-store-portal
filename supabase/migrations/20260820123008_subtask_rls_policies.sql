-- 20260820123008_subtask_rls_policies.sql
--
-- task_subtasks и subtask_completions са с ВКЛЮЧЕНО RLS и НУЛА политики.
-- RLS без политики отказва всичко: потвърдено на живо — добавянето на
-- подзадача връща 401 "new row violates row-level security policy for table
-- task_subtasks". Модулът в bulletin.js работи, базата го блокира.
--
-- Табличните GRANT-ове за anon вече са пълни (arwdDxtm), тоест липсва
-- САМО политиката. Затова тук няма нито един grant.
--
-- RLS НЕ се изключва никъде. Добавяме защита, не махаме.
--
-- Следваме доминиращия шаблон в базата, не измисляме нов: 18 политики са
-- точно `for all to anon using (true) with check (true)`, именувани
-- anon_all_<кратко име на модула> (anon_all_tasks, anon_all_completions,
-- anon_all_bulletins, anon_all_sd, …). Сверено на 20.08.2026.

begin;

create policy anon_all_subtasks
  on public.task_subtasks
  for all to anon
  using (true) with check (true);

create policy anon_all_subtask_completions
  on public.subtask_completions
  for all to anon
  using (true) with check (true);

commit;

-- app_settings СЪЗНАТЕЛНО не получава политика и НЕ е част от тази миграция.
-- Нулевите ѝ политики не са бъг, а самата защита — виж коментара в
-- 20260803113133_add_app_settings_for_kasa_pin.sql: таблицата е KV store за
-- тайни (държала е kasa_pin), достъпен само през service_role, който
-- заобикаля RLS. Нито един JS файл и нито една Edge Function не я чете, тоест
-- тя не участва в живия 401. Ако ѝ се даде anon политика, първият човек,
-- който върне PIN или ключ в нея, го публикува с публичния anon ключ.
