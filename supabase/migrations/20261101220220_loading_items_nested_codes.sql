alter table public.loading_list_items add column nested_codes text;

comment on column public.loading_list_items.nested_codes is
  'Стока в стока: по една група на ред, кодовете разделени с /, напр. 98235/98234/98233 (01.11.2026); NULL = няма';
