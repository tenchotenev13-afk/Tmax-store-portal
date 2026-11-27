// supabase/functions/notify-admin/handler.ts
// Таблиците, които решават КОЙ КАКВО ПОЛУЧАВА (сесия notify-tables-lock, 27.11.2026):
//   report_recipients, notification_topics, notification_matrix,
//   notification_overrides, notification_schedules.
// Публичният ключ (anon) няма права върху тях — четене и запис от портала
// минават САМО оттук, с подписания пропуск (`session`) и роля от users.
// Тук е цялата логика; index.ts само вдига сървъра с истинския клиент.
import { verifySession } from "../_shared/session.ts";

type Action = "list" | "insert" | "update" | "delete";
type MatchKind = "uuid" | "text" | "bool";

type TableCfg = {
  roles: readonly string[];          // кой изобщо стига до таблицата
  order: { col: string; asc: boolean }[];
  pk: string;                        // колона за броене на засегнатите редове
  listMatch: Record<string, MatchKind>;   // по какво може да се филтрира list
  listArrays?: readonly string[];         // кои от тях приемат и масив (in)
  insert?: readonly string[];        // бял списък на полетата; липсва → забранено
  update?: readonly string[];
  // update/delete: ключове, които ТРЯБВА да са в match (иначе 400) + допълнителни
  writeMatch?: { required: Record<string, MatchKind>; optional?: Record<string, MatchKind>; arrays?: readonly string[] };
  canDelete?: boolean;
};

// Видовете записи в notification_schedules, които порталът създава. Извън тях
// функцията не пише и не пипа ред (и при update/delete — филтър в заявката).
export const SCHEDULE_ENTITY_TYPES = ["task", "subtask", "recurring_task", "promotion", "task_report"] as const;

const RR_FLAGS = ["daily", "weekly", "pallets", "warehouse", "co_overdue", "minus_multi"] as const;

export const TABLES: Record<string, TableCfg> = {
  report_recipients: {
    roles: ["admin"],
    order: [{ col: "created_at", asc: true }],
    pk: "id",
    listMatch: { active: "bool" },
    insert: ["name", "email", "active", "scope_stores", ...RR_FLAGS],
    update: ["name", "active", "scope_stores", ...RR_FLAGS],
    writeMatch: { required: { id: "uuid" } },
    canDelete: true,
  },
  notification_topics: {
    roles: ["admin"],
    order: [{ col: "sort_order", asc: true }, { col: "key", asc: true }],
    pk: "key",
    listMatch: {},
    update: ["active", "schedule_type", "weekdays", "day_of_week", "scheduled_time", "test_email"],
    writeMatch: { required: { key: "text" } },
  },
  notification_matrix: {
    roles: ["admin"],
    order: [{ col: "topic_key", asc: true }, { col: "group_key", asc: true }],
    pk: "topic_key",
    listMatch: {},
    insert: ["topic_key", "group_key", "channel", "scope"],
    update: ["channel", "scope"],
    writeMatch: { required: { topic_key: "text", group_key: "text" } },
    canDelete: true,
  },
  notification_overrides: {
    roles: ["admin"],
    order: [{ col: "user_email", asc: true }, { col: "topic_key", asc: true }],
    pk: "id",
    listMatch: {},
    insert: ["user_email", "topic_key", "mode", "channel", "scope", "note"],
    writeMatch: { required: { id: "uuid" } },
    canDelete: true,
  },
  notification_schedules: {
    roles: ["admin", "accounting"],   // canEdit() в bulletin.js
    order: [{ col: "created_at", asc: false }],
    pk: "id",
    listMatch: { entity_type: "text", entity_id: "text", schedule_type: "text", active: "bool" },
    listArrays: ["entity_id"],
    insert: [
      "entity_type", "entity_id", "schedule_type", "scheduled_date", "scheduled_time",
      "message", "target_stores", "target_recipients", "active", "created_by",
    ],
    update: ["active", "scheduled_date", "scheduled_time", "message", "target_stores"],
    writeMatch: { required: { id: "uuid" }, optional: { entity_type: "text" }, arrays: ["id"] },
    canDelete: true,
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IN = 500;

export type Cmd = {
  table: string;
  action: Action;
  match: Record<string, string | boolean | string[]>;
  messagePrefix: string | null;
  fields: Record<string, unknown> | null;
};
export type Validated = { ok: true; cmd: Cmd } | { ok: false; message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function checkScalar(kind: MatchKind, v: unknown): boolean {
  if (kind === "bool") return typeof v === "boolean";
  if (typeof v !== "string" || !v) return false;
  return kind === "uuid" ? UUID_RE.test(v) : v.length <= 200;
}

function checkMatch(
  match: unknown,
  allowed: Record<string, MatchKind>,
  arrays: readonly string[],
  required: readonly string[],
): string | null {
  if (match === undefined || match === null) match = {};
  if (!isPlainObject(match)) return "match трябва да е обект.";
  for (const k of Object.keys(match)) {
    const kind = allowed[k];
    if (!kind) return "Непозволен филтър: " + k + ".";
    const v = match[k];
    if (Array.isArray(v)) {
      if (arrays.indexOf(k) < 0) return "Филтърът " + k + " не приема списък.";
      if (!v.length || v.length > MAX_IN) return "Списъкът за " + k + " е празен или твърде дълъг.";
      if (!v.every((x) => checkScalar(kind, x))) return "Невалидна стойност в " + k + ".";
    } else if (!checkScalar(kind, v)) {
      return "Невалидна стойност за " + k + ".";
    }
  }
  for (const k of required) if (!(k in match)) return "Липсва филтър " + k + ".";
  return null;
}

function checkFields(fields: unknown, allowed: readonly string[]): string | null {
  if (!isPlainObject(fields)) return "fields трябва да е обект.";
  const keys = Object.keys(fields);
  if (!keys.length) return "fields е празен.";
  const bad = keys.filter((k) => allowed.indexOf(k) < 0);
  if (bad.length) return "Непозволено поле: " + bad.join(", ") + ".";
  return null;
}

// Чиста функция: без мрежа, без база. Стойностите на полетата (channel, scope,
// schedule_type …) НЕ се валидират тук — решава базата (CHECK), както досега.
// Изключение: notification_schedules — вид и тип при създаване.
export function validate(body: unknown): Validated {
  if (!isPlainObject(body)) return { ok: false, message: "Невалидна заявка." };
  const table = body.table;
  if (typeof table !== "string" || !Object.prototype.hasOwnProperty.call(TABLES, table)) {
    return { ok: false, message: "Непозната таблица." };
  }
  const cfg = TABLES[table];
  const action = body.action;
  let err: string | null = null;
  let messagePrefix: string | null = null;

  if (action === "list") {
    if (body.fields !== undefined && body.fields !== null) return { ok: false, message: "fields не се подава при list." };
    err = checkMatch(body.match, cfg.listMatch, cfg.listArrays || [], []);
    if (err) return { ok: false, message: err };
    if (body.message_prefix !== undefined && body.message_prefix !== null) {
      if (table !== "notification_schedules" || typeof body.message_prefix !== "string" ||
          !body.message_prefix || body.message_prefix.length > 100) {
        return { ok: false, message: "Невалиден message_prefix." };
      }
      messagePrefix = body.message_prefix;
    }
  } else if (action === "insert") {
    if (!cfg.insert) return { ok: false, message: "Добавяне в тази таблица не е позволено." };
    if (body.match !== undefined && body.match !== null) return { ok: false, message: "match не се подава при insert." };
    err = checkFields(body.fields, cfg.insert);
    if (err) return { ok: false, message: err };
    if (table === "notification_schedules") {
      const f = body.fields as Record<string, unknown>;
      if ((SCHEDULE_ENTITY_TYPES as readonly string[]).indexOf(String(f.entity_type)) < 0) {
        return { ok: false, message: "Непознат entity_type." };
      }
      if (f.schedule_type !== "once") return { ok: false, message: "Порталът насрочва само еднократно (once)." };
    }
  } else if (action === "update" || action === "delete") {
    if (action === "update" && !cfg.update) return { ok: false, message: "Промяна в тази таблица не е позволена." };
    if (action === "delete" && !cfg.canDelete) return { ok: false, message: "Изтриване в тази таблица не е позволено." };
    const wm = cfg.writeMatch!;
    const allowed = Object.assign({}, wm.required, wm.optional || {});
    err = checkMatch(body.match, allowed, wm.arrays || [], Object.keys(wm.required));
    if (err) return { ok: false, message: err };
    if (action === "update") {
      // update по списък не е нужен на портала — един ред наведнъж.
      if (Object.values(body.match as object).some(Array.isArray)) return { ok: false, message: "update е по един ред." };
      err = checkFields(body.fields, cfg.update!);
      if (err) return { ok: false, message: err };
    } else if (body.fields !== undefined && body.fields !== null) {
      return { ok: false, message: "fields не се подава при delete." };
    }
  } else {
    return { ok: false, message: "Непознато действие." };
  }

  return {
    ok: true,
    cmd: {
      table,
      action,
      match: (body.match || {}) as Cmd["match"],
      messagePrefix,
      fields: action === "insert" || action === "update" ? body.fields as Record<string, unknown> : null,
    },
  };
}

// Минималното от supabase-js, което ползваме — за да се подменя в теста.
type DbError = { message: string; code?: string; details?: string; hint?: string };
type DbResult = { data: unknown; error: DbError | null; status?: number };
// deno-lint-ignore no-explicit-any
export type Db = { from(table: string): any };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Текстът е този, който PostgREST връща (supabase-js го подава непроменен),
// за да остане sbErrMsg в клиента смислен (напр. 23505 при дубликат).
function dbFail(r: DbResult) {
  const e = r.error!;
  const status = r.status && r.status >= 400 ? r.status : 500;
  return json({ ok: false, message: e.message, code: e.code, details: e.details, hint: e.hint }, status);
}

// % _ \ в префикса се търсят буквално.
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

// deno-lint-ignore no-explicit-any
function applyMatch(q: any, match: Cmd["match"]): any {
  for (const k of Object.keys(match)) {
    const v = match[k];
    q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
  }
  return q;
}

export async function handleNotifyAdmin(req: Request, getDb: () => Db): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request", message: "Невалидна заявка." }, 400);
  }

  // 1) Пропускът — преди всичко друго. Невалиден/изтекъл → 401, клиентът
  //    отваря модала за повторен вход (kasaReauth) и повтаря веднъж.
  const token = isPlainObject(body) ? body.session : undefined;
  const sess = await verifySession(token);
  if (!sess) return json({ ok: false, reason: "session_expired", message: "Сесията е изтекла — влез отново." }, 401);

  // 2) Тялото — без база.
  const v = validate(body);
  if (!v.ok) return json({ ok: false, reason: "bad_request", message: v.message }, 400);
  const cmd = v.cmd;
  const cfg = TABLES[cmd.table];

  // Бърз отказ по ролята от пропуска — без да се отваря базата.
  if (cfg.roles.indexOf(sess.role) < 0) {
    return json({ ok: false, reason: "forbidden", message: "Нямате права за тази операция." }, 403);
  }

  try {
    const db = getDb();
    // 3) Ролята и активността — от users в момента, не от пропуска (12 ч).
    const u: DbResult = await db.from("users").select("role,active").eq("id", sess.uid).limit(1);
    if (u.error) return dbFail(u);
    const row = Array.isArray(u.data) && u.data.length ? u.data[0] as { role?: string; active?: boolean } : null;
    if (!row || row.active === false || cfg.roles.indexOf(String(row.role)) < 0) {
      return json({ ok: false, reason: "forbidden", message: "Нямате права за тази операция." }, 403);
    }

    const t = db.from(cmd.table);
    const isSched = cmd.table === "notification_schedules";

    if (cmd.action === "list") {
      let q = applyMatch(t.select("*"), cmd.match);
      if (cmd.messagePrefix) q = q.like("message", likeEscape(cmd.messagePrefix) + "%");
      for (const o of cfg.order) q = q.order(o.col, { ascending: o.asc });
      const r: DbResult = await q;
      if (r.error) return dbFail(r);
      return json({ ok: true, rows: Array.isArray(r.data) ? r.data : [] }, 200);
    }

    if (cmd.action === "insert") {
      const r: DbResult = await t.insert(cmd.fields).select("*");
      if (r.error) return dbFail(r);
      console.log(JSON.stringify({ notify_admin: cmd.table, action: cmd.action, role: row.role, count: 1 }));
      return json({ ok: true, rows: Array.isArray(r.data) ? r.data : [] }, 200);
    }

    let q = cmd.action === "update" ? t.update(cmd.fields) : t.delete();
    q = applyMatch(q, cmd.match);
    if (isSched) q = q.in("entity_type", SCHEDULE_ENTITY_TYPES as unknown as string[]);
    const r: DbResult = await q.select(cfg.pk);
    if (r.error) return dbFail(r);
    const n = Array.isArray(r.data) ? r.data.length : 0;
    console.log(JSON.stringify({ notify_admin: cmd.table, action: cmd.action, role: row.role, count: n }));
    return json({ ok: true, count: n }, 200);
  } catch (e) {
    console.error("notify-admin error:", e);
    return json({ ok: false, message: "Вътрешна грешка." }, 500);
  }
}
