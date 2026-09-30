-- Междускладови трансфери — етап 3: прехвърляне на чакащ товар към нов транспорт.
-- Товар, отбелязан „Разтоварен — чака прехвърляне" в обект P, продължава в
-- НОВ ред transfer_cargo на следващия транспорт (нов, създаден от P, или
-- дотоварване на бус през P). Новият ред сочи стария през prev_cargo_id.
-- Старият ред и старият транспорт не се пипат.
-- Уникалният частичен индекс гарантира, че един товар се прехвърля САМО
-- ВЕДНЪЖ — втори опит връща 23505, не дубликат.
-- on delete set null: изтрит стар транспорт не трие продължението.

alter table public.transfer_cargo
  add column prev_cargo_id uuid references public.transfer_cargo(id) on delete set null;

comment on column public.transfer_cargo.prev_cargo_id is
  'Предишното звено: товарът, от който е прехвърлен този ред (етап 3). NULL = товарът започва в този транспорт.';

create unique index transfer_cargo_prev_uidx on public.transfer_cargo (prev_cargo_id) where prev_cargo_id is not null;
