// supabase/functions/kasa-api/repo.live-test.ts
// РЪЧНА проба на repo.ts + dispatch срещу ЖИВАТА база — не е в npm test и не е в CI.
// САМО ЧЕТЕНЕ: нито един запис, нито едно сваляне на файл (doc_url само подписва).
// Без HTTP и без пропуск: потребителите са синтетични (resolveScope), за да
// се провери обхватът за Кърджали, Раднево и „всички“ (admin).
//
// Ключът — от ЛОКАЛЕН .env (в .gitignore, никога в репото):
//   SUPABASE_URL=https://xiwkdiqqplgdcrkewgtv.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<supabase projects api-keys, не се печата>
//   deno run --env-file=.env --allow-env --allow-net supabase/functions/kasa-api/repo.live-test.ts
//
// Изходът (броеве редове) се сверява на ръка с пряк SQL за същите филтри —
// заявките са в claude/log/2026-11-20-kasa-api-etap1b2.md.
import { makeRepo } from "./repo.ts";
import { dispatch, HttpError, resolveScope, type User } from "./handler.ts";

const DAY = Deno.env.get("KASA_LIVE_DAY") || "2026-11-18";
const FROM = Deno.env.get("KASA_LIVE_FROM") || "2026-10-20";
const TO = Deno.env.get("KASA_LIVE_TO") || "2026-11-19";
const NOW = Date.parse(TO + "T12:00:00Z"); // банерът — 30 дни назад от TO

const repo = makeRepo();
let fails = 0;
const out: Record<string, unknown> = {};
function check(c: boolean, msg: string, extra?: unknown) {
  console.log((c ? "  ✅ " : "  ❌ ") + msg + (extra !== undefined ? " — " + JSON.stringify(extra) : ""));
  if (!c) fails++;
}
const user = (role: string, store: string | null): User =>
  ({ id: "live-test", email: "live-test@nikoj.bg", display_name: null, store_name: store, role, is_regional: false, assigned_stores: null, active: true });
const len = (x: unknown) => (Array.isArray(x) ? x.length : -1);
type K = { kinds: Record<string, { rows: Record<string, unknown>[] }> };

const WHO: [string, User][] = [
  ["Кърджали", user("manager", "Кърджали")],
  ["Раднево", user("manager", "Раднево")],
  ["всички", user("admin", "Централен офис")],
];

try {
  for (const [label, u] of WHO) {
    const sc = resolveScope(u);
    const o: Record<string, unknown> = {};
    // day — само за обект (admin: Кърджали, за да мине през needStore с „всички“)
    const dayStore = label === "всички" ? "Кърджали" : label;
    const d = await dispatch(repo, sc, { action: "day", store: dayStore, date: DAY }, NOW) as Record<string, unknown[]>;
    o.day = { store: dayStore, reports: len(d.reports), glavna: len(d.glavna), zoborot: len(d.zoborot), documents: len(d.documents) };
    check([d.reports, d.glavna, d.zoborot, d.documents].every((a) => (a as Record<string, unknown>[]).every((r) => r.store_name === dayStore)), label + ": day — само " + dayStore);

    const kinds = ["reports", "glavna", "zoborot", "documents", "storno"];
    const r = await dispatch(repo, sc, { action: "range", from: FROM, to: TO, kinds }, NOW) as unknown as K;
    const rr = await dispatch(repo, sc, { action: "range", from: FROM, to: TO, kinds: ["reports", "zoborot", "glavna", "storno"], include_returned: true }, NOW) as unknown as K;
    o.range = Object.fromEntries(kinds.map((k) => [k, r.kinds[k].rows.length]));
    o.range_include_returned = Object.fromEntries(["reports", "zoborot", "glavna", "storno"].map((k) => [k, rr.kinds[k].rows.length]));
    if (label !== "всички") {
      check(kinds.every((k) => r.kinds[k].rows.every((x) => x.store_name === label)), label + ": range — нито един чужд ред");
    }
    // Вложените редове на сторното идват с родителя.
    const st = r.kinds.storno.rows;
    check(st.every((x) => Array.isArray(x.kasa_storno_items)), label + ": range storno — с вложени kasa_storno_items", st.length);

    // storno_items — първото сторно с редове
    const withItems = st.find((x) => (x.kasa_storno_items as unknown[]).length > 0);
    if (withItems) {
      const si = await dispatch(repo, sc, { action: "storno_items", storno_id: withItems.id }, NOW) as { items: unknown[] };
      o.storno_items = { storno_id: withItems.id, items: si.items.length, embedded: (withItems.kasa_storno_items as unknown[]).length };
      check(si.items.length === (withItems.kasa_storno_items as unknown[]).length, label + ": storno_items = вложените редове");
    }

    const b = await dispatch(repo, sc, { action: "banner" }, NOW) as Record<string, unknown>;
    o.banner = { returned_reports: len(b.returned_reports), storno_flagged: b.storno_flagged ?? null };

    if (sc.actions.indexOf("report_rows") >= 0) {
      const rd = await dispatch(repo, sc, { action: "report_rows", kind: "daily_kasa", day: DAY }, NOW) as Record<string, unknown[]>;
      o.report_rows_daily = Object.fromEntries(["returned_reports", "returned_zoborot", "fix_reports", "day_reports", "day_zoborot"].map((k) => [k, len(rd[k])]));
    }

    // doc_url — само подписване, без сваляне.
    const doc = r.kinds.documents.rows[0];
    if (doc) {
      const du = await dispatch(repo, sc, { action: "doc_url", document_id: doc.id }, NOW) as { url: string; expires_in: number };
      check(typeof du.url === "string" && du.url.indexOf("/storage/v1/object/sign/kasa-docs/") > 0 && du.expires_in === 300, label + ": doc_url — подписан линк, 300 сек");
      o.doc_url = { document_id: doc.id, expires_in: du.expires_in };
    }
    out[label] = o;
  }

  // Обхват: Раднево не вижда Кърджали.
  let reason = "";
  try { await dispatch(repo, resolveScope(user("manager", "Раднево")), { action: "day", store: "Кърджали", date: DAY }, NOW); }
  catch (e) { reason = e instanceof HttpError ? e.reason : String(e); }
  check(reason === "forbidden_store", "Раднево → day Кърджали → forbidden_store", reason);
} catch (e) {
  fails++;
  console.log("  ❌ хвърли:", e instanceof Error ? e.message : String(e));
}
console.log("БРОЕВЕ:", JSON.stringify(out, null, 1));
console.log(fails ? "❌ ПАДАЩИ: " + fails : "✅ всичко минава");
Deno.exit(fails ? 1 : 0);
