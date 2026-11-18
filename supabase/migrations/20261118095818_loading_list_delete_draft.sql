-- loading_list_delete_draft — виж loading-list-delete-draft-schema.sql в корена.
-- Приложена 18.11.2026 с apply_migration, версия 20261118095818.
drop policy if exists anon_all_loading_lists on public.loading_lists;
create policy anon_select_loading_lists on public.loading_lists for select to anon using (true);
create policy anon_insert_loading_lists on public.loading_lists for insert to anon with check (true);
create policy anon_update_loading_lists on public.loading_lists for update to anon using (true) with check (true);
create policy anon_delete_draft_loading_lists on public.loading_lists for delete to anon using (status = 'draft');
grant delete on public.loading_lists to anon;
