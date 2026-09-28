-- app_settings: публичният ключ чете ЦЯЛАТА таблица, не изброени ключове.
--
-- ЗАЩО НЕ СПИСЪК. Старата политика app_settings_public_report_keys пускаше три
-- ключа: returns_stale_days, kasa_diff_threshold и storno_small_sum. Списъкът
-- се размина с действителността по два независими начина:
--
--   1. storno_small_sum НЕ СЪЩЕСТВУВА. Истинският ключ е storno_small_threshold
--      (report.js:1716). Тоест политиката пазеше ключ-призрак.
--   2. Таблицата порасна до десет ключа, а браузърът днес чете ОСЕМ:
--        kasa_diff_threshold      ✓ пускан
--        returns_stale_days       ✓ пускан
--        storno_small_threshold   ✗ report.js:1716
--        diff_stale_days          ✗ report.js:1736
--        pallets_drop_threshold   ✗ pallets.js:370
--        report_excluded_stores   ✗ shared.js
--        loading_transit_docs     ✗ loading.js:2534
--        loading_scan             ✗ loading.js:2534
--
-- Шестте блокирани падаха на резервни стойности в кода. Днес щета нямаше само
-- защото резервите СЪВПАДАТ с базата: storno_small_threshold е 5 и резервата е
-- 5; двата превключвателя са 'off' и резервата е изключено; списъкът с
-- изключени обекти съвпада с твърдия масив в shared.js. Тоест дефектът беше
-- спящ и чакаше първата промяна от Администрация, за да се събуди: кронът
-- (service ключ, минава над RLS) щеше да усвои новата стойност, а браузърът
-- не — и никой нямаше да разбере защо.
--
-- Точно това прави report_excluded_stores от 28.09.2026 безсмислен: ключът е
-- въведен, за да има ЕДИН източник вместо два, а политиката го връщаше на два.
--
-- Поправянето на списъка щеше да остарее пак — вече остаря два пъти. Затова
-- политиката вече не изброява.
--
-- КАКВО ЗНАЧИ ТОВА ЗА СЪДЪРЖАНИЕТО. Проверени са всичките десет реда към
-- 28.09.2026: прагове в дни и бройки, списък с имена на обекти, два
-- превключвателя on/off. Нищо чувствително. ОТ ТУК НАТАТЪК ТОВА Е ПРАВИЛО:
-- в app_settings НЕ влиза стойност, която не бива да се чете с публичния ключ.
-- Дотрябва ли такава, мястото ѝ е отделна таблица или едж функция със service
-- ключ (образецът е auth-login), НЕ нов ред тук.
--
-- ПИСАНЕТО ОСТАВА ЗАТВОРЕНО. Няма и не се добавя политика за INSERT/UPDATE/
-- DELETE за anon — стойностите се менят само със service ключ.
--
-- Връщане назад:
--   drop policy if exists app_settings_anon_select_all on public.app_settings;
--   create policy app_settings_public_report_keys on public.app_settings
--     for select to anon
--     using (key = any (array['returns_stale_days','kasa_diff_threshold','storno_small_sum']));

drop policy if exists app_settings_public_report_keys on public.app_settings;

create policy app_settings_anon_select_all on public.app_settings
  for select to anon
  using (true);
