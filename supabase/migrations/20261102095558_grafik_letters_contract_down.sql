-- Rollback на grafik_letters_contract: махат се редовете за 4-часов договор и
-- колоната, О4 се връща към О (състоянието от grafik_schema), старото unique се
-- възстановява. Ако вече има въведени графици с 4-часови служители, техните
-- П/В ще се превеждат отново като 8-часови смени — проверка преди rollback.
begin;

delete from public.grafik_letter_map where hours_per_day is not null;

update public.grafik_letter_map set code = 'О'
 where vtr_id = '6a1d0000-0000-4000-8000-000000000001' and letter = 'О4';

drop index public.grafik_letter_map_uniq;
alter table public.grafik_letter_map drop column hours_per_day;
alter table public.grafik_letter_map
  add constraint grafik_letter_map_vtr_id_letter_day_kind_valid_from_key unique (vtr_id, letter, day_kind, valid_from);

commit;
