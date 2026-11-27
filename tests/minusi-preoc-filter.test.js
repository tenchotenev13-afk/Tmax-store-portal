/* Минуси, „📋 Дневен“ — отметка „само с преоценени (N)“ (27.11.2026, сесия
   minusi-preoc-filter; Миглена).

   Само офисът (MN_CO_ROLES), при всеки избор на обект. Включена → остават
   незакритите редове, при които материалът ИЛИ някой от заметнатите кодове
   (mnRevRealCodes) е преоценен (mnRevIsPreoc: описание „ПРЕОЦ“, category
   'Преоценка', product_name „ПРЕОЦ“). Каталогът — след рендера, на порции;
   гърми → само по описание + сив ред. Excel / печат / mnFilterText следват.

   Фикстура („Всички обекти“; каталог: 8055312 и 8070030 — 'Преоценка'):
     A Монтана 55312 → „55312 и 8055312“  — заметнат преоценен (само каталог) → вътре
     B Монтана 8090757 ПРЕОЦ., непопълнен  — материалът преоценен (описание) → вътре
     C Монтана 8090800 ПРЕОЦ. + 956         — закрит → вън
     D Шумен 70010 → 70020                  — без преоценен → вън
     E Шумен 8070030 ТЕСТ                   — материалът преоценен (само каталог) → вътре

   Мутационна проверка (27.11.2026) — всеки вариант пуснат и паднал:
     M1 закритите влизат (без _state)          → падат
     M2 само по материала (без заметнатите)     → падат
     M3 отметката видима и за обекта            → падат
     M4 bulOpenPending('minusi') не я изключва   → пада
   Пускане: node tests/minusi-preoc-filter.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, section, report, ticks } = H;

let seq = 0;
function mv(store, material, desc, real, extra) {
  seq++;
  return Object.assign({ id: 'p' + String(seq).padStart(4, '0'), store_name: store, plant: store === 'Шумен' ? '5550' : '5540', material: material,
    material_desc: desc, mvt_type: '955', qty: 1, uom: 'БР', mat_doc: 'P' + String(seq).padStart(4, '0'),
    doc_item: '1', doc_year: 2026, posting_date: '2026-11-0' + Math.min(seq, 9), real_code: real || null, reason_id: 2,
    employee_name: 'Иван', note: null, action: null, filled_by: null, filled_at: null }, extra || {});
}
function base() {
  seq = 0;
  return [
    mv('Монтана', '55312', 'ТЕСТ 55312', '55312 и 8055312'),
    mv('Монтана', '8090757', 'ПРЕОЦ. ТЕСТ 8090757', null, { reason_id: null, employee_name: null }),
    mv('Монтана', '8090800', 'ПРЕОЦ. ТЕСТ 8090800', null),
    mv('Монтана', '8090800', 'ПРЕОЦ. ТЕСТ 8090800', null, { mvt_type: '956', qty: -1, reason_id: null, employee_name: null }),
    mv('Шумен', '70010', 'ТЕСТ 70010', '70020'),
    mv('Шумен', '8070030', 'ТЕСТ 8070030', null)
  ];
}
const CAT = [
  { sap_code: '8055312', product_name: 'ТЕСТ 8055312', category: 'Преоценка' },
  { sap_code: '8070030', product_name: 'ТЕСТ 8070030', category: 'Преоценка' },
  { sap_code: '70020', product_name: 'ОБИКНОВЕН', category: 'Друга' }
];
const REASONS = [{ id: 2, label: 'последна бройка', active: true, sort: 2, requires_note: false, excluded_from_revision: false }];

function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    db.log.push({ m, tbl, q });
    if (m !== 'GET') return resp(405, { message: 'not in fake' });
    if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: 'Монтана,Шумен' }]);
    if (tbl === 'minus_plants') return resp(200, [{ plant: '5540', store_name: 'Монтана' }, { plant: '5550', store_name: 'Шумен' }]);
    if (tbl === 'minus_reasons') return resp(200, REASONS);
    if (tbl === 'minus_uom_thresholds') return resp(200, []);
    if (tbl === 'minus_uploads') return resp(200, []);
    if (tbl === 'minus_movements') {
      if (/offset=[1-9]/.test(q)) return resp(200, []);
      const st = (q.match(/store_name=eq\.([^&]*)/) || [])[1];
      return resp(200, db.movs.filter(x => !st || x.store_name === st).map(x => Object.assign({}, x)));
    }
    if (tbl === 'product_catalog') {
      if (/category/.test(q)) {
        if (db.cat === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
        if (db.cat === '500') return resp(500, { message: 'boom' });
      }
      const list = ((q.match(/sap_code=in\.\(([^)]*)\)/) || [])[1] || '').split(',').map(s => s.replace(/"/g, ''));
      return resp(200, CAT.filter(p => list.indexOf(p.sap_code) >= 0));
    }
    return resp(200, []);
  };
}
const CO = { email: 'controlling@temax.bg', display_name: 'Контролинг', role: 'controlling', store_name: 'Централен офис' };
const MU = { email: 'managermontana@temax.bg', display_name: 'Управител Монтана', role: 'manager', store_name: 'Монтана' };
const $ = (h, s) => h.w.document.querySelector(s);
const J = x => JSON.stringify(x);
const ids = h => Array.from(h.w.document.querySelectorAll('#mn-daily tbody tr[data-mn-id]')).map(tr => tr.getAttribute('data-mn-id')).sort();
/* Истински клик по отметка: браузърът обръща checked и пуска onchange. */
function tick(h, sel) { const el = h.w.document.querySelector(sel); if (!el) throw new Error('няма ' + sel); el.checked = !el.checked; fire(h.w, el, 'change'); }
const nLbl = h => ($(h, '#mn-preoc-n') || {}).textContent;
async function env(user, cat, all) {
  const db = { movs: base(), cat: cat || 'ok', log: [] };
  const h = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js'], user: user, data: {} });
  install(h, db);
  h.w.mnOnlyPreoc = false; h.w.mnOnlyUnfilled = false; h.w.mnOnlyOpen = false; h.w.mnSearch = '';
  if (all) h.w.mnStore = '__all__';
  await h.w.loadMinusi(); await ticks(8);
  return { h, db };
}
function xlsxMock(w) {
  const cap = { aoa: null, n: 0 };
  w.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: a => { cap.aoa = a; return {}; }, book_append_sheet: () => {} }, writeFile: () => { cap.n++; } };
  return cap;
}

(async function main() {
  section('1. Офисът, „Всички обекти“ — истински клик');
  const { h, db } = await env(CO, 'ok', true);
  ok('„Всички обекти“ е избран', h.w.mnIsAll());
  ok('отметката я има, изключена', !!$(h, '#mn-preoc') && !$(h, '#mn-preoc').checked);
  ok('всички 5 реда 955 без филтъра', ids(h).length === 5, J(ids(h)));
  ok('N = 3 след каталога (A, B, E)', nLbl(h) === '3', nLbl(h));
  const cq = db.log.filter(x => x.tbl === 'product_catalog' && /category/.test(x.q));
  ok('каталогът е питан за заметнатия 8055312 и за 8070030', cq.length >= 1 && cq.some(x => x.q.indexOf('"8055312"') >= 0) && cq.some(x => x.q.indexOf('"8070030"') >= 0));
  tick(h, '#mn-preoc');
  await ticks(2);
  ok('mnOnlyPreoc = true след клика', h.w.mnOnlyPreoc === true);
  ok('остават A, B, E', J(ids(h)) === J(['p0001', 'p0002', 'p0006']), J(ids(h)));
  ok('преоценен заметнат (A) — вътре', ids(h).indexOf('p0001') >= 0);
  ok('преоценен материал по описание (B) — вътре', ids(h).indexOf('p0002') >= 0);
  ok('закрит с преоценен (C) — вън', ids(h).indexOf('p0003') < 0);
  ok('без преоценен (D) — вън', ids(h).indexOf('p0005') < 0);
  ok('отметката остава включена след прерисуване', $(h, '#mn-preoc').checked);
  ok('без сив ред за каталога', !$(h, '#mn-preoc-catfail'));
  ok('mnFilterText — „само с преоценени“', h.w.mnFilterText().indexOf('само с преоценени') >= 0, h.w.mnFilterText());

  section('2. Комбинация със „само непопълнени“ и търсенето');
  tick(h, '#mn-unfilled');
  await ticks(2);
  ok('само B', J(ids(h)) === J(['p0002']), J(ids(h)));
  ok('N = 1', nLbl(h) === '1', nLbl(h));
  ok('mnFilterText — и двете', /само непопълнени · само с преоценени/.test(h.w.mnFilterText()), h.w.mnFilterText());
  tick(h, '#mn-unfilled');
  await ticks(2);
  h.w.mnSetSearch('8055312');
  ok('търсене по заметнатия → само A', J(ids(h)) === J(['p0001']), J(ids(h)));
  h.w.mnSetSearch('');

  section('3. Excel и печат следват филтъра');
  const cap = xlsxMock(h.w);
  realClick(h.w, $(h, '#mn-excel'), 'Excel');
  await ticks(2);
  ok('файлът е записан', cap.n === 1);
  const mats = cap.aoa.slice(1).map(r => r[1]).sort();
  ok('Excel: 55312, 8070030, 8090757', J(mats) === J(['55312', '8070030', '8090757']), J(mats));
  realClick(h.w, $(h, '#mn-print'), 'Печат');
  await ticks(2);
  const pf = $(h, '#mn-print-filters');
  ok('печат: филтрите и 3 реда', !!pf && pf.textContent.indexOf('само с преоценени') >= 0 && /редове: 3$/.test(pf.textContent), pf && pf.textContent);

  section('4. Обектът не вижда отметката');
  const m = await env(MU, 'ok', false);
  ok('мениджърът: няма #mn-preoc', !$(m.h, '#mn-preoc'));
  m.h.w.mnOnlyPreoc = true; m.h.w.mnRender();
  ok('дори със състоянието включено — редовете не се филтрират', ids(m.h).length === 3, J(ids(m.h)));
  ok('мениджърът — каталогът за преоценени не се пита', m.db.log.filter(x => x.tbl === 'product_catalog' && /category/.test(x.q)).length === 0);

  section('5. Каталогът гърми → само по описание + сив ред');
  for (const mode of ['throw', '500']) {
    const r = await env(CO, mode, true);
    ok('„' + mode + '“: N = 1 (само B по описание)', nLbl(r.h) === '1', nLbl(r.h));
    tick(r.h, '#mn-preoc');
    await ticks(2);
    ok('„' + mode + '“: остава само B', J(ids(r.h)) === J(['p0002']), J(ids(r.h)));
    const cf = $(r.h, '#mn-preoc-catfail');
    ok('„' + mode + '“: сивият ред', !!cf && cf.textContent === 'Каталогът не се зареди — преоценените се разпознават само по описание', cf && cf.textContent);
  }

  section('6. Един обект — отметката я има');
  const one = await env(CO, 'ok', false);
  one.h.w.mnSetStore('Шумен'); await ticks(8);
  ok('обект Шумен — отметката я има, N = 1', !!$(one.h, '#mn-preoc') && nLbl(one.h) === '1', nLbl(one.h));
  one.h.w.mnSetView('bymat');
  ok('„По артикул“ — без отметката', !$(one.h, '#mn-preoc'));

  section('7. Каталогът — на порции');
  const codes = [];
  for (let i = 0; i < 320; i++) codes.push({ code: String(100000 + i) });
  const before = db.log.length;
  await h.w.mnRevLoadCat(codes); await ticks(2);
  const parts = db.log.slice(before).filter(x => x.tbl === 'product_catalog');
  ok('320 кода → 3 заявки', parts.length === 3, parts.length);

  section('8. „Отвори →“ от Бюлетина изчиства отметката');
  const bdb = { movs: base(), cat: 'ok', log: [] };
  const bh = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js', 'bulletin.js'], user: CO, data: {} });
  install(bh, bdb);
  bh.w.mnOnlyPreoc = true; bh.w.mnOnlyUnfilled = false;
  bh.w.bulOpenPending('minusi'); await ticks(4);
  ok('mnOnlyPreoc = false, mnOnlyUnfilled = true', bh.w.mnOnlyPreoc === false && bh.w.mnOnlyUnfilled === true, bh.w.mnOnlyPreoc + ' / ' + bh.w.mnOnlyUnfilled);

  report();
})().catch(e => { console.error(e); process.exit(1); });
