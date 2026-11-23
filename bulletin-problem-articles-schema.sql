-- bulletin-problem-articles-schema.sql
-- Огледало на supabase/migrations/20261123130220_bulletin_problem_articles.sql (приложена 23.11.2026)
-- Проверено в базата 23.11.2026: колоните, таблицата, RLS, 3 политики, anon
-- без DELETE/TRUNCATE, 25 активни / 0 с bulletin_on, anon GET 200.
--
-- ЗАЩО (сесия bulletin-problem-articles, 23.11.2026; решения на Тенчо 22.11 —
-- claude/razliki-reshenia-2026-11-22.md т.9, последна точка — и 23.11):
-- проблемен артикул от регистъра „🏷️ Проблемни артикули“ (Разлики) се показва
-- в Бюлетина на избраните обекти, докато Миглена не затвори записа. Обектът
-- натиска „✅ Направено“ (+ снимка, задължителна по избор на Миглена за всеки
-- запис). Миглена вижда по обекти кой е направил и снимките.
--
-- · problem_articles.bulletin_on — записът се показва в Бюлетина. Default
--   false: заварените записи НЕ влизат (решение 23.11 „само новите“); новите
--   от портала идват с true от модала.
-- · problem_articles.bulletin_stores — NULL = всички обекти; jsonb масив от
--   store_name = само тези.
-- · problem_articles.photo_required — снимката при „Направено“ е задължителна.
-- · problem_article_done — една отметка на обект за запис (unique article_id +
--   store_name). Без отмяна от обекта; затворен запис изчезва от Бюлетина,
--   отметките остават.
-- · RLS включен; select / insert / update за anon и authenticated, БЕЗ delete
--   (revoke delete, truncate) — както problem_articles.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9, проверено 23.11.2026 преди миграцията):
--   problem_articles — 25 активни (23 seed + 2 diff), 0 затворени. Колоните са
--   с default false → и 25-те остават извън Бюлетина. problem_article_done е
--   нова — засегнати редове няма.
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане“.
--
-- Rollback (supabase/migrations/20261123130220_bulletin_problem_articles_down.sql):
--   drop table if exists public.problem_article_done;
--   alter table public.problem_articles
--     drop column if exists bulletin_on,
--     drop column if exists bulletin_stores,
--     drop column if exists photo_required;

alter table public.problem_articles
  add column bulletin_on     boolean not null default false,
  add column bulletin_stores jsonb,
  add column photo_required  boolean not null default false;

comment on column public.problem_articles.bulletin_on is
  'Показва се в Бюлетина на обектите, докато е активен (решение 22–23.11.2026; заварените — false).';
comment on column public.problem_articles.bulletin_stores is
  'NULL — всички обекти; jsonb масив от store_name — само тези.';
comment on column public.problem_articles.photo_required is
  'Снимката при „Направено“ в Бюлетина е задължителна.';

create table public.problem_article_done (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references public.problem_articles(id),
  store_name  text not null,
  done_by     text,
  done_at     timestamptz not null default now(),
  photos      jsonb not null default '[]'::jsonb,
  unique (article_id, store_name)
);

comment on table public.problem_article_done is
  'Бюлетин — „Направено“ от обект за проблемен артикул. Една отметка на обект; без отмяна от обекта. 23.11.2026.';

alter table public.problem_article_done enable row level security;
create policy problem_article_done_select on public.problem_article_done
  for select to anon, authenticated using (true);
create policy problem_article_done_insert on public.problem_article_done
  for insert to anon, authenticated with check (true);
create policy problem_article_done_update on public.problem_article_done
  for update to anon, authenticated using (true) with check (true);

revoke delete, truncate on table public.problem_article_done from anon, authenticated;
grant select, insert, update on table public.problem_article_done to anon, authenticated;
