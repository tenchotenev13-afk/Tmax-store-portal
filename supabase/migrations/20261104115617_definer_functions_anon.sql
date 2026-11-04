revoke execute on function public.transit_mark_empty_stores() from public, anon, authenticated;
alter function public.report_excluded_stores() security invoker;
