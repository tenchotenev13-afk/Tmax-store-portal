-- Rollback на 20260928192252_app_settings_anon_select_all
--
-- Взето ДОСЛОВНО от раздела „Връщане назад" в коментара на up файла, за да няма
-- две версии на един и същ ход.
--
-- ⚠ ВРЪЩА И ДВАТА ДЕФЕКТА. Старата политика изброява три ключа, един от които
-- (storno_small_sum) не съществува, и блокира шестте, които браузърът реално
-- чете: storno_small_threshold, diff_stale_days, pallets_drop_threshold,
-- report_excluded_stores, loading_transit_docs, loading_scan. Порталът НЕ гърми —
-- пада на резервните стойности в кода, тоест провалът е тих. Точно това го
-- направи незабелязан веднъж.
--
-- Тоест този файл съществува за пълнота на записа, не като изход при проблем.
-- Ако причината да се върне е сигурност (в app_settings е влязла стойност, която
-- не бива да се чете публично), правилният ход е ДРУГ: стойността се маха от
-- таблицата и отива в отделна таблица или едж функция със service ключ. Връщането
-- на списъка само ще я скрие от браузъра, докато кронът и огледалото я четат.

drop policy if exists app_settings_anon_select_all on public.app_settings;

create policy app_settings_public_report_keys on public.app_settings
  for select to anon
  using (key = any (array['returns_stale_days','kasa_diff_threshold','storno_small_sum']));
