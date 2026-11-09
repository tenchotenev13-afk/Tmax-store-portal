/* „➖ Минуси“, т.3 — суми по продажни цени в „📋 Дневен“, САМО за офиса
   (09.11.2026, сесия minusi-co-values; искане на Миглена 06.11, решение от
   21.10: обектът НЕ вижда суми). Цените — product_catalog.sale_price (VKP2).

   Заковано (истински клик, фалшив PostgREST):
     1. обект — нито колона, нито заявка към product_catalog, нито co_comment в select-а;
     2. офис — „Стойност минус“ = ОСТАТЪКЪТ (не първоначалното количество) × цена;
        „Стойност заметнат“ — само при един заметнат код; „Разлика“ — при двете;
        без цена → „—“ + „няма цена“; два кода → „—“ + „няколко кода“; различна
        мярка → „⚠ мярка“ с двете единици в title; ред „Общо“ (tfoot);
     3. цените — явен select, само кодовете в изгледа, на порции;
     4. „💾“ на офиса — PATCH САМО на co_comment; черновата оцелява при прерисуване;
     5. Excel — офис: четирите колони накрая; обект: непроменен;
     6. грешка при цените → сив ред „Цените не се заредиха“, таблицата е там;
     7. „Всички обекти“ — редът „Общо“ е подравнен (colspan 11).

   Мутационна проверка (09.11.2026) — всеки вариант пуснат и паднал:
     C1 стойност по първоначалното количество, не по остатъка     → пада
     C2 заметнат при няколко кода — първият, не „—“               → пада
     C3 без проверката за мярка                                   → пада
     C4 цените се теглят и при обекта                             → пада
     C5 коментарът минава през тяло с още полета                  → пада
     C6 грешка при цените показва „няма цена“ вместо „—“              → пада
   Пускане:  node tests/minusi-co-values.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const GD = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: 'Гоце Делчев' };
const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const PLANTS = [{ plant: '7519', store_name: 'Гоце Делчев' }];
const REASONS = [{ id: 1, label: 'Клиентска поръчка', active: true, sort: 1, requires_note: true, excluded_from_revision: true },
  { id: 2, label: 'Не е преналепено', active: true, sort: 2, requires_note: false, excluded_from_revision: false }];
const PRICES = { '10001': { p: 2.5, u: 'БР' }, '10003': { p: 4, u: 'БР' }, '10004': { p: 3, u: 'БР' }, '20002': { p: 1.5, u: 'БР' }, '20003': { p: 9, u: 'БР' } };

let seq = 0;
const mv = (material, date, qty, extra) => Object.assign({
  id: 'mv-' + (++seq), plant: '7519', store_name: 'Гоце Делчев', material, material_desc: 'АРТИКУЛ ' + material,
  mvt_type: '955', qty, uom: 'БР', mat_doc: '49033' + String(seq).padStart(5, '0'), doc_item: '1', doc_year: 2026, posting_date: date,
  real_code: null, reason_id: null, employee_name: null, note: null, action: null, filled_by: null, filled_at: null, co_comment: null
}, extra || {});
const MOVS = () => { seq = 0; return [
  mv('10001', '2026-11-02', 5, { real_code: '20002', reason_id: 2 }),                 /* mv-1: остатък 3 → 7,50 / 4,50 / 3,00 */
  mv('10002', '2026-11-02', 1, { real_code: '20002', reason_id: 2 }),                 /* mv-2: без цена; заметнат 1,50 */
  mv('10003', '2026-11-03', 2, { uom: 'M2', real_code: '20002, 20003', reason_id: 2 }), /* mv-3: 8,00 ⚠ мярка; два кода → — */
  mv('10004', '2026-11-04', 1),                                                       /* mv-4: 3,00; без заметнат */
  mv('10001', '2026-11-05', -2, { mvt_type: '956' })                                  /* mv-5: 956 — закрива 2 от mv-1 */
]; };

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
    const body = init && init.body ? JSON.parse(init.body) : null;
    db.log.push({ m, tbl, q, body });
    if (m === 'GET') {
      if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: 'Гоце Делчев' }]);
      if (tbl === 'minus_plants') return resp(200, PLANTS);
      if (tbl === 'minus_reasons') return resp(200, REASONS);
      if (tbl === 'minus_movements') {
        if (/offset=[1-9]/.test(q)) return resp(200, []);
        return resp(200, db.movs.map(x => Object.assign({}, x)));
      }
      if (tbl === 'product_catalog') {
        if (db.priceFail) return resp(500, { message: 'boom' });
        const codes = ((q.match(/sap_code=in\.\(([^)]*)\)/) || [])[1] || '').split(',').map(s => s.replace(/^"|"$/g, ''));
        return resp(200, codes.filter(c => PRICES[c]).map(c => ({ sap_code: c, sale_price: PRICES[c].p, sale_price_unit: PRICES[c].u })));
      }
      return resp(200, []);
    }
    if (m === 'PATCH') {
      const id = (q.match(/id=eq\.([^&]+)/) || [])[1];
      if (tbl === 'minus_movements') db.movs.filter(x => x.id === id).forEach(x => Object.assign(x, body));
      return resp(204, null);
    }
    return resp(405, { message: 'not in fake' });
  };
}
function env(user, o) {
  const h = boot({ modules: ['client-orders.js', 'revaluation.js', 'revisions.js', 'notifications.js', 'minusi.js'], user, data: {} });
  const db = Object.assign({ movs: MOVS(), log: [] }, o || {});
  install(h, db);
  h.cap = null;
  h.w.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: aoa => ({ aoa }), book_append_sheet: (wb, ws) => { h.cap = ws.aoa; } }, writeFile: () => {} };
  return { h, db };
}
async function open(h) { await h.w.loadMinusi(); for (let i = 0; i < 8; i++) await ticks(); }
const row = (h, id) => h.doc.getElementById('mn-row-' + id);
const cell = (h, id, cls) => { const r = row(h, id); const c = r && r.querySelector('.' + cls); return c ? c.textContent : null; };
const priceGets = db => db.log.filter(x => x.m === 'GET' && x.tbl === 'product_catalog');

(async function run() {
  section('1. Обектът — нищо ново');
  {
    const { h, db } = env(GD); await open(h);
    ok('таблицата е там (4 реда 955)', h.doc.querySelectorAll('#mn-daily tbody tr').length === 4);
    ok('няма колони за суми', h.doc.querySelectorAll('.mn-val-h, .mn-val-minus, .mn-cocmt, #mn-val-total').length === 0);
    ok('нула заявки към product_catalog', priceGets(db).length === 0, priceGets(db).length);
    const mq = db.log.filter(x => x.tbl === 'minus_movements' && x.m === 'GET').map(x => x.q).join(' ');
    ok('select-ът на обекта е без co_comment', mq.length > 0 && mq.indexOf('co_comment') < 0, mq);
    realClick(h.w, h.doc.getElementById('mn-excel'), 'Excel обект'); await ticks(3);
    ok('Excel на обекта — без колоните на офиса (последна „Незаприходена?“)', h.cap && h.cap[0][h.cap[0].length - 1] === 'Незаприходена?' && h.cap[0].join('|').indexOf('Стойност') < 0, h.cap && h.cap[0].join('|'));
    h.close();
  }

  section('2. Офисът — стойностите');
  {
    const { h, db } = env(ADMIN, {}); h.w.MN_PRICE_BATCH = 2; await open(h);
    /* Ширината при 1280px е мерена в браузър (jsdom не смята лейаут) — тук се
       заковават само двете решения, от които зависи: пренасяне на заглавията
       (бие глобалното th{nowrap}) и поле за коментар 76px с „💾“ отдолу. */
    ok('заглавията на сумите се пренасят (white-space:normal)', Array.from(h.doc.querySelectorAll('th.mn-val-h')).every(t => /white-space:normal/.test(t.getAttribute('style'))));
    const ci = h.doc.getElementById('mn-cocmt-mv-1'), cb = row(h, 'mv-1').querySelector('.mn-cocmt-save');
    ok('полето за коментар е 76px, „💾“ — на нов ред', !!ci && /width:76px/.test(ci.getAttribute('style')) && !!cb && /display:block/.test(cb.getAttribute('style')));
    const heads = Array.from(h.doc.querySelectorAll('#mn-daily thead th')).map(t => t.textContent);
    ok('четирите колони накрая', heads.slice(-4).join('|') === 'Стойност минус|Стойност заметнат|Разлика|Коментар (офис)', heads.join('|'));
    const g = priceGets(db);
    ok('цените — явен select (sap_code, sale_price, sale_price_unit)', g.length > 0 && g.every(x => /select=sap_code,sale_price,sale_price_unit(&|$)/.test(x.q)), g.map(x => x.q).join('\n'));
    const asked = [].concat(...g.map(x => ((x.q.match(/sap_code=in\.\(([^)]*)\)/) || [])[1] || '').split(',').map(s => s.replace(/^"|"$/g, ''))));
    ok('само кодовете в изгледа: материалите + единичният заметнат (без „20002, 20003“ като код)', asked.slice().sort().join(',') === '10001,10002,10003,10004,20002', asked.join(','));
    ok('на порции (по 2 → 3 заявки)', g.length === 3, g.length);
    ok('частично закрит ред: остатък 3 × 2,50 = 7,50 € (не 5 × 2,50)', cell(h, 'mv-1', 'mn-val-minus') === '7,50 €', cell(h, 'mv-1', 'mn-val-minus'));
    ok('заметнат 20002: 3 × 1,50 = 4,50 €', cell(h, 'mv-1', 'mn-val-real') === '4,50 €', cell(h, 'mv-1', 'mn-val-real'));
    ok('разлика 3,00 €', cell(h, 'mv-1', 'mn-val-diff') === '3,00 €', cell(h, 'mv-1', 'mn-val-diff'));
    ok('без цена на материала → „—“ + „няма цена“', cell(h, 'mv-2', 'mn-val-minus') === '—няма цена', cell(h, 'mv-2', 'mn-val-minus'));
    ok('… заметнатият пак е 1,50 €, разлика „—“', cell(h, 'mv-2', 'mn-val-real') === '1,50 €' && cell(h, 'mv-2', 'mn-val-diff') === '—');
    ok('два заметнати кода → „—“ + „няколко кода“', cell(h, 'mv-3', 'mn-val-real') === '—няколко кода', cell(h, 'mv-3', 'mn-val-real'));
    const w3 = row(h, 'mv-3').querySelector('.mn-val-minus .mn-uom-warn');
    ok('мярка M2 срещу цена в БР → „⚠ мярка“ с двете единици', !!w3 && w3.textContent === '⚠ мярка' && w3.getAttribute('title') === 'цена за БР · минус в M2' && cell(h, 'mv-3', 'mn-val-minus') === '8,00 €⚠ мярка', cell(h, 'mv-3', 'mn-val-minus'));
    ok('същата мярка → без „⚠ мярка“', !row(h, 'mv-1').querySelector('.mn-uom-warn'));
    ok('без заметнат код → „—“ без надпис', cell(h, 'mv-4', 'mn-val-real') === '—', cell(h, 'mv-4', 'mn-val-real'));
    const tot = id => { const e = h.doc.querySelector('#mn-val-total .' + id); return e ? e.textContent : null; };
    ok('„Общо“ е в tfoot', !!h.doc.querySelector('#mn-daily tfoot #mn-val-total'));
    ok('„Общо“: минус 18,50 €, заметнат 6,00 €, разлика 3,00 €', tot('mn-tot-minus') === '18,50 €' && tot('mn-tot-real') === '6,00 €' && tot('mn-tot-diff') === '3,00 €',
      [tot('mn-tot-minus'), tot('mn-tot-real'), tot('mn-tot-diff')].join(' / '));
    const tr = h.doc.getElementById('mn-val-total');
    ok('„Общо“ е подравнен: colspan 10 + 3 суми + 1', tr && tr.cells[0].getAttribute('colspan') === '10' && tr.cells.length === 5);
    ok('без сив ред за грешка', !h.doc.getElementById('mn-price-err'));

    section('3. Коментар (офис)');
    const inp = h.doc.getElementById('mn-cocmt-mv-1');
    inp.value = 'проверено с Миглена';
    h.w.mnRenderBody();
    ok('черновата оцелява при прерисуване', h.doc.getElementById('mn-cocmt-mv-1').value === 'проверено с Миглена');
    const n0 = db.log.filter(x => x.m === 'PATCH').length;
    await realClick(h.w, row(h, 'mv-1').querySelector('.mn-cocmt-save'), '💾'); for (let i = 0; i < 4; i++) await ticks();
    const p = db.log.filter(x => x.m === 'PATCH').slice(n0);
    ok('един PATCH към minus_movements, id=eq.mv-1', p.length === 1 && p[0].tbl === 'minus_movements' && p[0].q === 'id=eq.mv-1', JSON.stringify(p.map(x => x.q)));
    ok('тялото е САМО co_comment', p[0] && Object.keys(p[0].body).join(',') === 'co_comment' && p[0].body.co_comment === 'проверено с Миглена', p[0] && JSON.stringify(p[0].body));
    ok('причината / служителят на реда не са пипнати', db.movs[0].reason_id === 2 && db.movs[0].filled_by === null);

    section('4. Excel на офиса');
    realClick(h.w, h.doc.getElementById('mn-excel'), 'Excel офис'); await ticks(3);
    const hd = h.cap ? h.cap[0] : [];
    ok('четирите колони накрая', hd.slice(-4).join('|') === 'Стойност минус (€)|Стойност заметнат (€)|Разлика (€)|Коментар (офис)', hd.join('|'));
    const x1 = h.cap && h.cap.find(r => r[0] === '10001');
    ok('ред 10001: 7,5 / 4,5 / 3 / коментарът', x1 && x1.slice(-4).join('|') === '7.5|4.5|3|проверено с Миглена', x1 && x1.slice(-4).join('|'));
    const x2 = h.cap && h.cap.find(r => r[0] === '10002');
    ok('ред без цена: празно, не 0', x2 && x2[x2.length - 4] === '' && x2[x2.length - 2] === '', x2 && x2.slice(-4).join('|'));

    section('5. Печат — без суми');
    h.w.mnPrint(); await ticks(2);
    const pr = h.doc.getElementById('mod-print');
    ok('в печата няма „Стойност“ и „€“', !!pr && pr.textContent.indexOf('Стойност') < 0 && pr.textContent.indexOf('€') < 0);
    h.close();
  }

  section('6. Грешка при цените');
  {
    const { h, db } = env(ADMIN, { priceFail: true }); await open(h);
    ok('сив ред „Цените не се заредиха“', !!h.doc.getElementById('mn-price-err') && h.doc.getElementById('mn-price-err').textContent === 'Цените не се заредиха');
    ok('таблицата и коментарът са там', h.doc.querySelectorAll('#mn-daily tbody tr').length === 4 && !!h.doc.getElementById('mn-cocmt-mv-1'));
    ok('стойностите са „—“, „Общо“ — „—“', cell(h, 'mv-1', 'mn-val-minus') === '—' && h.doc.querySelector('#mn-val-total .mn-tot-minus').textContent === '—');
    h.close();
  }

  section('7. „Всички обекти“');
  {
    const { h } = env(ADMIN); await open(h);
    h.w.mnSetStore('__all__'); for (let i = 0; i < 10; i++) await ticks();
    const tr = h.doc.getElementById('mn-val-total');
    ok('колона „Обект“ и „Общо“ с colspan 11', !!h.doc.querySelector('#mn-daily .mn-store') && tr && tr.cells[0].getAttribute('colspan') === '11');
    ok('стойностите и тук', cell(h, 'mv-1', 'mn-val-minus') === '7,50 €', cell(h, 'mv-1', 'mn-val-minus'));
    h.close();
  }

  report();
})();
