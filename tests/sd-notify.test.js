/* Междускладови разлики: известия в двете посоки.

   PUSH (push.js → pushInterstoreDiff → pushToStores → portal-push):
     1. складът отговаря (и "Ще се изпрати")   → магазина
     2. магазинът: ПУСНАТО В SAP                → склада
     3. магазинът: НЯМА НАЛИЧНОСТ В ЛОГИСТИКА   → склада
     4. магазинът: ✅ ПРИЕТО                    → склада
     5. складът: 📬 Прието обратно               → магазина
   Празен обект спира в pushInterstoreDiff - pushToStores([]) пада към
   pushToAll() и би разпратил до целия портал. Push-ът е fire-and-forget:
   провал в него не пипа нито записа, нито toast-а на действието.

   IN-APP: баджът на магазина е "чака моето действие", а пулсът звъни само
   когато броят ПОРАСНЕ спрямо предишния пулс (първият след логин - тихо).

   fetch към portal-push не е мокнат на ръка: истинският osSend() праща
   POST, harness-ът го записва в calls.post. Така тестът вижда реалното тяло
   (filters по таг store_name), а не аргументите на подменена функция.

   Пускане:  node tests/sd-notify.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, btnExact, ticks } = H;

const WH_NAME = 'Логистичен склад Търговище';
const REP_INT = {
  id: 'rep-int', direction: 'interstore', store_name: 'Петрич', counterpart: WH_NAME,
  document_number: '180491138', doc_date: '2026-09-10', submitted_by: 'Управител Петрич',
  general_comment: '', photos: [], reviewed: false, created_at: '2026-09-10T09:00:00.000Z'
};

function line(o) {
  return Object.assign({
    store_name: 'Петрич', supplier: null, report_id: 'rep-int',
    material_code: '34989', material_name: 'ЩУЦЕР МЕТАЛЕН',
    quantity: 10, quantity_received: 8, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'shortage', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    store_response: null, store_response_by: null, store_response_at: null,
    store_response_comment: null
  }, o);
}

const WAREHOUSE = {
  email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
  role: 'sklad', store_name: WH_NAME, assigned_stores: []
};
const STORE = {
  email: 'petrich@temax.bg', display_name: 'Управител Петрич',
  role: 'manager', store_name: 'Петрич', assigned_stores: []
};
const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

/* Редът от index.html; transport/client-orders са зависимости на рендера и
   на notifications.js. */
const MODS = ['transport.js', 'client-orders.js', 'stock-returns.js', 'stock-differences.js', 'push.js', 'notifications.js'];
const clone = x => JSON.parse(JSON.stringify(x));

function env(user, lines, opts) {
  opts = opts || {};
  const reports = opts.reports || [REP_INT];
  const h = boot({
    modules: opts.modules || MODS,
    user: user,
    confirm: true,
    fail: opts.fail,
    data: Object.assign({
      stock_differences: lines, differences_reports: reports,
      stock_returns: [], transport_orders: [], client_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: WH_NAME }], contacts: []
    }, opts.data || {})
  });
  h.w.sdData = clone(lines);
  h.w.diffReports = clone(reports);
  h.w.transportOrders = [];
  h.w.sdFilter = 'pending';
  h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = '';
  h.w.sdSearch = '';
  h.w.sdDirTab = 'interstore';
  if (h.w.invalidateStoreCaches) h.w.invalidateStoreCaches();
  if (h.w.invalidateSuppliersCache) h.w.invalidateSuppliersCache();
  return h;
}

const card = (doc, id) => doc.getElementById('diff-rep-' + (id || 'rep-int'));
const pushes = h => h.calls.post.filter(p => /\/functions\/v1\/portal-push/.test(p.url));
const targets = p => ((p.body && p.body.filters) || []).filter(f => f.key === 'store_name').map(f => f.value);
const sdPatches = h => h.calls.patch.filter(p => p.table === 'stock_differences');
const toasts = h => h.calls.toast.map(t => String(t.msg || t));
const settle = async () => { await ticks(); await ticks(); await ticks(); };

/* Една проверка "точно едно известие, точно към този обект". */
function expectPush(h, label, target, title, msg) {
  const p = pushes(h);
  if (!ok(label + ': точно един push', p.length === 1, JSON.stringify(p.map(x => x.body)))) return;
  const b = p[0].body;
  ok(label + ': получател "' + target + '" и само той',
    JSON.stringify(targets(p[0])) === JSON.stringify([target]) && b.filters.length === 1,
    JSON.stringify(b.filters));
  ok(label + ': НЕ е до всички', !b.included_segments, JSON.stringify(b.included_segments));
  ok(label + ': заглавие', b.title === title, JSON.stringify(b.title));
  ok(label + ': текст', b.message === msg, JSON.stringify(b.message));
}

async function warehouseRespond(h, label) {
  h.w.renderStockDiff();
  realClick(h.w, btn(card(h.doc), label));
  await ticks();
  realClick(h.w, btnExact(h.doc.getElementById('whr-ov'), '💾 Запази'));
  await settle();
}

let unhandled = 0;
process.on('unhandledRejection', () => { unhandled++; });

(async function () {

  section('1. Петте действия → push до правилния обект');
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1' })]);
    await warehouseRespond(h, '📤 Изпратено');
    expectPush(h, '1 склад → магазин (Изпратено)', 'Петрич',
      '📦 Разлика: отговор от склада', WH_NAME + ': 📤 Изпратено · ЩУЦЕР МЕТАЛЕН');
    ok('1: toast-ът на действието е същият', toasts(h).indexOf('✅ Отговорът е запазен!') >= 0, JSON.stringify(toasts(h)));
  }
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1' })]);
    await warehouseRespond(h, '⏳ Ще изпрати');
    expectPush(h, '1 склад → магазин (Ще се изпрати)', 'Петрич',
      '📦 Разлика: отговор от склада', WH_NAME + ': ⏳ Ще се изпрати · ЩУЦЕР МЕТАЛЕН');
  }
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })]);
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc), '📄 ПУСНАТО В SAP'));
    await settle();
    expectPush(h, '2 магазин → склад (SAP)', WH_NAME,
      '📄 Разлика: пуснато в SAP', 'Петрич: ЩУЦЕР МЕТАЛЕН — приемете обратно');
  }
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })]);
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc), '⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА'));
    await ticks();
    ok('3: отварянето на модала не праща push', pushes(h).length === 0);
    h.doc.getElementById('sdnostock-comment').value = 'наличност 0';
    realClick(h.w, btnExact(h.doc.getElementById('sdnostock-ov'), '💾 Запази'));
    await settle();
    expectPush(h, '3 магазин → склад (няма наличност)', WH_NAME,
      '⛔ Разлика: няма наличност в логистика', 'Петрич: ЩУЦЕР МЕТАЛЕН');
  }
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent' })]);
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc), '✅ ПРИЕТО'));
    await settle();
    expectPush(h, '4 магазин → склад (ПРИЕТО)', WH_NAME, '✅ Разлика: прието в Петрич', 'ЩУЦЕР МЕТАЛЕН');
  }
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'return', store_response: 'sap_done' })]);
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc), '📬 Прието обратно'));
    await settle();
    expectPush(h, '5 склад → магазин (прието обратно)', 'Петрич',
      '📬 Разлика: прието обратно в ' + WH_NAME, 'ЩУЦЕР МЕТАЛЕН');
  }
  {
    /* Отказан confirm() → нищо не е записано → и известие няма. */
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent' })]);
    h.w.confirm = () => false;
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc), '✅ ПРИЕТО'));
    await settle();
    ok('отказан confirm → нула PATCH и нула push', sdPatches(h).length === 0 && pushes(h).length === 0);
  }

  section('2. Празен получател → нула заявки към portal-push');
  {
    const rep = Object.assign({}, REP_INT, { store_name: '' });
    const h = env(WAREHOUSE, [line({ id: 'l-1', store_name: '' })], { reports: [rep] });
    await warehouseRespond(h, '📤 Изпратено');
    ok('празен store_name: записът минава', sdPatches(h).length === 1, JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('празен store_name: нула push', pushes(h).length === 0, JSON.stringify(pushes(h).map(p => p.body)));
  }
  {
    const rep = Object.assign({}, REP_INT, { counterpart: '' });
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })], { reports: [rep] });
    h.w.renderStockDiff();
    const b = btn(card(h.doc), '📄 ПУСНАТО В SAP');
    if (ok('празен counterpart: магазинът пак вижда бутона', !!b)) {
      realClick(h.w, b);
      await settle();
      ok('празен counterpart: записът минава', sdPatches(h).length === 1);
      ok('празен counterpart: нула push', pushes(h).length === 0, JSON.stringify(pushes(h).map(p => p.body)));
    }
  }
  {
    const h = env(STORE, []);
    let all = 0, stores = 0;
    h.w.pushToAll = () => { all++; return Promise.resolve({ ok: true }); };
    h.w.pushToStores = () => { stores++; return Promise.resolve({ ok: true }); };
    const r1 = await h.w.pushInterstoreDiff('', 't', 'm');
    const r2 = await h.w.pushInterstoreDiff('   ', 't', 'm');
    const r3 = await h.w.pushInterstoreDiff(null, 't', 'm');
    ok('pushInterstoreDiff("" / "   " / null) → ok:false "Няма получател"',
      [r1, r2, r3].every(r => r && r.ok === false && r.data.message === 'Няма получател'), JSON.stringify([r1, r2, r3]));
    ok('и НЕ стига до pushToStores', stores === 0, String(stores));
    ok('и НЕ пада към pushToAll', all === 0, String(all));
    ok('нула fetch към portal-push', pushes(h).length === 0);
  }

  section('3. Провален push не пипа записа и toast-а');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })], { fail: { POST: /portal-push/ } });
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc), '📄 ПУСНАТО В SAP'));
    await settle();
    ok('push-ът наистина е паднал (500)', h.calls.notOk.some(n => /portal-push/.test(n.url)), JSON.stringify(h.calls.notOk));
    ok('записът е минал', sdPatches(h).length === 1 && sdPatches(h)[0].body.store_response === 'sap_done');
    ok('toast "✅ Записано"', toasts(h).indexOf('✅ Записано') >= 0, JSON.stringify(toasts(h)));
    ok('нула toast за грешка', !toasts(h).some(t => /Грешка/.test(t)), JSON.stringify(toasts(h)));
  }
  {
    /* Синхронно хвърляне в самия push - loadStockDiff() след него пак тръгва. */
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })]);
    h.w.pushInterstoreDiff = () => { throw new Error('boom'); };
    h.w.renderStockDiff();
    h.calls.get.length = 0;
    realClick(h.w, btn(card(h.doc), '📄 ПУСНАТО В SAP'));
    await settle();
    ok('хвърлящ push: toast "✅ Записано"', toasts(h).indexOf('✅ Записано') >= 0, JSON.stringify(toasts(h)));
    ok('хвърлящ push: loadStockDiff() пак презарежда', h.calls.get.some(u => /stock_differences/.test(u)), h.calls.get.join(' | '));
  }
  {
    /* Отхвърлен promise - .catch го поглъща, нищо не остава необработено. */
    const before = unhandled;
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent' })]);
    h.w.pushInterstoreDiff = () => Promise.reject(new Error('offline'));
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc), '✅ ПРИЕТО'));
    await settle();
    ok('отхвърлен push: записът минава', sdPatches(h).length === 1);
    ok('отхвърлен push: нула необработени rejection-и', unhandled === before, String(unhandled - before));
  }
  {
    /* Без push.js изобщо - typeof пази действието. */
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })],
      { modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'] });
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc), '📄 ПУСНАТО В SAP'));
    await settle();
    ok('без push.js: записът и toast-ът са на място',
      sdPatches(h).length === 1 && toasts(h).indexOf('✅ Записано') >= 0, JSON.stringify(toasts(h)));
  }

  section('4. Бадж на магазина — "чака моето действие"');
  {
    const R = (id, o) => Object.assign({ id: id, store_name: 'Петрич', counterpart: WH_NAME, reviewed: false }, o || {});
    const reports = [R('A'), R('B'), R('C')];
    const lines = [
      { report_id: 'A', warehouse_response: 'sent', store_response: null, status: 'new' },
      { report_id: 'B', warehouse_response: 'return', store_response: 'no_stock', status: 'new' },
      { report_id: 'C', warehouse_response: 'sent', store_response: 'accepted', status: 'received' },
      { report_id: 'C', warehouse_response: 'return', store_response: null, status: 'received' }
    ];
    const h = env(STORE, []);
    ok('3 бланки (sent без отговор / no_stock / всичко received) → 1',
      h.w.sdUnreviewedCountFor(reports, lines) === 1, String(h.w.sdUnreviewedCountFor(reports, lines)));

    const more = reports.concat([R('D'), R('E'), R('F'), R('G', { store_name: 'Шумен' }), R('H')]);
    const moreLines = lines.concat([
      { report_id: 'D', warehouse_response: 'will_send', store_response: null, status: 'new' },
      { report_id: 'E', warehouse_response: 'return', store_response: null, status: 'new' },
      { report_id: 'F', warehouse_response: null, store_response: null, status: 'new' },
      { report_id: 'G', warehouse_response: 'sent', store_response: null, status: 'new' },
      { report_id: 'H', warehouse_response: 'return', store_response: 'sap_done', status: 'new' }
    ]);
    ok('will_send / без отговор / чужд обект / sap_done не се броят; return без отговор се брои → 2',
      h.w.sdUnreviewedCountFor(more, moreLines) === 2, String(h.w.sdUnreviewedCountFor(more, moreLines)));

    const hc = env(CVETI, []);
    ok('Цвети/admin — без промяна: всички непрегледани (8)',
      hc.w.sdUnreviewedCountFor(more, moreLines) === 8, String(hc.w.sdUnreviewedCountFor(more, moreLines)));
  }

  section('5. Пулс — звъни само при ръст');
  {
    const state = { reports: [], lines: [] };
    const setCount = (n, forWarehouse) => {
      state.reports = []; state.lines = [];
      for (let i = 0; i < n; i++) {
        state.reports.push({ id: 'p' + i, store_name: 'Петрич', counterpart: WH_NAME, reviewed: false });
        state.lines.push(forWarehouse
          ? { report_id: 'p' + i, warehouse_response: null, store_response: null, status: 'new' }
          : { report_id: 'p' + i, warehouse_response: 'sent', store_response: null, status: 'new' });
      }
    };
    const pulseEnv = (user, modules) => {
      const h = env(user, [], { modules: modules, data: {
        differences_reports: () => state.reports, stock_differences: () => state.lines } });
      Object.defineProperty(h.doc, 'hidden', { configurable: true, get: () => false });
      h.notes = []; h.sounds = 0;
      if (modules === undefined) {
        h.w.coNotifyToast = (t) => { h.notes.push(t); };
        h.w.playSound = () => { h.sounds++; };
      }
      return h;
    };
    const badgeText = h => { const b = h.doc.getElementById('badge-stock-diff'); return b ? (b.style.display === 'none' ? '' : b.textContent) : null; };

    const h = pulseEnv(STORE);
    setCount(1);
    h.w.startSDBadgePolling();
    await settle();
    ok('първи пулс след логин (1) → тихо', h.notes.length === 0 && h.sounds === 0, JSON.stringify(h.notes));
    ok('балончето показва 1', badgeText(h) === '1', String(badgeText(h)));

    setCount(3);
    h.w.sdRefreshTabBadge(); await settle();
    ok('1 → 3 → известие', h.notes.length === 1, JSON.stringify(h.notes));
    ok('текстът', h.notes[0] === '🔔 Разлики: 3 бланки чакат вашата реакция', JSON.stringify(h.notes[0]));
    ok('и звук', h.sounds === 1, String(h.sounds));

    setCount(2);
    h.w.sdRefreshTabBadge(); await settle();
    ok('3 → 2 → тихо', h.notes.length === 1 && h.sounds === 1, JSON.stringify(h.notes));
    h.w.sdRefreshTabBadge(); await settle();
    ok('2 → 2 → тихо', h.notes.length === 1 && h.sounds === 1);
    ok('балончето следва спада (2)', badgeText(h) === '2', String(badgeText(h)));

    setCount(0);
    h.w.sdRefreshTabBadge(); await settle();
    setCount(1);
    h.w.sdRefreshTabBadge(); await settle();
    ok('0 → 1 → известие в единствено число', h.notes[h.notes.length - 1] === '🔔 Разлики: 1 бланка чака вашата реакция',
      JSON.stringify(h.notes));

    const n0 = h.notes.length;
    setCount(5);
    h.w.startSDBadgePolling(); await settle();
    ok('нов логин (5) → първият пулс пак е тих', h.notes.length === n0, JSON.stringify(h.notes));
  }
  {
    /* Складът: същият пулс, собственият му брой. */
    const state = { reports: [], lines: [] };
    const h = env(WAREHOUSE, [], { data: {
      differences_reports: () => state.reports, stock_differences: () => state.lines } });
    Object.defineProperty(h.doc, 'hidden', { configurable: true, get: () => false });
    const notes = [];
    h.w.coNotifyToast = (t) => { notes.push(t); };
    h.w.playSound = () => {};
    h.w.startSDBadgePolling(); await settle();
    ok('склад: първи пулс (0) → тихо', notes.length === 0);
    state.reports = [{ id: 'w1', store_name: 'Петрич', counterpart: WH_NAME, reviewed: false }];
    state.lines = [{ report_id: 'w1', warehouse_response: null, store_response: null, status: 'new' }];
    h.w.sdRefreshTabBadge(); await settle();
    ok('склад: 0 → 1 → известие', notes.length === 1 && notes[0] === '🔔 Разлики: 1 бланка чака вашата реакция',
      JSON.stringify(notes));
  }
  {
    /* Истинският coNotifyToast (не подменен): hover "Отвори Разлики" и клик,
       който превключва на таба, а не само скрива известието. */
    const state = { reports: [], lines: [] };
    const h = env(STORE, [], { data: {
      differences_reports: () => state.reports, stock_differences: () => state.lines } });
    Object.defineProperty(h.doc, 'hidden', { configurable: true, get: () => false });
    h.w.playSound = () => {};
    const shown = [];
    h.w.showModule = (m) => { shown.push(m); };
    h.w.startSDBadgePolling(); await settle();
    state.reports = [{ id: 't1', store_name: 'Петрич', counterpart: WH_NAME, reviewed: false }];
    state.lines = [{ report_id: 't1', warehouse_response: 'sent', store_response: null, status: 'new' }];
    h.w.sdRefreshTabBadge(); await settle();
    const t = h.doc.getElementById('co-toast');
    if (t) t.click();
    ok('известието: hover "Отвори Разлики", клик → showModule("stock-diff") и се скрива',
      !!t && t.title === 'Отвори Разлики' && JSON.stringify(shown) === '["stock-diff"]' && t.style.display === 'none',
      JSON.stringify({ title: t && t.title, shown: shown, display: t && t.style.display }));
  }
  {
    /* Без notifications.js - coNotifyToast/playSound липсват, пулсът не гърми. */
    const state = { reports: [], lines: [] };
    const h = env(STORE, [], { modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'push.js'],
      data: { differences_reports: () => state.reports, stock_differences: () => state.lines } });
    Object.defineProperty(h.doc, 'hidden', { configurable: true, get: () => false });
    ok('coNotifyToast наистина липсва', typeof h.w.coNotifyToast === 'undefined');
    h.w.startSDBadgePolling(); await settle();
    state.reports = [{ id: 'x1', store_name: 'Петрич', counterpart: WH_NAME, reviewed: false }];
    state.lines = [{ report_id: 'x1', warehouse_response: 'sent', store_response: null, status: 'new' }];
    const threw = !guard('ръст без notifications.js не хвърля', () => h.w.sdRefreshTabBadge());
    await settle();
    const b = h.doc.getElementById('badge-stock-diff');
    ok('и балончето пак се обновява (1)', !threw && !!b && b.textContent === '1', b && b.textContent);
  }

  report();
})();
