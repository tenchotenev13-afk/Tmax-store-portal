/* sdLoadSwaps(): заявката не расте с броя на редовете + грешката не се гълта.

   ЖИВИЯТ БЪГ (27.09.2026): заявката изброяваше id-тата на ВСИЧКИ междускладови
   редове в sdData, и то ДВА пъти
   (or=(from_line_id.in.(…),to_line_id.in.(…))). При ~540 такива реда URL-ът
   ставаше ~45 000 знака, гейтуеят го отсичаше с 400, sbGet() връщаше [] — и
   размените изчезваха от екрана без нито един признак: нито toast, нито ред в
   конзолата. Същата засада като storno_id=in.(…) в kasa.js (763 бележки,
   ~30 KB URL).

   Тук се заковават три неща:
     - при 600 междускладови реда URL-ът е под 8000 знака и НЕ съдържа in.(;
     - размените пак стигат до екрана;
     - провалена заявка → червен toast + console.error, sdSwaps остава празен.

   Пускане:  node tests/sd-swaps-url.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const WH = 'Логистичен склад Търговище';
const clone = x => JSON.parse(JSON.stringify(x));

/* 300 бланки × 2 реда = 600 междускладови реда - малко над живите 540. */
const N_REPORTS = 300;
const REPORTS = [];
const LINES = [];
for (let i = 0; i < N_REPORTS; i++) {
  REPORTS.push({
    id: 'aaaaaaaa-bbbb-cccc-dddd-' + String(100000000000 + i), direction: 'interstore',
    store_name: 'Петрич', counterpart: WH, document_number: '46' + i, doc_date: '2026-09-20',
    submitted_by: 'Управител', general_comment: '', photos: [], reviewed: false,
    created_at: '2026-09-20T09:00:00.000Z'
  });
  for (let k = 0; k < 2; k++) {
    LINES.push({
      id: 'eeeeeeee-ffff-1111-2222-' + String(200000000000 + i * 2 + k),
      report_id: REPORTS[i].id, store_name: 'Петрич', supplier: null,
      material_code: '3498' + k, material_name: 'ЩУЦЕР ' + i + '-' + k,
      quantity: 10, quantity_received: 8, difference_category: k ? 'excess' : 'undelivered',
      unit: 'бр.', status: 'new', type: null, attachments: [], comment: null,
      resolution_comment: null, credit_note_issued: false, store_corrected_at: null,
      warehouse_response: null, warehouse_comment: null, store_response: null,
      store_response_by: null, store_response_at: null, store_response_comment: null,
      swap_id: null, created_at: '2026-09-20T09:00:00.000Z'
    });
  }
}
/* Една истинска размяна по първите два реда - за да се види, че стига до екрана. */
const SWAP = {
  id: 'sw-1', from_line_id: LINES[1].id, to_line_id: LINES[0].id,
  from_store: 'Петрич', to_store: 'Петрич', warehouse: WH, kind: 'physical',
  material_code: '34980', material_name: 'ЩУЦЕР 0-0', qty: 2, status: 'linked',
  transport_mode: null, sap_doc_num: null, note: null, created_by: 'Склад Търговище',
  created_at: '2026-09-21T09:00:00.000Z', sent_by: null, sent_at: null,
  received_by: null, received_at: null, closed_by: null, closed_at: null
};

const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: WAREHOUSE, confirm: true, fail: opts.fail,
    data: {
      stock_differences: LINES, differences_reports: REPORTS,
      stock_diff_swaps: opts.swaps || [SWAP],
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: WH }], contacts: []
    }
  });
  h.w.sdFilter = 'pending'; h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'interstore';
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  return h;
}
const swapGets = h => h.calls.get.filter(u => /stock_diff_swaps/.test(u));
const toasts = h => h.calls.toast.map(t => String(t.msg || t));
const settle = async () => { await ticks(); await ticks(); await ticks(); await ticks(); };

(async function () {

  section('1. 600 междускладови реда → къс URL, размените се виждат');
  {
    const h = env();
    ok('данните наистина са 600 реда', LINES.length === 600, String(LINES.length));
    if (guard('loadStockDiff() не хвърля', () => h.w.loadStockDiff())) {
      await settle();
      const g = swapGets(h);
      if (ok('точно една заявка за размените', g.length === 1, h.calls.get.join(' | '))) {
        ok('URL-ът е под 8000 знака', g[0].length < 8000, 'дължина: ' + g[0].length);
        ok('в него НЯМА списък с id (in.()', g[0].indexOf('in.(') < 0, g[0].slice(0, 300));
        ok('нито едно id на ред не се среща в URL-а', g[0].indexOf(LINES[0].id) < 0, g[0].slice(0, 300));
      }
      ok('размяната е заредена', h.w.sdSwaps.length === 1 && h.w.sdSwaps[0].id === 'sw-1', JSON.stringify(h.w.sdSwaps.length));
      ok('sdSwapsForLine я намира по реда', h.w.sdSwapsForLine(LINES[0]).length === 1);
      /* И стига до екрана: панелът на двойката е на реда в картата. */
      const card = h.doc.getElementById('diff-rep-' + REPORTS[0].id);
      ok('панелът на размяната се рендира', !!card && !!card.querySelector('[data-sdswap]'),
        card ? card.textContent.slice(0, 200) : 'няма карта');
      ok('без червен toast', !toasts(h).some(t => /не се заредиха/.test(t)), JSON.stringify(toasts(h)));
    }
  }

  section('2. Провалена заявка → червен toast, console.error, празен sdSwaps');
  {
    const h = env({ fail: { GET: { status: 400, url: /stock_diff_swaps/, body: { message: 'URI too long' } } } });
    const errs = [];
    h.w.console.error = (m) => { errs.push(String(m)); };
    if (guard('loadStockDiff() не хвърля при 400', () => h.w.loadStockDiff())) {
      await settle();
      ok('червен toast "Размените не се заредиха"', toasts(h).indexOf('Размените не се заредиха') >= 0, JSON.stringify(toasts(h)));
      ok('console.error с причината', errs.some(m => /sdLoadSwaps/.test(m) && /400|URI too long/.test(m)), JSON.stringify(errs));
      ok('sdSwaps остава празен', h.w.sdSwaps.length === 0, JSON.stringify(h.w.sdSwaps));
      /* Останалото се рендира - падналите размени не събарят таба. */
      ok('редовете пак се виждат', !!h.doc.getElementById('diff-rep-' + REPORTS[0].id));
    }
  }
  {
    /* Мрежов срив (fetch отхвърля) - същият изход, без изключение. */
    const h = env();
    const orig = h.w.fetch;
    h.w.fetch = function (url, init) {
      if (/stock_diff_swaps/.test(url)) return Promise.reject(new Error('offline'));
      return orig(url, init);
    };
    const errs = [];
    h.w.console.error = (m) => { errs.push(String(m)); };
    if (guard('loadStockDiff() не хвърля при мрежов срив', () => h.w.loadStockDiff())) {
      await settle();
      ok('мрежов срив: червен toast', toasts(h).indexOf('Размените не се заредиха') >= 0, JSON.stringify(toasts(h)));
      ok('мрежов срив: причината е в конзолата', errs.some(m => /offline/.test(m)), JSON.stringify(errs));
      ok('мрежов срив: sdSwaps е празен', h.w.sdSwaps.length === 0);
    }
  }

  report();
})();
