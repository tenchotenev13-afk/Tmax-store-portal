-- diff-email-pending-schema.sql
-- „Решена — чака имейл": бланката остава горе, докато не се изпрати имейл
-- или не се натисне „✓ Без имейл".
-- НЕ Е ПРИЛОЖЕНО. Прилага се ръчно в Supabase → SQL Editor (MCP е само за
-- четене). Кодът в stock-differences.js ПИШЕ email_pending в patch-а за
-- reviewed=true — без колоната PostgREST връща 400 и бланката не се
-- затваря изобщо. Затова: първо този SQL, после push на кода.
--
-- ЗАЩО
-- Щом последният ред на бланката получи решение, кодът пише reviewed=true
-- и бланката излиза от горната секция „Нови подадени бланки". Бутонът
-- „✉️ Изпрати имейл" е само там — след решението Цвети не може да прати
-- имейл на доставчика (точка 3 от Цвети, 28.09.2026).
--
-- КОЛОНИТЕ
-- email_pending    — бланката е решена и чака имейл или „Без имейл".
--                    Пише се true САМО в patch-а, който прави reviewed=true,
--                    и само при посока, по която решава Цвети (не
--                    междускладова). Пише се false при изпратен имейл и при
--                    „✓ Без имейл".
-- email_skipped_at — кога е натиснато „✓ Без имейл". NULL = не е.
--
-- ЗАЩО NOT NULL DEFAULT FALSE
-- Заварените бланки НЕ бива да се връщат горе. Към 28.09.2026 от 298
-- бланки 136 са прегледани, от тях 44 (доставчик/сторна) без email_sent_at.
-- С default false и тези 44 си остават долу, както досега. NULL би
-- значел „не знам" — такъв случай няма.
--
-- ГРАНТ НЕ Е НУЖЕН
-- differences_reports има ТАБЛИЧЕН грант за anon (pg_class.relacl:
-- anon=arwdDxtm/postgres), RLS е изключено — новите колони се покриват
-- автоматично. Проверено 28.09.2026.

alter table public.differences_reports
  add column if not exists email_pending boolean not null default false;

alter table public.differences_reports
  add column if not exists email_skipped_at timestamptz null;

comment on column public.differences_reports.email_pending is
  'Бланката е решена (reviewed=true) и чака имейл до доставчика или „Без имейл". Само за посоки, по които решава Цвети.';
comment on column public.differences_reports.email_skipped_at is
  'Кога е натиснато „✓ Без имейл" — бланката е решена и имейл нарочно не е пратен. NULL = не е.';

-- Проверка: трябва да върне 2 реда.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'differences_reports'
   and column_name in ('email_pending', 'email_skipped_at')
 order by column_name;

-- ЗА ЖИВКО (огледалото)
-- Две нови колони в differences_reports -> трябва да влязат в
-- mirror-schema.sql и в $TableColumns за differences_reports в
-- sync-mirror.ps1. Иначе огледалото ще тегли таблицата без тях.

-- ─── ROLLBACK ────────────────────────────────────────────────────────────
-- ПЪРВО се връща кодът (иначе patch-ът за reviewed=true пада с 400), после:
--
--   alter table public.differences_reports drop column if exists email_skipped_at;
--   alter table public.differences_reports drop column if exists email_pending;
--
-- Губи се само кои бланки чакат имейл и кога е натиснато „Без имейл";
-- reviewed и email_sent_at не се пипат.
