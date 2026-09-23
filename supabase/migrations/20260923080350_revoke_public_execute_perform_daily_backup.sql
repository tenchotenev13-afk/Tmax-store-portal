-- perform_daily_backup(text,text) е SECURITY DEFINER и беше викаема с публичния
-- anon ключ през /rest/v1/rpc/perform_daily_backup, тоест всеки можеше да пуска
-- бекъпи неограничено.
--
-- ВАЖНО: EXECUTE беше дадено и на PUBLIC (ACL '=X/postgres'), затова само
-- revoke от anon/authenticated нямаше да свърши работа — наследява се обратно.
--
-- Кронът НЕ е засегнат: job 7 'temax-daily-backup' (0 0 * * *) върви като
-- postgres, който е собственик и има изрично право.
-- Единственият клиентски викащ е triggerManualBackup() в admin.js:585, чийто
-- бутон днес не се рендира (#backup-admin-section липсва в index.html).
-- Ако бутонът бъде върнат, пътят е едж функция със service ключ, както auth-login.
revoke execute on function public.perform_daily_backup(text, text) from public;
revoke execute on function public.perform_daily_backup(text, text) from anon;
revoke execute on function public.perform_daily_backup(text, text) from authenticated;
