-- grafik-access-drop-settings-schema.sql — Работен график, етап 1е-3, стъпка 2 от 2.
-- Прилага се САМО след като grafik-api (v7) и grafik.js четат от grafik_access и са на живо.
-- Маха двата ключа от app_settings — списъците вече не се четат с публичния ключ.
-- Rollback: grafik-access-drop-settings-schema-down.sql (връща ги от grafik_access).
delete from public.app_settings where key in ('grafik_beta_users', 'grafik_trz_users');
