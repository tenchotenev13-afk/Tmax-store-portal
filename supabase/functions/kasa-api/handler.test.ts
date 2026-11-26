// supabase/functions/kasa-api/handler.test.ts
// deno test supabase/functions/kasa-api/handler.test.ts --allow-env
// База в паметта (MemRepo) — без мрежа. MemRepo изпълнява Query БУКВАЛНО
// (вкл. липсващ филтър по обект), затова „обект А не получава ред на Б“ се
// проверява от самата функция, не от фикстурата.
import { handleKasa, resolveScope, needStore, daysBetween, HttpError, ROW_CAP, DOC_URL_SECONDS, STORNO_ITEMS_MAX,
  type AuditEntry, type Query, type Repo, type Row, type User } from "./handler.ts";
import { guardQuery, guardWrite } from "./repo.ts";
import { signSession } from "../_shared/session.ts";

Deno.env.set("PORTAL_SESSION_SECRET", "test-secret-" + "x".repeat(48));

function assert(c: unknown, msg: string): asserts c { if (!c) throw new Error(msg); }
function eq(a: unknown, b: unknown, msg: string) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(msg + " — очаквано " + y + ", получено " + x);
}

let seq = 0;
const nid = () => "00000000-0000-4000-8000-" + String(++seq).padStart(12, "0");
const NOW = Math.floor(Date.parse("2026-11-19T10:00:00Z") / 1000);

const K = "Кърджали", R = "Раднево", SH = "Шумен", CO = "Централен офис";
const U: Record<string, User> = {
  admin:   { id: nid(), email: "a@x", display_name: "Админ", store_name: CO, role: "admin", is_regional: false, assigned_stores: null, active: true },
  admAsg:  { id: nid(), email: "a2@x", display_name: "Админ с обекти", store_name: CO, role: "admin", is_regional: true, assigned_stores: [SH], active: true },
  accAll:  { id: nid(), email: "b@x", display_name: "Счетоводство", store_name: CO, role: "accounting", is_regional: false, assigned_stores: null, active: true },
  accAsg:  { id: nid(), email: "c@x", display_name: "Счетоводство Шумен", store_name: CO, role: "accounting", is_regional: false, assigned_stores: [SH], active: true },
  accStr:  { id: nid(), email: "c2@x", display_name: "Регионален (низ)", store_name: CO, role: "accounting", is_regional: true, assigned_stores: "{\"Шумен\",Раднево}", active: true },
  mgrK:    { id: nid(), email: "d@x", display_name: "Управител К", store_name: K, role: "manager", is_regional: false, assigned_stores: null, active: true },
  kasaR:   { id: nid(), email: "e@x", display_name: "Каса Р", store_name: R, role: "kasa", is_regional: false, assigned_stores: null, active: true },
  sklK:    { id: nid(), email: "f@x", display_name: "Склад К", store_name: K, role: "sklad", is_regional: false, assigned_stores: null, active: true },
  ctrl:    { id: nid(), email: "g@x", display_name: "Контролинг", store_name: CO, role: "controlling", is_regional: false, assigned_stores: null, active: true },
  logi:    { id: nid(), email: "h@x", display_name: "Логистика", store_name: K, role: "logistics", is_regional: false, assigned_stores: [R, SH], active: true },
  off:     { id: nid(), email: "i@x", display_name: "Неактивен", store_name: K, role: "manager", is_regional: false, assigned_stores: null, active: false },
};

// ── Данни: три обекта, всеки с върнат/потвърден ред, документ и сторно ────
function seed() {
  const t: Record<string, Row[]> = { kasa_reports: [], kasa_glavna: [], kasa_zoborot: [], kasa_documents: [], kasa_storno: [], kasa_storno_items: [], daily_turnover: [] };
  for (const s of [K, R, SH, CO]) {
    t.kasa_reports.push({ id: nid(), store_name: s, date: "2026-11-18", pos_number: 1, status: "confirmed", razlika: 0, return_reason: null, returned_by: null, returned_at: null, created_at: "2026-11-18T18:00:00Z", bills_500: 1 });
    t.kasa_reports.push({ id: nid(), store_name: s, date: "2026-05-02", pos_number: 2, status: "returned", razlika: -5, return_reason: "грешка " + s, returned_by: "ЦО", returned_at: "2026-05-03T08:00:00Z", created_at: "2026-05-02T18:00:00Z", bills_500: 0 });
    t.kasa_reports.push({ id: nid(), store_name: s, date: "2026-05-01", pos_number: 1, status: "confirmed", razlika: 0, return_reason: null, returned_by: null, returned_at: null, created_at: "2026-05-01T18:00:00Z", bills_500: 0 });
    t.kasa_glavna.push({ id: nid(), store_name: s, date: "2026-11-18", status: "draft" });
    t.kasa_zoborot.push({ id: nid(), store_name: s, date: "2026-11-18", status: "returned", razlika: 3, created_at: "2026-11-18T19:00:00Z", return_reason: "р", returned_at: "2026-11-19T07:00:00Z" });
    t.kasa_documents.push({ id: nid(), store_name: s, date: "2026-11-18", file_url: "_____/2026-11-18/pos_z_" + s + ".pdf", file_name: "z-" + s + ".pdf", created_at: "2026-11-18T19:00:00Z" });
    const sid = nid();
    t.kasa_storno.push({ id: sid, store_name: s, storno_date: "2026-11-10", returned_sum: 100, new_sum: 50, articles: "123456", status: "new", created_at: "2026-11-10T10:00:00Z" });
    t.kasa_storno_items.push({ id: nid(), storno_id: sid, kind: "returned", sap_code: "123456", article_name: "Артикул " + s, line_no: 1 });
    // Капаро — не се брои в банера, макар новата сума да е по-малка.
    t.kasa_storno.push({ id: nid(), store_name: s, storno_date: "2026-11-11", returned_sum: 100, new_sum: 0, articles: "900001", status: "new", created_at: "2026-11-11T10:00:00Z" });
    t.daily_turnover.push({ id: nid(), store_name: s, date: "2026-11-18", total_turnover: 1000 });
  }
  return t;
}

class MemRepo implements Repo {
  t = seed();
  users = Object.values(U);
  calls = 0;
  queries: Query[] = [];
  signed: string[] = [];
  async getUser(id: string) { this.calls++; return this.users.find((u) => u.id === id) || null; }
  async rows(q: Query) {
    this.calls++;
    guardQuery(q);
    this.queries.push(q);
    const src = this.t[q.table];
    if (!src) throw new Error("няма таблица " + q.table);
    let out = src.filter((r) => {
      if (q.stores !== "all" && q.stores.indexOf(String(r.store_name)) < 0) return false;
      if (q.eq) for (const k of Object.keys(q.eq)) if (String(r[k]) !== q.eq[k]) return false;
      if (q.gte && !(String(r[q.gte[0]]) >= q.gte[1])) return false;
      if (q.lte && !(String(r[q.lte[0]]) <= q.lte[1])) return false;
      if (q.lt && !(String(r[q.lt[0]]) < q.lt[1])) return false;
      if (q.orReturned && !(String(r[q.orReturned.col]) >= q.orReturned.from || r.status === "returned")) return false;
      return true;
    });
    if (q.table === "kasa_storno" && q.select.indexOf("kasa_storno_items(") >= 0) {
      out = out.map((r) => ({ ...r, kasa_storno_items: this.t.kasa_storno_items.filter((i) => i.storno_id === r.id) }));
    }
    return out.slice(0, q.cap + 1);
  }
  async signUrl(path: string, seconds: number) { this.calls++; this.signed.push(path); return "https://signed.example/" + path + "?e=" + seconds; }
  // Запис — същият бял списък като repo.ts; каскадата kasa_storno → items като в базата.
  writes: string[] = [];
  audits: AuditEntry[] = [];
  failInsert = false;
  async deleteEq(table: string, col: string, val: string) {
    this.calls++; guardWrite(table, col); this.writes.push("DELETE " + table + "." + col + "=" + val);
    const before = this.t[table].length;
    this.t[table] = this.t[table].filter((r) => String(r[col]) !== val);
    if (table === "kasa_storno") this.t.kasa_storno_items = this.t.kasa_storno_items.filter((i) => String(i.storno_id) !== val);
    return before - this.t[table].length;
  }
  async insertRows(table: string, rows: Row[]) {
    this.calls++; guardWrite(table); this.writes.push("INSERT " + table + " x" + rows.length);
    if (this.failInsert) throw new Error("вмъкването падна");
    for (const r of rows) this.t[table].push({ id: nid(), ...r });
    return rows.length;
  }
  async audit(e: AuditEntry) { this.calls++; this.audits.push(e); }
}

async function call(repo: MemRepo, who: User | null, body: Record<string, unknown>, opts: { token?: string; now?: number } = {}) {
  const session = opts.token !== undefined ? opts.token
    : who ? await signSession({ uid: who.id, role: who.role, email: who.email }, NOW - 60) : null;
  const req = new Request("http://x/kasa-api", { method: "POST", body: JSON.stringify({ session, ...body }) });
  const res = await handleKasa(req, () => repo, opts.now ?? NOW);
  return { status: res.status, data: await res.json() };
}
const stores = (rows: Row[]) => Array.from(new Set(rows.map((r) => String(r.store_name)))).sort();
const kindRows = (d: Record<string, unknown>, k: string) => ((d.kinds as Record<string, { rows: Row[] }>)[k]).rows;

// ── Пропуск и потребител ──────────────────────────────────────────────────
Deno.test("пропуск: липсващ, подправен и изтекъл → 401 session_expired, без нито едно извикване към базата", async () => {
  for (const [name, token, now] of [["липсва", "", NOW], ["подправен", "abc.def", NOW]] as const) {
    const repo = new MemRepo();
    const r = await call(repo, null, { action: "day", date: "2026-11-18" }, { token, now });
    eq(r.status, 401, name); eq(r.data.reason, "session_expired", name);
    eq(repo.calls, 0, name + ": repo не се пипа");
  }
  const repo = new MemRepo();
  const old = await signSession({ uid: U.mgrK.id, role: "manager", email: U.mgrK.email }, NOW - 13 * 3600);
  const r = await call(repo, null, { action: "day", date: "2026-11-18" }, { token: old });
  eq(r.status, 401, "изтекъл (13 ч.)"); eq(repo.calls, 0, "изтекъл: repo не се пипа");
});

Deno.test("потребител: неактивен и непознат → 403; ролята е от users, не от пропуска", async () => {
  const repo = new MemRepo();
  eq((await call(repo, U.off, { action: "banner" })).status, 403, "неактивен");
  const ghost = await signSession({ uid: nid(), role: "admin", email: "ghost@x" }, NOW - 60);
  eq((await call(repo, null, { action: "banner" }, { token: ghost })).status, 403, "непознат uid");
  // Пропускът казва admin, users казва manager → обхватът е на управителя.
  const lie = await signSession({ uid: U.mgrK.id, role: "admin", email: U.mgrK.email }, NOW - 60);
  const r = await call(repo, null, { action: "range", kinds: ["reports"], from: "2026-01-01", to: "2026-12-31" }, { token: lie });
  eq(r.status, 200, "лъжлива роля — заявката минава"); eq(stores(kindRows(r.data, "reports")), [K], "но само своя обект");
});

// ── Обект А не получава ред на обект Б ────────────────────────────────────
Deno.test("обект: day без store → своя; day за чужд обект → 403 forbidden_store", async () => {
  const repo = new MemRepo();
  const own = await call(repo, U.mgrK, { action: "day", date: "2026-11-18" });
  eq(own.status, 200, "свой ден");
  for (const k of ["reports", "glavna", "zoborot", "documents"]) eq(stores(own.data[k]), [K], "day." + k + " — само Кърджали");
  const other = await call(repo, U.mgrK, { action: "day", store: R, date: "2026-11-18" });
  eq(other.status, 403, "чужд обект"); eq(other.data.reason, "forbidden_store", "причина");
});

Deno.test("обект: range без store по всички видове → нито един ред на друг обект", async () => {
  for (const who of [U.mgrK, U.kasaR]) {
    const repo = new MemRepo();
    const r = await call(repo, who, { action: "range", kinds: ["reports", "glavna", "zoborot", "documents", "storno", "oborot"], from: "2026-01-01", to: "2026-12-31" });
    eq(r.status, 200, who.email);
    for (const k of ["reports", "glavna", "zoborot", "documents", "storno", "oborot"]) eq(stores(kindRows(r.data, k)), [who.store_name], who.email + " " + k);
    assert(repo.queries.every((q) => q.stores !== "all"), "нито една заявка на обекта не е без филтър");
  }
});

Deno.test("обект: storno_items и doc_url за чужд ред → 404, без подписан линк", async () => {
  const repo = new MemRepo();
  const sR = repo.t.kasa_storno.find((x) => x.store_name === R)!;
  const sK = repo.t.kasa_storno.find((x) => x.store_name === K)!;
  eq((await call(repo, U.mgrK, { action: "storno_items", storno_id: sR.id })).status, 404, "чуждо сторно");
  const mine = await call(repo, U.mgrK, { action: "storno_items", storno_id: sK.id });
  eq(mine.status, 200, "свое сторно"); eq(mine.data.items.length, 1, "редовете на своето");
  const dR = repo.t.kasa_documents.find((x) => x.store_name === R)!;
  const dK = repo.t.kasa_documents.find((x) => x.store_name === K)!;
  eq((await call(repo, U.mgrK, { action: "doc_url", document_id: dR.id })).status, 404, "чужд документ");
  eq(repo.signed.length, 0, "за чуждия не е подписан линк");
  const ok = await call(repo, U.mgrK, { action: "doc_url", document_id: dK.id });
  eq(ok.status, 200, "свой документ"); eq(ok.data.expires_in, DOC_URL_SECONDS, "300 сек"); eq(DOC_URL_SECONDS, 300, "решение 8");
  eq(repo.signed, [dK.file_url], "подписан е пътят от базата");
  eq((await call(repo, U.mgrK, { action: "doc_url", document_id: "../../etc" })).status, 400, "невалидно id");
});

// ── Счетоводство и admin (решения 2, 3) ───────────────────────────────────
Deno.test("accounting с assigned: само своите обекти; чужд → 403; assigned като низ също работи", async () => {
  const repo = new MemRepo();
  const r = await call(repo, U.accAsg, { action: "range", kinds: ["reports", "storno"], from: "2026-01-01", to: "2026-12-31" });
  eq(stores(kindRows(r.data, "reports")), [SH], "reports"); eq(stores(kindRows(r.data, "storno")), [SH], "storno");
  eq((await call(repo, U.accAsg, { action: "day", store: K, date: "2026-11-18" })).status, 403, "неназначен обект");
  eq((await call(repo, U.accAsg, { action: "day", store: SH, date: "2026-11-18" })).status, 200, "назначен обект");
  const s = await call(repo, U.accStr, { action: "range", kinds: ["oborot"], from: "2026-11-01", to: "2026-11-30" });
  eq(stores(kindRows(s.data, "oborot")), [R, SH], "низ {\"Шумен\",Раднево}");
});

Deno.test("accounting без assigned и admin (със и без assigned) → всички обекти", async () => {
  for (const who of [U.accAll, U.admin, U.admAsg]) {
    const repo = new MemRepo();
    const r = await call(repo, who, { action: "range", kinds: ["reports"], from: "2026-01-01", to: "2026-12-31" });
    eq(stores(kindRows(r.data, "reports")), [R, SH, K, CO].sort(), who.email);
    eq((await call(repo, who, { action: "day", store: K, date: "2026-11-18" })).status, 200, who.email + " day К");
  }
});

// ── controlling и logistics (решение 4) ───────────────────────────────────
Deno.test("controlling: report_rows за всички; day / range / storno_items / doc_url → 403", async () => {
  const repo = new MemRepo();
  for (const a of [{ action: "day", date: "2026-11-18" }, { action: "range", kinds: ["reports"], from: "2026-11-01", to: "2026-11-30" },
    { action: "storno_items", storno_id: repo.t.kasa_storno[0].id }, { action: "doc_url", document_id: repo.t.kasa_documents[0].id }]) {
    eq((await call(repo, U.ctrl, a)).status, 403, "controlling " + a.action);
  }
  const r = await call(repo, U.ctrl, { action: "report_rows", kind: "daily_kasa", day: "2026-11-18" });
  eq(r.status, 200, "report_rows");
  eq(stores(r.data.day_reports), [R, SH, K, CO].sort(), "всички обекти");
  eq((await call(repo, U.ctrl, { action: "banner" })).status, 200, "банерът за своя");
});

Deno.test("logistics и останалите: само banner за своя обект, assigned не разширява нищо", async () => {
  for (const who of [U.logi, U.sklK]) {
    const repo = new MemRepo();
    for (const a of ["day", "range", "storno_items", "report_rows", "doc_url"]) {
      eq((await call(repo, who, { action: a, date: "2026-11-18" })).status, 403, who.role + " " + a);
    }
    const b = await call(repo, who, { action: "banner" });
    eq(b.status, 200, who.role + " banner");
    eq(stores(b.data.returned_reports), [K], who.role + " — върнатите на своя обект");
    assert(!("storno_flagged" in b.data), who.role + " — без брояча за сторно");
  }
});

// ── Банер (R28, R29 + решение 13) ─────────────────────────────────────────
Deno.test("banner: върнатите — само своя обект; сторно с по-малка сума — в обхвата, без капаро", async () => {
  const repo = new MemRepo();
  const m = await call(repo, U.mgrK, { action: "banner" });
  eq(m.data.returned_reports.length, 1, "1 върнат на Кърджали"); eq(m.data.returned_reports[0].return_reason, "грешка " + K, "причината");
  assert(!("storno_flagged" in m.data), "обектът не получава брояча");
  const a = await call(repo, U.admin, { action: "banner" });
  eq(a.data.storno_flagged.count, 4, "по едно на обект, капарото (900001) отпада");
  eq(a.data.storno_flagged.read, 8, "прочетени 8 (вкл. капарото)");
  const s = await call(repo, U.accAsg, { action: "banner" });
  eq(s.data.storno_flagged.by_store, { [SH]: 1 }, "accounting с assigned — само Шумен");
});

// ── Граници ───────────────────────────────────────────────────────────────
Deno.test("range: над 400 дни за много обекти → 400; за един обект — минава", async () => {
  const repo = new MemRepo();
  eq((await call(repo, U.admin, { action: "range", kinds: ["reports"], from: "2025-01-01", to: "2026-11-19" })).data.reason, "range_too_long", "admin, всички");
  eq((await call(repo, U.admin, { action: "range", kinds: ["reports"], store: K, from: "2025-01-01", to: "2026-11-19" })).status, 200, "admin, един обект");
  eq((await call(repo, U.mgrK, { action: "range", kinds: ["reports"], from: "2020-01-01", to: "2026-11-19" })).status, 200, "обект — целият му период");
  eq(daysBetween("2026-01-01", "2027-02-05"), 400, "точно 400");
  eq((await call(repo, U.admin, { action: "range", kinds: ["reports"], from: "2026-01-01", to: "2027-02-05" })).status, 200, "точно на лимита — минава");
  eq((await call(repo, U.admin, { action: "range", kinds: ["reports"], from: "2026-01-01", to: "2027-02-06" })).status, 400, "лимит + 1 — отказ");
  eq((await call(repo, U.admin, { action: "range", kinds: ["nope"], from: "2026-01-01", to: "2026-01-02" })).status, 400, "непознат вид");
  eq((await call(repo, U.admin, { action: "range", kinds: ["reports"], from: "2026-02-01", to: "2026-01-01" })).status, 400, "обърнат период");
  eq((await call(repo, U.admin, { action: "range", kinds: ["reports"], cols: "password_hash", from: "2026-01-01", to: "2026-01-02" })).status, 400, "колони извън белия списък");
});

Deno.test("range include_returned (решение 6): 60 дни + всички върнати, старите потвърдени — не", async () => {
  const repo = new MemRepo();
  const r = await call(repo, U.admin, { action: "range", kinds: ["reports"], from: "2026-09-20", to: "2026-11-19", include_returned: true });
  const rows = kindRows(r.data, "reports");
  eq(rows.filter((x) => x.date === "2026-05-02").length, 4, "върнатите от май — всички обекти");
  eq(rows.filter((x) => x.date === "2026-05-01").length, 0, "потвърдените от май — не");
  eq(rows.filter((x) => x.date === "2026-11-18").length, 4, "в прозореца");
});

Deno.test("range cols=denoms: само id, store_name, date и купюрите", async () => {
  const repo = new MemRepo();
  await call(repo, U.admin, { action: "range", kinds: ["reports"], cols: "denoms", from: "2026-11-01", to: "2026-11-30" });
  const sel = repo.queries.find((q) => q.table === "kasa_reports")!.select.split(",");
  eq(sel.slice(0, 3), ["id", "store_name", "date"], "началото"); eq(sel.length, 18, "3 + 15 купюри");
});

Deno.test("таван: над ROW_CAP реда → 413 too_many (не тихо отрязано)", async () => {
  const repo = new MemRepo();
  for (let i = 0; i <= ROW_CAP; i++) repo.t.daily_turnover.push({ id: "z" + i, store_name: K, date: "2026-11-01" });
  const r = await call(repo, U.admin, { action: "range", kinds: ["oborot"], from: "2026-11-01", to: "2026-11-30" });
  eq(r.status, 413, "413"); eq(r.data.reason, "too_many", "причина");
});

Deno.test("report_rows daily_kasa: fix_reports само по датите на върнатите равнения, в обхвата", async () => {
  const repo = new MemRepo();
  const r = await call(repo, U.accAsg, { action: "report_rows", kind: "daily_kasa", day: "2026-11-18" });
  eq(stores(r.data.returned_zoborot), [SH], "върнатите равнения — само Шумен");
  eq(r.data.fix_reports.map((x: Row) => x.date), ["2026-11-18"], "отчетите по датата на върнатото");
  eq(stores(r.data.fix_reports), [SH], "и те — само Шумен");
  const c = await call(repo, U.admin, { action: "report_rows", kind: "cross_kasa", from_stamp: "2026-11-01T00:00:00Z", from_iso: "2026-11-01", to_iso: "2026-11-30" });
  eq(c.data.storno_week.length, 8, "сторна за прозореца"); eq(c.data.storno.length, 8, "по created_at");
  eq((await call(repo, U.admin, { action: "report_rows", kind: "x" })).status, 400, "непознат вид");
});

Deno.test("непознато действие и не-POST", async () => {
  const repo = new MemRepo();
  eq((await call(repo, U.admin, { action: "delete_all" })).status, 400, "непознато");
  const res = await handleKasa(new Request("http://x", { method: "GET" }), () => repo, NOW);
  eq(res.status, 405, "GET");
  eq((await handleKasa(new Request("http://x", { method: "OPTIONS" }), () => repo, NOW)).status, 200, "OPTIONS (CORS)");
});

// ── Чисти функции ─────────────────────────────────────────────────────────
Deno.test("resolveScope — таблица роля → обхват (решения 2, 3, 4)", () => {
  eq(resolveScope(U.admin).stores, "all", "admin");
  eq(resolveScope(U.admAsg).stores, "all", "admin с assigned");
  eq(resolveScope(U.accAll).stores, "all", "accounting без assigned");
  eq(resolveScope(U.accAsg).stores, [SH], "accounting с assigned");
  eq(resolveScope(U.mgrK).stores, [K], "manager");
  eq(resolveScope(U.kasaR).stores, [R], "kasa");
  eq(resolveScope(U.ctrl).actions, ["report_rows", "banner"], "controlling");
  eq(resolveScope(U.ctrl).reportStores, "all", "controlling — report_rows за всички");
  eq(resolveScope(U.logi).actions, ["banner"], "logistics");
  eq(resolveScope(U.logi).stores, [K], "logistics — своя, не assigned");
  eq(resolveScope({ ...U.mgrK, store_name: null }).stores, [], "без обект → празен обхват");
});

Deno.test("needStore: тялото само избира вътре в обхвата", () => {
  eq(needStore([K], undefined), [K], "без обект → обхвата");
  eq(needStore("all", R), [R], "admin избира");
  let threw = false;
  try { needStore([K], R); } catch (e) { threw = e instanceof HttpError && e.status === 403; }
  assert(threw, "чужд → 403");
});

// ── Етап 2: запис на сторно (storno_items_save, storno_delete) ────────────
const stornoOf = (repo: MemRepo, s: string) => repo.t.kasa_storno.find((r) => r.store_name === s && r.articles === "123456")!;
const itemsOf = (repo: MemRepo, id: unknown) => repo.t.kasa_storno_items.filter((i) => i.storno_id === id);
const ITEMS = [
  { kind: "returned", sap_code: " 111 ", article_name: " Стол ", line_no: 1 },
  { kind: "returned", sap_code: "222", article_name: "", line_no: 2 },
  { kind: "replacement", sap_code: "333", article_name: null, line_no: 1 },
];

Deno.test("storno_items_save: свой обект — старите се трият, новите се записват, storno_id от сървъра", async () => {
  const repo = new MemRepo();
  const sK = stornoOf(repo, K);
  const r = await call(repo, U.mgrK, { action: "storno_items_save", storno_id: sK.id,
    items: ITEMS.map((x) => ({ ...x, storno_id: "00000000-0000-4000-8000-999999999999" })) });
  eq(r.status, 200, "статус"); eq([r.data.removed, r.data.added], [1, 3], "1 изтрит, 3 записани");
  const got = itemsOf(repo, sK.id).map((i) => [i.kind, i.sap_code, i.article_name, i.line_no]);
  eq(got, [["returned", "111", "Стол", 1], ["returned", "222", null, 2], ["replacement", "333", null, 1]], "редовете (trim, празно име → null)");
  eq(repo.t.kasa_storno_items.filter((i) => i.storno_id === "00000000-0000-4000-8000-999999999999").length, 0, "storno_id от тялото на реда се игнорира");
  eq(repo.writes.slice(0, 2), ["DELETE kasa_storno_items.storno_id=" + sK.id, "INSERT kasa_storno_items x3"], "ред: изтриване, после запис");
  eq(repo.audits.length, 1, "одит"); eq(repo.audits[0].event, "kasa_storno_items_save", "одит: събитие");
  eq([repo.audits[0].store_name, repo.audits[0].user_email], [K, U.mgrK.email], "одит: обект и имейл от users");
});

Deno.test("storno_items_save: празен списък → само изтриване; kasa на своя обект; admin на чужд", async () => {
  const repo = new MemRepo();
  const sR = stornoOf(repo, R);
  const r = await call(repo, U.kasaR, { action: "storno_items_save", storno_id: sR.id, items: [] });
  eq([r.status, r.data.removed, r.data.added], [200, 1, 0], "kasa, празно");
  eq(repo.writes.filter((w) => w.startsWith("INSERT")).length, 0, "без INSERT при празен списък");
  const sSH = stornoOf(repo, SH);
  const a = await call(repo, U.admin, { action: "storno_items_save", storno_id: sSH.id, items: ITEMS });
  eq([a.status, a.data.added], [200, 3], "admin — всички обекти");
});

Deno.test("storno_items_save: чуждо сторно → 404 и НИЩО не се трие", async () => {
  const repo = new MemRepo();
  const sR = stornoOf(repo, R);
  const r = await call(repo, U.mgrK, { action: "storno_items_save", storno_id: sR.id, items: ITEMS });
  eq(r.status, 404, "чуждо"); eq(repo.writes, [], "без запис");
  eq(itemsOf(repo, sR.id).length, 1, "артикулът на Р е непокътнат");
  const n = await call(repo, U.mgrK, { action: "storno_items_save", storno_id: "00000000-0000-4000-8000-777777777777", items: ITEMS });
  eq(n.status, 404, "несъществуващо");
});

Deno.test("storno_items_save / storno_delete: роли без запис → 403, без нито един запис", async () => {
  for (const who of [U.accAll, U.accAsg, U.ctrl, U.logi, U.sklK]) {
    const repo = new MemRepo();
    const sid = stornoOf(repo, who.store_name === K ? K : SH).id;
    for (const body of [{ action: "storno_items_save", storno_id: sid, items: ITEMS }, { action: "storno_delete", id: sid }]) {
      const r = await call(repo, who, body);
      eq(r.status, 403, who.role + " " + body.action); eq(r.data.reason, "forbidden", who.role + " причина");
    }
    eq(repo.writes, [], who.role + ": без запис");
  }
});

Deno.test("storno_items_save: невалидни артикули → 400 преди изтриването", async () => {
  const bads: unknown[] = [
    null, "x", [null], [{ ...ITEMS[0], kind: "other" }], [{ ...ITEMS[0], sap_code: "  " }], [{ ...ITEMS[0], sap_code: 5 }],
    [{ ...ITEMS[0], sap_code: "x".repeat(201) }], [{ ...ITEMS[0], article_name: 7 }], [{ ...ITEMS[0], article_name: "x".repeat(501) }],
    [{ ...ITEMS[0], line_no: 0 }], [{ ...ITEMS[0], line_no: 1.5 }], [{ ...ITEMS[0], line_no: "1" }],
    Array.from({ length: STORNO_ITEMS_MAX + 1 }, (_, i) => ({ ...ITEMS[0], line_no: i + 1 })),
  ];
  for (const items of bads) {
    const repo = new MemRepo();
    const sK = stornoOf(repo, K);
    const r = await call(repo, U.mgrK, { action: "storno_items_save", storno_id: sK.id, items });
    eq(r.status, 400, "лоши: " + JSON.stringify(items).slice(0, 60)); eq(repo.writes, [], "без запис: " + JSON.stringify(items).slice(0, 40));
  }
  // Точно на лимита — минава.
  const repo = new MemRepo();
  const sK = stornoOf(repo, K);
  const ok = await call(repo, U.mgrK, { action: "storno_items_save", storno_id: sK.id,
    items: Array.from({ length: STORNO_ITEMS_MAX }, (_, i) => ({ ...ITEMS[0], sap_code: "x".repeat(200), article_name: "y".repeat(500), line_no: i + 1 })) });
  eq([ok.status, ok.data.added], [200, STORNO_ITEMS_MAX], "точно 200 реда, 200 знака код, 500 знака име");
  const badId = await call(repo, U.mgrK, { action: "storno_items_save", storno_id: "1; delete", items: [] });
  eq(badId.status, 400, "невалиден storno_id");
});

Deno.test("storno_items_save: паднал запис след изтриването → 500 items_not_saved (ясно съобщение)", async () => {
  const repo = new MemRepo();
  repo.failInsert = true;
  const sK = stornoOf(repo, K);
  const r = await call(repo, U.mgrK, { action: "storno_items_save", storno_id: sK.id, items: ITEMS });
  eq([r.status, r.data.reason], [500, "items_not_saved"], "статус и причина");
  assert(/запази бележката отново/.test(String(r.data.message)), "съобщението казва какво да се направи");
});

Deno.test("storno_delete: свой → изтрит + каскада на артикулите + одит със снимка; чужд → 404", async () => {
  const repo = new MemRepo();
  const sK = stornoOf(repo, K), sR = stornoOf(repo, R);
  const foreign = await call(repo, U.mgrK, { action: "storno_delete", id: sR.id });
  eq(foreign.status, 404, "чуждо"); eq(repo.writes, [], "чуждо: без запис");
  const r = await call(repo, U.mgrK, { action: "storno_delete", id: sK.id });
  eq([r.status, r.data.deleted], [200, 1], "свое");
  eq(repo.t.kasa_storno.some((x) => x.id === sK.id), false, "бележката я няма");
  eq(itemsOf(repo, sK.id).length, 0, "артикулите — каскадно");
  eq(repo.t.kasa_storno.some((x) => x.id === sR.id), true, "чуждата е непокътната");
  eq(repo.audits[0].event, "kasa_storno_delete", "одит");
  eq([repo.audits[0].details.returned_sum, repo.audits[0].details.storno_date], [100, "2026-11-10"], "одит: снимка на изтритото");
  const again = await call(repo, U.mgrK, { action: "storno_delete", id: sK.id });
  eq(again.status, 404, "второ изтриване → 404");
  const admin = await call(repo, U.admin, { action: "storno_delete", id: sR.id });
  eq(admin.status, 200, "admin — чужд обект");
  eq((await call(repo, U.mgrK, { action: "storno_delete", id: "abc" })).status, 400, "невалиден id");
});

Deno.test("storno_*: изтекъл пропуск → 401 без нито едно обръщение към базата", async () => {
  const repo = new MemRepo();
  const sid = stornoOf(repo, K).id;
  for (const body of [{ action: "storno_items_save", storno_id: sid, items: ITEMS }, { action: "storno_delete", id: sid }]) {
    const r = await call(repo, U.mgrK, body, { now: NOW + 13 * 3600 });
    eq(r.status, 401, body.action);
  }
  eq(repo.calls, 0, "repo не се пипа");
});

Deno.test("guardWrite: запис само в kasa_storno(id) и kasa_storno_items(storno_id)", () => {
  guardWrite("kasa_storno", "id"); guardWrite("kasa_storno_items", "storno_id"); guardWrite("kasa_storno_items");
  for (const [t, c] of [["kasa_reports", "id"], ["kasa_storno", "store_name"], ["kasa_storno_items", "id"], ["users", undefined]] as const) {
    let threw = false;
    try { guardWrite(t, c); } catch { threw = true; }
    assert(threw, t + "." + c);
  }
});

Deno.test("guardQuery: заявка без обхват, без таван или без подредба не тръгва", () => {
  const base: Query = { table: "kasa_reports", select: "*", stores: [K], order: ["id.asc"], cap: 10 };
  guardQuery(base);
  for (const [name, q] of [["празен обхват", { ...base, stores: [] }], ["без таван", { ...base, cap: 0 }], ["без подредба", { ...base, order: [] }]] as const) {
    let threw = false;
    try { guardQuery(q as Query); } catch { threw = true; }
    assert(threw, name);
  }
});
