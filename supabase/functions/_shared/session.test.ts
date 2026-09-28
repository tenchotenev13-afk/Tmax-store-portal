// supabase/functions/_shared/session.test.ts
// deno test supabase/functions/_shared/session.test.ts --allow-env
import { signSession, verifySession, requireAdmin, SESSION_TTL_SECONDS } from "./session.ts";

const SECRET = "test-secret-" + "x".repeat(48);
const CLAIMS = { uid: "u-123", role: "admin", email: "a@b.bg" };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function flip(s: string, i: number): string {
  return s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);
}
function withSecret(v: string | null, fn: () => Promise<void>) {
  return async () => {
    const prev = Deno.env.get("PORTAL_SESSION_SECRET");
    if (v === null) Deno.env.delete("PORTAL_SESSION_SECRET");
    else Deno.env.set("PORTAL_SESSION_SECRET", v);
    try { await fn(); } finally {
      if (prev === undefined) Deno.env.delete("PORTAL_SESSION_SECRET");
      else Deno.env.set("PORTAL_SESSION_SECRET", prev);
    }
  };
}

Deno.test("sign → verify връща същите uid/role/email и exp = iat + 12ч", withSecret(SECRET, async () => {
  const t = await signSession(CLAIMS);
  assert(t.split(".").length === 2, "точно една точка");
  const p = await verifySession(t);
  assert(p !== null, "verify върна null за валиден пропуск");
  assert(p.uid === "u-123" && p.role === "admin" && p.email === "a@b.bg", "claims не съвпадат");
  assert(p.exp - p.iat === SESSION_TTL_SECONDS && SESSION_TTL_SECONDS === 43200, "exp != iat + 12ч");
}));

Deno.test("сменен символ в payload → null", withSecret(SECRET, async () => {
  const [p, s] = (await signSession(CLAIMS)).split(".");
  assert((await verifySession(flip(p, 5) + "." + s)) === null, "подменен payload мина");
}));

// Сменената буква по-горе обикновено чупи JSON-а и дава null и без подпис.
// Тук payload-ът е валиден JSON с друга роля — хваща го само подписът.
Deno.test("валиден, но подправен payload (role → admin) → null", withSecret(SECRET, async () => {
  const [p, s] = (await signSession({ ...CLAIMS, role: "store" })).split(".");
  const obj = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4)));
  obj.role = "admin";
  const forged = btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert(forged !== p, "подправката не промени payload-а");
  assert((await verifySession(forged + "." + s)) === null, "подправена роля мина");
}));

Deno.test("сменен символ в подписа → null", withSecret(SECRET, async () => {
  const [p, s] = (await signSession(CLAIMS)).split(".");
  assert((await verifySession(p + "." + flip(s, 10))) === null, "подменен подпис мина");
}));

Deno.test("изтекъл exp → null; точно на границата → null; секунда преди → валиден", withSecret(SECRET, async () => {
  const iat = 1_700_000_000;
  const t = await signSession(CLAIMS, iat);
  assert((await verifySession(t, iat + SESSION_TTL_SECONDS - 1)) !== null, "секунда преди exp трябва да е валиден");
  assert((await verifySession(t, iat + SESSION_TTL_SECONDS)) === null, "точно на exp трябва да е null");
  assert((await verifySession(t, iat + SESSION_TTL_SECONDS + 3600)) === null, "изтекъл мина");
}));

Deno.test("друг секрет → null", async () => {
  let t = "";
  await withSecret(SECRET, async () => { t = await signSession(CLAIMS); })();
  await withSecret("друг-секрет-" + "y".repeat(48), async () => {
    assert((await verifySession(t)) === null, "пропуск с чужд секрет мина");
  })();
});

Deno.test("липсващ секрет → sign хвърля, verify връща null", async () => {
  let t = "";
  await withSecret(SECRET, async () => { t = await signSession(CLAIMS); })();
  await withSecret(null, async () => {
    let threw = false;
    try { await signSession(CLAIMS); } catch { threw = true; }
    assert(threw, "sign без секрет не хвърли");
    assert((await verifySession(t)) === null, "verify без секрет не върна null");
  })();
});

Deno.test("грешен формат → null", withSecret(SECRET, async () => {
  for (const bad of [null, undefined, 42, "", "abc", "a.b.c", ".x", "x.", "!!!.???"]) {
    assert((await verifySession(bad)) === null, "грешен формат мина: " + String(bad));
  }
}));

// ── requireAdmin(body) ──────────────────────────────────────────────────
Deno.test("requireAdmin: валиден admin → payload", withSecret(SECRET, async () => {
  const p = await requireAdmin({ user_id: "x", session: await signSession(CLAIMS) });
  assert(p !== null && p.uid === "u-123" && p.role === "admin", "валиден admin не мина");
}));

Deno.test("requireAdmin: валиден пропуск, но не-admin → null", withSecret(SECRET, async () => {
  for (const role of ["store", "accounting", "manager", "Admin", ""]) {
    const s = await signSession({ ...CLAIMS, role });
    assert((await verifySession(s)) !== null, "пропускът сам по себе си трябва да е валиден: " + role);
    assert((await requireAdmin({ session: s })) === null, "не-admin мина: '" + role + "'");
  }
}));

Deno.test("requireAdmin: липсващ пропуск / тяло → null", withSecret(SECRET, async () => {
  for (const body of [{}, { session: null }, { session: "" }, null, undefined, "низ", 42, { role: "admin" }]) {
    assert((await requireAdmin(body)) === null, "мина без пропуск: " + JSON.stringify(body));
  }
}));

Deno.test("requireAdmin: подправен пропуск (store → admin) → null", withSecret(SECRET, async () => {
  const [p, s] = (await signSession({ ...CLAIMS, role: "store" })).split(".");
  const obj = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4)));
  obj.role = "admin";
  const forged = btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert((await requireAdmin({ session: forged + "." + s })) === null, "подправена роля мина");
}));

Deno.test("requireAdmin: изтекъл admin → null; секунда преди → payload", withSecret(SECRET, async () => {
  const iat = 1_700_000_000;
  const s = await signSession(CLAIMS, iat);
  assert((await requireAdmin({ session: s }, iat + SESSION_TTL_SECONDS - 1)) !== null, "секунда преди exp трябва да мине");
  assert((await requireAdmin({ session: s }, iat + SESSION_TTL_SECONDS)) === null, "изтекъл admin мина");
}));

Deno.test("requireAdmin: без секрет → null", async () => {
  let s = "";
  await withSecret(SECRET, async () => { s = await signSession(CLAIMS); })();
  await withSecret(null, async () => {
    assert((await requireAdmin({ session: s })) === null, "мина без секрет на сървъра");
  })();
});
