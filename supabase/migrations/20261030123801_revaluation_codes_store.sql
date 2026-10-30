alter table public.revaluation_codes add column store_name text;

comment on column public.revaluation_codes.store_name is
  'обектът, от чиято бланка е създаден кодът (MM41 по бланка, 30.10.2026); NULL = неизвестен';

update public.revaluation_codes r
   set store_name = s.store_name
  from (select i.campaign_id, i.new_sap_code, min(i.store_name) store_name
          from public.revaluation_items i
         where i.new_sap_code is not null
         group by 1, 2
        having count(distinct i.store_name) = 1) s
 where r.store_name is null
   and s.campaign_id = r.campaign_id
   and s.new_sap_code = r.new_sap_code;
