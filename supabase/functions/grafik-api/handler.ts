// supabase/functions/grafik-api/handler.ts
// Работен график (етап 1). ЕДИНСТВЕНИЯТ път до таблиците grafik_* — те са с RLS
// без политики и без права за anon (миграция 20261101205213).
// Тук е цялата логика; index.ts само подава истинския Repo (supabase-js със
// service ключа). Разделено е, за да се тества без мрежа (handler.test.ts).
//
// Проверката на достъпа — при ВСЯКА заявка, преди всичко друго:
//   1) подписан пропуск от auth-login (verifySession) — иначе 401 session_expired;
//   2) редът от users по uid от пропуска — роля, обект, is_regional,
//      assigned_stores и active идват от базата, не от пропуска;
//   3) имейлът е в app_settings.grafik_beta_users — иначе 403 not_beta;
//   4) вид достъп: ТРЗ (grafik_trz_users, има предимство пред admin) → чете
//      всички, само подадени месеци, не пише; admin → всичко; регионален
//      (is_regional + assigned_stores) → своите обекти; manager → своя обект;
//      останалите → чете своя обект.
import { verifySession } from "../_shared/session.ts";

// ── Типове ────────────────────────────────────────────────────────────────
export type User = {
  id: string; email: string; display_name: string | null; store_name: string | null;
  role: string | null; is_regional: boolean | null; assigned_stores: string[] | null; active: boolean | null;
};
export type Kind = "trz" | "admin" | "regional" | "manager" | "viewer";
export type Access = {
  kind: Kind; email: string; name: string; role: string;
  readAll: boolean; read: string[]; edit: string[] | "all"; canAdmin: boolean; canReopen: boolean;
};
export type Dated = { valid_from: string | null; valid_to: string | null };
export type MonthRow = {
  id: string; store_name: string; month: string; status: "draft" | "submitted";
  submitted_at: string | null; submitted_by: string | null; submitted_by_name: string | null;
  snapshot: unknown; updated_at?: string;
};
export type RowRec = { id?: string; month_id: string; staff_id: string; letters: string[]; locked: Record<string, string>; sort_order?: number; updated_at?: string; updated_by?: string | null };
export type Staff = { id: string; store_name: string; [k: string]: unknown };
export type SetupRaw = {
  storeCompany: (Dated & { id: string; store_name: string; company_id: string; blank_name: string; address: string | null })[];
  companies: { id: string; name: string | null; eik: string | null; mol: string | null; addr: string | null }[];
  terms: (Dated & { id: string; company_id: string; vtr_id: string; approver: string })[];
  codes: (Dated & { vtr_id: string; code: string; hours: number | null; kind: string; seasons: string[] | null; legend: string | null; sort_order: number })[];
  seasons: (Dated & { vtr_id: string; months: Record<string, string>; labels?: Record<string, string> | null })[];
  letterMap: (Dated & { vtr_id: string; letter: string; day_kind: string; code: string; hours_per_day?: number | null })[];
  extraDays: { day: string; store_name: string | null; note: string | null }[];
  sectors?: Sector[];
};
export type Sector = { id: string; store_name: string; name: string; sort_order: number; active: boolean };
export type AdminTable = "companies" | "grafik_company_terms" | "grafik_store_company" | "grafik_extra_days" | "grafik_letter_map";

export interface Repo {
  getUser(id: string): Promise<User | null>;
  getSettings(keys: string[]): Promise<Record<string, string>>;
  storeNames(): Promise<string[]>;
  getMonth(store: string, month: string): Promise<MonthRow | null>;
  ensureMonth(store: string, month: string): Promise<MonthRow>;
  updateMonth(id: string, fields: Partial<MonthRow>, expectStatus: string): Promise<boolean>;
  listMonths(month: string, stores: string[] | null): Promise<MonthRow[]>;
  rowCounts(monthIds: string[]): Promise<Record<string, number>>;
  listRows(monthId: string): Promise<RowRec[]>;
  upsertRows(rows: RowRec[]): Promise<void>;
  listStaff(store: string): Promise<Staff[]>;
  staffCounts(stores: string[] | null): Promise<Record<string, number>>;
  getStaff(ids: string[]): Promise<Staff[]>;
  insertStaff(fields: Record<string, unknown>): Promise<Staff>;
  updateStaff(id: string, fields: Record<string, unknown>): Promise<Staff | null>;
  setupRaw(store: string): Promise<SetupRaw>;
  letterSet(): Promise<string[]>;
  getSector(id: string): Promise<Sector | null>;
  insertSector(fields: Record<string, unknown>): Promise<Sector>;
  adminList(table: AdminTable): Promise<unknown[]>;
  adminInsert(table: AdminTable, fields: Record<string, unknown>): Promise<unknown>;
  adminUpdate(table: AdminTable, id: string, fields: Record<string, unknown>): Promise<unknown | null>;
  adminDelete(table: AdminTable, id: string): Promise<boolean>;
  setStoreCompanyRef(store: string, companyId: string | null): Promise<void>;
  audit(entry: { event: string; user_email: string; user_role: string; store_name: string | null; details: unknown }): Promise<void>;
}

export class HttpError extends Error {
  constructor(public status: number, public reason: string, message: string, public extra?: Record<string, unknown>) { super(message); }
}

// ── Чисти помощни функции ─────────────────────────────────────────────────
// „a@x, b@y" → ["a@x","b@y"]: разделяне по запетая, trim, lowercase.
export function parseEmailList(v: unknown): string[] {
  if (typeof v !== "string") return [];
  return v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function resolveAccess(u: User, beta: string[], trz: string[]): Access | HttpError {
  const email = String(u.email || "").trim().toLowerCase();
  if (u.active === false) return new HttpError(403, "inactive", "Акаунтът е неактивен.");
  if (!email || beta.indexOf(email) < 0) return new HttpError(403, "not_beta", "Модулът „Работен график“ още не е отворен за този акаунт.");
  const base = { email, name: u.display_name || email, role: u.role || "" };
  if (trz.indexOf(email) >= 0) return { ...base, kind: "trz", readAll: true, read: [], edit: [], canAdmin: false, canReopen: false };
  if (u.role === "admin") return { ...base, kind: "admin", readAll: true, read: [], edit: "all", canAdmin: true, canReopen: true };
  const assigned = Array.isArray(u.assigned_stores) ? u.assigned_stores.filter((s) => typeof s === "string" && s) : [];
  if (u.is_regional && assigned.length) return { ...base, kind: "regional", readAll: false, read: assigned, edit: assigned, canAdmin: false, canReopen: true };
  const own = u.store_name ? [u.store_name] : [];
  if (u.role === "manager") return { ...base, kind: "manager", readAll: false, read: own, edit: own, canAdmin: false, canReopen: false };
  return { ...base, kind: "viewer", readAll: false, read: own, edit: [], canAdmin: false, canReopen: false };
}

export const canRead = (a: Access, store: string) => a.readAll || a.read.indexOf(store) >= 0;
export const canEdit = (a: Access, store: string) => a.edit === "all" || a.edit.indexOf(store) >= 0;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
// "2026-11" → { start: "2026-11-01", end: "2026-11-30", days: 30 }
export function parseMonth(v: unknown): { start: string; end: string; days: number; prev: string } | null {
  if (typeof v !== "string") return null;
  const m = v.match(MONTH_RE);
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (y < 2020 || y > 2100) return null;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const pad = (n: number) => (n < 10 ? "0" : "") + n;
  const py = mo === 1 ? y - 1 : y, pm = mo === 1 ? 12 : mo - 1;
  return { start: y + "-" + pad(mo) + "-01", end: y + "-" + pad(mo) + "-" + pad(days), days, prev: py + "-" + pad(pm) };
}

// Валиден ли е записът към датата d (YYYY-MM-DD). NULL = без граница.
export function validAt(r: Dated, d: string): boolean {
  return (!r.valid_from || r.valid_from <= d) && (!r.valid_to || r.valid_to >= d);
}

// Дружество, утвърдил, ВТР, кодове, сезон и буква → код, валидни към първия ден на месеца.
export function resolveSetup(raw: SetupRaw, start: string, end: string) {
  const sc = raw.storeCompany.filter((r) => validAt(r, start))[0] || null;
  const company = sc ? raw.companies.filter((c) => c.id === sc.company_id)[0] || null : null;
  const term = company ? raw.terms.filter((t) => t.company_id === company.id && validAt(t, start))[0] || null : null;
  const vtr = term ? term.vtr_id : null;
  const mo = String(+start.slice(5, 7));
  const seasonRow = vtr ? raw.seasons.filter((s) => s.vtr_id === vtr && validAt(s, start))[0] : undefined;
  const missing: string[] = [];
  if (!sc) missing.push("обект → дружество");
  if (sc && !company) missing.push("дружество");
  if (company && !company.name) missing.push("име на дружеството");
  if (company && !company.addr) missing.push("адрес на дружеството");
  if (company && !term) missing.push("утвърдил / ВТР");
  return {
    company: company ? { id: company.id, name: company.name, eik: company.eik, mol: company.mol, addr: company.addr } : null,
    store: sc ? { blank_name: sc.blank_name, address: sc.address } : null,
    approver: term ? term.approver : null,
    vtr_id: vtr,
    season: seasonRow ? seasonRow.months[mo] || null : null,
    // Пълното име за екрана (grafik_vtr_seasons.labels) — „З1“ се чете като „31“. Кодът остава вътрешен.
    season_label: seasonRow && seasonRow.months[mo] ? ((seasonRow.labels && seasonRow.labels[seasonRow.months[mo]]) || seasonRow.months[mo]) : null,
    codes: vtr ? raw.codes.filter((c) => c.vtr_id === vtr && validAt(c, start)).sort((a, b) => a.sort_order - b.sort_order) : [],
    letter_map: vtr ? raw.letterMap.filter((l) => l.vtr_id === vtr && validAt(l, start)).map((l) => ({ letter: l.letter, day_kind: l.day_kind, code: l.code, hours_per_day: l.hours_per_day ?? null })) : [],
    extra_days: raw.extraDays.filter((e) => e.day >= start && e.day <= end),
    sectors: (raw.sectors || []).filter((x) => x.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "bg"))
      .map((x) => ({ id: x.id, name: x.name, sort_order: x.sort_order })),
    missing,
  };
}

// Клетка в графика: буква от grafik_letter_map, „свободни часове" (цяло 1–12,
// колона BD в бланката) или празно. Всичко друго → изрична грешка, не тихо.
export const HOURS_RE = /^(?:[1-9]|1[0-2])$/;
export function badCells(letters: unknown, days: number, allowed: string[]): string[] | null {
  if (!Array.isArray(letters) || letters.length > 31) return null;
  const out: string[] = [];
  letters.forEach((v, i) => {
    if (typeof v !== "string") { out.push((i + 1) + ": не е текст"); return; }
    if (v === "") return;
    if (i >= days) { out.push((i + 1) + ": денят не е в месеца"); return; }
    if (allowed.indexOf(v) < 0 && !HOURS_RE.test(v)) out.push((i + 1) + ": „" + v + "“");
  });
  return out;
}

export function checkLocked(locked: unknown, days: number): boolean {
  if (locked === undefined || locked === null) return true;
  if (!isObj(locked)) return false;
  return Object.keys(locked).every((k) => /^\d{1,2}$/.test(k) && +k >= 1 && +k <= days &&
    typeof (locked as Record<string, unknown>)[k] === "string" && ((locked as Record<string, string>)[k]).length <= 8);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Бели списъци.
// sector — старият текст от бланката (история на импорта); екранът пише sector_id (grafik_sectors).
export const STAFF_FIELDS = ["short_name", "full_name", "contract_title", "position", "sector", "sector_id", "hours_per_day", "hired_on", "left_on", "sort_order", "note"] as const;

// Секторът трябва да е от същия магазин и активен.
async function checkSector(repo: Repo, v: unknown, store: string): Promise<void> {
  if (v === undefined || v === null) return;
  const sec = await repo.getSector(uuid(v, "sector_id"));
  if (!sec || sec.store_name !== store || !sec.active) throw new HttpError(400, "bad_request", "Секторът не е от този магазин.");
}
export const ADMIN_FIELDS: Record<AdminTable, readonly string[]> = {
  companies: ["name", "eik", "mol", "addr"],
  grafik_company_terms: ["company_id", "vtr_id", "approver", "valid_from", "valid_to"],
  grafik_store_company: ["store_name", "company_id", "blank_name", "address", "valid_from", "valid_to"],
  grafik_extra_days: ["day", "store_name", "note"],
  grafik_letter_map: ["code", "valid_from", "valid_to"], // само смяна на кода (напр. М → …); нови букви — с миграция
};
const ADMIN_INSERTABLE: AdminTable[] = ["companies", "grafik_company_terms", "grafik_store_company", "grafik_extra_days"];
const ADMIN_DELETABLE: AdminTable[] = ["grafik_extra_days"];

function pick(fields: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isObj(fields)) throw new HttpError(400, "bad_request", "fields трябва да е обект.");
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, "bad_request", "fields е празен.");
  const bad = keys.filter((k) => allowed.indexOf(k) < 0);
  if (bad.length) throw new HttpError(400, "bad_request", "Непозволено поле: " + bad.join(", ") + ".");
  return { ...fields };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(v: unknown, what: string): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new HttpError(400, "bad_request", "Невалиден " + what + ".");
  return v;
}

// Същото правило като GrafikEngine.inMonth: не е напуснал преди първия ден и не е назначен след последния.
export function staffInMonth(s: Record<string, unknown>, start: string, end: string): boolean {
  const left = typeof s.left_on === "string" ? s.left_on : null, hired = typeof s.hired_on === "string" ? s.hired_on : null;
  return !(left && left < start) && !(hired && hired > end);
}

export const SNAPSHOT_MAX_BYTES = 512 * 1024;
// Снимката идва от браузъра (изчисленията са там в етап 1). Сървърът проверява
// структурата; заглавката (дружество, адрес, утвърдил, съставил) я пише САМ.
export function checkSnapshot(s: unknown, days: number, staffIds: string[]): string | null {
  if (!isObj(s)) return "snapshot трябва да е обект.";
  if (JSON.stringify(s).length > SNAPSHOT_MAX_BYTES) return "snapshot е твърде голям.";
  const rows = s.rows;
  if (!Array.isArray(rows)) return "snapshot.rows липсва.";
  const seen: Record<string, boolean> = {};
  for (const r of rows) {
    if (!isObj(r)) return "Ред в snapshot.rows не е обект.";
    if (typeof r.staff_id !== "string" || staffIds.indexOf(r.staff_id) < 0) return "Служител в снимката не е от графика на месеца.";
    if (seen[r.staff_id]) return "Служител е два пъти в снимката.";
    seen[r.staff_id] = true;
    if (!Array.isArray(r.codes) || r.codes.length !== days) return "Кодовете на ред не са " + days + " (дните в месеца).";
    if (!r.codes.every((c) => typeof c === "string" && c.length <= 8)) return "Невалиден код в снимката.";
  }
  if (rows.length !== staffIds.length) return "Снимката не съдържа всички редове от графика.";
  return null;
}

// ── HTTP ─────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

export async function handleGrafik(req: Request, getRepo: () => Repo, now?: number): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad_request", message: "Невалидна заявка." }, 400); }
  if (!isObj(body)) return json({ ok: false, reason: "bad_request", message: "Невалидна заявка." }, 400);

  // 1) Пропускът — преди базата.
  const sess = await verifySession(body.session, now);
  if (!sess) return json({ ok: false, reason: "session_expired", message: "Сесията е изтекла — влез отново." }, 401);

  try {
    const repo = getRepo();
    // 2) Актуалният потребител от базата.
    const user = await repo.getUser(String(sess.uid));
    if (!user) return json({ ok: false, reason: "forbidden", message: "Потребителят не е намерен." }, 403);
    // 3) + 4) Списъците и видът достъп.
    const st = await repo.getSettings(["grafik_beta_users", "grafik_trz_users"]);
    const acc = resolveAccess(user, parseEmailList(st.grafik_beta_users), parseEmailList(st.grafik_trz_users));
    if (acc instanceof HttpError) return json({ ok: false, reason: acc.reason, message: acc.message }, acc.status);
    const result = await dispatch(repo, acc, body);
    return json({ ok: true, ...result }, 200);
  } catch (e) {
    if (e instanceof HttpError) return json({ ok: false, reason: e.reason, message: e.message, ...(e.extra || {}) }, e.status);
    console.error("grafik-api error:", e);
    return json({ ok: false, reason: "internal", message: "Вътрешна грешка." }, 500);
  }
}

async function needStore(repo: Repo, acc: Access, v: unknown, mode: "read" | "edit"): Promise<string> {
  if (typeof v !== "string" || !v) throw new HttpError(400, "bad_request", "Липсва обект.");
  const names = await repo.storeNames();
  if (names.indexOf(v) < 0) throw new HttpError(400, "bad_request", "Няма такъв обект.");
  if (mode === "read" ? !canRead(acc, v) : !canEdit(acc, v)) {
    throw new HttpError(403, mode === "read" ? "forbidden_store" : "readonly",
      mode === "read" ? "Нямате достъп до графика на този обект." : "Нямате права да променяте графика на този обект.");
  }
  return v;
}
function needMonth(v: unknown) {
  const m = parseMonth(v);
  if (!m) throw new HttpError(400, "bad_request", "Невалиден месец (очаква се ГГГГ-ММ).");
  return m;
}
const audit = (repo: Repo, acc: Access, event: string, store: string | null, details: unknown) =>
  repo.audit({ event, user_email: acc.email, user_role: acc.role, store_name: store, details }).catch(() => {});

async function dispatch(repo: Repo, acc: Access, b: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (b.action) {
    case "me": {
      const names = await repo.storeNames();
      const visible = acc.readAll ? names : names.filter((n) => acc.read.indexOf(n) >= 0);
      return {
        kind: acc.kind, email: acc.email, name: acc.name, can_admin: acc.canAdmin, can_reopen: acc.canReopen,
        stores: visible.map((n) => ({ name: n, can_edit: canEdit(acc, n) })),
      };
    }

    case "load_month": {
      const store = await needStore(repo, acc, b.store, "read");
      const m = needMonth(b.month);
      const month = await repo.getMonth(store, m.start);
      // ТРЗ виждат само подадени месеци — черновата за тях не съществува.
      if (acc.kind === "trz" && (!month || month.status !== "submitted")) {
        throw new HttpError(404, "not_submitted", "Графикът за този месец още не е подаден.");
      }
      const staff = await repo.listStaff(store);
      const rows = month ? await repo.listRows(month.id) : [];
      let prevRows: RowRec[] = [];
      if (b.prev === true && acc.kind !== "trz") {
        const pm = await repo.getMonth(store, m.prev + "-01");
        prevRows = pm ? await repo.listRows(pm.id) : [];
      }
      const setup = resolveSetup(await repo.setupRaw(store), m.start, m.end);
      return {
        store, month: m.start, days: m.days, can_edit: canEdit(acc, store) && (!month || month.status === "draft"),
        can_reopen: acc.canReopen && canEdit(acc, store) && !!month && month.status === "submitted",
        status: month ? month.status : "draft", month_row: month, staff, rows, prev_rows: prevRows, setup,
      };
    }

    case "staff_list": {
      if (acc.kind === "trz") throw new HttpError(403, "forbidden", "ТРЗ виждат персонала през подадените графици.");
      const store = await needStore(repo, acc, b.store, "read");
      return { store, staff: await repo.listStaff(store) };
    }

    case "staff_save": {
      const store = await needStore(repo, acc, b.store, "edit");
      const fields = pick(b.fields, STAFF_FIELDS);
      await checkSector(repo, fields.sector_id, store);
      if (b.id === undefined || b.id === null) {
        if (typeof fields.short_name !== "string" || !fields.short_name.trim() || typeof fields.full_name !== "string" || !fields.full_name.trim()) {
          throw new HttpError(400, "bad_request", "Име за графика и три имена са задължителни.");
        }
        const s = await repo.insertStaff({ ...fields, store_name: store, created_by: acc.email, updated_by: acc.email });
        await audit(repo, acc, "grafik_staff_create", store, { id: s.id, fields });
        return { staff: s };
      }
      const id = uuid(b.id, "id");
      const cur = (await repo.getStaff([id]))[0];
      if (!cur || cur.store_name !== store) throw new HttpError(404, "not_found", "Служителят не е от този обект.");
      const s = await repo.updateStaff(id, { ...fields, updated_by: acc.email, updated_at: new Date().toISOString() });
      await audit(repo, acc, "grafik_staff_update", store, { id, fields });
      return { staff: s };
    }

    case "staff_move": {
      if (acc.kind !== "admin") throw new HttpError(403, "forbidden", "Преместване между обекти — само admin.");
      const id = uuid(b.id, "id");
      const to = await needStore(repo, acc, b.to_store, "edit");
      if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new HttpError(400, "bad_request", "Невалидна дата.");
      const cur = (await repo.getStaff([id]))[0];
      if (!cur) throw new HttpError(404, "not_found", "Служителят не е намерен.");
      if (cur.store_name === to) throw new HttpError(400, "bad_request", "Служителят вече е в този обект.");
      const d = new Date(b.date + "T00:00:00Z");
      const leftOn = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
      await repo.updateStaff(id, { left_on: leftOn, updated_by: acc.email, updated_at: new Date().toISOString() });
      const copy: Record<string, unknown> = {};
      for (const k of STAFF_FIELDS) if (k !== "left_on" && k !== "hired_on" && k !== "sector_id" && cur[k] !== undefined) copy[k] = cur[k];   // секторът е на стария магазин
      const s = await repo.insertStaff({ ...copy, store_name: to, hired_on: b.date, prev_staff_id: id, created_by: acc.email, updated_by: acc.email });
      await audit(repo, acc, "grafik_staff_move", to, { from_id: id, from_store: cur.store_name, to_id: s.id, date: b.date });
      return { staff: s };
    }

    case "save_rows": {
      const store = await needStore(repo, acc, b.store, "edit");
      const m = needMonth(b.month);
      if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 120) throw new HttpError(400, "bad_request", "rows: от 1 до 120 реда.");
      let month = await repo.getMonth(store, m.start);
      if (month && month.status !== "draft") throw new HttpError(409, "submitted", "Графикът е подаден — промени само след връщане в чернова.");
      const ids = b.rows.map((r) => (isObj(r) ? r.staff_id : null));
      ids.forEach((id) => uuid(id, "staff_id"));
      if (new Set(ids).size !== ids.length) throw new HttpError(400, "bad_request", "Служител е повече от веднъж в заявката.");
      const staff = await repo.getStaff(ids as string[]);
      if (staff.length !== ids.length || staff.some((s) => s.store_name !== store)) {
        throw new HttpError(400, "bad_request", "Служител не е от този обект.");
      }
      const allowed = await repo.letterSet();
      const errors: { staff_id: string; cells: string[] }[] = [];
      for (const r of b.rows as Record<string, unknown>[]) {
        const bad = badCells(r.letters, m.days, allowed);
        if (bad === null) throw new HttpError(400, "bad_request", "letters трябва да е масив до 31 елемента.");
        if (bad.length) errors.push({ staff_id: r.staff_id as string, cells: bad });
        if (!checkLocked(r.locked, m.days)) throw new HttpError(400, "bad_request", "Невалидни заключени кодове.");
      }
      if (errors.length) {
        // Изрично, по клетка — нищо не се записва наполовина и нищо не се губи тихо.
        throw new HttpError(400, "bad_cells", "Непознати стойности в графика.", { errors });
      }
      if (!month) month = await repo.ensureMonth(store, m.start);
      if (month.status !== "draft") throw new HttpError(409, "submitted", "Графикът е подаден — промени само след връщане в чернова.");
      const nowIso = new Date().toISOString();
      await repo.upsertRows((b.rows as Record<string, unknown>[]).map((r) => ({
        month_id: month!.id, staff_id: r.staff_id as string, letters: r.letters as string[],
        locked: (r.locked as Record<string, string>) || {},
        updated_at: nowIso, updated_by: acc.email,
      })));
      return { month_id: month.id, saved: b.rows.length, updated_at: nowIso };
    }

    case "submit": {
      const store = await needStore(repo, acc, b.store, "edit");
      const m = needMonth(b.month);
      const month = await repo.getMonth(store, m.start);
      if (!month) throw new HttpError(404, "not_found", "Няма въведен график за този месец.");
      if (month.status !== "draft") throw new HttpError(409, "submitted", "Графикът вече е подаден.");
      const setup = resolveSetup(await repo.setupRaw(store), m.start, m.end);
      if (setup.missing.length) throw new HttpError(409, "missing_company", "Липсват данни за дружеството — админ (" + setup.missing.join(", ") + ").");
      // Редове на хора извън месеца (датата им на назначаване/напускане е сменена след
      // въвеждането) остават в grafik_rows, но не са в графика → не се искат в снимката.
      const rows = await repo.listRows(month.id);
      const rowStaff = await repo.getStaff(rows.map((r) => r.staff_id));
      const inMonthIds = rowStaff.filter((s) => staffInMonth(s, m.start, m.end)).map((s) => s.id);
      const err = checkSnapshot(b.snapshot, m.days, inMonthIds);
      if (err) throw new HttpError(400, "bad_snapshot", err);
      const snapshot = {
        ...(b.snapshot as Record<string, unknown>),
        header: {
          company_name: setup.company!.name, company_addr: setup.company!.addr, company_eik: setup.company!.eik,
          store_blank_name: setup.store!.blank_name, store_address: setup.store!.address,
          approver: setup.approver, compiled_by: acc.name, vtr_id: setup.vtr_id, season: setup.season,
          month: m.start, days: m.days,
        },
      };
      const at = new Date().toISOString();
      const ok = await repo.updateMonth(month.id, {
        status: "submitted", submitted_at: at, submitted_by: acc.email, submitted_by_name: acc.name, snapshot, updated_at: at,
      }, "draft");
      if (!ok) throw new HttpError(409, "submitted", "Графикът вече е подаден.");
      await audit(repo, acc, "grafik_submit", store, { month: m.start, rows: inMonthIds.length, skipped_out_of_month: rows.length - inMonthIds.length });
      return { status: "submitted", submitted_at: at, submitted_by_name: acc.name };
    }

    case "reopen": {
      const store = await needStore(repo, acc, b.store, "edit");
      if (!acc.canReopen) throw new HttpError(403, "forbidden", "Връщане в чернова — само admin и регионалният.");
      const m = needMonth(b.month);
      const month = await repo.getMonth(store, m.start);
      if (!month || month.status !== "submitted") throw new HttpError(409, "not_submitted", "Графикът не е подаден.");
      const ok = await repo.updateMonth(month.id, {
        status: "draft", submitted_at: null, submitted_by: null, submitted_by_name: null, snapshot: null, updated_at: new Date().toISOString(),
      }, "submitted");
      if (!ok) throw new HttpError(409, "not_submitted", "Графикът не е подаден.");
      await audit(repo, acc, "grafik_reopen", store, { month: m.start, was_submitted_by: month.submitted_by, was_submitted_at: month.submitted_at });
      return { status: "draft" };
    }

    case "sector_save": {
      // Нов сектор в списъка на магазина — admin или регионалният за своя обект.
      const store = await needStore(repo, acc, b.store, "edit");
      if (acc.kind !== "admin" && acc.kind !== "regional") throw new HttpError(403, "forbidden", "Сектор добавят регионалният и admin.");
      const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
      if (!name || name.length > 60) throw new HttpError(400, "bad_request", "Име на сектора: от 1 до 60 знака.");
      const sort = typeof b.sort_order === "number" && isFinite(b.sort_order) ? Math.round(b.sort_order) : 500;
      let sec: Sector;
      try { sec = await repo.insertSector({ store_name: store, name, sort_order: sort, created_by: acc.email }); }
      catch (e) {
        if (e instanceof HttpError && e.reason === "db_constraint") throw new HttpError(409, "duplicate", "Секторът „" + name + "“ вече го има в този магазин.");
        throw e;
      }
      await audit(repo, acc, "grafik_sector_create", store, { id: sec.id, name });
      return { sector: sec };
    }

    case "overview": {
      const m = needMonth(b.month);
      const names = await repo.storeNames();
      const visible = acc.readAll ? names : names.filter((n) => acc.read.indexOf(n) >= 0);
      const months = (await repo.listMonths(m.start, acc.readAll ? null : visible))
        .filter((r) => acc.kind !== "trz" || r.status === "submitted");
      const counts = await repo.rowCounts(months.map((r) => r.id));
      const staffN = acc.kind === "trz" ? {} : await repo.staffCounts(acc.readAll ? null : visible);
      const byStore: Record<string, MonthRow> = {};
      months.forEach((r) => { byStore[r.store_name] = r; });
      const list = (acc.kind === "trz" ? months.map((r) => r.store_name) : visible).map((n) => {
        const r = byStore[n];
        return {
          store: n, status: r ? r.status : null, submitted_at: r ? r.submitted_at : null,
          submitted_by_name: r ? r.submitted_by_name : null, rows: r ? counts[r.id] || 0 : 0,
          staff: (staffN as Record<string, number>)[n] || 0, can_edit: canEdit(acc, n),
        };
      });
      return { month: m.start, stores: list };
    }

    case "admin_get": {
      if (!acc.canAdmin) throw new HttpError(403, "forbidden", "Само admin.");
      const t: AdminTable[] = ["companies", "grafik_company_terms", "grafik_store_company", "grafik_extra_days", "grafik_letter_map"];
      const out: Record<string, unknown> = {};
      for (const k of t) out[k] = await repo.adminList(k);
      return out;
    }

    case "admin_save": {
      if (!acc.canAdmin) throw new HttpError(403, "forbidden", "Само admin.");
      const table = b.table as AdminTable;
      if (!(typeof table === "string" && ADMIN_FIELDS[table])) throw new HttpError(400, "bad_request", "Непозната таблица.");
      const fields = pick(b.fields, ADMIN_FIELDS[table]);
      let row: unknown;
      if (b.id === undefined || b.id === null) {
        if (ADMIN_INSERTABLE.indexOf(table) < 0) throw new HttpError(400, "bad_request", "В тази таблица не се добавят редове оттук.");
        if (table === "grafik_extra_days") fields.created_by = acc.email;
        row = await repo.adminInsert(table, fields);
      } else {
        row = await repo.adminUpdate(table, uuid(b.id, "id"), fields);
        if (!row) throw new HttpError(404, "not_found", "Записът не е намерен.");
      }
      if (table === "grafik_store_company") {
        const r = row as { store_name: string };
        const raw = await repo.setupRaw(r.store_name);
        const today = new Date().toISOString().slice(0, 10);
        const cur = raw.storeCompany.filter((x) => validAt(x, today))[0];
        await repo.setStoreCompanyRef(r.store_name, cur ? cur.company_id : null);
      }
      await audit(repo, acc, "grafik_admin_save", null, { table, id: b.id || (row as { id?: string })?.id, fields });
      return { row };
    }

    case "admin_delete": {
      if (!acc.canAdmin) throw new HttpError(403, "forbidden", "Само admin.");
      const table = b.table as AdminTable;
      if (ADMIN_DELETABLE.indexOf(table) < 0) throw new HttpError(400, "bad_request", "От тази таблица не се трие оттук.");
      const ok = await repo.adminDelete(table, uuid(b.id, "id"));
      if (!ok) throw new HttpError(404, "not_found", "Записът не е намерен.");
      await audit(repo, acc, "grafik_admin_delete", null, { table, id: b.id });
      return { deleted: 1 };
    }
  }
  throw new HttpError(400, "bad_request", "Непознато действие.");
}
