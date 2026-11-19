/* „➖ Минуси" — „💡 Какво да проверим" (Миглена, 13.11.2026, файл „За тенчо
   жокер минуси.xlsx"; сесия minusi-help, 19.11.2026). Само показване: блок над
   таблицата, затворен по подразбиране, един клик отваря / затваря, състоянието
   — в паметта. За обекта и за офиса, в двата изгледа. Не е в печата, нито в Excel.

   Мутационна проверка (19.11.2026) — всеки вариант върху чистия minusi.js:
     H1 отворен по подразбиране (mnHelpOpen = true);
     H2 липсва точка (махната „Ръчна стокова бележка");
     H3 само за офиса (mnHelpHtml връща '' за обекта).
   Броят паднали — в отчета на сесията. */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const GD = 'Гоце Делчев';
const STORE = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: GD };
const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const J = JSON.stringify;
const ITEMS = [
  'Има ли още физически налични',
  'Етикет на артикула, етикет в търговска зала',
  'Откъде идва — внос Темакс / логистичен склад или от доставчик',
  'Има ли неприета входяща доставка, подавана разлика',
  'Провери последния прием',
  'Сходен артикул — различен цвят, близък размер, съседният артикул на регала',
  'Ръчна стокова бележка',
  'Провери камери в часа на продажбата',
  'Провери за преоценен артикул',
  'Провери последна ревизия'
];
const TITLE = 'Какво да проверим, когато имаме недостиг на артикул — маркиран на каса артикул, който няма наличност по система';
const MOVS = [1, 2].map(i => ({ id: 'mv-' + i, plant: '7519', store_name: GD, material: '1000' + i, material_desc: 'АРТИКУЛ ' + i, mvt_type: '955', qty: 1, uom: 'БР',
  mat_doc: '4903300000' + i, doc_item: '1', doc_year: 2026, posting_date: '2026-11-1' + i, real_code: null, reason_id: null, employee_name: null, note: null, action: null, filled_by: null, filled_at: null }));

function resp(status, body) {
  const t = JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) });
}
function env(user) {
  const h = boot({ modules: ['client-orders.js', 'stock-returns.js', 'stock-differences.js', 'revaluation.js', 'revisions.js', 'notifications.js', 'minusi.js'], user, data: {} });
  h.w.fetch = function (url) {
    const u = String(url), tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1], q = decodeURIComponent(u.split('?')[1] || '');
    if (/offset=[1-9]/.test(q)) return resp(200, []);
    if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: GD }]);
    if (tbl === 'minus_plants') return resp(200, [{ plant: '7519', store_name: GD }]);
    if (tbl === 'minus_reasons') return resp(200, [{ id: 1, label: 'последна бройка', active: true, sort: 1, requires_note: false }]);
    if (tbl === 'minus_movements') return resp(200, MOVS.map(x => Object.assign({}, x)));
    return resp(200, []);
  };
  return h;
}
const items = h => Array.from(h.doc.querySelectorAll('#mn-help-body ol li')).map(li => li.textContent);

(async function run() {
  for (const [who, user] of [['обектът (manager)', STORE], ['офисът (admin)', ADMIN]]) {
    section('1. ' + who);
    const h = env(user);
    if (user === ADMIN) h.w.mnStore = GD;
    await h.w.loadMinusi(); await ticks(8);
    const btn = () => h.doc.getElementById('mn-help-btn');
    ok(who + ': бутонът „💡 Какво да проверим“ е над таблицата', !!btn() && /💡 Какво да проверим/.test(btn().textContent) &&
      !!(h.doc.getElementById('mn-help').compareDocumentPosition(h.doc.getElementById('mn-body')) & 4));
    ok(who + ': затворен по подразбиране', !h.doc.getElementById('mn-help-body') && btn().getAttribute('aria-expanded') === 'false');
    h.w.mnDraft = {};
    const sel = h.doc.getElementById('mn-reason-mv-1');
    if (sel) { sel.value = '1'; }
    realClick(h.w, btn());
    ok(who + ': клик → отворен, заглавието', !!h.doc.getElementById('mn-help-body') && h.doc.querySelector('#mn-help-body > div').textContent === TITLE);
    ok(who + ': клик → 10 точки в реда от файла', J(items(h)) === J(ITEMS), J(items(h)));
    ok(who + ': незаписаното в таблицата остава (прерисува се само блокът)', !sel || h.doc.getElementById('mn-reason-mv-1') === sel);
    realClick(h.w, btn());
    ok(who + ': втори клик → затворен', !h.doc.getElementById('mn-help-body') && btn().getAttribute('aria-expanded') === 'false');
    realClick(h.w, btn());
    h.w.mnSetView('bymat');
    ok(who + ': „По артикул“ — блокът е там и остава отворен', !!h.doc.getElementById('mn-help-btn') && items(h).length === 10);
    h.w.mnSetView('daily');
    ok(who + ': „Дневен“ — пак отворен', items(h).length === 10);
    h.w.mnPrint();
    const pr = h.doc.getElementById('mod-print');
    ok(who + ': не е в печата', !/Какво да проверим|физически налични/.test(pr.textContent) && /Минуси/.test(pr.textContent));
    const aoa = h.w.mnExportAoa();
    ok(who + ': не е в Excel', !/Какво да проверим|физически налични/.test(J(aoa)));
    h.close();
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
