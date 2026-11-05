// supabase/functions/grafik-api/handler.test.ts
// deno test supabase/functions/grafik-api/handler.test.ts --allow-env
// База в паметта (MemRepo) — без мрежа. Проверява правата по вид × действие ×
// свой/чужд обект, пропуска, beta/ТРЗ списъците, клетките, снимката и валидността по дати.
import {
  handleGrafik, HttpError, accessEmails, parseMonth, resolveSetup, badCells, validAt, staffInMonth,
  snapshotOffNorm, sameAsPlanned, staleChanges,
  type Repo, type User, type MonthRow, type RowRec, type Staff, type SetupRaw, type AdminTable, type Sector, type RowStat, type AccessRow, type ChangeRow,
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
  async listAccess() { return this.access.slice(); }
  async insertAccess(f: Record<string, unknown>) { const r = { id: nid(), note: null, ...f } as AccessRow; this.access.push(r); return r; }
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
        { vtr_id: VTR, months: { "1": "З2", "2": "З2", "3": "З2", "4": "Л", "5": "Л", "6": "Л", "7": "Л", "8": "Л", "9": "Л", "10": "Л", "11": "З2", "12": "З2" }, valid_from: null, valid_to: "2026-10-31", labels: { "Л": "Лято (до 20:00)", "З2": "Зима (до 19:00)" } },
        { vtr_id: VTR, months: { "1": "З2", "2": "З2", "3": "З1", "4": "З1", "5": "Л", "6": "Л", "7": "Л", "8": "Л", "9": "Л", "10": "Л", "11": "З1", "12": "З1" }, valid_from: "2026-11-01", valid_to: null, labels: { "Л": "Лято (до 20:00)", "З1": "Зима 1 (до 19:30)", "З2": "Зима 2 (до 19:00)" } },
      ],
      letterMap: this.admin.grafik_letter_map as SetupRaw["letterMap"],
      extraDays: (this.admin.grafik_extra_days as SetupRaw["extraDays"]).filter((e) => !e.store_name || e.store_name === store),
      sectors: this.sectors.filter((x) => x.store_name === store),
    };
  }
  async getSector(id: string) { return this.sectors.filter((x) => x.id === id)[0] || null; }
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
  eq(x.body.hint, "Сложи кодове за дните или О/Б/Н; ако човекът не работи този месец — махни го от месеца.", "подсказката");
  assert(String(x.body.message).indexOf(nm(r, ids[0]) + ": 40 ч. вместо 168 ч.") >= 0 && String(x.body.message).indexOf("махни го от месеца") >= 0, "съобщението носи и двете");
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
    nm(r, ids[1]) + ": 9 свободни ч. на 05.11 — сложи код",
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
  eq([x.body.status, r.months[0].status, r.months[0].snapshot], ["draft", "draft", null], "admin връща, снимката се маха");
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
  const add = await call(r, U.admin, { action: "access_add", list: "beta", email: "  Drug@Temax.bg ", note: " Регионален Юг " });
  eq([add.status, add.body.row.email, add.body.row.note, add.body.row.created_by], [200, "drug@temax.bg", "Регионален Юг", "ten.tenev@temax.bg"], "добавен (малки букви, без интервали)");
  eq((await call(r, U.outside, { action: "me" })).body.kind, "manager", "…и веднага има достъп");
  eq((await call(r, U.admin, { action: "access_add", list: "beta", email: "drug@temax.bg" })).body.reason, "duplicate", "втори път — 409");
  eq((await call(r, U.admin, { action: "access_add", list: "trz", email: "drug@temax.bg" })).status, 200, "същият имейл в другия списък — може");
  eq((await call(r, U.outside, { action: "me" })).body.kind, "trz", "…и става ТРЗ (предимство)");
  for (const bad of ["", "без-маймунка", "a@b", "a b@c.bg", "a,b@c.bg"]) eq((await call(r, U.admin, { action: "access_add", list: "beta", email: bad })).body.reason, "bad_email", "лош имейл: " + bad);
  eq((await call(r, U.admin, { action: "access_add", list: "admin", email: "x@temax.bg" })).body.reason, "bad_request", "непознат списък");
  eq((await call(r, U.admin, { action: "access_add", list: "trz", email: "Ten.Tenev@temax.bg" })).body.reason, "self", "собственият имейл в ТРЗ — не");
  const own = r.access.filter((x) => x.email === "ten.tenev@temax.bg")[0];
  eq((await call(r, U.admin, { action: "access_remove", id: own.id })).body.reason, "self", "собственият от beta — не");
  const tz = r.access.filter((x) => x.list === "trz" && x.email === "drug@temax.bg")[0];
  eq((await call(r, U.admin, { action: "access_remove", id: tz.id })).body.deleted, 1, "махнат");
  eq((await call(r, U.outside, { action: "me" })).body.kind, "manager", "…и вече не е ТРЗ");
  eq((await call(r, U.admin, { action: "access_remove", id: tz.id })).status, 404, "втори път — 404");
  eq((await call(r, U.admin, { action: "access_remove", id: "не-uuid" })).body.reason, "bad_request", "лош id");
  eq(r.audits.map((a) => a.event), ["grafik_access_add", "grafik_access_add", "grafik_access_remove"], "одит — само успешните промени");
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
