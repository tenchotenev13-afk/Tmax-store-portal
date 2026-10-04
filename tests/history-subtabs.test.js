/* История: два подтаба („📅 Дневен преглед" / „🔍 Търсене по период"), свиваеми
   полета на търсачката, карти с auto-fit, закачени хедъри (.tbl-compact) във
   всички таблици, 7/7 колони в „Дневен преглед", „Каси" с заглавие на
   „Детайли" и бутон само на първия ПОС ред за магазин+ден.

   Изборът на подтаб се помни в localStorage (temax_hist_subtab), в try/catch.
   Заявките, печатът и Excel износът не са пипани.

   Пускане: node tests/history-subtabs.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const KEY = 'temax_hist_subtab';
const D = '2026-09-10', D2 = '2026-09-11';

const kasa = (id, store, date, pos) => ({ id, store_name: store, date, pos_number: pos, cashier_name: 'Каса ' + pos, cash_turnover: 100 + pos, counted_cash: 90 + pos, razlika: pos === 2 ? -3.5 : 0, status: 'confirmed', ready_at: null, inkaso_1: 0, inkaso_2: 0 });
const KASA = [kasa('k1', 'Троян', D, 1), kasa('k2', 'Троян', D, 2), kasa('k3', 'Ловеч', D, 1), kasa('k4', 'Троян', D2, 1)];
const DATA = {
  transport_orders: [1, 2, 3].map(i => ({ id: 't' + i, date: D, hour: '10:00', store_name: 'Троян', customer_name: 'Т' + i, phone: '088', product: 'ПАРКЕТ', sap: '1', address: 'гр. Х', delivery: '2026-09-20', status: 'pending', awaiting_stock: false })),
  client_orders: [1, 2, 3].map(i => ({ id: 'c' + i, in_num: 'Троян-' + i, date: D, hour: '11:00', store_name: 'Троян', customer_name: 'К' + i, phone: '088', items: [{ product: 'МИВКА', sap: '2', qty: 1, unit: 'бр.' }], delivery: '2026-09-22', status: 'pending', group_id: null })),
  kasa_reports: KASA,
  kasa_storno: [1, 2, 3].map(i => ({ id: 's' + i, store_name: 'Троян', storno_date: D, original_receipt_date: D, articles: '96776', article_name: 'СТАРО', returned_sum: 31.76, replacement_articles: '0', replacement_article_name: '', new_sum: 0, reason: 'ГРЕШНА', status: 'draft', kasa_storno_items: [{ kind: 'returned', line_no: 1, sap_code: '96776', article_name: 'ПАРКЕТ' }] })),
  kasa_zoborot: [], kasa_documents: [], kasa_glavna: [],
  stores: ['Троян', 'Ловеч', 'Севлиево', 'Габрово', 'Раднево'].map(name => ({ name }))
};

function env(extra) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js', 'history.js', 'notifications.js'],
    user: ADMIN, data: Object.assign({}, DATA, extra || {})
  });
  h.w.transportOrders = []; h.w.clientOrders = [];
  return h;
}
const $ = (h, id) => h.doc.getElementById(id);
const shown = (h, id) => $(h, id).style.display !== 'none';
const ls = h => { try { return h.w.localStorage.getItem(KEY); } catch (e) { return 'ERR'; } };
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); await new Promise(r => setTimeout(r, 60)); };

(async function run() {
  section('1. два подтаба; по подразбиране „Дневен преглед"');
  {
    const h = env();
    guard('renderHistoryShell()', () => h.w.renderHistoryShell());
    ok('има двата бутона', !!$(h, 'h-st-daily') && !!$(h, 'h-st-search') && /Дневен преглед/.test($(h, 'h-st-daily').textContent) && /Търсене по период/.test($(h, 'h-st-search').textContent));
    ok('показва се само „Дневен преглед"', shown(h, 'h-sub-daily') && !shown(h, 'h-sub-search'));
    ok('и #daily-overview е в него, а полетата на търсачката — в другия', $(h, 'h-sub-daily').contains($(h, 'daily-overview')) && $(h, 'h-sub-search').contains($(h, 'h-from')));
    ok('бутонът на активния подтаб е тъмен', /#2f2f2f/.test($(h, 'h-st-daily').getAttribute('style')) || $(h, 'h-st-daily').style.background !== 'rgb(255, 255, 255)');
    realClick(h.w, $(h, 'h-st-search'));
    ok('клик на „Търсене по период" → показва се само то', !shown(h, 'h-sub-daily') && shown(h, 'h-sub-search'));
    ok('и изборът се записва в localStorage', ls(h) === 'search', ls(h));
    guard('ново рендиране на шела', () => h.w.renderHistoryShell());
    ok('при ново отваряне пак е „Търсене по период"', !shown(h, 'h-sub-daily') && shown(h, 'h-sub-search'));
    realClick(h.w, $(h, 'h-st-daily'));
    ok('обратно към „Дневен преглед" → записва „daily"', shown(h, 'h-sub-daily') && !shown(h, 'h-sub-search') && ls(h) === 'daily', ls(h));
  }

  section('1б. localStorage хвърля грешка → няма грешка, подразбиране „Дневен преглед"');
  {
    const h = env();
    const P = h.w.Storage.prototype;
    P.getItem = function () { throw new Error('blocked'); };
    P.setItem = function () { throw new Error('blocked'); };
    ok('шелът се рендира', guard('renderHistoryShell()', () => h.w.renderHistoryShell()));
    ok('показва „Дневен преглед"', shown(h, 'h-sub-daily') && !shown(h, 'h-sub-search'));
    ok('кликът пак работи', guard('клик', () => realClick(h.w, $(h, 'h-st-search'))) && shown(h, 'h-sub-search') && !shown(h, 'h-sub-daily'));
  }

  section('1в. без повтарящи се заглавия под подтабовете');
  {
    const h = env();
    guard('renderHistoryShell()', () => h.w.renderHistoryShell());
    const count = (root, s) => (root.textContent.match(new RegExp(s, 'g')) || []).length;
    ok('„Търсене по период“ е точно веднъж в целия шел (само подтабът)', count($(h, 'mod-history'), 'Търсене по период') === 1, String(count($(h, 'mod-history'), 'Търсене по период')));
    ok('и то е бутонът на подтаба, не в картата', $(h, 'h-st-search').textContent.indexOf('Търсене по период') >= 0 && count($(h, 'h-sub-search'), 'Търсене по период') === 0);
    ok('картата с полетата и бутонът „Търси →“ си остават', !!$(h, 'h-sub-search').querySelector('.card') && !!$(h, 'h-from') && !!h.doc.querySelector('[onclick="runHistorySearch()"]'));
    guard('loadDailyOverview()', () => h.w.loadDailyOverview());
    await settle();
    const dv = $(h, 'daily-overview');
    ok('надписът „📅 Дневен преглед“ пред бутоните Вчера/Завчера е махнат', !/📅 Дневен преглед(?! —)/.test(dv.textContent) && /Вчера\(/.test(dv.textContent), dv.textContent.slice(0, 120));
    ok('бутоните Вчера / Завчера / По-завчера и датата остават', /Вчера/.test(dv.textContent) && /Завчера/.test(dv.textContent) && /По-завчера/.test(dv.textContent) && !!dv.querySelector('input[type=date]'));
    ok('а „Дневен преглед — ДАТА“ над картите остава', /Дневен преглед — \d{2}\.\d{2}\.\d{4}/.test(dv.textContent), dv.textContent.slice(0, 160));
  }

  section('2. външни извиквания: goToStornoHistory() води към подтаба с резултатите');
  {
    const h = env();
    guard('loadHistory()', () => h.w.loadHistory());
    ok('loadHistory() не хвърля и показва подразбирания подтаб', shown(h, 'h-sub-daily'));
    guard('goToStornoHistory()', () => h.w.goToStornoHistory());
    await settle();
    ok('стига до „Търсене по период"', shown(h, 'h-sub-search') && !shown(h, 'h-sub-daily'));
    ok('типът е сторно и резултатите се виждат', $(h, 'h-type').value === 'storno' && /Сторно бележки/.test($(h, 'h-results').textContent), $(h, 'h-results').textContent.slice(0, 80));
  }

  section('3. търсачка и карти: без фиксирани колони');
  {
    const h = env();
    guard('renderHistoryShell()', () => h.w.renderHistoryShell());
    const form = $(h, 'h-from').parentNode.parentNode;
    ok('няма grid 1fr 1fr 1fr 1fr auto', !/grid-template-columns/.test(form.getAttribute('style')), form.getAttribute('style'));
    ok('flex с wrap', /display:flex/.test(form.getAttribute('style')) && /flex-wrap:wrap/.test(form.getAttribute('style')));
    ok('полетата са min-width:160px', ['h-from', 'h-to', 'h-store', 'h-type'].every(id => /min-width:160px/.test($(h, id).parentNode.getAttribute('style'))));
    ok('„Търси →" е на същия ред (в същия flex)', $(h, 'h-from').parentNode.parentNode.contains(h.doc.querySelector('[onclick="runHistorySearch()"]')));
    $(h, 'h-from').value = '2026-09-01'; $(h, 'h-to').value = '2026-09-30';
    realClick(h.w, h.doc.querySelector('[onclick="runHistorySearch()"]'));
    await settle();
    const res = $(h, 'h-results').innerHTML;
    ok('картите с броеве са auto-fit/minmax(200px', /repeat\(auto-fit,minmax\(200px,1fr\)\)/.test(res) && !/repeat\(4,1fr\)/.test(res));
    const wraps = Array.from($(h, 'h-results').querySelectorAll('.tbl-wrap'));
    ok('и 4-те таблици (Транспорт, Клиентски, Каси, Сторно) са .tbl-wrap.tbl-compact', wraps.length === 4 && wraps.every(w => w.classList.contains('tbl-compact')), wraps.length + ' / ' + wraps.map(w => w.className).join('|'));
    ok('без фиксирани ширини на колоните (.tbl-auto)', wraps.every(w => w.classList.contains('tbl-auto')));
    const css = Array.from(h.doc.querySelectorAll('style')).map(s => s.textContent).join(' ');
    ok('CSS: .tbl-compact.tbl-auto → table-layout:auto', /\.tbl-compact\.tbl-auto table\{table-layout:auto;\}/.test(css));
  }

  section('4. „Каси": заглавие на „Детайли", бутон само на първия ПОС ред за магазин+ден');
  {
    const h = env();
    guard('renderHistoryShell()', () => h.w.renderHistoryShell());
    $(h, 'h-from').value = '2026-09-01'; $(h, 'h-to').value = '2026-09-30'; $(h, 'h-type').value = 'kasa';
    realClick(h.w, h.doc.querySelector('[onclick="runHistorySearch()"]'));
    await settle();
    const table = $(h, 'h-results').querySelector('table');
    const ths = Array.from(table.querySelectorAll('thead th')).map(t => t.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    ok('10 заглавия, последното е „Детайли"', ths.length === 10 && ths[9] === 'Детайли', ths.join('|'));
    ok('всеки ред има 10 клетки (заглавия = клетки)', rows.length === 4 && rows.every(r => r.children.length === 10), rows.map(r => r.children.length).join(','));
    const btns = Array.from(table.querySelectorAll('button'));
    ok('„Детайли →" е 3 пъти (Троян/10.09, Ловеч/10.09, Троян/11.09) — не 4', btns.length === 3, String(btns.length));
    const lastCells = rows.map(r => r.children[9].textContent.trim());
    ok('вторият ПОС ред на Троян/10.09 е с празна клетка', lastCells.filter(t => t === '').length === 1 && lastCells.indexOf('') === rows.findIndex(r => /Каса 2/.test(r.textContent)) , JSON.stringify(lastCells));
    const calls = [];
    h.w.openKasaDetail = function () { calls.push(Array.prototype.slice.call(arguments)); };
    btns.forEach(b => realClick(h.w, b));
    const got = calls.map(a => a.join('|')).sort().join(',');
    ok('кликът отваря openKasaDetail с правилните аргументи за всеки ден', got === ['Ловеч|' + D, 'Троян|' + D, 'Троян|' + D2].sort().join(','), got);
  }

  section('4б. Сторно (admin): заглавие „Действие“, th = td');
  {
    const h = env();
    guard('renderHistoryShell()', () => h.w.renderHistoryShell());
    $(h, 'h-from').value = '2026-09-01'; $(h, 'h-to').value = '2026-09-30'; $(h, 'h-type').value = 'storno';
    realClick(h.w, h.doc.querySelector('[onclick="runHistorySearch()"]'));
    await settle();
    const table = $(h, 'h-results').querySelector('table');
    const ths = Array.from(table.querySelectorAll('thead th')).map(x => x.textContent.trim());
    ok('11 заглавия, последното е „Действие“', ths.length === 11 && ths[10] === 'Действие', ths.join('|'));
    const rows = Array.from(table.querySelectorAll('tbody tr')).filter(r => r.children.length === ths.length);
    ok('редовете с данни имат толкова клетки, колкото заглавия', rows.length === 3, String(rows.length));
    ok('бутонът „Върни за коментар“ е в колоната „Действие“', rows.every(r => /Върни за коментар/.test(r.children[10].textContent)));
    const nonAdmin = boot({ modules: ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js', 'history.js', 'notifications.js'], user: Object.assign({}, ADMIN, { role: 'logistics' }), data: DATA });
    nonAdmin.w.transportOrders = []; nonAdmin.w.clientOrders = [];
    guard('renderHistoryShell()', () => nonAdmin.w.renderHistoryShell());
    nonAdmin.doc.getElementById('h-from').value = '2026-09-01'; nonAdmin.doc.getElementById('h-to').value = '2026-09-30'; nonAdmin.doc.getElementById('h-type').value = 'storno';
    realClick(nonAdmin.w, nonAdmin.doc.querySelector('[onclick="runHistorySearch()"]'));
    await settle();
    const t2 = nonAdmin.doc.getElementById('h-results').querySelector('table');
    ok('без право да връща (logistics): 10 заглавия, без „Действие“', Array.from(t2.querySelectorAll('thead th')).length === 10 && !/Действие/.test(t2.querySelector('thead').textContent));
  }

  section('5. „Дневен преглед": 7 заглавия = 7 клетки, закачен хедър');
  {
    const h = env({ kasa_reports: KASA });
    guard('loadHistory()', () => h.w.loadHistory());
    await new Promise(r => setTimeout(r, 400)); await settle();
    const wrap = $(h, 'daily-overview').querySelector('.tbl-wrap');
    ok('таблицата е .tbl-wrap.tbl-compact', !!wrap && wrap.classList.contains('tbl-compact'), wrap && wrap.className);
    if (wrap) {
      const ths = Array.from(wrap.querySelectorAll('thead th')).map(t => t.textContent.trim());
      const rows = Array.from(wrap.querySelectorAll('tbody tr'));
      ok('7 заглавия, последното е „Детайли"', ths.length === 7 && ths[6] === 'Детайли', ths.join('|'));
      ok('всеки ред има 7 клетки', rows.length > 0 && rows.every(r => r.children.length === 7), rows.map(r => r.children.length).join(','));
      const cards = $(h, 'daily-overview').innerHTML;
      ok('картите на дневния преглед също са auto-fit', /repeat\(auto-fit,minmax\(200px,1fr\)\)/.test(cards) && !/repeat\(4,1fr\)/.test(cards));
    }
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
