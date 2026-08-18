alter table public.kasa_storno
  add column if not exists status text not null default 'draft',
  add column if not exists return_reason text,
  add column if not exists returned_by text,
  add column if not exists returned_at timestamptz,
  add column if not exists store_comment text,
  add column if not exists resubmitted_by text,
  add column if not exists resubmitted_at timestamptz;
