/* „Разлики", част 1: два изгледа вместо две зони една под друга.

   Превключвател „Бланки за преглед | Решени редове“ (за логистичен склад:
   „Бланки към мен | Приети редове“) под подтабовете по посока — ВИНАГИ видим,
   с броя при текущите филтри. 'reports' показва само бланките (и действията
   на магазините за склад), 'rows' — само чиповете по тип и статус, Excel и
   таблицата. Чиповете по магазин са веднъж, над превключвателя. Картите
   Чакащи/Приключени ги няма; жълтата лента е тънък надпис на реда на
   заглавието. Изборът се помни в localStorage (temax_sd_view, в try/catch).

   Пускане: node tests/sd-view-toggle.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, ticks } = H;
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || '.';
const KEY = 'temax_sd_view';

const AFTER = '2026-10-12';   /* правилото „чакат моя отговор“ е в сила */
const WH = 'Логистичен склад Добрич';
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const WHUSER = { email: 'w@temax.bg', display_name: 'Складов', role: 'logistics', store_name: WH };
const STORE_USER = { email: 'r@temax.bg', display_name: 'Раднево', role: 'store', store_name: 'Раднево' };

function freezeDate(w, iso) {
  const Real = w.Date, ms = new Real(iso + 'T12:00:00').getTime();
  w.Date = class extends Real { constructor(...a) { if (!a.length) super(ms); else super(...a); } static now() { return ms; } };
}
function rep(id, over) {
  return Object.assign({ id, store_name: 'Раднево', counterpart: 'ТЕСИ ООД', direction: 'supplier', reviewed: false, doc_date: '2026-10-10', created_at: '2026-10-10T08:00:00Z' }, over || {});
}
function line(id, over) {
  return Object.assign({ id, report_id: 'r-1', store_name: 'Раднево', supplier: 'ТЕСИ ООД', material_name: 'Артикул ' + id, material_code: 'M' + id,
    quantity: 1, type: 'writein', status: 'pending', warehouse_response: null, store_response: null }, over || {});
}
const REPORTS = [rep('r-s1'), rep('r-s2', { store_name: 'Троян' }), rep('r-i1', { direction: 'interstore', counterpart: WH })];
const LINES = [
  line('l-n1', { report_id: 'r-s1', type: null, status: 'new' }),          /* непрегледан ред на бланка → не е в таблицата */
  line('l-n2', { report_id: 'r-s2', type: null, status: 'new', store_name: 'Троян' }),
  line('l-d1', { report_id: 'r-x1', type: 'writein', status: 'pending' }),
  line('l-d2', { report_id: 'r-x2', type: 'return', status: 'taken', store_name: 'Троян' }),
  line('l-d3', { report_id: 'r-x3', type: 'missing', status: 'pending' }),
  line('l-i1', { report_id: 'r-i1', type: 'return', status: 'pending', warehouse_response: 'sent', supplier: WH })
];

function env(user, reports, lines, over) {
  over = over || {};
  const h = boot({
    modules: ['stock-returns.js', 'client-orders.js', 'notifications.js', 'stock-differences.js'], user,
    data: { users: [{ store_name: 'Раднево' }], stores: [{ name: 'Раднево' }], differences_reports: () => reports, stock_differences: () => lines, stock_diff_swaps: () => [], contacts: [] }
  });
  freezeDate(h.w, AFTER);
  h.w.diffReports = JSON.parse(JSON.stringify(reports));
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.sdSwaps = [];
  h.w.sdDirTab = over.dirTab || 'supplier';
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  return h;
}
const mod = h => h.doc.getElementById('mod-stock-diff');
const sw = h => h.doc.getElementById('sd-view-switch');
const swBtn = (h, v) => sw(h).querySelector('[data-sd-view="' + v + '"]');
const swText = (h, v) => swBtn(h, v).textContent.trim();
const num = t => parseInt((/\((\d+)\)\s*$/.exec(t) || [])[1], 10);
const cards = h => mod(h).querySelectorAll('[id^="diff-rep-"]');
const rows = h => mod(h).querySelectorAll('#sd-rows tr');
const storeChips = h => Array.from(mod(h).querySelectorAll('button[data-store=""]')).filter(b => /setSDStoreFilter/.test(b.getAttribute('onclick') || ''));
const before = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & 4));
const ls = h => { try { return h.w.localStorage.getItem(KEY); } catch (e) { return 'ERR'; } };

(async function run() {
  section('1. подразбиране „Бланки“; превключвателят е винаги видим');
  {
    const h = env(CVETI, REPORTS, LINES);
    ok('подразбиране sdView = reports', h.w.sdView === 'reports', h.w.sdView);
    guard('renderStockDiff()', () => h.w.renderStockDiff());
    ok('превключвателят е в страницата', !!sw(h));
    ok('етикети: „Бланки за преглед (N)“ / „Решени редове (N)“', /^Бланки за преглед \(\d+\)$/.test(swText(h, 'reports')) && /^Решени редове \(\d+\)$/.test(swText(h, 'rows')), swText(h, 'reports') + ' | ' + swText(h, 'rows'));
    ok('активен е „Бланки“ (тъмен фон)', /#2f2f2f/.test(swBtn(h, 'reports').getAttribute('style')) && !/#2f2f2f/.test(swBtn(h, 'rows').getAttribute('style')));
    const e = env(CVETI, [], []);
    guard('рендер без данни', () => e.w.renderStockDiff());
    ok('и при 0 превключвателят е там, с „(0)“', !!sw(e) && /\(0\)$/.test(swText(e, 'reports')) && /\(0\)$/.test(swText(e, 'rows')));
    ok('при 0 бланки има празно състояние „Няма бланки за преглед“', /Няма бланки за преглед/.test(mod(e).textContent) && !!e.doc.getElementById('sd-reports-empty'));
  }

  section('2. запомняне в localStorage (и при хвърлящ localStorage)');
  {
    const h = env(CVETI, REPORTS, LINES);
    guard('renderStockDiff()', () => h.w.renderStockDiff());
    realClick(h.w, swBtn(h, 'rows'));
    ok('клик на „Решени редове“ → sdView = rows и localStorage = rows', h.w.sdView === 'rows' && ls(h) === 'rows', h.w.sdView + ' / ' + ls(h));
    /* „презареждане“: модулът се чете наново в същия прозорец с вече записания localStorage */
    h.w.eval(fs.readFileSync(path.join(ROOT, 'stock-differences.js'), 'utf8'));
    ok('след презареждане изгледът е пак „Редове“', h.w.sdView === 'rows', h.w.sdView);
    guard('renderStockDiff()', () => h.w.renderStockDiff());
    realClick(h.w, swBtn(h, 'reports'));
    ok('обратно към „Бланки“ → localStorage = reports', h.w.sdView === 'reports' && ls(h) === 'reports');
    h.w.localStorage.setItem(KEY, 'боклук');
    h.w.eval(fs.readFileSync(path.join(ROOT, 'stock-differences.js'), 'utf8'));
    ok('непозната стойност → подразбиране „Бланки“', h.w.sdView === 'reports');

    const b = env(CVETI, REPORTS, LINES);
    const P = b.w.Storage.prototype;
    P.getItem = function () { throw new Error('blocked'); };
    P.setItem = function () { throw new Error('blocked'); };
    b.w.eval(fs.readFileSync(path.join(ROOT, 'stock-differences.js'), 'utf8'));
    ok('хвърлящ localStorage → зарежда се със „Бланки“', b.w.sdView === 'reports');
    ok('рендерът не хвърля', guard('renderStockDiff()', () => b.w.renderStockDiff()));
    ok('кликът пак превключва', guard('клик', () => realClick(b.w, swBtn(b, 'rows'))) && b.w.sdView === 'rows');
  }

  section('3. етикети за логистичен склад');
  {
    const h = env(WHUSER, REPORTS, LINES);
    guard('renderStockDiff()', () => h.w.renderStockDiff());
    ok('„Бланки към мен (N)“ / „Приети редове (N)“', /^Бланки към мен \(\d+\)$/.test(swText(h, 'reports')) && /^Приети редове \(\d+\)$/.test(swText(h, 'rows')), swText(h, 'reports') + ' | ' + swText(h, 'rows'));
    ok('и няма подтабове по посока за склад (sdDirTabsActive)', !h.w.sdDirTabsActive());
  }

  section('4. бройките = видимото');
  {
    for (const [name, user] of [['Цвети', CVETI], ['склад', WHUSER]]) {
      const h = env(user, REPORTS, LINES);
      guard('рендер', () => h.w.renderStockDiff());
      const nr = num(swText(h, 'reports')), nw = num(swText(h, 'rows'));
      ok(name + ': „Бланки“ = ' + nr + ' = картите на екрана', nr === cards(h).length, nr + ' / ' + cards(h).length);
      ok(name + ': броят е и в заглавието на секцията', nr === 0 || new RegExp('чакат преглед \\(' + nr + '(\\s|\\))').test(mod(h).textContent));
      realClick(h.w, swBtn(h, 'rows'));
      ok(name + ': „Редове“ = ' + nw + ' = редовете в таблицата', nw === rows(h).length, nw + ' / ' + rows(h).length);
      ok(name + ': броят на редовете = sdTableRows()', nw === h.w.sdTableRows().length);
    }
    const h = env(CVETI, REPORTS, LINES);
    guard('рендер', () => h.w.renderStockDiff());
    const all = num(swText(h, 'reports'));
    h.w.setSDStoreFilter('Троян');
    ok('със store филтър бройките следват (бланки)', num(swText(h, 'reports')) === cards(h).length && num(swText(h, 'reports')) < all, num(swText(h, 'reports')) + ' / ' + cards(h).length + ' / ' + all);
    h.w.setSDView('rows');
    ok('със store филтър бройките следват (редове)', num(swText(h, 'rows')) === rows(h).length, num(swText(h, 'rows')) + ' / ' + rows(h).length);
    h.w.setSDView('reports');
    h.w.setSDStoreFilter('');
    h.w.sdSearch = 'НЯМА_ТАКОВА'; h.w.renderStockDiff();
    ok('филтър, който крие всичко: съобщение + „Изчисти филтъра“ (и бройка 0)', num(swText(h, 'reports')) === 0 && /нито една не отговаря на текущия филтър/.test(mod(h).textContent) && /Изчисти филтъра/.test(mod(h).textContent));
  }

  section('5. чиповете по магазин — точно веднъж, над превключвателя; няма карти');
  {
    const h = env(CVETI, REPORTS, LINES);
    for (const v of ['reports', 'rows']) {
      h.w.sdView = v; guard('рендер ' + v, () => h.w.renderStockDiff());
      ok(v + ': чиповете по магазин са точно веднъж', storeChips(h).length === 1, String(storeChips(h).length));
      ok(v + ': над превключвателя и след търсенето', before(h.doc.getElementById('sd-search-input'), storeChips(h)[0]) && before(storeChips(h)[0], sw(h)));
      ok(v + ': няма карти Чакащи/Приключени (grid с 2 колони, големи числа)', !Array.from(mod(h).querySelectorAll('div')).some(d => /grid-template-columns:\s*repeat\(2,\s*1fr\)/.test(d.getAttribute('style') || '')) && !mod(h).querySelector('[style*="font-size:28px"]'));
    }
    const t = mod(h).textContent;
    ok('жълтата лента е тънък надпис на реда на заглавието (без цяла лента)', /ЗАПРИХОЖДАВАТЕ САМО АКО СТОКАТА Е ПРИ ВАС/.test(t) && !Array.from(mod(h).querySelectorAll('div')).some(d => /background:#fff3cd/.test(d.getAttribute('style') || '') && /margin-bottom:14px/.test(d.getAttribute('style') || '')));
  }

  section('6. в „Бланки“ няма таблица; в „Редове“ няма карти на бланки');
  {
    const h = env(CVETI, REPORTS, LINES);
    guard('рендер', () => h.w.renderStockDiff());
    ok('reports: има карти, няма #sd-rows и #sd-tbl-wrap', cards(h).length > 0 && !h.doc.getElementById('sd-rows') && !h.doc.getElementById('sd-tbl-wrap'));
    ok('reports: няма чипове по тип/статус и Excel', !mod(h).querySelector('button[onclick*="setSDTypeFilter"]') && !mod(h).querySelector('button[onclick*="setSDFilter"]') && !mod(h).querySelector('button[onclick*="exportSDExcel"]'));
    realClick(h.w, swBtn(h, 'rows'));
    ok('rows: има #sd-rows, чипове по тип/статус и Excel', !!h.doc.getElementById('sd-rows') && !!mod(h).querySelector('button[onclick*="setSDTypeFilter"]') && !!mod(h).querySelector('button[onclick*="setSDFilter"]') && !!mod(h).querySelector('button[onclick*="exportSDExcel"]'));
    ok('rows: няма карти на бланки и няма секцията с непрегледани', cards(h).length === 0 && !/чакат преглед/.test(mod(h).textContent));
  }

  section('7. #sd-waiting-note е над превключвателя в двата изгледа (обект)');
  {
    const myLines = [line('w-1', { report_id: 'r-w', type: 'return', status: 'pending', warehouse_response: 'sent', supplier: WH })];
    const myRep = [rep('r-w', { direction: 'interstore', counterpart: WH, reviewed: true })];
    const h = env(STORE_USER, myRep, myLines, { dirTab: 'interstore' });
    for (const v of ['reports', 'rows']) {
      h.w.sdView = v; guard('рендер ' + v, () => h.w.renderStockDiff());
      const note = h.doc.getElementById('sd-waiting-note');
      ok(v + ': бележката се вижда', !!note);
      ok(v + ': над превключвателя', before(note, sw(h)), note ? 'има' : 'няма');
    }
  }

  section('8. скокове: отварят правилния изглед');
  {
    /* 8а. sdActionsGoto(repId) от изглед „Редове“ → „Бланки“ (картата с действията е там) */
    const h = env(WHUSER, REPORTS, LINES);
    h.w.sdView = 'rows'; guard('рендер', () => h.w.renderStockDiff());
    guard('sdActionsGoto()', () => h.w.sdActionsGoto('r-i1'));
    ok('sdActionsGoto → „Бланки“ и записано', h.w.sdView === 'reports' && ls(h) === 'reports', h.w.sdView + ' / ' + ls(h));
    ok('и бланката е на екрана (котвата diff-rep-*)', !!h.doc.getElementById('diff-rep-r-i1'));
    /* 8б. тостът „Разлики: N бланки чакат вашата реакция“ → отваря „Бланки“ */
    const t = env(CVETI, REPORTS, LINES);
    t.w.sdView = 'rows'; t.w.localStorage.setItem(KEY, 'rows');
    t.w.sdBadgePulse(1); t.w.sdBadgePulse(2);
    const toast = t.doc.getElementById('co-toast');
    ok('известието се показва', !!toast);
    if (toast) guard('клик на известието', () => toast.onclick && toast.onclick());
    ok('клик на известието → изглед „Бланки“', t.w.sdView === 'reports' && ls(t) === 'reports', t.w.sdView + ' / ' + ls(t));
    /* 8в. sdOpenReportsView() е ползваният от скокове отвън помощник */
    const o = env(CVETI, REPORTS, LINES);
    o.w.sdView = 'rows';
    o.w.sdOpenReportsView();
    ok('sdOpenReportsView() сменя на „Бланки“ без да рендира', o.w.sdView === 'reports' && ls(o) === 'reports');
    /* 8г. генерични препратки към модула (таб, Бюлетин) показват запомнения изглед */
    const g = env(CVETI, REPORTS, LINES);
    g.w.localStorage.setItem(KEY, 'rows');
    g.w.eval(fs.readFileSync(path.join(ROOT, 'stock-differences.js'), 'utf8'));
    g.w.diffReports = JSON.parse(JSON.stringify(REPORTS)); g.w.sdData = JSON.parse(JSON.stringify(LINES)); g.w.sdFilter = 'all'; /* презареждането на модула нулира данните */
    guard('renderStockDiff()', () => g.w.renderStockDiff());
    ok('showModule(\'stock-diff\') без специален скок → запомненият изглед', g.w.sdView === 'rows' && !!g.doc.getElementById('sd-rows'));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
