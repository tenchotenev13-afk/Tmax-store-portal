// supabase/functions/grafik-api/handler.test.ts
// deno test supabase/functions/grafik-api/handler.test.ts --allow-env
// База в паметта (MemRepo) — без мрежа. Проверява правата по вид × действие ×
// свой/чужд обект, пропуска, beta/ТРЗ списъците, клетките, снимката и валидността по дати.
import {
  handleGrafik, parseEmailList, parseMonth, resolveSetup, badCells, validAt, staffInMonth,
  type Repo, type User, type MonthRow, type RowRec, type Staff, type SetupRaw, type AdminTable,
} from "./handler.ts";
import { signSession } from "../_shared/session.ts";

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
  settings: Record<string, string> = { grafik_beta_users: BETA, grafik_trz_users: "TRZ@temax.bg" };
  stores = ["Кърджали", "Шумен", "Раднево", "Добрич"];
  months: MonthRow[] = [];
  rows: RowRec[] = [];
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
    grafik_letter_map: ["ЛД", "ЗД", "П", "В", "М", "О4", "К", "О", "Б", "НО"].map((l) => ({ id: nid(), vtr_id: VTR, letter: l, day_kind: "З1", code: "x", valid_from: null, valid_to: null })),
  };
  opened = 0;
  constructor() {
    for (const s of ["Кърджали", "Кърджали", "Шумен", "Раднево"]) {
      this.staff.push({ id: nid(), store_name: s, short_name: "ЛИЦЕ " + seq, full_name: "Лице " + seq, sort_order: 0, left_on: null });
    }
  }
  async getUser(id: string) { return this.users.filter((u) => u.id === id)[0] || null; }
  async getSettings(keys: string[]) { const o: Record<string, string> = {}; keys.forEach((k) => { if (this.settings[k] !== undefined) o[k] = this.settings[k]; }); return o; }
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
  async rowCounts(ids: string[]) { const o: Record<string, number> = {}; this.rows.forEach((r) => { if (ids.indexOf(r.month_id) >= 0) o[r.month_id] = (o[r.month_id] || 0) + 1; }); return o; }
  async listRows(monthId: string) { return this.rows.filter((r) => r.month_id === monthId); }
  async upsertRows(rows: RowRec[]) {
    for (const r of rows) {
      const cur = this.rows.filter((x) => x.month_id === r.month_id && x.staff_id === r.staff_id)[0];
      if (cur) Object.assign(cur, r); else this.rows.push({ ...r });
    }
  }
  async listStaff(store: string) { return this.staff.filter((s) => s.store_name === store); }
  async staffCounts(stores: string[] | null) { const o: Record<string, number> = {}; this.staff.forEach((s) => { if (!stores || stores.indexOf(s.store_name) >= 0) o[s.store_name] = (o[s.store_name] || 0) + 1; }); return o; }
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
        { vtr_id: VTR, months: { "1": "З2", "2": "З2", "3": "З2", "4": "Л", "5": "Л", "6": "Л", "7": "Л", "8": "Л", "9": "Л", "10": "Л", "11": "З2", "12": "З2" }, valid_from: null, valid_to: "2026-10-31" },
        { vtr_id: VTR, months: { "1": "З2", "2": "З2", "3": "З1", "4": "З1", "5": "Л", "6": "Л", "7": "Л", "8": "Л", "9": "Л", "10": "Л", "11": "З1", "12": "З1" }, valid_from: "2026-11-01", valid_to: null },
      ],
      letterMap: this.admin.grafik_letter_map as SetupRaw["letterMap"],
      extraDays: (this.admin.grafik_extra_days as SetupRaw["extraDays"]).filter((e) => !e.store_name || e.store_name === store),
    };
  }
  async letterSet() { return Array.from(new Set(this.admin.grafik_letter_map.map((r) => r.letter as string))); }
  async adminList(t: AdminTable) { return this.admin[t]; }
  async adminInsert(t: AdminTable, f: Record<string, unknown>) { const r = { id: nid(), ...f }; this.admin[t].push(r); return r; }
  async adminUpdate(t: AdminTable, id: string, f: Record<string, unknown>) { const r = this.admin[t].filter((x) => x.id === id)[0]; if (!r) return null; Object.assign(r, f); return r; }
  async adminDelete(t: AdminTable, id: string) { const n = this.admin[t].length; this.admin[t] = this.admin[t].filter((x) => x.id !== id); return this.admin[t].length < n; }
  async setStoreCompanyRef(store: string, c: string | null) { this.storeRef[store] = c; }
  async audit(e: { event: string; store_name: string | null }) { this.audits.push(e); }
}

async function call(repo: MemRepo, who: User | null, body: Record<string, unknown>, opts: { session?: unknown; method?: string; now?: number } = {}) {
  const session = "session" in opts ? opts.session : who ? await signSession({ uid: who.id, role: who.role || "", email: who.email }) : undefined;
  const req = new Request("http://x/grafik-api", {
    method: opts.method || "POST", headers: { "Content-Type": "application/json" },
    body: (opts.method || "POST") === "POST" ? JSON.stringify({ ...body, session }) : undefined,
  });
  const res = await handleGrafik(req, () => { repo.opened++; return repo; }, opts.now);
  return { status: res.status, body: res.status === 200 && (opts.method === "OPTIONS") ? null : await res.json().catch(() => null) };
}
const kStaff = (r: MemRepo, store = "Кърджали") => r.staff.filter((s) => s.store_name === store).map((s) => s.id);
const L30 = (fill: string[] = []) => { const a = new Array(30).fill(""); fill.forEach((v, i) => { a[i] = v; }); return a; };

// ── Чисти функции ─────────────────────────────────────────────────────────
Deno.test("parseEmailList: запетаи, интервали, главни букви, празни", () => {
  eq(parseEmailList(" A@x.bg, b@Y.bg ,, c@z "), ["a@x.bg", "b@y.bg", "c@z"], "разделяне");
  eq(parseEmailList(null), [], "null");
  eq(parseEmailList(""), [], "празно");
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
  r.settings.grafik_beta_users = "ten.tenev@temax.bg";
  eq((await call(r, U.mgrK, { action: "me" })).body.reason, "not_beta", "махнат от beta → веднага без достъп");
  delete (r.settings as Record<string, string>).grafik_beta_users;
  eq((await call(r, U.admin, { action: "me" })).body.reason, "not_beta", "без ключ → никой");
});

Deno.test("me: вид и видими обекти за всеки", async () => {
  const r = new MemRepo();
  const me = async (u: User) => (await call(r, u, { action: "me" })).body;
  const a = await me(U.admin); eq([a.kind, a.stores.length, a.can_admin], ["admin", 4, true], "admin");
  const t = await me(U.trz); eq([t.kind, t.stores.length, t.can_admin, t.stores.some((s: { can_edit: boolean }) => s.can_edit)], ["trz", 4, false, false], "ТРЗ (role admin) — само чете");
  const m = await me(U.mgrK); eq([m.kind, m.stores], ["manager", [{ name: "Кърджали", can_edit: true }]], "manager");
  const v = await me(U.sklK); eq([v.kind, v.stores], ["viewer", [{ name: "Кърджали", can_edit: false }]], "склад");
  const g = await me(U.regSh); eq([g.kind, g.stores.map((s: { name: string }) => s.name), g.can_reopen], ["regional", ["Шумен", "Добрич"], true], "регионален");
  const ar = await me(U.admReg); eq(ar.kind, "admin", "admin с is_regional остава admin");
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
const snap = (ids: string[], days = 30) => ({ rows: ids.map((id) => ({ staff_id: id, codes: new Array(days).fill("") })),
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
  eq([x.body.status, r.months[0].status, r.months[0].snapshot], ["draft", "draft", null], "admin връща, снимката се маха");
  eq((await call(r, U.admin, { action: "reopen", store: "Кърджали", month: "2026-11" })).body.reason, "not_submitted", "вече е чернова");
  const sh = await filled(r, "Шумен", U.regSh);
  await call(r, U.regSh, { action: "submit", store: "Шумен", month: "2026-11", snapshot: snap(sh) });
  eq((await call(r, U.regSh, { action: "reopen", store: "Шумен", month: "2026-11" })).body.status, "draft", "регионален — свой");
});

Deno.test("overview: регионалният вижда само своите", async () => {
  const r = new MemRepo();
  await filled(r);
  const o = (await call(r, U.regSh, { action: "overview", month: "2026-11" })).body.stores;
  eq(o.map((s: { store: string }) => s.store), ["Шумен", "Добрич"], "без Кърджали");
  const a = (await call(r, U.admin, { action: "overview", month: "2026-11" })).body.stores;
  eq(a.filter((s: { store: string }) => s.store === "Кърджали")[0].rows, 2, "admin вижда редовете на Кърджали");
});

// ── Персонал ─────────────────────────────────────────────────────────────
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

Deno.test("HTTP: OPTIONS, GET, лош JSON, непознато действие", async () => {
  const r = new MemRepo();
  const o = await handleGrafik(new Request("http://x", { method: "OPTIONS" }), () => r);
  eq([o.status, o.headers.get("Access-Control-Allow-Origin")], [200, "*"], "OPTIONS");
  eq((await handleGrafik(new Request("http://x", { method: "GET" }), () => r)).status, 405, "GET");
  eq((await handleGrafik(new Request("http://x", { method: "POST", body: "{" }), () => r)).status, 400, "лош JSON");
  eq((await call(r, U.admin, { action: "drop_table" })).status, 400, "непознато действие");
});
