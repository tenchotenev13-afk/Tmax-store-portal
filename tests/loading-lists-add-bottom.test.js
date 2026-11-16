/* Товарни листи: втори „➕ Добави нов ред" под таблицата „📦 Редове".

   Молба на складовете: при дълги листи всеки нов ред значеше скрол до горния
   бутон и обратно. Долният бутон вика СЪЩАТА llAddFreeRow() като горния.
   Пази се тук:
     а) при празна чернова (0 реда) долен бутон няма;
     б) при 3 реда има точно един, СЛЕД последния tr[data-ll-unit];
     в) истински клик по него → 4 реда, след рендера бутонът пак е след
        последния ред;
     г) горният бутон си стои — точно 2 бутона „Добави нов ред" при ≥1 ред.

   Мутационна проверка (16.11.2026, всеки мутант срещу този тест):
     1) бутонът извън клона else (показва се и при 0 реда)  → ПАДА (а)
     2) бутонът преди таблицата (вътре в else)               → ПАДА (б, в)
     3) onclick="llAddFreeRowX()" (несъществуваща функция)   → ПАДА (в)

   Пускане:  node tests/loading-lists-add-bottom.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const MODULES = ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
                 'stock-differences.js', 'loading.js'];

function env() {
  return boot({
    modules: MODULES, user: WAREHOUSE, confirm: true,
    data: {
      app_settings: [{ key: 'loading_transit_docs', value: 'on' }],
      goods_transit: [], loading_lists: [], loading_list_items: [], loading_list_products: [],
      users: [{ store_name: 'Петрич' }, { store_name: 'Габрово' }],
      stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
}
const mod = h => h.doc.getElementById('mod-loading');
const bottomBtns = h => mod(h).querySelectorAll('button[data-ll-add-bottom]');
const addBtns = h => Array.from(mod(h).querySelectorAll('button'))
  .filter(b => b.textContent.indexOf('Добави нов ред') >= 0);
const lastUnitRow = h => { const r = mod(h).querySelectorAll('tr[data-ll-unit]'); return r[r.length - 1]; };
const isAfter = (a, b) => !!(a && b && (b.compareDocumentPosition(a) & 4 /* FOLLOWING */));

(async function () {
  const h = env();
  h.w.llNewList();
  await ticks(); await ticks();

  section('а) празна чернова — без долен бутон');
  h.w.llDraft.units = [];
  h.w.renderLoadingLists();
  ok('0 реда → няма button[data-ll-add-bottom]', bottomBtns(h).length === 0, String(bottomBtns(h).length));
  ok('горният бутон е там и при 0 реда', addBtns(h).length === 1, String(addBtns(h).length));

  section('б) 3 реда — един долен бутон след последния ред');
  h.w.llDraft.units = [
    Object.assign(h.w.llBlankUnit(), { store_name: 'Петрич', pallet_no: 1 }),
    Object.assign(h.w.llBlankUnit(), { store_name: 'Петрич', pallet_no: 2 }),
    Object.assign(h.w.llBlankUnit(), { store_name: 'Габрово', pallet_no: 1 })
  ];
  h.w.renderLoadingLists();
  ok('3 реда на екрана', mod(h).querySelectorAll('tr[data-ll-unit]').length === 3);
  ok('точно един долен бутон', bottomBtns(h).length === 1, String(bottomBtns(h).length));
  ok('долният бутон е СЛЕД последния tr[data-ll-unit]', isAfter(bottomBtns(h)[0], lastUnitRow(h)));

  section('г) горният бутон си стои');
  ok('точно 2 бутона „Добави нов ред"', addBtns(h).length === 2, String(addBtns(h).length));
  ok('първият (горният) е ПРЕДИ първия ред',
    !!addBtns(h)[0] && !addBtns(h)[0].hasAttribute('data-ll-add-bottom') &&
    isAfter(mod(h).querySelector('tr[data-ll-unit]'), addBtns(h)[0]));

  section('в) реален клик по долния бутон');
  /* realClick изпълнява САМИЯ inline onclick атрибут с this/event —
     dispatchEvent в jsdom с runScripts:'outside-only' не го пуска. */
  const errs = [];
  try { realClick(h.w, bottomBtns(h)[0], 'долен бутон'); } catch (e) { errs.push(e.message); }
  await ticks();
  ok('llDraft.units става 4', h.w.llDraft.units.length === 4, String(h.w.llDraft.units.length));
  ok('без грешка при клика', errs.length === 0, errs.join(' | '));
  ok('4 реда на екрана', mod(h).querySelectorAll('tr[data-ll-unit]').length === 4);
  ok('след рендера — пак точно един долен бутон', bottomBtns(h).length === 1, String(bottomBtns(h).length));
  ok('и пак е след последния ред', isAfter(bottomBtns(h)[0], lastUnitRow(h)));
  ok('пак 2 бутона „Добави нов ред"', addBtns(h).length === 2, String(addBtns(h).length));

  report();
})();
