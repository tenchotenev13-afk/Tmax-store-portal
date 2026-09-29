// supabase/functions/admin-users/handler.ts
// Записите в users от Администрация (етап 3 от затварянето на users).
// Тук е цялата логика; index.ts само вдига сървъра с истинския клиент.
// Разделено е, за да се тества без мрежа и без база (handler.test.ts).
import { requireAdmin } from "../_shared/session.ts";

// Бели списъци. Нищо извън тях не стига до базата — нито password,
// password_hash, history_pin_hash, нито email при update.
export const CREATE_FIELDS = ["email", "display_name", "store_name", "role", "active"] as const;
export const UPDATE_FIELDS = [
  "display_name", "store_name", "role", "active",
  "assigned_stores", "oborot_report", "is_regional", "notify_groups",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminUsersCmd =
  | { action: "create"; fields: Record<string, unknown> }
  | { action: "update"; id: string; fields: Record<string, unknown> }
  | { action: "delete"; id: string };

export type Validated = { ok: true; cmd: AdminUsersCmd } | { ok: false; message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function checkFields(fields: unknown, allowed: readonly string[]): string | null {
  if (!isPlainObject(fields)) return "fields трябва да е обект.";
  const keys = Object.keys(fields);
  if (!keys.length) return "fields е празен.";
  const bad = keys.filter((k) => allowed.indexOf(k) < 0);
  if (bad.length) return "Непозволено поле: " + bad.join(", ") + ".";
  return null;
}

// Чиста функция: без мрежа, без база. Стойностите (role, oborot_report, …)
// НЕ се валидират тук — решава базата, както при директния запис досега.
export function validateAdminUsers(body: unknown): Validated {
  if (!isPlainObject(body)) return { ok: false, message: "Невалидна заявка." };
  const action = body.action;
  if (action === "create") {
    if (body.id !== undefined && body.id !== null) return { ok: false, message: "id не се подава при create." };
    const err = checkFields(body.fields, CREATE_FIELDS);
    if (err) return { ok: false, message: err };
    return { ok: true, cmd: { action, fields: body.fields as Record<string, unknown> } };
  }
  if (action === "update" || action === "delete") {
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) return { ok: false, message: "Невалиден id." };
    if (action === "delete") {
      if (body.fields !== undefined && body.fields !== null) return { ok: false, message: "fields не се подава при delete." };
      return { ok: true, cmd: { action, id: body.id } };
    }
    const err = checkFields(body.fields, UPDATE_FIELDS);
    if (err) return { ok: false, message: err };
    return { ok: true, cmd: { action, id: body.id, fields: body.fields as Record<string, unknown> } };
  }
  return { ok: false, message: "Непознато действие." };
}

// Минималното от supabase-js, което ползваме — за да се подменя в теста.
type DbResult = { data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null; status?: number };
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

// Грешка от базата: текстът е този, който PostgREST връща и днес
// (supabase-js го подава непроменен), за да остане sbErrMsg в клиента смислен.
function dbFail(r: DbResult) {
  const e = r.error!;
  const status = r.status && r.status >= 400 ? r.status : 500;
  return json({ ok: false, message: e.message, code: e.code, details: e.details, hint: e.hint }, status);
}

const NOT_FOUND = { ok: false, reason: "not_found", message: "Потребителят не е намерен." };

export async function handleAdminUsers(req: Request, getDb: () => Db): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request", message: "Невалидна заявка." }, 400);
  }

  // Първо пропускът — преди валидацията и преди базата.
  if (!(await requireAdmin(body))) {
    return json({ ok: false, reason: "forbidden", message: "Нямате права за тази операция." }, 403);
  }

  const v = validateAdminUsers(body);
  if (!v.ok) return json({ ok: false, reason: "bad_request", message: v.message }, 400);
  const cmd = v.cmd;

  try {
    const users = getDb().from("users");
    if (cmd.action === "create") {
      const r: DbResult = await users.insert(cmd.fields).select("id");
      if (r.error) return dbFail(r);
      const rows = Array.isArray(r.data) ? r.data as { id: string }[] : [];
      if (!rows.length || !rows[0].id) return json({ ok: false, message: "Записът не върна id." }, 500);
      return json({ ok: true, id: rows[0].id }, 200);
    }
    const q = cmd.action === "update" ? users.update(cmd.fields) : users.delete();
    const r: DbResult = await q.eq("id", cmd.id).select("id");
    if (r.error) return dbFail(r);
    const n = Array.isArray(r.data) ? r.data.length : 0;
    if (n === 0) return json(NOT_FOUND, 404);
    return json({ ok: true, count: n }, 200);
  } catch (e) {
    console.error("admin-users error:", e);
    return json({ ok: false, message: "Вътрешна грешка." }, 500);
  }
}
