-- Rollback на 20260923084503_loading_transit_docs_setting.sql
--
-- Махането на реда НЕ връща блока — клиентът пада към ИЗКЛЮЧЕНО при липсващ
-- ключ. Иска ли се блокът обратно, стойността се сменя на 'on':
--   update public.app_settings set value = 'on' where key = 'loading_transit_docs';
-- Изтриването е само за да не остане ключ, който вече никой не чете —
-- уместно е чак ако loading.js се върне отпреди тази промяна.

delete from public.app_settings where key = 'loading_transit_docs';
