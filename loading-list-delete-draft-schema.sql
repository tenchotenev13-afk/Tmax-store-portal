-- loading-list-delete-draft-schema.sql
-- Товарни листи: „🗑 Изтрий черновата" (решение на Тенчо 18.11.2026,
-- сесия ll-nahodki, т.10).
-- ПРИЛОЖЕНО В СУПАБЕЙС НА 18.11.2026 — миграция 20261118095818_loading_list_delete_draft
-- (supabase/migrations/, + _down.sql). Сверено след прилагането: pg_policies —
-- 4 политики (delete: status = 'draft'), role_table_grants — anon:DELETE.
-- Доказано с anon ключа през PostgREST: тестов лист draft → DELETE върна 1 ред;
-- тестов лист sent → DELETE върна [] (0 реда), листът остана; изчистен после
-- със service заявка (маркер warehouse 'TEST ll-nahodki').
--
-- ЗАЩО
-- Складът (и admin) трие чернова на товарен лист от прегледа ѝ. Изпратен
-- лист (sent / partial / done) НЕ бива да може да се изтрие — и при грешка
-- в кода, затова ограничението е в базата, не само в бутона.
--
-- КАКВО БЕШЕ (сверено 18.11.2026 в pg_policies / role_table_grants):
--   - RLS включено; една политика anon_all_loading_lists (ALL, anon,
--     using true, check true);
--   - anon и authenticated: INSERT, SELECT, UPDATE (+ REFERENCES, TRIGGER,
--     TRUNCATE), БЕЗ DELETE (anon-revoke-delete-schema.sql, 02.11.2026).
--
-- КАКВО СТАВА
--   - ALL политиката се разделя на четири: select / insert / update остават
--     using(true) — поведението за тях не се променя; delete е САМО за
--     status = 'draft'. (Permissive политиките се OR-ват, затова ALL с true
--     не може да остане — щеше да пусне DELETE и на изпратен лист.)
--   - grant delete на anon (не на authenticated — за него политика няма).
--   Всичко е в една миграция = една транзакция: няма миг без политика.
--
-- КАСКАДИ (сверено 18.11.2026 в pg_constraint):
--   loading_list_items.list_id    → loading_lists  ON DELETE CASCADE
--   loading_list_photos.list_id   → loading_lists  ON DELETE CASCADE
--   loading_list_products.item_id → loading_list_items ON DELETE CASCADE
--   transfer_cargo.loading_item_id → loading_list_items ON DELETE SET NULL
--   Каскадите минават като собственика на таблицата, не през RLS
--   (доказано за същия клас в anon-revoke-delete-schema.sql).
--   Към 18.11: 0 чернови с ред, вързан към transfer_cargo; 0 чернови с
--   client_order_id. Клиентските заявки (client_orders) не се пипат —
--   връзката е колона в реда на листа и изчезва с него.
--   Файловете в Storage остават сираци (както при триене на снимка).
--
-- ГРАНИЦА: anon може да UPDATE-не status обратно на 'draft' и после да
-- изтрие — ограничението пази от грешка в кода, не от човек с anon ключа
-- (същият компромис като останалите таблици с anon_all).
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): само права и политики — 0 засегнати реда.
-- Към 18.11.2026: draft 8, sent 17, partial 3, done 85.
-- ОГЛЕДАЛО (Живко): нова колона няма; информативен ред в zhivko-opashka.md —
-- редове от loading_lists / loading_list_items могат да изчезват от базата.
-- ПОРЕДНОСТ: миграцията преди push-а на loading.js. Без нея бутонът трие
-- 0 реда и казва, че не е изтрито — не мълчи.

drop policy if exists anon_all_loading_lists on public.loading_lists;

create policy anon_select_loading_lists on public.loading_lists
  for select to anon using (true);
create policy anon_insert_loading_lists on public.loading_lists
  for insert to anon with check (true);
create policy anon_update_loading_lists on public.loading_lists
  for update to anon using (true) with check (true);
create policy anon_delete_draft_loading_lists on public.loading_lists
  for delete to anon using (status = 'draft');

grant delete on public.loading_lists to anon;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────
-- revoke delete on public.loading_lists from anon;
-- drop policy if exists anon_delete_draft_loading_lists on public.loading_lists;
-- drop policy if exists anon_update_loading_lists on public.loading_lists;
-- drop policy if exists anon_insert_loading_lists on public.loading_lists;
-- drop policy if exists anon_select_loading_lists on public.loading_lists;
-- create policy anon_all_loading_lists on public.loading_lists
--   for all to anon using (true) with check (true);
