/* „За връщане": общите компоненти (.chips / .tbl-compact) и компактният ред.

   Редът отгоре надолу: заглавие → подтабове → търсене → магазини → доставчик →
   бележка → „какво остава" (при srAutoOn) → статус чипове + Excel → таблица.
   Без карти; „+ N в другия подтаб" е в кутията „какво остава". Чиповете са
   class="filter-bar chips", атрибут data-sr-f (НЕ data-f — сблъсък с Разлики),
   брой в .chips-n; подразбиране „Невзета"; „Без актуализация" — само при
   srAutoOn. „По разлики" е с 6 колони, „По рекламации" — с 5; коментарите са
   с етикети; бутоните са като преди.

   Пускане: node tests/sr-compact.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, ticks } = H;

const WED = '2026-10-07';       /* правилото за автоматичното отмятане е в сила */
const PREV_WED = '2026-09-30';  /* седмица ПРЕДИ правилото */
const STORE = 'Троян';
const MANAGER = { email: 't@temax.bg', display_name: 'Иван Петров', role: 'manager', store_name: STORE, assigned_stores: [STORE] };
const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function freezeDate(w, iso) {
  const Real = w.Date, ms = new Real(iso + 'T12:00:00').getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
function ret(id, over) {
  return Object.assign({
    id, store_name: STORE, status: 'pending', source: 'diff', confirmed_date: null, confirmed_by: null, confirmed_at: null,
    product_name: 'Стока ' + id, sap_code: 'S' + id, quantity: 3, supplier: 'ЕЛМАК ЕООД', order_number: null,
    purchase_order: 'PV-' + id, id_euro: null, plant: '1210', doc_date: null, withdrawal_date: null, courier_info: '',
    reason: null, control_comment: null, controller_comment: null, store_comment: null, diff_line_id: null, photos: []
  }, over || {});
}
const ROWS = [
  ret('a1', { reason: 'Повредена опаковка', controller_comment: 'К.К. 123', store_comment: 'чакаме куриер' }),
  ret('a2', { diff_line_id: 'L1' }),
  ret('a3', { status: 'taken', withdrawal_date: '2026-10-01', courier_info: 'Еконт 5300123', photos: ['x'] }),
  ret('a4', { status: 'completed', confirmed_date: '2026-10-06', photos: ['x'] }),
  ret('d1', { source: 'complaint', order_number: '4100135756' }), ret('d2', { source: 'complaint' }), ret('d3', { source: 'complaint' })
];

async function view(user, iso, rows) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'], user, confirm: true,
    data: { users: [{ store_name: STORE }], stores: [{ name: STORE }], stock_returns: () => JSON.parse(JSON.stringify(rows || ROWS)), stock_differences: [] }
  });
  freezeDate(h.w, iso || WED);
  h.w.loadAllSuppliers = () => Promise.resolve([]);
  guard('loadStockReturns()', () => h.w.loadStockReturns());
  for (let i = 0; i < 60; i++) {
    if (h.doc.getElementById('mod-stock-returns').innerHTML.indexOf('Стока за връщане') >= 0) break;
    await ticks();
  }
  h.w.srDiffTypes = { L1: 'write_off' };   /* решението по a2 вече не е „Връщане" */
  h.w.srTab = 'diff'; h.w.srFilter = 'pending'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.w.renderStockReturns();
  return h;
}
const mod = h => h.doc.getElementById('mod-stock-returns');
const bar = h => h.doc.getElementById('sr-filters');
const chip = (h, f) => bar(h).querySelector('[data-sr-f="' + f + '"]');
const count = (h, f) => parseInt(chip(h, f).querySelector('.chips-n').textContent, 10);
const trs = h => Array.from(mod(h).querySelectorAll('tbody tr'));
const names = h => trs(h).map(tr => (tr.querySelector('td div') || { getAttribute: () => '' }).getAttribute('title')).sort().join(',');
const rowOf = (h, name) => trs(h).find(tr => { const d = tr.querySelector('td div'); return d && d.getAttribute('title') === name; });
const btns = tr => Array.from(tr.querySelectorAll('button')).map(b => b.textContent.trim()).sort();
const j = a => JSON.stringify(a);
const before = (a, b) => !!a && !!b && !!(a.compareDocumentPosition(b) & 4);   /* b след a */

(async function run() {
  section('1. редът на блоковете');
  {
    const h = await view(MANAGER);
    const d = mod(h);
    const title = Array.from(d.querySelectorAll('div')).find(x => x.textContent.trim() === '📦 Стока за връщане');
    const sub = Array.from(d.querySelectorAll('button')).find(b => /setSRTab\('diff'\)/.test(b.getAttribute('onclick') || ''));
    const search = h.doc.getElementById('sr-search-input');
    const stores = Array.from(d.querySelectorAll('button')).find(b => /setSRStoreFilter\(''\)/.test(b.getAttribute('onclick') || ''));
    const supplier = h.doc.getElementById('sr-supplier-select');
    const note = Array.from(d.querySelectorAll('div')).find(x => /Записите тук се наливат автоматично/.test(x.textContent) && x.children.length === 0);
    const remains = (h.doc.getElementById('sr-needs-other') || {}).parentNode;
    const filters = bar(h);
    const table = d.querySelector('.tbl-sr-compact');
    const seq = [title, sub, search, stores, supplier, note, remains, filters, table];
    ok('всички блокове съществуват', seq.every(Boolean), seq.map(Boolean).join(','));
    ok('заглавие → подтабове → търсене → магазини → доставчик → бележка → „какво остава" → чипове → таблица',
      seq.every((el, i) => i === 0 || before(seq[i - 1], el)), seq.map(Boolean).join(','));
  }

  section('2. без карти; „+ N в другия подтаб" в кутията „какво остава"');
  {
    const h = await view(MANAGER);
    ok('няма #sr-needs-card', !h.doc.getElementById('sr-needs-card'));
    ok('няма големи числа от картите (font-size:28px)', !mod(h).querySelector('[style*="font-size:28px"]'));
    const o = h.doc.getElementById('sr-needs-other');
    ok('„+ 3 в другия подтаб" се вижда', !!o && o.textContent.trim() === '+ 3 в другия подтаб', o && o.textContent);
    ok('и е вътре в кутията „какво остава"', !!o && /невзети записа все още нямат/.test(o.parentNode.textContent));
  }

  section('3. чипове: data-sr-f, брой, подразбиране');
  {
    const h = await view(MANAGER);
    ok('контейнерът е .filter-bar.chips с „Покажи:"', bar(h).classList.contains('chips') && bar(h).classList.contains('filter-bar') && /Покажи:/.test(bar(h).textContent));
    ok('ред: pending, needs | taken, completed, all', j(Array.from(bar(h).querySelectorAll('button[data-sr-f]')).map(b => b.getAttribute('data-sr-f'))) === j(['pending', 'needs', 'taken', 'completed', 'all']));
    ok('разделител; taken / completed / all са .chip-hist', !!bar(h).querySelector('.chips-sep') && ['taken', 'completed', 'all'].every(f => chip(h, f).classList.contains('chip-hist')) && !chip(h, 'pending').classList.contains('chip-hist') && !chip(h, 'needs').classList.contains('chip-hist'));
    ok('няма data-f (сблъсък с Разлики)', !bar(h).querySelector('[data-f]'));
    ok('подразбиране pending и само той е активен', h.w.srFilter === 'pending' && j(Array.from(bar(h).querySelectorAll('.active')).map(b => b.getAttribute('data-sr-f'))) === j(['pending']));
    ok('броеве: pending 2, needs 2, taken 1, completed 1, all 4', count(h, 'pending') === 2 && count(h, 'needs') === 2 && count(h, 'taken') === 1 && count(h, 'completed') === 1 && count(h, 'all') === 4,
      ['pending', 'needs', 'taken', 'completed', 'all'].map(f => count(h, f)).join(','));
    ok('Excel бутоните са вдясно, на същия ред', Array.from(bar(h).querySelectorAll('button')).some(b => /exportSRExcel\(\)/.test(b.getAttribute('onclick') || '')));
    const h2 = await view(MANAGER, PREV_WED);
    ok('преди правилото няма чип „Без актуализация" и няма кутия', !chip(h2, 'needs') && !h2.doc.getElementById('sr-needs-other'));
    ok('и пак има 4 чипа', h2.doc.getElementById('sr-filters').querySelectorAll('button[data-sr-f]').length === 4);
  }

  section('4. клик на всеки чип');
  {
    const WANT = { pending: 'Стока a1,Стока a2', needs: 'Стока a1,Стока a2', taken: 'Стока a3', completed: 'Стока a4', all: 'Стока a1,Стока a2,Стока a3,Стока a4' };
    for (const f of Object.keys(WANT)) {
      const h = await view(MANAGER);
      realClick(h.w, chip(h, f));
      ok(f + ': маркиран е само той', j(Array.from(bar(h).querySelectorAll('.active')).map(b => b.getAttribute('data-sr-f'))) === j([f]));
      ok(f + ': редовете', names(h) === WANT[f], names(h));
    }
  }

  section('5. колони: 6 в „По разлики", 5 в „По рекламации"');
  {
    const h = await view(MANAGER);
    realClick(h.w, chip(h, 'all'));
    const th = Array.from(mod(h).querySelectorAll('thead th')).map(x => x.textContent.trim());
    ok('„По разлики": Артикул|Документ|Магазин · Доставчик|Статус|Коментари|Действия', th.join('|') === 'Артикул|Документ|Магазин · Доставчик|Статус|Коментари|Действия', th.join('|'));
    ok('всеки ред има 6 <td>', trs(h).length === 4 && trs(h).every(tr => tr.children.length === 6));
    ok('обвивка .tbl-wrap.tbl-compact.tbl-sr-compact, без sticky колона', !!mod(h).querySelector('.tbl-wrap.tbl-compact.tbl-sr-compact') && !Array.from(mod(h).querySelectorAll('td')).some(td => /position:sticky/.test(td.getAttribute('style') || '')));
    const art = rowOf(h, 'Стока a1').children[0];
    ok('„Артикул": име и „SAP … · кол."', /SAP Sa1/.test(art.textContent) && art.querySelector('b') && art.querySelector('b').textContent === '3', art.textContent);
    const st = rowOf(h, 'Стока a3').children[3].textContent;
    ok('„Статус": бадж, дата изтегляне и „изтеглена с …"', /ВЗЕТА/.test(st) && /изтеглена\s*01\.10\.2026/.test(st) && /изтеглена с\s*Еконт 5300123/.test(st), st);
    const st4 = rowOf(h, 'Стока a4').children[3].textContent;
    ok('„Статус": потвърдена акт.', /потвърдена акт\.\s*06\.10\.2026/.test(st4), st4);
    const doc = rowOf(h, 'Стока a1').children[1].textContent;
    ok('„Документ": етикети ПВ-ЕВР и завод', /ПВ-ЕВР\s*PV-a1/.test(doc) && /Завод\s*1210/.test(doc), doc);
    const css = Array.from(h.doc.querySelectorAll('style')).map(x => x.textContent).join(' ');
    ok('баджовете в „Статус“ не се пренасят (white-space:nowrap на span-овете в колоната)', /\.tbl-sr-diff td:nth-child\(4\) span,\.tbl-sr-complaint td:nth-child\(3\) span\{white-space:nowrap;\}/.test(css));
    ok('„Магазин · Доставчик"', /Троян/.test(rowOf(h, 'Стока a1').children[2].textContent) && /ЕЛМАК/.test(rowOf(h, 'Стока a1').children[2].textContent));

    realClick(h.w, Array.from(mod(h).querySelectorAll('button')).find(b => /setSRTab\('complaint'\)/.test(b.getAttribute('onclick') || '')));
    realClick(h.w, chip(h, 'all'));
    const th2 = Array.from(mod(h).querySelectorAll('thead th')).map(x => x.textContent.trim());
    ok('„По рекламации": Документ|Магазин · Доставчик|Статус|Коментари|Действия', th2.join('|') === 'Документ|Магазин · Доставчик|Статус|Коментари|Действия', th2.join('|'));
    ok('всеки ред има 5 <td>', Array.from(mod(h).querySelectorAll('tbody tr')).length === 3 && Array.from(mod(h).querySelectorAll('tbody tr')).every(tr => tr.children.length === 5));
    ok('„Поръчка" не излиза в „По рекламации"', !/Пор\./.test(mod(h).querySelector('tbody').textContent));
  }

  section('6. коментарите са с етикети');
  {
    const h = await view(MANAGER);
    const c = rowOf(h, 'Стока a1').children[4];
    const lines = Array.from(c.querySelectorAll('div')).map(x => x.textContent.trim());
    ok('причина и коментар на контролера → два реда', lines.length === 3, j(lines));
    ok('„Обект: чакаме куриер"', lines.indexOf('Обект: чакаме куриер') >= 0, j(lines));
    ok('„Причина: Повредена опаковка"', lines.indexOf('Причина: Повредена опаковка') >= 0, j(lines));
    ok('„Контролер: К.К. 123"', lines.indexOf('Контролер: К.К. 123') >= 0, j(lines));
    ok('няма слепен текст', !/Повредена опаковкаК\.К\./.test(c.textContent));
    ok('ред без коментари → тире', /—/.test(rowOf(h, 'Стока a2').children[4].textContent));
  }

  section('7. бутоните и фонът');
  {
    const h = await view(MANAGER);
    realClick(h.w, chip(h, 'all'));
    ok('pending (магазин): „Взета" и ✏️', j(btns(rowOf(h, 'Стока a1'))) === j(['✅ Взета', '✏️'].sort()), j(btns(rowOf(h, 'Стока a1'))));
    const a2 = rowOf(h, 'Стока a2');
    ok('сменено решение: чипът „⚠ решението е сменено", без „Взета"', !!a2.querySelector('[data-decision-changed]') && btns(a2).indexOf('✅ Взета') < 0, j(btns(a2)));
    ok('взета: без „Взета", с ✏️', j(btns(rowOf(h, 'Стока a3'))) === j(['✏️']), j(btns(rowOf(h, 'Стока a3'))));
    ok('приключена: без „Взета", с ✏️', j(btns(rowOf(h, 'Стока a4'))) === j(['✏️']), j(btns(rowOf(h, 'Стока a4'))));
    ok('лилав фон за ред от разлика (a2), не за a1', /background:#f5f3ff/.test(a2.getAttribute('style')) && !/background:#f5f3ff/.test(rowOf(h, 'Стока a1').getAttribute('style')));
    ok('легендата „Лилав фон" остава', /Лилав фон/.test(mod(h).textContent));
    const ha = await view(ADMIN);
    realClick(ha.w, chip(ha, 'all'));
    ok('admin, приключена: ✏️ и ✕', j(btns(rowOf(ha, 'Стока a4'))) === j(['✏️', '✕'].sort()), j(btns(rowOf(ha, 'Стока a4'))));
    ok('admin, pending: „Взета", ✏️, ✕', j(btns(rowOf(ha, 'Стока a1'))) === j(['✅ Взета', '✏️', '✕'].sort()), j(btns(rowOf(ha, 'Стока a1'))));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
