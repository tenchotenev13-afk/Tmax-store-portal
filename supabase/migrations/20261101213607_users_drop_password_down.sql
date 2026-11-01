-- Rollback на 20261101213607_users_drop_password (users-drop-password-schema.sql)
-- Стойностите не се възстановяват (умишлено: всички 104 реда имат password_hash); default 'temax2025' НЕ се връща.
alter table public.users add column password text;
