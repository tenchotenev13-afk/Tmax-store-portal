-- Rollback на 20260930120000_stock_differences_sent_sap.sql
-- Преди пускане: редове със store_response='sap_accepted' трябва да се
-- преместят (иначе новият CHECK пада), а warehouse_response='sent_sap' остава без етикет.
update public.stock_differences set store_response='accepted' where store_response='sap_accepted';
alter table public.stock_differences drop constraint stock_differences_store_response_check;
alter table public.stock_differences add constraint stock_differences_store_response_check
  check (store_response in ('accepted','sap_done','no_stock'));
comment on column public.stock_differences.store_response is 'Отговор на магазина по междускладов ред: accepted = ПРИЕТО (стоката е получена физически, след warehouse_response=sent); sap_done = ПУСНАТО В SAP (обратното движение е прието в SAP, след warehouse_response=return); no_stock = НЯМА НАЛИЧНОСТ В ЛОГИСТИКА (магазинът не може да пусне движението; редът остава отворен и червен за склада).';
comment on column public.stock_differences.warehouse_response is null;
