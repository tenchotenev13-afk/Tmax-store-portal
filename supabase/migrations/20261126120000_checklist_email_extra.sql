insert into public.app_settings (key, value, updated_at, updated_by)
values ('checklist_email_extra', '["t.tenev@temax.bg","ten.tenev@temax.bg"]', now(), 'migration checklist_email_extra')
on conflict (key) do nothing;
