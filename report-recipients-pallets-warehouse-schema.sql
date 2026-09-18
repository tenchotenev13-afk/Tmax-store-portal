-- report-recipients-pallets-warehouse-schema.sql
-- Отделни получатели за отчетите „Палети" и „Склад".
-- Приложено в Supabase (xiwkdiqqplgdcrkewgtv) на 18.09.2026.
-- Миграция: 20260918114902_report_recipients_pallets_warehouse
--
-- ЗАЩО
-- „Палети за прибиране" (петък 18:00) се пращаше до report_recipients с
-- weekly=true — тоест който получава седмичния, получаваше и палетите, без
-- да може да се раздели. „Логистичен склад" (неделя 21:00) не четеше
-- report_recipients изобщо. Двете нови колони дават по отделен флаг на отчет,
-- до дневния (daily) и седмичния (weekly).
--
-- КАК СЕ ЧЕТАТ (send-scheduled-report / report.js)
--   pallets=true   → общото писмо за Палети (+ регионалните, както досега;
--                    scope_stores важи — непразен → личен отчет);
--   warehouse=true → получава отчета за ВСЕКИ логистичен склад, до
--                    потребителите с role=logistics (те — само за своя).
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9, проверено 18.09.2026)
-- 2 реда (Тен Тенев, Теодор Тенев), и двата active, daily, weekly.
-- Backfill pallets = weekly → и двата pallets=true: днешните получатели на
-- Палети не се променят. warehouse=false за всички: Склад днес отива само
-- до role=logistics — и след миграцията също.
--
-- ГРАНТОВЕ: НЕ СА НУЖНИ. report_recipients е с ТАБЛИЧНИ права за anon
-- (RLS изключен) — новите колони ги наследяват.
--
-- ОГЛЕДАЛО (Живко): две нови колони в report_recipients —
--   pallets   boolean not null default false
--   warehouse boolean not null default false
-- Да се добавят в mirror-schema.sql и в $TableColumns на sync-mirror.ps1.
-- Без CHECK ограничения.

alter table public.report_recipients
  add column pallets   boolean not null default false,
  add column warehouse boolean not null default false;

update public.report_recipients set pallets = weekly;
