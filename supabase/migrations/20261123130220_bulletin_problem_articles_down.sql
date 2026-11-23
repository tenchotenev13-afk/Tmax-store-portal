-- Rollback на 20261123130220_bulletin_problem_articles (Бюлетин: проблемни артикули).
drop table if exists public.problem_article_done;
alter table public.problem_articles
  drop column if exists bulletin_on,
  drop column if exists bulletin_stores,
  drop column if exists photo_required;
