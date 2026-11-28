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
//   3) имейлът има роля в grafik_access (list = view / trz / edit; „beta“ = edit до миграцията
//      grafik_access_roles) — иначе 403 not_beta (така браузърът знае и дали да покаже таба);
//   4) вид достъп — ролята в графика има предимство пред портала (27.11.2026):
//      trz → чете всички, само подадени месеци, одобрява, не пише; view → чете всички
//      (и черновите, и персонала), не пише нищо; edit → по портала: admin → всичко;
//      регионален (is_regional + assigned_stores) → своите обекти; manager → своя обект;
//      останалите → чете своя обект.
import { verifySession } from "../_shared/session.ts";
import { signPinToken, verifyPinToken } from "./pin-token.ts";

// ── Типове ────────────────────────────────────────────────────────────────
export type User = {
  id: string; email: string; display_name: string | null; store_name: string | null;
  role: string | null; is_regional: boolean | null; assigned_stores: string[] | null; active: boolean | null;
};
export type Kind = "trz" | "view" | "admin" | "regional" | "manager" | "viewer";
export type Access = {
  uid?: string; kind: Kind; email: string; name: string; role: string;
  readAll: boolean; read: string[]; edit: string[] | "all"; canAdmin: boolean; canReopen: boolean;
  // Нулира ПИН-а за графика на друг: admin с роля edit (canAdmin) или изричното
  // grafik_access.can_reset_pin (Теодор, решение 27.11.2026 — въпреки че е view).
  canResetPin?: boolean;
};
export type Dated = { valid_from: string | null; valid_to: string | null };
export type MonthRow = {
  id: string; store_name: string; month: string; status: "draft" | "submitted" | "approved";
  submitted_at: string | null; submitted_by: string | null; submitted_by_name: string | null;
  // Етап Б (24.11.2026, миграция grafik_approve): одобрение от ТРЗ и последното „↩ Върни с коментар“.
  approved_at?: string | null; approved_by?: string | null; approved_by_name?: string | null;
  return_comment?: string | null; returned_at?: string | null; returned_by_name?: string | null;
  snapshot: unknown; updated_at?: string;
};
export type RowRec = { id?: string; month_id: string; staff_id: string; letters: string[]; locked: Record<string, string>; sort_order?: number; updated_at?: string; updated_by?: string | null };
export type Staff = { id: string; store_name: string; [k: string]: unknown };
// „Промени“ (grafik_changes, 05.11.2026): реалните отклонения от ПОДАДЕН график, ред за човек и ден.
export type ChangeRow = {
  id: string; month_id: string; staff_id: string; day: number; planned_letter: string | null; planned_code: string | null;
  actual: string; reason: string; trip_store?: string | null; created_at?: string; created_by?: string | null; updated_at?: string; updated_by?: string | null;
  trz_done: boolean; trz_done_at?: string | null; trz_done_by?: string | null;
  source?: "manual" | "daily";   // пакет 2А (миграция grafik_daily): „✎ Промени“ / „✅ Днес“
};
// Пакет 2А — дневна присъствена „✅ Днес“ (grafik_daily / grafik_daily_marks, миграция grafik_daily).
export type DailyRow = {
  id: string; store_name: string; month_id: string; day: string; marked_by: string; marked_by_name: string | null; marked_at: string; late: boolean;
  updated_by?: string | null; updated_by_name?: string | null; updated_at?: string | null;
  corrected_by?: string | null; corrected_by_name?: string | null; corrected_at?: string | null; correct_reason?: string | null;
};
export type MarkRow = {
  staff_id: string; planned_letter: string | null; state: string; actual: string | null; trip_store: string | null; note: string | null;
  change_id?: string | null; marked_by?: string | null; marked_at?: string;
};
export type DailySave = {
  store_name: string; month_id: string; day: string; actor: string; actor_name: string; late: boolean; correction: { reason: string } | null;
  changes_delete: string[];
  changes_upsert: { staff_id: string; planned_letter: string; planned_code: string; actual: string; reason: string; trip_store: string | null }[];
  marks: MarkRow[];
};
// Ролята в модула (grafik_access.list, решение на Тенчо 27.11.2026): view — всички обекти, само четене;
// trz — подадените, одобрява; edit — пише по правата си в портала. „beta“ — старото име на edit
// (до миграцията grafik_access_roles; чете се като edit, за да може деплоят да е преди нея).
export type AccessList = "beta" | "view" | "trz" | "edit";
export type GrafikRole = "view" | "trz" | "edit";
export type AccessRow = { id: string; list: AccessList; email: string; note: string | null; can_reset_pin?: boolean; created_at?: string; created_by?: string | null };
export type Vtr = { id: string; name: string };
// По месец: колко реда има и последната промяна по тях (кой, кога) — за обзора.
export type RowStat = { rows: number; last_at: string | null; last_by: string | null };
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
export type Sector = { id: string; store_name: string; name: string; sort_order: number; active: boolean; track_coverage?: boolean };
export type AdminTable = "companies" | "grafik_company_terms" | "grafik_store_company" | "grafik_extra_days" | "grafik_letter_map";

export interface Repo {
  getUser(id: string): Promise<User | null>;
  listChanges(monthId: string): Promise<ChangeRow[]>;
  insertChange(fields: Record<string, unknown>): Promise<ChangeRow>;
  updateChange(id: string, fields: Record<string, unknown>): Promise<ChangeRow | null>;
  deleteChange(id: string): Promise<boolean>;
  // Пакет 2А: денят на обекта, отметките му и записът (функцията grafik_daily_save — една транзакция).
  getDaily(store: string, day: string): Promise<DailyRow | null>;
  listMarks(dailyId: string): Promise<MarkRow[]>;
  dailySave(p: DailySave): Promise<string>;
  listAccess(): Promise<AccessRow[]>;
  insertAccess(fields: Record<string, unknown>): Promise<AccessRow>;
  updateAccess(id: string, fields: Record<string, unknown>): Promise<AccessRow | null>;
  deleteAccess(id: string): Promise<boolean>;
  vtrList(): Promise<Vtr[]>;
  storeNames(): Promise<string[]>;
  getMonth(store: string, month: string): Promise<MonthRow | null>;
  ensureMonth(store: string, month: string): Promise<MonthRow>;
  updateMonth(id: string, fields: Partial<MonthRow>, expectStatus: string): Promise<boolean>;
  listMonths(month: string, stores: string[] | null): Promise<MonthRow[]>;
  rowStats(monthIds: string[]): Promise<Record<string, RowStat>>;
  changeStats(monthIds: string[]): Promise<Record<string, { n: number; open: number }>>;
  userNames(emails: string[]): Promise<Record<string, string>>;
  listRows(monthId: string): Promise<RowRec[]>;
  upsertRows(rows: RowRec[]): Promise<void>;
  listStaff(store: string): Promise<Staff[]>;
  // Датите на назначаване / напускане по обект — броят в месеца се смята тук (staffInMonth).
  staffDates(stores: string[] | null): Promise<{ id?: string; store_name: string; hired_on: string | null; left_on: string | null }[]>;
  // Пакет 1, т.4 — буквите и промените на месеците за „Активни“ (без съдържание към браузъра).
  monthLetters(monthIds: string[]): Promise<{ month_id: string; staff_id: string; letters: string[] }[]>;
  monthChanges(monthIds: string[]): Promise<{ month_id: string; staff_id: string; day: number; actual: string }[]>;
  storeUsers(store: string): Promise<{ email: string | null; display_name?: string | null; active: boolean | null }[]>;
  sendMail(to: string[], subject: string, html: string): Promise<boolean>;
  getStaff(ids: string[]): Promise<Staff[]>;
  insertStaff(fields: Record<string, unknown>): Promise<Staff>;
  updateStaff(id: string, fields: Record<string, unknown>): Promise<Staff | null>;
  setupRaw(store: string): Promise<SetupRaw>;
  letterSet(): Promise<string[]>;
  getSector(id: string): Promise<Sector | null>;
  insertSector(fields: Record<string, unknown>): Promise<Sector>;
  updateSector(id: string, fields: Record<string, unknown>): Promise<Sector | null>;
  adminList(table: AdminTable): Promise<unknown[]>;
  adminInsert(table: AdminTable, fields: Record<string, unknown>): Promise<unknown>;
  adminUpdate(table: AdminTable, id: string, fields: Record<string, unknown>): Promise<unknown | null>;
  adminDelete(table: AdminTable, id: string): Promise<boolean>;
  setStoreCompanyRef(store: string, companyId: string | null): Promise<void>;
  audit(entry: { event: string; user_email: string; user_role: string; store_name: string | null; details: unknown }): Promise<void>;
  // Етап В (27.11.2026): grafik_audit — и четенето; без права за anon (audit_log е четим с публичния ключ).
  gAudit(entry: GAuditEntry): Promise<void>;
  auditList(q: { since: string; email: string | null; store: string | null; limit: number }): Promise<GAuditRow[]>;
  // Етап Б (27.11.2026): ПИН за графика (grafik_pin, без права за anon). Хешът не излиза от repo
  // освен в pinReserve — за сравнението в handler-а.
  pinGet(userId: string): Promise<PinState | null>;
  pinStates(): Promise<(PinState & { user_id: string; email: string | null })[]>;
  pinCreate(userId: string, hash: string): Promise<void>;
  // Атомарно ЗАПАЗВА опит преди сравнението (fails + 1, заключва на 5-ия и 10-ия) — паралелни
  // заявки не могат да пробват повече от позволеното. null — няма ПИН.
  pinReserve(userId: string): Promise<{ granted: boolean; pin_hash: string | null; fails: number; locked_until: string | null; blocked: boolean } | null>;
  pinOk(userId: string): Promise<void>;
  pinUpdateHash(userId: string, hash: string): Promise<void>;
  pinDelete(userId: string): Promise<boolean>;
  hashPin(pin: string): Promise<string>;
  checkPin(pin: string, hash: string): Promise<boolean>;
}
export type GAuditEntry = {
  event: string; user_email: string; user_role: string; grafik_kind: string; store_name: string | null;
  month: string | null; success: boolean; details: unknown; dedup_key: string | null;
};
export type GAuditRow = GAuditEntry & { id: number; at: string };
export type PinState = { fails: number; locked_until: string | null; blocked: boolean; set_at?: string | null; last_ok_at?: string | null };

export class HttpError extends Error {
  constructor(public status: number, public reason: string, message: string, public extra?: Record<string, unknown>) { super(message); }
}

// ── Чисти помощни функции ─────────────────────────────────────────────────
export function accessEmails(rows: AccessRow[], list: AccessList): string[] {
  return rows.filter((r) => r.list === list).map((r) => String(r.email).trim().toLowerCase());
}
export const ROLE_LABEL: Record<GrafikRole, string> = { view: "преглед", trz: "ТРЗ", edit: "редакция" };
function needRole(v: unknown): GrafikRole {
  if (v === "view" || v === "trz" || v === "edit") return v;
  throw new HttpError(400, "bad_request", "Ролята е view, trz или edit.");
}
// Имейл за списъците: малки букви, без интервали, точно едно „@“ и точка в домейна.
export const ACCESS_EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

// Ролята на имейла по редовете на grafik_access. След миграцията имейлът е в точно един ред;
// дотогава (и ако все пак има два) печели по-тясната: trz > view > edit (beta = edit).
export function roleOf(rows: AccessRow[], email: string): GrafikRole | null {
  const e = String(email || "").trim().toLowerCase();
  const mine = rows.filter((r) => String(r.email || "").trim().toLowerCase() === e).map((r) => r.list);
  if (!e || !mine.length) return null;
  if (mine.indexOf("trz") >= 0) return "trz";
  if (mine.indexOf("view") >= 0) return "view";
  if (mine.indexOf("edit") >= 0 || mine.indexOf("beta") >= 0) return "edit";
  return null;
}
export function canResetPinOf(rows: AccessRow[], email: string): boolean {
  const e = String(email || "").trim().toLowerCase();
  return rows.some((r) => String(r.email || "").trim().toLowerCase() === e && r.can_reset_pin === true);
}

// Ролята в графика има предимство пред ролята в портала: admin с „view“ не пише и не администрира.
export function resolveAccess(u: User, grole: GrafikRole | null, canResetPin = false): Access | HttpError {
  const email = String(u.email || "").trim().toLowerCase();
  if (u.active === false) return new HttpError(403, "inactive", "Акаунтът е неактивен.");
  if (!email || !grole) return new HttpError(403, "not_beta", "Модулът „Работен график“ още не е отворен за този акаунт.");
  const base = { uid: u.id, email, name: u.display_name || email, role: u.role || "" };
  if (grole === "trz") return { ...base, kind: "trz", readAll: true, read: [], edit: [], canAdmin: false, canReopen: false, canResetPin };
  if (grole === "view") return { ...base, kind: "view", readAll: true, read: [], edit: [], canAdmin: false, canReopen: false, canResetPin };
  // edit — по правата в портала, както досега.
  const assigned = Array.isArray(u.assigned_stores) ? u.assigned_stores.filter((s) => typeof s === "string" && s) : [];
  // Пакет 1, т.8 (решение на Тенчо 27.11.2026): регионален (is_regional + assigned_stores) пише само в своите
  // обекти, дори ролята му в портала да е admin; чужди — само четене. Не одобрява и не администрира графика
  // (иначе „✔ Одобри“ / картата биха писали и в чужди обекти). Admin без is_regional — всички, както досега.
  if (u.role === "admin" && u.is_regional && assigned.length) return { ...base, kind: "regional", readAll: true, read: [], edit: assigned, canAdmin: false, canReopen: true, canResetPin };
  if (u.role === "admin") return { ...base, kind: "admin", readAll: true, read: [], edit: "all", canAdmin: true, canReopen: true, canResetPin: true };
  if (u.is_regional && assigned.length) return { ...base, kind: "regional", readAll: false, read: assigned, edit: assigned, canAdmin: false, canReopen: true, canResetPin };
  const own = u.store_name ? [u.store_name] : [];
  if (u.role === "manager") return { ...base, kind: "manager", readAll: false, read: own, edit: own, canAdmin: false, canReopen: false, canResetPin };
  return { ...base, kind: "viewer", readAll: false, read: own, edit: [], canAdmin: false, canReopen: false, canResetPin };
}

// Първият ден на текущия месец по българско време (ГГГГ-ММ-01).
export function sofiaMonthStart(nowS: number): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit" }).formatToParts(new Date(nowS * 1000));
  const y = p.filter((x) => x.type === "year")[0].value, m = p.filter((x) => x.type === "month")[0].value;
  return y + "-" + m + "-01";
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
      .map((x) => ({ id: x.id, name: x.name, sort_order: x.sort_order, track_coverage: x.track_coverage !== false })),
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
    if (![r.official, r.target, r.diff].every((n) => typeof n === "number" && isFinite(n))) return "Липсват часовете (official / target / diff) в снимката.";
  }
  if (rows.length !== staffIds.length) return "Снимката не съдържа всички редове от графика.";
  return null;
}

// „Подай" спира (решение на Тенчо 04.11.2026, вариант а) — същото като grSubmitIssues в grafik.js:
//   - служител в месеца без ред / с празен ред (без букви и без заключени кодове) — по grafik_rows;
//     норма 0 в снимката (назначен след последния работен ден) → не се иска нищо;
//   - свободни часове 1–12 в клетка — по grafik_rows;
//   - извън нормата — по diff от снимката (целта е сметната в браузъра: празниците и нормата
//     още не са на сървъра — общото ядро е отворена точка).
export const SUBMIT_HINT = "Сложи кодове за дните или О/Б/Н; ако човекът не работи този месец — сложи му „Назначен на“ / „Напуснал на“ в 👥 Персонал.";
function hrs(n: number): string { return String(Math.round(n * 10) / 10).replace(".", ","); }
function p2(n: number): string { return (n < 10 ? "0" : "") + n; }
// От 05.11.2026 и ЛД в неделя (бланката: червено + ПРОВЕРКА „ЛД в неделя“) — по grafik_rows и датата.
export function submitIssues(staff: Staff[], rows: RowRec[], snapRows: Record<string, unknown>[], days: number, start: string): string[] {
  const month = +start.slice(5, 7), dow0 = new Date(start + "T00:00:00Z").getUTCDay();   // 0 = неделя
  const byRow: Record<string, RowRec> = {}, bySnap: Record<string, Record<string, unknown>> = {};
  rows.forEach((r) => { byRow[r.staff_id] = r; });
  snapRows.forEach((r) => { bySnap[r.staff_id as string] = r; });
  const out: string[] = [];
  for (const s of staff) {
    const name = String(s.full_name || s.short_name || ""), r = byRow[s.id], sr = bySnap[s.id] || {};
    const letters = (r && Array.isArray(r.letters) ? r.letters : []).slice(0, days);
    const any = letters.some((v) => !!v) || (!!r && Object.keys(r.locked || {}).length > 0);
    const norm = typeof sr.norm === "number" ? sr.norm : null;
    if (!any) {
      if (norm !== 0) out.push(name + ": " + (r ? "редът в графика е празен" : "няма ред в графика за месеца") + (norm ? " (0 ч. вместо " + hrs(norm) + " ч.)" : ""));
    } else if (sr.diff !== 0) out.push(name + ": " + hrs(Number(sr.official)) + " ч. вместо " + hrs(Number(sr.target)) + " ч.");
    letters.forEach((v, i) => {
      if (typeof v === "string" && HOURS_RE.test(v)) out.push(name + ": " + p2(i + 1) + "." + p2(month) + " — написано е число " + v + ", избери смяна (П, ЛД…)");   // етап Б (24.11.2026): като grSubmitIssues в grafik.js
      else if (v === "ЛД" && (dow0 + i) % 7 === 0) out.push(name + ": ЛД в неделя на " + p2(i + 1) + "." + p2(month) + " — ползвай ЗД");
    });
  }
  return out;
}

// ── „Промени“ (П1, план одобрен 05.11.2026; решения а–з) ─────────────────────
// „Реално“ — списъкът на бланката (лист „Промени“, D2:D500): работните букви + неявяванията от
// Настройки Q:R. „По график“ се взема тук (grafik_rows + снимката), не от браузъра.
// „К“ (пакет 1, т.6, 27.11.2026) — командировка: задължителен обект получател (trip_store; миграция
// grafik_changes_trip). Часовете — пълната смяна по договора, както в графика; при обекта получател —
// пакет 4 (същото поле).
export const CHANGE_ACTUALS = ["ЛД", "ЗД", "П", "В", "М", "К", "почивка", "О", "Б", "Н", "Д", "А", "С", "Майч"];

// ── Активен персонал за месеца (пакет 1, т.4, решение на Тенчо 27.11.2026) ─────
// Човекът (в месеца по датите си) НЕ е активен, ако в нито един свой ден няма работна смяна
// (ЛД, ЗД, П, В, М, К, свободни часове) или платен отпуск (О, О4), а има поне един ден Б / НО
// (или от „Промени“: Б, Н, Майч). Почивките не решават. Празен ред → активен (той е „извън нормата“).
// Промяната за деня (подаден / одобрен месец) има предимство пред буквата в графика.
const ACTIVE_WORK = ["ЛД", "ЗД", "П", "В", "М", "К", "О", "О4"];
const ACTIVE_OFF = ["Б", "НО", "Н", "Майч"];
export function activeInMonth(s: { hired_on?: unknown; left_on?: unknown }, letters: unknown, changes: Record<number, string>, start: string, days: number): boolean {
  const L = Array.isArray(letters) ? letters : [];
  let off = false;
  for (let d = 1; d <= days; d++) {
    const date = addDay(start, d);
    if (typeof s.hired_on === "string" && date < s.hired_on) continue;
    if (typeof s.left_on === "string" && date > s.left_on) continue;
    const v = changes[d] !== undefined ? changes[d] : (typeof L[d - 1] === "string" ? L[d - 1] as string : "");
    if (ACTIVE_WORK.indexOf(v) >= 0 || HOURS_RE.test(v)) return true;
    if (ACTIVE_OFF.indexOf(v) >= 0) off = true;
  }
  return !off;
}
// „Реално“ = „по график“ → няма отклонение. В графика неплатеният е „НО“, а празният ден е почивка.
export function sameAsPlanned(actual: string, plannedLetter: string): boolean {
  const p = plannedLetter === "НО" ? "Н" : plannedLetter === "" ? "почивка" : plannedLetter;
  return actual === p;
}
function addDay(start: string, day: number): string {
  const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + day - 1); return d.toISOString().slice(0, 10);
}
// „↩ Върни в чернова“ (решение на Тенчо 20.11.2026): последното подаване не се губи — снимката
// остава в чернова с reopened (кой и кога е върнал, кой и кога беше подал) и letters (буквите
// и заключените кодове към момента на връщането — тогава редовете са точно подадените, защото
// save_rows отказва при подаден месец) и staff (персоналът на обекта към този момент — договор,
// дати, сектор; иначе мрежата на ТРЗ би се смятала по персонала, сменен в черновата). ТРЗ продължават да виждат тази версия и промените ѝ
// („върнат за корекция от … на …“), отметките „Отразено в ТРЗ“ остават. Новото подаване я заменя.
export type Reopened = { at: string; by: string; by_name: string; submitted_at: string | null; submitted_by: string | null; submitted_by_name: string | null; comment?: string; was?: string };
// Етап Б: „подаден“ и „одобрен“ са едно и също за всичко, освен за самото одобряване —
// заключен за редакция, видим за ТРЗ, с „Промени“, присъствена и Excel.
export function isFiled(month: MonthRow | null | undefined): boolean { return !!month && (month.status === "submitted" || month.status === "approved"); }
// Кой връща (решение на Тенчо 23.11.2026, т.3): ТРЗ и admin — подаден и одобрен;
// регионалният (и admin) — подаден в свой обект, както „↩ Върни в чернова“ досега.
export function canReturn(acc: Access, store: string, month: MonthRow | null | undefined): boolean {
  if (!isFiled(month)) return false;
  if (acc.kind === "trz" || acc.canAdmin) return true;
  return month!.status === "submitted" && acc.canReopen && canEdit(acc, store);
}
export function canApprove(acc: Access): boolean { return acc.kind === "trz" || acc.canAdmin; }
export function reopenedOf(month: MonthRow | null | undefined): Reopened | null {
  if (!month || month.status !== "draft" || !isObj(month.snapshot) || !isObj(month.snapshot.reopened)) return null;
  return month.snapshot.reopened as Reopened;
}
// Подаден или върнат с пазено подаване — това виждат ТРЗ.
export function hasSubmission(month: MonthRow | null | undefined): boolean { return isFiled(month) || !!reopenedOf(month); }
// Върнатият месец, както изглеждаше подаден: статус, кой и кога, снимката (без letters / staff),
// редовете от letters и персоналът към връщането (null — няма го в снимката).
export function lastSubmittedView(month: MonthRow): { month_row: MonthRow; rows: RowRec[]; staff: Staff[] | null } | null {
  const r = reopenedOf(month);
  if (!r) return null;
  const snap = { ...(month.snapshot as Record<string, unknown>) };
  const letters = isObj(snap.letters) ? snap.letters as Record<string, { letters?: unknown; locked?: unknown }> : {};
  const staff = Array.isArray(snap.staff) ? (snap.staff as Staff[]).map((x) => ({ ...x })) : null;
  delete snap.letters; delete snap.staff;
  const rows: RowRec[] = Object.keys(letters).map((sid) => ({
    month_id: month.id, staff_id: sid,
    letters: Array.isArray(letters[sid].letters) ? (letters[sid].letters as string[]).slice() : [],
    locked: isObj(letters[sid].locked) ? { ...(letters[sid].locked as Record<string, string>) } : {},
  }));
  return { month_row: { ...month, status: "submitted", submitted_at: r.submitted_at, submitted_by: r.submitted_by, submitted_by_name: r.submitted_by_name, snapshot: snap }, rows, staff };
}
// Връщане в чернова — „↩ Върни в чернова“ (reopen) и „↩ Върни с коментар“ (return, етап Б).
// Последното подаване се пази в снимката (reopenedOf / lastSubmittedView) — за ТРЗ; одобрението
// се нулира; коментарът — в колоните (последното връщане) и в reopened.
async function returnToDraft(repo: Repo, acc: Access, store: string, m: { start: string }, month: MonthRow, comment: string | null) {
  const at = new Date().toISOString();
  const letters: Record<string, { letters: string[]; locked: Record<string, string> }> = {};
  (await repo.listRows(month.id)).forEach((r) => { letters[r.staff_id] = { letters: r.letters || [], locked: r.locked || {} }; });
  const keptStaff = JSON.parse(JSON.stringify(await repo.listStaff(store))) as Staff[];   // копие — както в jsonb
  const reopened: Reopened = { at, by: acc.email, by_name: acc.name, submitted_at: month.submitted_at, submitted_by: month.submitted_by, submitted_by_name: month.submitted_by_name, was: month.status };
  if (comment) reopened.comment = comment;
  const ok = await repo.updateMonth(month.id, {
    status: "draft", submitted_at: null, submitted_by: null, submitted_by_name: null,
    approved_at: null, approved_by: null, approved_by_name: null,
    return_comment: comment, returned_at: at, returned_by_name: acc.name,
    snapshot: { ...(isObj(month.snapshot) ? month.snapshot : {}), letters, staff: keptStaff, reopened }, updated_at: at,
  }, month.status);
  if (!ok) throw new HttpError(409, "not_submitted", "Графикът не е подаден.");
  // Решение а: промените остават за новото подаване; броят им — за предупреждението в екрана.
  const kept = (await repo.listChanges(month.id)).length;
  await audit(repo, acc, comment ? "grafik_return" : "grafik_reopen", store, { month: m.start, was: month.status, was_submitted_by: month.submitted_by, was_submitted_at: month.submitted_at, was_approved_by: month.approved_by || null, comment, changes_kept: kept });
  return { status: "draft", changes: kept, comment };
}
// Подаденият месец на обекта — иначе 409 (промените се въвеждат само след подаване).
// allowReopened — четене и „Отразено в ТРЗ“ върху пазеното подаване на върнат месец.
async function submittedMonth(repo: Repo, store: string, ym: unknown, allowReopened = false) {
  const m = needMonth(ym);
  const month = await repo.getMonth(store, m.start);
  if (!month || !(isFiled(month) || (allowReopened && reopenedOf(month)))) throw new HttpError(409, "not_submitted", "Промените се въвеждат след подаване на графика.");
  return { m, month };
}
// Всички проверки на един ред „Промени“ → „по график“ (буква и официален код).
async function checkChange(repo: Repo, store: string, m: { start: string; end: string; days: number }, month: MonthRow, staffId: unknown, day: unknown, actual: unknown, reason: unknown, tripStore?: unknown) {
  const sid = uuid(staffId, "служител");
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > m.days) throw new HttpError(400, "bad_request", "Денят не е в месеца.");
  if (typeof actual !== "string" || CHANGE_ACTUALS.indexOf(actual) < 0) throw new HttpError(400, "bad_request", "„Реално“ е една от: " + CHANGE_ACTUALS.join(", ") + ".");
  if (typeof reason !== "string" || !reason.trim()) throw new HttpError(400, "bad_request", "Основанието / документът е задължително.");
  if (reason.trim().length > 300) throw new HttpError(400, "bad_request", "Основанието е до 300 знака.");
  // Решение ж: само хората от ПОДАДЕНИЯ график (нов човек — връщане, добавяне, ново подаване).
  const snap = (isObj(month.snapshot) && Array.isArray(month.snapshot.rows) ? month.snapshot.rows : []) as Record<string, unknown>[];
  const sr = snap.filter((r) => r.staff_id === sid)[0];
  if (!sr) throw new HttpError(400, "not_in_schedule", "Служителят не е в подадения график — върни графика в чернова, добави го и го подай пак.");
  const st = (await repo.getStaff([sid]))[0];
  const date = addDay(m.start, day);
  if (st && ((typeof st.hired_on === "string" && date < st.hired_on) || (typeof st.left_on === "string" && date > st.left_on))) {
    throw new HttpError(400, "not_employed", "На " + date + " служителят не е на работа (назначен / напуснал).");
  }
  // „К“ — обектът получател е задължителен, от списъка с обекти и не е своят (пакет 1, т.6).
  let trip: string | null = null;
  if (actual === "К") {
    trip = typeof tripStore === "string" ? tripStore.trim() : "";
    if (!trip) throw new HttpError(400, "trip_store", "При „К“ избери обекта, където е командирован човекът.");
    if ((await repo.storeNames()).indexOf(trip) < 0) throw new HttpError(400, "trip_store", "Няма такъв обект: „" + trip + "“.");
    if (trip === store) throw new HttpError(400, "trip_store", "Командировка в собствения обект — избери друг обект.");
  }
  // Решение в: ЛД в неделя — както в графика.
  if (actual === "ЛД" && new Date(date + "T00:00:00Z").getUTCDay() === 0) throw new HttpError(400, "sunday_ld", "ЛД в неделя — ползвай ЗД.");
  // Работната буква трябва да има код за договора на човека (П3: присъствената я превежда по договора;
  // напр. ЛД при 4 ч. няма код). Буквите — от grafik_letter_map за ВТР на месеца.
  if (["ЛД", "ЗД", "П", "В", "М", "К"].indexOf(actual) >= 0) {
    // Часовете — от снимката (присъствената превежда по нея), не от днешния договор.
    const hpd = typeof sr.hours_per_day === "number" && sr.hours_per_day > 0 ? sr.hours_per_day : (st && st.hours_per_day ? +st.hours_per_day : 8);
    const setup = resolveSetup(await repo.setupRaw(store), m.start, m.end);
    const kind = new Date(date + "T00:00:00Z").getUTCDay() === 0 ? "Н" : setup.season;
    const okL = setup.letter_map.some((l) => l.letter === actual && l.day_kind === kind && (hpd === 8 ? (l.hours_per_day === null || l.hours_per_day === undefined) : +(l.hours_per_day as number) === hpd));
    if (!okL) throw new HttpError(400, "letter_contract", "Буквата „" + actual + "“ няма код за договор " + hpd + " ч." + (kind === "Н" ? " в неделя" : "") + ".");
  }
  const row = (await repo.listRows(month.id)).filter((r) => r.staff_id === sid)[0];
  const plannedLetter = row && Array.isArray(row.letters) && typeof row.letters[day - 1] === "string" ? row.letters[day - 1] : "";
  const plannedCode = Array.isArray(sr.codes) && typeof sr.codes[day - 1] === "string" ? sr.codes[day - 1] as string : "";
  if (sameAsPlanned(actual, plannedLetter)) throw new HttpError(409, "no_change", "Няма отклонение — по график е същото (" + (plannedLetter || "почивка") + ").");
  return { sid, plannedLetter, plannedCode, reason: reason.trim(), trip };
}
// Решение а: след ново подаване остават само промените, които още важат — човекът е в графика
// и денят е в периода му на работа. Останалите се махат (с одит).
export function staleChanges(changes: ChangeRow[], staff: Staff[], start: string): ChangeRow[] {
  const byId: Record<string, Staff> = {}; staff.forEach((s) => { byId[s.id] = s; });
  return changes.filter((c) => {
    const s = byId[c.staff_id]; if (!s) return true;
    const date = addDay(start, c.day);
    return (typeof s.hired_on === "string" && date < s.hired_on) || (typeof s.left_on === "string" && date > s.left_on);
  });
}

// ── Дневна присъствена „✅ Днес“ (пакет 2А, план и решения на Тенчо 27.11.2026) ──────────────
// Обектът отбелязва днес и STORE_BACK_DAYS дни назад (минал ден → „късно“); регионален / admin —
// всеки ден на месеца до днес, извън прозореца на обекта — с основание (корекция). Бъдещ ден — никой.
// Същият прозорец важи за обекта и в „✎ Промени“ (решение 2) — иначе заключването е само на вид.
// Отклонението от графика е ред в grafik_changes (source 'daily'); „неуточнено“ — само отметка.
export const STORE_BACK_DAYS = 2;
export function sofiaToday(nowS: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowS * 1000));
}
export function shiftDate(d: string, n: number): string {
  const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
// „Офисът“ — регионалният (своите обекти) и admin; другите с право на запис са обектът (manager).
export const isOffice = (a: Access) => a.kind === "admin" || a.kind === "regional";
export function inStoreWindow(date: string, today: string): boolean {
  return date <= today && date >= shiftDate(today, -STORE_BACK_DAYS);
}
function ddmm(date: string): string { return date.slice(8, 10) + "." + date.slice(5, 7); }
export function windowMessage(today: string): string {
  return "Обектът отбелязва и променя само днес и " + STORE_BACK_DAYS + " дни назад (" + ddmm(shiftDate(today, -STORE_BACK_DAYS)) + "–" + ddmm(today) + "). По-старите дни — регионалният или admin.";
}
// Смяна по график: работна буква (вкл. К — командировка) или свободни часове.
export const DAILY_ON_SHIFT = ["ЛД", "ЗД", "П", "В", "М", "К"];
export const DAILY_WORK = ["ЛД", "ЗД", "П", "В", "М"];
export const DAILY_ABSENT = ["Б", "О", "Н", "Д", "А", "С", "Майч", "почивка"];
export const DAILY_STATES = ["present", "absent", "unknown", "other_shift", "trip", "extra", "off"];
export const DAILY_LABEL: Record<string, string> = {
  Б: "болничен", О: "платен отпуск", Н: "неплатен отпуск", Д: "държавни задължения", А: "с разрешение на администрацията",
  С: "самоотлъчка", Майч: "майчинство", почивка: "почивка", К: "командировка",
};
export function onShift(planned: string): boolean { return DAILY_ON_SHIFT.indexOf(planned) >= 0 || HOURS_RE.test(planned); }
// Какво „реално“ дава отметката (null — без отклонение от графика или неуточнено).
export function markActual(m: { state: string; actual?: string | null }, planned: string): string | null {
  const a = m.state === "trip" ? "К" : (m.state === "absent" || m.state === "other_shift" || m.state === "extra") ? (m.actual || null) : null;
  return a && !sameAsPlanned(a, planned) ? a : null;
}
// Проверка на една отметка спрямо смяната по график. Връща текст на грешката или null.
export function markError(m: Record<string, unknown>, planned: string): string | null {
  const st = m.state, a = typeof m.actual === "string" ? m.actual : "";
  if (typeof st !== "string" || DAILY_STATES.indexOf(st) < 0) return "непознато отбелязване";
  if (m.note !== undefined && m.note !== null && (typeof m.note !== "string" || m.note.length > 200)) return "бележката е до 200 знака";
  const on = onShift(planned);
  if ((st === "present" || st === "unknown" || st === "other_shift") && !on) return "не е на смяна по график";
  if ((st === "off" || st === "extra") && on) return "на смяна е по график";
  if (st === "absent" && DAILY_ABSENT.indexOf(a) < 0) return "причината е една от: " + DAILY_ABSENT.join(", ");
  if ((st === "other_shift" || st === "extra") && DAILY_WORK.indexOf(a) < 0) return "смяната е една от: " + DAILY_WORK.join(", ");
  if (st === "other_shift" && a === planned) return "това е смяната по график — „Дошъл“";
  if (st === "trip" && !(typeof m.trip_store === "string" && m.trip_store.trim())) return "избери обекта на командировката";
  return null;
}
// Основанието на реда в „Промени“: „Дневна присъствена — болничен: бележка“.
export function dailyReason(actual: string, note: unknown): string {
  const lbl = DAILY_LABEL[actual] || "смяна " + actual;
  const n = typeof note === "string" ? note.trim().replace(/\s+/g, " ") : "";
  return ("Дневна присъствена — " + lbl + (n ? ": " + n : "")).slice(0, 300);
}
function needDate(v: unknown, m: { start: string; end: string }): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < m.start || v > m.end || shiftDate(v, 0) !== v) throw new HttpError(400, "bad_request", "Денят не е в месеца.");
  return v;
}
// Хората за деня — от СНИМКАТА на подадения месец (персоналът може да е сменен след подаването),
// само назначените и ненапусналите към датата; секторът и името — от персонала.
type DailyPerson = {
  staff_id: string; name: string; short_name: string; position: string | null; sector: string; sector_order: number; hpd: number;
  planned_letter: string; planned_code: string; planned_legend: string | null; on_shift: boolean;
  change: ChangeRow | null; mark: MarkRow | null;
};
async function dailyContext(repo: Repo, store: string, m: { start: string; end: string; days: number }, month: MonthRow, date: string) {
  const day = +date.slice(8, 10);
  const [staff, rows, raw, changes, daily] = await Promise.all([
    repo.listStaff(store), repo.listRows(month.id), repo.setupRaw(store), repo.listChanges(month.id), repo.getDaily(store, date),
  ]);
  const marks = daily ? await repo.listMarks(daily.id) : [];
  const setup = resolveSetup(raw, m.start, m.end);
  const snap = (isObj(month.snapshot) && Array.isArray(month.snapshot.rows) ? month.snapshot.rows : []) as Record<string, unknown>[];
  const byStaff: Record<string, Staff> = {}; staff.forEach((s) => { byStaff[s.id] = s; });
  const letters: Record<string, string[]> = {}; rows.forEach((r) => { letters[r.staff_id] = r.letters || []; });
  const secs: Record<string, { name: string; sort_order: number }> = {}; setup.sectors.forEach((x) => { secs[x.id] = x; });
  const employed = (s: Record<string, unknown>) => !(typeof s.hired_on === "string" && date < s.hired_on) && !(typeof s.left_on === "string" && date > s.left_on);
  const people: DailyPerson[] = [];
  const inSnap: Record<string, boolean> = {};
  for (const sr of snap) {
    const sid = String(sr.staff_id), st = byStaff[sid] || {} as Staff;
    inSnap[sid] = true;
    if (!employed(st)) continue;
    const L = letters[sid] || [], pl = typeof L[day - 1] === "string" ? L[day - 1] : "";
    const code = Array.isArray(sr.codes) && typeof sr.codes[day - 1] === "string" ? sr.codes[day - 1] as string : "";
    const cd = setup.codes.filter((c) => c.code === code)[0];
    const sec = typeof st.sector_id === "string" ? secs[st.sector_id] : undefined;
    people.push({
      staff_id: sid, name: String(sr.full_name || st.full_name || sr.short_name || ""), short_name: String(st.short_name || sr.short_name || ""),
      position: typeof st.position === "string" ? st.position : null,
      sector: sec ? sec.name : "Без сектор", sector_order: sec ? sec.sort_order : 100000,
      hpd: typeof sr.hours_per_day === "number" && sr.hours_per_day > 0 ? sr.hours_per_day : 8,
      planned_letter: pl, planned_code: code, planned_legend: cd && cd.legend ? cd.legend : null, on_shift: onShift(pl),
      change: changes.filter((c) => c.staff_id === sid && c.day === day)[0] || null,
      mark: marks.filter((x) => x.staff_id === sid)[0] || null,
    });
  }
  people.sort((a, b) => a.sector_order - b.sector_order || a.sector.localeCompare(b.sector, "bg") || a.name.localeCompare(b.name, "bg"));
  // Решение 4: нов човек, който не е в подадения график, не се отбелязва — „върни графика“ (името на екрана).
  const missing = staff.filter((s) => !inSnap[s.id] && employed(s)).map((s) => String(s.full_name || s.short_name || ""));
  return { day, daily, people, missing };
}
// Какво вижда браузърът за деня; can_mark / needs_reason — по прозореца и правата.
async function dailyView(repo: Repo, acc: Access, store: string, m: { start: string; end: string; days: number }, month: MonthRow | null, date: string, today: string) {
  const filed = isFiled(month);
  const office = isOffice(acc), edit = canEdit(acc, store);
  const maxDate = today < m.end ? today : m.end;
  const winFrom = shiftDate(today, -STORE_BACK_DAYS);
  const base = {
    store, month: m.start, date, today, status: month ? month.status : null, filed,
    min_date: edit && !office ? (winFrom > m.start ? winFrom : m.start) : m.start, max_date: maxDate,
    window_from: winFrom, back_days: STORE_BACK_DAYS,
  };
  if (!filed) return { ...base, people: [], missing: [], daily: null, can_mark: false, needs_reason: false, trip_stores: [] };
  const ctx = await dailyContext(repo, store, m, month!, date);
  const inWin = inStoreWindow(date, today);
  const can = edit && date <= today && (inWin || office);
  const names = await repo.storeNames();
  return {
    ...base, daily: ctx.daily, people: ctx.people, missing: ctx.missing,
    can_mark: can, needs_reason: can && !inWin, late: date < today,
    // „Неуточнено“ се уточнява и след прозореца (решение 3) — от който пише в обекта.
    can_resolve: edit && date <= today,
    trip_stores: names.filter((n) => n !== store),
  };
}

// Обектите в обзора: с дружество (grafik_store_company) И ВТР на дружеството (grafik_company_terms),
// валидни към първия ден на месеца. Без дружество → noCompany (admin го вижда като пропуск);
// с дружество без ВТР (ТЦД 2 — логистичните складове) → извън обхвата, мълчаливо.
export async function scopeStores(repo: Repo, names: string[], start: string): Promise<{ company: Record<string, string>; noCompany: string[] }> {
  const [sc, te, co] = await Promise.all([repo.adminList("grafik_store_company"), repo.adminList("grafik_company_terms"), repo.adminList("companies")]) as
    [SetupRaw["storeCompany"], SetupRaw["terms"], SetupRaw["companies"]];
  const company: Record<string, string> = {}, noCompany: string[] = [];
  for (const n of names) {
    const link = sc.filter((r) => r.store_name === n && validAt(r, start))[0];
    if (!link) { noCompany.push(n); continue; }
    if (!te.some((t) => t.company_id === link.company_id && validAt(t, start))) continue;
    const c = co.filter((x) => x.id === link.company_id)[0];
    company[n] = (c && c.name) || "—";
  }
  return { company, noCompany };
}

// „Извън нормата" в подадена снимка — същите думи като при „Подай" (submitIssues / grSubmitIssues).
// Старите снимки (до 04.11.2026) нямат norm → „няма нито един ден".
export function snapshotOffNorm(snap: unknown): string[] {
  const rows = isObj(snap) && Array.isArray(snap.rows) ? snap.rows as Record<string, unknown>[] : [];
  const out: string[] = [];
  for (const r of rows) {
    const name = String(r.full_name || r.short_name || "");
    const empty = !(Array.isArray(r.codes) && r.codes.some((c) => !!c));
    const norm = typeof r.norm === "number" ? r.norm : null;
    if (empty && norm !== 0) out.push(name + ": " + (norm ? "няма ред в графика за месеца (0 ч. вместо " + hrs(norm) + " ч.)" : "няма нито един ден"));
    else if (!empty && typeof r.diff === "number" && r.diff !== 0) out.push(name + ": " + hrs(Number(r.official)) + " ч. вместо " + hrs(Number(r.target)) + " ч.");
  }
  return out;
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

  const action = String(body.action || "");
  const nowS = Math.floor(now ?? Date.now() / 1000);
  let repo: Repo | null = null, acc: Access | null = null;
  try {
    repo = getRepo();
    // 2) + 3) Актуалният потребител и списъците (grafik_access) — едновременно (v11, 11.11.2026:
    // двете заявки са независими, а всяка последователна стъпка към базата е ~80–90 ms).
    const [user, lists] = await Promise.all([repo.getUser(String(sess.uid)), repo.listAccess()]);
    if (!user) return json({ ok: false, reason: "forbidden", message: "Потребителят не е намерен." }, 403);
    // 4) Видът достъп.
    const a = resolveAccess(user, roleOf(lists, user.email), canResetPinOf(lists, user.email));
    if (a instanceof HttpError) return json({ ok: false, reason: a.reason, message: a.message }, a.status);
    acc = a;
    // 5) ПИН за графика (етап Б): без отключен ПИН — само me (без данни) и pin_set / pin_unlock.
    const unlocked = await verifyPinToken(body.pin_token, String(sess.uid), sess.iat, nowS);
    if (!unlocked && PIN_FREE.indexOf(action) < 0) throw new HttpError(401, "pin_required", "Въведи ПИН-а за графика.");
    const t0 = Date.now();
    const result = PIN_ACTIONS.indexOf(action) >= 0 ? await pinDispatch(repo, acc, body, nowS, sess.iat) : await dispatch(repo, acc, body, unlocked, nowS);
    // За измерване по логовете (function_logs): действие и време в dispatch — без лични данни.
    console.log(JSON.stringify({ grafik_api: action, dispatch_ms: Date.now() - t0 }));
    // Етап В: кой какво е отворил (без съдържанието) — след успешно четене.
    if (READ_EVENTS[action]) await later(readLog(repo, acc, READ_EVENTS[action], body, true, nowS));
    // Плъзгащият се срок: всяка заявка с валиден ключ връща нов за още 15 мин.
    if (unlocked && !result.pin_token) {
      const t = await signPinToken(String(sess.uid), sess.iat, nowS);
      result.pin_token = t.token; result.pin_exp = t.exp;
    }
    return json({ ok: true, ...result }, 200);
  } catch (e) {
    if (e instanceof HttpError) {
      // Отказаното четене (чужд обект) — също в одита, без съвпадение по 10 мин.
      if (repo && acc && e.status === 403 && READ_EVENTS[action]) await later(readLog(repo, acc, READ_EVENTS[action], body, false, nowS, e.reason));
      return json({ ok: false, reason: e.reason, message: e.message, ...(e.extra || {}) }, e.status);
    }
    console.error("grafik-api error:", e);
    return json({ ok: false, reason: "internal", message: "Вътрешна грешка." }, 500);
  }
}

// ── Имейл до обекта при „↩ Върни с коментар“ (пакет 1, т.7, решение на Тенчо 27.11.2026) ──────
// До активните потребители на обекта с роля в grafik_access (без този, който връща). Без текста на
// коментара (може да съдържа имена) — само обект, месец и линк; коментарът е на екрана на обекта.
// Паднало изпращане не спира връщането — пише се в одита.
export const PORTAL_URL = "https://tenchotenev13-afk.github.io/Tmax-store-portal/";
const BG_MONTHS = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
export function monthText(start: string): string { return BG_MONTHS[+start.slice(5, 7) - 1] + " " + start.slice(0, 4) + " г."; }
const htmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function returnMail(store: string, start: string): { subject: string; html: string } {
  const mt = monthText(start);
  return {
    subject: "График за " + mt + " — " + store + ": върнат за корекция",
    html: "<p>Графикът на обект <b>" + htmlEsc(store) + "</b> за <b>" + htmlEsc(mt) + "</b> е върнат с коментар — виж го в портала.</p>" +
      "<p><a href=\"" + PORTAL_URL + "\">Отвори портала → „📆 График“</a></p>" +
      "<p style=\"color:#64748b;font-size:12px;\">Писмото е автоматично от „Работен график“.</p>",
  };
}
async function notifyReturned(repo: Repo, acc: Access, store: string, start: string): Promise<{ to: number; ok: boolean }> {
  try {
    const [rows, users] = await Promise.all([repo.listAccess(), repo.storeUsers(store)]);
    const to = Array.from(new Set(users.filter((u) => u.active !== false && typeof u.email === "string" && u.email)
      .map((u) => String(u.email).trim().toLowerCase())
      .filter((e) => e !== acc.email && !!roleOf(rows, e))));
    if (!to.length) { await gaudit(repo, acc, "grafik_return_mail", { store, month: start.slice(0, 7), to: 0 }, true); return { to: 0, ok: true }; }
    const mail = returnMail(store, start);
    const ok = await repo.sendMail(to, mail.subject, mail.html);
    await gaudit(repo, acc, "grafik_return_mail", { store, month: start.slice(0, 7), to: to.length }, ok);
    return { to: to.length, ok };
  } catch (e) {
    console.error("grafik_return_mail: " + ((e as Error).message || String(e)));
    await gaudit(repo, acc, "grafik_return_mail", { store, month: start.slice(0, 7), error: true }, false);
    return { to: 0, ok: false };
  }
}

// ── Одит на четенето (етап В, решение на Тенчо 27.11.2026) ───────────────────
// Кой, роля, обект, месец, действие и кога — без съдържанието. Едно и също четене от един човек
// се пише веднъж на 10 мин (dedup_key, unique в базата; повторът е „on conflict do nothing“).
export const READ_EVENTS: Record<string, string> = {
  load_month: "grafik_view_month", overview: "grafik_view_overview", staff_list: "grafik_view_staff", changes_list: "grafik_view_changes",
  daily_get: "grafik_view_daily",
};
// Печат и файлове — браузърът казва какво е направил (log), сървърът пише кой и за кой обект.
export const LOG_WHAT: Record<string, string> = {
  print_grafik: "grafik_print", print_presence: "grafik_print_presence", print_changes: "grafik_print_changes",
  export_trz: "grafik_export_trz", export_presence: "grafik_export_presence",
  // Пакет 1: ZIP с одобрените (по един ред на обект), обобщението и присъствената „към днес“.
  export_zip: "grafik_export_zip", export_summary: "grafik_export_summary", print_presence_today: "grafik_print_presence_today",
};
export const DEDUP_SECONDS = 600;
function monthKey(v: unknown): string | null { return parseMonth(v) ? String(v) : null; }
function gEntry(acc: Access, event: string, store: string | null, month: string | null, success: boolean, details: unknown, dedup_key: string | null): GAuditEntry {
  return { event, user_email: acc.email, user_role: acc.role, grafik_kind: acc.kind, store_name: store, month, success, details, dedup_key };
}
function readLog(repo: Repo, acc: Access, event: string, b: Record<string, unknown>, success: boolean, nowS: number, reason?: string): Promise<void> {
  const store = typeof b.store === "string" && b.store ? b.store.slice(0, 100) : null;
  const month = monthKey(b.month);
  const key = success ? [acc.email, event, store || "", month || "", Math.floor(nowS / DEDUP_SECONDS)].join("|") : null;
  return repo.gAudit(gEntry(acc, event, store, month, success, reason ? { reason } : null, key)).catch(() => {});
}
// Записът в одита не бива да бави отговора: в Supabase — EdgeRuntime.waitUntil; в тестовете — изчаква се.
function later(p: Promise<unknown>): Promise<unknown> {
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er && typeof er.waitUntil === "function") { er.waitUntil(p); return Promise.resolve(); }
  return p;
}

// ── ПИН за графика (етап Б, решение на Тенчо 27.11.2026) ────────────────────
// Личен, 4–6 цифри; първия път го задава човекът сам; 5 грешни → 15 мин; 10 поредни → до
// нулиране (admin с роля edit или grafik_access.can_reset_pin). Хеш bcrypt в grafik_pin.
export const PIN_FREE = ["me", "pin_set", "pin_unlock"];
const PIN_ACTIONS = ["pin_set", "pin_unlock", "pin_change", "pin_reset", "pin_touch"];
export const PIN_LOCK_AT = 5, PIN_BLOCK_AT = 10;
export function weakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;                         // 0000, 111111
  const d = pin.split("").map(Number);
  const step = d[1] - d[0];
  return (step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step);   // 1234, 98765
}
function needPin(v: unknown, label = "ПИН-ът"): string {
  const pin = typeof v === "string" ? v.trim() : "";
  if (!/^[0-9]{4,6}$/.test(pin)) throw new HttpError(400, "pin_format", label + " е от 4 до 6 цифри.");
  return pin;
}
export function pinStateOf(p: PinState | null, nowS: number): "none" | "set" | "locked" | "blocked" {
  if (!p) return "none";
  if (p.blocked) return "blocked";
  if (p.locked_until && Date.parse(p.locked_until) / 1000 > nowS) return "locked";
  return "set";
}
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });
}
const gaudit = (repo: Repo, acc: Access, event: string, details: unknown, success = true) =>
  repo.gAudit(gEntry(acc, event, null, null, success, details, null)).catch(() => {});

// Проверка на ПИН с изразходване на опит; връща нищо при успех, хвърля при грешен / заключен.
async function spendPin(repo: Repo, acc: Access, pin: string, nowS: number, event: string): Promise<void> {
  const r = await repo.pinReserve(acc.uid!);
  if (!r) throw new HttpError(409, "pin_not_set", "Още нямаш ПИН за графика — задай го.");
  if (!r.granted) {
    if (r.blocked) throw new HttpError(423, "pin_blocked", "ПИН-ът е заключен след " + PIN_BLOCK_AT + " грешни опита — помоли администратор да го нулира.");
    throw new HttpError(423, "pin_locked", "Твърде много грешни опити — опитай пак след " + (r.locked_until ? hhmm(r.locked_until) : "15 мин") + ".", { locked_until: r.locked_until });
  }
  if (await repo.checkPin(pin, r.pin_hash || "")) { await repo.pinOk(acc.uid!); return; }
  await gaudit(repo, acc, event + "_fail", { fails: r.fails }, false);
  if (r.blocked) throw new HttpError(423, "pin_blocked", "Грешен ПИН — " + PIN_BLOCK_AT + " грешни опита подред, ПИН-ът е заключен. Помоли администратор да го нулира.");
  if (r.locked_until && Date.parse(r.locked_until) / 1000 > nowS) {
    throw new HttpError(423, "pin_locked", "Грешен ПИН — " + PIN_LOCK_AT + " грешни опита, опитай пак след " + hhmm(r.locked_until) + ".", { locked_until: r.locked_until });
  }
  const left = r.fails < PIN_LOCK_AT ? PIN_LOCK_AT - r.fails : PIN_BLOCK_AT - r.fails;
  throw new HttpError(403, "pin_wrong", "Грешен ПИН. Остават " + left + " опита" + (r.fails < PIN_LOCK_AT ? " до 15 мин заключване." : " до пълно заключване."), { left });
}

async function pinDispatch(repo: Repo, acc: Access, b: Record<string, unknown>, nowS: number, si: number): Promise<Record<string, unknown>> {
  const issue = async () => { const t = await signPinToken(acc.uid!, si, nowS); return { pin_token: t.token, pin_exp: t.exp }; };
  switch (b.action) {
    case "pin_set": {
      const pin = needPin(b.pin);
      if (weakPin(pin)) throw new HttpError(400, "pin_weak", "Твърде лесен ПИН (еднакви или поредни цифри) — избери друг.");
      if (await repo.pinGet(acc.uid!)) throw new HttpError(409, "pin_exists", "ПИН-ът вече е зададен — въведи го. Забравен ПИН нулира администратор.");
      try { await repo.pinCreate(acc.uid!, await repo.hashPin(pin)); }
      catch (e) { if (e instanceof HttpError && e.reason === "db_constraint") throw new HttpError(409, "pin_exists", "ПИН-ът вече е зададен — въведи го."); throw e; }
      await gaudit(repo, acc, "grafik_pin_set", null);
      return { pin_state: "set", ...(await issue()) };
    }
    case "pin_unlock": {
      const pin = needPin(b.pin);                                    // лош формат — без изразходван опит
      await spendPin(repo, acc, pin, nowS, "grafik_pin");
      await gaudit(repo, acc, "grafik_unlock", null);
      return { pin_state: "set", ...(await issue()) };
    }
    case "pin_change": {
      const old = needPin(b.old, "Сегашният ПИН"), pin = needPin(b.pin, "Новият ПИН");
      if (weakPin(pin)) throw new HttpError(400, "pin_weak", "Твърде лесен ПИН (еднакви или поредни цифри) — избери друг.");
      if (pin === old) throw new HttpError(400, "pin_same", "Новият ПИН е същият като сегашния.");
      await spendPin(repo, acc, old, nowS, "grafik_pin_change");
      await repo.pinUpdateHash(acc.uid!, await repo.hashPin(pin));
      await gaudit(repo, acc, "grafik_pin_change", null);
      return { pin_state: "set" };
    }
    case "pin_reset": {
      if (!acc.canResetPin) throw new HttpError(403, "forbidden", "ПИН нулират администратор (роля „редакция“) и упълномощените.");
      const uid = uuid(b.user_id, "user_id");
      if (uid === acc.uid) throw new HttpError(409, "self", "Собствения си ПИН сменяш с „Смени ПИН“, не с нулиране.");
      const target = await repo.getUser(uid);
      if (!target) throw new HttpError(404, "not_found", "Потребителят не е намерен.");
      const had = await repo.pinDelete(uid);
      await gaudit(repo, acc, "grafik_pin_reset", { email: String(target.email || "").toLowerCase(), had });
      return { reset: had, email: String(target.email || "").toLowerCase() };
    }
    case "pin_touch":
      return {};
  }
  throw new HttpError(400, "bad_request", "Непознато действие.");
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
// Промените — в audit_log (както досега) И в grafik_audit (етап В: целият одит на графика на едно
// място, без права за anon). Месецът — от details.month („ГГГГ-ММ-01“ → „ГГГГ-ММ“).
const audit = (repo: Repo, acc: Access, event: string, store: string | null, details: unknown) => {
  const m = isObj(details) && typeof details.month === "string" ? details.month.slice(0, 7) : null;
  return Promise.all([
    repo.audit({ event, user_email: acc.email, user_role: acc.role, store_name: store, details }).catch(() => {}),
    repo.gAudit(gEntry(acc, event, store, m, true, details, null)).catch(() => {}),
  ]);
};

async function dispatch(repo: Repo, acc: Access, b: Record<string, unknown>, unlocked = true, nowS = Math.floor(Date.now() / 1000)): Promise<Record<string, unknown>> {
  switch (b.action) {
    case "me": {
      // Без отключен ПИН: видът и състоянието на ПИН-а (за таба и екрана), но не и обектите.
      const pin = await repo.pinGet(acc.uid!);
      const base = {
        kind: acc.kind, email: acc.email, name: acc.name, can_admin: acc.canAdmin, can_reopen: acc.canReopen, can_approve: canApprove(acc),
        can_reset_pin: !!acc.canResetPin, unlocked,
        pin: { state: pinStateOf(pin, nowS), locked_until: pin && pin.locked_until && Date.parse(pin.locked_until) / 1000 > nowS ? pin.locked_until : null },
      };
      if (!unlocked) return { ...base, stores: [] };
      const names = await repo.storeNames();
      const visible = acc.readAll ? names : names.filter((n) => acc.read.indexOf(n) >= 0);
      // Пакет 1, т.8: in_scope — обектът има дружество И ВТР за текущия месец (scopeStores, както „Обекти“).
      // Логистичните складове (ТЦД 2, без ВТР) и „Централен офис“ остават видими, но браузърът не ги
      // предлага за избор и не отваря графика им по подразбиране — без грешка „липсва дружество“.
      const sc = await scopeStores(repo, visible, sofiaMonthStart(nowS));
      return { ...base, stores: visible.map((n) => ({ name: n, can_edit: canEdit(acc, n), in_scope: !!sc.company[n] })) };
    }

    // ── Етап В: печат / файл (браузърът казва какво), одит — кой и за кой обект.
    case "log": {
      const ev = typeof b.what === "string" ? LOG_WHAT[b.what] : undefined;
      if (!ev) throw new HttpError(400, "bad_request", "Непознато действие за одита.");
      // Обобщението (пакет 1, т.2) е за всички видими обекти — без обект; всичко друго — за един обект.
      const store = ev === "grafik_export_summary" && (b.store === undefined || b.store === null) ? null : await needStore(repo, acc, b.store, "read");
      const month = monthKey(b.month);
      await repo.gAudit(gEntry(acc, ev, store, month, true, null, [acc.email, ev, store || "", month || "", Math.floor(nowS / DEDUP_SECONDS)].join("|"))).catch(() => {});
      return {};
    }

    case "audit_list": {
      // „📜 Кой отваря“ — само admin (роля „редакция“). Последните N дни (по подразбиране 30, до 90).
      if (!acc.canAdmin) throw new HttpError(403, "forbidden", "Само admin.");
      const days = typeof b.days === "number" && Number.isInteger(b.days) && b.days >= 1 && b.days <= 90 ? b.days : 30;
      const email = typeof b.email === "string" && b.email.trim() ? b.email.trim().toLowerCase().slice(0, 200) : null;
      const store = typeof b.store === "string" && b.store.trim() ? b.store.trim().slice(0, 100) : null;
      const since = new Date((nowS - days * 86400) * 1000).toISOString();
      return { days, rows: await repo.auditList({ since, email, store, limit: 1000 }) };
    }

    case "load_month": {
      // v11 (11.11.2026): заявките към базата — на три нива вместо осем (обект + месец + персонал +
      // настройка + предишният месец едновременно, после двата списъка с редове едновременно).
      // needStore се чака първи (отказът е 403 / 400, не грешка на данните); данните текат успоредно.
      const m = needMonth(b.month);
      if (typeof b.store !== "string" || !b.store) throw new HttpError(400, "bad_request", "Липсва обект.");
      const wantPrev = b.prev === true;
      const pmP = parseMonth(m.prev)!;
      const storeP = needStore(repo, acc, b.store, "read");
      const dataP = Promise.all([
        repo.getMonth(b.store, m.start), repo.listStaff(b.store), repo.setupRaw(b.store),
        wantPrev ? repo.getMonth(b.store, pmP.start) : Promise.resolve(null),
      ]);
      dataP.catch(() => {});                       // откаже ли needStore — неговата грешка, не тази
      const store = await storeP;                   // правата / обектът — първи, данните вече текат
      const [month, staff, raw, pm] = await dataP;
      // ТРЗ виждат само подадени месеци — черновата за тях не съществува (и за предишния).
      // Върнат в чернова → последното подаване (lastSubmittedView), не текущата чернова.
      if (acc.kind === "trz" && !hasSubmission(month)) {
        throw new HttpError(404, "not_submitted", "Графикът за този месец още не е подаден.");
      }
      const pmSeen = !!pm && (acc.kind !== "trz" || hasSubmission(pm));
      const view = acc.kind === "trz" && month ? lastSubmittedView(month) : null;
      const pView = acc.kind === "trz" && pmSeen ? lastSubmittedView(pm!) : null;
      const reo = reopenedOf(month);
      const [rows, pRows] = await Promise.all([
        view ? Promise.resolve(view.rows) : month ? repo.listRows(month.id) : Promise.resolve([] as RowRec[]),
        pView ? Promise.resolve(pView.rows) : pmSeen ? repo.listRows(pm!.id) : Promise.resolve([] as RowRec[]),
      ]);
      // Пазената снимка на върнатия месец е само за ТРЗ — останалите виждат черновата както досега.
      const monthRow = view ? view.month_row : (reo ? { ...month!, snapshot: null } : month);
      const pmRow = pView ? pView.month_row : (pm && reopenedOf(pm) ? { ...pm, snapshot: null } : pm);
      const setup = resolveSetup(raw, m.start, m.end);
      return {
        store, month: m.start, days: m.days, can_edit: canEdit(acc, store) && (!month || month.status === "draft"),
        can_reopen: acc.canReopen && canEdit(acc, store) && !!month && month.status === "submitted",
        // Етап Б: „✔ Одобри“ — ТРЗ / admin на подаден; „↩ Върни с коментар“ — виж canReturn.
        can_approve: canApprove(acc) && !!month && month.status === "submitted",
        can_return: canReturn(acc, store, month),
        status: view ? "submitted" : month ? month.status : "draft", month_row: monthRow, staff: view && view.staff ? view.staff : staff, rows, setup,
        reopened: reo ? { at: reo.at, by_name: reo.by_name, comment: reo.comment || null } : null,
        // Ритъмът от предходния месец — както досега: само за тези, които редактират (не ТРЗ).
        prev_rows: wantPrev && acc.kind !== "trz" ? pRows : [],
        // Предишният месец за ВТР чл. 19 през границата (първата седмица) — вместо втора заявка
        // load_month от браузъра. null — няма го или (ТРЗ) не е подаден.
        ...(wantPrev ? { prev_month: pmSeen ? { month_row: pmRow, rows: pRows, setup: resolveSetup(raw, pmP.start, pmP.end) } : null } : {}),
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
      // „Име в графика“ е уникално в обекта (бланката: Персонал!B — оцветява дубликата; 05.11.2026 — отказ).
      // Сравнява се без главни/малки букви и интервали в краищата; напусналите също се броят.
      if (typeof fields.short_name === "string" && fields.short_name.trim()) {
        const nm = fields.short_name.trim().toLowerCase();
        const self = b.id === undefined || b.id === null ? null : String(b.id);
        const dup = (await repo.listStaff(store)).filter((x) => x.id !== self && String(x.short_name || "").trim().toLowerCase() === nm)[0];
        if (dup) throw new HttpError(409, "duplicate", "„" + fields.short_name.trim() + "“ вече е в графика на обекта" + (dup.left_on ? " (напуснал на " + dup.left_on + ")" : "") + " — сложи различно име в графика.");
      }
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
      // В месеца са ВСИЧКИ служители на обекта по дати (както екранът), не само тези с ред —
      // човек без ред трябва да спре подаването, а не да изпадне от снимката.
      const rows = await repo.listRows(month.id);
      const monthStaff = (await repo.listStaff(store)).filter((s) => staffInMonth(s, m.start, m.end));
      const inMonthIds = monthStaff.map((s) => s.id);
      const err = checkSnapshot(b.snapshot, m.days, inMonthIds);
      if (err) throw new HttpError(400, "bad_snapshot", err);
      const issues = submitIssues(monthStaff, rows, (b.snapshot as { rows: Record<string, unknown>[] }).rows, m.days, m.start);
      if (issues.length) {
        throw new HttpError(409, "off_norm", "Графикът не може да се подаде:\n" + issues.map((t) => "· " + t).join("\n") + "\n" + SUBMIT_HINT, { issues, hint: SUBMIT_HINT });
      }
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
        // Решение на Тенчо 24.11.2026: новото подаване изчиства коментара от последното връщане (историята е в одита, grafik_return).
        return_comment: null, returned_at: null, returned_by_name: null,
      }, "draft");
      if (!ok) throw new HttpError(409, "submitted", "Графикът вече е подаден.");
      // Решение а: промените от предишното подаване остават; махат се само невалидните.
      const stale = staleChanges(await repo.listChanges(month.id), monthStaff, m.start);
      for (const c of stale) await repo.deleteChange(c.id);
      await audit(repo, acc, "grafik_submit", store, { month: m.start, rows: inMonthIds.length, skipped_out_of_month: rows.filter((r) => inMonthIds.indexOf(r.staff_id) < 0).length,
        changes_removed: stale.map((c) => ({ staff_id: c.staff_id, day: c.day, actual: c.actual })) });
      return { status: "submitted", submitted_at: at, submitted_by_name: acc.name, changes_removed: stale.length };
    }

    case "reopen": {
      // Старият бутон „↩ Върни в чернова“ (без коментар) — за браузъри отпреди етап Б; само подаден.
      const store = await needStore(repo, acc, b.store, "edit");
      if (!acc.canReopen) throw new HttpError(403, "forbidden", "Връщане в чернова — само admin и регионалният.");
      const m = needMonth(b.month);
      const month = await repo.getMonth(store, m.start);
      if (!month || month.status !== "submitted") throw new HttpError(409, "not_submitted", "Графикът не е подаден.");
      return await returnToDraft(repo, acc, store, m, month, null);
    }

    case "return": {
      // Етап Б (24.11.2026): „↩ Върни с коментар“ — коментарът е задължителен и стига до обекта
      // (лентата над графика, докато е чернова). Кой — canReturn (решение на Тенчо 23.11, т.3).
      if (typeof b.store !== "string" || !b.store) throw new HttpError(400, "bad_request", "Липсва обект.");
      const store = await needStore(repo, acc, b.store, "read");
      const m = needMonth(b.month);
      const comment = typeof b.comment === "string" ? b.comment.trim().replace(/[ \t]+/g, " ") : "";
      if (!comment) throw new HttpError(400, "bad_request", "Напиши коментар — какво да поправи обектът.");
      if (comment.length > 500) throw new HttpError(400, "bad_request", "Коментарът е до 500 знака.");
      const month = await repo.getMonth(store, m.start);
      if (!isFiled(month)) throw new HttpError(409, "not_submitted", "Графикът не е подаден.");
      if (!canReturn(acc, store, month)) {
        throw new HttpError(403, "forbidden", month!.status === "approved" ? "Одобрен график връщат ТРЗ и admin." : "Нямате права да връщате графика на този обект.");
      }
      const out = await returnToDraft(repo, acc, store, m, month!, comment);
      return { ...out, mail: await notifyReturned(repo, acc, store, m.start) };
    }

    case "approve": {
      // Етап Б: „✔ Одобри“ — ТРЗ и admin (резерв); един обект (store) или много (stores) за месеца.
      // Само подаден; всеки обект поотделно — отказът на един не спира другите.
      if (!canApprove(acc)) throw new HttpError(403, "forbidden", "Одобряват ТРЗ и admin.");
      const m = needMonth(b.month);
      const list = Array.isArray(b.stores) ? b.stores : typeof b.store === "string" ? [b.store] : null;
      if (!list || !list.length) throw new HttpError(400, "bad_request", "Липсва обект.");
      if (list.length > 100) throw new HttpError(400, "bad_request", "Най-много 100 обекта наведнъж.");
      const names = await repo.storeNames();
      const results: { store: string; ok: boolean; reason?: string; message?: string }[] = [];
      for (const s of Array.from(new Set(list.map((x) => String(x))))) {
        if (names.indexOf(s) < 0) { results.push({ store: s, ok: false, reason: "bad_request", message: "Няма такъв обект." }); continue; }
        const month = await repo.getMonth(s, m.start);
        if (!month || month.status !== "submitted") {
          results.push({ store: s, ok: false, reason: month && month.status === "approved" ? "approved" : "not_submitted", message: month && month.status === "approved" ? "Вече е одобрен." : "Графикът не е подаден." });
          continue;
        }
        const at = new Date().toISOString();
        const ok = await repo.updateMonth(month.id, { status: "approved", approved_at: at, approved_by: acc.email, approved_by_name: acc.name, updated_at: at }, "submitted");
        if (!ok) { results.push({ store: s, ok: false, reason: "not_submitted", message: "Графикът не е подаден." }); continue; }
        await audit(repo, acc, "grafik_approve", s, { month: m.start, submitted_by: month.submitted_by, submitted_at: month.submitted_at });
        results.push({ store: s, ok: true });
      }
      return { month: m.start, results, approved: results.filter((r) => r.ok).length };
    }

    // ── „Промени“ ──────────────────────────────────────────────────────────
    case "changes_list": {
      const store = await needStore(repo, acc, b.store, "read");
      const { month } = await submittedMonth(repo, store, b.month, true);
      const rows = (await repo.listChanges(month.id)).sort((a, c) => a.day - c.day);
      // „Въведено от“ / „отметнато от“ — с име (users.display_name); имейл само ако няма име.
      const emails = Array.from(new Set(rows.flatMap((c) => [c.created_by, c.updated_by, c.trz_done_by]).filter((e): e is string => typeof e === "string" && !!e).map((e) => e.toLowerCase())));
      // Пакет 1, т.6: обектите за „К“ (обект получател) — всички без своя; същият списък, по който се проверява.
      const [names, all] = await Promise.all([repo.userNames(emails), repo.storeNames()]);
      return { rows, names, trip_stores: all.filter((n) => n !== store) };
    }

    case "changes_save": {
      const store = await needStore(repo, acc, b.store, "edit");
      const { m, month } = await submittedMonth(repo, store, b.month);
      const ch = await checkChange(repo, store, m, month, b.staff_id, b.day, b.actual, b.reason, b.trip_store);
      const all = await repo.listChanges(month.id);
      const self = b.id === undefined || b.id === null ? null : uuid(b.id, "id");
      const cur = self ? all.filter((c) => c.id === self)[0] : null;
      if (self && !cur) throw new HttpError(404, "not_found", "Промяната не е намерена в този месец.");
      // Пакет 2А, решение 2: обектът пипа само днес и STORE_BACK_DAYS дни назад (и не бъдещи дни); извън
      // прозореца — само основанието на съществуваща промяна („уточнява причина по-късно“). Офисът — без промяна.
      if (!isOffice(acc)) {
        const today = sofiaToday(nowS);
        const inWin = inStoreWindow(addDay(m.start, b.day as number), today) && (!cur || inStoreWindow(addDay(m.start, cur.day), today));
        const reasonOnly = !!cur && cur.staff_id === ch.sid && cur.day === b.day && cur.actual === b.actual && (cur.trip_store || null) === (ch.trip || null);
        if (!inWin && !reasonOnly) throw new HttpError(409, "window", windowMessage(today));
      }
      // Решение б: отразената в ТРЗ се пипа само от admin.
      if (cur && cur.trz_done && !acc.canAdmin) throw new HttpError(409, "trz_done", "Промяната е отразена в ТРЗ — само admin може да я променя.");
      if (all.some((c) => c.id !== self && c.staff_id === ch.sid && c.day === b.day)) {
        throw new HttpError(409, "duplicate", "За този служител и ден вече има промяна — редактирай нея.");
      }
      const now = new Date().toISOString();
      // source: записът през „✎ Промени“ е ръчен — и редът от „✅ Днес“, редактиран тук, губи „📱 дневна“ (пакет 2А).
      const fields = { staff_id: ch.sid, day: b.day, planned_letter: ch.plannedLetter, planned_code: ch.plannedCode, actual: b.actual, reason: ch.reason, trip_store: ch.trip, source: "manual", updated_at: now, updated_by: acc.email };
      const row = cur ? await repo.updateChange(cur.id, fields) : await repo.insertChange({ ...fields, month_id: month.id, created_by: acc.email });
      await audit(repo, acc, cur ? "grafik_change_update" : "grafik_change_create", store, { month: m.start, id: row ? row.id : null, staff_id: ch.sid, day: b.day, actual: b.actual, planned: ch.plannedLetter + "/" + ch.plannedCode, ...(ch.trip ? { trip_store: ch.trip } : {}) });
      return { row };
    }

    case "changes_delete": {
      const store = await needStore(repo, acc, b.store, "edit");
      const { m, month } = await submittedMonth(repo, store, b.month);
      const id = uuid(b.id, "id");
      const cur = (await repo.listChanges(month.id)).filter((c) => c.id === id)[0];
      if (!cur) throw new HttpError(404, "not_found", "Промяната не е намерена в този месец.");
      if (!isOffice(acc) && !inStoreWindow(addDay(m.start, cur.day), sofiaToday(nowS))) throw new HttpError(409, "window", windowMessage(sofiaToday(nowS)));
      if (cur.trz_done && !acc.canAdmin) throw new HttpError(409, "trz_done", "Промяната е отразена в ТРЗ — само admin може да я трие.");
      await repo.deleteChange(id);
      await audit(repo, acc, "grafik_change_delete", store, { month: m.start, id, staff_id: cur.staff_id, day: cur.day, actual: cur.actual, reason: cur.reason });
      return { deleted: 1 };
    }

    case "changes_trz": {
      // „Отразено в ТРЗ“ — само ТРЗ и admin; останалите полета не се пипат.
      if (acc.kind !== "trz" && !acc.canAdmin) throw new HttpError(403, "forbidden", "„Отразено в ТРЗ“ отмятат ТРЗ.");
      const store = await needStore(repo, acc, b.store, "read");
      const { m, month } = await submittedMonth(repo, store, b.month, true);
      const id = uuid(b.id, "id");
      if (typeof b.done !== "boolean") throw new HttpError(400, "bad_request", "done е true или false.");
      const cur = (await repo.listChanges(month.id)).filter((c) => c.id === id)[0];
      if (!cur) throw new HttpError(404, "not_found", "Промяната не е намерена в този месец.");
      const row = await repo.updateChange(id, b.done ? { trz_done: true, trz_done_at: new Date().toISOString(), trz_done_by: acc.email } : { trz_done: false, trz_done_at: null, trz_done_by: null });
      await audit(repo, acc, b.done ? "grafik_change_trz" : "grafik_change_trz_undo", store, { month: m.start, id, staff_id: cur.staff_id, day: cur.day });
      return { row };
    }

    // ── „✅ Днес“ — дневна присъствена (пакет 2А) ─────────────────────────────
    case "daily_get": {
      const store = await needStore(repo, acc, b.store, "read");
      const m = needMonth(b.month);
      const today = sofiaToday(nowS);
      const date = b.date === undefined || b.date === null || b.date === ""
        ? (today < m.start ? m.start : today > m.end ? m.end : today) : needDate(b.date, m);
      return await dailyView(repo, acc, store, m, await repo.getMonth(store, m.start), date, today);
    }

    case "daily_save": {
      const store = await needStore(repo, acc, b.store, "edit");
      const { m, month } = await submittedMonth(repo, store, b.month);
      const date = needDate(b.date, m), today = sofiaToday(nowS);
      if (date > today) throw new HttpError(409, "future", "Бъдещ ден не се отбелязва.");
      const inWin = inStoreWindow(date, today);
      let correction: { reason: string } | null = null;
      if (!inWin) {
        if (!isOffice(acc)) throw new HttpError(409, "daily_locked", windowMessage(today));
        const cr = typeof b.correct_reason === "string" ? b.correct_reason.trim().replace(/\s+/g, " ") : "";
        if (cr.length < 3 || cr.length > 300) throw new HttpError(400, "correct_reason", "Корекция извън прозореца на обекта — напиши основание (от 3 до 300 знака).");
        correction = { reason: cr };
      }
      if (!Array.isArray(b.marks) || b.marks.length > 200) throw new HttpError(400, "bad_request", "marks трябва да е списък.");
      const ctx = await dailyContext(repo, store, m, month, date);
      const sent: Record<string, Record<string, unknown>> = {};
      for (const x of b.marks) {
        if (!isObj(x) || typeof x.staff_id !== "string") throw new HttpError(400, "bad_request", "Невалидно отбелязване.");
        if (sent[x.staff_id]) throw new HttpError(400, "bad_request", "Служител е два пъти в отбелязването.");
        sent[x.staff_id] = x;
      }
      const known: Record<string, boolean> = {}; ctx.people.forEach((p) => { known[p.staff_id] = true; });
      if (Object.keys(sent).some((id) => !known[id])) throw new HttpError(400, "not_in_schedule", "Служител не е в подадения график за този ден — върни графика в чернова, добави го и го подай пак.");
      const errors: { staff_id: string; name: string; error: string }[] = [];
      for (const p of ctx.people) {
        const mk = sent[p.staff_id];
        const e = mk ? markError(mk, p.planned_letter) : "не е отбелязан";
        if (e) errors.push({ staff_id: p.staff_id, name: p.name, error: e });
      }
      if (errors.length) throw new HttpError(400, "bad_marks", "Отбелязването не е записано:\n" + errors.map((e) => "· " + e.name + ": " + e.error).join("\n"), { errors });
      const del: string[] = [], up: DailySave["changes_upsert"] = [], marks: MarkRow[] = [], diff: { staff_id: string; from: string; to: string }[] = [];
      const eff = (mk: { state: string; actual?: string | null } | null, c: ChangeRow | null) => mk ? mk.state + (mk.actual ? ":" + mk.actual : "") : c ? "change:" + c.actual : "—";
      for (const p of ctx.people) {
        const mk = sent[p.staff_id], st = String(mk.state);
        const trip = st === "trip" ? String(mk.trip_store).trim() : null;
        const desired = markActual({ state: st, actual: st === "trip" ? "К" : (mk.actual as string) }, p.planned_letter);
        const ec = p.change;
        if (desired && ec && ec.actual === desired && (ec.trip_store || null) === trip) { /* същото — без запис */ }
        else if (desired || ec) {
          if (ec && ec.trz_done && !acc.canAdmin) throw new HttpError(409, "trz_done", p.name + ": промяната за деня е отразена в ТРЗ — само admin може да я променя.");
          if (desired) {
            // Ръчна промяна за деня се заменя — старото „реално“ и основанието (напр. № на документ) остават в новото.
            const was = ec && ec.source !== "daily" ? " (беше: " + ec.actual + " — " + ec.reason + ")" : "";
            const ch = await checkChange(repo, store, m, month, p.staff_id, ctx.day, desired, (dailyReason(desired, mk.note) + was).slice(0, 300), trip);
            up.push({ staff_id: p.staff_id, planned_letter: ch.plannedLetter, planned_code: ch.plannedCode, actual: desired, reason: ch.reason, trip_store: ch.trip });
          } else del.push(ec!.id);
        }
        const actual = st === "trip" ? "К" : (st === "absent" || st === "other_shift" || st === "extra") ? String(mk.actual) : null;
        const note = typeof mk.note === "string" && mk.note.trim() ? mk.note.trim().slice(0, 200) : null;
        marks.push({ staff_id: p.staff_id, planned_letter: p.planned_letter, state: st, actual, trip_store: trip, note });
        const was = eff(p.mark, p.change), now = st + (actual ? ":" + actual : "");
        if (was !== now) diff.push({ staff_id: p.staff_id, from: was, to: now });
      }
      const late = date < today;
      await repo.dailySave({ store_name: store, month_id: month.id, day: date, actor: acc.email, actor_name: acc.name, late, correction, changes_delete: del, changes_upsert: up, marks });
      await audit(repo, acc, correction ? "grafik_daily_correct" : "grafik_daily_save", store, {
        month: m.start, date, late, first: !ctx.daily, ...(correction ? { correct_reason: correction.reason } : {}),
        people: marks.length, deviations: marks.filter((x) => x.state !== "present" && x.state !== "off").length, changes: { upsert: up.length, delete: del.length }, diff,
      });
      return await dailyView(repo, acc, store, m, month, date, today);
    }

    case "daily_resolve": {
      // Решение 3: „неуточнено“ отсъствие се уточнява и след прозореца — само причината, само за неуточнения.
      const store = await needStore(repo, acc, b.store, "edit");
      const { m, month } = await submittedMonth(repo, store, b.month);
      const date = needDate(b.date, m), today = sofiaToday(nowS);
      if (date > today) throw new HttpError(409, "future", "Бъдещ ден не се отбелязва.");
      const sid = uuid(b.staff_id, "служител");
      const actual = typeof b.actual === "string" ? b.actual : "";
      if (DAILY_ABSENT.indexOf(actual) < 0) throw new HttpError(400, "bad_request", "Причината е една от: " + DAILY_ABSENT.join(", ") + ".");
      if (b.note !== undefined && b.note !== null && (typeof b.note !== "string" || b.note.length > 200)) throw new HttpError(400, "bad_request", "Бележката е до 200 знака.");
      const ctx = await dailyContext(repo, store, m, month, date);
      const p = ctx.people.filter((x) => x.staff_id === sid)[0];
      if (!ctx.daily || !p || !p.mark || p.mark.state !== "unknown") throw new HttpError(409, "not_unknown", "Тук се уточнява само „неуточнено“ отсъствие.");
      if (p.change && p.change.trz_done && !acc.canAdmin) throw new HttpError(409, "trz_done", "Промяната за деня е отразена в ТРЗ — само admin може да я променя.");
      const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 200) : p.mark.note;
      const desired = markActual({ state: "absent", actual }, p.planned_letter);
      const up: DailySave["changes_upsert"] = [];
      if (desired) {
        const ch = await checkChange(repo, store, m, month, sid, ctx.day, desired, dailyReason(desired, note), null);
        up.push({ staff_id: sid, planned_letter: ch.plannedLetter, planned_code: ch.plannedCode, actual: desired, reason: ch.reason, trip_store: null });
      }
      const marks = ctx.people.filter((x) => !!x.mark).map((x) => x.staff_id === sid
        ? { staff_id: sid, planned_letter: x.planned_letter, state: "absent", actual, trip_store: null, note }
        : { staff_id: x.staff_id, planned_letter: x.mark!.planned_letter, state: x.mark!.state, actual: x.mark!.actual, trip_store: x.mark!.trip_store, note: x.mark!.note });
      await repo.dailySave({ store_name: store, month_id: month.id, day: date, actor: acc.email, actor_name: acc.name, late: ctx.daily.late, correction: null,
        changes_delete: !desired && p.change ? [p.change.id] : [], changes_upsert: up, marks });
      await audit(repo, acc, "grafik_daily_resolve", store, { month: m.start, date, staff_id: sid, actual, late: date < today });
      return await dailyView(repo, acc, store, m, month, date, today);
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

    case "sector_update": {
      // „Следи покритието“ (24.11.2026): сектор без отметка не се брои в „Сектори без човек“ и в
      // червените колони на графика. Сменя го admin или регионалният за своя обект — само това поле.
      const store = await needStore(repo, acc, b.store, "edit");
      if (acc.kind !== "admin" && acc.kind !== "regional") throw new HttpError(403, "forbidden", "Сектора сменят регионалният и admin.");
      const id = uuid(b.id, "id");
      if (typeof b.track_coverage !== "boolean") throw new HttpError(400, "bad_request", "track_coverage е true или false.");
      const cur = await repo.getSector(id);
      if (!cur || cur.store_name !== store) throw new HttpError(404, "not_found", "Секторът не е намерен в този магазин.");
      const was = cur.track_coverage !== false;   // преди записа — getSector може да върне същия обект
      const sec = await repo.updateSector(id, { track_coverage: b.track_coverage });
      if (!sec) throw new HttpError(404, "not_found", "Секторът не е намерен в този магазин.");
      await audit(repo, acc, "grafik_sector_update", store, { id, name: cur.name, track_coverage: b.track_coverage, was });
      return { sector: sec };
    }

    case "overview": {
      // Етап 1е-1 (решение на Тенчо 04.11.2026): само обектите, чието дружество има ВТР за
      // месеца — логистичните складове (ТЦД 2, без ВТР) не са в обхвата. „Извън нормата" —
      // само за подадените (от снимката); за черновите — последната промяна (кой, кога).
      const m = needMonth(b.month);
      const names = await repo.storeNames();
      const sc = await scopeStores(repo, names, m.start);
      const visible = (acc.readAll ? names : names.filter((n) => acc.read.indexOf(n) >= 0)).filter((n) => !!sc.company[n]);
      const months = (await repo.listMonths(m.start, visible))
        .filter((r) => acc.kind !== "trz" || hasSubmission(r));
      // ТРЗ: върнатият месец е „подаден“ с последното подаване; за останалите е чернова (с бележка „върнат“).
      const asSub = (r: MonthRow) => isFiled(r) || (acc.kind === "trz" && !!reopenedOf(r));
      const stats = await repo.rowStats(months.map((r) => r.id));
      const chs = await repo.changeStats(months.filter(asSub).map((r) => r.id));   // П3: „промени / неотразени“
      // „Служители“ — активните в месеца (назначен до края му, не напуснал преди началото му; 20.11.2026).
      const staffN: Record<string, number> = {}, activeN: Record<string, number> = {};
      const byStore: Record<string, MonthRow> = {};
      months.forEach((r) => { byStore[r.store_name] = r; });
      if (acc.kind !== "trz") {
        // Пакет 1, т.4: „Активни“ — без целия месец Б / НО / майчинство (activeInMonth). Буквите — от графика;
        // за подаден / одобрен — и промените (имат предимство). Месец без график → всички активни.
        const inMonth = (await repo.staffDates(visible)).filter((s) => staffInMonth(s, m.start, m.end));
        const [lets, chg] = await Promise.all([repo.monthLetters(months.map((r) => r.id)), repo.monthChanges(months.filter(isFiled).map((r) => r.id))]);
        const L: Record<string, string[]> = {}, C: Record<string, Record<number, string>> = {};
        lets.forEach((x) => { L[x.month_id + "|" + x.staff_id] = x.letters; });
        chg.forEach((x) => { const k = x.month_id + "|" + x.staff_id; (C[k] = C[k] || {})[x.day] = x.actual; });
        inMonth.forEach((s) => {
          staffN[s.store_name] = (staffN[s.store_name] || 0) + 1;
          const mo = byStore[s.store_name], k = mo ? mo.id + "|" + s.id : "";
          if (activeInMonth(s, mo ? L[k] : [], mo ? C[k] || {} : {}, m.start, m.days)) activeN[s.store_name] = (activeN[s.store_name] || 0) + 1;
        });
      }
      const who = await repo.userNames(Array.from(new Set(Object.values(stats).map((s) => (s.last_by || "").toLowerCase()).filter(Boolean))));
      const list = (acc.kind === "trz" ? visible.filter((n) => !!byStore[n]) : visible).map((n) => {
        const r = byStore[n], st = r ? stats[r.id] : null, sub = !!r && asSub(r), reo = reopenedOf(r), trzReo = sub && !!reo;
        const lastBy = st && st.last_by ? st.last_by.toLowerCase() : null;
        return {
          store: n, company: sc.company[n], status: r ? (trzReo ? "submitted" : r.status) : null,
          submitted_at: r ? (trzReo ? reo!.submitted_at : r.submitted_at) : null,
          submitted_by_name: r ? (trzReo ? reo!.submitted_by_name : r.submitted_by_name) : null, rows: st ? st.rows : 0,
          reopened: reo ? { at: reo.at, by_name: reo.by_name, comment: reo.comment || null } : null,
          // Етап Б: одобрението и правата за масовото одобряване / връщане в „🏬 Обекти“.
          approved_at: r && r.status === "approved" ? r.approved_at || null : null,
          approved_by_name: r && r.status === "approved" ? r.approved_by_name || null : null,
          can_approve: canApprove(acc) && !!r && r.status === "submitted", can_return: canReturn(acc, n, r),
          staff: (staffN as Record<string, number>)[n] || 0, active: acc.kind === "trz" ? null : activeN[n] || 0, can_edit: canEdit(acc, n),
          last_at: st ? st.last_at : null, last_by: lastBy ? (who[lastBy] || lastBy) : null,
          off_norm: sub ? snapshotOffNorm(r!.snapshot) : null,
          changes: sub ? (chs[r!.id] || { n: 0, open: 0 }).n : null, changes_open: sub ? (chs[r!.id] || { n: 0, open: 0 }).open : null,
        };
      });
      return { month: m.start, stores: list, no_company: acc.kind === "admin" ? sc.noCompany : [] };
    }

    case "admin_get": {
      if (!acc.canAdmin) throw new HttpError(403, "forbidden", "Само admin.");
      const t: AdminTable[] = ["companies", "grafik_company_terms", "grafik_store_company", "grafik_extra_days", "grafik_letter_map"];
      const out: Record<string, unknown> = {};
      for (const k of t) out[k] = await repo.adminList(k);
      out.vtrs = await repo.vtrList();             // за избора на ВТР при дружеството (картата в „Администрация“)
      out.stores = await repo.storeNames();
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

    // ── Ролите (grafik_access: view / trz / edit, 27.11.2026) — само admin, всяка промяна в одита.
    // Собственият имейл не се пипа: махнат — admin губи модула; сменен на view / trz — губи
    // администрацията (ролята в графика има предимство) и не може да го върне сам.
    case "access_list": {
      // Списъкът и състоянието на ПИН-овете — admin и който може да нулира ПИН (Теодор, view).
      if (!acc.canAdmin && !acc.canResetPin) throw new HttpError(403, "forbidden", "Само admin.");
      const [rows, pins] = await Promise.all([repo.listAccess(), repo.pinStates()]);
      return {
        rows,
        pins: pins.map((p) => ({ user_id: p.user_id, email: p.email ? p.email.toLowerCase() : null, state: pinStateOf(p, nowS), fails: p.fails,
          locked_until: p.locked_until, set_at: p.set_at || null, last_ok_at: p.last_ok_at || null })),
      };
    }

    case "access_add": {
      if (!acc.canAdmin) throw new HttpError(403, "forbidden", "Само admin.");
      // role — от 27.11.2026; list: beta / trz — старата карта (браузър отпреди пуша), beta = edit.
      const role = needRole(b.role !== undefined ? b.role : b.list === "beta" ? "edit" : b.list);
      const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
      if (!ACCESS_EMAIL_RE.test(email)) throw new HttpError(400, "bad_email", "Невалиден имейл.");
      if (email === acc.email) throw new HttpError(409, "self", "Собствения си имейл не променяш оттук — би загубил достъпа до администрацията.");
      const rows = await repo.listAccess();
      const had = roleOf(rows, email);
      if (had) throw new HttpError(409, "duplicate", "Имейлът вече има роля (" + ROLE_LABEL[had] + ") — смени я в реда му.");
      const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 200) : null;
      const row = await repo.insertAccess({ list: role, email, note, created_by: acc.email });
      await audit(repo, acc, "grafik_access_add", null, { list: role, email, note });
      return { row };
    }

    case "access_set": {
      // Смяна на ролята на един ред (и „може да нулира ПИН“) — само admin; своя ред — не.
      if (!acc.canAdmin) throw new HttpError(403, "forbidden", "Само admin.");
      const id = uuid(b.id, "id");
      const cur = (await repo.listAccess()).filter((r) => r.id === id)[0];
      if (!cur) throw new HttpError(404, "not_found", "Записът не е намерен.");
      if (cur.email === acc.email) throw new HttpError(409, "self", "Собствения си имейл не променяш оттук — би загубил достъпа до администрацията.");
      const fields: Record<string, unknown> = {};
      if (b.role !== undefined) fields.list = needRole(b.role);
      if (b.can_reset_pin !== undefined) {
        if (typeof b.can_reset_pin !== "boolean") throw new HttpError(400, "bad_request", "can_reset_pin е true или false.");
        fields.can_reset_pin = b.can_reset_pin;
      }
      if (!Object.keys(fields).length) throw new HttpError(400, "bad_request", "Няма какво да се смени.");
      const row = await repo.updateAccess(id, fields);
      if (!row) throw new HttpError(404, "not_found", "Записът не е намерен.");
      await audit(repo, acc, "grafik_access_set", null, { email: cur.email, was: { list: cur.list, can_reset_pin: cur.can_reset_pin === true }, set: fields });
      return { row };
    }

    case "access_remove": {
      if (!acc.canAdmin) throw new HttpError(403, "forbidden", "Само admin.");
      const id = uuid(b.id, "id");
      const cur = (await repo.listAccess()).filter((r) => r.id === id)[0];
      if (!cur) throw new HttpError(404, "not_found", "Записът не е намерен.");
      if (cur.email === acc.email) throw new HttpError(409, "self", "Собствения си имейл не променяш оттук — би загубил достъпа до администрацията.");
      if (!(await repo.deleteAccess(id))) throw new HttpError(404, "not_found", "Записът не е намерен.");
      await audit(repo, acc, "grafik_access_remove", null, { list: cur.list, email: cur.email });
      return { deleted: 1 };
    }
  }
  throw new HttpError(400, "bad_request", "Непознато действие.");
}
