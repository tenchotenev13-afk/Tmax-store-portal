/* „Разлики": чиповете по магазин са САМО веднъж — над превключвателя на изгледите, до търсенето.

   До част 1 на новата подредба sdStoreChipsHtml() се викаше втори път — над долната таблица, защото
   тя беше екрани по-надолу. Сега таблицата е в собствен изглед („Решени редове"), превключвателят е
   веднага под чиповете, и вторият ред изчезна. Филтърът sdStoreFilter важи и за двата изгледа
   (бланки и таблица): един филтър, едни бройки, а кликът пренарисува целия модул.

   Пускане:  node tests/stock-diff-store-chips-bottom.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick } = H;

function row(o) {
  return Object.assign({
    report_id: null, store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 1,
    confirmed_date: null, comment: null, resolution_comment: null,
    order_number: null, type: 'writein', status: 'pending'
  }, o);
}

/* Два магазина с решени редове — 2 за Троян, 1 за Раднево. */
const ROWS = [
  row({ id: 't1', store_name: 'Троян', material_name: 'ТРОЯН ЕДНО' }),
  row({ id: 't2', store_name: 'Троян', material_name: 'ТРОЯН ДВЕ', type: 'return' }),
  row({ id: 'r1', store_name: 'Раднево', material_name: 'РАДНЕВО ЕДНО', type: 'missing' })
];

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin',
                store_name: 'Централен офис', assigned_stores: ['Раднево', 'Троян'] };

function env(rows) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: ADMIN,
    data: { stock_differences: rows, differences_reports: [], stock_returns: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = [];
  h.w.sdTypeFilter = 'all';
  h.w.sdView = 'rows';
  h.w.sdFilter = 'all';
  h.w.sdStoreFilter = '';
  h.w.sdSearch = '';
  return h;
}

const mod = doc => doc.getElementById('mod-stock-diff');

/* Бутоните по магазин — само тези, които наистина викат setSDStoreFilter. */
function storeChips(doc, store) {
  return Array.prototype.filter.call(
    mod(doc).querySelectorAll('button[data-store="' + store + '"]'),
    b => /setSDStoreFilter/.test(b.getAttribute('onclick') || ''));
}
/* Контейнерите на двата реда чипове, в реда на документа. */
function chipRows(doc) {
  const out = [];
  storeChips(doc, '').forEach(b => { if (out.indexOf(b.parentNode) < 0) out.push(b.parentNode); });
  return out;
}
/* Активният чип е с color:#2563eb; неактивният — #64748b. border-ът също
   носи #2563eb, но без префикса „color:", затова регексът е закотвен. */
const isActive = b => /(^|;)color:#2563eb/.test(b.getAttribute('style') || '');

function typeChipAll(doc) {
  return Array.prototype.find.call(mod(doc).querySelectorAll('button[data-f="all"]'),
    b => /setSDTypeFilter/.test(b.getAttribute('onclick') || ''));
}
/* Картите Чакащи/Приключени — единственият grid с две колони в модула. */
function cardsGrid(doc) {
  return Array.prototype.find.call(mod(doc).querySelectorAll('div'),
    d => /grid-template-columns:\s*repeat\(2,\s*1fr\)/.test(d.getAttribute('style') || ''));
}
/* Главната таблица — единствената със заглавие „Кредитно". */
function mainRows(doc) {
  const t = Array.prototype.find.call(mod(doc).querySelectorAll('table'),
    x => x.querySelector('thead') && x.querySelector('thead').textContent.indexOf('Кредитно') >= 0);
  return t ? Array.prototype.slice.call(t.querySelectorAll('tbody tr')) : [];
}
const before = (a, b) => !!(a.compareDocumentPosition(b) & 4); /* DOCUMENT_POSITION_FOLLOWING */

(async function run() {

  section('а) Един ред чипове — над превключвателя на изгледите и след търсенето');
  {
    const { w, doc } = env(ROWS);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('контейнерът #mod-stock-diff съществува', !!mod(doc));
      const troyan = storeChips(doc, 'Троян');
      ok('точно 1 бутон с data-store="Троян"', troyan.length === 1, 'брой: ' + troyan.length);
      ok('точно 1 бутон „🏪 Всички"', storeChips(doc, '').length === 1, 'брой: ' + storeChips(doc, '').length);
      const rows = chipRows(doc);
      if (ok('точно 1 ред чипове', rows.length === 1, 'брой: ' + rows.length)) {
        const search = doc.getElementById('sd-search-input'), sw = doc.getElementById('sd-view-switch'), types = typeChipAll(doc);
        if (ok('търсенето, превключвателят и типовите чипове се намират', !!search && !!sw && !!types)) {
          ok('редът чипове е СЛЕД търсенето', before(search, rows[0]));
          ok('редът чипове е ПРЕДИ превключвателя на изгледите', before(rows[0], sw));
          ok('типовите чипове са СЛЕД превключвателя (в изглед „Редове")', before(sw, types));
        }
        ok('няма карти Чакащи/Приключени (grid с 2 колони)', !cardsGrid(doc));
      }
    }
  }

  section('б) Клик на „Троян" → таблицата и редът чипове');
  {
    const { w, doc } = env(ROWS);
    guard('рендер', () => w.renderStockDiff());
    ok('без филтър таблицата има 3 реда', mainRows(doc).length === 3, 'редове: ' + mainRows(doc).length);
    const chip = storeChips(doc, 'Троян')[0];
    if (ok('чипът „Троян" е на екрана', !!chip)) {
      realClick(w, chip);
      ok('sdStoreFilter е Троян', w.sdStoreFilter === 'Троян', JSON.stringify(w.sdStoreFilter));
      const rows = mainRows(doc);
      ok('таблицата показва 2 реда', rows.length === 2, 'редове: ' + rows.length);
      ok('и двата са на Троян', rows.every(r => r.textContent.indexOf('Троян') >= 0), rows.map(r => r.textContent.slice(0, 40)).join(' | '));
      ok('Раднево го няма', rows.every(r => r.textContent.indexOf('РАДНЕВО') < 0));
      const troyan = storeChips(doc, 'Троян');
      ok('„Троян" е маркиран', troyan.length === 1 && troyan.every(isActive), troyan.map(isActive).join(','));
      ok('„🏪 Всички" не е маркиран', storeChips(doc, '').every(b => !isActive(b)), storeChips(doc, '').map(isActive).join(','));
    }
  }

  section('в) Клик на „🏪 Всички" → филтърът пада');
  {
    const { w, doc } = env(ROWS);
    w.sdStoreFilter = 'Троян';
    guard('рендер с активен филтър', () => w.renderStockDiff());
    ok('стартово таблицата е филтрирана до 2', mainRows(doc).length === 2);
    const all = storeChips(doc, '')[0];
    if (ok('„🏪 Всички" е на екрана', !!all)) {
      realClick(w, all);
      ok('sdStoreFilter е празен', w.sdStoreFilter === '', JSON.stringify(w.sdStoreFilter));
      ok('таблицата пак показва 3 реда', mainRows(doc).length === 3, 'редове: ' + mainRows(doc).length);
      ok('„🏪 Всички" е маркиран', storeChips(doc, '').length === 1 && storeChips(doc, '').every(isActive));
      ok('„Троян" не е маркиран', storeChips(doc, 'Троян').every(b => !isActive(b)));
    }
  }

  section('г) Нула магазина → нито един ред чипове');
  {
    const { w, doc } = env([]);
    if (guard('рендер без данни', () => w.renderStockDiff())) {
      ok('няма бутони по магазин изобщо', storeChips(doc, '').length === 0, 'брой: ' + storeChips(doc, '').length);
    }
  }

  section('д) Чиповете са в ДВАТА изгледа (един и същ филтър)');
  {
    const { w, doc } = env(ROWS);
    w.sdView = 'reports';
    guard('рендер (Бланки)', () => w.renderStockDiff());
    ok('в изглед „Бланки“ чиповете са точно веднъж', storeChips(doc, 'Троян').length === 1 && chipRows(doc).length === 1);
    w.setSDView('rows');
    ok('в изглед „Редове“ — също веднъж', storeChips(doc, 'Троян').length === 1 && chipRows(doc).length === 1);
  }

  report();
})();
