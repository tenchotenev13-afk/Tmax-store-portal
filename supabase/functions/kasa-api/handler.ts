// supabase/functions/kasa-api/handler.ts
// Каса — четене на касовите таблици през подписания пропуск (етап 1б, 19.11.2026).
// Проектът: claude/kasa-api-dizajn.md (т.3 + „Решено 19.11“ в т.7).
//
// Ред на всяка заявка: пропуск (verifySession) → потребителят от users по uid →
// обхват (resolveScope) → действие. Обектът и ролята НИКОГА не идват от тялото:
// тялото може само да ИЗБЕРЕ обект вътре в обхвата (needStore), не да го разшири.
// Всяка заявка към таблица минава през scopedQuery(), която слага филтъра по
// store_name — без него repo.rows() отказва (виж guardQuery).
//
// Само ЧЕТЕНЕ. Записите (етап 3) и DELETE за сторно (етап 2) не са тук.
import { verifySession } from "../_shared/session.ts";
// @ts-ignore — обикновен JS модул (копие от kasa.js), без типове.
import { stornoIndicator } from "./storno-rule.js";

// ── Типове ────────────────────────────────────────────────────────────────
export type User = {
  id: string; email: string; display_name: string | null; store_name: string | null;
  role: string; is_regional: boolean | null; assigned_stores: string[] | string | null; active: boolean | null;
};
export type Row = Record<string, unknown>;
export type Query = {
  table: string;
  select: string;
  stores: string[] | "all";          // "all" = без филтър по обект; масив = store_name in (...)
  eq?: Record<string, string>;
  gte?: [string, string];
  lte?: [string, string];
  lt?: [string, string];
  orReturned?: { col: string; from: string }; // (col >= from) ИЛИ status = 'returned'
  order: string[];                    // "колона.asc|desc"
  embedOrder?: { table: string; cols: string[] };
  cap: number;                        // repo връща най-много cap+1 реда
};
export interface Repo {
  getUser(id: string): Promise<User | null>;
  rows(q: Query): Promise<Row[]>;
  signUrl(path: string, seconds: number): Promise<string | null>;
}

export class HttpError extends Error {
  constructor(public status: number, public reason: string, message: string) { super(message); }
}

export type Action = "day" | "range" | "storno_items" | "banner" | "report_rows" | "doc_url";
export type Scope = {
  role: string;
  own: string | null;                 // users.store_name
  stores: string[] | "all";           // обхват за day / range / storno_items / doc_url
  reportStores: string[] | "all";     // обхват за report_rows
  actions: Action[];
  stornoBanner: boolean;              // брояч „сторна с по-малка сума“ в banner
};

// ── Константи ─────────────────────────────────────────────────────────────
export const DOC_URL_SECONDS = 300;   // решение 8
export const ROW_CAP = 20000;         // таван на таблица в един отговор
export const MAX_RANGE_DAYS = 400;    // за заявка през повече от един обект
export const STORNO_BANNER_DAYS = 30;

const STORE_ROLES = ["kasa", "manager"];
const DENOM_COLS = ["bills_500", "bills_200", "bills_100", "bills_50", "bills_20", "bills_10", "bills_5", "bills_2", "bills_1",
  "coins_50", "coins_20", "coins_10", "coins_5", "coins_2", "coins_1"];

type KindDef = { table: string; dateCol: string; select: string; order: string[]; embedOrder?: Query["embedOrder"] };
export const KINDS: Record<string, KindDef> = {
  reports:   { table: "kasa_reports",   dateCol: "date",        select: "*", order: ["date.desc", "pos_number.asc", "id.desc"] },
  glavna:    { table: "kasa_glavna",    dateCol: "date",        select: "*", order: ["date.desc", "id.desc"] },
  zoborot:   { table: "kasa_zoborot",   dateCol: "date",        select: "*", order: ["date.desc", "created_at.desc", "id.desc"] },
  documents: { table: "kasa_documents", dateCol: "date",        select: "*", order: ["date.desc", "store_name.asc", "created_at.desc", "id.desc"] },
  storno:    { table: "kasa_storno",    dateCol: "storno_date", select: "*,kasa_storno_items(kind,sap_code,article_name,line_no)",
               order: ["storno_date.desc", "created_at.desc", "id.desc"], embedOrder: { table: "kasa_storno_items", cols: ["kind.asc", "line_no.asc"] } },
  oborot:    { table: "daily_turnover", dateCol: "date",        select: "*", order: ["date.desc", "store_name.asc", "id.desc"] },
};
// Тесни колони по избор (бял списък) — само за reports: купюрите за Excel (R21).
const COL_PRESETS: Record<string, Record<string, string>> = {
  reports: { denoms: ["id", "store_name", "date"].concat(DENOM_COLS).join(",") },
};

// ── Обхват (решения 2, 3, 4 от 19.11.2026) ─────────────────────────────────
export function assignedList(v: User["assigned_stores"]): string[] {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === "string" && v.length > 2) {
    return v.replace(/^{|}$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return [];
}

export function resolveScope(u: User): Scope {
  const own = u.store_name || null;
  const ownList = own ? [own] : [];
  const assigned = assignedList(u.assigned_stores);
  // 3) admin — всички обекти, винаги (assigned не го ограничава).
  if (u.role === "admin") {
    return { role: u.role, own, stores: "all", reportStores: "all",
      actions: ["day", "range", "storno_items", "banner", "report_rows", "doc_url"], stornoBanner: true };
  }
  // 2) accounting — assigned ограничава, ако го има (като storeQ); иначе всички.
  if (u.role === "accounting") {
    const s: string[] | "all" = assigned.length ? assigned : "all";
    return { role: u.role, own, stores: s, reportStores: s,
      actions: ["day", "range", "storno_items", "banner", "report_rows", "doc_url"], stornoBanner: true };
  }
  // 4) controlling — само report_rows за всички (+ банерът за своя обект).
  if (u.role === "controlling") {
    return { role: u.role, own, stores: ownList, reportStores: "all", actions: ["report_rows", "banner"], stornoBanner: false };
  }
  // Обектът — само своя.
  if (STORE_ROLES.indexOf(u.role) >= 0) {
    return { role: u.role, own, stores: ownList, reportStores: ownList,
      actions: ["day", "range", "storno_items", "banner", "doc_url"], stornoBanner: false };
  }
  // 4) logistics и всички останали — само банерът за своя обект.
  return { role: u.role, own, stores: ownList, reportStores: ownList, actions: ["banner"], stornoBanner: false };
}

export function inScope(stores: string[] | "all", store: string): boolean {
  return stores === "all" || stores.indexOf(store) >= 0;
}

// Обектът от тялото — само ако е в обхвата. Без обект → целият обхват.
export function needStore(stores: string[] | "all", v: unknown): string[] | "all" {
  if (v === undefined || v === null || v === "") return stores;
  if (typeof v !== "string") throw new HttpError(400, "bad_request", "Невалиден обект.");
  if (!inScope(stores, v)) throw new HttpError(403, "forbidden_store", "Нямате достъп до касата на този обект.");
  return [v];
}

// ── Валидиране ────────────────────────────────────────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function needDate(v: unknown, name: string): string {
  if (typeof v !== "string" || !ISO.test(v) || isNaN(Date.parse(v + "T00:00:00Z"))) {
    throw new HttpError(400, "bad_request", "Невалидна дата (" + name + ", ГГГГ-ММ-ДД).");
  }
  return v;
}
const STAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/;
function needStamp(v: unknown, name: string): string {
  if (typeof v !== "string" || !STAMP.test(v) || isNaN(Date.parse(v))) throw new HttpError(400, "bad_request", "Невалиден момент (" + name + ").");
  return v;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function needId(v: unknown, name: string): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new HttpError(400, "bad_request", "Невалиден идентификатор (" + name + ").");
  return v;
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}
function isoDaysAgo(n: number, now: number): string {
  return new Date(now - n * 86400000).toISOString().slice(0, 10);
}

// ── Заявка с обхват ───────────────────────────────────────────────────────
// Единственият начин да се построи Query: обхватът е задължителен аргумент.
// Празен обхват (напр. потребител без store_name) → нито един ред, без база.
function scopedQuery(stores: string[] | "all", q: Omit<Query, "stores" | "cap"> & { cap?: number }): Query | null {
  if (stores !== "all" && !stores.length) return null;
  return { ...q, stores, cap: q.cap ?? ROW_CAP };
}
async function fetchRows(repo: Repo, q: Query | null): Promise<Row[]> {
  if (!q) return [];
  const rows = await repo.rows(q);
  if (rows.length > q.cap) throw new HttpError(413, "too_many", "Твърде много редове — избери по-къс период или един обект.");
  // Втора преграда: ред извън обхвата не излиза, дори repo да сбърка филтъра.
  return q.stores === "all" ? rows : rows.filter((r) => inScope(q.stores, String(r.store_name)));
}
const wrap = (rows: Row[]) => ({ rows, partial: false });

// ── Действия ──────────────────────────────────────────────────────────────
export async function dispatch(repo: Repo, sc: Scope, b: Record<string, unknown>, now: number): Promise<Record<string, unknown>> {
  const action = String(b.action || "") as Action;
  if (["day", "range", "storno_items", "banner", "report_rows", "doc_url"].indexOf(action) < 0) {
    throw new HttpError(400, "bad_action", "Непознато действие.");
  }
  if (sc.actions.indexOf(action) < 0) throw new HttpError(403, "forbidden", "Нямате достъп до касовите данни.");

  switch (action) {
    // Един ден на един обект: R2–R7, R9, R13, R15, R17.
    case "day": {
      const date = needDate(b.date, "date");
      const st = needStore(sc.stores, b.store === undefined ? sc.own : b.store);
      if (st === "all") throw new HttpError(400, "bad_request", "Липсва обект.");
      const one = (table: string, order: string[]) => fetchRows(repo, scopedQuery(st, { table, select: "*", eq: { date }, order }));
      const [reports, glavna, zoborot, documents] = await Promise.all([
        one("kasa_reports", ["pos_number.asc", "id.asc"]),
        one("kasa_glavna", ["id.asc"]),
        one("kasa_zoborot", ["created_at.desc", "id.desc"]),
        one("kasa_documents", ["created_at.asc", "id.asc"]),
      ]);
      return { store: st[0], date, reports, glavna, zoborot, documents };
    }

    // Период по видове: R1, R10, R14, R18–R21, R23–R25.
    case "range": {
      const kinds = Array.isArray(b.kinds) ? b.kinds.map(String) : [];
      if (!kinds.length || kinds.some((k) => !KINDS[k])) throw new HttpError(400, "bad_request", "Невалидни видове (kinds).");
      const from = needDate(b.from, "from");
      const to = needDate(b.to, "to");
      if (from > to) throw new HttpError(400, "bad_request", "Началото е след края.");
      const st = needStore(sc.stores, b.store);
      if ((st === "all" || st.length > 1) && daysBetween(from, to) > MAX_RANGE_DAYS) {
        throw new HttpError(400, "range_too_long", "Периодът е над " + MAX_RANGE_DAYS + " дни — избери по-къс или един обект.");
      }
      const withReturned = b.include_returned === true;
      const preset = typeof b.cols === "string" ? b.cols : null;
      const out: Record<string, unknown> = {};
      await Promise.all(kinds.map(async (k) => {
        const d = KINDS[k];
        let select = d.select;
        if (preset) {
          const p = COL_PRESETS[k] && COL_PRESETS[k][preset];
          if (!p) throw new HttpError(400, "bad_request", "Невалиден избор на колони.");
          select = p;
        }
        // include_returned: (дата ≥ from) ИЛИ върнат, горната граница — винаги (решение 6).
        const q = withReturned && (k === "reports" || k === "zoborot" || k === "glavna" || k === "storno")
          ? scopedQuery(st, { table: d.table, select, orReturned: { col: d.dateCol, from }, lte: [d.dateCol, to], order: d.order, embedOrder: d.embedOrder })
          : scopedQuery(st, { table: d.table, select, gte: [d.dateCol, from], lte: [d.dateCol, to], order: d.order, embedOrder: d.embedOrder });
        out[k] = wrap(await fetchRows(repo, q));
      }));
      return { from, to, kinds: out };
    }

    // Редовете на едно сторно — само ако сторното е в обхвата (R11).
    case "storno_items": {
      const id = needId(b.storno_id, "storno_id");
      const parent = await fetchRows(repo, scopedQuery(sc.stores, { table: "kasa_storno", select: "id,store_name", eq: { id }, order: ["id.asc"], cap: 1 }));
      if (!parent.length) throw new HttpError(404, "not_found", "Няма такава сторно бележка във вашия обхват.");
      // kasa_storno_items няма store_name — обхватът е проверен на родителя.
      const items = await repo.rows({ table: "kasa_storno_items", select: "*", stores: "all", eq: { storno_id: id }, order: ["kind.asc", "line_no.asc"], cap: ROW_CAP });
      return { storno_id: id, items };
    }

    // Банерът при вход: R28 (своя обект) + R29 (admin / accounting в обхвата).
    case "banner": {
      const own = sc.own ? [sc.own] : [];
      const returned = await fetchRows(repo, scopedQuery(own, { table: "kasa_reports", select: "store_name,date,pos_number,return_reason,returned_by",
        eq: { status: "returned" }, order: ["date.desc", "id.desc"] }));
      const res: Record<string, unknown> = { returned_reports: returned };
      if (sc.stornoBanner) {
        const rows = await fetchRows(repo, scopedQuery(sc.stores, { table: "kasa_storno", select: "store_name,returned_sum,new_sum,articles",
          gte: ["storno_date", isoDaysAgo(STORNO_BANNER_DAYS, now)], order: ["id.asc"] }));
        const by: Record<string, number> = {};
        let count = 0;
        rows.forEach((r) => {
          if (stornoIndicator(r.returned_sum, r.new_sum, r.articles).flagged) { count++; by[String(r.store_name)] = (by[String(r.store_name)] || 0) + 1; }
        });
        res.storno_flagged = { count, by_store: by, read: rows.length, partial: false };
      }
      return res;
    }

    // Колекторите в report.js: R26 (daily_kasa), R27 (cross_kasa).
    case "report_rows": {
      const st = sc.reportStores;
      if (b.kind === "daily_kasa") {
        const day = needDate(b.day, "day");
        const [retReports, retZob, dayReports, dayZob] = await Promise.all([
          fetchRows(repo, scopedQuery(st, { table: "kasa_reports", select: "store_name,date,pos_number,razlika,status,return_reason,returned_at", eq: { status: "returned" }, order: ["date.desc", "id.desc"] })),
          fetchRows(repo, scopedQuery(st, { table: "kasa_zoborot", select: "store_name,date,razlika,status,return_reason,returned_at", eq: { status: "returned" }, order: ["date.desc", "id.desc"] })),
          fetchRows(repo, scopedQuery(st, { table: "kasa_reports", select: "store_name,date,pos_number,razlika,status", eq: { date: day }, order: ["store_name.asc", "id.asc"] })),
          fetchRows(repo, scopedQuery(st, { table: "kasa_zoborot", select: "store_name,date,razlika,status", eq: { date: day }, order: ["store_name.asc", "id.asc"] })),
        ]);
        // Отчетите по датите на върнатите равнения — мрежата от report.js:476.
        const dates = Array.from(new Set(retZob.map((r) => String(r.date)))).filter((d) => ISO.test(d)).sort();
        let fixReports: Row[] = [];
        if (dates.length) {
          const lo = dates[0], hi = dates[dates.length - 1];
          const raw = await fetchRows(repo, scopedQuery(st, { table: "kasa_reports", select: "store_name,date,status", gte: ["date", lo], lte: ["date", hi], order: ["date.asc", "id.asc"] }));
          fixReports = raw.filter((r) => dates.indexOf(String(r.date)) >= 0);
        }
        return { kind: "daily_kasa", day, returned_reports: retReports, returned_zoborot: retZob, fix_reports: fixReports, day_reports: dayReports, day_zoborot: dayZob };
      }
      if (b.kind === "cross_kasa") {
        const fromStamp = needStamp(b.from_stamp, "from_stamp");
        const toStamp = b.to_stamp ? needStamp(b.to_stamp, "to_stamp") : null;
        const fromIso = needDate(b.from_iso, "from_iso");
        const toIso = b.to_iso ? needDate(b.to_iso, "to_iso") : null;
        const [storno, zoborot, stornoWeek] = await Promise.all([
          fetchRows(repo, scopedQuery(st, { table: "kasa_storno", select: "store_name,status", gte: ["created_at", fromStamp], ...(toStamp ? { lt: ["created_at", toStamp] as [string, string] } : {}), order: ["id.asc"] })),
          fetchRows(repo, scopedQuery(st, { table: "kasa_zoborot", select: "store_name,status", gte: ["date", fromIso], ...(toIso ? { lte: ["date", toIso] as [string, string] } : {}), order: ["id.asc"] })),
          toIso
            ? fetchRows(repo, scopedQuery(st, { table: "kasa_storno", select: "store_name,storno_date,returned_sum,new_sum,articles,reason,store_comment,status", gte: ["storno_date", fromIso], lte: ["storno_date", toIso], order: ["id.asc"] }))
            : Promise.resolve([] as Row[]),
        ]);
        return { kind: "cross_kasa", storno, zoborot, storno_week: stornoWeek };
      }
      throw new HttpError(400, "bad_request", "Невалиден вид отчет (kind).");
    }

    // Временен линк към файл — по id на реда, пътят е от базата (решение 8: 300 сек).
    case "doc_url": {
      const id = needId(b.document_id, "document_id");
      const rows = await fetchRows(repo, scopedQuery(sc.stores, { table: "kasa_documents", select: "id,store_name,file_url,file_name", eq: { id }, order: ["id.asc"], cap: 1 }));
      if (!rows.length) throw new HttpError(404, "not_found", "Няма такъв документ във вашия обхват.");
      const path = String(rows[0].file_url || "");
      if (!path) throw new HttpError(404, "not_found", "Документът няма файл.");
      const url = await repo.signUrl(path, DOC_URL_SECONDS);
      if (!url) throw new HttpError(404, "no_file", "Файлът липсва в хранилището.");
      return { url, expires_in: DOC_URL_SECONDS, file_name: rows[0].file_name || null };
    }
  }
  throw new HttpError(400, "bad_action", "Непознато действие.");
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
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// now — в СЕКУНДИ (като grafik-api и verifySession); само за тестовете.
export async function handleKasa(req: Request, getRepo: () => Repo, now?: number): Promise<Response> {
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
    // 2) Актуалният потребител — ролята и обектът са оттук, не от пропуска.
    const user = await repo.getUser(String(sess.uid));
    if (!user || user.active === false) return json({ ok: false, reason: "forbidden", message: "Потребителят не е намерен или е неактивен." }, 403);
    // 3) Обхват. 4) Действие.
    const sc = resolveScope(user);
    const t0 = Date.now();
    const result = await dispatch(repo, sc, body, now === undefined ? Date.now() : now * 1000);
    // За мерене на пилота (function_logs, решение 12): действие, роля, време — без лични данни.
    console.log(JSON.stringify({ kasa_api: String(body.action || ""), role: sc.role, dispatch_ms: Date.now() - t0 }));
    return json({ ok: true, ...result }, 200);
  } catch (e) {
    if (e instanceof HttpError) return json({ ok: false, reason: e.reason, message: e.message }, e.status);
    console.error("kasa-api error:", e);
    return json({ ok: false, reason: "internal", message: "Вътрешна грешка." }, 500);
  }
}
