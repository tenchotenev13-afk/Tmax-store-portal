/* Размяна между магазини, стъпка 2: складът свързва излишък → липса,
   развързва и приключва; панелът на реда за всички.

   Проверява се само по <button> - текстът на кандидата и на панела стои и в
   div-ове. Данните са синтетични: Гоце Делчев има излишък (10 по док., 50
   реално = 40), Петрич има липса (20 по док., 0 реално = 20), и двете към
   Логистичен склад Търговище.

   Пускане:  node tests/sd-swap-link.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, btnExact, allBtns, ticks } = H;

const WH = 'Логистичен склад Търговище';
const clone = x => JSON.parse(JSON.stringify(x));

function rep(o) {
  return Object.assign({
    id: 'rep-x', direction: 'interstore', store_name: 'Петрич', counterpart: WH,
    document_number: '4600', doc_date: '2026-09-10', submitted_by: 'Управител',
    general_comment: '', photos: [], reviewed: false, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}
function line(o) {
  return Object.assign({
    id: 'l-x', report_id: 'rep-x', store_name: 'Петрич', supplier: null,
    material_code: '000123', material_name: 'ЩУЦЕР МЕТАЛЕН',
    quantity: 20, quantity_received: 0, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'undelivered', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    store_response: null, store_response_by: null, store_response_at: null,
    store_response_comment: null, swap_id: null, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}

const REP_EX = rep({ id: 'rep-ex', store_name: 'Гоце Делчев', created_at: '2026-09-11T09:00:00.000Z' });
const REP_SH = rep({ id: 'rep-sh', store_name: 'Петрич' });
const L_EX = line({ id: 'l-ex', report_id: 'rep-ex', store_name: 'Гоце Делчев', material_code: '123',
  difference_category: 'excess', quantity: 10, quantity_received: 50, comment: 'дойдоха в повече',
  created_at: '2026-09-11T09:00:00.000Z' });
const L_SH = line({ id: 'l-sh', report_id: 'rep-sh', store_name: 'Петрич', comment: 'липсват' });
/* Съседни редове, за да не се затварят бланките при приключване - иначе броят
   на записите в "Приключи" зависи от бланката, а не от размяната. */
const L_EX2 = line({ id: 'l-ex2', report_id: 'rep-ex', store_name: 'Гоце Делчев', material_code: '999', material_name: 'ДРУГ' });
const L_SH2 = line({ id: 'l-sh2', report_id: 'rep-sh', store_name: 'Петрич', material_code: '888', material_name: 'ТРЕТИ' });

const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };
const PETRICH = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const GOTSE = { email: 'gd@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: 'Гоце Делчев', assigned_stores: [] };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function swap(o) {
  return Object.assign({
    id: 'sw-1', from_line_id: 'l-ex', to_line_id: 'l-sh', from_store: 'Гоце Делчев', to_store: 'Петрич',
    warehouse: WH, material_code: '123', material_name: 'ЩУЦЕР МЕТАЛЕН', qty: 20, status: 'linked',
    transport_mode: null, sap_doc_num: null, note: null, created_by: 'Склад Търговище',
    created_at: '2026-09-12T09:00:00.000Z', sent_by: null, sent_at: null,
    received_by: null, received_at: null, closed_by: null, closed_at: null
  }, o);
}

/* opts.lines / opts.swaps / opts.fail / opts.filter. Размените отиват и в
   sdSwaps (за рендера), и в данните (за loadStockDiff след запис). */
function env(user, opts) {
  opts = opts || {};
  const lines = opts.lines || [L_EX, L_SH, L_EX2, L_SH2];
  const reports = opts.reports || [REP_EX, REP_SH];
  const swaps = opts.swaps || [];
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true, fail: opts.fail,
    data: {
      stock_differences: lines, differences_reports: reports, stock_diff_swaps: swaps,
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: 'Гоце Делчев' }], contacts: []
    }
  });
  h.w.sdData = clone(lines);
  h.w.diffReports = clone(reports);
  h.w.sdSwaps = clone(swaps);
  h.w.transportOrders = [];
  h.w.sdFilter = opts.filter || 'pending'; h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'interstore';
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  /* POST към stock_diff_swaps връща реда с id - като PostgREST с
     Prefer: return=representation. Harness-ът иначе връща {}. */
  const orig = h.w.fetch;
  h.seq = [];
  h.w.fetch = function (url, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    h.seq.push(method + ' ' + url);
    const p = orig(url, init);
    if (method === 'POST' && /\/stock_diff_swaps/.test(url)) {
      return p.then(r => {
        if (!r.ok) return r;
        const row = Object.assign({}, JSON.parse(init.body), { id: 'sw-new' });
        return { ok: true, status: 201, headers: r.headers, json: () => Promise.resolve([row]), text: () => Promise.resolve(JSON.stringify([row])) };
      });
    }
    return p;
  };
  return h;
}

const rowOf = (h, lineId) => {
  const rows = h.doc.querySelectorAll('#mod-stock-diff tr');
  const name = { 'l-ex': 'ЩУЦЕР', 'l-sh': 'ЩУЦЕР' }[lineId];
  const cardId = lineId === 'l-ex' ? 'diff-rep-rep-ex' : 'diff-rep-rep-sh';
  const card = h.doc.getElementById(cardId);
  if (!card) return null;
  return Array.prototype.find.call(card.querySelectorAll('tr'), tr => tr.textContent.indexOf(name) >= 0) || null;
};
const lastCell = tr => tr && tr.cells[tr.cells.length - 1];
const modal = h => h.doc.getElementById('sdswap-ov');
const posts = h => h.calls.post.filter(p => /stock_diff_swaps/.test(p.url));
const patches = (h, re) => h.calls.patch.filter(p => re.test(p.url));
const toasts = h => h.calls.toast.map(t => String(t.msg || t));
const settle = async () => { await ticks(); await ticks(); await ticks(); };

(async function () {

  section('0. sdLineDelta — едно правило за излишък и липса');
  if (ok('sdLineDelta съществува', typeof env(WAREHOUSE).w.sdLineDelta === 'function')) {
    const h = env(WAREHOUSE);
    const d = o => h.w.sdLineDelta(o);
    ok('10 по док. / 50 реално → излишък 40, липса 0', JSON.stringify(d({ quantity: 10, quantity_received: 50 })) === '{"excess":40,"shortage":0,"suspect":false}', JSON.stringify(d({ quantity: 10, quantity_received: 50 })));
    ok('20 / 0 → излишък 0, липса 20', d({ quantity: 20, quantity_received: 0 }).shortage === 20 && d({ quantity: 20, quantity_received: 0 }).excess === 0);
    ok('само по док. 20 → и двете 20', d({ quantity: 20, quantity_received: null }).excess === 20 && d({ quantity: 20, quantity_received: null }).shortage === 20);
    ok('само реално 24 → и двете 24', d({ quantity: null, quantity_received: 24 }).excess === 24);
    ok('нищо → null', d({ quantity: null, quantity_received: '' }).excess === null && d({}).shortage === null);
    ok('числа като низове ("7"/"3") → липса 4', d({ quantity: '7', quantity_received: '3' }).shortage === 4);
    ok('80464309 → suspect', d({ quantity: 80464309, quantity_received: 200 }).suspect === true);
  }

  section('1. "Свържи" вижда само складът');
  {
    const h = env(WAREHOUSE);
    if (guard('render (склад) не хвърля', () => h.w.renderStockDiff())) {
      ok('склад: бутон "Свържи с Гоце Делчев" на реда с липсата', !!btn(rowOf(h, 'l-sh'), 'Свържи с Гоце Делчев'));
      ok('склад: бутон "Свържи с Петрич" на реда с излишъка', !!btn(rowOf(h, 'l-ex'), 'Свържи с Петрич'));
    }
    const s = env(PETRICH);
    s.w.renderStockDiff();
    ok('магазин: нито един "Свържи"', allBtns(s.doc, 'Свържи').length === 0);
  }

  section('2. "Свържи" липсва: received / липса с отворена размяна / вече свързана двойка');
  {
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { status: 'received' })), L_EX2, L_SH2] });
    h.w.sdFilter = 'all';
    h.w.renderStockDiff();
    ok('липсата е received → нула "Свържи"', allBtns(h.doc, 'Свържи').length === 0);
  }
  {
    const other = swap({ id: 'sw-o', from_line_id: 'l-other', from_store: 'Кърджали' });
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-o' })), L_EX2, L_SH2], swaps: [other] });
    h.w.renderStockDiff();
    ok('липсата вече има отворена размяна с друг излишък → нула "Свържи"', allBtns(h.doc, 'Свържи').length === 0);
  }
  {
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2], swaps: [swap()] });
    h.w.renderStockDiff();
    ok('двойката вече е свързана и маркирана → нула "Свържи"', allBtns(h.doc, 'Свържи').length === 0);
  }

  section('3. Модал — подразбиране, валидация, налично');
  {
    const h = env(WAREHOUSE);
    h.w.renderStockDiff();
    realClick(h.w, btn(rowOf(h, 'l-sh'), 'Свържи'));
    const m = modal(h);
    if (ok('модалът е отворен', !!m)) {
      ok('показва и двата магазина', m.textContent.indexOf('Гоце Делчев') >= 0 && m.textContent.indexOf('Петрич') >= 0);
      ok('коментарите на магазините', m.textContent.indexOf('дойдоха в повече') >= 0 && m.textContent.indexOf('липсват') >= 0);
      ok('посоката е излишък → липса', m.textContent.indexOf('Посока: Гоце Делчев → Петрич') >= 0, m.textContent);
      ok('подразбиране = min(налично 40, липса 20) = 20', h.doc.getElementById('sdswap-qty').value === '20', h.doc.getElementById('sdswap-qty').value);

      h.doc.getElementById('sdswap-qty').value = '41';
      realClick(h.w, btnExact(m, '🔗 Свържи'));
      await settle();
      ok('41 > налично 40 → toast', toasts(h).some(t => /над наличното за размяна \(40\)/.test(t)), JSON.stringify(toasts(h)));
      h.doc.getElementById('sdswap-qty').value = '25';
      realClick(h.w, btnExact(m, '🔗 Свържи'));
      await settle();
      ok('25 > липса 20 → toast', toasts(h).some(t => /над липсата \(20\)/.test(t)), JSON.stringify(toasts(h)));
      h.doc.getElementById('sdswap-qty').value = '0';
      realClick(h.w, btnExact(m, '🔗 Свържи'));
      await settle();
      ok('0 → toast', toasts(h).some(t => /по-голямо от 0/.test(t)));
      ok('невалидно → нула POST и нула PATCH', h.calls.post.length === 0 && h.calls.patch.length === 0,
        JSON.stringify(h.seq.filter(s => !/^GET/.test(s))));
    }
  }
  {
    /* Излишък 40, две отворени размени по 15 → третата има налично 10. */
    const o1 = swap({ id: 'sw-a', to_line_id: 'l-a', to_store: 'Сливен', qty: 15 });
    const o2 = swap({ id: 'sw-b', to_line_id: 'l-b', to_store: 'Троян', qty: 15, status: 'sent' });
    const closed = swap({ id: 'sw-c', to_line_id: 'l-c', to_store: 'Раднево', qty: 30, status: 'closed' });
    const h = env(WAREHOUSE, { swaps: [o1, o2, closed] });
    h.w.renderStockDiff();
    realClick(h.w, btn(rowOf(h, 'l-sh'), 'Свържи'));
    const m = modal(h);
    if (ok('модалът е отворен', !!m)) {
      ok('налично = 40 − 15 − 15 = 10 (затворената не се брои)', h.doc.getElementById('sdswap-nums').textContent.indexOf('Налично за размяна: 10') >= 0,
        h.doc.getElementById('sdswap-nums').textContent);
      ok('подразбиране = min(10, 20) = 10', h.doc.getElementById('sdswap-qty').value === '10');
    }
  }
  {
    /* Налично ≤ 0 → бутонът е disabled с причина. */
    const full = swap({ id: 'sw-f', to_line_id: 'l-a', to_store: 'Сливен', qty: 40 });
    const h = env(WAREHOUSE, { swaps: [full] });
    h.w.renderStockDiff();
    realClick(h.w, btn(rowOf(h, 'l-sh'), 'Свържи'));
    const m = modal(h);
    const b = m && btnExact(m, '🔗 Свържи');
    ok('налично 0 → "Свържи" е disabled', !!b && b.disabled === true);
    ok('и казва защо', !!h.doc.getElementById('sdswap-why') && /Няма налично/.test(h.doc.getElementById('sdswap-why').textContent));
  }

  section('4. Лоши данни: количество 80464309');
  {
    const bad = line(Object.assign({}, L_EX, { quantity: 80464309, quantity_received: 200 }));
    const h = env(WAREHOUSE, { lines: [bad, L_SH, L_EX2, L_SH2] });
    h.w.renderStockDiff();
    const b = btn(rowOf(h, 'l-sh'), 'Свържи');
    if (ok('бутонът се показва и при лоши данни', !!b)) {
      ok('клик не хвърля', guard('openSwapLinkModal при 80464309', () => realClick(h.w, b)));
      const s = h.doc.getElementById('sdswap-suspect');
      ok('червен надпис "Проверете количеството по документ"', !!s && s.textContent === 'Проверете количеството по документ');
      ok('qty е празно', h.doc.getElementById('sdswap-qty').value === '', h.doc.getElementById('sdswap-qty').value);
    }
  }

  section('5. Успешно свързване → 1 POST + 1 PATCH със swap_id');
  {
    const h = env(WAREHOUSE);
    h.w.renderStockDiff();
    realClick(h.w, btn(rowOf(h, 'l-sh'), 'Свържи'));
    h.doc.getElementById('sdswap-note').value = 'с буса в четвъртък';
    realClick(h.w, btnExact(modal(h), '🔗 Свържи'));
    await settle();
    const p = posts(h);
    if (ok('един POST към stock_diff_swaps', p.length === 1, JSON.stringify(h.seq.filter(s => !/^GET/.test(s))))) {
      const b = p[0].body;
      ok('from = излишъкът, to = липсата', b.from_line_id === 'l-ex' && b.to_line_id === 'l-sh' && b.from_store === 'Гоце Делчев' && b.to_store === 'Петрич', JSON.stringify(b));
      ok('warehouse = counterpart', b.warehouse === WH);
      ok('qty 20, status linked, бележка', b.qty === 20 && b.status === 'linked' && b.note === 'с буса в четвъртък', JSON.stringify(b));
      ok('created_by = sdActor()', b.created_by === 'Склад Търговище', JSON.stringify(b.created_by));
    }
    const pt = patches(h, /stock_differences/);
    ok('един PATCH към stock_differences', pt.length === 1, JSON.stringify(pt.map(x => x.url)));
    ok('PATCH на реда с липсата със swap_id от отговора', pt[0] && /id=eq\.l-sh/.test(pt[0].url) && pt[0].body.swap_id === 'sw-new', pt[0] && JSON.stringify(pt[0]));
    ok('POST е ПРЕДИ PATCH', h.seq.findIndex(s => /^POST .*stock_diff_swaps/.test(s)) < h.seq.findIndex(s => /^PATCH .*stock_differences/.test(s)));
    ok('toast за успех', toasts(h).indexOf('🔗 Размяната е свързана') >= 0, JSON.stringify(toasts(h)));
    ok('модалът е затворен', !modal(h));
  }

  section('6. PATCH пада → червен toast, ⚠, повторен клик = само PATCH');
  {
    const state = { failPatch: true };
    const h = env(WAREHOUSE, { fail: { PATCH: url => state.failPatch && /stock_differences/.test(url) } });
    h.w.renderStockDiff();
    realClick(h.w, btn(rowOf(h, 'l-sh'), 'Свържи'));
    realClick(h.w, btnExact(modal(h), '🔗 Свържи'));
    await settle();
    ok('червен toast "Размяната е записана, но редът не е маркиран — натиснете отново"',
      toasts(h).indexOf('Размяната е записана, но редът не е маркиран — натиснете отново') >= 0, JSON.stringify(toasts(h)));
    ok('маркер ⚠ на реда', !!rowOf(h, 'l-sh').querySelector('[data-sdswap-warn]'), lastCell(rowOf(h, 'l-sh')).textContent);
    const again = btn(rowOf(h, 'l-sh'), 'Свържи');
    if (ok('"Свържи" е пак на екрана за същата двойка', !!again)) {
      state.failPatch = false;
      realClick(h.w, again);
      await settle();
      ok('повторен клик: без модал', !modal(h));
      ok('повторен клик: НЯМА нов POST (общо 1)', posts(h).length === 1, String(posts(h).length));
      const pt = patches(h, /stock_differences/);
      ok('повторен клик: втори PATCH със swap_id sw-new', pt.length === 2 && pt[1].body.swap_id === 'sw-new', JSON.stringify(pt.map(x => x.body)));
    }
  }

  section('7. Развържи → PATCH swap_id=null ПРЕДИ DELETE');
  {
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2], swaps: [swap()] });
    h.w.renderStockDiff();
    const b = btn(lastCell(rowOf(h, 'l-sh')), '✖ Развържи');
    if (ok('складът вижда "✖ Развържи" при linked', !!b)) {
      h.seq.length = 0;
      realClick(h.w, b);
      await settle();
      const iP = h.seq.findIndex(s => /^PATCH .*stock_differences/.test(s));
      const iD = h.seq.findIndex(s => /^DELETE .*stock_diff_swaps/.test(s));
      ok('има PATCH и DELETE', iP >= 0 && iD >= 0, JSON.stringify(h.seq));
      ok('PATCH е преди DELETE', iP >= 0 && iD > iP, JSON.stringify(h.seq));
      const pt = patches(h, /stock_differences/)[0];
      ok('PATCH: swap_id=null, само ако сочи тази размяна', !!pt && pt.body.swap_id === null && /id=eq\.l-sh/.test(pt.url) && /swap_id=eq\.sw-1/.test(pt.url), pt && pt.url);
      ok('DELETE на точната размяна', /id=eq\.sw-1/.test(h.seq[iD]), h.seq[iD]);
    }
  }
  {
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2],
      swaps: [swap()], fail: { PATCH: /stock_differences/ } });
    h.w.renderStockDiff();
    realClick(h.w, btn(lastCell(rowOf(h, 'l-sh')), '✖ Развържи'));
    await settle();
    ok('PATCH пада → НЯМА DELETE', !h.seq.some(s => /^DELETE/.test(s)), JSON.stringify(h.seq));
    ok('и червен toast', toasts(h).some(t => /Развързването НЕ мина/.test(t)));
  }

  section('8. Приключи — само при received; клик → 3 записа');
  {
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2], swaps: [swap()] });
    h.w.renderStockDiff();
    ok('linked: няма "Приключи"', !btn(h.doc, 'Приключи'));
  }
  {
    const rec = swap({ status: 'received', transport_mode: 'van', received_at: '2026-09-14T10:00:00.000Z', sap_doc_num: '4900123' });
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2], swaps: [rec] });
    h.w.renderStockDiff();
    const b = btn(lastCell(rowOf(h, 'l-sh')), '🏁 Приключи размяната');
    ok('received: панелът показва превоз, дата и SAP', lastCell(rowOf(h, 'l-sh')).textContent.indexOf('превоз: бус · 14.09.2026 · SAP 4900123') >= 0,
      lastCell(rowOf(h, 'l-sh')).textContent);
    ok('received: няма "Развържи"', !btn(h.doc, 'Развържи'));
    if (ok('received: има "🏁 Приключи размяната"', !!b)) {
      h.seq.length = 0;
      realClick(h.w, b);
      await settle(); await settle();
      const writes = h.seq.filter(s => !/^GET/.test(s));
      ok('точно 3 записа', writes.length === 3, JSON.stringify(writes));
      const ps = h.calls.patch;
      ok('1) размяната → closed + closed_by/at', /stock_diff_swaps\?id=eq\.sw-1/.test(ps[0].url) && ps[0].body.status === 'closed' && ps[0].body.closed_by === 'Склад Търговище' && !!ps[0].body.closed_at, JSON.stringify(ps[0]));
      ok('2) редът с излишъка → received', /stock_differences\?id=eq\.l-ex$/.test(ps[1].url) && ps[1].body.status === 'received' && ps[1].body.completed_by === 'Склад Търговище', JSON.stringify(ps[1]));
      ok('3) редът с липсата → received', /stock_differences\?id=eq\.l-sh$/.test(ps[2].url) && ps[2].body.status === 'received', JSON.stringify(ps[2]));
      ok('store_response не се пипа', ps.every(p => !('store_response' in p.body)));
      ok('toast "🏁 Размяната е приключена"', toasts(h).indexOf('🏁 Размяната е приключена') >= 0, JSON.stringify(toasts(h)));
    }
  }
  {
    /* Провал на втория запис → toast казва КОЙ ред, третият не тръгва. */
    const rec = swap({ status: 'received' });
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2],
      swaps: [rec], fail: { PATCH: /stock_differences\?id=eq\.l-ex$/ } });
    h.w.renderStockDiff();
    realClick(h.w, btn(h.doc, '🏁 Приключи размяната'));
    await settle(); await settle();
    ok('провал на реда на Гоце Делчев → червен toast с името', toasts(h).some(t => /редът на Гоце Делчев НЕ е/.test(t)), JSON.stringify(toasts(h)));
    ok('без тих успех', toasts(h).indexOf('🏁 Размяната е приключена') < 0);
    ok('редът с липсата НЕ е пипан след провала', !h.calls.patch.some(p => /id=eq\.l-sh$/.test(p.url)));
  }
  {
    /* Излишъкът захранва и друга отворена размяна → неговият ред остава отворен. */
    const rec = swap({ status: 'received' });
    const other = swap({ id: 'sw-2', to_line_id: 'l-a', to_store: 'Сливен', qty: 10 });
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2], swaps: [rec, other] });
    h.w.renderStockDiff();
    realClick(h.w, btn(lastCell(rowOf(h, 'l-sh')), '🏁 Приключи размяната'));
    await settle(); await settle();
    ok('излишък с друга отворена размяна: редът му НЕ става received', !h.calls.patch.some(p => /id=eq\.l-ex$/.test(p.url)), JSON.stringify(h.calls.patch.map(p => p.url)));
    ok('а липсата става', h.calls.patch.some(p => /id=eq\.l-sh$/.test(p.url) && p.body.status === 'received'));
  }
  {
    /* Бланка само с този ред → затваря се (reviewed), като при sdConfirmInterstore. */
    const rec = swap({ status: 'received' });
    const h = env(WAREHOUSE, { lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2], swaps: [rec] });
    h.w.renderStockDiff();
    realClick(h.w, btn(h.doc, '🏁 Приключи размяната'));
    await settle(); await settle();
    ok('бланката на Петрич (единствен ред) → reviewed:true', h.calls.patch.some(p => /differences_reports\?id=eq\.rep-sh/.test(p.url) && p.body.reviewed === true),
      JSON.stringify(h.calls.patch.map(p => p.url)));
    ok('бланката на Гоце Делчев (има отворен ред) НЕ се затваря', !h.calls.patch.some(p => /differences_reports\?id=eq\.rep-ex/.test(p.url)));
  }

  section('9. Ред с отворена размяна няма "Прието обратно"');
  {
    const lines = [line(Object.assign({}, L_EX, { warehouse_response: 'return', store_response: 'sap_done' })), L_SH, L_EX2, L_SH2];
    const without = env(WAREHOUSE, { lines: lines });
    without.w.renderStockDiff();
    ok('контрола: без размяна складът вижда "Прието обратно"', !!btn(rowOf(without, 'l-ex'), 'Прието обратно'));
    const withSwap = env(WAREHOUSE, { lines: lines, swaps: [swap()] });
    withSwap.w.renderStockDiff();
    ok('с отворена размяна: няма "Прието обратно"', !btn(rowOf(withSwap, 'l-ex'), 'Прието обратно'));
    const store = env(PETRICH, { lines: [L_EX, line(Object.assign({}, L_SH, { warehouse_response: 'sent', swap_id: 'sw-1' })), L_EX2, L_SH2], swaps: [swap()] });
    store.w.renderStockDiff();
    ok('с отворена размяна: магазинът няма "ПРИЕТО"', !btn(rowOf(store, 'l-sh'), 'ПРИЕТО'));
  }

  section('10. Магазините и Цвети виждат панела без бутони');
  {
    const rec = swap({ status: 'sent', transport_mode: 'truck', sent_at: '2026-09-13T08:00:00.000Z' });
    const lines = [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2];
    [['Петрич (to)', PETRICH, 'l-sh'], ['Гоце Делчев (from)', GOTSE, 'l-ex'], ['Цвети', CVETI, 'l-sh']].forEach(function (c) {
      const h = env(c[1], { lines: lines, swaps: [rec] });
      h.w.renderStockDiff();
      const tr = rowOf(h, c[2]);
      const panel = tr && tr.querySelector('[data-sdswap]');
      if (ok(c[0] + ': панелът е на реда', !!panel, tr && lastCell(tr).textContent)) {
        ok(c[0] + ': "🔗 Размяна: Гоце Делчев → Петрич · 20 бр. · изпратено (камион)"',
          panel.textContent.indexOf('🔗 Размяна: Гоце Делчев → Петрич · 20 бр. · изпратено (камион)') >= 0, panel.textContent);
        ok(c[0] + ': нула бутони в панела', panel.querySelectorAll('button').length === 0);
      }
    });
  }

  section('11. Зареждане и главната таблица');
  {
    const h = env(WAREHOUSE);
    h.calls.get.length = 0;
    h.w.loadStockDiff();
    await settle(); await settle();
    const g = h.calls.get.filter(u => /stock_diff_swaps/.test(u));
    if (ok('loadStockDiff прави една заявка за размените', g.length === 1, h.calls.get.join(' | '))) {
      const u = decodeURIComponent(g[0]);
      ok('по from_line_id И to_line_id на заредените междускладови редове',
        /or=\(from_line_id\.in\.\([^)]*l-ex[^)]*\),to_line_id\.in\.\([^)]*l-sh/.test(u), u);
    }
  }
  {
    const h = env(WAREHOUSE, { lines: [], reports: [] });
    h.calls.get.length = 0;
    h.w.loadStockDiff();
    await settle(); await settle();
    ok('без междускладови редове → нула заявки за размени', !h.calls.get.some(u => /stock_diff_swaps/.test(u)));
  }
  {
    const closed = swap({ status: 'closed' });
    const lines = [line(Object.assign({}, L_EX, { status: 'received' })), line(Object.assign({}, L_SH, { status: 'received', swap_id: 'sw-1' }))];
    const h = env(CVETI, { lines: lines, swaps: [closed], filter: 'all' });
    h.w.renderStockDiff();
    const table = Array.prototype.find.call(h.doc.querySelectorAll('#mod-stock-diff table'),
      t => t.querySelector('thead') && t.querySelector('thead').textContent.indexOf('Кредитно') >= 0);
    ok('главната таблица: "🔗 Размяна: Гоце Делчев → Петрич · 20 бр. · приключена"',
      !!table && table.textContent.indexOf('🔗 Размяна: Гоце Делчев → Петрич · 20 бр. · приключена') >= 0,
      table && table.textContent.slice(0, 400));
  }

  report();
})();
