-- Rollback на 20261026210100_weekly_checklist_freeze_35_43
-- Отваря отново седмиците 35–43 (табът пак ги показва живо). portal_value,
-- записани при затварянето, остават в weekly_checklist — предишните стойности
-- не са запазени отделно (те бяха снимки от отварянето на таба).

delete from public.weekly_checklist_freezes
 where year = 2026 and week_number between 35 and 43;
