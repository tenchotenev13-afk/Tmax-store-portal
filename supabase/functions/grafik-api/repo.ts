// supabase/functions/grafik-api/repo.ts
// Repo на grafik-api върху supabase-js със service ключа. Отделно от index.ts,
// за да се пуска и от repo.live-test.ts (без Deno.serve при импорт).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { HttpError, type AdminTable, type Repo, type RowRec, type Staff } from "./handler.ts";

// Само безопасни колони — никога password_hash / history_pin_hash.
const USER_COLS = "id,email,display_name,store_name,role,is_regional,assigned_stores,active";
const MONTH_COLS = "id,store_name,month,status,submitted_at,submitted_by,submitted_by_name,snapshot,updated_at";

// deno-lint-ignore no-explicit-any
type R = { data: any; error: { message: string; code?: string } | null };
// Нарушено ограничение (CHECK, FK, unique, NOT NULL) → 400 с текста от базата;
// всичко друго → 500 без подробности към клиента.
function ok<T = unknown>(r: R): T {
  if (r.error) {
    if (r.error.code && /^23/.test(r.error.code)) throw new HttpError(400, "db_constraint", r.error.message);
    throw new Error(r.error.message);
  }
  return r.data as T;
}

export function makeRepo(): Repo {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return {
    async getUser(id) {
      return ok(await db.from("users").select(USER_COLS).eq("id", id).maybeSingle());
    },
    async getSettings(keys) {
      const rows = ok<{ key: string; value: string }[]>(await db.from("app_settings").select("key,value").in("key", keys));
      const out: Record<string, string> = {};
      rows.forEach((r) => { out[r.key] = r.value; });
      return out;
    },
    async storeNames() {
      const rows = ok<{ name: string; active: boolean | null }[]>(await db.from("stores").select("name,active").order("name"));
      return rows.filter((r) => r.active !== false).map((r) => r.name);
    },
    async getMonth(store, month) {
      return ok(await db.from("grafik_months").select(MONTH_COLS).eq("store_name", store).eq("month", month).maybeSingle());
    },
    async ensureMonth(store, month) {
      ok(await db.from("grafik_months").upsert({ store_name: store, month }, { onConflict: "store_name,month", ignoreDuplicates: true }));
      return ok(await db.from("grafik_months").select(MONTH_COLS).eq("store_name", store).eq("month", month).single());
    },
    async updateMonth(id, fields, expectStatus) {
      const rows = ok<unknown[]>(await db.from("grafik_months").update(fields).eq("id", id).eq("status", expectStatus).select("id"));
      return rows.length > 0;
    },
    async listMonths(month, stores) {
      let q = db.from("grafik_months").select("id,store_name,month,status,submitted_at,submitted_by,submitted_by_name,updated_at").eq("month", month);
      if (stores) q = q.in("store_name", stores.length ? stores : ["—"]);
      return ok(await q);
    },
    async rowCounts(ids) {
      if (!ids.length) return {};
      const rows = ok<{ month_id: string }[]>(await db.from("grafik_rows").select("month_id").in("month_id", ids));
      const out: Record<string, number> = {};
      rows.forEach((r) => { out[r.month_id] = (out[r.month_id] || 0) + 1; });
      return out;
    },
    async listRows(monthId) {
      return ok<RowRec[]>(await db.from("grafik_rows").select("id,month_id,staff_id,letters,locked,sort_order,updated_at,updated_by").eq("month_id", monthId));
    },
    async upsertRows(rows) {
      ok(await db.from("grafik_rows").upsert(rows, { onConflict: "month_id,staff_id" }));
    },
    async listStaff(store) {
      return ok<Staff[]>(await db.from("grafik_staff").select("*").eq("store_name", store).order("sort_order").order("short_name"));
    },
    async staffCounts(stores) {
      let q = db.from("grafik_staff").select("store_name").is("left_on", null);
      if (stores) q = q.in("store_name", stores.length ? stores : ["—"]);
      const rows = ok<{ store_name: string }[]>(await q);
      const out: Record<string, number> = {};
      rows.forEach((r) => { out[r.store_name] = (out[r.store_name] || 0) + 1; });
      return out;
    },
    async getStaff(ids) {
      if (!ids.length) return [];
      return ok<Staff[]>(await db.from("grafik_staff").select("*").in("id", ids));
    },
    async insertStaff(fields) {
      return ok<Staff>(await db.from("grafik_staff").insert(fields).select("*").single());
    },
    async updateStaff(id, fields) {
      return ok<Staff | null>(await db.from("grafik_staff").update(fields).eq("id", id).select("*").maybeSingle());
    },
    async setupRaw(store) {
      const [sc, co, te, cd, se, lm, ex] = await Promise.all([
        db.from("grafik_store_company").select("*").eq("store_name", store),
        db.from("companies").select("id,name,eik,mol,addr"),
        db.from("grafik_company_terms").select("*"),
        db.from("grafik_vtr_codes").select("*"),
        db.from("grafik_vtr_seasons").select("*"),
        db.from("grafik_letter_map").select("*"),
        db.from("grafik_extra_days").select("day,store_name,note"),
      ]);
      return {
        storeCompany: ok(sc), companies: ok(co), terms: ok(te), codes: ok(cd),
        seasons: ok(se), letterMap: ok(lm),
        // всички обекти (NULL) + този; филтърът е тук, не в .or(), заради имената с интервал
        extraDays: ok<{ day: string; store_name: string | null; note: string | null }[]>(ex).filter((e) => !e.store_name || e.store_name === store),
      };
    },
    async letterSet() {
      const rows = ok<{ letter: string }[]>(await db.from("grafik_letter_map").select("letter"));
      return Array.from(new Set(rows.map((r) => r.letter)));
    },
    async adminList(table: AdminTable) {
      return ok(await db.from(table).select("*"));
    },
    async adminInsert(table, fields) {
      return ok(await db.from(table).insert(fields).select("*").single());
    },
    async adminUpdate(table, id, fields) {
      return ok(await db.from(table).update(fields).eq("id", id).select("*").maybeSingle());
    },
    async adminDelete(table, id) {
      const rows = ok<unknown[]>(await db.from(table).delete().eq("id", id).select("id"));
      return rows.length > 0;
    },
    async setStoreCompanyRef(store, companyId) {
      ok(await db.from("stores").update({ company_id: companyId }).eq("name", store));
    },
    async audit(e) {
      await db.from("audit_log").insert({ ...e, success: true });
    },
  };
}
