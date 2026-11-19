// supabase/functions/kasa-api/index.ts
// Каса — четене на касовите таблици през подписания пропуск (етап 1б, 19.11.2026).
// Логиката е в handler.ts, достъпът до базата — в repo.ts (supabase-js със service ключа).
import { handleKasa } from "./handler.ts";
import { makeRepo } from "./repo.ts";

Deno.serve((req) => handleKasa(req, makeRepo));
