// supabase/functions/grafik-api/repo.live-test.ts
// РЪЧЕН тест на repo.ts срещу ЖИВАТА база — не е в npm test и не е в CI.
// Пише в живата база (обект Кърджали, месец 2099-01) и трие всичко създадено;
// накрая сверява броя редове преди и след. Без HTTP и без пропуск.
//
//   SUPABASE_URL=https://xiwkdiqqplgdcrkewgtv.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<от supabase projects api-keys, не се печата> \
//   deno run --allow-env --allow-net supabase/functions/grafik-api/repo.live-test.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { makeRepo } from "./repo.ts";

const STORE = "Кърджали", MONTH = "2099-01-01", MARK = "ТЕСТ-2099";
const raw = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const repo = makeRepo();
let fails = 0;
function check(c: boolean, msg: string, extra?: unknown) {
  console.log((c ? "  ✅ " : "  ❌ ") + msg + (extra !== undefined ? " — " + JSON.stringify(extra) : ""));
  if (!c) fails++;
}
async function counts() {
  const out: Record<string, number> = {};
  for (const t of ["grafik_months", "grafik_rows", "grafik_staff", "companies", "grafik_store_company"]) {
    const r = await raw.from(t).select("*", { count: "exact", head: true });
    if (r.error) throw new Error(t + ": " + r.error.message);
    out[t] = r.count ?? -1;
  }
  return out;
}

const before = await counts();
console.log("ПРЕДИ:", JSON.stringify(before));
const created: { staff: string[]; month: string | null } = { staff: [], month: null };
try {
  const st = await repo.getSettings(["grafik_beta_users", "grafik_trz_users", "няма_такъв"]);
  check(!!st.grafik_beta_users && !!st.grafik_trz_users && !("няма_такъв" in st), "getSettings — двата ключа, без непознатия");

  const names = await repo.storeNames();
  check(names.indexOf(STORE) >= 0 && names.indexOf("Гоце Делчев") >= 0, "storeNames — с кирилица и интервал", names.length);

  const u = await repo.getUser("00000000-0000-0000-0000-000000000000");
  check(u === null, "getUser — непознат uid → null");

  const a = await repo.insertStaff({ store_name: STORE, short_name: MARK + " А", full_name: MARK + " Първи", hours_per_day: 8, created_by: "repo.live-test" });
  const b = await repo.insertStaff({ store_name: STORE, short_name: MARK + " Б", full_name: MARK + " Втори", hours_per_day: 4, created_by: "repo.live-test" });
  created.staff.push(a.id, b.id);
  check(!!a.id && b.hours_per_day == 4, "insertStaff ×2");

  let constraint = "";
  try { await repo.insertStaff({ store_name: STORE, short_name: MARK, full_name: MARK, position: "Невалидна" }); }
  catch (e) { constraint = (e as { reason?: string }).reason || "друго"; }
  check(constraint === "db_constraint", "CHECK по position → HttpError db_constraint", constraint);

  const upd = await repo.updateStaff(a.id, { note: "бележка", updated_by: "repo.live-test" });
  check(!!upd && upd.note === "бележка", "updateStaff");
  check((await repo.updateStaff("00000000-0000-4000-8000-000000000000", { note: "x" })) === null, "updateStaff — няма го → null");
  check((await repo.getStaff([a.id, b.id])).length === 2, "getStaff ×2");

  const m1 = await repo.ensureMonth(STORE, MONTH);
  created.month = m1.id;
  const m2 = await repo.ensureMonth(STORE, MONTH);
  check(m1.id === m2.id && m1.status === "draft", "ensureMonth ×2 → същият ред (upsert ignoreDuplicates)", m1.status);
  const mc = await raw.from("grafik_months").select("id", { count: "exact", head: true }).eq("store_name", STORE).eq("month", MONTH);
  check(mc.count === 1, "точно един ред за Кърджали 2099-01", mc.count);

  const L = (v: string) => { const x = new Array(31).fill(""); x[0] = v; x[1] = "9"; return x; };
  await repo.upsertRows([
    { month_id: m1.id, staff_id: a.id, letters: L("П"), locked: {}, updated_by: "repo.live-test" },
    { month_id: m1.id, staff_id: b.id, letters: L("ЛД"), locked: { "2": "Д4/З" }, updated_by: "repo.live-test" },
  ]);
  await repo.upsertRows([{ month_id: m1.id, staff_id: a.id, letters: L("В"), locked: {}, updated_by: "repo.live-test 2" }]);
  const rows = await repo.listRows(m1.id);
  const ra = rows.filter((r) => r.staff_id === a.id)[0], rb = rows.filter((r) => r.staff_id === b.id)[0];
  check(rows.length === 2 && ra.letters[0] === "В" && ra.letters[1] === "9" && ra.updated_by === "repo.live-test 2", "upsertRows — презаписва по (month_id, staff_id), не дублира", rows.length);
  check(rb.locked["2"] === "Д4/З" && rb.sort_order === 0, "locked и default sort_order");
  const rs = (await repo.rowStats([m1.id]))[m1.id];
  check(!!rs && rs.rows === 2 && rs.last_by === "repo.live-test 2" && !!rs.last_at, "rowStats — брой и последната промяна (кой)", rs);
  const un = await repo.userNames(["ten.tenev@temax.bg", "nyama@nikoj.bg"]);
  check(!!un["ten.tenev@temax.bg"] && !un["nyama@nikoj.bg"], "userNames — име по имейл; непознат → няма", Object.keys(un));

  const lm = await repo.listMonths(MONTH, [STORE, "Гоце Делчев"]);
  check(lm.length === 1 && lm[0].store_name === STORE && "snapshot" in lm[0], "listMonths с in() по кирилски имена (носи snapshot)", lm.length);
  check((await repo.listMonths(MONTH, [])).length === 0, "listMonths с празен списък → нищо");
  check((await repo.staffCounts([STORE, "Гоце Делчев"]))[STORE] >= 2, "staffCounts с in()");

  const ok1 = await repo.updateMonth(m1.id, { status: "submitted", submitted_by: "repo.live-test", snapshot: { rows: [] } }, "draft");
  const ok2 = await repo.updateMonth(m1.id, { status: "submitted" }, "draft");
  check(ok1 && !ok2, "submit: draft → submitted; повторно → false (условие по статус)");
  const g = await repo.getMonth(STORE, MONTH);
  check(!!g && g.status === "submitted" && (g.snapshot as { rows: unknown[] }).rows.length === 0, "getMonth след submit");
  const ok3 = await repo.updateMonth(m1.id, { status: "draft", snapshot: null, submitted_by: null }, "submitted");
  check(ok3 && (await repo.getMonth(STORE, MONTH))!.status === "draft", "reopen: submitted → draft");

  const setup = await repo.setupRaw(STORE);
  // 61 = 40 общи + 21 за 4-часов договор (миграция 20261102095558); сектори и labels — 20261103135820.
  check(setup.storeCompany.length >= 1 && setup.codes.length === 35 && setup.letterMap.length === 61 && setup.seasons.length === 2, "setupRaw — обект, 35 кода, 61 букви, 2 сезона",
    [setup.storeCompany.length, setup.codes.length, setup.letterMap.length, setup.seasons.length]);
  const secs = setup.sectors || [];
  check(secs.length === 14 && secs.every((x) => x.store_name === STORE) && secs.some((x) => x.name === "Хигиена"), "setupRaw — секторите на Кърджали (14, вкл. Хигиена)", secs.length);
  check(setup.seasons.every((x) => !!x.labels), "setupRaw — сезоните носят labels");
  const sec0 = await repo.getSector(secs[0].id);
  check(!!sec0 && sec0.id === secs[0].id && sec0.store_name === STORE, "getSector");
  check((await repo.getSector("00000000-0000-4000-8000-000000000000")) === null, "getSector — непознат → null");
  const letters = await repo.letterSet();
  check(letters.length === 10 && letters.indexOf("ЛД") >= 0 && letters.indexOf("НО") >= 0, "letterSet — 10 букви", letters.length);
  check((await repo.adminList("grafik_extra_days")).length >= 0, "adminList");

  // audit() НЕ се пробва тук: audit_log се тегли от огледалото на Живко и
  // изтриването може да не стигне до него. Проверява се при първото истинско „Подай“.
} catch (e) {
  fails++;
  console.log("  ❌ хвърли:", (e as Error).message);
} finally {
  // Почистване — всичко създадено, в обратен ред.
  if (created.month) {
    await raw.from("grafik_rows").delete().eq("month_id", created.month);
    await raw.from("grafik_months").delete().eq("id", created.month);
  }
  if (created.staff.length) await raw.from("grafik_staff").delete().in("id", created.staff);
  const left = await raw.from("grafik_staff").select("id", { count: "exact", head: true }).like("short_name", MARK + "%");
  check(left.count === 0, "няма останали тестови служители", left.count);
}
const after = await counts();
console.log("СЛЕД: ", JSON.stringify(after));
check(JSON.stringify(before) === JSON.stringify(after), "броят редове преди = след");
console.log(fails ? "❌ ПАДАЩИ: " + fails : "✅ всичко минава");
Deno.exit(fails ? 1 : 0);
