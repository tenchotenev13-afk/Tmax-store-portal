-- Rollback на 20261015180000_revaluation_codes
--
-- ГУБИ ДАННИ: регистърът на създадените в SAP преоценени кодове — следващ
-- MM41 пак ще ги съдържа. Първо се връща revaluation.js отпреди етап 3б,
-- после базата.
-- Преди rollback:
--   select count(*) from revaluation_codes;

drop policy if exists revaluation_campaigns_delete on public.revaluation_campaigns;
drop table if exists public.revaluation_codes;
