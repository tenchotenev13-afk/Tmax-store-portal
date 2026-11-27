// supabase/functions/notify-admin/index.ts
// Четене и запис в таблиците „кой какво получава“ (report_recipients,
// notification_topics / matrix / overrides / schedules) — само с пропуск.
// Логиката е в handler.ts; тук е само истинският клиент със service ключа.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleNotifyAdmin } from "./handler.ts";

Deno.serve((req) =>
  handleNotifyAdmin(req, () =>
    createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  )
);
