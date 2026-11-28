// supabase/functions/grafik-api/handler.test.ts
// deno test supabase/functions/grafik-api/handler.test.ts --allow-env
// База в паметта (MemRepo) — без мрежа. Проверява правата по вид × действие ×
// свой/чужд обект, пропуска, beta/ТРЗ списъците, клетките, снимката и валидността по дати.
import {
  handleGrafik, HttpError, accessEmails, parseMonth, resolveSetup, badCells, validAt, staffInMonth,
  snapshotOffNorm, sameAsPlanned, staleChanges, roleOf, activeInMonth, returnMail, PORTAL_URL, sofiaMonthStart,
  sofiaToday, shiftDate, inStoreWindow, markError, markActual, dailyReason, STORE_BACK_DAYS,
  type Repo, type User, type MonthRow, type RowRec, type Staff, type SetupRaw, type AdminTable, type Sector, type RowStat, type AccessRow, type ChangeRow,
  type GAuditEntry, type PinState, type DailyRow, type MarkRow, type DailySave,
} from "./handler.ts";
import { signSession } from "../_shared/session.ts";
import { signPinToken } from "./pin-token.ts";

Deno.env.set("PORTAL_SESSION_SECRET", "test-secret-" + "x".repeat(48));

function assert(c: unknown, msg: string): asserts c { if (!c) throw new Error(msg); }
function eq(a: unknown, b: unknown, msg: string) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(msg + " — очаквано " + y + ", получено " + x);
}

const VTR = "6a1d0000-0000-4000-8000-000000000001";
const C3 = "6a1d0000-0000-4000-8000-0000000000c3";
const CY = "6a1d0000-0000-4000-8000-0000000000a1";
let seq = 0;
const nid = () => "00000000-0000-4000-8000-" + String(++seq).padStart(12, "0");

const U: Record<string, User> = {
  admin:   { id: nid(), email: "ten.tenev@temax.bg", display_name: "Тенчо Тенев", store_name: "Централен офис", role: "admin", is_regional: false, assigned_stores: null, active: true },
  trz:     { id: nid(), email: "trz@temax.bg", display_name: "ТРЗ", store_name: "Централен офис", role: "admin", is_regional: false, assigned_stores: null, active: true },
  mgrK:    { id: nid(), email: "tencho.tenev13@gmail.com", display_name: "Управител Кърджали", store_name: "Кърджали", role: "manager", is_regional: false, assigned_stores: null, active: true },
  sklK:    { id: nid(), email: "sklad.k@temax.bg", display_name: "Склад Кърджали", store_name: "Кърджали", role: "sklad", is_regional: false, assigned_stores: null, active: true },
  regSh:   { id: nid(), email: "t.ivanova@temax.bg", display_name: "Регионален", store_name: "Централен офис", role: "accounting", is_regional: true, assigned_stores: ["Шумен", "Добрич"], active: true },
  admReg:  { id: nid(), email: "v.filev@temax.bg", display_name: "Админ регионален", store_name: "Централен офис", role: "admin", is_regional: true, assigned_stores: ["Шумен"], active: true },
  off:     { id: nid(), email: "off@temax.bg", display_name: "Неактивен", store_name: "Кърджали", role: "manager", is_regional: false, assigned_stores: null, active: false },
  outside: { id: nid(), email: "drug@temax.bg", display_name: "Извън списъка", store_name: "Кърджали", role: "manager", is_regional: false, assigned_stores: null, active: true },
};
const BETA = " Ten.Tenev@temax.bg, tencho.tenev13@gmail.com,trz@temax.bg , sklad.k@temax.bg, t.ivanova@temax.bg, v.filev@temax.bg, off@temax.bg ";

class MemRepo implements Repo {
  users = Object.values(U);
  // grafik_access: имейлите от BETA + ТРЗ (в базата CHECK пази малки букви — тук идват както са записани).
  access: AccessRow[] = ([] as AccessRow[]).concat(BETA.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).map((email) => ({ id: nid(), list: "beta" as const, email, note: null })),
    [{ id: nid(), list: "trz" as const, email: "trz@temax.bg", note: null }]);
  vtrs = [{ id: VTR, name: "ВТР ТЦД 3 / ТЦД 4 / Юг (01.11.2026)" }];
  stores = ["Кърджали", "Шумен", "Раднево", "Добрич"];
  months: MonthRow[] = [];
  rows: RowRec[] = [];
  changes: ChangeRow[] = [];
  staff: Staff[] = [];
  audits: { event: string; store_name: string | null }[] = [];
  storeRef: Record<string, string | null> = {};
  admin: Record<string, Record<string, unknown>[]> = {
    companies: [{ id: C3, name: "\"ТЕМАКС ТЪРГОВСКИ ЦЕНТЪР ЗА ДОМА 3\" ЕООД", eik: "207322431", mol: null, addr: "гр. Варна, ул. \"Блян\" 2" },
                { id: CY, name: "\"ТЕМАКС ЮГ\" ЕООД", eik: "202885071", mol: null, addr: null }],
    grafik_company_terms: [{ id: nid(), company_id: C3, vtr_id: VTR, approver: "Теодор Тенев", valid_from: null, valid_to: null },
                           { id: nid(), company_id: CY, vtr_id: VTR, approver: "Теодор Тенев", valid_from: null, valid_to: null }],
    grafik_store_company: [{ id: nid(), store_name: "Кърджали", company_id: C3, blank_name: "\"Темакс\" – КЪРДЖАЛИ", address: "гр. Кърджали", valid_from: null, valid_to: null },
                           { id: nid(), store_name: "Шумен", company_id: C3, blank_name: "\"Темакс\" - Шумен", address: null, valid_from: null, valid_to: null },
                           { id: nid(), store_name: "Раднево", company_id: CY, blank_name: "\"Темакс\" – Раднево", address: "гр. Раднево", valid_from: null, valid_to: null }],
    grafik_extra_days: [],
    // Като базата: при 8 ч. всяка буква има ред и за неделя („Н“).
    grafik_letter_map: ["З1", "Н"].flatMap((k) => ["ЛД", "ЗД", "П", "В", "М", "О4", "К", "О", "Б", "НО"].map((l) => ({ id: nid(), vtr_id: VTR, letter: l, day_kind: k, code: "x", valid_from: null, valid_to: null }))),
  };
  opened = 0;
  sectors: Sector[] = [
    { id: "5ec00000-0000-4000-8000-000000000001", store_name: "Кърджали", name: "Склад", sort_order: 30, active: true },
    { id: "5ec00000-0000-4000-8000-000000000002", store_name: "Кърджали", name: "Каса", sort_order: 10, active: true },
    { id: "5ec00000-0000-4000-8000-000000000003", store_name: "Кърджали", name: "Стар", sort_order: 5, active: false },
    { id: "5ec00000-0000-4000-8000-000000000004", store_name: "Шумен", name: "Каса", sort_order: 10, active: true },
  ];
  constructor() {
    for (const s of ["Кърджали", "Кърджали", "Шумен", "Раднево"]) {
      this.staff.push({ id: nid(), store_name: s, short_name: "ЛИЦЕ " + seq, full_name: "Лице " + seq, sort_order: 0, left_on: null });
    }
  }
  async getUser(id: string) { return this.users.filter((u) => u.id === id)[0] || null; }
  async changeStats(ids: string[]) { const o: Record<string, { n: number; open: number }> = {}; this.changes.forEach((c) => { if (ids.indexOf(c.month_id) < 0) return; const x = o[c.month_id] || (o[c.month_id] = { n: 0, open: 0 }); x.n++; if (!c.trz_done) x.open++; }); return o; }
  async listChanges(monthId: string) { return this.changes.filter((c) => c.month_id === monthId).map((c) => ({ ...c })); }
  async insertChange(f: Record<string, unknown>) { const c = { id: nid(), trz_done: false, ...f } as ChangeRow; this.changes.push(c); return { ...c }; }
  async updateChange(id: string, f: Record<string, unknown>) { const c = this.changes.filter((x) => x.id === id)[0]; if (!c) return null; Object.assign(c, f); return { ...c }; }
  async deleteChange(id: string) { const n = this.changes.length; this.changes = this.changes.filter((c) => c.id !== id); return this.changes.length < n; }
  // ── Пакет 2А: „✅ Днес“ — dailySave повтаря функцията grafik_daily_save (една транзакция).
  dailies: (DailyRow & { marks: MarkRow[] })[] = []; dailyCalls: DailySave[] = [];
  async getDaily(store: string, day: string) { const d = this.dailies.filter((x) => x.store_name === store && x.day === day)[0]; if (!d) return null; const { marks: _m, ...rest } = d; return { ...rest }; }
  async listMarks(id: string) { const d = this.dailies.filter((x) => x.id === id)[0]; return d ? d.marks.map((m) => ({ ...m })) : []; }
  async dailySave(p: DailySave) {
    this.dailyCalls.push(JSON.parse(JSON.stringify(p)));
    const mo = this.months.filter((m) => m.id === p.month_id && m.store_name === p.store_name && (m.status === "submitted" || m.status === "approved") && m.month === p.day.slice(0, 8) + "01")[0];
    if (!mo) throw new HttpError(409, "not_submitted", "Графикът вече не е подаден — презареди.");
    const now = new Date().toISOString(), dn = +p.day.slice(8, 10);
    let d = this.dailies.filter((x) => x.store_name === p.store_name && x.day === p.day)[0];
    if (!d) {
      d = { id: nid(), store_name: p.store_name, month_id: p.month_id, day: p.day, marked_by: p.actor, marked_by_name: p.actor_name, marked_at: now, late: p.late, marks: [],
        ...(p.correction ? { corrected_by: p.actor, corrected_by_name: p.actor_name, corrected_at: now, correct_reason: p.correction.reason } : {}) };
      this.dailies.push(d);
    } else {
      Object.assign(d, { updated_by: p.actor, updated_by_name: p.actor_name, updated_at: now },
        p.correction ? { corrected_by: p.actor, corrected_by_name: p.actor_name, corrected_at: now, correct_reason: p.correction.reason } : {});
    }
    this.changes = this.changes.filter((c) => !(c.month_id === p.month_id && c.day === dn && p.changes_delete.indexOf(c.id) >= 0));
    for (const c of p.changes_upsert) {
      const cur = this.changes.filter((x) => x.month_id === p.month_id && x.staff_id === c.staff_id && x.day === dn)[0];
      if (cur) Object.assign(cur, c, { source: "daily", updated_by: p.actor, updated_at: now });
      else this.changes.push({ id: nid(), month_id: p.month_id, day: dn, trz_done: false, ...c, source: "daily", created_by: p.actor, updated_by: p.actor, created_at: now, updated_at: now });
    }
    d.marks = p.marks.map((m) => ({ ...m, change_id: (this.changes.filter((c) => c.month_id === p.month_id && c.staff_id === m.staff_id && c.day === dn)[0] || { id: null }).id, marked_by: p.actor, marked_at: now }));
    return d.id;
  }
  async listAccess() { return this.access.slice(); }
  async insertAccess(f: Record<string, unknown>) { const r = { id: nid(), note: null, ...f } as AccessRow; this.access.push(r); return r; }
  async updateAccess(id: string, f: Record<string, unknown>) { const x = this.access.filter((a) => a.id === id)[0]; if (!x) return null; Object.assign(x, f); return { ...x }; }
  async deleteAccess(id: string) { const n = this.access.length; this.access = this.access.filter((r) => r.id !== id); return this.access.length < n; }
  async vtrList() { return this.vtrs.slice(); }
  async storeNames() { return this.stores.slice(); }
  async getMonth(store: string, month: string) { return this.months.filter((m) => m.store_name === store && m.month === month)[0] || null; }
  async ensureMonth(store: string, month: string) {
    const cur = await this.getMonth(store, month);
    if (cur) return cur;
    const m: MonthRow = { id: nid(), store_name: store, month, status: "draft", submitted_at: null, submitted_by: null, submitted_by_name: null, snapshot: null };
    this.months.push(m); return m;
  }
  async updateMonth(id: string, f: Partial<MonthRow>, expect: string) {
    const m = this.months.filter((x) => x.id === id && x.status === expect)[0];
    if (!m) return false; Object.assign(m, f); return true;
  }
  async listMonths(month: string, stores: string[] | null) { return this.months.filter((m) => m.month === month && (!stores || stores.indexOf(m.store_name) >= 0)); }
  async rowStats(ids: string[]) {
    const o: Record<string, RowStat> = {};
    this.rows.forEach((r) => {
      if (ids.indexOf(r.month_id) < 0) return;
      const s = o[r.month_id] || (o[r.month_id] = { rows: 0, last_at: null, last_by: null });
      s.rows++;
      if (r.updated_at && (!s.last_at || r.updated_at > s.last_at)) { s.last_at = r.updated_at; s.last_by = r.updated_by || null; }
    });
    return o;
  }
  async userNames(emails: string[]) { const o: Record<string, string> = {}; this.users.forEach((u) => { if (emails.indexOf(u.email.toLowerCase()) >= 0 && u.display_name) o[u.email.toLowerCase()] = u.display_name; }); return o; }
  async listRows(monthId: string) { return this.rows.filter((r) => r.month_id === monthId); }
  async upsertRows(rows: RowRec[]) {
    for (const r of rows) {
      const cur = this.rows.filter((x) => x.month_id === r.month_id && x.staff_id === r.staff_id)[0];
      if (cur) Object.assign(cur, r); else this.rows.push({ ...r });
    }
  }
  async listStaff(store: string) { return this.staff.filter((s) => s.store_name === store); }
  async staffDates(stores: string[] | null) { return this.staff.filter((s) => !stores || stores.indexOf(s.store_name) >= 0).map((s) => ({ id: s.id, store_name: s.store_name, hired_on: (s.hired_on as string) || null, left_on: (s.left_on as string) || null })); }
  async monthLetters(ids: string[]) { return this.rows.filter((x) => ids.indexOf(x.month_id) >= 0).map((x) => ({ month_id: x.month_id, staff_id: x.staff_id, letters: x.letters })); }
  async monthChanges(ids: string[]) { return this.changes.filter((c) => ids.indexOf(c.month_id) >= 0).map((c) => ({ month_id: c.month_id, staff_id: c.staff_id, day: c.day, actual: c.actual })); }
  // Пакет 1, т.7 — писмата (вместо resend-email); mailOk = false — пада.
  mails: { to: string[]; subject: string; html: string }[] = []; mailOk = true;
  async storeUsers(store: string) { return this.users.filter((u) => u.store_name === store).map((u) => ({ email: u.email, display_name: u.display_name, active: u.active })); }
  async sendMail(to: string[], subject: string, html: string) { if (!this.mailOk) return false; this.mails.push({ to, subject, html }); return true; }
  async getStaff(ids: string[]) { return this.staff.filter((s) => ids.indexOf(s.id) >= 0); }
  async insertStaff(f: Record<string, unknown>) { const s = { id: nid(), ...f } as Staff; this.staff.push(s); return s; }
  async updateStaff(id: string, f: Record<string, unknown>) { const s = this.staff.filter((x) => x.id === id)[0]; if (!s) return null; Object.assign(s, f); return s; }
  async setupRaw(store: string): Promise<SetupRaw> {
    return {
      storeCompany: this.admin.grafik_store_company.filter((r) => r.store_name === store) as SetupRaw["storeCompany"],
      companies: this.admin.companies as SetupRaw["companies"],
      terms: this.admin.grafik_company_terms as SetupRaw["terms"],
      codes: [
        { vtr_id: VTR, code: "Д5/З", hours: 10.5, kind: "work", seasons: ["З"], legend: null, sort_order: 50, valid_from: "2026-11-01", valid_to: null },
        { vtr_id: VTR, code: "Д7", hours: 8, kind: "work", seasons: null, legend: null, sort_order: 75, valid_from: null, valid_to: "2026-10-31" },
        { vtr_id: VTR, code: "Д1/З", hours: 8, kind: "work", seasons: ["З"], legend: null, sort_order: 11, valid_from: null, valid_to: null },
      ],
      seasons: [
        { vtr_id: VTR, months: { "1": "З2", "2": "З2", "3": "З2", "4": "Л", "5": "Л", "6": "Л", "7": "Л", "8": "Л", "9": "Л", "10": "Л", "11": "З2", "12": "З2" }, valid_from: null, valid_to: "2026-10-31", labels: { "Л": "Лято (до 20:00)", "З2": "Зима (до 19:00)" } },
        { vtr_id: VTR, months: { "1": "З2", "2": "З2", "3": "З1", "4": "З1", "5": "Л", "6": "Л", "7": "Л", "8": "Л", "9": "Л", "10": "Л", "11": "З1", "12": "З1" }, valid_from: "2026-11-01", valid_to: null, labels: { "Л": "Лято (до 20:00)", "З1": "Зима 1 (до 19:30)", "З2": "Зима 2 (до 19:00)" } },
      ],
      letterMap: this.admin.grafik_letter_map as SetupRaw["letterMap"],
      extraDays: (this.admin.grafik_extra_days as SetupRaw["extraDays"]).filter((e) => !e.store_name || e.store_name === store),
      sectors: this.sectors.filter((x) => x.store_name === store),
    };
  }
  async getSector(id: string) { return this.sectors.filter((x) => x.id === id)[0] || null; }
  async updateSector(id: string, f: Record<string, unknown>) { const x = this.sectors.filter((s) => s.id === id)[0]; if (!x) return null; Object.assign(x, f); return x; }
  async insertSector(f: Record<string, unknown>) {
    if (this.sectors.some((x) => x.store_name === f.store_name && x.name.toLowerCase() === String(f.name).toLowerCase())) {
      throw new HttpError(400, "db_constraint", "duplicate key value violates unique constraint");
    }
    const x = { id: nid(), active: true, ...f } as Sector; this.sectors.push(x); return x;
  }
  async letterSet() { return Array.from(new Set(this.admin.grafik_letter_map.map((r) => r.letter as string))); }
  async adminList(t: AdminTable) { return this.admin[t]; }
  async adminInsert(t: AdminTable, f: Record<string, unknown>) { const r = { id: nid(), ...f }; this.admin[t].push(r); return r; }
  async adminUpdate(t: AdminTable, id: string, f: Record<string, unknown>) { const r = this.admin[t].filter((x) => x.id === id)[0]; if (!r) return null; Object.assign(r, f); return r; }
  async adminDelete(t: AdminTable, id: string) { const n = this.admin[t].length; this.admin[t] = this.admin[t].filter((x) => x.id !== id); return this.admin[t].length < n; }
  async setStoreCompanyRef(store: string, c: string | null) { this.storeRef[store] = c; }
  async audit(e: { event: string; store_name: string | null }) { this.audits.push(e); }
  // ── Етап В: grafik_audit (dedup_key — като unique индекса в базата).
  gaudits: (GAuditEntry & { at: string })[] = [];
  async gAudit(e: GAuditEntry) { if (e.dedup_key && this.gaudits.some((x) => x.dedup_key === e.dedup_key)) return; this.gaudits.push({ ...e, at: new Date().toISOString() }); }
  async auditList(q: { since: string; email: string | null; store: string | null; limit: number }) {
    return this.gaudits.filter((e) => e.at >= q.since && (!q.email || e.user_email === q.email) && (!q.store || e.store_name === q.store))
      .slice().reverse().slice(0, q.limit).map((e, i) => ({ ...e, id: i + 1 }));
  }
  // ── Етап Б: grafik_pin. pinReserve повтаря логиката на SQL функцията grafik_pin_reserve.
  pins: Record<string, PinState & { hash: string }> = {};
  async pinGet(u: string) { const p = this.pins[u]; if (!p) return null; const { hash: _h, ...rest } = p; return { ...rest }; }
  async pinStates() { return Object.keys(this.pins).map((u) => { const { hash: _h, ...rest } = this.pins[u]; return { ...rest, user_id: u, email: (this.users.filter((x) => x.id === u)[0] || { email: null }).email }; }); }
  async pinCreate(u: string, hash: string) {
    if (this.pins[u]) throw new HttpError(400, "db_constraint", "duplicate key value violates unique constraint");
    this.pins[u] = { hash, fails: 0, locked_until: null, blocked: false, set_at: new Date().toISOString(), last_ok_at: null };
  }
  async pinReserve(u: string) {
    const p = this.pins[u]; if (!p) return null;
    if (p.blocked || (p.locked_until && Date.parse(p.locked_until) > Date.now())) return { granted: false, pin_hash: null, fails: p.fails, locked_until: p.locked_until, blocked: p.blocked };
    p.fails++; p.blocked = p.fails >= 10;
    if (p.fails === 5) p.locked_until = new Date(Date.now() + 15 * 60000).toISOString();
    return { granted: true, pin_hash: p.hash, fails: p.fails, locked_until: p.locked_until, blocked: p.blocked };
  }
  async pinOk(u: string) { const p = this.pins[u]; if (p) Object.assign(p, { fails: 0, locked_until: null, blocked: false, last_ok_at: new Date().toISOString() }); }
  async pinUpdateHash(u: string, hash: string) { const p = this.pins[u]; if (p) Object.assign(p, { hash, set_at: new Date().toISOString() }); }
  async pinDelete(u: string) { const had = !!this.pins[u]; delete this.pins[u]; return had; }
  async hashPin(pin: string) { return "h:" + pin; }
  async checkPin(pin: string, hash: string) { return hash === "h:" + pin; }
}

// По подразбиране заявката носи и валиден ключ за ПИН-а (етап Б) за същото влизане — за да
// тестват старите проверки правата, не ПИН-а. pin: false — без ключ; pin: "низ" — точно този.
const iatOf = (tok: string) => JSON.parse(atob(tok.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).iat as number;
// Пакет 2А: обектът пипа „Промени“ само днес и 2 дни назад. Старите тестове на „Промени“ проверяват други
// правила — за тях часовникът е денят на промяната (12:00 в София), освен ако тестът не даде now сам.
export function dayClock(ym: string, day: number): number { return Math.floor(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, day, 10) / 1000); }
function autoNow(repo: MemRepo, body: Record<string, unknown>): number | undefined {
  if (typeof body.month !== "string") return undefined;
  if (body.action === "changes_save" && typeof body.day === "number" && body.day >= 1 && body.day <= 31) {
    const cur = typeof body.id === "string" ? repo.changes.filter((c) => c.id === body.id)[0] : null;
    return dayClock(body.month, Math.max(body.day, cur ? cur.day : 0));
  }
  if (body.action === "changes_delete") { const c = repo.changes.filter((x) => x.id === body.id)[0]; return c ? dayClock(body.month, c.day) : undefined; }
  return undefined;
}
async function call(repo: MemRepo, who: User | null, body: Record<string, unknown>, opts: { session?: unknown; method?: string; now?: number; pin?: boolean | string } = {}) {
  if (opts.now === undefined) { const a = autoNow(repo, body); if (a !== undefined) opts = { ...opts, now: a }; }
  const session = "session" in opts ? opts.session : who ? await signSession({ uid: who.id, role: who.role || "", email: who.email }, opts.now) : undefined;
  const nowS = opts.now ?? Math.floor(Date.now() / 1000);
  const pin_token = typeof opts.pin === "string" ? opts.pin
    : opts.pin === false || !who || typeof session !== "string" ? undefined
    : (await signPinToken(who.id, iatOf(session), nowS)).token;
  const req = new Request("http://x/grafik-api", {
    method: opts.method || "POST", headers: { "Content-Type": "application/json" },
    body: (opts.method || "POST") === "POST" ? JSON.stringify({ ...body, session, ...(pin_token ? { pin_token } : {}) }) : undefined,
  });
  const res = await handleGrafik(req, () => { repo.opened++; return repo; }, opts.now);
  return { status: res.status, body: res.status === 200 && (opts.method === "OPTIONS") ? null : await res.json().catch(() => null) };
}
const kStaff = (r: MemRepo, store = "Кърджали") => r.staff.filter((s) => s.store_name === store).map((s) => s.id);
const L30 = (fill: string[] = []) => { const a = new Array(30).fill(""); fill.forEach((v, i) => { a[i] = v; }); return a; };

// ── Чисти функции ─────────────────────────────────────────────────────────
Deno.test("accessEmails: по списък, малки букви", () => {
  const rows = [{ id: "1", list: "beta", email: "A@x.bg ", note: null }, { id: "2", list: "trz", email: "t@x.bg", note: null }] as AccessRow[];
  eq([accessEmails(rows, "beta"), accessEmails(rows, "trz"), accessEmails([], "beta")], [["a@x.bg"], ["t@x.bg"], []], "разделяне по list");
});

Deno.test("parseMonth: дни, предходен месец, високосна, невалидни", () => {
  eq(parseMonth("2026-11"), { start: "2026-11-01", end: "2026-11-30", days: 30, prev: "2026-10" }, "ноември");
  eq(parseMonth("2027-01")!.prev, "2026-12", "януари → декември предходната година");
  eq(parseMonth("2028-02")!.days, 29, "2028 е високосна");
  eq(parseMonth("2027-02")!.days, 28, "2027 не е");
  for (const bad of ["2026-13", "2026-1", "26-11", "2026-11-01", 202611, null]) assert(parseMonth(bad) === null, "прие " + bad);
});

Deno.test("validAt / resolveSetup: кодове и сезон към месеца", async () => {
  const r = new MemRepo();
  const raw = await r.setupRaw("Кърджали");
  const nov = resolveSetup(raw, "2026-11-01", "2026-11-30");
  eq(nov.codes.map((c) => c.code), ["Д1/З", "Д5/З"], "ноември: без Д7, с Д5/З, по sort_order");
  eq(nov.season, "З1", "ноември 2026 = З1");
  eq(nov.missing, [], "Кърджали има всичко");
  eq(nov.approver, "Теодор Тенев", "утвърдил");
  const raw2 = { ...raw, letterMap: raw.letterMap.concat([{ vtr_id: VTR, letter: "П", day_kind: "З1", code: "Д5/1", hours_per_day: 4, valid_from: null, valid_to: null }]) };
  const lm4 = resolveSetup(raw2, "2026-11-01", "2026-11-30").letter_map.filter((l) => l.hours_per_day === 4);
  eq(lm4, [{ letter: "П", day_kind: "З1", code: "Д5/1", hours_per_day: 4 }], "буквите по договор стигат до браузъра");
  eq(nov.letter_map.every((l) => l.hours_per_day === null), true, "общите редове — hours_per_day null");
  const oct = resolveSetup(raw, "2026-10-01", "2026-10-31");
  eq(oct.codes.map((c) => c.code), ["Д1/З", "Д7"], "октомври: с Д7, без Д5/З");
  eq(oct.season, "Л", "октомври = Л");
  eq(resolveSetup(raw, "2026-04-01", "2026-04-30").season, "Л", "април 2026 (стар ВТР) = Л");
  eq(resolveSetup(raw, "2027-04-01", "2027-04-30").season, "З1", "април 2027 (нов ВТР) = З1");
  eq(resolveSetup(raw, "2027-01-01", "2027-01-31").season, "З2", "януари 2027 = З2");
  const rad = resolveSetup(await r.setupRaw("Раднево"), "2026-11-01", "2026-11-30");
  eq(rad.missing, ["адрес на дружеството"], "Раднево: липсва адрес на Темакс Юг");
  const none = resolveSetup(await r.setupRaw("Добрич"), "2026-11-01", "2026-11-30");
  eq(none.missing, ["обект → дружество"], "Добрич: без дружество");
  assert(validAt({ valid_from: "2026-11-01", valid_to: null }, "2026-11-01"), "граница от — включена");
  assert(validAt({ valid_from: null, valid_to: "2026-10-31" }, "2026-10-31"), "граница до — включена");
  assert(!validAt({ valid_from: null, valid_to: "2026-10-31" }, "2026-11-01"), "след до");
});

Deno.test("badCells: букви, свободни часове 1–12, извън месеца", () => {
  const ok = ["П", "ЛД"];
  eq(badCells(["П", "", "ЛД", "9", "12", "1"], 30, ok), [], "валидни");
  eq(badCells(["П", "0", "13", "1.5", "Х", 5], 30, ok), ["2: „0“", "3: „13“", "4: „1.5“", "5: „Х“", "6: не е текст"], "невалидни поотделно");
  const a = new Array(31).fill(""); a[30] = "П";
  eq(badCells(a, 30, ok), ["31: денят не е в месеца"], "31-ви при 30 дни");
  a[30] = ""; eq(badCells(a, 30, ok), [], "празен 31-ви е позволен");
  assert(badCells(new Array(32).fill(""), 30, ok) === null, "32 елемента");
  assert(badCells("П", 30, ok) === null, "не масив");
});

// ── Пропуск и списъци ─────────────────────────────────────────────────────
Deno.test("без пропуск / подправен / изтекъл → 401 и базата НЕ се отваря", async () => {
  const r = new MemRepo();
  for (const s of [undefined, "", "abc.def", 42]) {
    const x = await call(r, null, { action: "me" }, { session: s });
    eq([x.status, x.body.reason], [401, "session_expired"], "пропуск " + String(s));
  }
  const tok = await signSession({ uid: U.admin.id, role: "admin", email: U.admin.email });
  const later = Math.floor(Date.now() / 1000) + 13 * 3600;
  const x = await call(r, null, { action: "me" }, { session: tok, now: later });
  eq(x.status, 401, "изтекъл след 12 ч.");
  const forged = tok.split(".")[0] + "." + "A".repeat(43);
  eq((await call(r, null, { action: "me" }, { session: forged })).status, 401, "чужд подпис");
  eq(r.opened, 0, "базата не е отворена нито веднъж");
});

Deno.test("ролята е от базата, не от пропуска", async () => {
  const r = new MemRepo();
  const tok = await signSession({ uid: U.sklK.id, role: "admin", email: U.sklK.email }); // пропуск с „admin“
  const x = await call(r, null, { action: "me" }, { session: tok });
  eq(x.body.kind, "viewer", "склад си остава viewer");
});

Deno.test("неактивен, извън beta, непознат → 403", async () => {
  const r = new MemRepo();
  eq((await call(r, U.off, { action: "me" })).body.reason, "inactive", "неактивен");
  eq((await call(r, U.outside, { action: "me" })).body.reason, "not_beta", "извън beta");
  const ghost = { ...U.admin, id: "99999999-0000-4000-8000-000000000000" };
  eq((await call(r, ghost, { action: "me" })).status, 403, "няма го в users");
  r.access = r.access.filter((x) => !(x.list === "beta" && x.email !== "ten.tenev@temax.bg"));
  eq((await call(r, U.mgrK, { action: "me" })).body.reason, "not_beta", "махнат от beta → веднага без достъп");
  r.access = [];
  eq((await call(r, U.admin, { action: "me" })).body.reason, "not_beta", "празна grafik_access → никой");
});

Deno.test("me: вид и видими обекти за всеки", async () => {
  const r = new MemRepo();
  const me = async (u: User) => (await call(r, u, { action: "me" })).body;
  const a = await me(U.admin); eq([a.kind, a.stores.length, a.can_admin], ["admin", 4, true], "admin");
  const t = await me(U.trz); eq([t.kind, t.stores.length, t.can_admin, t.stores.some((s: { can_edit: boolean }) => s.can_edit)], ["trz", 4, false, false], "ТРЗ (role admin) — само чете");
  const m = await me(U.mgrK); eq([m.kind, m.stores], ["manager", [{ name: "Кърджали", can_edit: true, in_scope: true }]], "manager");
  const v = await me(U.sklK); eq([v.kind, v.stores], ["viewer", [{ name: "Кърджали", can_edit: false, in_scope: true }]], "склад");
  const g = await me(U.regSh); eq([g.kind, g.stores.map((s: { name: string }) => s.name), g.can_reopen], ["regional", ["Шумен", "Добрич"], true], "регионален");
  const ar = await me(U.admReg); eq([ar.kind, ar.can_admin, ar.stores.length], ["regional", false, 4], "admin с is_regional → регионален (пакет 1, т.8): чете всички");
});

// ── Матрица чете / пише ──────────────────────────────────────────────────
Deno.test("load_month: свой/чужд обект по вид", async () => {
  const r = new MemRepo();
  const st = async (u: User, store: string) => (await call(r, u, { action: "load_month", store, month: "2026-11" })).status;
  eq(await st(U.mgrK, "Кърджали"), 200, "manager — своя");
  eq(await st(U.mgrK, "Шумен"), 403, "manager — чужд");
  eq(await st(U.sklK, "Кърджали"), 200, "склад — своя");
  eq(await st(U.sklK, "Раднево"), 403, "склад — чужд");
  eq(await st(U.regSh, "Шумен"), 200, "регионален — свой");
  eq(await st(U.regSh, "Кърджали"), 403, "регионален — чужд");
  eq(await st(U.admin, "Раднево"), 200, "admin — всеки");
  eq(await st(U.admin, "Няма такъв"), 400, "непознат обект");
  eq((await call(r, U.admin, { action: "load_month", store: "Кърджали", month: "2026-13" })).status, 400, "лош месец");
  const x = (await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq([x.days, x.status, x.can_edit, x.staff.length, x.setup.season], [30, "draft", true, 2, "З1"], "съдържание");
  const y = (await call(r, U.sklK, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq(y.can_edit, false, "склад не пише");
});

Deno.test("save_rows: кой може да пише", async () => {
  const r = new MemRepo();
  const ids = kStaff(r);
  const save = async (u: User, store: string, sid = ids[0]) =>
    (await call(r, u, { action: "save_rows", store, month: "2026-11", rows: [{ staff_id: sid, letters: L30(["П"]) }] })).body;
  eq((await save(U.mgrK, "Кърджали")).ok, true, "manager — своя");
  eq((await save(U.sklK, "Кърджали")).reason, "readonly", "склад");
  eq((await save(U.trz, "Кърджали")).reason, "readonly", "ТРЗ (role admin) не пише");
  eq((await save(U.regSh, "Кърджали")).reason, "readonly", "регионален — чужд");
  const sh = kStaff(r, "Шумен")[0];
  eq((await save(U.regSh, "Шумен", sh)).ok, true, "регионален — свой");
  eq((await save(U.admin, "Раднево", kStaff(r, "Раднево")[0])).ok, true, "admin");
  eq((await save(U.mgrK, "Кърджали", sh)).message, "Служител не е от този обект.", "служител от друг обект");
});

Deno.test("save_rows: клетки — изрична грешка, нищо не се записва наполовина", async () => {
  const r = new MemRepo();
  const [a, b] = kStaff(r);
  const x = await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [
    { staff_id: a, letters: L30(["П", "9", "ЛД"]) },
    { staff_id: b, letters: L30(["Х", "", "13"]) },
  ] });
  eq([x.status, x.body.reason], [400, "bad_cells"], "отказ");
  eq(x.body.errors, [{ staff_id: b, cells: ["1: „Х“", "3: „13“"] }], "по клетка");
  eq([r.rows.length, r.months.length], [0, 0], "нищо не е записано, месец не е създаден");
  const y = await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: a, letters: L30(["П", "9", "ЛД"]), locked: { "3": "Д4/З" } }] });
  eq(y.body.saved, 1, "свободни часове „9“ се приемат");
  eq([r.rows[0].letters[1], r.rows[0].locked, r.rows[0].updated_by], ["9", { "3": "Д4/З" }, "tencho.tenev13@gmail.com"], "записът");
  const z = await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: a, letters: L30(), locked: { "31": "Д1" } }] });
  eq(z.status, 400, "заключен 31-ви в 30-дневен месец");
  const d = await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: a, letters: L30() }, { staff_id: a, letters: L30() }] });
  eq(d.status, 400, "един служител два пъти");
});

// ── Подаване, ТРЗ, връщане ───────────────────────────────────────────────
async function filled(r: MemRepo, store = "Кърджали", who = U.mgrK) {
  const ids = kStaff(r, store);
  await call(r, who, { action: "save_rows", store, month: "2026-11", rows: ids.map((id) => ({ staff_id: id, letters: L30(["П"]) })) });
  return ids;
}
const snap = (ids: string[], days = 30) => ({ rows: ids.map((id) => ({ staff_id: id, codes: new Array(days).fill(""), official: 168, target: 168, diff: 0, norm: 168 } as Record<string, unknown>)),
  header: { company_name: "ФАЛШИВО", approver: "Някой друг", compiled_by: "Хакер" } });

Deno.test("submit: снимка, заглавка от сървъра, после заключено", async () => {
  const r = new MemRepo();
  const ids = await filled(r);
  eq((await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids.slice(0, 1)) })).body.reason, "bad_snapshot", "липсващ ред");
  eq((await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids, 31) })).body.reason, "bad_snapshot", "31 кода при 30 дни");
  eq((await call(r, U.sklK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids) })).body.reason, "readonly", "склад не подава");
  const x = await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids) });
  eq([x.status, x.body.status, x.body.submitted_by_name], [200, "submitted", "Управител Кърджали"], "подаден");
  const h = (r.months[0].snapshot as { header: Record<string, unknown> }).header;
  eq([h.company_name, h.approver, h.compiled_by, h.season], ["\"ТЕМАКС ТЪРГОВСКИ ЦЕНТЪР ЗА ДОМА 3\" ЕООД", "Теодор Тенев", "Управител Кърджали", "З1"], "заглавката е от базата, не от клиента");
  eq(r.audits.map((a) => a.event), ["grafik_submit"], "audit");
  eq((await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30() }] })).body.reason, "submitted", "подаден → без промени");
  eq((await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids) })).body.reason, "submitted", "втори път");
  eq((await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" })).body.can_edit, false, "екранът знае, че е заключен");
});

Deno.test("submit: ред на служител, изкаран от месеца след въвеждането, не се иска в снимката", async () => {
  const r = new MemRepo();
  const ids = await filled(r);
  r.staff.filter((s) => s.id === ids[1])[0].left_on = "2026-10-31";        // напуснал преди ноември
  eq((await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids) })).body.reason, "bad_snapshot", "с него — отказ (не е в графика)");
  const x = await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap([ids[0]]) });
  eq([x.status, x.body.status], [200, "submitted"], "без него — подаден");
  r.staff.push({ id: nid(), store_name: "Кърджали", short_name: "Х", full_name: "Х", hired_on: "2026-12-01", left_on: null });
});

Deno.test("staffInMonth: граници", () => {
  eq([staffInMonth({ left_on: "2026-11-01" }, "2026-11-01", "2026-11-30"), staffInMonth({ left_on: "2026-10-31" }, "2026-11-01", "2026-11-30"),
      staffInMonth({ hired_on: "2026-11-30" }, "2026-11-01", "2026-11-30"), staffInMonth({ hired_on: "2026-12-01" }, "2026-11-01", "2026-11-30"), staffInMonth({}, "2026-11-01", "2026-11-30")],
     [true, false, true, false, true], "напуснал на 1-ви е в месеца; назначен на последния — също");
});

// „Подай" спира (решение 04.11.2026, вариант а) — и на сървъра, не само в браузъра.
const sub = (r: MemRepo, s: unknown) => call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: s });
const nm = (r: MemRepo, id: string) => String(r.staff.filter((s) => s.id === id)[0].full_name);

Deno.test("submit: извън нормата → 409 off_norm със списъка и подсказката; нищо не се записва", async () => {
  const r = new MemRepo();
  const ids = await filled(r);
  const s = snap(ids);
  Object.assign(s.rows[0], { official: 40, target: 168, diff: -128 });
  const x = await sub(r, s);
  eq([x.status, x.body.reason], [409, "off_norm"], "отказ");
  eq(x.body.issues, [nm(r, ids[0]) + ": 40 ч. вместо 168 ч."], "кой и с колко");
  eq(x.body.hint, "Сложи кодове за дните или О/Б/Н; ако човекът не работи този месец — сложи му „Назначен на“ / „Напуснал на“ в 👥 Персонал.", "подсказката");
  assert(String(x.body.message).indexOf(nm(r, ids[0]) + ": 40 ч. вместо 168 ч.") >= 0 && String(x.body.message).indexOf("„Назначен на“ / „Напуснал на“ в 👥 Персонал") >= 0, "съобщението носи и двете");
  eq([r.months[0].status, r.months[0].snapshot, r.audits.length], ["draft", null, 0], "месецът остава чернова");
  Object.assign(s.rows[0], { official: 168.5, diff: 0.5 });
  eq((await sub(r, s)).body.issues, [nm(r, ids[0]) + ": 168,5 ч. вместо 168 ч."], "и над нормата, с десетична запетая");
});

Deno.test("submit: празен ред, липсващ ред и свободни часове → 409; норма 0 → минава", async () => {
  const r = new MemRepo();
  const ids = await filled(r);
  // Празен ред (записан, без букви) у първия; свободни часове „9“ на 05.11 у втория.
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30() }, { staff_id: ids[1], letters: L30(["П", "", "", "", "9"]) }] });
  // Нов служител без ред изобщо.
  const newId = nid();
  r.staff.push({ id: newId, store_name: "Кърджали", short_name: "НОВ", full_name: "Нов Новев", sort_order: 0, left_on: null, hired_on: "2026-11-16" });
  const s = snap([...ids, newId]);
  s.rows[2].norm = 88;
  const x = await sub(r, s);
  eq([x.status, x.body.reason], [409, "off_norm"], "отказ");
  eq(x.body.issues, [
    nm(r, ids[0]) + ": редът в графика е празен (0 ч. вместо 168 ч.)",
    nm(r, ids[1]) + ": 05.11 — написано е число 9, избери смяна (П, ЛД…)",
    "Нов Новев: няма ред в графика за месеца (0 ч. вместо 88 ч.)",
  ], "трите — с имената");
  eq((await sub(r, snap(ids))).body.reason, "bad_snapshot", "човек без ред не може просто да изпадне от снимката");
  // Норма 0 (назначен след последния работен ден) — празен ред не спира; поправените — минава.
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30(["П"]) }, { staff_id: ids[1], letters: L30(["П"]) }] });
  s.rows[2].norm = 0;
  const ok = await sub(r, s);
  eq([ok.status, ok.body.status], [200, "submitted"], "подаден");
});

Deno.test("submit: ЛД в неделя → 409 с деня; ЛД в делник и ЗД в неделя — не (05.11.2026)", async () => {
  const r = new MemRepo();
  const ids = await filled(r);
  // Ноември 2026: 1.11 и 8.11 са неделя, 2.11 — понеделник.
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [
    { staff_id: ids[0], letters: L30(["ЛД", "ЛД", "", "", "", "", "", "ЛД"]) },
    { staff_id: ids[1], letters: L30(["ЗД", "ЛД"]) },
  ] });
  const x = await sub(r, snap(ids));
  eq([x.status, x.body.reason], [409, "off_norm"], "отказ");
  eq(x.body.issues, [nm(r, ids[0]) + ": ЛД в неделя на 01.11 — ползвай ЗД", nm(r, ids[0]) + ": ЛД в неделя на 08.11 — ползвай ЗД"], "само неделите с ЛД, с датите");
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30(["ЗД", "ЛД", "", "", "", "", "", "ЗД"]) }] });
  eq((await sub(r, snap(ids))).status, 200, "сменено на ЗД → подаден");
});

Deno.test("submit: снимка без часовете → bad_snapshot (не се приема мълчаливо като 0)", async () => {
  const r = new MemRepo();
  const ids = await filled(r);
  const s = snap(ids);
  delete s.rows[0].diff;
  eq((await sub(r, s)).body.reason, "bad_snapshot", "без diff");
});

Deno.test("submit: без данни за дружеството → 409, но попълването е позволено", async () => {
  const r = new MemRepo();
  const ids = await filled(r, "Раднево", U.admin);
  eq(r.rows.length, 1, "Раднево се попълва");
  const x = await call(r, U.admin, { action: "submit", store: "Раднево", month: "2026-11", snapshot: snap(ids) });
  eq([x.status, x.body.reason], [409, "missing_company"], "отказ");
  assert(String(x.body.message).indexOf("адрес на дружеството") >= 0, "казва какво липсва");
});

Deno.test("ТРЗ: само подадени месеци, без персонал, без запис", async () => {
  const r = new MemRepo();
  const ids = await filled(r);
  await filled(r, "Шумен", U.regSh);
  eq((await call(r, U.trz, { action: "load_month", store: "Кърджали", month: "2026-11" })).body.reason, "not_submitted", "чернова — не");
  eq((await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores, [], "overview без чернови");
  await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids) });
  const l = await call(r, U.trz, { action: "load_month", store: "Кърджали", month: "2026-11", prev: true });
  eq([l.status, l.body.status, l.body.can_edit, l.body.prev_rows], [200, "submitted", false, []], "подаден — да; без предходен месец");
  const o = (await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores;
  eq(o.map((s: { store: string; status: string }) => [s.store, s.status]), [["Кърджали", "submitted"]], "overview — само подадените");
  eq((await call(r, U.trz, { action: "staff_list", store: "Кърджали" })).status, 403, "staff_list — не");
  eq((await call(r, U.trz, { action: "reopen", store: "Кърджали", month: "2026-11" })).body.reason, "readonly", "reopen — не");
  eq((await call(r, U.trz, { action: "admin_get" })).status, 403, "админ — не");
});

Deno.test("reopen: admin и регионалният — да, ръководителят — не", async () => {
  const r = new MemRepo();
  const ids = await filled(r);
  await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids) });
  eq((await call(r, U.mgrK, { action: "reopen", store: "Кърджали", month: "2026-11" })).body.reason, "forbidden", "manager");
  const x = await call(r, U.admin, { action: "reopen", store: "Кърджали", month: "2026-11" });
  eq([x.body.status, r.months[0].status, r.months[0].submitted_by], ["draft", "draft", null], "admin връща");
  // От 20.11.2026 снимката остава (за ТРЗ) — с reopened и буквите към момента на връщането.
  const rs = r.months[0].snapshot as Record<string, Record<string, unknown>>;
  eq([rs.reopened.by, rs.reopened.submitted_by, Object.keys(rs.letters).length], ["ten.tenev@temax.bg", "tencho.tenev13@gmail.com", ids.length], "пазено подаване");
  eq((await call(r, U.admin, { action: "reopen", store: "Кърджали", month: "2026-11" })).body.reason, "not_submitted", "вече е чернова");
  const sh = await filled(r, "Шумен", U.regSh);
  await call(r, U.regSh, { action: "submit", store: "Шумен", month: "2026-11", snapshot: snap(sh) });
  eq((await call(r, U.regSh, { action: "reopen", store: "Шумен", month: "2026-11" })).body.status, "draft", "регионален — свой");
});

Deno.test("overview: регионалният вижда само своите", async () => {
  const r = new MemRepo();
  await filled(r);
  const ro = (await call(r, U.regSh, { action: "overview", month: "2026-11" })).body;
  eq(ro.stores.map((s: { store: string }) => s.store), ["Шумен"], "без Кърджали; Добрич е без дружество → не е в обзора");
  eq(ro.no_company, [], "регионалният не вижда списъка без дружество (той е за admin)");
  const ab = (await call(r, U.admin, { action: "overview", month: "2026-11" })).body;
  eq(ab.stores.filter((s: { store: string }) => s.store === "Кърджали")[0].rows, 2, "admin вижда редовете на Кърджали");
  eq(ab.no_company, ["Добрич"], "admin: обектите без дружество — отделно, за да не се скрие пропуск");
});

// ── Обзор (етап 1е-1, решение 04.11.2026) ─────────────────────────────────
Deno.test("overview: обхват — само обекти с дружество И ВТР; ТЦД 2 (без ВТР) мълчаливо навън", async () => {
  const r = new MemRepo();
  const C2 = "6a1d0000-0000-4000-8000-0000000000c2";
  r.stores.push("Логистичен склад Добрич");
  r.admin.companies.push({ id: C2, name: "\"ТЕМАКС ТЪРГОВСКИ ЦЕНТЪР ЗА ДОМА 2\" ЕООД", eik: "206360338", mol: null, addr: null });
  r.admin.grafik_store_company.push({ id: nid(), store_name: "Логистичен склад Добрич", company_id: C2, blank_name: "x", address: null, valid_from: null, valid_to: null });
  // Връзка, изтекла преди месеца → все едно няма дружество.
  r.admin.grafik_store_company.push({ id: nid(), store_name: "Добрич", company_id: C3, blank_name: "x", address: null, valid_from: null, valid_to: "2026-10-31" });
  const ab = (await call(r, U.admin, { action: "overview", month: "2026-11" })).body;
  eq(ab.stores.map((s: { store: string }) => s.store), ["Кърджали", "Шумен", "Раднево"], "ТЦД 2 и Добрич — не");
  eq(ab.no_company, ["Добрич"], "Добрич (изтекла връзка) — в пропуските; складът на ТЦД 2 — не");
  eq(ab.stores[0].company, "\"ТЕМАКС ТЪРГОВСКИ ЦЕНТЪР ЗА ДОМА 3\" ЕООД", "дружеството");
  // Връзката на Добрич от декември → в обзора за декември.
  r.admin.grafik_store_company.push({ id: nid(), store_name: "Добрич", company_id: C3, blank_name: "x", address: null, valid_from: "2026-12-01", valid_to: null });
  eq((await call(r, U.admin, { action: "overview", month: "2026-12" })).body.stores.map((s: { store: string }) => s.store).indexOf("Добрич") >= 0, true, "декември — да");
});

Deno.test("overview: чернова → последна промяна (кой, кога); подаден → извън нормата от снимката", async () => {
  const r = new MemRepo();
  const ids = await filled(r);                                              // Кърджали — mgrK
  await filled(r, "Шумен", U.regSh);
  const o1 = (await call(r, U.admin, { action: "overview", month: "2026-11" })).body.stores;
  const k1 = o1.filter((s: { store: string }) => s.store === "Кърджали")[0];
  eq([k1.status, k1.last_by, typeof k1.last_at, k1.off_norm], ["draft", "Управител Кърджали", "string", null], "чернова: кой (име от users) и кога; без „извън нормата“");
  eq(o1.filter((s: { store: string }) => s.store === "Раднево")[0].status, null, "не е започнат → status null");
  const s = snap(ids);
  await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: s });
  r.months[0].snapshot = { rows: [
    { full_name: "Красимира Павлова", codes: ["Д1/З"], official: 40, target: 168, diff: -128, norm: 168 },
    { full_name: "Атанас Бакалов", codes: [""], official: 0, target: 0, diff: 0, norm: 168 },
    { full_name: "Наред", codes: ["Д1/З"], official: 168, target: 168, diff: 0, norm: 168 },
  ] };                                                                      // старо подаване (преди правилото)
  const k2 = (await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores[0];
  eq([k2.store, k2.status, k2.off_norm], ["Кърджали", "submitted", ["Красимира Павлова: 40 ч. вместо 168 ч.", "Атанас Бакалов: няма ред в графика за месеца (0 ч. вместо 168 ч.)"]], "ТРЗ вижда кой е извън нормата");
  eq((await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores.map((x: { store: string }) => x.store), ["Кърджали"], "ТРЗ — само подадените (Шумен е чернова)");
});

Deno.test("snapshotOffNorm: празно, стара снимка без norm, норма 0", () => {
  eq(snapshotOffNorm(null), [], "няма снимка");
  eq(snapshotOffNorm({ rows: [{ full_name: "А", codes: ["", ""], diff: 0 }] }), ["А: няма нито един ден"], "стара снимка без norm");
  eq(snapshotOffNorm({ rows: [{ full_name: "Б", codes: [""], diff: 0, norm: 0 }] }), [], "норма 0 — нищо");
  eq(snapshotOffNorm({ rows: [{ short_name: "В", codes: ["Д1/З"], official: 168.5, target: 168, diff: 0.5 }] }), ["В: 168,5 ч. вместо 168 ч."], "над нормата, кратко име");
});

// ── „Промени“ (П1, 05.11.2026; решения а–з) ─────────────────────────────────
// Ноември 2026: 1.11 и 8.11 — неделя; 30 дни. Подаденият месец: ids[0] П на 2 и 3, ids[1] О на 2, НО на 4.
async function submittedK(r: MemRepo) {
  const ids = kStaff(r);
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [
    { staff_id: ids[0], letters: L30(["", "П", "П"]) }, { staff_id: ids[1], letters: L30(["", "О", "", "НО"]) },
  ] });
  eq((await sub(r, snap(ids))).status, 200, "подаден");
  const sn = r.months[0].snapshot as { rows: { codes: string[] }[] };
  sn.rows[0].codes[1] = "Д1/З"; sn.rows[0].codes[2] = "Д1/З"; sn.rows[1].codes[1] = "О"; sn.rows[1].codes[3] = "Н";
  return ids;
}
const chg = (r: MemRepo, who: User, f: Record<string, unknown>) => call(r, who, { action: "changes_save", store: "Кърджали", month: "2026-11", ...f });

Deno.test("changes: само за подаден месец", async () => {
  const r = new MemRepo();
  const ids = kStaff(r);
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30(["", "П"]) }] });
  eq((await call(r, U.mgrK, { action: "changes_list", store: "Кърджали", month: "2026-11" })).body.reason, "not_submitted", "чернова — списък не");
  eq((await chg(r, U.mgrK, { staff_id: ids[0], day: 2, actual: "Б", reason: "x" })).body.reason, "not_submitted", "чернова — запис не");
  eq((await call(r, U.mgrK, { action: "changes_list", store: "Кърджали", month: "2026-12" })).body.reason, "not_submitted", "месец без график");
});

Deno.test("changes_save: „по график“ от сървъра, въведено от, одит; дубликат → редакция", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const a = await chg(r, U.mgrK, { staff_id: ids[0], day: 3, actual: "Б", reason: "  болничен лист № 123 ", planned_letter: "ЛЪЖА" });
  eq([a.status, a.body.row.planned_letter, a.body.row.planned_code, a.body.row.reason, a.body.row.created_by, a.body.row.trz_done],
    [200, "П", "Д1/З", "болничен лист № 123", "tencho.tenev13@gmail.com", false], "по график П / Д1/З — от базата, не от браузъра");
  eq(r.audits.slice(-1)[0].event, "grafik_change_create", "одит");
  eq((await chg(r, U.mgrK, { staff_id: ids[0], day: 3, actual: "О", reason: "x" })).body.reason, "duplicate", "втори ред за човек и ден — отказ");
  const e = await chg(r, U.mgrK, { id: a.body.row.id, staff_id: ids[0], day: 3, actual: "О", reason: "отпуск по молба № 7" });
  eq([e.status, e.body.row.actual, e.body.row.updated_by, r.changes.length], [200, "О", "tencho.tenev13@gmail.com", 1], "редакцията е на същия ред");
  eq(r.audits.slice(-1)[0].event, "grafik_change_update", "одит на редакцията");
  const l = await call(r, U.mgrK, { action: "changes_list", store: "Кърджали", month: "2026-11" });
  eq(l.body.rows.map((x: ChangeRow) => x.day + ":" + x.actual), ["3:О"], "списъкът");
});

Deno.test("changes_save: проверките — реално, основание, ден, неделя, без отклонение", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const bad = async (f: Record<string, unknown>) => (await chg(r, U.mgrK, f)).body.reason;
  eq(await bad({ staff_id: ids[0], day: 5, actual: "X", reason: "x" }), "bad_request", "„реално“ извън списъка");
  eq(await bad({ staff_id: ids[0], day: 5, actual: "Б", reason: "   " }), "bad_request", "празно основание");
  eq(await bad({ staff_id: ids[0], day: 31, actual: "Б", reason: "x" }), "bad_request", "31-ви в ноември");
  eq(await bad({ staff_id: ids[0], day: 0, actual: "Б", reason: "x" }), "bad_request", "ден 0");
  eq(await bad({ staff_id: ids[0], day: 8, actual: "ЛД", reason: "x" }), "sunday_ld", "решение в: ЛД в неделя");
  eq((await chg(r, U.mgrK, { staff_id: ids[0], day: 8, actual: "ЗД", reason: "дошъл в неделя" })).status, 200, "ЗД в неделя — може");
  eq(await bad({ staff_id: ids[0], day: 2, actual: "П", reason: "x" }), "no_change", "по график П → реално П");
  eq(await bad({ staff_id: ids[0], day: 10, actual: "почивка", reason: "x" }), "no_change", "празен ден → почивка");
  eq(await bad({ staff_id: ids[1], day: 4, actual: "Н", reason: "x" }), "no_change", "НО в графика = Н");
  eq(await bad({ staff_id: ids[1], day: 2, actual: "О", reason: "x" }), "no_change", "О → О");
  const o = await chg(r, U.mgrK, { staff_id: ids[1], day: 2, actual: "П", reason: "извикана от отпуск" });
  eq([o.status, o.body.row.planned_letter, o.body.row.planned_code], [200, "О", "О"], "ден О по график → П (решение: замества деня)");
  eq((await chg(r, U.mgrK, { staff_id: ids[0], day: 20, actual: "Майч", reason: "майчинство" })).status, 200, "Майч — може");
});

Deno.test("changes_save: само хората от подадения график и само в дните им на работа", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const nw = nid();
  r.staff.push({ id: nw, store_name: "Кърджали", short_name: "НОВ", full_name: "Нов След Подаването", sort_order: 0, left_on: null });
  eq((await chg(r, U.mgrK, { staff_id: nw, day: 5, actual: "П", reason: "x" })).body.reason, "not_in_schedule", "решение ж: нов човек — не");
  r.staff.filter((s) => s.id === ids[1])[0].left_on = "2026-11-10";
  eq((await chg(r, U.mgrK, { staff_id: ids[1], day: 12, actual: "П", reason: "x" })).body.reason, "not_employed", "след напускане — не");
  eq((await chg(r, U.mgrK, { staff_id: ids[1], day: 10, actual: "Б", reason: "x" })).status, 200, "денят на напускане — може");
  eq((await chg(r, U.mgrK, { staff_id: "не-uuid", day: 5, actual: "П", reason: "x" })).body.reason, "bad_request", "лош id");
});

Deno.test("changes: права — склад и ТРЗ не пишат; чужд обект не; ТРЗ чете", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  eq((await chg(r, U.sklK, { staff_id: ids[0], day: 5, actual: "Б", reason: "x" })).status, 403, "склад — не");
  eq((await chg(r, U.trz, { staff_id: ids[0], day: 5, actual: "Б", reason: "x" })).status, 403, "ТРЗ — не пише");
  eq((await chg(r, U.regSh, { staff_id: ids[0], day: 5, actual: "Б", reason: "x" })).status, 403, "регионален на друг обект — не");
  eq((await chg(r, U.admin, { staff_id: ids[0], day: 5, actual: "Б", reason: "x" })).status, 200, "admin — да");
  const t = await call(r, U.trz, { action: "changes_list", store: "Кърджали", month: "2026-11" });
  eq([t.status, t.body.rows.length], [200, 1], "ТРЗ чете");
});

Deno.test("changes_trz: само ТРЗ и admin; отразената се пипа само от admin (решение б)", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const a = await chg(r, U.mgrK, { staff_id: ids[0], day: 3, actual: "Б", reason: "болничен" });
  const id = a.body.row.id;
  const trz = (who: User, done: unknown) => call(r, who, { action: "changes_trz", store: "Кърджали", month: "2026-11", id, done });
  eq((await trz(U.mgrK, true)).status, 403, "магазинът не отмята");
  eq((await trz(U.trz, "да")).body.reason, "bad_request", "done е boolean");
  const t = await trz(U.trz, true);
  eq([t.status, t.body.row.trz_done, t.body.row.trz_done_by, typeof t.body.row.trz_done_at], [200, true, "trz@temax.bg", "string"], "ТРЗ отмята (кой, кога)");
  eq(t.body.row.actual, "Б", "…без да пипа другите полета");
  eq((await chg(r, U.mgrK, { id, staff_id: ids[0], day: 3, actual: "О", reason: "x" })).body.reason, "trz_done", "магазинът не редактира отразената");
  eq((await call(r, U.mgrK, { action: "changes_delete", store: "Кърджали", month: "2026-11", id })).body.reason, "trz_done", "…и не я трие");
  eq((await chg(r, U.admin, { id, staff_id: ids[0], day: 3, actual: "О", reason: "поправка" })).status, 200, "admin — може");
  const u = await trz(U.trz, false);
  eq([u.body.row.trz_done, u.body.row.trz_done_by, u.body.row.trz_done_at], [false, null, null], "ТРЗ размаркира");
  eq(r.audits.filter((x) => /grafik_change_trz/.test(x.event)).map((x) => x.event), ["grafik_change_trz", "grafik_change_trz_undo"], "одит");
  const d = await call(r, U.mgrK, { action: "changes_delete", store: "Кърджали", month: "2026-11", id });
  eq([d.status, r.changes.length], [200, 0], "неотразена — магазинът трие");
  eq((await call(r, U.mgrK, { action: "changes_delete", store: "Кърджали", month: "2026-11", id })).status, 404, "втори път — 404");
});

Deno.test("changes и „Върни“ / ново подаване (решение а): остават; махат се само невалидните", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  await chg(r, U.mgrK, { staff_id: ids[0], day: 3, actual: "Б", reason: "болничен" });
  await chg(r, U.mgrK, { staff_id: ids[1], day: 20, actual: "П", reason: "дошла на почивен ден" });
  const ro = await call(r, U.admin, { action: "reopen", store: "Кърджали", month: "2026-11" });
  eq([ro.body.status, ro.body.changes], ["draft", 2], "„Върни“ казва колко промени има");
  eq(r.changes.length, 2, "…и те остават");
  r.staff.filter((s) => s.id === ids[1])[0].left_on = "2026-11-15";     // напуска преди 20-и
  const s2 = await sub(r, snap(ids));
  eq([s2.status, s2.body.changes_removed], [200, 1], "ново подаване — махната е промяната след напускането");
  eq(r.changes.map((c) => c.staff_id + ":" + c.day), [ids[0] + ":3"], "останалата");
  assert(JSON.stringify(r.audits.slice(-1)[0]).indexOf("grafik_submit") >= 0, "одит на подаването");
});

Deno.test("changes_save: работната буква трябва да има код за договора (П3)", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  r.staff.filter((s) => s.id === ids[1])[0].hours_per_day = 4;
  const x = await chg(r, U.mgrK, { staff_id: ids[1], day: 5, actual: "П", reason: "дошла" });
  eq([x.status, x.body.reason], [400, "letter_contract"], "П за 4 ч. — няма ред в буквите → отказ");
  assert(/Буквата „П“ няма код за договор 4 ч\./.test(String(x.body.message)), "съобщението");
  r.admin.grafik_letter_map.push({ id: nid(), vtr_id: VTR, letter: "П", day_kind: "З1", code: "Д5/1", hours_per_day: 4, valid_from: null, valid_to: null });
  eq((await chg(r, U.mgrK, { staff_id: ids[1], day: 5, actual: "П", reason: "дошла" })).status, 200, "с ред за 4 ч. — може");
  eq((await chg(r, U.mgrK, { staff_id: ids[1], day: 6, actual: "Б", reason: "болничен" })).status, 200, "неявяване — без проверка на буквите");
  eq((await chg(r, U.mgrK, { staff_id: ids[0], day: 5, actual: "ЛД", reason: "x" })).status, 200, "8 ч. — общите букви");
  // Часовете — от СНИМКАТА: договорът е сменен след подаването, присъствената превежда по снимката.
  (r.months[0].snapshot as { rows: Record<string, unknown>[] }).rows[0].hours_per_day = 8;
  r.staff.filter((s) => s.id === ids[0])[0].hours_per_day = 4;
  eq((await chg(r, U.mgrK, { staff_id: ids[0], day: 9, actual: "ЗД", reason: "x" })).status, 200, "снимката е 8 ч. — общите букви, не днешните 4 ч.");
  // Видът ден: 8.11.2026 е неделя. Като базата: при 4 ч. П има ред за сезона, но не и за „Н“.
  (r.months[0].snapshot as { rows: Record<string, unknown>[] }).rows[1].hours_per_day = 4;
  const n = await chg(r, U.mgrK, { staff_id: ids[1], day: 8, actual: "П", reason: "извикана" });
  eq([n.status, n.body.reason], [400, "letter_contract"], "4 ч., П в неделя без ред П|Н → отказ");
  assert(/няма код за договор 4 ч. в неделя./.test(String(n.body.message)), "съобщението казва „в неделя“: " + n.body.message);
  r.admin.grafik_letter_map.push({ id: nid(), vtr_id: VTR, letter: "П", day_kind: "Н", code: "x", hours_per_day: 4, valid_from: null, valid_to: null });
  eq((await chg(r, U.mgrK, { staff_id: ids[1], day: 8, actual: "П", reason: "извикана" })).status, 200, "с ред П|Н за 4 ч. — може");
});

Deno.test("overview: за подадените — брой промени и неотразени (П3)", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const a = await chg(r, U.mgrK, { staff_id: ids[0], day: 5, actual: "Б", reason: "x" });
  await chg(r, U.mgrK, { staff_id: ids[0], day: 6, actual: "Б", reason: "x" });
  await call(r, U.trz, { action: "changes_trz", store: "Кърджали", month: "2026-11", id: a.body.row.id, done: true });
  const o = (await call(r, U.admin, { action: "overview", month: "2026-11" })).body.stores;
  const k = o.filter((s: { store: string }) => s.store === "Кърджали")[0], sh = o.filter((s: { store: string }) => s.store === "Шумен")[0];
  eq([k.changes, k.changes_open], [2, 1], "Кърджали: 2 промени, 1 неотразена");
  eq([sh.changes, sh.changes_open], [null, null], "неподаден — без брой");
  const t = (await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores[0];
  eq([t.store, t.changes, t.changes_open], ["Кърджали", 2, 1], "ТРЗ вижда същото");
});

Deno.test("sameAsPlanned / staleChanges", () => {
  eq([sameAsPlanned("П", "П"), sameAsPlanned("Н", "НО"), sameAsPlanned("почивка", ""), sameAsPlanned("Б", "П"), sameAsPlanned("П", "")], [true, true, true, false, false], "сравнение");
  const st = [{ id: "a", store_name: "K", hired_on: "2026-11-05", left_on: null }, { id: "b", store_name: "K", left_on: "2026-11-20" }] as Staff[];
  const ch = (staff_id: string, day: number) => ({ id: staff_id + day, month_id: "m", staff_id, day, planned_letter: "", planned_code: "", actual: "П", reason: "x", trz_done: false });
  eq(staleChanges([ch("a", 4), ch("a", 5), ch("b", 20), ch("b", 21), ch("c", 1)], st, "2026-11-01").map((c) => c.id), ["a4", "b21", "c1"], "преди назначаване, след напускане, извън графика");
});

// ── Списъците beta / ТРЗ (grafik_access, етап 1е-3) ──────────────────────────
Deno.test("access_*: само admin; добавяне, дубликат, невалиден имейл, махане, одит", async () => {
  const r = new MemRepo();
  for (const u of [U.mgrK, U.trz, U.regSh]) eq((await call(r, u, { action: "access_list" })).status, 403, "не-admin — " + u.email);
  const l = await call(r, U.admin, { action: "access_list" });
  eq(l.body.rows.map((x: AccessRow) => x.list + ":" + x.email).sort().slice(0, 2), ["beta:off@temax.bg", "beta:sklad.k@temax.bg"], "списъкът");
  const add = await call(r, U.admin, { action: "access_add", role: "edit", email: "  Drug@Temax.bg ", note: " Регионален Юг " });
  eq([add.status, add.body.row.list, add.body.row.email, add.body.row.note, add.body.row.created_by], [200, "edit", "drug@temax.bg", "Регионален Юг", "ten.tenev@temax.bg"], "добавен (малки букви, без интервали)");
  eq((await call(r, U.outside, { action: "me" })).body.kind, "manager", "…и веднага има достъп (edit → по портала)");
  eq((await call(r, U.admin, { action: "access_add", role: "edit", email: "drug@temax.bg" })).body.reason, "duplicate", "втори път — 409");
  eq((await call(r, U.admin, { action: "access_add", role: "trz", email: "drug@temax.bg" })).body.reason, "duplicate", "една роля на имейл — втора не се добавя, а се сменя");
  const dr = r.access.filter((x) => x.email === "drug@temax.bg")[0];
  const set = await call(r, U.admin, { action: "access_set", id: dr.id, role: "trz" });
  eq([set.status, set.body.row.list], [200, "trz"], "смяна на ролята");
  eq((await call(r, U.outside, { action: "me" })).body.kind, "trz", "…и става ТРЗ");
  for (const bad of ["", "без-маймунка", "a@b", "a b@c.bg", "a,b@c.bg"]) eq((await call(r, U.admin, { action: "access_add", role: "view", email: bad })).body.reason, "bad_email", "лош имейл: " + bad);
  eq((await call(r, U.admin, { action: "access_add", role: "admin", email: "x@temax.bg" })).body.reason, "bad_request", "непозната роля");
  eq((await call(r, U.admin, { action: "access_add", list: "beta", email: "old.card@temax.bg" })).body.row.list, "edit", "старата карта (list: beta) → edit");
  eq((await call(r, U.admin, { action: "access_add", role: "trz", email: "Ten.Tenev@temax.bg" })).body.reason, "self", "собственият имейл — не");
  const own = r.access.filter((x) => x.email === "ten.tenev@temax.bg")[0];
  eq((await call(r, U.admin, { action: "access_remove", id: own.id })).body.reason, "self", "собственият — не се маха");
  eq((await call(r, U.admin, { action: "access_set", id: own.id, role: "view" })).body.reason, "self", "собственият — не се сменя");
  eq((await call(r, U.admin, { action: "access_set", id: dr.id, role: "boss" })).body.reason, "bad_request", "access_set: непозната роля");
  eq((await call(r, U.admin, { action: "access_set", id: dr.id })).body.reason, "bad_request", "access_set: нищо за смяна");
  eq((await call(r, U.admin, { action: "access_set", id: dr.id, can_reset_pin: "да" })).body.reason, "bad_request", "can_reset_pin — само boolean");
  eq((await call(r, U.mgrK, { action: "access_set", id: dr.id, role: "view" })).status, 403, "access_set — само admin");
  eq((await call(r, U.admin, { action: "access_remove", id: dr.id })).body.deleted, 1, "махнат");
  eq((await call(r, U.outside, { action: "me" })).body.reason, "not_beta", "…и вече няма достъп");
  eq((await call(r, U.admin, { action: "access_remove", id: dr.id })).status, 404, "втори път — 404");
  eq((await call(r, U.admin, { action: "access_set", id: dr.id, role: "view" })).status, 404, "access_set на махнат — 404");
  eq((await call(r, U.admin, { action: "access_remove", id: "не-uuid" })).body.reason, "bad_request", "лош id");
  eq(r.audits.filter((a) => a.event.indexOf("grafik_access") === 0).map((a) => a.event), ["grafik_access_add", "grafik_access_set", "grafik_access_add", "grafik_access_remove"], "одит — само успешните промени");
});

// ── Роли view / trz / edit (27.11.2026) ─────────────────────────────────────
Deno.test("roleOf: trz > view > edit; beta = edit; главни букви", () => {
  const row = (list: string, email: string) => ({ id: nid(), list, email, note: null }) as AccessRow;
  eq(roleOf([row("beta", "a@x.bg")], "A@x.bg "), "edit", "beta → edit");
  eq(roleOf([row("edit", "a@x.bg"), row("view", "a@x.bg")], "a@x.bg"), "view", "view бие edit");
  eq(roleOf([row("view", "a@x.bg"), row("trz", "a@x.bg")], "a@x.bg"), "trz", "trz бие view");
  eq(roleOf([row("view", "b@x.bg")], "a@x.bg"), null, "друг имейл");
  eq(roleOf([], ""), null, "празно");
});

Deno.test("view: всички обекти и черновите, персонала; нищо не пише; admin с view не администрира", async () => {
  const r = new MemRepo();
  // Теодор: admin в портала, „преглед“ в графика.
  r.access = r.access.filter((x) => x.email !== "ten.tenev@temax.bg").concat([{ id: nid(), list: "view", email: "ten.tenev@temax.bg", note: null }]);
  const own = { ...U.admin };
  const me = (await call(r, own, { action: "me" })).body;
  eq([me.kind, me.stores.length, me.can_admin, me.can_reopen, me.can_approve, me.stores.some((s: { can_edit: boolean }) => s.can_edit)], ["view", 4, false, false, false, false], "me: всички 4 обекта, нищо за писане");
  await filled(r, "Кърджали", U.mgrK);                       // чернова с редове от ръководителя
  const lm = (await call(r, own, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq([lm.status, lm.can_edit, lm.can_reopen, lm.can_approve, lm.can_return, lm.rows.length > 0, lm.staff.length], ["draft", false, false, false, false, true, 2], "вижда черновата с редовете");
  eq((await call(r, own, { action: "load_month", store: "Раднево", month: "2026-11" })).status, 200, "чужд обект — чете");
  eq((await call(r, own, { action: "staff_list", store: "Шумен" })).status, 200, "„👥 Персонал“ — чете");
  eq((await call(r, own, { action: "overview", month: "2026-11" })).status, 200, "обзор");
  const sid = kStaff(r)[0], sec = r.sectors[0].id;
  const writes: [string, Record<string, unknown>][] = [
    ["save_rows", { store: "Кърджали", month: "2026-11", rows: [{ staff_id: sid, letters: L30(["П"]) }] }],
    ["submit", { store: "Кърджали", month: "2026-11", snapshot: { rows: [] } }],
    ["reopen", { store: "Кърджали", month: "2026-11" }],
    ["return", { store: "Кърджали", month: "2026-11", comment: "x" }],
    ["approve", { store: "Кърджали", month: "2026-11" }],
    ["staff_save", { store: "Кърджали", fields: { short_name: "НОВ", full_name: "Нов Човек" } }],
    ["staff_save", { store: "Кърджали", id: sid, fields: { short_name: "ПРОМЕНЕН" } }],
    ["staff_move", { id: sid, to_store: "Шумен", date: "2026-12-01" }],
    ["changes_save", { store: "Кърджали", month: "2026-11", staff_id: sid, day: 3, actual: "Б", reason: "x" }],
    ["changes_delete", { store: "Кърджали", month: "2026-11", id: sid }],
    ["changes_trz", { store: "Кърджали", month: "2026-11", id: sid, done: true }],
    ["sector_save", { store: "Кърджали", name: "Нов сектор" }],
    ["sector_update", { store: "Кърджали", id: sec, track_coverage: false }],
    ["admin_get", {}], ["admin_save", { table: "companies", fields: { name: "X" } }], ["admin_delete", { table: "grafik_extra_days", id: sid }],
    ["access_list", {}], ["access_add", { role: "edit", email: "x@temax.bg" }], ["access_set", { id: r.access[0].id, role: "edit" }], ["access_remove", { id: r.access[0].id }],
  ];
  const before = JSON.stringify([r.rows, r.staff, r.months, r.changes, r.sectors, r.admin, r.access]);
  for (const [action, body] of writes) {
    const x = await call(r, own, { action, ...body });
    assert(x.status === 403 || x.status === 409, action + ": view получи " + x.status + " " + JSON.stringify(x.body));
  }
  eq(JSON.stringify([r.rows, r.staff, r.months, r.changes, r.sectors, r.admin, r.access]), before, "базата — непокътната");
  eq(r.audits.filter((a) => a.event.indexOf("grafik_") === 0 && a.event !== "grafik_view").length, 0, "одит на промени — нула");
});

Deno.test("view: подаден месец — вижда, но не одобрява, не връща, не отмята", async () => {
  const r = new MemRepo();
  r.access.push({ id: nid(), list: "view", email: "t.tenev@temax.bg", note: null });
  const teo: User = { id: nid(), email: "t.tenev@temax.bg", display_name: "Теодор Тенев", store_name: "Централен офис", role: "admin", is_regional: false, assigned_stores: null, active: true };
  r.users.push(teo);
  await submittedK(r);
  const lm = (await call(r, teo, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq([lm.status, lm.can_approve, lm.can_return, lm.can_reopen], ["submitted", false, false, false], "подаден — само чете");
  eq((await call(r, teo, { action: "changes_list", store: "Кърджали", month: "2026-11" })).status, 200, "промените — чете");
  const ov = (await call(r, teo, { action: "overview", month: "2026-11" })).body;
  eq(ov.stores.filter((s: { can_approve: boolean; can_return: boolean; can_edit: boolean }) => s.can_approve || s.can_return || s.can_edit).length, 0, "обзор — без бутони");
  // На подаден месец отказът е заради правата (403), не заради статуса.
  eq((await call(r, teo, { action: "approve", store: "Кърджали", month: "2026-11" })).status, 403, "approve на подаден — 403");
  eq((await call(r, teo, { action: "return", store: "Кърджали", month: "2026-11", comment: "поправи" })).status, 403, "return на подаден — 403");
  eq((await call(r, teo, { action: "reopen", store: "Кърджали", month: "2026-11" })).status, 403, "reopen на подаден — 403");
  const ch = (await call(r, U.mgrK, { action: "changes_save", store: "Кърджали", month: "2026-11", staff_id: kStaff(r)[0], day: 2, actual: "Б", reason: "болничен" })).body.row;
  eq((await call(r, teo, { action: "changes_trz", store: "Кърджали", month: "2026-11", id: ch.id, done: true })).status, 403, "„Отразено в ТРЗ“ — 403");
  eq((await call(r, teo, { action: "changes_delete", store: "Кърджали", month: "2026-11", id: ch.id })).status, 403, "трие промяна — 403");
  eq([r.months[0].status, r.changes.length, r.changes[0].trz_done], ["submitted", 1, false], "нищо не е сменено");
});

Deno.test("ТРЗ списъкът е достатъчен сам — без beta (04.11.2026)", async () => {
  const r = new MemRepo();
  r.access = r.access.filter((x) => x.email !== "trz@temax.bg" || x.list === "trz");      // trz@temax.bg — само в ТРЗ
  eq(r.access.filter((x) => x.email === "trz@temax.bg").map((x) => x.list), ["trz"], "наистина само в ТРЗ");
  const t = await call(r, U.trz, { action: "me" });
  eq([t.status, t.body.kind, t.body.can_admin], [200, "trz", false], "влиза като ТРЗ");
  r.access = r.access.filter((x) => x.email !== "trz@temax.bg");
  eq((await call(r, U.trz, { action: "me" })).body.reason, "not_beta", "в нито един списък → 403");
});

Deno.test("admin_get: носи и ВТР-ите и обектите (за картата)", async () => {
  const r = new MemRepo();
  const g = (await call(r, U.admin, { action: "admin_get" })).body;
  eq([g.vtrs, g.stores], [[{ id: VTR, name: "ВТР ТЦД 3 / ТЦД 4 / Юг (01.11.2026)" }], ["Кърджали", "Шумен", "Раднево", "Добрич"]], "vtrs и stores");
  eq((await call(r, U.regSh, { action: "admin_get" })).status, 403, "регионален — не");
});

// ── Персонал ─────────────────────────────────────────────────────────────
Deno.test("staff_save: дублирано „Име в графика“ в същия обект → 409 (05.11.2026)", async () => {
  const r = new MemRepo();
  const save = (fields: Record<string, unknown>, id?: string, store = "Кърджали") => call(r, U.admin, { action: "staff_save", store, fields, ...(id ? { id } : {}) });
  const a = await save({ short_name: "МАРИЯ", full_name: "Мария Първа" });
  eq(a.status, 200, "първата МАРИЯ");
  const d = await save({ short_name: "  мария ", full_name: "Мария Втора" });
  eq([d.status, d.body.reason], [409, "duplicate"], "същото име (малки букви, интервали) — отказ");
  assert(/„мария“ вече е в графика на обекта/.test(String(d.body.message)), "съобщението казва кое име");
  eq((await save({ short_name: "МАРИЯ", full_name: "Мария Шумен" }, undefined, "Шумен")).status, 200, "в друг обект — може");
  const b = await save({ short_name: "МАРИЯ 2", full_name: "Мария Втора" });
  eq((await save({ short_name: "Мария" }, b.body.staff.id)).body.reason, "duplicate", "преименуване към заето име — отказ");
  eq((await save({ short_name: "МАРИЯ", note: "бележка" }, a.body.staff.id)).status, 200, "записът на самия човек със същото име — може");
  eq((await save({ note: "без име в полетата" }, b.body.staff.id)).status, 200, "редакция без short_name — без проверка");
  r.staff.filter((x) => x.id === a.body.staff.id)[0].left_on = "2026-09-30";
  const lf = await save({ short_name: "МАРИЯ", full_name: "Мария Нова" });
  eq(lf.body.reason, "duplicate", "напусналият също заема името");
  assert(/напуснал на 2026-09-30/.test(String(lf.body.message)), "…и съобщението казва, че е напуснал");
});

Deno.test("staff_save / staff_move: права и бял списък", async () => {
  const r = new MemRepo();
  const n = await call(r, U.mgrK, { action: "staff_save", store: "Кърджали", fields: { short_name: "НОВ", full_name: "Нов Човек", hours_per_day: 4 } });
  eq([n.status, n.body.staff.store_name, n.body.staff.created_by], [200, "Кърджали", "tencho.tenev13@gmail.com"], "нов");
  eq((await call(r, U.mgrK, { action: "staff_save", store: "Кърджали", fields: { short_name: "Х" } })).status, 400, "без три имена");
  eq((await call(r, U.mgrK, { action: "staff_save", store: "Кърджали", fields: { short_name: "Х", full_name: "Х", store_name: "Шумен" } })).status, 400, "store_name не е в белия списък");
  eq((await call(r, U.sklK, { action: "staff_save", store: "Кърджали", fields: { short_name: "Х", full_name: "Х" } })).body.reason, "readonly", "склад");
  const sh = kStaff(r, "Шумен")[0];
  eq((await call(r, U.mgrK, { action: "staff_save", store: "Кърджали", id: sh, fields: { note: "x" } })).status, 404, "чужд служител през своя обект");
  eq((await call(r, U.mgrK, { action: "staff_save", store: "Кърджали", id: n.body.staff.id, fields: { left_on: "2026-11-15" } })).body.staff.left_on, "2026-11-15", "напуснал");
  eq((await call(r, U.mgrK, { action: "staff_move", id: n.body.staff.id, to_store: "Шумен", date: "2026-12-01" })).status, 403, "преместване — не за manager");
  const shId = kStaff(r, "Шумен")[0];
  eq((await call(r, U.regSh, { action: "staff_move", id: shId, to_store: "Добрич", date: "2026-12-01" })).body.reason, "forbidden", "регионален с права и в двата обекта — пак не");
  const mv = await call(r, U.admin, { action: "staff_move", id: n.body.staff.id, to_store: "Шумен", date: "2026-12-01" });
  eq([mv.body.staff.store_name, mv.body.staff.hired_on, mv.body.staff.hours_per_day], ["Шумен", "2026-12-01", 4], "нов ред в Шумен");
  eq(r.staff.filter((s) => s.id === n.body.staff.id)[0].left_on, "2026-11-30", "старият — напуснал предния ден");
});

// ── Админ ────────────────────────────────────────────────────────────────
Deno.test("admin_*: само admin, бели списъци, stores.company_id", async () => {
  const r = new MemRepo();
  eq((await call(r, U.mgrK, { action: "admin_get" })).status, 403, "manager");
  eq((await call(r, U.regSh, { action: "admin_save", table: "companies", id: CY, fields: { addr: "x" } })).status, 403, "регионален");
  const up = await call(r, U.admin, { action: "admin_save", table: "companies", id: CY, fields: { addr: "гр. Раднево" } });
  eq(up.body.row.addr, "гр. Раднево", "адрес на Темакс Юг");
  eq((await call(r, U.admin, { action: "admin_save", table: "companies", id: CY, fields: { id: "x" } })).status, 400, "id не е поле");
  eq((await call(r, U.admin, { action: "admin_save", table: "users", fields: { role: "admin" } })).status, 400, "users не е в списъка");
  eq((await call(r, U.admin, { action: "admin_save", table: "grafik_letter_map", fields: { code: "x" } })).status, 400, "нова буква — не оттук");
  const lm = r.admin.grafik_letter_map.filter((x) => x.letter === "М")[0];
  eq((await call(r, U.admin, { action: "admin_save", table: "grafik_letter_map", id: lm.id, fields: { code: "Д1/З" } })).body.row.code, "Д1/З", "смяна на кода на М");
  eq((await call(r, U.admin, { action: "admin_save", table: "grafik_letter_map", id: lm.id, fields: { letter: "Z" } })).status, 400, "буквата не се сменя");
  const sc = await call(r, U.admin, { action: "admin_save", table: "grafik_store_company", fields: { store_name: "Добрич", company_id: C3, blank_name: "\"Темакс\" - Добрич" } });
  eq([sc.status, r.storeRef["Добрич"]], [200, C3], "обект → дружество обновява stores.company_id");
  const ed = await call(r, U.admin, { action: "admin_save", table: "grafik_extra_days", fields: { day: "2026-12-31", note: "x" } });
  eq(ed.body.row.created_by, "ten.tenev@temax.bg", "неработен ден");
  eq((await call(r, U.admin, { action: "admin_delete", table: "companies", id: C3 })).status, 400, "дружество не се трие");
  eq((await call(r, U.admin, { action: "admin_delete", table: "grafik_extra_days", id: ed.body.row.id })).body.deleted, 1, "неработен ден се трие");
});

Deno.test("сезон: пълното име от labels, кодът остава вътрешен", async () => {
  const r = new MemRepo();
  const raw = await r.setupRaw("Кърджали");
  const lab = (a: string, b: string) => resolveSetup(raw, a, b);
  eq([lab("2026-11-01", "2026-11-30").season, lab("2026-11-01", "2026-11-30").season_label], ["З1", "Зима 1 (до 19:30)"], "ноември 2026");
  eq(lab("2027-01-01", "2027-01-31").season_label, "Зима 2 (до 19:00)", "януари 2027");
  eq(lab("2027-06-01", "2027-06-30").season_label, "Лято (до 20:00)", "юни 2027");
  eq(lab("2026-10-01", "2026-10-31").season_label, "Лято (до 20:00)", "октомври 2026 (стар ВТР)");
  eq(lab("2026-02-01", "2026-02-28").season_label, "Зима (до 19:00)", "февруари 2026 (стар ВТР — една зима)");
  const noLab = { ...raw, seasons: raw.seasons.map((x) => ({ ...x, labels: null })) };
  eq(resolveSetup(noLab, "2026-11-01", "2026-11-30").season_label, "З1", "без labels → кодът (не празно)");
});

Deno.test("сектори: setup носи само активните на магазина, подредени", async () => {
  const r = new MemRepo();
  const st = resolveSetup(await r.setupRaw("Кърджали"), "2026-11-01", "2026-11-30");
  eq(st.sectors.map((x) => x.name), ["Каса", "Склад"], "без неактивния и без Шумен");
});

Deno.test("sector_save: admin и регионалният — да; manager, склад, ТРЗ — не; дубликат → 409", async () => {
  const r = new MemRepo();
  const add = async (u: User, store: string, name: unknown) => (await call(r, u, { action: "sector_save", store, name })).body;
  const a = await add(U.admin, "Кърджали", "  Градина   и   двор ");
  eq([a.ok, a.sector.name, a.sector.store_name], [true, "Градина и двор", "Кърджали"], "admin; интервалите се свиват");
  eq((await add(U.regSh, "Шумен", "Бои")).ok, true, "регионален — свой");
  eq((await add(U.regSh, "Кърджали", "Бои")).reason, "readonly", "регионален — чужд");
  eq((await add(U.mgrK, "Кърджали", "Бои")).reason, "forbidden", "manager");
  eq((await add(U.sklK, "Кърджали", "Бои")).reason, "readonly", "склад");
  eq((await add(U.trz, "Кърджали", "Бои")).reason, "readonly", "ТРЗ");
  const d = await call(r, U.admin, { action: "sector_save", store: "Кърджали", name: "каса" });
  eq([d.status, d.body.reason], [409, "duplicate"], "„каса“ при съществуваща „Каса“");
  eq((await add(U.admin, "Кърджали", "   ")).reason, "bad_request", "празно име");
  eq((await add(U.admin, "Кърджали", "x".repeat(61))).reason, "bad_request", "над 60 знака");
  eq(r.audits.filter((x) => x.event === "grafik_sector_create").length, 2, "audit за двата успешни");
});

Deno.test("сектори: setup носи track_coverage (липсва в базата → true)", async () => {
  const r = new MemRepo();
  r.sectors[0].track_coverage = false;                       // Склад — изключен; Каса — без поле (стар ред)
  const st = resolveSetup(await r.setupRaw("Кърджали"), "2026-11-01", "2026-11-30");
  eq(st.sectors.map((x) => x.name + ":" + x.track_coverage), ["Каса:true", "Склад:false"], "Каса → true, Склад → false");
});

Deno.test("sector_update: „следи покритието“ — admin и регионалният (свой); manager, склад, ТРЗ — не; само полето", async () => {
  const r = new MemRepo();
  const SK = "5ec00000-0000-4000-8000-000000000001", SH = "5ec00000-0000-4000-8000-000000000004";
  const upd = async (u: User, store: string, id: unknown, v: unknown) => (await call(r, u, { action: "sector_update", store, id, track_coverage: v, name: "ПРЕИМЕНУВАН" })).body;
  const a = await upd(U.admin, "Кърджали", SK, false);
  eq([a.ok, a.sector.track_coverage, a.sector.name], [true, false, "Склад"], "admin изключва; името не се пипа");
  eq(r.sectors[0].track_coverage, false, "в базата — false");
  eq((await upd(U.admin, "Кърджали", SK, true)).sector.track_coverage, true, "admin включва обратно");
  eq((await upd(U.regSh, "Шумен", SH, false)).ok, true, "регионален — свой обект");
  eq((await upd(U.regSh, "Кърджали", SK, false)).reason, "readonly", "регионален — чужд обект");
  eq((await upd(U.mgrK, "Кърджали", SK, false)).reason, "forbidden", "manager");
  eq((await upd(U.sklK, "Кърджали", SK, false)).reason, "readonly", "склад");
  eq((await upd(U.trz, "Кърджали", SK, false)).reason, "readonly", "ТРЗ");
  eq((await upd(U.admin, "Кърджали", SH, false)).reason, "not_found", "сектор на друг магазин през този магазин");
  eq((await upd(U.admin, "Кърджали", SK, "false")).reason, "bad_request", "низ вместо boolean");
  eq((await upd(U.admin, "Кърджали", SK, undefined)).reason, "bad_request", "без стойност");
  eq((await upd(U.admin, "Кърджали", "не-uuid", false)).reason, "bad_request", "невалиден id");
  eq(r.sectors[0].track_coverage, true, "отказаните не пипат базата");
  const au = r.audits.filter((x) => x.event === "grafik_sector_update");
  eq(au.length, 3, "audit за трите успешни");
  const was = au.map((a) => (a as unknown as { details: Record<string, unknown> }).details.was);
  eq(was, [true, false, true], "audit пази предишната стойност (true → false, false → true, Шумен true → false)");
});

Deno.test("staff_save: sector_id само от същия магазин и активен; staff_move го маха", async () => {
  const r = new MemRepo();
  const sid = kStaff(r)[0];
  const save = async (sector_id: unknown) => (await call(r, U.mgrK, { action: "staff_save", store: "Кърджали", id: sid, fields: { sector_id } })).body;
  eq((await save("5ec00000-0000-4000-8000-000000000002")).staff.sector_id, "5ec00000-0000-4000-8000-000000000002", "свой сектор");
  eq((await save("5ec00000-0000-4000-8000-000000000004")).message, "Секторът не е от този магазин.", "сектор на Шумен");
  eq((await save("5ec00000-0000-4000-8000-000000000003")).message, "Секторът не е от този магазин.", "неактивен");
  eq((await save("5ec00000-0000-4000-8000-0000000000ff")).reason, "bad_request", "несъществуващ");
  eq((await save(null)).ok, true, "без сектор (null) — позволено");
  await save("5ec00000-0000-4000-8000-000000000002");
  const mv = await call(r, U.admin, { action: "staff_move", id: sid, to_store: "Шумен", date: "2026-12-01" });
  eq([mv.body.staff.store_name, mv.body.staff.sector_id], ["Шумен", undefined], "новият ред в Шумен е без сектора на Кърджали");
});

Deno.test("HTTP: OPTIONS, GET, лош JSON, непознато действие", async () => {
  const r = new MemRepo();
  const o = await handleGrafik(new Request("http://x", { method: "OPTIONS" }), () => r);
  eq([o.status, o.headers.get("Access-Control-Allow-Origin")], [200, "*"], "OPTIONS");
  eq((await handleGrafik(new Request("http://x", { method: "GET" }), () => r)).status, 405, "GET");
  eq((await handleGrafik(new Request("http://x", { method: "POST", body: "{" }), () => r)).status, 400, "лош JSON");
  eq((await call(r, U.admin, { action: "drop_table" })).status, 400, "непознато действие");
});

// ── v11 (11.11.2026): предишният месец в същия отговор, паралелни заявки ─────────────────────
Deno.test("load_month v11: prev_month — има / няма / без prev; prev_rows както досега", async () => {
  const r = new MemRepo();
  const ids = kStaff(r);
  const oct = await r.ensureMonth("Кърджали", "2026-10-01");
  r.rows.push({ month_id: oct.id, staff_id: ids[0], letters: ["П", "П"], locked: {} });
  const a = (await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11", prev: true })).body;
  eq([a.prev_month && a.prev_month.month_row.id, a.prev_month && a.prev_month.rows.length, a.prev_rows.length], [oct.id, 1, 1], "октомври — в същия отговор");
  const o = (await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-10" })).body;
  eq(JSON.stringify(a.prev_month.setup), JSON.stringify(o.setup), "настройката — за октомври (както load_month за октомври), не за ноември");
  assert(JSON.stringify(o.setup) !== JSON.stringify(a.setup), "(предпоставка) октомври и ноември са с различна настройка: " + o.setup.season + " / " + a.setup.season);
  const b = (await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  assert(!("prev_month" in b), "без prev — без prev_month (старият клиент не го иска)");
  const c = (await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-10", prev: true })).body;
  eq(c.prev_month, null, "септември го няма → null (браузърът не пита втори път)");
});

Deno.test("load_month v11: ТРЗ — предишният месец само ако е подаден; ритъмът — никога", async () => {
  const r = new MemRepo();
  const ids = kStaff(r);
  const nov = await r.ensureMonth("Кърджали", "2026-11-01"); nov.status = "submitted";
  const oct = await r.ensureMonth("Кърджали", "2026-10-01");
  r.rows.push({ month_id: oct.id, staff_id: ids[0], letters: ["П"], locked: {} });
  const a = (await call(r, U.trz, { action: "load_month", store: "Кърджали", month: "2026-11", prev: true })).body;
  eq([a.prev_month, a.prev_rows], [null, []], "октомври е чернова → ТРЗ не го вижда");
  oct.status = "submitted";
  const b = (await call(r, U.trz, { action: "load_month", store: "Кърджали", month: "2026-11", prev: true })).body;
  eq([b.prev_month && b.prev_month.rows.length, b.prev_rows], [1, []], "подаден → вижда го; ритъмът (prev_rows) пак празен");
});

Deno.test("load_month v11: отказът (403 / 400) е пръв, дори ако данните гърмят", async () => {
  const r = new MemRepo();
  kStaff(r);
  r.setupRaw = async () => { throw new Error("данните гърмят"); };
  eq((await call(r, U.mgrK, { action: "load_month", store: "Шумен", month: "2026-11" })).status, 403, "чужд обект → 403, не 500");
  eq((await call(r, U.admin, { action: "load_month", store: "Няма такъв", month: "2026-11" })).status, 400, "непознат обект → 400, не 500");
  eq((await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" })).status, 500, "своя обект — грешката на данните (500)");
});

Deno.test("load_month v11: заявките към базата — най-много три нива една след друга", async () => {
  const r = new MemRepo();
  const ids = kStaff(r);
  const oct = await r.ensureMonth("Кърджали", "2026-10-01");
  await r.ensureMonth("Кърджали", "2026-11-01");
  r.rows.push({ month_id: oct.id, staff_id: ids[0], letters: ["П"], locked: {} });
  // Ниво на заявка = 1 + най-високото ниво сред вече ЗАВЪРШИЛИТЕ при старта ѝ (всяка заявка — един такт).
  let done = 0, depth = 0;
  const seen: string[] = [];
  for (const k of ["getUser", "listAccess", "storeNames", "getMonth", "listStaff", "listRows", "setupRaw"] as const) {
    const orig = (r as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[k].bind(r);
    (r as unknown as Record<string, unknown>)[k] = async (...a: unknown[]) => {
      const lvl = done + 1; depth = Math.max(depth, lvl); seen.push(k + "@" + lvl);
      const v = await orig(...a);
      await new Promise((ok) => setTimeout(ok, 5));
      done = Math.max(done, lvl);
      return v;
    };
  }
  const res = await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11", prev: true });
  eq(res.status, 200, "зарежда");
  assert(depth <= 3, "нива: " + depth + " (" + seen.join(", ") + ")");
  assert(seen.indexOf("getUser@1") >= 0 && seen.indexOf("listAccess@1") >= 0, "потребителят и списъците — едновременно: " + seen.join(", "));
});

// ── Поправки 20.11.2026 (решения на Тенчо) ───────────────────────────────
// 5: „↩ Върни в чернова“ — ТРЗ виждат последното подаване и промените му; отметките остават; новото подаване го заменя.
Deno.test("reopen 20.11: ТРЗ виждат последното подаване, обектът — черновата", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const a = await chg(r, U.mgrK, { staff_id: ids[0], day: 3, actual: "Б", reason: "болничен 1" });
  eq((await call(r, U.trz, { action: "changes_trz", store: "Кърджали", month: "2026-11", id: a.body.row.id, done: true })).status, 200, "отметка преди връщане");
  eq((await call(r, U.admin, { action: "reopen", store: "Кърджали", month: "2026-11" })).status, 200, "върнат");
  // Обектът поправя черновата — ТРЗ не бива да го виждат: буквите и персонала.
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30(["ЗД", "ЗД"]) }] });
  await call(r, U.mgrK, { action: "staff_save", store: "Кърджали", id: ids[0], fields: { hours_per_day: 4 } });
  await call(r, U.mgrK, { action: "staff_save", store: "Кърджали", fields: { short_name: "НОВ", full_name: "Нов Човек", hired_on: "2026-12-01" } });   // от декември — не пречи на новото подаване за ноември
  const t = (await call(r, U.trz, { action: "load_month", store: "Кърджали", month: "2026-11", prev: true })).body;
  const t0 = t.rows.filter((x: RowRec) => x.staff_id === ids[0])[0];
  eq([t.status, t.month_row.status, t.month_row.submitted_by_name, t.reopened && t.reopened.by_name, t.can_edit], ["submitted", "submitted", "Управител Кърджали", "Тенчо Тенев", false], "ТРЗ: подаден, с етикета");
  eq(t0.letters.slice(0, 3), ["", "П", "П"], "буквите — подадените, не новата чернова");
  assert(!("letters" in t.month_row.snapshot) && !("staff" in t.month_row.snapshot) && Array.isArray(t.month_row.snapshot.rows), "снимката е без letters и staff, с rows");
  const ts0 = t.staff.filter((x: Staff) => x.id === ids[0])[0];
  eq([t.staff.length, ts0.hours_per_day === 4, t.staff.some((x: Staff) => x.short_name === "НОВ")], [ids.length, false, false], "ТРЗ: персоналът към връщането — без новия и без новия договор");
  const m = (await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  const m0 = m.rows.filter((x: RowRec) => x.staff_id === ids[0])[0];
  eq([m.status, m.month_row.snapshot, m.reopened && m.reopened.by_name, m0.letters.slice(0, 2), m.can_edit], ["draft", null, "Тенчо Тенев", ["ЗД", "ЗД"], true], "обектът: чернова, без пазената снимка");
  eq([m.staff.length, m.staff.some((x: Staff) => x.short_name === "НОВ")], [ids.length + 1, true], "обектът: текущият персонал");
  // Промените на върнатия месец: ТРЗ ги четат и отмятат; обектът не пише.
  const tl = (await call(r, U.trz, { action: "changes_list", store: "Кърджали", month: "2026-11" })).body;
  eq([tl.rows.length, tl.rows[0].trz_done], [1, true], "ТРЗ: промяната и отметката остават");
  eq((await call(r, U.trz, { action: "changes_trz", store: "Кърджали", month: "2026-11", id: a.body.row.id, done: false })).status, 200, "ТРЗ махат отметката и в чернова");
  eq((await chg(r, U.mgrK, { staff_id: ids[0], day: 4, actual: "О", reason: "x" })).body.reason, "not_submitted", "обектът не пише промени в чернова");
  // Обзор: ТРЗ — подаден с етикета; admin — чернова с етикета.
  const ot = (await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores.filter((x: { store: string }) => x.store === "Кърджали")[0];
  eq([ot.status, ot.submitted_by_name, ot.reopened.by_name, ot.changes], ["submitted", "Управител Кърджали", "Тенчо Тенев", 1], "обзор ТРЗ");
  const oa = (await call(r, U.admin, { action: "overview", month: "2026-11" })).body.stores.filter((x: { store: string }) => x.store === "Кърджали")[0];
  eq([oa.status, oa.reopened.by_name, oa.off_norm, oa.changes], ["draft", "Тенчо Тенев", null, null], "обзор admin");
  // Новото подаване заменя пазената версия.
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30(["П"]) }] });
  eq((await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids) })).status, 200, "ново подаване");
  const t2 = (await call(r, U.trz, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq([t2.status, t2.reopened, (r.months[0].snapshot as Record<string, unknown>).reopened], ["submitted", null, undefined], "след подаване — без reopened");
});

Deno.test("reopen 20.11: черновата без подаване остава скрита за ТРЗ", async () => {
  const r = new MemRepo();
  await filled(r);
  eq((await call(r, U.trz, { action: "load_month", store: "Кърджали", month: "2026-11" })).body.reason, "not_submitted", "чернова — не");
  eq((await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores.length, 0, "в обзора — не");
  eq((await call(r, U.trz, { action: "changes_list", store: "Кърджали", month: "2026-11" })).body.reason, "not_submitted", "промени — не");
});

// 8: „Въведено от“ — с име.
Deno.test("changes_list 20.11: имената на въвелите и отметналите", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const a = await chg(r, U.mgrK, { staff_id: ids[0], day: 3, actual: "Б", reason: "болничен" });
  await call(r, U.trz, { action: "changes_trz", store: "Кърджали", month: "2026-11", id: a.body.row.id, done: true });
  r.changes.push({ ...r.changes[0], id: nid(), day: 5, created_by: "nqma@temax.bg", updated_by: null, trz_done: false });
  const l = (await call(r, U.mgrK, { action: "changes_list", store: "Кърджали", month: "2026-11" })).body;
  eq([l.names["tencho.tenev13@gmail.com"], l.names["trz@temax.bg"], l.names["nqma@temax.bg"]], ["Управител Кърджали", "ТРЗ", undefined], "имена; непознат имейл — без име");
});

// 9: „Служители“ в Обекти — активните в месеца.
Deno.test("overview 20.11: служителите — назначени и ненапуснали спрямо месеца", async () => {
  const r = new MemRepo();
  await filled(r);
  const k = kStaff(r);
  r.staff.push({ id: nid(), store_name: "Кърджали", short_name: "НАПУСНАЛ ОКТ", full_name: "x", sort_order: 0, left_on: "2026-10-31" });
  r.staff.push({ id: nid(), store_name: "Кърджали", short_name: "НАПУСКА 15.11", full_name: "x", sort_order: 0, left_on: "2026-11-15" });
  r.staff.push({ id: nid(), store_name: "Кърджали", short_name: "ОТ ДЕКЕМВРИ", full_name: "x", sort_order: 0, left_on: null, hired_on: "2026-12-01" });
  r.staff.push({ id: nid(), store_name: "Кърджали", short_name: "ОТ 30.11", full_name: "x", sort_order: 0, left_on: null, hired_on: "2026-11-30" });
  r.staff.push({ id: nid(), store_name: "Кърджали", short_name: "ОТ ЯНУАРИ", full_name: "x", sort_order: 0, left_on: null, hired_on: "2027-01-04" });
  const n = (mo: string) => (async () => (await call(r, U.admin, { action: "overview", month: mo })).body.stores.filter((x: { store: string }) => x.store === "Кърджали")[0].staff)();
  eq(await n("2026-11"), k.length + 2, "ноември: + напуска 15.11 и от 30.11; без напуснал октомври, от декември и от януари");
  eq(await n("2026-12"), k.length + 2, "декември: + от декември и от 30.11; без двамата напуснали и от януари");
  eq(await n("2027-01"), k.length + 3, "януари: + от декември, от 30.11 и от януари");
});

// ── Етап Б (24.11.2026): одобрение от ТРЗ и „↩ Върни с коментар“ ─────────────────
Deno.test("approve: ТРЗ и admin, един или масово, само подаден; manager / регионален — не", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const sh = await filled(r, "Шумен", U.regSh);
  eq((await call(r, U.regSh, { action: "submit", store: "Шумен", month: "2026-11", snapshot: snap(sh) })).status, 200, "Шумен подаден");
  await filled(r, "Добрич", U.regSh);                                      // Добрич — чернова
  const ap = (u: User, f: Record<string, unknown>) => call(r, u, { action: "approve", month: "2026-11", ...f });
  eq((await ap(U.mgrK, { store: "Кърджали" })).body.reason, "forbidden", "manager");
  eq((await ap(U.regSh, { store: "Шумен" })).body.reason, "forbidden", "регионален");
  eq((await ap(U.trz, {})).body.reason, "bad_request", "без обект");
  const x = (await ap(U.trz, { stores: ["Кърджали", "Шумен", "Добрич", "Няма такъв", "Кърджали"] })).body;
  eq(x.results.map((q: { store: string; ok: boolean; reason?: string }) => q.store + ":" + (q.ok ? "ok" : q.reason)), ["Кърджали:ok", "Шумен:ok", "Добрич:not_submitted", "Няма такъв:bad_request"], "масово: всеки поотделно, без дубликати");
  eq(x.approved, 2, "одобрени 2");
  const k = r.months.filter((m) => m.store_name === "Кърджали")[0];
  eq([k.status, k.approved_by, k.approved_by_name, !!k.approved_at, k.submitted_by_name], ["approved", "trz@temax.bg", "ТРЗ", true, "Управител Кърджали"], "Кърджали — одобрен от ТРЗ, подаването остава");
  eq((await ap(U.admin, { store: "Кърджали" })).body.results[0].reason, "approved", "вече одобрен");
  eq(r.audits.filter((a) => a.event === "grafik_approve").length, 2, "audit за двата");
  // Одобреният: заключен за обекта, с „Промени“; ТРЗ го виждат; правата в load_month.
  const t = (await call(r, U.trz, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq([t.status, t.can_approve, t.can_return, t.can_edit], ["approved", false, true, false], "ТРЗ: одобрен, само „Върни“");
  const mg = (await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq([mg.status, mg.can_edit, mg.can_approve, mg.can_return, mg.month_row.approved_by_name], ["approved", false, false, false, "ТРЗ"], "обектът: одобрен, заключен");
  eq((await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30(["П"]) }] })).status, 409, "save_rows — отказ");
  eq((await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids) })).status, 409, "submit — отказ");
  eq((await chg(r, U.mgrK, { staff_id: ids[0], day: 3, actual: "Б", reason: "болничен" })).status, 200, "„Промени“ — да (както при подаден)");
  eq((await call(r, U.mgrK, { action: "reopen", store: "Кърджали", month: "2026-11" })).body.reason, "forbidden", "старият reopen — manager не");
  eq((await call(r, U.admin, { action: "reopen", store: "Кърджали", month: "2026-11" })).body.reason, "not_submitted", "старият reopen — само подаден, не одобрен");
  // Обзор и me.
  const o = (await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores;
  const ok = o.filter((s: { store: string }) => s.store === "Кърджали")[0];
  eq([ok.status, ok.approved_by_name, ok.can_approve, ok.can_return, Array.isArray(ok.off_norm), ok.changes], ["approved", "ТРЗ", false, true, true, 1], "обзор ТРЗ: одобрен, с извън нормата и промените");
  eq(o.map((s: { store: string }) => s.store).sort(), ["Кърджали", "Шумен"], "ТРЗ: Добрич (чернова) го няма");
  const ad = (await call(r, U.admin, { action: "overview", month: "2026-11" })).body.stores.filter((s: { store: string }) => s.store === "Шумен")[0];
  eq([ad.status, ad.can_approve, ad.can_return], ["approved", false, true], "admin: одобрен Шумен — само „Върни“");
  const rg = (await call(r, U.regSh, { action: "overview", month: "2026-11" })).body.stores.filter((s: { store: string }) => s.store === "Шумен")[0];
  eq([rg.status, rg.can_approve, rg.can_return], ["approved", false, false], "регионален: одобрен — без бутони");
  const me = async (u: User) => (await call(r, u, { action: "me" })).body.can_approve;
  eq([await me(U.trz), await me(U.admin), await me(U.regSh), await me(U.mgrK)], [true, true, false, false], "me.can_approve");
});

Deno.test("return: коментар задължителен; одобрен — ТРЗ и admin; подаден — и регионалният", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const sh = await filled(r, "Шумен", U.regSh);
  await call(r, U.regSh, { action: "submit", store: "Шумен", month: "2026-11", snapshot: snap(sh) });
  const ret = (u: User, store: string, comment?: unknown) => call(r, u, { action: "return", store, month: "2026-11", ...(comment === undefined ? {} : { comment }) });
  eq((await ret(U.trz, "Кърджали")).body.reason, "bad_request", "без коментар");
  eq((await ret(U.trz, "Кърджали", "   ")).body.reason, "bad_request", "празен коментар");
  eq((await ret(U.trz, "Кърджали", "x".repeat(501))).body.reason, "bad_request", "над 500 знака");
  eq((await ret(U.mgrK, "Кърджали", "моля")).body.reason, "forbidden", "manager — не");
  eq((await ret(U.regSh, "Кърджали", "моля")).body.reason, "forbidden_store", "регионален — чужд обект");
  // Регионалният: подаден — да; одобрен — не.
  await call(r, U.trz, { action: "approve", month: "2026-11", store: "Шумен" });
  const rj = await ret(U.regSh, "Шумен", "моля");
  eq([rj.status, rj.body.reason, rj.body.message], [403, "forbidden", "Одобрен график връщат ТРЗ и admin."], "регионален — одобрен не");
  // ТРЗ връща одобрения Кърджали с коментар.
  await call(r, U.admin, { action: "approve", month: "2026-11", store: "Кърджали" });
  const x = await ret(U.trz, "Кърджали", "  Иван на 5.11   — няма смяна  ");
  eq([x.status, x.body.status, x.body.comment], [200, "draft", "Иван на 5.11 — няма смяна"], "ТРЗ връща одобрен; интервалите се свиват");
  const k = r.months.filter((m) => m.store_name === "Кърджали")[0];
  const reo = (k.snapshot as Record<string, Record<string, unknown>>).reopened;
  eq([k.status, k.approved_at, k.approved_by_name, k.submitted_by, k.return_comment, k.returned_by_name, reo.comment, reo.was, reo.submitted_by_name],
    ["draft", null, null, null, "Иван на 5.11 — няма смяна", "ТРЗ", "Иван на 5.11 — няма смяна", "approved", "Управител Кърджали"], "чернова; одобрението — нулирано; коментарът — в колоните и в reopened");
  eq(r.audits.filter((a) => a.event === "grafik_return").length, 1, "audit grafik_return");
  // Обектът вижда коментара и може да редактира; ТРЗ — последното подаване с коментара.
  const mg = (await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq([mg.status, mg.can_edit, mg.reopened.comment, mg.reopened.by_name], ["draft", true, "Иван на 5.11 — няма смяна", "ТРЗ"], "обектът: чернова с коментара");
  const t = (await call(r, U.trz, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq([t.status, t.reopened.comment, t.can_approve, t.can_return], ["submitted", "Иван на 5.11 — няма смяна", false, false], "ТРЗ: последното подаване, без бутони");
  const ot = (await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores.filter((s: { store: string }) => s.store === "Кърджали")[0];
  eq([ot.status, ot.reopened.comment, ot.can_approve, ot.can_return], ["submitted", "Иван на 5.11 — няма смяна", false, false], "обзор ТРЗ: върнат — с коментара, без бутони");
  eq((await ret(U.trz, "Кърджали", "пак")).body.reason, "not_submitted", "чернова — не");
  // Новото подаване: лентата изчезва (reopened), коментарът се изчиства от колоните (решение на Тенчо 24.11) — историята е в одита.
  eq((await call(r, U.mgrK, { action: "submit", store: "Кърджали", month: "2026-11", snapshot: snap(ids) })).status, 200, "ново подаване");
  const m2 = (await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" })).body;
  eq([m2.status, m2.reopened, m2.month_row.return_comment, m2.month_row.returned_at, m2.month_row.returned_by_name, m2.can_approve], ["submitted", null, null, null, null, false], "подаден наново: без лента, коментарът е изчистен от колоните (решение 24.11)");
  eq((r.audits.filter((a) => a.event === "grafik_return")[0] as unknown as { details: Record<string, unknown> }).details.comment, "Иван на 5.11 — няма смяна", "историята остава в одита");
  eq((await call(r, U.trz, { action: "approve", month: "2026-11", store: "Кърджали" })).body.approved, 1, "и пак може да се одобри");
  // Регионалният връща свой подаден (Шумен е одобрен → първо ТРЗ го връща, после подаване).
  eq((await ret(U.trz, "Шумен", "провери Шумен")).status, 200, "ТРЗ връща одобрения Шумен");
  await call(r, U.regSh, { action: "submit", store: "Шумен", month: "2026-11", snapshot: snap(sh) });
  eq((await ret(U.regSh, "Шумен", "сам си го връщам")).status, 200, "регионален — свой подаден, с коментар");
});

// ── Етап Б: ПИН за графика (27.11.2026) ────────────────────────────────────
const TEO: User = { id: nid(), email: "t.tenev@temax.bg", display_name: "Теодор Тенев", store_name: "Централен офис", role: "admin", is_regional: false, assigned_stores: null, active: true };
function withTeo(r: MemRepo, canReset: boolean) {
  r.users.push(TEO);
  r.access.push({ id: nid(), list: "view", email: TEO.email, note: null, can_reset_pin: canReset });
}
const pinCall = (r: MemRepo, who: User, action: string, f: Record<string, unknown> = {}, opts: { pin?: boolean | string; now?: number } = {}) =>
  call(r, who, { action, ...f }, { pin: false, ...opts });

Deno.test("ПИН: без ключ — me без обекти, всичко друго 401 pin_required, базата непокътната", async () => {
  const r = new MemRepo();
  await filled(r);                                                  // (с ключ — помощникът)
  const me = await pinCall(r, U.mgrK, "me");
  eq([me.status, me.body.unlocked, me.body.stores, me.body.pin.state, me.body.kind], [200, false, [], "none", "manager"], "me без ключ");
  assert(!("pin_token" in me.body), "me без ключ не издава ключ");
  const before = JSON.stringify([r.rows, r.staff, r.months, r.access]);
  const nAud = r.gaudits.length;
  for (const action of ["load_month", "overview", "staff_list", "changes_list", "save_rows", "submit", "staff_save", "access_list", "access_add", "audit_list", "log", "pin_reset", "pin_change", "pin_touch", "admin_get", "nyama_takova"]) {
    const x = await pinCall(r, U.admin, action, { store: "Кърджали", month: "2026-11" });
    eq([x.status, x.body.reason], [401, "pin_required"], action + " без ключ");
  }
  eq(JSON.stringify([r.rows, r.staff, r.months, r.access]), before, "нищо не е записано");
  eq(r.gaudits.length, nAud, "отказите без ключ не се пишат като четене");
});

Deno.test("ПИН: pin_set — формат, лесни, задаване, втори път 409; ключът отваря данните", async () => {
  const r = new MemRepo();
  for (const bad of ["", "abc", "123", "1234567", "12 34", 1234]) eq((await pinCall(r, U.mgrK, "pin_set", { pin: bad })).body.reason, "pin_format", "формат: " + String(bad));
  for (const weak of ["0000", "1111", "1234", "4321", "123456", "98765", "666666"]) eq((await pinCall(r, U.mgrK, "pin_set", { pin: weak })).body.reason, "pin_weak", "лесен: " + weak);
  eq(r.pins[U.mgrK.id], undefined, "нищо не е записано при отказ");
  const s = await pinCall(r, U.mgrK, "pin_set", { pin: " 2580 " });
  eq([s.status, s.body.pin_state, typeof s.body.pin_token, typeof s.body.pin_exp], [200, "set", "string", "number"], "зададен, с ключ");
  eq(r.pins[U.mgrK.id].hash, "h:2580", "записан е хешът (repo.hashPin), не самият ПИН");
  eq((await pinCall(r, U.mgrK, "pin_set", { pin: "3690" })).body.reason, "pin_exists", "втори път — 409, не се презаписва");
  eq(r.pins[U.mgrK.id].hash, "h:2580", "…и хешът е старият");
  eq(r.gaudits.filter((e) => e.event === "grafik_pin_set").length, 1, "grafik_pin_set — в grafik_audit");
  eq(r.audits.filter((e) => e.event.indexOf("pin") >= 0).length, 0, "ПИН събитията НЕ отиват в audit_log (четим с публичния ключ)");
});

Deno.test("ПИН: ключът — за същия човек, същото влизане, 15 мин, подновява се; не е пропуск", async () => {
  const r = new MemRepo();
  const sess = await signSession({ uid: U.mgrK.id, role: "manager", email: U.mgrK.email });
  const t0 = Math.floor(Date.now() / 1000);
  const tok = (await signPinToken(U.mgrK.id, iatOf(sess), t0)).token;
  const lm = (o: { session?: unknown; pin?: string; now?: number }) => call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" }, { session: sess, ...o });
  const ok1 = await lm({ pin: tok, now: t0 + 14 * 60 });
  eq(ok1.status, 200, "след 14 мин — още важи");
  eq(ok1.body.pin_exp, t0 + 14 * 60 + 900, "…и отговорът носи нов ключ за още 15 мин от сега");
  eq((await lm({ pin: ok1.body.pin_token, now: t0 + 28 * 60 })).status, 200, "новият ключ важи след 28 мин от първия (плъзгащ се срок)");
  eq((await lm({ pin: tok, now: t0 + 15 * 60 })).body.reason, "pin_required", "старият — точно на 15-ата минута изтича");
  const other = (await signPinToken(U.sklK.id, iatOf(sess), t0)).token;
  eq((await lm({ pin: other })).body.reason, "pin_required", "чужд ключ (друг uid)");
  const sess2 = await signSession({ uid: U.mgrK.id, role: "manager", email: U.mgrK.email }, t0 + 5);
  eq((await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" }, { session: sess2, pin: tok })).body.reason, "pin_required", "ново влизане → нов ПИН");
  eq((await lm({ pin: tok.split(".")[0] + "." + "A".repeat(43) })).body.reason, "pin_required", "подправен подпис");
  eq((await lm({ pin: sess })).body.reason, "pin_required", "пропускът на портала не е ключ за графика");
  eq((await call(r, null, { action: "me" }, { session: tok })).status, 401, "ключът за графика не е пропуск за портала");
});

Deno.test("ПИН: грешни опити — 5 → 15 мин, 10 поредни → до нулиране; верен нулира брояча", async () => {
  const r = new MemRepo();
  await pinCall(r, U.mgrK, "pin_set", { pin: "2580" });
  const un = (pin: string) => pinCall(r, U.mgrK, "pin_unlock", { pin });
  eq([(await un("1111")).body.left, (await un("1112")).body.left], [4, 3], "остават 4, 3");
  const good = await un("2580");
  eq([good.status, typeof good.body.pin_token, r.pins[U.mgrK.id].fails], [200, "string", 0], "верен → ключ, броячът — 0");
  eq((await un("12")).body.reason, "pin_format", "лош формат…");
  eq(r.pins[U.mgrK.id].fails, 0, "…не изразходва опит");
  for (let i = 1; i <= 4; i++) eq((await un("1111")).body.reason, "pin_wrong", "грешен " + i);
  const fifth = await un("1111");
  eq([fifth.status, fifth.body.reason, typeof fifth.body.locked_until], [423, "pin_locked", "string"], "5-и грешен → заключен за 15 мин");
  const lockedGood = await un("2580");
  eq([lockedGood.status, lockedGood.body.reason, r.pins[U.mgrK.id].fails], [423, "pin_locked", 5], "заключен: и верният не минава и не се брои");
  eq((await pinCall(r, U.mgrK, "me")).body.pin.state, "locked", "me: locked");
  r.pins[U.mgrK.id].locked_until = new Date(Date.now() - 1000).toISOString();     // минали са 15 мин
  for (let i = 6; i <= 9; i++) { const x = await un("1111"); eq([x.status, x.body.left], [403, 10 - i], "грешен " + i + " — остават " + (10 - i)); }
  const tenth = await un("1111");
  eq([tenth.status, tenth.body.reason], [423, "pin_blocked"], "10-и поред → заключен до нулиране");
  eq((await un("2580")).body.reason, "pin_blocked", "и верният — не");
  eq((await pinCall(r, U.mgrK, "me")).body.pin.state, "blocked", "me: blocked");
  eq(r.gaudits.filter((e) => e.event === "grafik_pin_fail" && e.success === false).length, 12, "всеки изразходван грешен опит — в одита (2 + 4 + 1 + 4 + 1)");
  // Нулиране от admin → задава нов.
  const rs = await call(r, U.admin, { action: "pin_reset", user_id: U.mgrK.id });
  eq([rs.status, rs.body.reset, rs.body.email], [200, true, "tencho.tenev13@gmail.com"], "admin нулира");
  eq((await pinCall(r, U.mgrK, "me")).body.pin.state, "none", "след нулиране — няма ПИН");
  eq((await pinCall(r, U.mgrK, "pin_set", { pin: "3690" })).status, 200, "задава нов");
  eq((await un("3690")).status, 200, "новият работи");
});

Deno.test("ПИН: pin_reset — admin (edit) и упълномощеният view; другите не; себе си — не", async () => {
  const r = new MemRepo();
  withTeo(r, false);
  r.pins[U.mgrK.id] = { hash: "h:2580", fails: 0, locked_until: null, blocked: false };
  const rs = (who: User, uid: unknown) => call(r, who, { action: "pin_reset", user_id: uid });
  eq((await rs(U.mgrK, U.sklK.id)).status, 403, "manager — не");
  eq((await rs(U.trz, U.mgrK.id)).status, 403, "ТРЗ — не");
  eq((await rs(U.regSh, U.mgrK.id)).status, 403, "регионален — не");
  eq((await rs(TEO, U.mgrK.id)).status, 403, "Теодор без can_reset_pin — не");
  r.access.filter((a) => a.email === TEO.email)[0].can_reset_pin = true;
  eq((await rs(TEO, U.mgrK.id)).body.reset, true, "Теодор с can_reset_pin — да (въпреки view)");
  eq((await rs(TEO, U.mgrK.id)).body.reset, false, "втори път — нямаше ПИН (200, reset false)");
  eq((await rs(TEO, TEO.id)).body.reason, "self", "себе си — не");
  eq((await rs(U.admin, U.admin.id)).body.reason, "self", "admin себе си — не");
  eq((await rs(U.admin, "не-uuid")).body.reason, "bad_request", "лош id");
  eq((await rs(U.admin, "99999999-0000-4000-8000-000000000000")).status, 404, "няма такъв");
  // Admin с роля „view“ не нулира (ролята в графика има предимство).
  r.access = r.access.filter((a) => a.email !== U.admin.email).concat([{ id: nid(), list: "view", email: U.admin.email, note: null }]);
  eq((await rs(U.admin, U.mgrK.id)).status, 403, "admin с view — не");
  eq(r.gaudits.filter((e) => e.event === "grafik_pin_reset").map((e) => (e.details as { email: string }).email), ["tencho.tenev13@gmail.com", "tencho.tenev13@gmail.com"], "одит — кого е нулирал");
});

Deno.test("ПИН: pin_change — сегашният се проверява (и се брои), новият — формат и не същият", async () => {
  const r = new MemRepo();
  r.pins[U.mgrK.id] = { hash: "h:2580", fails: 0, locked_until: null, blocked: false };
  const ch = (old: string, pin: string) => call(r, U.mgrK, { action: "pin_change", old, pin });
  eq((await ch("2580", "2580")).body.reason, "pin_same", "същият");
  eq((await ch("2580", "1234")).body.reason, "pin_weak", "лесен");
  eq((await ch("9999", "3690")).body.reason, "pin_wrong", "грешен сегашен");
  eq(r.pins[U.mgrK.id].fails, 1, "…и е изразходван опит");
  eq((await ch("2580", "3690")).status, 200, "сменен");
  eq([r.pins[U.mgrK.id].hash, r.pins[U.mgrK.id].fails], ["h:3690", 0], "новият хеш, броячът — 0");
  eq((await pinCall(r, U.mgrK, "pin_unlock", { pin: "2580" })).body.reason, "pin_wrong", "старият вече не отключва");
});

Deno.test("ПИН: access_list носи състоянието; Теодор (view + can_reset_pin) го вижда, но не пише", async () => {
  const r = new MemRepo();
  withTeo(r, true);
  r.pins[U.mgrK.id] = { hash: "h:2580", fails: 10, locked_until: null, blocked: true };
  r.pins[U.sklK.id] = { hash: "h:2580", fails: 5, locked_until: new Date(Date.now() + 600000).toISOString(), blocked: false };
  r.pins[U.regSh.id] = { hash: "h:2580", fails: 0, locked_until: null, blocked: false };
  const l = await call(r, TEO, { action: "access_list" });
  const st: Record<string, string> = {};
  (l.body.pins as { email: string; state: string }[]).forEach((p) => { st[p.email] = p.state; });
  eq([l.status, st["tencho.tenev13@gmail.com"], st["sklad.k@temax.bg"], st["t.ivanova@temax.bg"]], [200, "blocked", "locked", "set"], "състоянията");
  assert(!JSON.stringify(l.body).includes("h:2580"), "хешът не излиза");
  const me = (await call(r, TEO, { action: "me" })).body;
  eq([me.kind, me.can_admin, me.can_reset_pin], ["view", false, true], "me: view, без admin, може да нулира");
  for (const action of ["access_add", "access_set", "access_remove", "admin_get", "audit_list"]) {
    eq((await call(r, TEO, { action, role: "edit", email: "x@temax.bg", id: r.access[0].id })).status, 403, action + " — не");
  }
});

// ── Етап В: одит и на четенето (27.11.2026) ───────────────────────────────────
Deno.test("одит на четенето: кой, роля, обект, месец; веднъж на 10 мин; отказаното — също", async () => {
  const r = new MemRepo();
  const t0 = Math.floor(Date.now() / 1000 / 600) * 600 + 30;   // началото на 10-минутка — без да падне на границата
  const lm = (who: User, store: string, month = "2026-11", now = t0) => call(r, who, { action: "load_month", store, month }, { now });
  await lm(U.mgrK, "Кърджали");
  await lm(U.mgrK, "Кърджали", "2026-11", t0 + 60);
  const v = r.gaudits.filter((e) => e.event === "grafik_view_month");
  eq(v.length, 1, "същото до 10 мин — един ред");
  eq([v[0].user_email, v[0].user_role, v[0].grafik_kind, v[0].store_name, v[0].month, v[0].success], ["tencho.tenev13@gmail.com", "manager", "manager", "Кърджали", "2026-11", true], "полетата");
  assert(v[0].details === null, "без съдържание (details null)");
  await lm(U.mgrK, "Кърджали", "2026-12", t0 + 60);
  await lm(U.mgrK, "Кърджали", "2026-11", t0 + 700);
  eq(r.gaudits.filter((e) => e.event === "grafik_view_month").length, 3, "друг месец и след 10 мин — нови редове");
  const deny = await lm(U.mgrK, "Шумен");
  eq(deny.status, 403, "чужд обект — отказ");
  const d = r.gaudits.filter((e) => e.event === "grafik_view_month" && !e.success);
  eq([d.length, d[0].store_name, (d[0].details as { reason: string }).reason, d[0].dedup_key], [1, "Шумен", "forbidden_store", null], "отказаното — записано, без съвпадение");
  await call(r, U.admin, { action: "overview", month: "2026-11" });
  await call(r, U.admin, { action: "staff_list", store: "Раднево" });
  const ev = r.gaudits.map((e) => e.event);
  assert(ev.indexOf("grafik_view_overview") >= 0 && ev.indexOf("grafik_view_staff") >= 0, "обзор и персонал — в одита: " + ev.join(","));
  await call(r, U.admin, { action: "me" });
  assert(r.gaudits.every((e) => e.event !== "grafik_me"), "me (при влизане в портала) не се брои за отваряне");
});

Deno.test("одит: печат / файл (log) и промените — и в grafik_audit с месеца", async () => {
  const r = new MemRepo();
  eq((await call(r, U.mgrK, { action: "log", what: "export_trz", store: "Кърджали", month: "2026-11" })).status, 200, "log");
  eq((await call(r, U.mgrK, { action: "log", what: "print_grafik", store: "Кърджали", month: "2026-11" })).status, 200, "log печат");
  eq((await call(r, U.mgrK, { action: "log", what: "rm -rf", store: "Кърджали", month: "2026-11" })).body.reason, "bad_request", "непознато");
  eq((await call(r, U.mgrK, { action: "log", what: "export_trz", store: "Шумен", month: "2026-11" })).status, 403, "чужд обект");
  const x = r.gaudits.filter((e) => e.event === "grafik_export_trz")[0];
  eq([x.store_name, x.month, x.grafik_kind], ["Кърджали", "2026-11", "manager"], "файлът за ТРЗ — кой, обект, месец");
  assert(r.gaudits.some((e) => e.event === "grafik_print"), "печатът");
  await submittedK(r);
  const s = r.gaudits.filter((e) => e.event === "grafik_submit")[0];
  eq([!!s, s && s.month, s && s.store_name, r.audits.some((e) => e.event === "grafik_submit")], [true, "2026-11", "Кърджали", true], "подаването — и в двата одита");
});

Deno.test("audit_list: само admin (edit); филтри; дни 1–90", async () => {
  const r = new MemRepo();
  await call(r, U.mgrK, { action: "load_month", store: "Кърджали", month: "2026-11" });
  await call(r, U.regSh, { action: "load_month", store: "Шумен", month: "2026-11" });
  for (const u of [U.mgrK, U.trz, U.regSh]) eq((await call(r, u, { action: "audit_list" })).status, 403, "не-admin — " + u.email);
  const all = (await call(r, U.admin, { action: "audit_list" })).body;
  eq([all.days, all.rows.length >= 2], [30, true], "по подразбиране 30 дни");
  const byE = (await call(r, U.admin, { action: "audit_list", email: " T.Ivanova@temax.bg " })).body.rows;
  eq(byE.map((e: GAuditEntry) => e.store_name), ["Шумен"], "по имейл (малки букви)");
  const byS = (await call(r, U.admin, { action: "audit_list", store: "Кърджали" })).body.rows;
  eq(byS.map((e: GAuditEntry) => e.user_email), ["tencho.tenev13@gmail.com"], "по обект");
  eq((await call(r, U.admin, { action: "audit_list", days: 500 })).body.days, 30, "извън 1–90 → 30");
  eq((await call(r, U.admin, { action: "audit_list", days: 7 })).body.days, 7, "7 дни");
});

// ── Пакет 1 (27.11.2026) ──────────────────────────────────────────────────────
Deno.test("т.6 „К“ в „Промени“: обектът е задължителен, от списъка, не своят; записва се и в одита", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const k = (f: Record<string, unknown>) => chg(r, U.mgrK, { staff_id: ids[0], day: 5, actual: "К", reason: "заповед 12", ...f });
  const k0 = (await k({})).body, k1 = (await k({ trip_store: "  " })).body;
  eq([k0.reason, /избери обекта/.test(k0.message)], ["trip_store", true], "без обект — 400, „избери обекта“");
  eq([k1.reason, /избери обекта/.test(k1.message)], ["trip_store", true], "празен — 400, „избери обекта“");
  eq((await k({ trip_store: "Нямаго" })).body.reason, "trip_store", "непознат обект — 400");
  eq((await k({ trip_store: "Кърджали" })).body.reason, "trip_store", "своят обект — 400");
  eq(r.changes.length, 0, "нищо не е записано");
  const ok = await k({ trip_store: " Шумен " });
  eq([ok.status, ok.body.row.actual, ok.body.row.trip_store], [200, "К", "Шумен"], "К с обект — записан (без интервали)");
  const a = r.gaudits.filter((e) => e.event === "grafik_change_create").slice(-1)[0];
  eq((a.details as { trip_store: string }).trip_store, "Шумен", "обектът — в одита");
  // Смяна от К на Б — обектът пада (иначе ограничението в базата отказва).
  const upd = await chg(r, U.mgrK, { id: ok.body.row.id, staff_id: ids[0], day: 5, actual: "Б", reason: "болничен", trip_store: "Шумен" });
  eq([upd.status, upd.body.row.actual, upd.body.row.trip_store], [200, "Б", null], "Б с подаден обект → обектът е null");
});

Deno.test("т.6 „К“ — изисква код за договора, както работните букви", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  r.admin.grafik_letter_map = r.admin.grafik_letter_map.filter((l) => l.letter !== "К");
  eq((await chg(r, U.mgrK, { staff_id: ids[0], day: 5, actual: "К", reason: "x", trip_store: "Шумен" })).body.reason, "letter_contract", "без К в настройката — 400");
});

Deno.test("т.4 activeInMonth: целият месец Б / НО / майчинство → не; частично, отпуск, празен → да", () => {
  const S = "2026-11-01", D = 30, none = {};
  const fill = (v: string, n = 30) => new Array(n).fill(v);
  eq(activeInMonth({}, fill("Б"), none, S, D), false, "целият месец Б");
  eq(activeInMonth({}, fill("НО"), none, S, D), false, "целият месец НО");
  const bWithRest = fill("Б"); bWithRest[6] = ""; bWithRest[13] = "";
  eq(activeInMonth({}, bWithRest, none, S, D), false, "Б с почивки между тях");
  const part = fill("Б"); part[2] = "П"; part[3] = "ЛД";
  eq(activeInMonth({}, part, none, S, D), true, "Б 28 дни + 2 смени → активен");
  eq(activeInMonth({}, fill("О"), none, S, D), true, "целият месец платен отпуск → активен");
  eq(activeInMonth({}, fill("О4"), none, S, D), true, "О4 → активен");
  eq(activeInMonth({}, fill(""), none, S, D), true, "празен ред → активен (той е „извън нормата“)");
  eq(activeInMonth({}, fill("4"), none, S, D), true, "свободни часове → активен");
  eq(activeInMonth({}, fill("К"), none, S, D), true, "командировка → активен");
  const maj: Record<number, string> = {}; for (let d = 1; d <= 30; d++) maj[d] = "Майч";
  eq(activeInMonth({}, fill("П"), maj, S, D), false, "промени „Майч“ за всеки ден бият графика");
  eq(activeInMonth({}, fill("Б"), { 10: "ЛД" }, S, D), true, "промяна ЛД в един ден → активен");
  eq(activeInMonth({}, fill("Б"), { 10: "Н" }, S, D), false, "промяна Н (неплатен) → пак не");
  // Дните извън назначаването не се броят.
  const late = fill("П"); for (let i = 15; i < 30; i++) late[i] = "Б";
  eq(activeInMonth({ hired_on: "2026-11-16" }, late, none, S, D), false, "назначен на 16-и, оттогава само Б");
  eq(activeInMonth({ left_on: "2026-11-15" }, late, none, S, D), true, "напуснал на 15-и, дотогава П");
});

Deno.test("т.4 overview: „Активни“ до „Служители“; ТРЗ — null; без график — всички", async () => {
  const r = new MemRepo();
  const ids = kStaff(r);
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30(new Array(30).fill("Б")) }, { staff_id: ids[1], letters: L30(["П"]) }] });
  const k = ((await call(r, U.admin, { action: "overview", month: "2026-11" })).body.stores as { store: string; staff: number; active: number | null }[]);
  const ks = k.filter((s) => s.store === "Кърджали")[0], sh = k.filter((s) => s.store === "Шумен")[0];
  eq([ks.staff, ks.active], [2, 1], "Кърджали: 2 служители, 1 активен (другият — целия месец Б)");
  eq([sh.staff, sh.active], [1, 1], "Шумен без график — всички активни");
  const t = ((await call(r, U.trz, { action: "overview", month: "2026-11" })).body.stores as { active: number | null }[]);
  assert(t.every((s) => s.active === null), "ТРЗ — active null (както staff)");
});

Deno.test("т.7 „↩ Върни с коментар“ → писмо до потребителите на обекта с роля; без текста на коментара", async () => {
  const r = new MemRepo();
  await submittedK(r);
  // Кърджали: mgrK (beta) и sklK (beta) — получават; outside (Кърджали, без роля) и off (неактивен) — не.
  const ret = await call(r, U.trz, { action: "return", store: "Кърджали", month: "2026-11", comment: "Иван Иванов е с 8 ч. в повече" });
  eq([ret.status, ret.body.mail], [200, { to: 2, ok: true }], "върнат; писмо до двама");
  const m = r.mails[0];
  eq(m.to.slice().sort(), ["sklad.k@temax.bg", "tencho.tenev13@gmail.com"], "само активните на обекта с роля");
  assert(/Кърджали/.test(m.subject) && /ноември 2026/.test(m.subject), "темата — обект и месец: " + m.subject);
  assert(m.html.indexOf(PORTAL_URL) >= 0 && /върнат с коментар — виж го в портала/.test(m.html), "линк и текстът по решението");
  assert(!/Иван|8 ч/.test(m.subject + m.html), "текстът на коментара (имена) НЕ е в писмото");
  const a = r.gaudits.filter((e) => e.event === "grafik_return_mail")[0];
  eq([a.success, (a.details as { to: number }).to], [true, 2], "одит — брой получатели, без адресите");
});

Deno.test("т.7 писмото: без получатели — нищо; паднало — връщането остава, одит неуспешен; reopen — без писмо", async () => {
  const r = new MemRepo();
  await submittedK(r);
  r.access = r.access.filter((a) => a.email !== "tencho.tenev13@gmail.com" && a.email !== "sklad.k@temax.bg");
  const ret = await call(r, U.trz, { action: "return", store: "Кърджали", month: "2026-11", comment: "поправи" });
  eq([ret.status, ret.body.mail, r.mails.length], [200, { to: 0, ok: true }, 0], "никой с роля → без писмо");
  const r2 = new MemRepo();
  await submittedK(r2);
  r2.mailOk = false;
  const ret2 = await call(r2, U.trz, { action: "return", store: "Кърджали", month: "2026-11", comment: "поправи" });
  eq([ret2.status, ret2.body.status, ret2.body.mail.ok, r2.months[0].status], [200, "draft", false, "draft"], "resend-email пада → графикът пак е върнат");
  eq(r2.gaudits.filter((e) => e.event === "grafik_return_mail")[0].success, false, "одит — неуспешно");
  const r3 = new MemRepo();
  await submittedK(r3);
  await call(r3, U.admin, { action: "reopen", store: "Кърджали", month: "2026-11" });
  eq(r3.mails.length, 0, "„↩ Върни в чернова“ (без коментар) — без писмо");
});

Deno.test("returnMail: екранира обекта; само обект, месец, линк", () => {
  const x = returnMail("<Обект & \"1\">", "2026-12-01");
  assert(x.html.indexOf("&lt;Обект &amp; &quot;1&quot;&gt;") >= 0 && x.html.indexOf("<Обект") < 0, "екраниран обект");
  assert(/декември 2026/.test(x.subject), "месецът с думи");
});

Deno.test("log: новите видове — ZIP, обобщение, присъствена към днес", async () => {
  const r = new MemRepo();
  for (const w of ["export_zip", "export_summary", "print_presence_today"]) eq((await call(r, U.admin, { action: "log", what: w, store: "Кърджали", month: "2026-11" })).status, 200, w);
  const ev = r.gaudits.map((e) => e.event);
  assert(["grafik_export_zip", "grafik_export_summary", "grafik_print_presence_today"].every((e) => ev.indexOf(e) >= 0), ev.join(","));
});

// ── Пакет 1, т.8 (27.11.2026): регионален с роля edit пише само в своите обекти, дори да е admin в портала ──
Deno.test("т.8 регионален admin (edit): свой обект — пише; чужд — чете, 403 при запис; admin без is_regional — всички", async () => {
  const r = new MemRepo();
  // v.filev: admin в портала, is_regional, assigned = Шумен + логистичен склад (без ВТР); в beta (= edit).
  r.stores.push("Логистичен склад Добрич");
  const reg = { ...U.admReg, assigned_stores: ["Шумен", "Логистичен склад Добрич"] };
  r.users = r.users.map((u) => u.id === reg.id ? reg : u);
  const sh = kStaff(r, "Шумен")[0], kj = kStaff(r)[0], rd = kStaff(r, "Раднево")[0];
  const save = (u: User, store: string, sid: string) => call(r, u, { action: "save_rows", store, month: "2026-11", rows: [{ staff_id: sid, letters: L30(["П"]) }] });
  const table: [string, User, string, string, number][] = [
    ["регионален admin — свой (Шумен)", reg, "Шумен", sh, 200],
    ["регионален admin — чужд (Кърджали)", reg, "Кърджали", kj, 403],
    ["регионален admin — чужд (Раднево)", reg, "Раднево", rd, 403],
    ["admin без is_regional — Кърджали", U.admin, "Кърджали", kj, 200],
    ["admin без is_regional — Раднево", U.admin, "Раднево", rd, 200],
    ["регионален (accounting) — свой (Шумен)", U.regSh, "Шумен", sh, 200],
    ["регионален (accounting) — чужд (Кърджали)", U.regSh, "Кърджали", kj, 403],
  ];
  for (const [name, u, store, sid, want] of table) eq((await save(u, store, sid)).status, want, name);
  eq((await call(r, reg, { action: "load_month", store: "Кърджали", month: "2026-11" })).body.can_edit, false, "чужд — чете, без редакция");
  eq((await call(r, reg, { action: "load_month", store: "Шумен", month: "2026-11" })).body.can_edit, true, "свой — редакция");
  for (const [action, body] of [
    ["staff_save", { store: "Кърджали", fields: { short_name: "Х", full_name: "Х Х" } }],
    ["sector_save", { store: "Кърджали", name: "Нов" }],
    ["admin_get", {}], ["access_list", {}],
    ["staff_move", { id: sh, to_store: "Кърджали", date: "2026-12-01" }],
  ] as [string, Record<string, unknown>][]) eq((await call(r, reg, { action, ...body })).status, 403, "регионален admin — " + action + " — 403");
  const r2 = new MemRepo(); r2.users = r2.users.map((u) => u.id === reg.id ? reg : u);
  await submittedK(r2);
  eq((await call(r2, reg, { action: "approve", store: "Кърджали", month: "2026-11" })).status, 403, "не одобрява (и в чужд)");
  eq((await call(r2, reg, { action: "return", store: "Кърджали", month: "2026-11", comment: "x" })).status, 403, "не връща чужд");
  eq(r2.months[0].status, "submitted", "…и месецът е непокътнат");
  // me: всички обекти за четене; логистичният склад — без ВТР → in_scope: false (браузърът не го предлага).
  const me = (await call(r, reg, { action: "me" })).body;
  const st: Record<string, { can_edit: boolean; in_scope: boolean }> = {};
  (me.stores as { name: string; can_edit: boolean; in_scope: boolean }[]).forEach((x) => { st[x.name] = x; });
  eq([me.kind, me.can_admin, st["Шумен"].can_edit, st["Кърджали"].can_edit, st["Логистичен склад Добрич"].in_scope, st["Шумен"].in_scope],
    ["regional", false, true, false, false, true], "me: свой — пише; чужд — чете; складът — извън обхвата");
  const ov = (await call(r, reg, { action: "overview", month: "2026-11" })).body;
  assert(ov.status !== 500 && !(ov.stores as { store: string }[]).some((x) => x.store === "Логистичен склад Добрич"), "обзорът — без склада, без грешка");
});

Deno.test("sofiaMonthStart: границата на месеца по българско време", () => {
  eq(sofiaMonthStart(Date.UTC(2026, 10, 30, 22, 30) / 1000), "2026-12-01", "30.11 22:30 UTC = 01.12 00:30 София");
  eq(sofiaMonthStart(Date.UTC(2026, 10, 30, 21, 30) / 1000), "2026-11-01", "30.11 21:30 UTC = 23:30 София");
});

// ── Пакет 2А: „✅ Днес“ — дневна присъствена (план и решения на Тенчо 27.11.2026) ──────────────
// submittedK: ids[0] П на 2 и 3 (Д1/З), ids[1] О на 2, НО на 4; другите дни — почивка. 8.11 — неделя.
const D3 = dayClock("2026-11", 3);          // 03.11.2026 12:00 София
const dget = (r: MemRepo, who: User, f: Record<string, unknown> = {}, now = D3) => call(r, who, { action: "daily_get", store: "Кърджали", month: "2026-11", ...f }, { now });
const dsave = (r: MemRepo, who: User, date: string, marks: Record<string, unknown>[], f: Record<string, unknown> = {}, now = D3) =>
  call(r, who, { action: "daily_save", store: "Кърджали", month: "2026-11", date, marks, ...f }, { now });
const regK = (r: MemRepo): User => {
  const u: User = { id: nid(), email: "reg.k@temax.bg", display_name: "Регионален Кърджали", store_name: "Централен офис", role: "accounting", is_regional: true, assigned_stores: ["Кърджали"], active: true };
  r.users.push(u); r.access.push({ id: nid(), list: "edit", email: u.email, note: null }); return u;
};

Deno.test("2А чисти: днес по София, прозорец 2 дни назад, отметки, основание", () => {
  eq(sofiaToday(Date.UTC(2026, 10, 26, 22, 30) / 1000), "2026-11-27", "26.11 22:30 UTC = 27.11 по София");
  eq(sofiaToday(Date.UTC(2026, 10, 26, 21, 30) / 1000), "2026-11-26", "26.11 21:30 UTC = 23:30 София");
  eq([STORE_BACK_DAYS, shiftDate("2026-12-01", -2), shiftDate("2026-11-30", 1)], [2, "2026-11-29", "2026-12-01"], "отместване през месеца");
  eq(["2026-11-27", "2026-11-25", "2026-11-24", "2026-11-28"].map((d) => inStoreWindow(d, "2026-11-27")), [true, true, false, false], "днес, точно 2 назад — да; 3 назад и утре — не");
  eq(markError({ state: "present" }, "П"), null, "дошъл на смяна");
  eq(markError({ state: "present" }, ""), "не е на смяна по график", "дошъл без смяна — с „Дошъл, без да е на смяна“");
  eq(markError({ state: "off" }, "П"), "на смяна е по график", "„не е на смяна“ за човек на смяна");
  eq(markError({ state: "absent", actual: "X" }, "П") !== null, true, "непозната причина");
  eq(markError({ state: "absent", actual: "Б" }, "П"), null, "Б");
  eq(markError({ state: "other_shift", actual: "П" }, "П") !== null, true, "друга смяна = същата");
  eq(markError({ state: "other_shift", actual: "К" }, "П") !== null, true, "К не е „друга смяна“ — има си бутон");
  eq(markError({ state: "extra", actual: "ЗД" }, "О"), null, "в отпуск, а е дошъл");
  eq(markError({ state: "trip", trip_store: " " }, "П") !== null, true, "К без обект");
  eq(markError({ state: "unknown" }, "П"), null, "неуточнено — за човек на смяна");
  eq(markError({ state: "unknown" }, "") !== null, true, "неуточнено — не и за човек без смяна");
  eq(markError({ state: "present", note: "x".repeat(201) }, "П") !== null, true, "бележка над 200");
  eq([markActual({ state: "absent", actual: "Н" }, "НО"), markActual({ state: "absent", actual: "Б" }, "П"), markActual({ state: "trip" }, "К"), markActual({ state: "unknown" }, "П")],
    [null, "Б", null, null], "НО = Н; К по график = К; неуточнено — без промяна");
  eq(dailyReason("Б", "  лист   № 5 "), "Дневна присъствена — болничен: лист № 5", "основанието");
  eq(dailyReason("ЗД", null), "Дневна присъствена — смяна ЗД", "смяна");
});

Deno.test("2А daily_get: хората от снимката, смяната, назначените към датата; нов човек — в missing", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  r.staff.filter((s) => s.id === ids[0])[0].sector_id = "5ec00000-0000-4000-8000-000000000002";   // Каса
  const nw = nid();
  r.staff.push({ id: nw, store_name: "Кърджали", short_name: "НОВ", full_name: "Нов След Подаването", sort_order: 0, left_on: null });
  const g = await dget(r, U.mgrK, { date: "2026-11-03" });
  eq(g.status, 200, "200");
  const b = g.body;
  eq([b.filed, b.date, b.today, b.can_mark, b.needs_reason, b.late, b.min_date, b.max_date], [true, "2026-11-03", "2026-11-03", true, false, false, "2026-11-01", "2026-11-03"], "днес, обектът");
  eq(b.people.map((p: { staff_id: string; planned_letter: string; planned_code: string; on_shift: boolean; sector: string }) => [p.staff_id === ids[0], p.planned_letter, p.planned_code, p.on_shift, p.sector]),
    [[true, "П", "Д1/З", true, "Каса"], [false, "", "", false, "Без сектор"]], "смяната от графика и снимката; секторът от персонала");
  eq(b.missing, ["Нов След Подаването"], "решение 4: новият човек — с име");
  r.staff.filter((s) => s.id === ids[1])[0].left_on = "2026-11-02";
  eq((await dget(r, U.mgrK, { date: "2026-11-03" })).body.people.length, 1, "напуснал преди датата — не");
  const d0 = await dget(r, U.mgrK);
  eq(d0.body.date, "2026-11-03", "без дата — днес");
  const late = await dget(r, U.mgrK, { date: "2026-11-01" }, dayClock("2026-11", 4));
  eq([late.body.can_mark, late.body.late, late.body.min_date], [false, true, "2026-11-02"], "3 дни назад — обектът не; изборът от 02.11");
  const ad = await dget(r, U.admin, { date: "2026-11-01" }, dayClock("2026-11", 4));
  eq([ad.body.can_mark, ad.body.needs_reason, ad.body.min_date], [true, true, "2026-11-01"], "admin — може, с основание");
  const fut = await dget(r, U.admin, { date: "2026-11-05" });
  eq(fut.body.can_mark, false, "бъдещ ден — никой");
});

Deno.test("2А daily_get: чернова → filed false; права за четене", async () => {
  const r = new MemRepo();
  const ids = kStaff(r);
  await call(r, U.mgrK, { action: "save_rows", store: "Кърджали", month: "2026-11", rows: [{ staff_id: ids[0], letters: L30(["", "П"]) }] });
  const g = await dget(r, U.mgrK, { date: "2026-11-03" });
  eq([g.status, g.body.filed, g.body.people.length, g.body.can_mark], [200, false, 0, false], "чернова — без хора");
  eq((await dsave(r, U.mgrK, "2026-11-03", [])).body.reason, "not_submitted", "чернова — запис не");
  eq((await dget(r, U.regSh, { date: "2026-11-03" })).status, 403, "регионален на друг обект — не чете");
  const t = await dget(r, U.trz, { date: "2026-11-03" });
  eq([t.status, t.body.can_mark], [200, false], "ТРЗ чете, не пише");
});

Deno.test("2А daily_save: всички дошли → ден + отметки, без промени; кой и кога; одит", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const s = await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "present" }, { staff_id: ids[1], state: "off" }]);
  eq(s.status, 200, "записано: " + JSON.stringify(s.body));
  eq([r.dailies.length, r.dailies[0].marked_by, r.dailies[0].marked_by_name, r.dailies[0].late, r.changes.length], [1, "tencho.tenev13@gmail.com", "Управител Кърджали", false, 0], "денят — кой; без промени");
  eq([s.body.daily.marked_by_name, s.body.people[0].mark.state], ["Управител Кърджали", "present"], "отговорът — денят наново");
  eq(r.dailyCalls.length, 1, "един запис (една транзакция)");
  eq(r.audits.slice(-1)[0].event, "grafik_daily_save", "одит");
  const ga = r.gaudits.filter((x) => x.event === "grafik_daily_save")[0];
  eq([ga.store_name, ga.month, (ga.details as Record<string, unknown>).date, (ga.details as Record<string, unknown>).first], ["Кърджали", "2026-11", "2026-11-03", true], "grafik_audit — обект, месец, ден");
});

Deno.test("2А daily_save: отклоненията → „Промени“ (source daily), без двойно въвеждане; обратно — махат се", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const s = await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "absent", actual: "Б", note: "лист 12" }, { staff_id: ids[1], state: "extra", actual: "П" }]);
  eq(s.status, 200, JSON.stringify(s.body));
  const c = r.changes.slice().sort((a) => (a.staff_id === ids[0] ? -1 : 1));
  eq(c.map((x) => [x.day, x.planned_letter, x.planned_code, x.actual, x.reason, x.source, x.created_by]),
    [[3, "П", "Д1/З", "Б", "Дневна присъствена — болничен: лист 12", "daily", "tencho.tenev13@gmail.com"],
     [3, "", "", "П", "Дневна присъствена — смяна П", "daily", "tencho.tenev13@gmail.com"]], "две промени — по график от сървъра, основание, source");
  eq(r.dailies[0].marks.map((m) => [m.state, m.actual, !!m.change_id]), [["absent", "Б", true], ["extra", "П", true]], "отметките сочат промените");
  const l = await call(r, U.trz, { action: "changes_list", store: "Кърджали", month: "2026-11" });
  eq(l.body.rows.map((x: ChangeRow) => x.source), ["daily", "daily"], "ТРЗ ги вижда в „Промени“ с източника");
  // Същото пак — без нов запис на промените.
  const before = JSON.stringify(r.changes);
  await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "absent", actual: "Б", note: "лист 12" }, { staff_id: ids[1], state: "extra", actual: "П" }]);
  eq([JSON.stringify(r.changes) === before, r.dailyCalls.slice(-1)[0].changes_upsert.length, r.dailies[0].updated_by], [true, 0, "tencho.tenev13@gmail.com"], "без промяна — без запис; денят — updated_by");
  // Обратно: дошъл / не е на смяна → промените се махат.
  await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "present" }, { staff_id: ids[1], state: "off" }]);
  eq(r.changes.length, 0, "махнати");
  eq(r.audits.filter((x) => x.event === "grafik_daily_save").length, 3, "всеки запис — в одита");
});

Deno.test("2А daily_save: друга смяна, командировка, неуточнено; проверките на „Промени“ важат", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const s = await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "other_shift", actual: "ЗД" }, { staff_id: ids[1], state: "off" }]);
  eq([s.status, r.changes[0].actual, r.changes[0].planned_letter], [200, "ЗД", "П"], "П → ЗД");
  const t = await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "trip", trip_store: "Шумен" }, { staff_id: ids[1], state: "off" }]);
  eq([t.status, r.changes.length, r.changes[0].actual, r.changes[0].trip_store, r.changes[0].reason], [200, 1, "К", "Шумен", "Дневна присъствена — командировка"], "К → обект (същият ред)");
  eq((await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "trip", trip_store: "Кърджали" }, { staff_id: ids[1], state: "off" }])).body.reason, "trip_store", "К в своя обект — отказ");
  const u = await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "unknown" }, { staff_id: ids[1], state: "off" }]);
  eq([u.status, r.changes.length, r.dailies[0].marks[0].state], [200, 0, "unknown"], "неуточнено — без промяна (присъствената остава по график, докато се уточни)");
  // Неделя 8.11: ЛД — отказ, както в „Промени“.
  const sun = await dsave(r, U.mgrK, "2026-11-08", [{ staff_id: ids[0], state: "extra", actual: "ЛД" }, { staff_id: ids[1], state: "off" }], {}, dayClock("2026-11", 8));
  eq(sun.body.reason, "sunday_ld", "ЛД в неделя");
  eq(r.dailies.length, 1, "…и денят не е записан");
});

Deno.test("2А daily_save: непълно / грешно отбелязване → 400 със списъка, нищо не се записва", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const a = await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "present" }]);
  eq([a.status, a.body.reason, a.body.errors.length, a.body.errors[0].error], [400, "bad_marks", 1, "не е отбелязан"], "липсва човек");
  const b = await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "off" }, { staff_id: ids[1], state: "present" }]);
  eq(b.body.errors.map((e: { error: string }) => e.error), ["на смяна е по график", "не е на смяна по график"], "грешките по човек");
  eq((await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "present" }, { staff_id: ids[0], state: "present" }])).body.reason, "bad_request", "два пъти същият");
  eq((await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "present" }, { staff_id: ids[1], state: "off" }, { staff_id: nid(), state: "present" }])).body.reason, "not_in_schedule", "човек извън графика");
  eq((await dsave(r, U.mgrK, "2026-11-31", [])).body.reason, "bad_request", "31.11");
  eq([r.dailies.length, r.changes.length, r.dailyCalls.length], [0, 0, 0], "нищо не е записано");
});

Deno.test("2А прозорец: обектът — днес и 2 назад („късно“); 3 назад и бъдещ — не; офисът — с основание", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const all = [{ staff_id: ids[0], state: "present" }, { staff_id: ids[1], state: "off" }];
  const late = await dsave(r, U.mgrK, "2026-11-03", all, {}, dayClock("2026-11", 5));
  eq([late.status, r.dailies[0].late], [200, true], "2 дни назад — може, „късно“");
  const old = await dsave(r, U.mgrK, "2026-11-03", all, {}, dayClock("2026-11", 6));
  eq([old.status, old.body.reason], [409, "daily_locked"], "3 дни назад — заключено за обекта");
  assert(/днес и 2 дни назад \(04\.11–06\.11\)/.test(old.body.message), "съобщението с датите: " + old.body.message);
  eq((await dsave(r, U.mgrK, "2026-11-04", all, {}, D3)).body.reason, "future", "бъдещ ден");
  eq((await dsave(r, U.admin, "2026-11-04", all, {}, D3)).body.reason, "future", "бъдещ — и admin не");
  // В 00:30 София на 06.11 „днес“ вече е 06.11 — 03.11 е заключен.
  eq((await dsave(r, U.mgrK, "2026-11-03", all, {}, Math.floor(Date.UTC(2026, 10, 5, 22, 30) / 1000))).body.reason, "daily_locked", "денят е по София, не по UTC");
  const reg = regK(r);
  eq((await dsave(r, reg, "2026-11-03", all, {}, dayClock("2026-11", 20))).body.reason, "correct_reason", "регионален извън прозореца — без основание не");
  const c = await dsave(r, reg, "2026-11-03", [{ staff_id: ids[0], state: "absent", actual: "Б" }, { staff_id: ids[1], state: "off" }], { correct_reason: "болничен донесен на 20.11" }, dayClock("2026-11", 20));
  eq(c.status, 200, JSON.stringify(c.body));
  eq([r.dailies[0].marked_by, r.dailies[0].corrected_by, r.dailies[0].correct_reason, r.changes[0].actual], ["tencho.tenev13@gmail.com", "reg.k@temax.bg", "болничен донесен на 20.11", "Б"], "корекция — кой, основание; първият отбелязал остава");
  eq(r.audits.slice(-1)[0].event, "grafik_daily_correct", "одит — корекция");
  const ad = await dsave(r, U.admin, "2026-11-02", [{ staff_id: ids[0], state: "present" }, { staff_id: ids[1], state: "absent", actual: "Б" }], { correct_reason: "попълване" }, dayClock("2026-11", 20));
  eq(ad.status, 200, "admin — неотбелязан ден извън прозореца, с основание: " + JSON.stringify(ad.body));
});

Deno.test("2А права: склад, ТРЗ, преглед, чужд регионален — не пишат", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const all = [{ staff_id: ids[0], state: "present" }, { staff_id: ids[1], state: "off" }];
  eq((await dsave(r, U.sklK, "2026-11-03", all)).status, 403, "склад");
  eq((await dsave(r, U.trz, "2026-11-03", all)).status, 403, "ТРЗ");
  eq((await dsave(r, U.regSh, "2026-11-03", all)).status, 403, "регионален на друг обект");
  r.access.push({ id: nid(), list: "view", email: "viewer@temax.bg", note: null });
  const vw: User = { id: nid(), email: "viewer@temax.bg", display_name: "Преглед", store_name: "Централен офис", role: "admin", is_regional: false, assigned_stores: null, active: true };
  r.users.push(vw);
  eq((await dsave(r, vw, "2026-11-03", all)).status, 403, "преглед");
  eq((await call(r, vw, { action: "daily_resolve", store: "Кърджали", month: "2026-11", date: "2026-11-03", staff_id: ids[0], actual: "Б" }, { now: D3 })).status, 403, "преглед — и уточняване не");
  eq(r.dailies.length, 0, "нищо");
});

Deno.test("2А отразена в ТРЗ промяна за деня: обектът не я сменя през „Днес“; admin — да", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "absent", actual: "Б" }, { staff_id: ids[1], state: "off" }]);
  r.changes[0].trz_done = true;
  eq((await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "present" }, { staff_id: ids[1], state: "off" }])).body.reason, "trz_done", "махане — не");
  eq((await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "absent", actual: "О" }, { staff_id: ids[1], state: "off" }])).body.reason, "trz_done", "смяна — не");
  eq((await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "absent", actual: "Б" }, { staff_id: ids[1], state: "off" }])).status, 200, "същото — може (нищо не пипа)");
  eq((await dsave(r, U.admin, "2026-11-03", [{ staff_id: ids[0], state: "present" }, { staff_id: ids[1], state: "off" }])).status, 200, "admin — може");
  eq(r.changes.length, 0, "махната от admin");
});

Deno.test("2А daily_resolve: „неуточнено“ се уточнява и след прозореца; само то", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "unknown", note: "не вдига" }, { staff_id: ids[1], state: "off" }]);
  const res = (who: User, f: Record<string, unknown>, now = dayClock("2026-11", 12)) => call(r, who, { action: "daily_resolve", store: "Кърджали", month: "2026-11", date: "2026-11-03", staff_id: ids[0], ...f }, { now });
  eq((await res(U.mgrK, { actual: "П" })).body.reason, "bad_request", "само причина за отсъствие");
  const ok1 = await res(U.mgrK, { actual: "Б", note: "лист 77" });
  eq(ok1.status, 200, JSON.stringify(ok1.body));
  eq([r.changes.length, r.changes[0].actual, r.changes[0].reason, r.changes[0].source], [1, "Б", "Дневна присъствена — болничен: лист 77", "daily"], "промяната — 9 дни по-късно, от обекта");
  eq(r.dailies[0].marks.map((m) => m.state).sort(), ["absent", "off"], "отметката — absent; другите остават");
  eq(r.audits.slice(-1)[0].event, "grafik_daily_resolve", "одит");
  eq((await res(U.mgrK, { actual: "О" })).body.reason, "not_unknown", "вече уточнено — не (смяна — регионалният с корекция)");
  eq((await call(r, U.mgrK, { action: "daily_resolve", store: "Кърджали", month: "2026-11", date: "2026-11-04", staff_id: ids[0], actual: "Б" }, { now: dayClock("2026-11", 12) })).body.reason, "not_unknown", "неотбелязан ден — не");
});

Deno.test("2А „✎ Промени“ (решение 2): обектът — само днес и 2 назад; основанието — и по-късно; офисът — без промяна", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const at = (d: number) => ({ now: dayClock("2026-11", d) });
  const save = (who: User, f: Record<string, unknown>, d: number) => call(r, who, { action: "changes_save", store: "Кърджали", month: "2026-11", ...f }, at(d));
  eq((await save(U.mgrK, { staff_id: ids[0], day: 3, actual: "Б", reason: "x" }, 5)).status, 200, "2 дни назад — да");
  const id = r.changes[0].id;
  eq((await save(U.mgrK, { staff_id: ids[0], day: 2, actual: "Б", reason: "x" }, 5)).body.reason, "window", "3 дни назад — не");
  // Решение на Тенчо 28.11: бъдещ ден — ДА (планиран отпуск); заключени са само дните преди днес − 2.
  const fut = await save(U.mgrK, { staff_id: ids[0], day: 9, actual: "О", reason: "молба за отпуск № 4" }, 5);
  eq([fut.status, fut.body.row && fut.body.row.source], [200, "manual"], "бъдещ ден (планиран отпуск) — да");
  const fid = fut.body.row.id;
  eq((await save(U.mgrK, { id: fid, staff_id: ids[0], day: 10, actual: "О", reason: "молба № 4 — преместена" }, 5)).status, 200, "бъдещ — преместване в друг бъдещ ден: да");
  eq((await call(r, U.mgrK, { action: "changes_delete", store: "Кърджали", month: "2026-11", id: fid }, at(5))).status, 200, "бъдещ — триене: да");
  const msg = (await save(U.mgrK, { staff_id: ids[0], day: 2, actual: "Б", reason: "x" }, 5)).body.message;
  assert(/от 03\.11 нататък/.test(msg) && /бъдещите дни/.test(msg), "съобщението казва откъде нататък: " + msg);
  eq((await dsave(r, U.mgrK, "2026-11-09", [{ staff_id: ids[0], state: "absent", actual: "О" }, { staff_id: ids[1], state: "off" }], {}, dayClock("2026-11", 5))).body.reason, "future", "„✅ Днес“ — бъдещ ден пак не");
  eq((await save(U.mgrK, { id, staff_id: ids[0], day: 3, actual: "Б", reason: "болничен лист № 9" }, 20)).status, 200, "по-късно — само основанието: да");
  eq(r.changes[0].reason, "болничен лист № 9", "основанието е сменено");
  eq((await save(U.mgrK, { id, staff_id: ids[0], day: 3, actual: "О", reason: "x" }, 20)).body.reason, "window", "по-късно — „реално“ не");
  eq((await save(U.mgrK, { id, staff_id: ids[0], day: 20, actual: "Б", reason: "x" }, 20)).body.reason, "window", "преместване от стар ден в днешния — не");
  eq((await call(r, U.mgrK, { action: "changes_delete", store: "Кърджали", month: "2026-11", id }, at(20))).body.reason, "window", "по-късно — триене не");
  eq((await save(U.admin, { id, staff_id: ids[0], day: 3, actual: "О", reason: "поправка" }, 20)).status, 200, "admin — да");
  const reg = regK(r);
  eq((await save(reg, { staff_id: ids[0], day: 25, actual: "О", reason: "предварително" }, 3)).status, 200, "регионален — и бъдещ ден");
  eq((await call(r, reg, { action: "changes_delete", store: "Кърджали", month: "2026-11", id }, at(28))).status, 200, "регионален трие стар");
});

Deno.test("2А „Днес“ върху ръчна промяна: старото „реално“ и документът остават в основанието; ръчна редакция → source manual", async () => {
  const r = new MemRepo();
  const ids = await submittedK(r);
  const reg = regK(r);
  eq((await call(r, reg, { action: "changes_save", store: "Кърджали", month: "2026-11", staff_id: ids[0], day: 3, actual: "Б", reason: "болничен № 123" }, { now: D3 })).status, 200, "ръчна Б");
  await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "absent", actual: "О" }, { staff_id: ids[1], state: "off" }]);
  eq([r.changes.length, r.changes[0].actual, r.changes[0].source, r.changes[0].reason], [1, "О", "daily", "Дневна присъствена — платен отпуск (беше: Б — болничен № 123)"], "заменена, документът е в основанието");
  await dsave(r, U.mgrK, "2026-11-03", [{ staff_id: ids[0], state: "absent", actual: "Б" }, { staff_id: ids[1], state: "off" }]);
  eq(r.changes[0].reason, "Дневна присъствена — болничен", "дневна върху дневна — без „беше“");
  eq((await call(r, reg, { action: "changes_save", store: "Кърджали", month: "2026-11", id: r.changes[0].id, staff_id: ids[0], day: 3, actual: "Б", reason: "болничен № 9" }, { now: D3 })).status, 200, "ръчна редакция");
  eq(r.changes[0].source, "manual", "редът губи „дневна“");
});
