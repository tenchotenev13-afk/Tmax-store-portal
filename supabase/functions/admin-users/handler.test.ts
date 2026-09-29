// supabase/functions/admin-users/handler.test.ts
// deno test supabase/functions/admin-users/handler.test.ts --allow-env
import {
  CREATE_FIELDS, UPDATE_FIELDS, validateAdminUsers, handleAdminUsers, type Db,
} from "./handler.ts";
import { signSession } from "../_shared/session.ts";

const SECRET = "test-secret-" + "x".repeat(48);
Deno.env.set("PORTAL_SESSION_SECRET", SECRET);

const UID = "b781c52b-bbeb-476a-bc9a-ac9d37e3f899";
const FORBIDDEN_ALWAYS = ["password", "password_hash", "history_pin_hash", "id", "created_at"];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const bad = (b: unknown) => validateAdminUsers(b).ok === false;
const good = (b: unknown) => validateAdminUsers(b).ok === true;

// ── validateAdminUsers ──────────────────────────────────────────────────
Deno.test("create: всяко разрешено поле минава поотделно и заедно", () => {
  for (const k of CREATE_FIELDS) assert(good({ action: "create", fields: { [k]: "x" } }), "create отказа " + k);
  assert(good({ action: "create", fields: { email: "a@b.bg", display_name: "А", store_name: "Раднево", role: "user", active: true } }),
    "create отказа пълния набор");
});

Deno.test("update: всяко разрешено поле минава поотделно и заедно", () => {
  for (const k of UPDATE_FIELDS) assert(good({ action: "update", id: UID, fields: { [k]: null } }), "update отказа " + k);
  const all: Record<string, unknown> = {};
  for (const k of UPDATE_FIELDS) all[k] = null;
  assert(good({ action: "update", id: UID, fields: all }), "update отказа пълния набор");
});

Deno.test("delete с валиден uuid минава", () => {
  assert(good({ action: "delete", id: UID }), "delete отказа");
  assert(good({ action: "delete", id: UID.toUpperCase() }), "uuid с главни букви отказан");
});

Deno.test("забранени полета → грешка (сами и скрити сред разрешени)", () => {
  for (const k of FORBIDDEN_ALWAYS) {
    assert(bad({ action: "create", fields: { email: "a@b.bg", [k]: "x" } }), "create прие " + k);
    assert(bad({ action: "update", id: UID, fields: { display_name: "А", [k]: "x" } }), "update прие " + k);
  }
  assert(bad({ action: "update", id: UID, fields: { email: "друг@b.bg" } }), "update прие email");
  for (const k of ["is_regional", "assigned_stores", "oborot_report", "notify_groups"]) {
    assert(bad({ action: "create", fields: { email: "a@b.bg", [k]: true } }), "create прие " + k);
  }
});

Deno.test("password_hash — изрично (обектът на контролата)", () => {
  const r = validateAdminUsers({ action: "update", id: UID, fields: { password_hash: "$2a$10$x" } });
  assert(r.ok === false, "password_hash мина през белия списък");
});

Deno.test("невалиден uuid → грешка", () => {
  for (const id of [undefined, null, "", "u-1", "123", UID + "0", UID.slice(1), "' or 1=1 --", 42, "eq." + UID]) {
    assert(bad({ action: "update", id, fields: { display_name: "А" } }), "update прие id " + String(id));
    assert(bad({ action: "delete", id }), "delete прие id " + String(id));
  }
});

Deno.test("непознат action / липсващ / грешна форма → грешка", () => {
  for (const action of [undefined, "", "upsert", "DELETE", "select", "rpc"]) {
    assert(bad({ action, id: UID, fields: { display_name: "А" } }), "прие action " + String(action));
  }
  for (const b of [null, undefined, "низ", 42, [], [{ action: "delete", id: UID }]]) assert(bad(b), "прие тяло " + JSON.stringify(b));
});

Deno.test("fields: празен, масив, не-обект → грешка; id при create, fields при delete → грешка", () => {
  for (const f of [undefined, null, {}, [], "x", ["display_name"]]) {
    assert(bad({ action: "update", id: UID, fields: f }), "update прие fields " + JSON.stringify(f));
    assert(bad({ action: "create", fields: f }), "create прие fields " + JSON.stringify(f));
  }
  assert(bad({ action: "create", id: UID, fields: { email: "a@b.bg" } }), "create прие id");
  assert(bad({ action: "delete", id: UID, fields: { display_name: "А" } }), "delete прие fields");
});

// ── handleAdminUsers: пропускът е ПРЕДИ базата ─────────────────────────
type Call = { op: string; args: unknown[] };
function fakeDb(result: { data: unknown; error: unknown; status?: number }) {
  const calls: Call[] = [];
  let opened = 0;
  const chain: Record<string, unknown> = {};
  for (const op of ["insert", "update", "delete", "eq", "select"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return op === "select" ? Promise.resolve(result) : chain;
    };
  }
  const db: Db = { from: (t: string) => { calls.push({ op: "from", args: [t] }); return chain; } };
  return { calls, opened: () => opened, getDb: () => { opened++; return db; } };
}
function req(body: unknown) {
  return new Request("http://x/admin-users", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
}
const admin = () => signSession({ uid: "adm", role: "admin", email: "a@temax.bg" });

Deno.test("без пропуск / не-admin / подправен → 403 и базата НЕ се отваря", async () => {
  const store = await signSession({ uid: "s", role: "store", email: "s@temax.bg" });
  const [p, s] = store.split(".");
  const obj = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4)));
  obj.role = "admin";
  const forged = btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") + "." + s;
  for (const session of [undefined, null, "", store, forged, "abc.def"]) {
    const f = fakeDb({ data: [{ id: UID }], error: null });
    const r = await handleAdminUsers(req({ session, action: "delete", id: UID }), f.getDb);
    const b = await r.json();
    assert(r.status === 403 && b.reason === "forbidden", "очаквах 403 за session " + String(session).slice(0, 20) + ", дойде " + r.status);
    assert(f.opened() === 0 && f.calls.length === 0, "базата е отворена без админски пропуск");
  }
});

Deno.test("админ + невалидно тяло → 400 и базата НЕ се отваря", async () => {
  const session = await admin();
  for (const body of [
    { session, action: "update", id: UID, fields: { password_hash: "x" } },
    { session, action: "delete", id: "u-1" },
    { session, action: "upsert", id: UID },
  ]) {
    const f = fakeDb({ data: [], error: null });
    const r = await handleAdminUsers(req(body), f.getDb);
    assert(r.status === 400, "очаквах 400, дойде " + r.status);
    assert(f.opened() === 0, "базата е отворена при невалидно тяло");
  }
});

Deno.test("админ: create → id; update/delete → count; 0 реда → 404", async () => {
  const session = await admin();
  let f = fakeDb({ data: [{ id: UID }], error: null, status: 201 });
  let r = await handleAdminUsers(req({ session, action: "create", fields: { email: "n@temax.bg", role: "user" } }), f.getDb);
  let b = await r.json();
  assert(r.status === 200 && b.ok === true && b.id === UID, "create: " + JSON.stringify(b));
  assert(f.calls.some((c) => c.op === "insert" && JSON.stringify(c.args[0]) === '{"email":"n@temax.bg","role":"user"}'), "insert с друго тяло");
  assert(!("session" in (f.calls.find((c) => c.op === "insert")!.args[0] as object)), "session стигна до базата");

  f = fakeDb({ data: [{ id: UID }], error: null });
  r = await handleAdminUsers(req({ session, action: "update", id: UID, fields: { notify_groups: [] } }), f.getDb);
  b = await r.json();
  assert(r.status === 200 && b.count === 1, "update: " + JSON.stringify(b));
  assert(f.calls.some((c) => c.op === "eq" && c.args[0] === "id" && c.args[1] === UID), "update без eq(id)");

  for (const action of ["update", "delete"]) {
    f = fakeDb({ data: [], error: null });
    const body = action === "update" ? { session, action, id: UID, fields: { active: false } } : { session, action, id: UID };
    r = await handleAdminUsers(req(body), f.getDb);
    b = await r.json();
    assert(r.status === 404 && b.reason === "not_found", action + " с 0 реда: " + r.status);
  }
});

Deno.test("грешка от базата → текстът на PostgREST и неговият статус", async () => {
  const session = await admin();
  const f = fakeDb({ data: null, error: { message: 'new row for relation "users" violates check constraint "users_oborot_report_chk"', code: "23514" }, status: 400 });
  const r = await handleAdminUsers(req({ session, action: "update", id: UID, fields: { oborot_report: "" } }), f.getDb);
  const b = await r.json();
  assert(r.status === 400 && b.ok === false && b.message.indexOf("users_oborot_report_chk") >= 0 && b.code === "23514", JSON.stringify(b));
});

Deno.test("OPTIONS → 200 без база; GET → 405; счупен JSON → 400", async () => {
  const f = fakeDb({ data: [], error: null });
  assert((await handleAdminUsers(new Request("http://x", { method: "OPTIONS" }), f.getDb)).status === 200, "OPTIONS");
  assert((await handleAdminUsers(new Request("http://x", { method: "GET" }), f.getDb)).status === 405, "GET");
  assert((await handleAdminUsers(req("{не е json"), f.getDb)).status === 400, "счупен JSON");
  assert(f.opened() === 0, "базата е отворена");
});
