-- Малка таблица за настройки, до които трябва достъп само от Edge Function
-- (service_role), НИКОГА директно от клиента през anon ключа. RLS е включена
-- и НЯМА НИТО ЕДНА policy за anon/authenticated — това означава таблицата е
-- напълно недостъпна през обичайния REST API, само service_role я вижда
-- (service_role винаги заобикаля RLS).
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by text
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_settings (key, value, updated_by)
-- стойността е премахната от записа; оригиналът е изтрит от базата
-- с миграция 20260803114512 и app_settings в момента е празна
VALUES ('kasa_pin', '<redacted>', 'system_initial_setup')
ON CONFLICT (key) DO NOTHING;
