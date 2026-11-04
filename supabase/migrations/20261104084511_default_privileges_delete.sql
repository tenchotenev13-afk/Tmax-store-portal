alter default privileges for role postgres in schema public
  revoke delete on tables from anon, authenticated;
