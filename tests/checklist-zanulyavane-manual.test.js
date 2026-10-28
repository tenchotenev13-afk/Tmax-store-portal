/* Чек лист — „таблица зануляване л.м." (zanulyavane_lm) отново РЪЧНА
   (28.10.2026, сесия checklist-zanulyavane-manual).

   Решение на Тенчо 28.10: друг вид задача — Миглена я отмята ръчно; НЕ е
   „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М." (постоянна задача 72aed3fc). Връзката от 23.10
   е махната с миграция weekly_checklist_zanulyavane_manual: source 'manual',
   portal_mode NULL, sublabel NULL; седмици 35–43 — portal_value NULL по
   колоната. Че checklist_portal_values() не я връща — проверено в базата
   след миграцията (claude/log/2026-10-28-checklist-zanulyavane-manual.md).

   Какво заковава файлът:
   1. checklist.js: zanulyavane_lm няма режим в CHECKLIST_PORTAL_MODE и не е
      автоматична дори при стария източник 'recurring:72aed3fc…';
      checklistComputePortalValues() не дава стойност за нея при отметки по
      „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М.";
   2. жива седмица (44): функцията не връща колоната → клетката е празна
      (без „Стойност от портала"), а отметнатите по задачата обекти не я
      пълнят; клик на контролинга → upsert САМО на control_value „da" →
      клетката показва „да";
   3. затворена седмица (43) след миграцията: portal_value NULL → празно;
      ръчната отметка се записва както досега;
   4. миграцията (огледалото в supabase/migrations): сменя само source /
      portal_mode / sublabel и чисти САМО portal_value в 35–43 — без
      control_value, control_num, comment и без delete; _down връща връзката.

   Мутационна проверка (28.10.2026) — всеки вариант пуснат и паднал:
     Z1 checklist.js: zanulyavane_lm: 'any' обратно в CHECKLIST_PORTAL_MODE → пада 1
     Z2 checklist.js: zanulyavane_lm: 'count' обратно                        → пада 1
     Z3 миграцията чисти и control_value                                     → пада 4
     Z4 миграцията оставя source на recurring:                              → пада 4
   Пускане:  node tests/checklist-zanulyavane-manual.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const LM_ID = '72aed3fc-1720-4205-be89-feb242b2627f';
const RAZL_ID = '166a22f8-c884-4019-862d-4f20175baa12';
const YEAR = 2026;

function metrics(lmSrc) {
  return [
    ['zanulyavane_lm',   'таблица зануляване л.м.', 'yes_no', lmSrc || 'manual'],
    ['razliki_dostavka', 'Разлики от доставка',     'yes_no', 'recurring:' + RAZL_ID]
  ].map(function (a, i) {
    return { key: a[0], label: a[1], sublabel: '', value_type: a[2], source: a[3], sort_order: i + 1, active: true, deadline_day: null };
  });
}
const KEYS = ['zanulyavane_lm', 'razliki_dostavka'];
const USERS = ['Враца', 'Габрово', 'Централен офис'].map(function (s) { return { store_name: s }; });
const ADMIN = { id: 'u-1', email: 'm.pavlova@temax.bg', display_name: 'М. Павлова', role: 'admin', store_name: 'Централен офис' };

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: metrics(opts.lmSrc),
      weekly_checklist: opts.rows || [],
      weekly_checklist_freezes: opts.frozen ? [{ year: YEAR, week_number: opts.week }] : [],
      weekly_checklist_sends: [], weekly_checklist_responses: [],
      /* Живото след миграцията: само свързаните колони; zanulyavane_lm го няма. */
      rpc: opts.rpc || [{ store_name: 'Враца', metric_key: 'razliki_dostavka', value: '2/5' }],
      recurring_tasks: [{ id: LM_ID, due_weekdays: [0] }], recurring_task_versions: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: opts.comps || [], goods_transit: [], stock_returns: [], differences_reports: [], stock_differences: []
    }
  });
  h.w.checklistYear = YEAR; h.w.checklistWeek = opts.week;
  return h;
}
async function open(h) { h.w.loadChecklist(); await ticks(); await ticks(); }
function clWrites(h) { return h.calls.post.concat(h.calls.patch).filter(function (p) { return (p.url || '').indexOf('/weekly_checklist?') >= 0; }); }
function cellOf(h, store, key) {
  const t = h.doc.getElementById('checklist-table');
  if (!t) return null;
  const tr = Array.prototype.slice.call(t.querySelectorAll('tbody tr')).filter(function (x) {
    return x.querySelector('td').textContent.trim() === store;
  })[0];
  return tr ? tr.querySelectorAll('td')[KEYS.indexOf(key) + 1] : null;
}
function cellVal(h, store, key) { const td = cellOf(h, store, key); const v = td && td.querySelector('.cl-val'); return v ? v.textContent.trim() : ''; }
function cellTitle(h, store, key) { const td = cellOf(h, store, key); const v = td && td.querySelector('.cl-val'); return v ? (v.getAttribute('title') || '') : ''; }

(async function () {

  section('1. checklist.js — без режим, не е автоматична');
  {
    const h = env({ week: 44 });
    const M = h.w.CHECKLIST_PORTAL_MODE;
    ok('zanulyavane_lm НЯМА режим в CHECKLIST_PORTAL_MODE', !Object.prototype.hasOwnProperty.call(M, 'zanulyavane_lm'), JSON.stringify(M));
    ok('… другите режими са на място (srok_godnost any, razliki_dostavka count)', M.srok_godnost === 'any' && M.razliki_dostavka === 'count');
    h.w.checklistMetrics = metrics('recurring:' + LM_ID);
    const auto = h.w.checklistAutoMetrics().map(function (m) { return m.key; });
    ok('дори при стария източник recurring:72aed3fc — не е автоматична', auto.indexOf('zanulyavane_lm') < 0 && auto.indexOf('razliki_dostavka') >= 0, JSON.stringify(auto));
    h.close();
  }

  section('2. Жива седмица 44 — празна, докато контролингът не отметне');
  {
    const h = env({ week: 44, comps: [{ id: 'c1', recurring_task_id: LM_ID, store_name: 'Враца', completed_date: '2026-10-26', run_date: '2026-10-26', status: 'done' }] });
    await open(h);
    ok('мрежата е там', !!h.doc.getElementById('checklist-table'));
    ok('Враца (отметнала „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М.") — клетката е празна', cellVal(h, 'Враца', 'zanulyavane_lm') === '', cellVal(h, 'Враца', 'zanulyavane_lm'));
    ok('… без „Стойност от портала"', !/Стойност от портала/.test(cellTitle(h, 'Враца', 'zanulyavane_lm')));
    ok('Габрово — празна', cellVal(h, 'Габрово', 'zanulyavane_lm') === '');
    ok('свързаната колона си идва от живото (razliki 2/5)', cellVal(h, 'Враца', 'razliki_dostavka') === '2/5', cellVal(h, 'Враца', 'razliki_dostavka'));
    ok('отварянето не пише', clWrites(h).length === 0);
    cellOf(h, 'Враца', 'zanulyavane_lm').click(); await ticks(); await ticks();
    const w = clWrites(h);
    const b = w[0] ? (Array.isArray(w[0].body) ? w[0].body[0] : w[0].body) : {};
    ok('клик на контролинга → 1 upsert', w.length === 1, String(w.length));
    ok('… control_value „da", metric_key zanulyavane_lm, седмица 44', b.control_value === 'da' && b.metric_key === 'zanulyavane_lm' && b.week_number === 44 && b.store_name === 'Враца', JSON.stringify(b));
    ok('… без portal_value', !('portal_value' in b), JSON.stringify(b));
    ok('клетката показва „да"', cellVal(h, 'Враца', 'zanulyavane_lm') === 'да', cellVal(h, 'Враца', 'zanulyavane_lm'));
    h.close();
  }

  section('3. Затворена седмица 43 след миграцията');
  {
    const rows = [{ id: 'r1', year: YEAR, week_number: 43, store_name: 'Габрово', metric_key: 'zanulyavane_lm',
                    portal_value: null, control_value: null, control_num: null, comment: null }];
    const h = env({ week: 43, frozen: true, rows: rows });
    await open(h);
    ok('Габрово (беше „ne" от портала) — празно', cellVal(h, 'Габрово', 'zanulyavane_lm') === '', cellVal(h, 'Габрово', 'zanulyavane_lm'));
    cellOf(h, 'Габрово', 'zanulyavane_lm').click(); await ticks(); await ticks();
    const w = clWrites(h);
    const b = w[0] ? (Array.isArray(w[0].body) ? w[0].body[0] : w[0].body) : {};
    ok('ръчната отметка → control_value „da"', w.length === 1 && b.control_value === 'da' && b.metric_key === 'zanulyavane_lm', JSON.stringify(b));
    h.close();
  }

  section('4. Миграцията — само source / режим / подпис и само portal_value');
  {
    const dir = path.join(ROOT, 'supabase/migrations');
    const up = fs.readdirSync(dir).filter(function (f) { return /_weekly_checklist_zanulyavane_manual\.sql$/.test(f); });
    const dn = fs.readdirSync(dir).filter(function (f) { return /_weekly_checklist_zanulyavane_manual_down\.sql$/.test(f); });
    ok('огледалото на миграцията и _down са в supabase/migrations', up.length === 1 && dn.length === 1, JSON.stringify(up.concat(dn)));
    const sql = up[0] ? fs.readFileSync(path.join(dir, up[0]), 'utf8').replace(/--[^\n]*/g, '') : '';
    const down = dn[0] ? fs.readFileSync(path.join(dir, dn[0]), 'utf8').replace(/--[^\n]*/g, '') : '';
    ok('метриката: source \x27manual\x27, portal_mode null, sublabel null', /set\s+source\s*=\s*'manual'\s*,\s*portal_mode\s*=\s*null\s*,\s*sublabel\s*=\s*null\s+where\s+key\s*=\s*'zanulyavane_lm'/i.test(sql));
    ok('чисти portal_value по колоната в 35–43', /update\s+public\.weekly_checklist\s+set\s+portal_value\s*=\s*null\s+where\s+metric_key\s*=\s*'zanulyavane_lm'\s+and\s+year\s*=\s*2026\s+and\s+week_number\s+between\s+35\s+and\s+43/i.test(sql));
    ok('НЕ пипа control_value / control_num / comment', !/control_value|control_num|comment\s*=/i.test(sql));
    ok('без delete и без weekly_checklist_responses', !/\bdelete\b/i.test(sql) && !/weekly_checklist_responses/i.test(sql));
    ok('_down връща recurring:72aed3fc, any и подписа', down.indexOf("'recurring:" + LM_ID + "'") >= 0 && /portal_mode\s*=\s*'any'/.test(down) && down.indexOf('бланка Зареждане') >= 0);
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
