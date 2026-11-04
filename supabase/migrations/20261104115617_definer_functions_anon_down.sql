-- Rollback на 20261104115617_definer_functions_anon (definer-functions-anon-schema.sql)
grant execute on function public.transit_mark_empty_stores() to public, anon, authenticated;
alter function public.report_excluded_stores() security definer;
