// supabase/functions/notify-admin/handler.test.ts
// deno test supabase/functions/notify-admin/handler.test.ts --allow-env
import { handleNotifyAdmin, validate, TABLES, SCHEDULE_ENTITY_TYPES, type Db } from "./handler.ts";
import { signSession } from "../_shared/session.ts";

const SECRET = "test-secret-" + "y".repeat(48);
Deno.env.set("PORTAL_SESSION_SECRET", SECRET);

const ID = "b781c52b-bbeb-476a-bc9a-ac9d37e3f899";
const ID2 = "0a5e2c11-1111-4222-8333-944455556666";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type Call = { table: string; op: string; args: unknown[] };
type Res = { data: unknown; error: unknown; status?: number };

// Фалшив supabase-js: веригата е thenable; резултатът е по таблица.
function fakeDb(results: Record<string, Res>) {
  const calls: Call[] = [];
  let opened = 0;
  const db: Db = {
    from(table: string) {
      calls.push({ table, op: "from", args: [] });
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "delete", "eq", "in", "like", "order", "limit"]) {
        chain[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return chain; };
      }
      chain.then = (ok: (r: Res) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(results[table] || { data: [], error: null }).then(ok, bad);
      return chain;
    },
  };
  return { calls, opened: () => opened, getDb: () => { opened++; return db; } };
}
const users = (role: string, active = true): Res => ({ data: [{ role, active }], error: null });

function req(body: unknown) {
  return new Request("http://x/notify-admin", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
}
const sess = (role: string) => signSession({ uid: ID2, role, email: role + "@temax.bg" });

// ── validate ────────────────────────────────────────────────────────────
Deno.test("validate: непозната таблица и действие → грешка", () => {
  assert(!validate({ table: "users", action: "list" }).ok, "users мина");
  assert(!validate({ table: "audit_log", action: "list" }).ok, "audit_log мина");
  assert(!validate({ table: "report_recipients", action: "upsert" }).ok, "upsert мина");
  assert(!validate({ table: "report_recipients", action: "truncate" }).ok, "truncate мина");
});

Deno.test("validate: полета извън белия списък → грешка, всяко разрешено → минава", () => {
  for (const [t, cfg] of Object.entries(TABLES)) {
    for (const k of cfg.insert || []) {
      const f: Record<string, unknown> = { [k]: "x" };
      if (t === "notification_schedules") { f.entity_type = "task"; f.schedule_type = "once"; }
      assert(validate({ table: t, action: "insert", fields: f }).ok, t + ": insert отказа " + k);
    }
    const bad = validate({ table: t, action: "insert", fields: { id: ID } });
    assert(!bad.ok, t + ": insert прие id");
  }
  assert(!validate({ table: "report_recipients", action: "update", match: { id: ID }, fields: { email: "x@y" } }).ok,
    "update на email в report_recipients мина");
  assert(!validate({ table: "notification_topics", action: "update", match: { key: "k" }, fields: { last_run_at: "x" } }).ok,
    "update на last_run_at мина");
  assert(!validate({ table: "notification_topics", action: "insert", fields: { key: "k" } }).ok, "insert в topics мина");
  assert(!validate({ table: "notification_topics", action: "delete", match: { key: "k" } }).ok, "delete в topics мина");
  assert(!validate({ table: "notification_overrides", action: "update", match: { id: ID }, fields: { note: "x" } }).ok, "update в overrides мина");
});

Deno.test("validate: update/delete без задължителния филтър → грешка (никога цялата таблица)", () => {
  assert(!validate({ table: "report_recipients", action: "delete" }).ok, "delete без match");
  assert(!validate({ table: "report_recipients", action: "delete", match: {} }).ok, "delete с празен match");
  assert(!validate({ table: "report_recipients", action: "delete", match: { id: "1" } }).ok, "delete с невалиден uuid");
  assert(!validate({ table: "notification_matrix", action: "delete", match: { topic_key: "a" } }).ok, "matrix delete само с topic_key");
  assert(validate({ table: "notification_matrix", action: "delete", match: { topic_key: "a", group_key: "co" } }).ok, "matrix delete отказан");
  assert(!validate({ table: "report_recipients", action: "delete", match: { id: ID, email: "x" } }).ok, "чужд филтър мина");
  assert(!validate({ table: "notification_schedules", action: "update", match: { id: [ID, ID2] }, fields: { active: true } }).ok,
    "update по списък мина");
  assert(validate({ table: "notification_schedules", action: "delete", match: { id: [ID, ID2] } }).ok, "delete по списък отказан");
  assert(!validate({ table: "report_recipients", action: "delete", match: { id: [ID] } }).ok, "списък там, където не е разрешен");
});

Deno.test("validate: schedules — вид и тип при създаване, message_prefix само там", () => {
  for (const et of SCHEDULE_ENTITY_TYPES) {
    assert(validate({ table: "notification_schedules", action: "insert", fields: { entity_type: et, schedule_type: "once" } }).ok, "отказа " + et);
  }
  assert(!validate({ table: "notification_schedules", action: "insert", fields: { entity_type: "x", schedule_type: "once" } }).ok, "непознат вид мина");
  assert(!validate({ table: "notification_schedules", action: "insert", fields: { entity_type: "task", schedule_type: "daily" } }).ok, "daily мина");
  assert(validate({ table: "notification_schedules", action: "list", match: { entity_type: "task" }, message_prefix: "Нова задача: " }).ok, "prefix отказан");
  assert(!validate({ table: "report_recipients", action: "list", message_prefix: "x" }).ok, "prefix извън schedules");
  assert(!validate({ table: "notification_schedules", action: "list", match: { message: "x" } }).ok, "филтър по message мина");
  assert(!validate({ table: "notification_schedules", action: "list", match: { entity_id: { a: 1 } } }).ok, "обект като стойност мина");
});

// ── handleNotifyAdmin ───────────────────────────────────────────────────
Deno.test("без пропуск / подправен → 401 и базата НЕ се отваря", async () => {
  const store = await sess("admin");
  const [p] = store.split(".");
  for (const session of [undefined, null, "", "abc.def", p + ".xxx"]) {
    const f = fakeDb({});
    const r = await handleNotifyAdmin(req({ session, table: "report_recipients", action: "list" }), f.getDb);
    const b = await r.json();
    assert(r.status === 401 && b.reason === "session_expired", "очаквах 401, дойде " + r.status);
    assert(f.opened() === 0, "базата е отворена без пропуск");
  }
});

Deno.test("роля извън списъка (по пропуска) → 403 без база", async () => {
  for (const role of ["store", "manager", "logistics", "controlling", "supply"]) {
    const session = await sess(role);
    for (const table of Object.keys(TABLES)) {
      const f = fakeDb({});
      const r = await handleNotifyAdmin(req({ session, table, action: "list" }), f.getDb);
      assert(r.status === 403, role + " → " + table + ": " + r.status);
      assert(f.opened() === 0, "базата е отворена за " + role);
    }
  }
  // accounting: само schedules
  const acc = await sess("accounting");
  for (const table of ["report_recipients", "notification_topics", "notification_matrix", "notification_overrides"]) {
    const f = fakeDb({});
    const r = await handleNotifyAdmin(req({ session: acc, table, action: "list" }), f.getDb);
    assert(r.status === 403, "accounting → " + table + ": " + r.status);
  }
});

Deno.test("ролята в users печели над пропуска: свален admin / неактивен → 403", async () => {
  const session = await sess("admin");
  for (const u of [users("store"), users("admin", false), { data: [], error: null }]) {
    const f = fakeDb({ users: u, report_recipients: { data: [{ id: ID }], error: null } });
    const r = await handleNotifyAdmin(req({ session, table: "report_recipients", action: "delete", match: { id: ID } }), f.getDb);
    assert(r.status === 403, "очаквах 403, дойде " + r.status);
    assert(!f.calls.some((c) => c.table === "report_recipients"), "таблицата е пипната");
  }
});

Deno.test("невалидно тяло от admin → 400 и базата НЕ се отваря", async () => {
  const session = await sess("admin");
  for (const body of [
    { session, table: "users", action: "list" },
    { session, table: "report_recipients", action: "delete" },
    { session, table: "report_recipients", action: "insert", fields: { email: "a@temax.bg", id: ID } },
  ]) {
    const f = fakeDb({});
    const r = await handleNotifyAdmin(req(body), f.getDb);
    assert(r.status === 400, "очаквах 400, дойде " + r.status);
    assert(f.opened() === 0, "базата е отворена при невалидно тяло");
  }
});

Deno.test("list: филтри, ред, prefix с екраниране; връща rows", async () => {
  const session = await sess("accounting");
  const rows = [{ id: ID }];
  const f = fakeDb({ users: users("accounting"), notification_schedules: { data: rows, error: null } });
  const r = await handleNotifyAdmin(req({
    session, table: "notification_schedules", action: "list",
    match: { entity_type: "task_report", entity_id: ["1", "2"], active: true }, message_prefix: "50%_x",
  }), f.getDb);
  const b = await r.json();
  assert(r.status === 200 && b.ok && b.rows.length === 1, "list: " + r.status + " " + JSON.stringify(b));
  const c = f.calls.filter((x) => x.table === "notification_schedules");
  assert(c.some((x) => x.op === "eq" && x.args[0] === "entity_type" && x.args[1] === "task_report"), "без eq entity_type");
  assert(c.some((x) => x.op === "in" && x.args[0] === "entity_id"), "без in entity_id");
  assert(c.some((x) => x.op === "eq" && x.args[0] === "active" && x.args[1] === true), "без eq active");
  assert(c.some((x) => x.op === "like" && x.args[1] === "50\\%\\_x%"), "prefix не е екраниран: " + JSON.stringify(c.find((x) => x.op === "like")));
  assert(c.some((x) => x.op === "order" && x.args[0] === "created_at"), "без order");
});

Deno.test("insert: само полетата от тялото, без session; връща rows", async () => {
  const session = await sess("admin");
  const f = fakeDb({ users: users("admin"), report_recipients: { data: [{ id: ID }], error: null } });
  const r = await handleNotifyAdmin(req({ session, table: "report_recipients", action: "insert", fields: { email: "n@temax.bg", daily: true } }), f.getDb);
  assert(r.status === 200, "insert: " + r.status);
  const ins = f.calls.find((c) => c.table === "report_recipients" && c.op === "insert")!;
  assert(JSON.stringify(ins.args[0]) === '{"email":"n@temax.bg","daily":true}', "insert с друго тяло: " + JSON.stringify(ins.args[0]));
});

Deno.test("update/delete: филтрите стигат до заявката; schedules — и по entity_type; count", async () => {
  const session = await sess("accounting");
  const f = fakeDb({ users: users("accounting"), notification_schedules: { data: [{ id: ID }, { id: ID2 }], error: null } });
  const r = await handleNotifyAdmin(req({ session, table: "notification_schedules", action: "delete", match: { id: [ID, ID2], entity_type: "task" } }), f.getDb);
  const b = await r.json();
  assert(r.status === 200 && b.count === 2, "delete: " + r.status + " " + JSON.stringify(b));
  const c = f.calls.filter((x) => x.table === "notification_schedules");
  assert(c.some((x) => x.op === "delete"), "без delete");
  assert(c.some((x) => x.op === "in" && x.args[0] === "id"), "без in id");
  assert(c.some((x) => x.op === "in" && x.args[0] === "entity_type" && (x.args[1] as string[]).length === SCHEDULE_ENTITY_TYPES.length), "без пазача по entity_type");

  const g = fakeDb({ users: users("admin"), notification_matrix: { data: [], error: null } });
  const s2 = await sess("admin");
  const r2 = await handleNotifyAdmin(req({ session: s2, table: "notification_matrix", action: "update", match: { topic_key: "t", group_key: "co" }, fields: { channel: "email" } }), g.getDb);
  const b2 = await r2.json();
  assert(r2.status === 200 && b2.count === 0, "update 0 реда: " + JSON.stringify(b2));
  const c2 = g.calls.filter((x) => x.table === "notification_matrix");
  assert(c2.some((x) => x.op === "eq" && x.args[0] === "topic_key") && c2.some((x) => x.op === "eq" && x.args[0] === "group_key"), "без двата ключа");
});

Deno.test("грешка от базата → статусът и текстът ѝ", async () => {
  const session = await sess("admin");
  const f = fakeDb({
    users: users("admin"),
    notification_overrides: { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" }, status: 409 },
  });
  const r = await handleNotifyAdmin(req({ session, table: "notification_overrides", action: "insert", fields: { user_email: "a@temax.bg", topic_key: "t", mode: "exclude" } }), f.getDb);
  const b = await r.json();
  assert(r.status === 409 && b.code === "23505" && /duplicate/.test(b.message), "грешката не е предадена: " + r.status + " " + JSON.stringify(b));
});
