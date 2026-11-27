// supabase/functions/grafik-api/repo.ts
// Repo на grafik-api върху supabase-js със service ключа. Отделно от index.ts,
// за да се пуска и от repo.live-test.ts (без Deno.serve при импорт).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { hashSync, genSaltSync, compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { HttpError, type AccessRow, type AdminTable, type ChangeRow, type PinState, type Repo, type RowRec, type Sector, type Staff, type Vtr } from "./handler.ts";

// Само безопасни колони — никога password_hash / history_pin_hash.
const USER_COLS = "id,email,display_name,store_name,role,is_regional,assigned_stores,active";
// can_reset_pin — миграция grafik_zashtita (27.11.2026); прилага се ПРЕДИ деплоя.
const ACCESS_COLS = "id,list,email,note,can_reset_pin,created_at,created_by";
// grafik_pin без хеша (той — само в pinReserve, през функцията grafik_pin_reserve).
const PIN_COLS = "fails,locked_until,blocked,set_at,last_ok_at";
const MONTH_COLS ="id,store_name,month,status,submitted_at,submitted_by,submitted_by_name,snapshot,updated_at,approved_at,approved_by,approved_by_name,return_comment,returned_at,returned_by_name";   // approved_* / return* — етап Б (миграция grafik_approve)

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
    async changeStats(ids) {
      if (!ids.length) return {};
      const rows = ok<{ month_id: string; trz_done: boolean }[]>(await db.from("grafik_changes").select("month_id,trz_done").in("month_id", ids));
      const out: Record<string, { n: number; open: number }> = {};
      rows.forEach((r) => { const o = out[r.month_id] || (out[r.month_id] = { n: 0, open: 0 }); o.n++; if (!r.trz_done) o.open++; });
      return out;
    },
    async listChanges(monthId) {
      return ok<ChangeRow[]>(await db.from("grafik_changes").select("*").eq("month_id", monthId).order("day").order("created_at"));
    },
    async insertChange(fields) {
      return ok<ChangeRow>(await db.from("grafik_changes").insert(fields).select("*").single());
    },
    async updateChange(id, fields) {
      return ok<ChangeRow | null>(await db.from("grafik_changes").update(fields).eq("id", id).select("*").maybeSingle());
    },
    async deleteChange(id) {
      const rows = ok<unknown[]>(await db.from("grafik_changes").delete().eq("id", id).select("id"));
      return rows.length > 0;
    },
    async listAccess() {
      return ok<AccessRow[]>(await db.from("grafik_access").select(ACCESS_COLS).order("list").order("email"));
    },
    async insertAccess(fields) {
      return ok<AccessRow>(await db.from("grafik_access").insert(fields).select(ACCESS_COLS).single());
    },
    async updateAccess(id, fields) {
      return ok<AccessRow | null>(await db.from("grafik_access").update(fields).eq("id", id).select(ACCESS_COLS).maybeSingle());
    },
    async deleteAccess(id) {
      const rows = ok<unknown[]>(await db.from("grafik_access").delete().eq("id", id).select("id"));
      return rows.length > 0;
    },
    async vtrList() {
      return ok<Vtr[]>(await db.from("grafik_vtr").select("id,name").order("name"));
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
      // snapshot — за „извън нормата“ на подадените в обзора. Черновата е с null, освен върнатата с
      // пазено подаване (reopened / letters / staff — само за ТРЗ, handler.ts reopenedOf).
      let q = db.from("grafik_months").select(MONTH_COLS).eq("month", month);
      if (stores) q = q.in("store_name", stores.length ? stores : ["—"]);
      return ok(await q);
    },
    async rowStats(ids) {
      if (!ids.length) return {};
      const rows = ok<{ month_id: string; updated_at: string | null; updated_by: string | null }[]>(
        await db.from("grafik_rows").select("month_id,updated_at,updated_by").in("month_id", ids));
      const out: Record<string, { rows: number; last_at: string | null; last_by: string | null }> = {};
      rows.forEach((r) => {
        const o = out[r.month_id] || (out[r.month_id] = { rows: 0, last_at: null, last_by: null });
        o.rows++;
        if (r.updated_at && (!o.last_at || r.updated_at > o.last_at)) { o.last_at = r.updated_at; o.last_by = r.updated_by; }
      });
      return out;
    },
    async userNames(emails) {
      if (!emails.length) return {};
      const rows = ok<{ email: string; display_name: string | null }[]>(await db.from("users").select("email,display_name").in("email", emails));
      const out: Record<string, string> = {};
      rows.forEach((r) => { if (r.display_name) out[r.email.toLowerCase()] = r.display_name; });
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
    async staffDates(stores) {
      let q = db.from("grafik_staff").select("id,store_name,hired_on,left_on");
      if (stores) q = q.in("store_name", stores.length ? stores : ["—"]);
      return ok<{ id: string; store_name: string; hired_on: string | null; left_on: string | null }[]>(await q);
    },
    async monthLetters(ids) {
      if (!ids.length) return [];
      return ok(await db.from("grafik_rows").select("month_id,staff_id,letters").in("month_id", ids));
    },
    async monthChanges(ids) {
      if (!ids.length) return [];
      return ok(await db.from("grafik_changes").select("month_id,staff_id,day,actual").in("month_id", ids));
    },
    // Пакет 1, т.7 — активните потребители на обекта (само имейл и име) и писмото през resend-email.
    async storeUsers(store) {
      return ok(await db.from("users").select("email,display_name,active").eq("store_name", store));
    },
    async sendMail(to, subject, html) {
      try {
        const res = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/resend-email", {
          method: "POST",
          // resend-email е с verify_jwt: true — без този заглавен ред връща 401 (както в bulletin-notify).
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") },
          body: JSON.stringify({ type: "email", to, subject, html }),
        });
        if (!res.ok) console.error("resend-email HTTP " + res.status + ": " + (await res.text().catch(() => "")));
        return res.ok;
      } catch (e) { console.error("resend-email: " + ((e as Error).message || String(e))); return false; }
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
      const [sc, co, te, cd, se, lm, ex, secs] = await Promise.all([
        db.from("grafik_store_company").select("*").eq("store_name", store),
        db.from("companies").select("id,name,eik,mol,addr"),
        db.from("grafik_company_terms").select("*"),
        db.from("grafik_vtr_codes").select("*"),
        db.from("grafik_vtr_seasons").select("*"),
        db.from("grafik_letter_map").select("*"),
        db.from("grafik_extra_days").select("day,store_name,note"),
        db.from("grafik_sectors").select("id,store_name,name,sort_order,active,track_coverage").eq("store_name", store),
      ]);
      return {
        storeCompany: ok(sc), companies: ok(co), terms: ok(te), codes: ok(cd),
        seasons: ok(se), letterMap: ok(lm),
        // всички обекти (NULL) + този; филтърът е тук, не в .or(), заради имената с интервал
        extraDays: ok<{ day: string; store_name: string | null; note: string | null }[]>(ex).filter((e) => !e.store_name || e.store_name === store),
        sectors: ok<Sector[]>(secs),
      };
    },
    async getSector(id) {
      return ok<Sector | null>(await db.from("grafik_sectors").select("id,store_name,name,sort_order,active,track_coverage").eq("id", id).maybeSingle());
    },
    async insertSector(fields) {
      return ok<Sector>(await db.from("grafik_sectors").insert(fields).select("id,store_name,name,sort_order,active,track_coverage").single());
    },
    async updateSector(id, fields) {
      return ok<Sector | null>(await db.from("grafik_sectors").update(fields).eq("id", id).select("id,store_name,name,sort_order,active,track_coverage").maybeSingle());
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
    // ── Етап В: grafik_audit (повторното четене в същите 10 мин — dedup_key, on conflict do nothing).
    async gAudit(e) {
      if (e.dedup_key) ok(await db.from("grafik_audit").upsert(e, { onConflict: "dedup_key", ignoreDuplicates: true }));
      else ok(await db.from("grafik_audit").insert(e));
    },
    async auditList(q) {
      let x = db.from("grafik_audit").select("id,at,event,user_email,user_role,grafik_kind,store_name,month,success,details").gte("at", q.since);
      if (q.email) x = x.eq("user_email", q.email);
      if (q.store) x = x.eq("store_name", q.store);
      return ok(await x.order("at", { ascending: false }).limit(q.limit));
    },
    // ── Етап Б: grafik_pin. Хешът се чете само в pinReserve (за сравнението).
    async pinGet(userId) {
      return ok(await db.from("grafik_pin").select(PIN_COLS).eq("user_id", userId).maybeSingle());
    },
    async pinStates() {
      const rows = ok<(PinState & { user_id: string })[]>(await db.from("grafik_pin").select("user_id," + PIN_COLS));
      if (!rows.length) return [];
      const us = ok<{ id: string; email: string | null }[]>(await db.from("users").select("id,email").in("id", rows.map((r) => r.user_id)));
      const em: Record<string, string | null> = {};
      us.forEach((u) => { em[u.id] = u.email; });
      return rows.map((r) => ({ ...r, email: em[r.user_id] || null }));
    },
    async pinCreate(userId, hash) {
      ok(await db.from("grafik_pin").insert({ user_id: userId, pin_hash: hash }));
    },
    async pinReserve(userId) {
      const rows = ok<{ granted: boolean; pin_hash: string | null; fails: number; locked_until: string | null; blocked: boolean }[]>(
        await db.rpc("grafik_pin_reserve", { p_user: userId }));
      return rows && rows.length ? rows[0] : null;
    },
    async pinOk(userId) {
      ok(await db.from("grafik_pin").update({ fails: 0, locked_until: null, blocked: false, last_ok_at: new Date().toISOString() }).eq("user_id", userId));
    },
    async pinUpdateHash(userId, hash) {
      ok(await db.from("grafik_pin").update({ pin_hash: hash, set_at: new Date().toISOString() }).eq("user_id", userId));
    },
    async pinDelete(userId) {
      const rows = ok<unknown[]>(await db.from("grafik_pin").delete().eq("user_id", userId).select("user_id"));
      return rows.length > 0;
    },
    // bcrypt — същата библиотека като set-history-pin / auth-set-password; цена 10 (~100 ms).
    async hashPin(pin) { return hashSync(pin, genSaltSync(10)); },
    async checkPin(pin, hash) { try { return !!hash && compareSync(pin, hash); } catch { return false; } },
  };
}
