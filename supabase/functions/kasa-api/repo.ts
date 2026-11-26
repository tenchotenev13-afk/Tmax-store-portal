// supabase/functions/kasa-api/repo.ts
// Repo на kasa-api върху supabase-js със service ключа. Отделно от index.ts,
// за да се тества handler.ts без мрежа (handler.test.ts) и без Deno.serve при импорт.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { AuditEntry, Query, Repo, Row, User } from "./handler.ts";

// Само безопасни колони — никога password_hash / history_pin_hash.
const USER_COLS = "id,email,display_name,store_name,role,is_regional,assigned_stores,active";
const BUCKET = "kasa-docs";
const PAGE = 1000;

// Етап 2 (26.11.2026): записът е САМО за сторно — бял списък таблица → колона
// за изтриване. Всичко друго гърми, преди да стигне до базата.
export const STORNO_WRITE_TABLES: Record<string, string[]> = {
  kasa_storno: ["id"],
  kasa_storno_items: ["storno_id"],
};
export function guardWrite(table: string, col?: string): void {
  const cols = STORNO_WRITE_TABLES[table];
  if (!cols) throw new Error("kasa-api: запис в непозволена таблица " + table);
  if (col !== undefined && cols.indexOf(col) < 0) throw new Error("kasa-api: изтриване по непозволена колона " + table + "." + col);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
type R = { data: any; error: { message: string } | null };
function ok<T = unknown>(r: R): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

// Защита от грешка в handler-а: заявка без обхват не тръгва. Обхватът „всички“
// е изричен ("all"), не липса на поле. kasa_storno_items няма store_name —
// единствената таблица, за която "all" е позволено и при обект (handler-ът
// проверява родителя първо).
export function guardQuery(q: Query): void {
  if (q.stores !== "all" && (!Array.isArray(q.stores) || !q.stores.length)) throw new Error("kasa-api: заявка без обхват");
  if (!(q.cap > 0)) throw new Error("kasa-api: заявка без таван");
  if (!q.order.length) throw new Error("kasa-api: заявка без подредба (страниците биха се припокривали)");
}

export function makeRepo(): Repo {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return {
    async getUser(id) {
      return ok<User | null>(await db.from("users").select(USER_COLS).eq("id", id).maybeSingle());
    },
    async rows(q) {
      guardQuery(q);
      const out: Row[] = [];
      // Страници по 1000 (PostgREST реже тихо) до cap+1 — handler-ът решава 413.
      for (let off = 0; out.length <= q.cap; off += PAGE) {
        let x = db.from(q.table).select(q.select);
        if (q.stores !== "all") x = x.in("store_name", q.stores);
        if (q.eq) for (const k of Object.keys(q.eq)) x = x.eq(k, q.eq[k]);
        if (q.gte) x = x.gte(q.gte[0], q.gte[1]);
        if (q.lte) x = x.lte(q.lte[0], q.lte[1]);
        if (q.lt) x = x.lt(q.lt[0], q.lt[1]);
        if (q.orReturned) x = x.or(q.orReturned.col + ".gte." + q.orReturned.from + ",status.eq.returned");
        for (const o of q.order) {
          const [col, dir] = o.split(".");
          x = x.order(col, { ascending: dir !== "desc" });
        }
        if (q.embedOrder) {
          for (const o of q.embedOrder.cols) {
            const [col, dir] = o.split(".");
            x = x.order(col, { ascending: dir !== "desc", foreignTable: q.embedOrder.table });
          }
        }
        const page = ok<Row[]>(await x.range(off, off + PAGE - 1));
        out.push(...page);
        if (page.length < PAGE) break;
      }
      return out;
    },
    async signUrl(path, seconds) {
      const r = await db.storage.from(BUCKET).createSignedUrl(path, seconds);
      if (r.error || !r.data) return null;
      return r.data.signedUrl;
    },
    async deleteEq(table, col, val) {
      guardWrite(table, col);
      // Изтриване без конкретна стойност би било „изтрий всичко“ — не тръгва.
      if (!UUID.test(String(val))) throw new Error("kasa-api: изтриване без валиден id");
      const r = await db.from(table).delete({ count: "exact" }).eq(col, val);
      if (r.error) throw new Error(r.error.message);
      return r.count ?? 0;
    },
    async insertRows(table, rows) {
      guardWrite(table);
      if (!rows.length) return 0;
      const r = await db.from(table).insert(rows, { count: "exact" });
      if (r.error) throw new Error(r.error.message);
      return r.count ?? rows.length;
    },
    async audit(e: AuditEntry) {
      const r = await db.from("audit_log").insert({ ...e, success: true });
      if (r.error) throw new Error(r.error.message);
    },
  };
}
