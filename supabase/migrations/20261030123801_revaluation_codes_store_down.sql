-- Rollback на 20261030123801_revaluation_codes_store (revaluation-codes-store-schema.sql)
alter table public.revaluation_codes drop column store_name;
