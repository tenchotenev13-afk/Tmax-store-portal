/* Разлики, етап 2 (среща 12.11.2026; уточнение на Тенчо 16.11.2026).

   Обектът (manager / sklad / info, не склад, не офис, не зрител от ЦО — групата
   на етап 1, sdStoreRowsView) вижда в „Решени редове“ САМО редовете, по които
   трябва да действа: „Заприхождаване“ / „Връщане“, неотбелязани, неприключени,
   не 'received' — точно условието на бутона „📥 Заприходена“ / „✅ Върната“
   (sdStoreMustAct → sdRowAwaitsMark, една функция за филтъра и бутона).
   Числото в превключвателя, чиповете по тип и Excel минават през sdTableRows.
   Чиповете по статус при обекта не се рисуват; запомнен sdFilter пада на 'all'
   ПРЕДИ sdTableRows. При 0 реда — „Нищо не чака вас тук“.
   Офисът и логистичният склад — без промяна.

   Мутационна проверка (16.11.2026; всеки мутант върху stock-differences.js,
   файлът — върнат от копие; чистият код: exit 0):
     М1  sdStoreMustAct пуска и „Липса“ / „Не са фактурирани“           → 21 ❌
     М2  правилото важи и за admin (sdStoreRowsView винаги true)          → 15 ❌
     М3  sdFilter пада СЛЕД sdTableRows                                   →  6 ❌
     М4  без филтъра в sdTableRows                                        → 23 ❌
     М5  чиповете по статус се рисуват и за обекта                        →  5 ❌
     М6  при 0 — „Няма записи.“ и за обекта                               →  2 ❌
     М7  sdRowAwaitsMark без !sdIsTaken / !sdIsCompleted                  → 23 ❌
   И седемте — exit 1.

   Пускане:  node tests/razliki-etap2.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const STORE = { email: 'pirdop@temax.bg', display_name: 'Управител Пирдоп', role: 'manager', store_name: 'Пирдоп' };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const WH    = { email: 'tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: 'Логистичен склад Търговище' };

function line(o) {
  return Object.assign({
    store_name: 'Пирдоп', supplier: 'Логистичен склад Търговище', material_code: '111',
    material_name: 'АРТИКУЛ', quantity: 1, quantity_received: 0, comment: null,
    resolution_comment: null, attachments: [], difference_category: 'undelivered', unit: 'бр.',
    status: 'pending', type: null, warehouse_response: null, store_response: null,
    report_id: 'rep-x', created_at: '2026-11-15T08:00:00Z'
  }, o);
}
const REP_X = { id: 'rep-x', direction: 'interstore', store_name: 'Пирдоп', counterpart: 'Логистичен склад Търговище',
  document_number: '180486328', doc_date: '2026-11-15', submitted_by: 'Управител Пирдоп', general_comment: '',
  photos: [], reviewed: true, email_pending: false, created_at: '2026-11-15T08:00:00Z' };

/* По един ред от всеки тип и статус. Чакащи за обекта — само W-P и R-P. */
const ALL = [
  line({ id: 'w-p', type: 'writein', status: 'pending', material_name: 'W-PENDING' }),
  line({ id: 'w-t', type: 'writein', status: 'taken', material_name: 'W-TAKEN' }),
  line({ id: 'r-p', type: 'return', status: 'pending', material_name: 'R-PENDING' }),
  line({ id: 'r-c', type: 'return', status: 'completed', material_name: 'R-COMPLETED' }),
  line({ id: 'm-p', type: 'missing', status: 'pending', material_name: 'M-PENDING' }),
  line({ id: 'n-p', type: 'not_invoiced', status: 'pending', material_name: 'N-PENDING' }),
  line({ id: 's-t', type: 'storno', status: 'taken', material_name: 'S-TAKEN' }),
  line({ id: 'i-r', type: null, status: 'received', material_name: 'I-RECEIVED' })
];
const NAMES = ALL.map(l => l.material_name);

function env(user, o) {
  o = o || {};
  const db = JSON.parse(JSON.stringify(o.lines || ALL));
  const holder = {};
  /* GET към stock_differences връща db с приложените PATCH-ове — тоест
     loadStockDiff() след „📥 Заприходена“ вижда новия статус, както базата. */
  const sdGet = () => {
    (holder.h ? holder.h.calls.patch : []).forEach(p => {
      if (p.table !== 'stock_differences') return;
      const m = /id=eq\.([^&]+)/.exec(p.url);
      const r = m && db.find(x => String(x.id) === decodeURIComponent(m[1]));
      if (r) Object.assign(r, p.body);
    });
    return db;
  };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    confirm: true,
    data: { stock_differences: sdGet, differences_reports: [REP_X], stock_returns: [],
      stock_diff_swaps: [], transport_orders: [], users: [], product_catalog: [], contacts: [], stores: [] }
  });
  holder.h = h;
  h.db = db;
  h.w.sdData = JSON.parse(JSON.stringify(db));
  h.w.diffReports = [JSON.parse(JSON.stringify(REP_X))];
  h.w.sdSwaps = [];
  h.w.transportOrders = [];
  h.w.sdDirTab = 'interstore';
  h.w.sdView = 'rows';
  h.w.sdFilter = o.filter || 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.cap = { aoas: [] };
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: aoa => { h.cap.aoas.push(aoa); return { __aoa: aoa }; },
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); wb.Sheets[n] = ws; }
    },
    writeFile: () => {}
  };
  return h;
}
const rowNames = doc => Array.from(doc.querySelectorAll('#sd-rows tr')).map(tr => {
  const n = tr.querySelector('.sd-name'); const m = n && /^[A-Z-]+/.exec(n.textContent.trim()); return m ? m[0] : '?'; /* без маркировките след името (⚠️ …) */
});
const switchBtn = doc => doc.querySelector('#sd-view-switch button[data-sd-view="rows"]');
const switchNum = doc => { const m = /\((\d+)\)/.exec((switchBtn(doc) || {}).textContent || ''); return m ? +m[1] : null; };
const typeChip = (doc, f) => doc.querySelector('#mod-stock-diff button[onclick*="setSDTypeFilter"][data-f="' + f + '"]');
const chipNum = b => { const m = /\((\d+)\)/.exec(b ? b.textContent : ''); return m ? +m[1] : null; };
const statusChips = doc => Array.from(doc.querySelectorAll('#mod-stock-diff button[onclick*="setSDFilter"]'));

(async function run() {

  section('1. Обект: само двата чакащи реда — таблица, превключвател, чипове по тип, Excel');
  {
    const h = env(STORE);
    if (guard('renderStockDiff() не хвърля', () => h.w.renderStockDiff())) {
      const names = rowNames(h.doc);
      ok('таблицата: точно W-PENDING и R-PENDING', JSON.stringify(names.slice().sort()) === '["R-PENDING","W-PENDING"]', JSON.stringify(names));
      ok('превключвателят „Решени редове (2)“', switchNum(h.doc) === 2, switchBtn(h.doc) && switchBtn(h.doc).textContent);
      ok('чип „Заприхождаване (1)“', chipNum(typeChip(h.doc, 'writein')) === 1, typeChip(h.doc, 'writein') && typeChip(h.doc, 'writein').textContent);
      ok('чип „Връщане (1)“', chipNum(typeChip(h.doc, 'return')) === 1, typeChip(h.doc, 'return') && typeChip(h.doc, 'return').textContent);
      ok('чип „Всички типове“ е там', !!typeChip(h.doc, 'all'));
      ok('без чипове „Липса“ / „Не са фактурирани“ (етап 1)', !typeChip(h.doc, 'missing') && !typeChip(h.doc, 'not_invoiced'));
      ok('всеки ред носи бутон за отметка', Array.from(h.doc.querySelectorAll('#sd-rows tr')).every(tr => !!tr.querySelector('button[onclick*="sdMarkTaken"]')));
      realClick(h.w, btn(h.doc.getElementById('mod-stock-diff'), '📥 Excel'));
      await ticks();
      const aoa = h.cap.aoas[0] || [];
      ok('Excel: 2 реда + заглавие', aoa.length === 3, aoa.length);
      ok('Excel: точно двата чакащи', JSON.stringify(aoa.slice(1).map(r => r[4]).sort()) === '["R-PENDING","W-PENDING"]', JSON.stringify(aoa.slice(1).map(r => r[4])));
      /* Кликът по чип „Връщане“ — 1 ред. */
      realClick(h.w, typeChip(h.doc, 'return'));
      ok('клик „Връщане“ → само R-PENDING', JSON.stringify(rowNames(h.doc)) === '["R-PENDING"]', JSON.stringify(rowNames(h.doc)));
    }
    h.close();
  }
  for (const role of ['sklad', 'info']) {
    const h = env(Object.assign({}, STORE, { role: role }));
    h.w.renderStockDiff();
    ok('обект (' + role + '): 2 реда', rowNames(h.doc).length === 2, JSON.stringify(rowNames(h.doc)));
    h.close();
  }

  section('2. Admin и логистичен склад — всичко както досега');
  for (const [who, u] of [['admin', ADMIN], ['логистичен склад', WH]]) {
    const h = env(u);
    h.w.renderStockDiff();
    const names = rowNames(h.doc);
    ok(who + ': и осемте реда', names.length === 8 && NAMES.every(n => names.indexOf(n) >= 0), JSON.stringify(names));
    ok(who + ': превключвателят (8)', switchNum(h.doc) === 8, switchBtn(h.doc) && switchBtn(h.doc).textContent);
    ok(who + ': чип „Липса (1)“', chipNum(typeChip(h.doc, 'missing')) === 1);
    ok(who + ': чип „Не са фактурирани (1)“', chipNum(typeChip(h.doc, 'not_invoiced')) === 1);
    ok(who + ': чиповете по статус са на място', statusChips(h.doc).map(b => b.dataset.f).join(',') === 'all,pending,taken',
      statusChips(h.doc).map(b => b.dataset.f).join(','));
    realClick(h.w, btn(h.doc.getElementById('mod-stock-diff'), '📥 Excel'));
    await ticks();
    ok(who + ': Excel 8 реда', (h.cap.aoas[0] || []).length === 9, (h.cap.aoas[0] || []).length);
    h.close();
  }
  {
    /* Офисът пази запомнения филтър по статус. */
    const h = env(ADMIN, { filter: 'taken' });
    h.w.renderStockDiff();
    ok('admin: sdFilter „taken“ остава', h.w.sdFilter === 'taken', h.w.sdFilter);
    ok('admin: таблицата — отметнатите', rowNames(h.doc).indexOf('W-TAKEN') >= 0 && rowNames(h.doc).indexOf('W-PENDING') < 0, JSON.stringify(rowNames(h.doc)));
    h.close();
  }

  section('3. Обект: без чипове по статус; запомнен sdFilter пада на „all“ преди таблицата');
  for (const f of ['pending', 'taken', 'completed', 'waiting']) {
    const h = env(STORE, { filter: f });
    h.w.renderStockDiff();
    ok('[' + f + '] 0 чипа по статус', statusChips(h.doc).length === 0, statusChips(h.doc).map(b => b.textContent).join(' | '));
    ok('[' + f + '] Excel бутонът е на мястото си', !!btn(h.doc.getElementById('mod-stock-diff'), '📥 Excel'));
    ok('[' + f + '] sdFilter = all', h.w.sdFilter === 'all', h.w.sdFilter);
    ok('[' + f + '] първото прерисуване — двата чакащи', JSON.stringify(rowNames(h.doc).sort()) === '["R-PENDING","W-PENDING"]', JSON.stringify(rowNames(h.doc)));
    ok('[' + f + '] превключвателят (2)', switchNum(h.doc) === 2, switchBtn(h.doc) && switchBtn(h.doc).textContent);
    h.close();
  }
  {
    const h = env(STORE);
    h.w.renderStockDiff();
    ok('„📝 Чакат моя отговор“ го няма', h.doc.getElementById('mod-stock-diff').textContent.indexOf('Чакат моя отговор') < 0);
    h.close();
  }

  section('4. Клик „📥 Заприходена“ → PATCH към точния id → редът изчезва');
  {
    const h = env(STORE);
    h.w.renderStockDiff();
    const b = h.doc.querySelector('#sd-rows button[onclick*="sdMarkTaken"][data-id="w-p"]');
    ok('бутонът на W-PENDING е „📥 Заприходена“', !!b && b.textContent.indexOf('Заприходена') >= 0, b && b.textContent);
    realClick(h.w, b);
    for (let i = 0; i < 8; i++) await ticks();
    const p = h.calls.patch.filter(x => x.table === 'stock_differences');
    ok('точно един PATCH', p.length === 1, JSON.stringify(p));
    ok('PATCH към id=eq.w-p', p[0] && /stock_differences\?id=eq\.w-p$/.test(p[0].url), p[0] && p[0].url);
    ok('status = taken', p[0] && p[0].body.status === 'taken', p[0] && JSON.stringify(p[0].body));
    /* loadStockDiff() след PATCH — ако в този пакет не е прерисувало, рендер на ръка. */
    if (h.w.sdData.find(x => x.id === 'w-p').status !== 'taken') {
      h.w.sdData.find(x => x.id === 'w-p').status = 'taken';
      h.w.renderStockDiff();
    }
    ok('след прерисуването — само R-PENDING', JSON.stringify(rowNames(h.doc)) === '["R-PENDING"]', JSON.stringify(rowNames(h.doc)));
    ok('превключвателят (1)', switchNum(h.doc) === 1, switchBtn(h.doc) && switchBtn(h.doc).textContent);
    h.close();
  }

  section('5. 0 чакащи → „Нищо не чака вас тук“, превключвателят е видим');
  {
    const h = env(STORE, { lines: ALL.filter(l => ['w-p', 'r-p'].indexOf(l.id) < 0) });
    h.w.renderStockDiff();
    const t = h.doc.getElementById('mod-stock-diff').textContent;
    ok('„Нищо не чака вас тук“', t.indexOf('Нищо не чака вас тук') >= 0);
    ok('без „Няма записи.“', t.indexOf('Няма записи.') < 0);
    ok('превключвателят е видим с (0)', !!switchBtn(h.doc) && switchNum(h.doc) === 0, switchBtn(h.doc) && switchBtn(h.doc).textContent);
    ok('таблица няма', !h.doc.getElementById('sd-rows'));
    h.close();
  }
  {
    const h = env(ADMIN, { lines: [] });
    h.w.renderStockDiff();
    ok('admin при 0 → „Няма записи.“ както досега', h.doc.getElementById('mod-stock-diff').textContent.indexOf('Няма записи.') >= 0);
    h.close();
  }

  section('6. Правилото и бутонът са едно условие');
  {
    const h = env(STORE);
    const extra = [
      line({ id: 'cap', type: 'writein', status: 'capitalized' }),
      line({ id: 'rcv', type: 'writein', status: 'received' }),
      line({ id: 'new', type: 'return', status: 'new' })
    ];
    const exp = { 'w-p': true, 'w-t': false, 'r-p': true, 'r-c': false, 'm-p': false, 'n-p': false, 's-t': false, 'i-r': false, cap: false, rcv: false, 'new': true };
    ALL.concat(extra).forEach(r => {
      ok('sdStoreMustAct(' + r.id + ') = ' + exp[r.id], h.w.sdStoreMustAct(r) === exp[r.id]);
      if (r.type === 'writein' || r.type === 'return')
        ok('  sdRowAwaitsMark(' + r.id + ') = същото', h.w.sdRowAwaitsMark(r) === exp[r.id]);
    });
    h.close();
  }

  report();
})();
