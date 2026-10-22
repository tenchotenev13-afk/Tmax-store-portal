-- Rollback на 20261022133937_minusi_note_required.
--
-- Губи само флага requires_note (днес true за id 1). minusi.js иска колоната
-- в select-а на minus_reasons — върни и кода, иначе „Минуси" показва грешка.
alter table public.minus_reasons drop column if exists requires_note;
