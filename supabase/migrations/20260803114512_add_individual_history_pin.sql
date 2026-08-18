-- Индивидуален PIN за достъп до таб История, хеширан (bcrypt), никога чист текст.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS history_pin_hash text;

-- Стария споделен PIN вече не се ползва — местим към индивидуални кодове.
DELETE FROM public.app_settings WHERE key = 'kasa_pin';
