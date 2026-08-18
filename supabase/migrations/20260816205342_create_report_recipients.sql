create table if not exists report_recipients (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  daily boolean not null default true,
  weekly boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table report_recipients disable row level security;
