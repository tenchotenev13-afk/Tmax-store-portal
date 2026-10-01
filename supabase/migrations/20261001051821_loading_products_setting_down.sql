-- Rollback на 20261001051821_loading_products_setting.sql
--
-- Махането на реда НЕ връща блока — клиентът пада към ИЗКЛЮЧЕНО при липсващ
-- ключ. Иска ли се блокът обратно, стойността се сменя:
--   update public.app_settings set value = 'on' where key = 'loading_products';
-- Изтриването е само за да не остане ключ, който вече никой не чете —
-- уместно е чак ако loading.js се върне отпреди тази промяна.
--
-- Махне ли се редът съвсем, махни и реда за него в HIDDEN-FEATURES.md.

delete from public.app_settings where key = 'loading_products';
