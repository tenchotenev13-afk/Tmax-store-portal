-- Rollback на 20260915193838_stock_differences_store_response.sql
--
-- Маха четирите колони за отговор на магазина. CHECK ограничението върху
-- store_response пада заедно с колоната. Записаните отговори се губят
-- безвъзвратно. Преди пускане: уведоми Живко (огледалото очаква колоните).

alter table public.stock_differences
  drop column store_response,
  drop column store_response_by,
  drop column store_response_at,
  drop column store_response_comment;
