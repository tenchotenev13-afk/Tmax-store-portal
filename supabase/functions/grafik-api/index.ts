// supabase/functions/grafik-api/index.ts
// Работен график — единственият път до таблиците grafik_*. Логиката е в
// handler.ts, достъпът до базата — в repo.ts (supabase-js със service ключа).
import { handleGrafik } from "./handler.ts";
import { makeRepo } from "./repo.ts";

Deno.serve((req) => handleGrafik(req, makeRepo));
