-- Бюлетин: проблемни артикули (23.11.2026). Огледало: bulletin-problem-articles-schema.sql.
-- Rollback: 20261123130220_bulletin_problem_articles_down.sql
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
