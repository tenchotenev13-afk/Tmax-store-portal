-- Rollback на 20261104084511_default_privileges_delete (default-privileges-delete-schema.sql)
alter default privileges for role postgres in schema public
  grant delete on tables to anon, authenticated;
