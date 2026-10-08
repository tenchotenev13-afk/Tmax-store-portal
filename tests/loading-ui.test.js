/* Товарни листи и Зареждане — само визуално: закачена колона с бутоните и закачена матрица.

   Четирите работни таблици на loading.js са „ll-tbl“; там, където последната колона е с бутоните, нейните th/td са
   „ll-act“ (закачени вдясно, фонът на реда не прозира). Изключение: прегледът на склада — последната му колона е
   „Получено“ (статус, не бутони), затова там има само „ll-tbl“. Матрицата в Зареждане (.sup-matrix) е със закачен
   заглавен ред и закачена колона „Име“; таблицата на формата е tbl-compact tbl-auto.

   Печатът (lp-*), PDF-ът, етикетите с QR, имейлите и артикулите са същите байт по байт — еталонът в
   loading-ui.expected.json е снет с --dump от версията ПРЕДИ промяната (origin/main). Часовникът е замразен,
   а зоната е Europe/Sofia (CI е UTC).

   Пускане:  node tests/loading-ui.test.js .
   Еталон от друга версия:  node tests/loading-ui.test.js <корен> --dump */
'use strict';
process.env.TZ = 'Europe/Sofia'; // еталонът е снет в българско време — CI в GitHub е UTC
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, ticks } = H;
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const DUMP = process.argv.indexOf('--dump') >= 0;
const clone = x => JSON.parse(JSON.stringify(x));

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

const L_DRAFT = { id: 'L1', warehouse: WH, list_date: '2026-10-05', status: 'draft', executed_by: 'Иван Петров', comment: 'Камионът тръгва в 6:00',
  created_by: 'Склад Търговище', created_at: '2026-10-05T06:00:00.000Z', sent_at: null, done_at: null };
const L_SENT = { id: 'L2', warehouse: WH, list_date: '2026-10-02', status: 'sent', executed_by: 'Иван Петров', comment: 'Курс сутрин',
  created_by: 'Склад Търговище', created_at: '2026-10-02T06:00:00.000Z', sent_at: '2026-10-02T07:00:00.000Z', done_at: null };
function item(o) {
  return Object.assign({ id: 'I', list_id: 'L2', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 2, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null, partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null, created_at: '2026-10-02T06:00:00.000Z', products: [] }, o);
}
const PRODS = [{ sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 12, cartons: 2 }, { sap_code: '5001', product_name: 'ТРЪБА 1/2" PPR', unit: 'л.м', qty: 6.5, cartons: null }];
const ITEMS = [
  item({ id: 'a1', position: 1, pallet_no: 1, purchase_doc: 'ИЗХ-100', warehouse_comment: 'кашон отгоре', products: PRODS }),
  item({ id: 'a2', position: 2, pallet_no: 1, purchase_doc: 'ИЗХ-101', received: true, received_by: 'Иван', received_at: '2026-10-03T09:00:00.000Z' }),
  item({ id: 'a3', position: 3, pallet_no: 2, purchase_doc: 'ИЗХ-102', missing: true, missing_by: 'Иван', missing_at: '2026-10-03T09:30:00.000Z', store_comment: 'не е дошъл', partial: true }),
  item({ id: 'a4', position: 4, kind: 'roll', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-103' }),
  item({ id: 'a5', position: 5, kind: 'bulk', pallet_no: null, pallet_total: null, purchase_doc: null, warehouse_comment: 'насипни' }),
  item({ id: 'b1', position: 6, store_name: 'Гоце Делчев', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-900' })
];
const ITEMS_DRAFT = ITEMS.map(x => Object.assign({}, x, { id: 'd' + x.id, list_id: 'L1', received: false, missing: false, received_by: null, received_at: null }));
const USERS = [{ email: 'petrich@temax.bg', store_name: 'Петрич', active: true }, { email: 'gd@temax.bg', store_name: 'Гоце Делчев', active: true }, { email: 'sklad.tg@temax.bg', store_name: WH, active: true }];

function freeze(w, iso) {
  const Real = w.Date, ms = new Real(iso + 'T10:00:00').getTime();
  w.Date = class extends Real { constructor(...a) { if (!a.length) super(ms); else super(...a); } static now() { return ms; } };
}
function env(user) {
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'push.js', 'email.js', 'loading.js'],
    user, confirm: true,
    data: {
      loading_lists: () => [L_DRAFT, L_SENT].map(r => Object.assign({}, r)),
      loading_list_items: function (url) {
        let r = ITEMS.concat(ITEMS_DRAFT).map(x => Object.assign({}, x, { loading_list_products: (x.products || []).map(p => Object.assign({}, p)) }));
        const lm = /list_id=eq\.([^&]*)/.exec(url); if (lm) r = r.filter(x => x.list_id === decodeURIComponent(lm[1]));
        const sm = /store_name=eq\.([^&]*)/.exec(url); if (sm) r = r.filter(x => x.store_name === decodeURIComponent(sm[1]));
        return r;
      },
      users: USERS, loading_list_products: [], stores: [], contacts: [], transport_orders: [], client_orders: [], loading_list_photos: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  freeze(h.w, '2026-10-06');
  h.w.requestAnimationFrame = cb => setTimeout(cb, 0);
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
async function settle(h) { for (let i = 0; i < 8; i++) await ticks(); }

async function snapshot() {
  const out = {};
  const h = env(WAREHOUSE);
  const rec = { text: [], fonts: [], pages: 0, docs: [] };
  function Doc(cfg) { rec.docs.push(cfg); rec.pages = 1; }
  Doc.prototype.addFileToVFS = function (n) { rec.fonts.push('vfs:' + n); };
  Doc.prototype.addFont = function (f, n, st) { rec.fonts.push(f + '/' + n + '/' + st); };
  Doc.prototype.setFont = function (n, st) { rec.text.push('font:' + n + '/' + st); };
  Doc.prototype.setFontSize = function (s) { rec.text.push('size:' + s); };
  Doc.prototype.splitTextToSize = function (t) { return [String(t)]; };
  Doc.prototype.text = function (t) { rec.text.push(String(t)); };
  Doc.prototype.addPage = function () { rec.pages++; rec.text.push('PAGE'); };
  Doc.prototype.output = function () { return 'data:application/pdf;filename=generated.pdf;base64,UERGREFUQQ=='; };
  ['line', 'rect', 'setDrawColor', 'setFillColor', 'setTextColor', 'setLineWidth', 'roundedRect', 'circle'].forEach(m => { Doc.prototype[m] = function () { rec.text.push(m + ':' + Array.prototype.join.call(arguments, ',')); }; });
  h.w.jspdf = { jsPDF: Doc };
  h.w.llPdfFont = () => Promise.resolve('Rk9OVA==');
  h.w.llQrSvg = (t, mm) => '<svg data-qr="' + t + '" data-mm="' + mm + '"></svg>';
  h.w.showModule = function () {};
  h.w.loadLoadingLists(); await settle(h);
  const L = clone(L_SENT), items = clone(ITEMS);
  const pw = () => (h.doc.getElementById('mod-print') || {}).innerHTML || '';
  const grab = (name, fn) => { try { h.doc.getElementById('mod-print') && (h.doc.getElementById('mod-print').innerHTML = ''); const r = fn(); out[name] = (typeof r === 'string' ? r : '') + '\n#mod-print:\n' + pw(); } catch (e) { out[name] = 'ERR ' + e.message; } };
  grab('printAll', () => h.w.llRenderPrint(L, items));
  grab('printStore', () => h.w.llRenderPrint(L, items, 'Петрич'));
  grab('printPallet', () => h.w.llRenderPalletPrint(L, items.filter(x => x.store_name === 'Петрич' && x.pallet_no === 1 && x.kind === 'pallet')));
  try { out.labelProds = h.w.llLabelProdsHtml ? String(h.w.llLabelProdsHtml({ rows: [items[0]], products: PRODS, docs: [{ doc: 'ИЗХ-100', n: 1, k: 1 }] })) : 'няма'; } catch (e) { out.labelProds = 'ERR ' + e.message; }
  try { const units = h.w.llLabelUnits(items.filter(x => x.store_name === 'Петрич')); out.labelHtml = units.map(u => h.w.llLabelHtml(L, u)).join('\n'); } catch (e) { out.labelHtml = 'ERR ' + e.message; }
  grab('labelsPrint', () => { const units = h.w.llLabelUnits(items.filter(x => x.store_name === 'Петрич')); return h.w.llRenderLabelsPrint(L, units); });
  try { out.mailSent = h.w.llSentHtmlFor(L, 'Петрич', items.filter(x => x.store_name === 'Петрич'), 2); } catch (e) { out.mailSent = 'ERR ' + e.message; }
  try { out.mailClosed = h.w.llClosedHtmlFor(L, items); } catch (e) { out.mailClosed = 'ERR ' + e.message; }
  try { out.mailAdded = h.w.llAddedRowHtmlFor(L, 'Петрич', 'pallet', 'ИЗХ-777', 'Допълнително', PRODS); } catch (e) { out.mailAdded = 'ERR ' + e.message; }
  try { const r = await h.w.llBuildPdf(L, items, 'Петрич'); out.pdf = { name: r && r.name, base64: r && r.base64, text: rec.text.slice(), fonts: rec.fonts.slice(), pages: rec.pages, cfg: rec.docs }; } catch (e) { out.pdf = 'ERR ' + e.message; }
  try { out.pdfName = h.w.llPdfName(L, 'Петрич'); } catch (e) { out.pdfName = 'ERR ' + e.message; }
  h.close();
  return out;
}

(async function run() {
  if (DUMP) { console.log(JSON.stringify(await snapshot())); process.exit(0); }
  const EXPECTED = JSON.parse(fs.readFileSync(path.join(__dirname, 'loading-ui.expected.json'), 'utf8'));
  const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const css = src('index.html');
  const lastOf = (tr, sel) => { const c = tr.querySelectorAll(sel); return c[c.length - 1]; };

  section('1. Картата на магазина: ll-tbl; „Получено“ е закачената колона с бутоните');
  {
    const h = env(STORE);
    guard('loadLoadingLists()', () => h.w.loadLoadingLists()); await settle(h);
    const t = mod(h).querySelector('table.ll-tbl');
    if (ok('таблицата е ll-tbl', !!t)) {
      const ths = t.querySelectorAll('thead th');
      ok('5 колони; последният th е „Получено“ с ll-act', ths.length === 5 && ths[4].textContent.trim() === 'Получено' && ths[4].classList.contains('ll-act') && Array.from(ths).slice(0, 4).every(x => !x.classList.contains('ll-act')));
      const rows = Array.from(t.querySelectorAll('tbody tr')).filter(r => r.querySelector('button[onclick^="llMark"]') && !r.hasAttribute('data-ll-unit-head'));
      ok('има редове с бутони за отмятане', rows.length >= 1, String(rows.length));
      ok('в всеки такъв ред последната клетка е ll-act и носи бутоните', rows.every(r => { const c = r.lastElementChild; return c.classList.contains('ll-act') && !!c.querySelector('button'); }));
      ok('само последната клетка е ll-act (в реда с 5 клетки)', rows.every(r => r.cells.length === 5 && Array.from(r.cells).slice(0, 4).every(c => !c.classList.contains('ll-act'))));
      const heads = Array.from(t.querySelectorAll('tr[data-ll-unit-head]'));
      ok('заглавните редове с colspan=5 нямат ll-act (обхващат цялата ширина)', heads.filter(r => r.cells.length === 1).every(r => !r.cells[0].classList.contains('ll-act')));
      const multi = heads.find(r => r.cells.length === 2);
      ok('заглавният ред на палет с няколко документа: последната клетка (бутоните за целия палет) е ll-act', !multi || (multi.lastElementChild.classList.contains('ll-act') && !!multi.lastElementChild.querySelector('button')), multi && multi.lastElementChild.className);
    }
    h.close();
  }

  section('2. Списъкът на листовете: ll-tbl; последната колона (👁/✏️) е ll-act');
  {
    const h = env(WAREHOUSE);
    guard('loadLoadingLists()', () => h.w.loadLoadingLists()); await settle(h);
    const t = mod(h).querySelector('table.ll-tbl');
    if (ok('таблицата е ll-tbl', !!t)) {
      const ths = t.querySelectorAll('thead th');
      ok('8 колони; последният th е празен с ll-act', ths.length === 8 && ths[7].textContent.trim() === '' && ths[7].classList.contains('ll-act') && Array.from(ths).slice(0, 7).every(x => !x.classList.contains('ll-act')));
      const rows = Array.from(t.querySelectorAll('tbody tr'));
      ok('всеки ред: последната клетка е ll-act с бутон „Преглед“', rows.length >= 1 && rows.every(r => r.lastElementChild.classList.contains('ll-act') && !!r.lastElementChild.querySelector('button[onclick^="llOpenView"]')), String(rows.length));
    }
    h.close();
  }

  section('3. Редакторът на склада: ll-tbl; последната колона (↑ ↓ ✕) е ll-act');
  {
    const h = env(WAREHOUSE);
    h.w.loadLoadingLists(); await settle(h);
    guard('llOpenEdit("L1")', () => h.w.llOpenEdit('L1')); await settle(h);
    const t = mod(h).querySelector('table.ll-tbl');
    if (ok('таблицата е ll-tbl', !!t)) {
      const ths = t.querySelector('tr').querySelectorAll('th');
      ok('заглавният ред: последният th е ll-act (празен)', ths.length === 7 && ths[6].classList.contains('ll-act') && ths[6].textContent.trim() === '' && Array.from(ths).slice(0, 6).every(x => !x.classList.contains('ll-act')), ths.length + '');
      const rows = Array.from(t.querySelectorAll('tr[data-ll-unit]'));
      ok('всеки ред на единица: последната клетка е ll-act с ↑ ↓ ✕', rows.length >= 1 && rows.every(r => { const c = r.lastElementChild; return c.classList.contains('ll-act') && c.querySelectorAll('button').length === 3; }), String(rows.length));
    }
    h.close();
  }

  section('4. Прегледът на склада: ll-tbl, но БЕЗ ll-act (последната колона е „Получено“ — статус, не бутони)');
  {
    const h = env(WAREHOUSE);
    h.w.loadLoadingLists(); await settle(h);
    guard('llOpenView("L2")', () => h.w.llOpenView('L2')); await settle(h);
    const t = mod(h).querySelector('table.ll-tbl');
    if (ok('таблицата е ll-tbl', !!t)) {
      const ths = t.querySelectorAll('thead th');
      ok('7 колони; последният th е „Получено“', ths.length === 7 && ths[6].textContent.trim() === 'Получено');
      ok('няма нито една ll-act клетка', !t.querySelector('.ll-act'));
    }
    h.close();
  }

  section('5. Печат, PDF, етикети и имейли — без ll-tbl/ll-act и същите байт по байт (еталон от origin/main)');
  {
    const got = await snapshot();
    ok('снимката е пълна (няма ERR)', Object.keys(EXPECTED).every(k => k in got) && !Object.keys(got).some(k => typeof got[k] === 'string' && /^ERR /.test(got[k])), Object.keys(got).filter(k => typeof got[k] === 'string' && /^ERR /.test(got[k])).map(k => k + ': ' + got[k]).join(' | '));
    for (const k of Object.keys(EXPECTED)) {
      const a = JSON.stringify(got[k]), b = JSON.stringify(EXPECTED[k]);
      ok(k + ': същото (' + b.length + ' знака)', a === b && b.length > 10, a === b ? '' : 'различно: ' + a.length + ' срещу ' + b.length);
    }
    ok('нищо от печата/PDF/имейлите не носи ll-tbl или ll-act', !/ll-tbl|ll-act/.test(JSON.stringify(got)));
    ok('печатните таблици са lp-tbl (не ll-tbl)', /class="lp-tbl"/.test(got.printAll));
  }

  section('6. index.html: CSS на закачената колона');
  {
    ok('.ll-tbl th.ll-act, td.ll-act: sticky вдясно, фонът се наследява, сянка отляво',
      /\.ll-tbl th\.ll-act,\s*\.ll-tbl td\.ll-act\{position:sticky;right:0;background:inherit;z-index:1;box-shadow:-6px 0 6px -6px rgba\(0,0,0,\.15\);\}/.test(css));
    ok('редовете на ll-tbl са плътно бели по подразбиране (иначе закачената клетка прозира); оцветените ги бият с inline фон',
      /\.ll-tbl>tbody>tr,\s*\.ll-tbl>thead>tr,\s*\.ll-tbl>tr\{background:#fff;\}/.test(css));
  }

  section('7. Зареждане: матрицата със закачени ред и колона; таблицата на формата е tbl-compact tbl-auto');
  {
    const SUP = { email: 'sl@temax.bg', display_name: 'Иван Сливен', role: 'store', store_name: 'Сливен' };
    const TPL = { id: 'tpl-col', name: 'Колоранти', slug: 'colorants', col1_label: 'Брой за поръчка', col2_label: 'Налични', target_stores: ['Петрич', 'Сливен', 'Кърджали'], active: true, sort_order: 0, instructions: 'Броят се всички.' };
    const SITEMS = [
      { id: 'it-a', template_id: 'tpl-col', sap_code: '39801', name: 'КОЛОРАНТ WB1 BLUE 1Л', supplier: 'ВАМКО ООД', active: true, sort_order: 1 },
      { id: 'it-b', template_id: 'tpl-col', sap_code: '62960', name: 'КОЛОРАНТ COLTEC BLACK XS 1Л', supplier: 'ОРГАХИМ ЕАД', active: true, sort_order: 2 }];
    const mk = user => { const h = boot({ modules: ['pallets.js', 'supply.js'], user, data: { supply_templates: [TPL], supply_template_items: SITEMS, supply_entries: () => [
      { id: 'e1', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Сливен', week_start: '2026-10-05', qty1: 3, qty2: 1 },
      { id: 'e2', template_id: 'tpl-col', item_id: 'it-b', store_name: 'Петрич', week_start: '2026-10-05', qty1: 5, qty2: 2 }], users: [{ store_name: 'Сливен' }, { store_name: 'Петрич' }] } }); freeze(h.w, '2026-10-06'); return h; };
    const a = mk(ADMIN);
    guard('админ: loadSupply()', () => a.w.loadSupply()); for (let i = 0; i < 10; i++) await ticks();
    const wrap = a.doc.querySelector('.sup-matrix-wrap'), mt = a.doc.querySelector('table.sup-matrix');
    if (ok('матрицата и обвивката .sup-matrix-wrap са на екрана', !!wrap && !!mt)) {
      const nameTh = mt.querySelectorAll('thead th.sup-name-c'), nameTd = mt.querySelectorAll('tbody td.sup-name-c');
      ok('колоната „Име“: th и td с sup-name-c (само тя)', nameTh.length === 1 && nameTh[0].textContent.trim() === 'Име' && nameTd.length >= 2 && Array.from(nameTd).every(td => /КОЛОРАНТ/.test(td.textContent)), nameTh.length + '/' + nameTd.length);
      ok('двуредова шапка (две колони на обект): вторият ред th е под първия', mt.querySelectorAll('thead tr').length === 2);
    }
    ok('.sup-matrix-wrap: вертикален скрол с max-height в обвивката', /\.sup-matrix-wrap\{[^}]*max-height:calc\(100vh - \d+px\)[^}]*overflow-y:auto/.test(css) || /\.sup-matrix-wrap\{[^}]*overflow-y:auto[^}]*max-height:calc\(100vh - \d+px\)/.test(css));
    ok('заглавните клетки: sticky по top:0', /\.sup-matrix thead th\{position:sticky;top:0;/.test(css));
    ok('вторият ред на шапката: sticky под първия (top > 0)', /\.sup-matrix thead tr\+tr th\{top:\d+px;/.test(css) || /\.sup-matrix thead tr \+ tr th\{top:\d+px;/.test(css));
    ok('колоната „Име“: sticky по left:0, над клетките, плътен фон', /\.sup-matrix \.sup-name-c\{[^}]*position:sticky;left:0;[^}]*background:#fff/.test(css) || /\.sup-matrix td\.sup-name-c[^{]*\{[^}]*position:sticky;left:0/.test(css));
    ok('ъгловата клетка (th „Име“) е над другите заглавия (z-index по-голям от 2)', /\.sup-matrix thead th\.sup-name-c\{[^}]*z-index:[3-9]/.test(css));
    const s = mk({ email: 'sl@temax.bg', display_name: 'Иван', role: 'store', store_name: 'Сливен' });
    guard('магазин: loadSupply()', () => s.w.loadSupply()); for (let i = 0; i < 8; i++) await ticks();
    const form = s.doc.querySelector('#mod-supply .tbl-wrap');
    ok('таблицата на формата е tbl-wrap tbl-compact tbl-auto', !!form && form.classList.contains('tbl-compact') && form.classList.contains('tbl-auto') && !!form.querySelector('table'), form && form.className);
    ok('и в нея няма sup-name-c (само матрицата е с закачена колона)', !!form && !form.querySelector('.sup-name-c'));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
