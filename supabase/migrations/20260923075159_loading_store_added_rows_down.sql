-- Rollback на 20260923075159_loading_store_added_rows.sql
--
-- ВНИМАНИЕ — ОТКАТЪТ ТРИЕ ДАННИ, които не са никъде другаде.
-- Преброй ПРЕДИ отката:
--   select count(*) from public.loading_list_items where added_by_store;
--   select approval_status, count(*) from public.loading_list_items
--     where approval_status is not null group by 1;
-- Различно от нула значи, че обекти са добавяли редове: обяснението им стои в
-- store_comment (то ОСТАВА), но „кой одобри и защо" изчезва безвъзвратно.
-- Отхвърлените редове стават обикновени получени редове и ВЛИЗАТ обратно в
-- броячите, печата и писмото — тоест листът започва да твърди друго.
-- Нарочно НЯМА DELETE тук: триенето на чужд ред при откат е точно промяната,
-- която после никой не може да проследи.
--
-- Преди пускане: върни loading.js отпреди Пакет Г2. Клиентът пише
-- added_by_store и approval_status при „➕ Добави ред"; без колоните записът
-- връща 400 и редът не се добавя.
--
-- За Живко: махни петте колони от mirror-schema.sql и $TableColumns.

alter table public.loading_list_items
  drop column if exists approval_comment,
  drop column if exists approval_at,
  drop column if exists approval_by,
  drop column if exists approval_status,
  drop column if exists added_by_store;
