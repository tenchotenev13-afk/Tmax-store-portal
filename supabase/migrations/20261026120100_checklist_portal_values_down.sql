-- Rollback на 20261026120100_checklist_portal_values
-- В етап 1 никой не вика функцията — drop-ът е безопасен. От етап 2 (табът
-- чете от нея) първо трябва да се върне кодът.

drop function if exists public.checklist_portal_values(int, int);
