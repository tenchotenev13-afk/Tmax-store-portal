-- Rollback на transfer_cargo_loaded_at_store (дотоварване от спирка).
-- Без загуба само докато никой товар не е дотоварен:
--   select count(*) from public.transfer_cargo where loaded_at_store is not null;
-- След първото дотоварване rollback-ът губи КОЙ е качил товара — редовете
-- остават, но изпращачът им тихо става transfers.from_store.
drop index if exists public.transfer_cargo_loaded_at_idx;
alter table public.transfer_cargo drop column if exists loaded_at_store;
