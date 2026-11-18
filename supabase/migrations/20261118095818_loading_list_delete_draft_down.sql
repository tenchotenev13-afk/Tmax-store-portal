-- ROLLBACK на 20261118095818_loading_list_delete_draft.
revoke delete on public.loading_lists from anon;
drop policy if exists anon_delete_draft_loading_lists on public.loading_lists;
drop policy if exists anon_update_loading_lists on public.loading_lists;
drop policy if exists anon_insert_loading_lists on public.loading_lists;
drop policy if exists anon_select_loading_lists on public.loading_lists;
create policy anon_all_loading_lists on public.loading_lists for all to anon using (true) with check (true);
