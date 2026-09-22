/* "📦 Получено междувременно" — магазинът закрива липса по междускладов ред
   сам, когато стоката е дошла по друг път.

   Без схемна промяна: status='received' + store_response='accepted', а
   "междувременно" личи от началото на store_response_comment
   ("Получено междувременно на ..."). Тестът заковава и префикса, и това, че
   складът губи трите си бутона на received ред.

   Проверки за бутони - САМО по <button>: етикетът "📦 Получено от магазина"
   стои в div.

   Пускане:  node tests/sd-late-receive.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, btnExact, allBtns, ticks, dayOffset } = H;

const WH = 'Логистичен склад Търговище';
const clone = x => JSON.parse(JSON.stringify(x));
const LATE = '📦 Получено междувременно';

const REP = {
  id: 'rep-p', direction: 'interstore', store_name: 'Петрич', counterpart: WH,
  document_number: '4600', doc_date: '2026-09-10', submitted_by: 'Управител',
  general_comment: '', photos: [], reviewed: false, created_at: '2026-09-10T09:00:00.000Z'
};
function line(o) {
  return Object.assign({
    id: 'l-1', report_id: 'rep-p', store_name: 'Петрич', supplier: null,
    material_code: '34989', material_name: 'ЩУЦЕР МЕТАЛЕН',
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
/* Втори, отворен ред в същата бланка - за да НЕ се затваря бланката. */
const OTHER = line({ id: 'l-2', material_code: '888', material_name: 'ДРУГ АРТИКУЛ' });

const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function env(user, lines, opts) {
  opts = opts || {};
  const rep = opts.report || REP;
  const h = boot({
    modules: opts.modules || ['transport.js', 'stock-returns.js', 'stock-differences.js', 'push.js'],
    user: user, confirm: true, fail: opts.fail,
    data: {
      stock_differences: lines, differences_reports: [rep], stock_diff_swaps: opts.swaps || [],
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: WH }], contacts: []
    }
  });
  h.w.sdData = clone(lines);
  h.w.diffReports = clone([rep]);
  h.w.sdSwaps = clone(opts.swaps || []);
  h.w.transportOrders = [];
  h.w.sdFilter = opts.filter || 'pending'; h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'interstore';
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  return h;
}

const card = h => h.doc.getElementById('diff-rep-rep-p');
const rowOf = (h, name) => card(h) && Array.prototype.find.call(card(h).querySelectorAll('tr'), tr => tr.textContent.indexOf(name) >= 0);
const lastCell = tr => tr && tr.cells[tr.cells.length - 1];
const modal = h => h.doc.getElementById('sdlate-ov');
const sdPatches = h => h.calls.patch.filter(p => p.table === 'stock_differences');
const pushes = h => h.calls.post.filter(p => /\/functions\/v1\/portal-push/.test(p.url));
const toasts = h => h.calls.toast.map(t => String(t.msg || t));
const settle = async () => { await ticks(); await ticks(); await ticks(); };
const btnTexts = el => Array.prototype.map.call(el.querySelectorAll('button'), b => b.textContent.trim());

/* Отваря модала от истинския бутон и попълва полетата. */
async function openAndFill(h, date, doc, note) {
  realClick(h.w, btn(lastCell(rowOf(h, 'ЩУЦЕР')), LATE));
  const m = modal(h);
  if (!m) return null;
  if (date !== undefined) h.doc.getElementById('sdlate-date').value = date;
  if (doc !== undefined) h.doc.getElementById('sdlate-doc').value = doc;
  if (note !== undefined) h.doc.getElementById('sdlate-note').value = note;
  return m;
}

(async function () {

  section('1. Кога магазинът вижда бутона');
  {
    const cases = [
      ['warehouse_response=null', line({}), true],
      ['warehouse_response=return', line({ warehouse_response: 'return' }), true],
      ['warehouse_response=will_send', line({ warehouse_response: 'will_send' }), true],
      ['warehouse_response=sent', line({ warehouse_response: 'sent' }), true],
      ['излишък (excess)', line({ difference_category: 'excess', quantity: 10, quantity_received: 20 }), false],
      ['повреден (damaged)', line({ difference_category: 'damaged' }), false]
    ];
    cases.forEach(function (c) {
      const h = env(STORE, [c[1], OTHER]);
      if (!guard(c[0] + ': render не хвърля', () => h.w.renderStockDiff())) return;
      const cell = lastCell(rowOf(h, 'ЩУЦЕР'));
      ok(c[0] + ': бутон ' + (c[2] ? 'ИМА' : 'НЯМА'), !!btn(cell, LATE) === c[2], btnTexts(cell).join(' | '));
    });
    {
      /* При sent е ЗАЕДНО с ПРИЕТО, и е след него (отделен ред под бутоните). */
      const h = env(STORE, [line({ warehouse_response: 'sent' }), OTHER]);
      h.w.renderStockDiff();
      const t = btnTexts(lastCell(rowOf(h, 'ЩУЦЕР')));
      ok('sent: "✅ ПРИЕТО" и "' + LATE + '" заедно, ПРИЕТО първо',
        t.indexOf('✅ ПРИЕТО') >= 0 && t.indexOf(LATE) > t.indexOf('✅ ПРИЕТО'), t.join(' | '));
      const b = btn(lastCell(rowOf(h, 'ЩУЦЕР')), LATE);
      ok('outline стил (бял фон, цветна рамка), не плътен', /background:#fff/.test(b.getAttribute('style')) && /border:1px solid/.test(b.getAttribute('style')), b.getAttribute('style'));
    }
    {
      const sw = { id: 'sw-1', from_line_id: 'l-x', to_line_id: 'l-1', from_store: 'Кърджали', to_store: 'Петрич', warehouse: WH, qty: 20, status: 'linked' };
      const h = env(STORE, [line({ swap_id: 'sw-1' }), OTHER], { swaps: [sw] });
      h.w.renderStockDiff();
      ok('отворена размяна по реда → НЯМА', !btn(lastCell(rowOf(h, 'ЩУЦЕР')), LATE));
      const closed = Object.assign({}, sw, { status: 'closed' });
      const h2 = env(STORE, [line({ swap_id: 'sw-1' }), OTHER], { swaps: [closed] });
      h2.w.renderStockDiff();
      ok('затворена размяна не пречи → ИМА', !!btn(lastCell(rowOf(h2, 'ЩУЦЕР')), LATE));
    }
    {
      const h = env(STORE, [line({ status: 'received', completed_by: 'X', completed_at: '2026-09-12T10:00:00.000Z' }), OTHER]);
      h.w.sdShowDone = { 'rep-p': true };
      h.w.renderStockDiff();
      const tr = rowOf(h, 'ЩУЦЕР');
      ok('received → НЯМА', !!tr && !btn(lastCell(tr), LATE), tr && lastCell(tr).textContent);
    }
    [['склад', WAREHOUSE], ['Цвети/admin', CVETI]].forEach(function (u) {
      const h = env(u[1], [line({}), OTHER]);
      h.w.renderStockDiff();
      ok(u[0] + ' → нито един "' + LATE + '"', allBtns(h.doc, LATE).length === 0);
    });
  }

  section('2. Модал — валидация на датата');
  {
    const h = env(STORE, [line({}), OTHER]);
    h.w.renderStockDiff();
    const m = await openAndFill(h);
    if (ok('модалът е отворен', !!m)) {
      ok('датата по подразбиране е днес', h.doc.getElementById('sdlate-date').value === h.w.today(), h.doc.getElementById('sdlate-date').value);
      ok('max на полето е днес', h.doc.getElementById('sdlate-date').getAttribute('max') === h.w.today());
      h.doc.getElementById('sdlate-date').value = dayOffset(1);
      realClick(h.w, btnExact(m, '💾 Запази'));
      await settle();
      ok('утре → toast', toasts(h).some(t => /не може да е в бъдещето/.test(t)), JSON.stringify(toasts(h)));
      h.doc.getElementById('sdlate-date').value = '';
      realClick(h.w, btnExact(m, '💾 Запази'));
      await settle();
      ok('празна дата → toast', toasts(h).some(t => /Изберете дата/.test(t)), JSON.stringify(toasts(h)));
      ok('невалидно → 0 PATCH, 0 push', h.calls.patch.length === 0 && pushes(h).length === 0);
      ok('модалът остава отворен', !!modal(h));
    }
  }

  section('2б. Долна граница — датата на документа (rep.doc_date)');
  {
    /* doc_date на бланката е 2026-09-10; 09.09 е ден преди документа. */
    const h = env(STORE, [line({}), OTHER]);
    h.w.renderStockDiff();
    const m = await openAndFill(h, '2026-09-09');
    const minAttr = h.doc.getElementById('sdlate-date').getAttribute('min');
    realClick(h.w, btnExact(m, '💾 Запази'));
    await settle();
    ok('преди doc_date → toast "Датата не може да е преди документа (10.09.2026)", 0 fetch, min=2026-09-10',
      toasts(h).indexOf('Датата не може да е преди документа (10.09.2026)') >= 0 &&
      h.calls.patch.length === 0 && pushes(h).length === 0 && minAttr === '2026-09-10',
      JSON.stringify({ toasts: toasts(h), patch: h.calls.patch.length, min: minAttr }));
  }
  {
    /* Бланка без doc_date → никаква долна граница: и много стара дата минава. */
    const h = env(STORE, [line({}), OTHER], { report: Object.assign({}, REP, { doc_date: null }) });
    h.w.renderStockDiff();
    const m = await openAndFill(h, '2020-01-15');
    const hasMin = h.doc.getElementById('sdlate-date').hasAttribute('min');
    realClick(h.w, btnExact(m, '💾 Запази'));
    await settle();
    const p = sdPatches(h);
    ok('бланка без doc_date → без min, 15.01.2020 се записва',
      !hasMin && p.length === 1 && p[0].body.completed_at === new h.w.Date('2020-01-15T12:00:00').toISOString() &&
      !toasts(h).some(t => /преди документа/.test(t)),
      JSON.stringify({ hasMin: hasMin, patch: p.length, toasts: toasts(h) }));
  }

  section('3. Запис — всички полета, обяд по избраната дата');
  {
    const d = dayOffset(-2);
    const h = env(STORE, [line({ warehouse_response: 'return' }), OTHER]);
    h.w.renderStockDiff();
    const m = await openAndFill(h, d, '4600187001', 'дойде с доставката на Кърджали');
    realClick(h.w, btnExact(m, '💾 Запази'));
    await settle();
    const p = sdPatches(h);
    if (ok('един PATCH към stock_differences', p.length === 1, JSON.stringify(h.calls.patch.map(x => x.url)))) {
      const b = p[0].body;
      ok('URL сочи реда', /id=eq\.l-1$/.test(p[0].url), p[0].url);
      ok('status=received', b.status === 'received');
      ok('store_response=accepted', b.store_response === 'accepted');
      ok('store_response_by = completed_by = sdActor()', b.store_response_by === 'Управител Петрич' && b.completed_by === 'Управител Петрич');
      ok('store_response_at е ISO на момента', /^\d{4}-\d{2}-\d{2}T/.test(b.store_response_at || ''));
      ok('completed_at = ОБЯД на избраната дата',
        b.completed_at === new h.w.Date(d + 'T12:00:00').toISOString(), b.completed_at + ' срещу ' + new h.w.Date(d + 'T12:00:00').toISOString());
      const shown = h.w.fmtDate(d);
      ok('коментарът: "Получено междувременно на <дата> · док. N · бележка"',
        b.store_response_comment === 'Получено междувременно на ' + shown + ' · док. 4600187001 · дойде с доставката на Кърджали',
        JSON.stringify(b.store_response_comment));
    }
    ok('бланката НЕ се затваря (има друг отворен ред)', !h.calls.patch.some(x => x.table === 'differences_reports'));
    ok('toast "✅ Записано"', toasts(h).indexOf('✅ Записано') >= 0, JSON.stringify(toasts(h)));
    ok('модалът е затворен', !modal(h));
  }
  {
    /* Без док. и бележка - коментарът е само датата. */
    const d = h0 => h0.w.today();
    const h = env(STORE, [line({}), OTHER]);
    h.w.renderStockDiff();
    const m = await openAndFill(h);
    realClick(h.w, btnExact(m, '💾 Запази'));
    await settle();
    const b = (sdPatches(h)[0] || {}).body || {};
    ok('без док./бележка → само "Получено междувременно на <днес>"',
      b.store_response_comment === 'Получено междувременно на ' + h.w.fmtDate(d(h)), JSON.stringify(b.store_response_comment));
  }

  section('4. Последен отворен ред → бланката се затваря');
  {
    const h = env(STORE, [line({}), line(Object.assign({}, OTHER, { status: 'received' }))]);
    h.w.renderStockDiff();
    const m = await openAndFill(h, dayOffset(-1));
    realClick(h.w, btnExact(m, '💾 Запази'));
    await settle();
    const rp = h.calls.patch.filter(x => x.table === 'differences_reports');
    ok('PATCH reviewed=true на бланката', rp.length === 1 && rp[0].body.reviewed === true && /id=eq\.rep-p/.test(rp[0].url), JSON.stringify(rp));
    ok('toast "✅ Бланката е приключена"', toasts(h).indexOf('✅ Бланката е приключена') >= 0, JSON.stringify(toasts(h)));
  }

  section('5. Известие до склада — само след успешен запис');
  {
    const d = dayOffset(-1);
    const h = env(STORE, [line({}), OTHER]);
    /* Редът на заявките - за "push САМО СЛЕД успешния PATCH". */
    const seq = [];
    const origFetch = h.w.fetch;
    h.w.fetch = function (url, init) { seq.push(((init && init.method) || 'GET').toUpperCase() + ' ' + url); return origFetch(url, init); };
    h.w.renderStockDiff();
    const m = await openAndFill(h, d);
    realClick(h.w, btnExact(m, '💾 Запази'));
    await settle();
    const ps = pushes(h);
    if (ok('точно един push', ps.length === 1, JSON.stringify(ps.map(p => p.body)))) {
      const b = ps[0].body;
      ok('до склада (rep.counterpart) и само до него',
        b.filters.length === 1 && b.filters[0].key === 'store_name' && b.filters[0].value === WH, JSON.stringify(b.filters));
      ok('заглавие "📦 Разлика закрита от Петрич"', b.title === '📦 Разлика закрита от Петрич', b.title);
      ok('текст "ЩУЦЕР МЕТАЛЕН — получено на <дата>"', b.message === 'ЩУЦЕР МЕТАЛЕН — получено на ' + h.w.fmtDate(d), b.message);
    }
    const iPatch = seq.findIndex(s => /^PATCH .*stock_differences/.test(s));
    const iPush = seq.findIndex(s => /^POST .*portal-push/.test(s));
    ok('PATCH е ПРЕДИ push-а', iPatch >= 0 && iPush > iPatch, JSON.stringify(seq.filter(s => !/^GET/.test(s))));
  }
  {
    const h = env(STORE, [line({}), OTHER], { fail: { PATCH: /stock_differences/ } });
    h.w.renderStockDiff();
    const m = await openAndFill(h, dayOffset(-1));
    realClick(h.w, btnExact(m, '💾 Запази'));
    await settle();
    ok('провален PATCH → червен toast', toasts(h).some(t => /Грешка при запис/.test(t)), JSON.stringify(toasts(h)));
    ok('провален PATCH → 0 push', pushes(h).length === 0, JSON.stringify(pushes(h).map(p => p.body)));
    ok('провален PATCH → локалният ред остава new', h.w.sdData[0].status === 'new', h.w.sdData[0].status);
  }

  section('6. След записа — "Получено от магазина", складът без бутони');
  {
    const doneAt = dayOffset(-2) + 'T12:00:00';
    const saved = line({
      warehouse_response: 'return', warehouse_comment: 'обратно с камиона',
      status: 'received', store_response: 'accepted', store_response_by: 'Управител Петрич',
      store_response_at: new Date().toISOString(),
      store_response_comment: 'Получено междувременно на 20.09.2026 · док. 4600187001',
      completed_by: 'Управител Петрич', completed_at: new Date(doneAt).toISOString()
    });
    const expDate = d => d.w.sdFmtDateTime(new d.w.Date(doneAt).toISOString());
    [['склад', WAREHOUSE], ['магазин', STORE], ['Цвети', CVETI]].forEach(function (u) {
      const h = env(u[1], [saved, OTHER]);
      h.w.sdShowDone = { 'rep-p': true };
      h.w.renderStockDiff();
      const tr = rowOf(h, 'ЩУЦЕР');
      const cell = tr && lastCell(tr);
      if (!ok(u[0] + ': редът се вижда (разгънати приключени)', !!cell)) return;
      ok(u[0] + ': "📦 Получено от магазина · <дата> · Управител Петрич"',
        cell.textContent.indexOf('📦 Получено от магазина · ' + expDate(h) + ' · Управител Петрич') >= 0, cell.textContent);
      ok(u[0] + ': коментарът с док. номера', cell.textContent.indexOf('док. 4600187001') >= 0);
      ok(u[0] + ': НЕ пише "ПРИЕТО"/"Прието"', !/ПРИЕТО|✅ Прието/.test(cell.textContent), cell.textContent);
      ok(u[0] + ': без дублиран "📬 Получено"', cell.textContent.indexOf('📬 Получено') < 0, cell.textContent);
      ok(u[0] + ': нула бутони в клетката', btnTexts(cell).length === 0, btnTexts(cell).join(' | '));
    });
    {
      /* Свиване: received ред се свива като другите. */
      const h = env(STORE, [saved, OTHER]);
      h.w.renderStockDiff();
      ok('свит по подразбиране (1 приключен ред)', !rowOf(h, 'ЩУЦЕР') && card(h).textContent.indexOf('1 приключени реда') >= 0);
    }
    {
      /* Главната таблица - същият текст през sdStoreResponseLabel. */
      const h = env(CVETI, [saved], { filter: 'all' });
      h.w.renderStockDiff();
      const table = Array.prototype.find.call(h.doc.querySelectorAll('#mod-stock-diff table'),
        t => t.querySelector('thead') && t.querySelector('thead').textContent.indexOf('Кредитно') >= 0);
      ok('главната таблица: "📦 Получено от магазина"', !!table && table.textContent.indexOf('📦 Получено от магазина') >= 0,
        table && table.textContent.slice(0, 300));
    }
    {
      /* Складът и на ДРУГИ приключени редове вече няма трите бутона. */
      const h = env(WAREHOUSE, [line({ warehouse_response: 'sent', status: 'received', completed_by: 'X', completed_at: '2026-09-12T10:00:00.000Z' }), OTHER]);
      h.w.sdShowDone = { 'rep-p': true };
      h.w.renderStockDiff();
      const cell = lastCell(rowOf(h, 'ЩУЦЕР'));
      ok('склад, обикновен received ред: без "Изпратено/Ще изпрати/Обратно"',
        !btn(cell, 'Изпратено') && !btn(cell, 'Ще изпрати') && !btn(cell, 'Обратно'), btnTexts(cell).join(' | '));
      ok('но отговорът му се вижда като текст', cell.textContent.indexOf('📤 Изпратено') >= 0, cell.textContent);
      const open = lastCell(rowOf(h, 'ДРУГ АРТИКУЛ'));
      ok('на отворения ред бутоните на склада са на място', !!btn(open, '📤 Изпратено'), btnTexts(open).join(' | '));
    }
  }

  section('7. Картата "Действия на магазините"');
  {
    const saved = line({
      status: 'received', store_response: 'accepted', store_response_by: 'Управител Петрич',
      store_response_at: new Date().toISOString(),
      store_response_comment: 'Получено междувременно на 20.09.2026',
      completed_by: 'Управител Петрич', completed_at: new Date().toISOString()
    });
    const h = env(WAREHOUSE, [saved, OTHER]);
    h.w.renderStockDiff();
    const c = h.doc.getElementById('sd-actions-card');
    if (ok('картата се рендира', !!c)) {
      ok('събитие "📦 получено междувременно · ЩУЦЕР МЕТАЛЕН"', c.textContent.indexOf('📦 получено междувременно · ЩУЦЕР МЕТАЛЕН') >= 0, c.textContent);
      ok('не е записано като "✅ ПРИЕТО"', c.textContent.indexOf('✅ ПРИЕТО') < 0, c.textContent);
    }
  }

  report();
})();
