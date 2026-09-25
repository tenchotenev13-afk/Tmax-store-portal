-- Rollback на 20260925065921_loading_scan_setting.sql
--
-- Махането на реда НЕ връща бутона — клиентът пада към ИЗКЛЮЧЕНО при липсващ
-- ключ. Иска ли се скенерът обратно, стойността се сменя:
--   update public.app_settings set value = 'on' where key = 'loading_scan';
-- Изтриването е само за да не остане ключ, който вече никой не чете —
-- уместно е чак ако loading.js се върне отпреди тази промяна.
--
-- Махне ли се редът съвсем, махни и реда за него в HIDDEN-FEATURES.md.

delete from public.app_settings where key = 'loading_scan';
