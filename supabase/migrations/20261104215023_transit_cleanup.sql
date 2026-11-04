-- transit-cleanup-schema.sql — „Стока на път“ (04.11.2026, сесия transit-cleanup):
-- тригер за СТАРИ клиенти (отворен раздел със стара версия на transit.js).
--
-- Стар браузър пише status 'sent' (бутонът „Изпратена“ до етап 3) или
-- 'rejected' („✕ Неприето“ до тази сесия). Новият модел: status е само на
-- получателя — 'pending' / 'received'; изпращачът е в sender_status*, а
-- „✕ Недоставена“ е reviewed_at при status 'pending'. Към 04.11.2026: 31 реда
-- 'sent', записани СЛЕД 20261104122306, от раздели със стара версия.
--
--   NEW.status = 'sent'     → status 'pending'; ако NEW.sender_status IS NULL →
--                             sender_status 'sent', _at = coalesce(NEW.updated_at, now()),
--                             _by = NEW.updated_by
--   NEW.status = 'rejected' → status 'pending'; ако NEW.reviewed_at IS NULL →
--                             reviewed_at = coalesce(NEW.updated_at, now()),
--                             reviewed_by = NEW.updated_by
-- Отбелязано вече (sender_status / reviewed_at не NULL) не се презаписва.
--
-- Ред на тригерите: на goods_transit има само goods_transit_sync_ins / _upd /
-- _del — AFTER … FOR EACH STATEMENT (transit_sync_completions). Този е BEFORE
-- … FOR EACH ROW: сменя само NEW, без нов UPDATE → без рекурсия; sync
-- тригерите виждат вече поправения ред. WHEN ограничава до двете стойности —
-- останалите записи (вкл. импортът на партиди) не минават през функцията.
--
-- Огледалото (Живко): колони няма → ред в опашката не трябва; тригерът го няма
-- в огледалото (там няма тригери) — данните идват вече поправени.
-- Rollback: transit-cleanup-schema-down.sql.

create or replace function public.goods_transit_legacy_status()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if NEW.status = 'sent' then
    NEW.status := 'pending';
    if NEW.sender_status is null then
      NEW.sender_status    := 'sent';
      NEW.sender_status_at := coalesce(NEW.updated_at, now());
      NEW.sender_status_by := NEW.updated_by;
    end if;
  elsif NEW.status = 'rejected' then
    NEW.status := 'pending';
    if NEW.reviewed_at is null then
      NEW.reviewed_at := coalesce(NEW.updated_at, now());
      NEW.reviewed_by := NEW.updated_by;
    end if;
  end if;
  return NEW;
end
$function$;

comment on function public.goods_transit_legacy_status() is
  'Стари клиенти (04.11.2026): status sent → pending + sender_status; rejected → pending + reviewed_at. Не презаписва вече отбелязаното.';

drop trigger if exists goods_transit_legacy_status_trg on public.goods_transit;
create trigger goods_transit_legacy_status_trg
  before insert or update on public.goods_transit
  for each row
  when (NEW.status in ('sent', 'rejected'))
  execute function public.goods_transit_legacy_status();
