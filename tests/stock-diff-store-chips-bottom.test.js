/* „Разлики": чиповете по магазин се рисуват втори път — над долната таблица.

   sdStoreChipsHtml() стоеше само веднъж, над непрегледаните бланки. Филтърът
   sdStoreFilter важи и за долната таблица (sdTableRows), но тя е екрани
   по-надолу и Цветелина не вижда чиповете оттам.

   Сега същата функция се вика втори път, непосредствено ПРЕДИ реда с типовите
   чипове („Всички типове / Заприхождаване / Връщане / Липса") и СЛЕД картите
   Чакащи/Приключени. Логиката не се дублира: един филтър, едни бройки, а
   кликът на който и да е ред пренарисува целия модул.

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

  section('а) Два реда чипове; долният е СЛЕД картите и ПРЕДИ типовите чипове');
  {
    const { w, doc } = env(ROWS);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('контейнерът #mod-stock-diff съществува', !!mod(doc));
      const troyan = storeChips(doc, 'Троян');
      ok('точно 2 бутона с data-store="Троян"', troyan.length === 2, 'брой: ' + troyan.length);
      ok('точно 2 бутона „🏪 Всички"', storeChips(doc, '').length === 2,
        'брой: ' + storeChips(doc, '').length);
      const rows = chipRows(doc);
      if (ok('точно 2 реда чипове', rows.length === 2, 'брой: ' + rows.length)) {
        const grid = cardsGrid(doc), types = typeChipAll(doc);
        if (ok('картите и типовите чипове се намират', !!grid && !!types)) {
          ok('горният ред е ПРЕДИ картите', before(rows[0], grid));
          ok('долният ред е СЛЕД картите', before(grid, rows[1]));
          ok('долният ред е ПРЕДИ типовите чипове', before(rows[1], types));
        }
        ok('двата реда са еднакви — едни и същи бутони и бройки',
          rows[0].textContent === rows[1].textContent,
          rows[0].textContent + ' | ' + rows[1].textContent);
      }
    }
  }

  section('б) Клик на „Троян" в ДОЛНИЯ ред → таблицата и двата реда');
  {
    const { w, doc } = env(ROWS);
    guard('рендер', () => w.renderStockDiff());
    ok('без филтър таблицата има 3 реда', mainRows(doc).length === 3, 'редове: ' + mainRows(doc).length);
    const bottom = storeChips(doc, 'Троян')[1];
    if (ok('долният чип „Троян" е на екрана', !!bottom)) {
      realClick(w, bottom);
      ok('sdStoreFilter е Троян', w.sdStoreFilter === 'Троян', JSON.stringify(w.sdStoreFilter));
      const rows = mainRows(doc);
      ok('таблицата показва 2 реда', rows.length === 2, 'редове: ' + rows.length);
      ok('и двата са на Троян', rows.every(r => r.textContent.indexOf('Троян') >= 0),
        rows.map(r => r.textContent.slice(0, 40)).join(' | '));
      ok('Раднево го няма', rows.every(r => r.textContent.indexOf('РАДНЕВО') < 0));
      const troyan = storeChips(doc, 'Троян');
      ok('„Троян" е маркиран и в двата реда',
        troyan.length === 2 && troyan.every(isActive), troyan.map(isActive).join(','));
      ok('„🏪 Всички" не е маркиран в нито един',
        storeChips(doc, '').every(b => !isActive(b)), storeChips(doc, '').map(isActive).join(','));
    }
  }

  section('в) Клик на „🏪 Всички" в ГОРНИЯ ред → филтърът пада и в двата');
  {
    const { w, doc } = env(ROWS);
    w.sdStoreFilter = 'Троян';
    guard('рендер с активен филтър', () => w.renderStockDiff());
    ok('стартово таблицата е филтрирана до 2', mainRows(doc).length === 2);
    const topAll = storeChips(doc, '')[0];
    if (ok('горният „🏪 Всички" е на екрана', !!topAll)) {
      realClick(w, topAll);
      ok('sdStoreFilter е празен', w.sdStoreFilter === '', JSON.stringify(w.sdStoreFilter));
      ok('таблицата пак показва 3 реда', mainRows(doc).length === 3, 'редове: ' + mainRows(doc).length);
      ok('„🏪 Всички" е маркиран и в двата реда',
        storeChips(doc, '').length === 2 && storeChips(doc, '').every(isActive),
        storeChips(doc, '').map(isActive).join(','));
      ok('„Троян" не е маркиран в нито един',
        storeChips(doc, 'Троян').every(b => !isActive(b)), storeChips(doc, 'Троян').map(isActive).join(','));
    }
  }

  section('г) Нула магазина → нито един ред чипове');
  {
    const { w, doc } = env([]);
    if (guard('рендер без данни', () => w.renderStockDiff())) {
      ok('няма бутони по магазин изобщо', storeChips(doc, '').length === 0,
        'брой: ' + storeChips(doc, '').length);
    }
  }

  report();
})();
