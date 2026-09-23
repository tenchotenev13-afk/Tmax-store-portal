-- Приложено в Supabase на 23.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: loading_transit_docs_setting (version 20260923084503)
--
-- ДАННИ, не схема: нов ред в app_settings. НИЩО ЗА ЖИВКО.
--
-- Блокът „Документи от Стока на път" в редактора на товарните листи се
-- показва само при стойност 'on'. Тръгва ИЗКЛЮЧЕН: снимката в goods_transit
-- е месечна, а в редактора изглежда като оперативен списък и складът товари
-- по документи отпреди седмици. Пуска се от SQL Editor, когато решим —
-- нарочно няма бутон в интерфейса.
--
-- Клиентът (loading.js, llLoadTransitFlag) приема САМО 'on'; всичко друго —
-- липсващ ред, празно, боклук, паднала заявка — значи изключено. Тоест дори
-- този insert да не мине, поведението е същото; редът е тук, за да има какво
-- да се смени. При изключен блок заявката към goods_transit изобщо не тръгва.
--
-- Rollback: supabase/migrations/20260923084503_loading_transit_docs_setting_down.sql

insert into public.app_settings (key, value, updated_by)
values ('loading_transit_docs', 'off', 'claude 23.09.2026 — Стока на път скрита за склада')
on conflict (key) do nothing;
