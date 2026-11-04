-- Rollback на 20261104215023_transit_cleanup (transit-cleanup-schema.sql)
-- Rollback на transit-cleanup-schema.sql (04.11.2026): махат се тригерът и функцията.
-- Данните, които тригерът вече е поправил, остават (pending + sender_status /
-- reviewed_at) — новият код ги чете така; връщане на 'sent' / 'rejected' —
-- с rollback-а в transit-cleanup-data.sql.
drop trigger if exists goods_transit_legacy_status_trg on public.goods_transit;
drop function if exists public.goods_transit_legacy_status();
