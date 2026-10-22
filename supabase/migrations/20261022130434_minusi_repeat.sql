-- 20261022130434_minusi_repeat — огледало: minusi-repeat-schema.sql.
-- Приложено 22.10.2026 с apply_migration; версията е дадена от базата.

alter table public.minus_movements add column action text null;
comment on column public.minus_movements.action is
  'Действие срещу повторен минус (до app_settings.minus_repeat_days дни след предишния 955 за същия обект и материал). Попълва обектът; задължително при повторение.';

insert into public.app_settings (key, value, updated_at, updated_by)
  values ('minus_repeat_days', '10', now(), 'minusi-repeats')
  on conflict (key) do nothing;
