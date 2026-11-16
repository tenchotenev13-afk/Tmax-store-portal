/* Отчет по задача — „Няма нужда" в секция „Зареждане" (send-routed-report v20,
   16.11.2026).

   Бъгът: обект, отбелязал „Нямам нужда тази седмица" (supply_no_need) за
   бланка, излизаше в „Без данни", защото функцията не четеше таблицата.
   Задачата в Бюлетина го брои за изпълнил (supply_store_done()), писмото — не.

   Поправката: ред в supply_no_need за същите template_id + week_start и БЕЗ
   нито една бройка за бланката → обектът НЕ е в „Без данни", брои се в
   „Попълнили N от M" и излиза в сив ред „Няма нужда: …". Има ли бройки —
   данните печелят (както supplyOvMatrix в supply.js).

   Как: реже се РЕАЛНИЯТ index.ts преди Deno.serve (както в
   task-report-supply.test.js), внася се в Node; fetch е мини-PostgREST.

   Пускане: node tests/task-report-supply-no-need.test.js . */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const ROUTED = path.join(ROOT, 'supabase/functions/send-routed-report/index.ts');

/* Същото рязане като в task-report-supply.test.js. */
function slice(file, exportsList) {
  let s = fs.readFileSync(file, 'utf8');
  s = s.slice(0, s.indexOf('Deno.serve('));
  s = s.split(/\r?\n/).filter(l => !/^import\s/.test(l)).join('\n')
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  s = s.replace(/:\s*Record<[^>]*>/g, '')
    .replace(/:\s*\{ skips: any\[\] \| null \}/g, '')
    .replace(/:\s*(string|number|any)\[\]/g, '')
    .replace(/\((\w+)\?:\s*(string|number|any)\)/g, '($1)')
    .replace(/(\w)\?:\s*(string|number|any)\b/g, '$1')
    .replace(/:\s*(string|number|boolean|any)\b/g, '')
    .replace(/\bq\?/g, 'q');
  s += '\nexport { ' + exportsList.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-task-report-supply-no-need');
  fs.mkdirSync(dir, { recursive: true });
  const h = require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);
  const out = path.join(dir, 'routed-' + h + '.mjs');
  fs.writeFileSync(out, s);
  return out;
}

const WK = { week_number: 47, year: 2026 };   /* 16.11–22.11.2026 */
const MON = '2026-11-16';
function db() {
  return {
    notification_topics: [{ key: 'weekly_routed', active: true, test_email: null }],
    bulletin_tasks: [
      { id: 't-sup', bulletin_id: 'b-pub', title: 'ЗАРЕЖДАНЕ', target_stores: null, due_date: '2026-11-17', due_dates: ['2026-11-17'], linked_module: 'supply', task_type: 'check' }
    ],
    bulletins: [Object.assign({ id: 'b-pub', status: 'published' }, WK)],
    task_completions: [],
    users: [
      { id: 'u-co', email: 'co@temax.bg', display_name: 'ЦО', notify_groups: ['co'], active: true, store_name: 'Централен офис' },
      { id: 'u-lo', email: 'lo@temax.bg', display_name: 'Ловеч', notify_groups: [], active: true, store_name: 'Ловеч' },
      { id: 'u-ra', email: 'ra@temax.bg', display_name: 'Раднево', notify_groups: [], active: true, store_name: 'Раднево' },
      { id: 'u-si', email: 'si@temax.bg', display_name: 'Силистра', notify_groups: [], active: true, store_name: 'Силистра' },
      { id: 'u-tr', email: 'tr@temax.bg', display_name: 'Троян', notify_groups: [], active: true, store_name: 'Троян' }
    ],
    supply_templates: [
      { id: 'tpl-floor', name: 'Подови настилки (линейни метри)', slug: 'floor-lm', col1_label: 'Места в зала', col2_label: 'За поръчка', target_stores: null, active: true, sort_order: 1 },
      { id: 'tpl-cab', name: 'Кабели на макара', slug: 'cables-reels', col1_label: 'Налична макара', col2_label: null, target_stores: null, active: true, sort_order: 2 }
    ],
    supply_template_items: [
      { id: 'f-1', template_id: 'tpl-floor', sap_code: null, name: 'Балатум 4м.', active: true, sort_order: 1 },
      { id: 'c-1', template_id: 'tpl-cab', sap_code: '23237', name: 'ПВВ-МБ1 2X1', active: true, sort_order: 1 }
    ],
    supply_entries: [
      /* Ловеч — с бройки по Подови */
      { id: 'e1', template_id: 'tpl-floor', item_id: 'f-1', store_name: 'Ловеч', week_start: MON, qty1: 3, qty2: 1, note: null },
      /* Кабели — всички с бройки, за да не пречат на сверката */
      { id: 'e2', template_id: 'tpl-cab', item_id: 'c-1', store_name: 'Ловеч', week_start: MON, qty1: 1, qty2: null, note: null },
      { id: 'e3', template_id: 'tpl-cab', item_id: 'c-1', store_name: 'Раднево', week_start: MON, qty1: 2, qty2: null, note: null },
      { id: 'e4', template_id: 'tpl-cab', item_id: 'c-1', store_name: 'Силистра', week_start: MON, qty1: 3, qty2: null, note: null },
      { id: 'e5', template_id: 'tpl-cab', item_id: 'c-1', store_name: 'Троян', week_start: MON, qty1: 4, qty2: null, note: null }
    ],
    supply_no_need: [
      /* реалният случай от 16.11.2026 */
      { id: 'n1', template_id: 'tpl-floor', store_name: 'Раднево', week_start: MON },
      { id: 'n2', template_id: 'tpl-floor', store_name: 'Силистра', week_start: MON },
      /* Ловеч има и бройки → данните печелят, остава попълнил */
      { id: 'n3', template_id: 'tpl-floor', store_name: 'Ловеч', week_start: MON },
      /* шум: друга седмица, обект извън обхвата */
      { id: 'n4', template_id: 'tpl-floor', store_name: 'Троян', week_start: '2026-11-09' },
      { id: 'n5', template_id: 'tpl-floor', store_name: 'Централен офис', week_start: MON }
    ]
  };
}
/* Мини-PostgREST: eq / in; limit/offset. fail(table) → 500. */
function pgFetch(data, log, fail) {
  return function (url, init) {
    init = init || {};
    const u = new URL(url, 'http://x');
    const method = (init.method || 'GET').toUpperCase();
    if (u.pathname.indexOf('/functions/v1/resend-email') >= 0) {
      log.mail.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    }
    const table = u.pathname.split('/').pop();
    log.get.push(table + '?' + decodeURIComponent(u.search.slice(1)));
    if (fail && fail(table)) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) });
    if (method !== 'GET') return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) });
    let rows = (data[table] || []).slice();
    let limit = null, offset = 0;
    u.searchParams.forEach((v, k) => {
      if (k === 'limit') { limit = Number(v); return; }
      if (k === 'offset') { offset = Number(v); return; }
      if (['select', 'order'].indexOf(k) >= 0) return;
      const val = x => String(x == null ? '' : x);
      if (v.indexOf('eq.') === 0) rows = rows.filter(r => val(r[k]) === v.slice(3));
      else if (v.indexOf('in.(') === 0) { const set = v.slice(4, -1).split(','); rows = rows.filter(r => set.indexOf(val(r[k])) >= 0); }
      else if (v.indexOf('gte.') === 0) rows = rows.filter(r => r[k] != null && val(r[k]) >= v.slice(4));
      else if (v.indexOf('lte.') === 0) rows = rows.filter(r => r[k] != null && val(r[k]) <= v.slice(4));
      else if (v === 'not.is.null') rows = rows.filter(r => r[k] != null);
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    });
    rows = rows.slice(offset, limit == null ? undefined : offset + limit);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
  };
}
function quiet(fn) {
  const w = console.warn, e = console.error, got = [];
  console.warn = function () { got.push(Array.prototype.join.call(arguments, ' ')); };
  console.error = function () { got.push(Array.prototype.join.call(arguments, ' ')); };
  return Promise.resolve().then(fn).then(r => { console.warn = w; console.error = e; return { r, got }; },
    x => { console.warn = w; console.error = e; throw x; });
}
/* Съдържанието на реда (div), който започва с prefix — или null. */
const lineOf = (html, prefix) => { const m = String(html).match(new RegExp(">(" + prefix + "[^<]*)</div>")); return m ? m[1] : null; };
const text = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

(async function () {
  let T = null;
  section('0. Реалният код се зарежда');
  {
    let f = null;
    guard('routed се реже', () => { f = slice(ROUTED, ['routedTaskReportResponse']); });
    try { T = await import(pathToFileURL(f).href); } catch (e) { ok('routed се внася', false, e && e.message); }
    if (!ok('модулът е зареден', !!T)) { report(); return; }
  }

  const run = async (data, opts) => {
    opts = opts || {};
    const log = { get: [], mail: [] };
    globalThis.fetch = pgFetch(data, log, opts.fail);
    const body = { task_id: 't-sup', recipients: { groups: ['co'], user_ids: [] }, run_date: '2026-11-17', run_time: '11:05' };
    const { r, got } = await quiet(() => T.routedTaskReportResponse(body, !!opts.dry, null));
    const j = await r.json();
    return { j, log, logs: got, html: (log.mail[0] || {}).html || '' };
  };
  const floorOf = html => html.slice(html.indexOf('Подови настилки'), html.indexOf('Кабели на макара'));

  section('1. „Няма нужда" не е „Без данни"');
  {
    const a = await run(db());
    const fl = floorOf(a.html);
    const t = text(fl);
    ok('едно писмо', a.log.mail.length === 1 && a.j.sent === 1, JSON.stringify(a.j));
    ok('„Без данни: Троян" — само обектът без нищо', lineOf(fl, 'Без данни: ') === 'Без данни: Троян', lineOf(fl, 'Без данни: '));
    ok('„Няма нужда: Раднево, Силистра"', t.indexOf('Няма нужда: Раднево, Силистра') >= 0, t);
    ok('„Попълнили 3 от 4" (Ловеч + двата „Няма нужда")', t.indexOf('Попълнили 3 от 4') >= 0, t.slice(0, 200));
    ok('редът „Няма нужда" е сив (#94A3B8)', /<div style="[^"]*color:#94A3B8[^"]*">Няма нужда: Раднево, Силистра<\/div>/.test(fl));
    ok('Ловеч (с бройки И no_need) е в таблицата, не в „Няма нужда"', t.indexOf('Ловеч 3/1') >= 0 && lineOf(fl, 'Няма нужда: ') === 'Няма нужда: Раднево, Силистра', lineOf(fl, 'Няма нужда: '));
    ok('ЦО (извън обхвата) не е нито в „Няма нужда", нито в обхвата', t.indexOf('Централен') < 0, t);
    ok('no_need от друга седмица (Троян, 09.11) не важи', lineOf(fl, 'Без данни: ') === 'Без данни: Троян');
    const cab = text(a.html.slice(a.html.indexOf('Кабели на макара'), a.html.indexOf('Пълна матрица')));
    ok('бланка без no_need: няма ред „Няма нужда", „Попълнили 4 от 4"', cab.indexOf('Няма нужда') < 0 && cab.indexOf('Попълнили 4 от 4') >= 0, cab);
    ok('supply_no_need се чете за седмицата и активните бланки',
      a.log.get.some(g => /^supply_no_need\?week_start=eq\.2026-11-16&template_id=in\.\(tpl-floor,tpl-cab\)/.test(g)),
      a.log.get.filter(g => /supply/.test(g)).join(' | '));
  }

  section('2. Без no_need изобщо — предишното поведение');
  {
    const d = db(); d.supply_no_need = [];
    const a = await run(d);
    const t = text(floorOf(a.html));
    ok('„Без данни: Раднево, Силистра, Троян"', t.indexOf('Без данни: Раднево, Силистра, Троян') >= 0, t);
    ok('„Попълнили 1 от 4"', t.indexOf('Попълнили 1 от 4') >= 0);
    ok('няма ред „Няма нужда"', a.html.indexOf('Няма нужда') < 0);
  }

  section('3. Всички без бройки са „Няма нужда" → без „Без данни"');
  {
    const d = db(); d.supply_no_need.push({ id: 'n6', template_id: 'tpl-floor', store_name: 'Троян', week_start: MON });
    const a = await run(d);
    const t = text(floorOf(a.html));
    ok('без ред „Без данни"', t.indexOf('Без данни') < 0, t);
    ok('„Попълнили 4 от 4"', t.indexOf('Попълнили 4 от 4') >= 0, t);
    ok('„Няма нужда: Раднево, Силистра, Троян"', t.indexOf('Няма нужда: Раднево, Силистра, Троян') >= 0, t);
  }

  section('4. Провал на supply_no_need → червен ред, не лъже');
  {
    const a = await run(db(), { fail: t => t === 'supply_no_need' });
    const t = text(a.html);
    ok('писмото тръгва', a.log.mail.length === 1);
    ok('„Данните за Зареждане не можаха да се заредят"', t.indexOf('Данните за Зареждане не можаха да се заредят') >= 0);
    ok('няма „Без данни" / „Попълнили"', t.indexOf('Без данни') < 0 && t.indexOf('Попълнили') < 0);
  }

  section('5. dry_run: резюмето брои „Няма нужда"');
  {
    const a = await run(db(), { dry: true });
    const fl = ((a.j.supply || {}).templates || [])[0] || {};
    ok('filled 3 от 4', fl.filled === 3 && fl.of === 4, JSON.stringify(fl));
    ok('missing = [Троян]', JSON.stringify(fl.missing) === '["Троян"]', JSON.stringify(fl.missing));
    ok('no_need = [Раднево, Силистра]', JSON.stringify(fl.no_need) === '["Раднево","Силистра"]', JSON.stringify(fl.no_need));
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
