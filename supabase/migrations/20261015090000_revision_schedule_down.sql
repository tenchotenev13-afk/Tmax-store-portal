-- Rollback на 20261015090000_revision_schedule
--
-- ГУБИ ДАННИ: целият график на ревизиите изчезва.
-- Преди rollback:
--   select count(*) from revision_schedule;
-- Първо се маха revisions.js (под-табът „📅 График ревизии“), после базата —
-- иначе под-табът показва грешка при зареждане.

drop table if exists public.revision_schedule;
