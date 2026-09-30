-- Разлики (междускладови): път „Изпратено по система“
--
-- Складът може да пусне фиктивното движение по SAP (warehouse_response =
-- 'sent_sap'); магазинът само го потвърждава в SAP (store_response =
-- 'sap_accepted'). warehouse_response няма CHECK - само comment.
-- Проверено 30.09.2026: CHECK се РАЗШИРЯВА, заварените редове не се засягат.
-- Огледало (Живко): нови стойности sent_sap / sap_accepted + новият CHECK.
-- Rollback: 20260930120000_stock_differences_sent_sap_down.sql

alter table public.stock_differences drop constraint stock_differences_store_response_check;
alter table public.stock_differences add constraint stock_differences_store_response_check
  check (store_response in ('accepted','sap_done','no_stock','sap_accepted'));

comment on column public.stock_differences.store_response is 'Отговор на магазина по междускладов ред: accepted = ПРИЕТО (стоката е получена физически, след warehouse_response=sent); sap_done = ПУСНАТО В SAP (обратното движение, след warehouse_response=return); sap_accepted = ПРИЕТО В SAP (след warehouse_response=sent_sap); no_stock = НЯМА НАЛИЧНОСТ В ЛОГИСТИКА (редът остава отворен и червен за склада).';
comment on column public.stock_differences.warehouse_response is 'Отговор на логистичния склад по междускладов ред: sent = Изпратено (физически); sent_sap = Изпратено по система (складът пуска движението в SAP); will_send = Ще се изпрати; return = Обратно движение (магазинът пуска в SAP).';
