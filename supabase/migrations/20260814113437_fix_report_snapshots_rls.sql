alter table report_snapshots enable row level security;
create policy anon_all_report_snapshots on report_snapshots for all to anon using (true) with check (true);
