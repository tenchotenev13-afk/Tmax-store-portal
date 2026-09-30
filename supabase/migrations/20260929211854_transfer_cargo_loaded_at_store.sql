-- Междускладови трансфери — дотоварване от спирка.
-- Нова колона transfer_cargo.loaded_at_store: обектът-спирка, в който товарът
-- е качен на ВЕЧЕ тръгналия бус. NULL = товар на създателя (transfers.from_store).
-- За дотоварения товар изпращачът е loaded_at_store — той има правата на
-- изпращач („Решен", „Предаден на куриер") и е началото на маршрута на товара
-- (tfCargoSender в transfers.js). Правилото „дотоварва само спирка, и само
-- към обект СЛЕД нея" е в клиента (tfReloadStores / tfValidate) — без CHECK,
-- по конвенцията на transfer_* (огледалото на Живко не пренася CHECK-ове).
-- Частичният индекс е за заявката на видимостта (loaded_at_store.eq.<обект>).

alter table public.transfer_cargo add column loaded_at_store text;

comment on column public.transfer_cargo.loaded_at_store is
  'Обектът-спирка, в който е дотоварен товарът. NULL = товар на създателя (transfers.from_store).';

create index transfer_cargo_loaded_at_idx on public.transfer_cargo (loaded_at_store) where loaded_at_store is not null;
