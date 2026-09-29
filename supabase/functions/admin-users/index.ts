// supabase/functions/admin-users/index.ts
// Записите в users от Администрация, само с админски пропуск.
// Логиката е в handler.ts; тук е само истинският клиент със service ключа.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleAdminUsers } from "./handler.ts";

Deno.serve((req) =>
  handleAdminUsers(req, () =>
    createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  )
);
