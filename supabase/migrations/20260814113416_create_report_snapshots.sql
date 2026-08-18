create table report_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('daily','weekly')),
  period_key text not null,
  overall_pct integer not null,
  total_done integer not null,
  total_all integer not null,
  created_at timestamptz not null default now(),
  unique(period_type, period_key)
);
alter table report_snapshots disable row level security;
