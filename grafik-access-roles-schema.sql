-- grafik-access-roles-schema.sql — Работен график, роли, стъпка 2 от 2 (решение на Тенчо 27.11.2026).
-- Прилага се САМО след деплоя на grafik-api, който чете view / edit (roleOf: beta = edit) —
-- старият познава само beta / trz и би затворил таба за всички освен ТРЗ.
-- beta → edit (същите права като досега — по портала); Теодор (t.tenev@temax.bg) → view и може да
-- нулира ПИН; една роля на имейл (уникален имейл вместо (list, email)); beta изчезва от CHECK.
-- Rollback: grafik-access-roles-schema-down.sql.

update public.grafik_access set list = 'edit' where list = 'beta';
update public.grafik_access set list = 'view', can_reset_pin = true where email = 't.tenev@temax.bg';
drop index public.grafik_access_list_email;
create unique index grafik_access_email on public.grafik_access (email);
alter table public.grafik_access drop constraint grafik_access_list_check;
alter table public.grafik_access add constraint grafik_access_list_check check (list in ('view', 'trz', 'edit'));
