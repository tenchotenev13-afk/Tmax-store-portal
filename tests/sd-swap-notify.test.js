/* Разлики, стъпка 4: известия по размяната + баджът на магазина.

   Размяната вече има пълен живот (свързване → изпращане → приемане →
   приключване), но отсрещната страна научаваше за всяка стъпка само ако
   случайно отвори портала. Сега всяко действие праща push — през
   sdNotifyInterstore, тоест fire-and-forget: след успешния запис, без да
   блокира нищо, и провалът му не сменя toast-а.

   ПРАВИЛОТО, което тестът заковава, е кой НЕ получава: никой не си получава
   собственото действие обратно. Действие на магазин → отсрещният магазин и
   складът. Действие на склада → двата магазина. Затова всяка секция мери
   ТОЧНИЯ списък получатели, а не „поне един push".

   push.js се зарежда истински; мокнат е само pushToStores (изходът към
   portal-push / OneSignal). Така собственият гард на pushInterstoreDiff за
   празен получател е от ЖИВИЯ код, не от стъба.

   Пускане:  node tests/sd-swap-notify.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, btnExact, ticks } = H;

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
function swap(o) {
  return Object.assign({
    id: 'sw-1', from_line_id: 'l-ex', to_line_id: 'l-sh',
    from_store: 'Гоце Делчев', to_store: 'Петрич', warehouse: WH,
    material_code: '123', material_name: 'ЩУЦЕР МЕТАЛЕН', qty: 20,
    status: 'linked', kind: 'doc', transport_mode: null, sap_doc_num: null,
    note: null, created_by: 'Склад Търговище', created_at: '2026-09-12T09:00:00.000Z',
    sent_by: null, sent_at: null, received_by: null, received_at: null,
    closed_by: null, closed_at: null
  }, o);
}

const REP_EX = rep({ id: 'rep-ex', store_name: 'Гоце Делчев', created_at: '2026-09-11T09:00:00.000Z' });
const REP_SH = rep({ id: 'rep-sh', store_name: 'Петрич' });
const L_EX = line({ id: 'l-ex', report_id: 'rep-ex', store_name: 'Гоце Делчев', material_code: '123',
  difference_category: 'excess', quantity: 10, quantity_received: 50,
  created_at: '2026-09-11T09:00:00.000Z' });
const L_SH = line({ id: 'l-sh', report_id: 'rep-sh', store_name: 'Петрич' });
const L_EX2 = line({ id: 'l-ex2', report_id: 'rep-ex', store_name: 'Гоце Делчев', material_code: '999', material_name: 'ДРУГ' });
const L_SH2 = line({ id: 'l-sh2', report_id: 'rep-sh', store_name: 'Петрич', material_code: '888', material_name: 'ТРЕТИ' });

const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };
const PETRICH  = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const GOTSE    = { email: 'gd@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: 'Гоце Делчев', assigned_stores: [] };

function env(user, opts) {
  opts = opts || {};
  const lines = opts.lines || [L_EX, line(Object.assign({}, L_SH, { swap_id: opts.noMark ? null : 'sw-1' })), L_EX2, L_SH2];
  const reports = opts.reports || [REP_EX, REP_SH];
  const swaps = opts.swaps === undefined ? [swap()] : opts.swaps;
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'push.js'],
    user: user, confirm: opts.confirm === undefined ? true : opts.confirm, fail: opts.fail,
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
  h.w.sdFilter = 'pending'; h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'interstore';
  h.w.sdShowDone = {}; reports.forEach(r => { h.w.sdShowDone[r.id] = true; });
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  /* POST към stock_diff_swaps връща реда с id — както PostgREST с
     Prefer: return=representation. Harness-ът иначе връща {}, а тогава
     submitSwapLink излиза по клона „отговор без id" и до известие изобщо не
     се стига. Същият стъб като в sd-swap-link.test.js. */
  const origFetch = h.w.fetch;
  h.w.fetch = function (url, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    const pr = origFetch(url, init);
    if (method === 'POST' && /\/stock_diff_swaps/.test(url)) {
      return pr.then(r => {
        if (!r.ok) return r;
        const row = Object.assign({}, JSON.parse(init.body), { id: 'sw-new' });
        return { ok: true, status: 201, headers: r.headers,
                 json: () => Promise.resolve([row]), text: () => Promise.resolve(JSON.stringify([row])) };
      });
    }
    return pr;
  };
  /* Мокваме ИЗХОДА (pushToStores), не pushInterstoreDiff — така гардът за
     празен получател остава от живия код. */
  h.pushes = [];
  h.w.pushToStores = function (stores, title, msg) {
    h.pushes.push({ stores: stores, title: title, msg: msg });
    return opts.pushFails ? Promise.reject(new Error('push down')) : Promise.resolve({ ok: true });
  };
  h.w.pushToAll = function (title, msg) {
    h.pushes.push({ stores: null, title: title, msg: msg });
    return Promise.resolve({ ok: true });
  };
  return h;
}

const rowOf = (h, lineId) => {
  const cardId = (lineId === 'l-ex' || lineId === 'l-ex2') ? 'diff-rep-rep-ex' : 'diff-rep-rep-sh';
  const card = h.doc.getElementById(cardId);
  if (!card) return null;
  const name = { 'l-ex': 'ЩУЦЕР', 'l-sh': 'ЩУЦЕР', 'l-ex2': 'ДРУГ', 'l-sh2': 'ТРЕТИ' }[lineId];
  return Array.prototype.find.call(card.querySelectorAll('tr'), tr => tr.textContent.indexOf(name) >= 0) || null;
};
const panelOf = (h, lineId) => { const tr = rowOf(h, lineId); return tr && tr.querySelector('[data-sdswap]'); };
const toasts = h => h.calls.toast.map(t => String(t.msg || t));
const settle = async () => { await ticks(); await ticks(); await ticks(); };
/* Получателите на всички push-ове, по един магазин на ред, сортирани — така
   „точно тези и само тези" е едно сравнение. */
const targets = h => h.pushes.reduce((a, p) => a.concat(p.stores || ['(всички)']), []).sort();
const clickOr = (h, el, label) => {
  if (!ok(label, !!el)) return false;
  realClick(h.w, el);
  return true;
};

(async function run() {

  /* ── 1. Свързване ───────────────────────────────────────────────────────── */
  section('1. Складът свързва → push до ДВАТА магазина и само до тях');
  {
    const h = env(WAREHOUSE, { swaps: [], lines: [L_EX, L_SH, L_EX2, L_SH2] });
    h.w.renderStockDiff();
    if (clickOr(h, btn(rowOf(h, 'l-sh'), 'Свържи'), 'бутонът „Свържи" е на екрана')) {
      realClick(h.w, btnExact(h.doc.getElementById('sdswap-ov'), '🔗 Свържи'));
      await settle();
      ok('два push-а', h.pushes.length === 2, 'реално: ' + h.pushes.length);
      ok('до Гоце Делчев и Петрич', targets(h).join('|') === 'Гоце Делчев|Петрич', targets(h).join('|'));
      ok('складът НЕ си праща сам', targets(h).indexOf(WH) < 0, targets(h).join('|'));
      const p = h.pushes[0] || {};
      ok('заглавие „🔗 Разлика: размяна Гоце Делчев → Петрич"',
        p.title === '🔗 Разлика: размяна Гоце Делчев → Петрич', JSON.stringify(p.title));
      ok('текстът носи количество, артикул и вида',
        /20 бр\./.test(p.msg) && /ЩУЦЕР МЕТАЛЕН/.test(p.msg) && /документална/.test(p.msg),
        JSON.stringify(p.msg));
    }
    h.close();
  }

  /* ── 2. Изпращане ───────────────────────────────────────────────────────── */
  section('2. Изпращачът пуска в SAP / изпраща → push до получателя и склада');
  {
    const h = env(GOTSE);
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-ex'), '📄 ПУСНАТО В SAP'), 'бутонът за пускане в SAP')) {
      h.doc.getElementById('sdsent-sap').value = '4900777';
      realClick(h.w, btnExact(h.doc.getElementById('sdsent-ov'), '📄 Пуснато в SAP'));
      await settle();
      ok('два push-а', h.pushes.length === 2, 'реално: ' + h.pushes.length);
      ok('до Петрич и склада', targets(h).join('|') === [WH, 'Петрич'].sort().join('|'), targets(h).join('|'));
      ok('изпращачът НЕ получава своето действие', targets(h).indexOf('Гоце Делчев') < 0, targets(h).join('|'));
      const p = h.pushes[0] || {};
      ok('заглавие „📄 Размяна: пуснато в SAP от Гоце Делчев"',
        p.title === '📄 Размяна: пуснато в SAP от Гоце Делчев', JSON.stringify(p.title));
      ok('текстът носи артикула и документа',
        p.msg === 'ЩУЦЕР МЕТАЛЕН · док. 4900777', JSON.stringify(p.msg));
    }
    h.close();
  }
  {
    const h = env(GOTSE, { swaps: [swap({ kind: 'physical' })] });
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-ex'), '🚚 ИЗПРАТЕНО КЪМ ПЕТРИЧ'), 'бутонът за изпращане')) {
      h.doc.querySelectorAll('input[name="sdsent-mode"]')[1].checked = true; /* камион */
      h.doc.getElementById('sdsent-sap').value = '4900111';
      realClick(h.w, btnExact(h.doc.getElementById('sdsent-ov'), '🚚 Изпратено'));
      await settle();
      const p = h.pushes[0] || {};
      ok('physical: заглавие „🚚 Размяна: изпратено от Гоце Делчев"',
        p.title === '🚚 Размяна: изпратено от Гоце Делчев', JSON.stringify(p.title));
      ok('physical: текстът носи превоза', p.msg === 'ЩУЦЕР МЕТАЛЕН · камион', JSON.stringify(p.msg));
      ok('пак два push-а', h.pushes.length === 2, 'реално: ' + h.pushes.length);
    }
    h.close();
  }

  /* ── 3. Приемане ────────────────────────────────────────────────────────── */
  section('3. Получателят приема → push до изпращача и склада');
  {
    const h = env(PETRICH, { swaps: [swap({ status: 'sent', sap_doc_num: '4900777', sent_at: '2026-09-13T08:00:00.000Z' })] });
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-sh'), '📄 ПРИЕТО В SAP'), 'бутонът за приемане')) {
      await settle();
      ok('два push-а', h.pushes.length === 2, 'реално: ' + h.pushes.length);
      ok('до Гоце Делчев и склада', targets(h).join('|') === ['Гоце Делчев', WH].sort().join('|'), targets(h).join('|'));
      ok('получателят НЕ получава своето действие', targets(h).indexOf('Петрич') < 0, targets(h).join('|'));
      ok('заглавие „📬 Размяна: прието в Петрич"',
        (h.pushes[0] || {}).title === '📬 Размяна: прието в Петрич', JSON.stringify((h.pushes[0] || {}).title));
      ok('текстът е артикулът', (h.pushes[0] || {}).msg === 'ЩУЦЕР МЕТАЛЕН', JSON.stringify((h.pushes[0] || {}).msg));
    }
    h.close();
  }

  /* ── 4. Приключване ─────────────────────────────────────────────────────── */
  section('4. Складът приключва → push до двата магазина, след ТРЕТИЯ PATCH');
  {
    const rec = swap({ status: 'received', sap_doc_num: '4900777',
      sent_at: '2026-09-13T08:00:00.000Z', received_at: '2026-09-14T10:00:00.000Z' });
    const h = env(WAREHOUSE, { swaps: [rec], lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2] });
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-sh'), 'Приключи размяната'), 'бутонът „Приключи"')) {
      await settle();
      ok('два push-а', h.pushes.length === 2, 'реално: ' + h.pushes.length);
      ok('до двата магазина', targets(h).join('|') === 'Гоце Делчев|Петрич', targets(h).join('|'));
      ok('заглавие „🏁 Размяна приключена: Гоце Делчев → Петрич"',
        (h.pushes[0] || {}).title === '🏁 Размяна приключена: Гоце Делчев → Петрич',
        JSON.stringify((h.pushes[0] || {}).title));
      /* Трите PATCH-а: самата размяна + двата реда. Push-ът е СЛЕД тях. */
      const swapPatches = h.calls.patch.filter(x => /stock_diff_swaps/.test(x.url));
      const linePatches = h.calls.patch.filter(x => /stock_differences\?/.test(x.url));
      ok('минали са трите PATCH-а', swapPatches.length === 1 && linePatches.length === 2,
        'swap=' + swapPatches.length + ' lines=' + linePatches.length);
    }
    h.close();
  }
  {
    /* Падне ли ВТОРИЯТ PATCH (редът на изпращача), веригата спира със STOP и
       „приключена" не бива да се известява за нещо, останало наполовина. */
    const rec = swap({ status: 'received', received_at: '2026-09-14T10:00:00.000Z' });
    const h = env(WAREHOUSE, {
      swaps: [rec],
      lines: [L_EX, line(Object.assign({}, L_SH, { swap_id: 'sw-1' })), L_EX2, L_SH2],
      fail: { PATCH: url => /stock_differences\?id=eq\.l-ex/.test(url) }
    });
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-sh'), 'Приключи размяната'), 'бутонът „Приключи" (провал)')) {
      await settle();
      ok('вторият PATCH е паднал → НУЛА push', h.pushes.length === 0,
        JSON.stringify(h.pushes.map(x => x.title)));
      ok('и казва кой ред не е минал',
        toasts(h).some(t => /редът на Гоце Делчев НЕ е/.test(t)), JSON.stringify(toasts(h)));
    }
    h.close();
  }

  /* ── 5. Развързване ─────────────────────────────────────────────────────── */
  section('5. Складът развързва → push до двата магазина');
  {
    const h = env(WAREHOUSE);
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-sh'), 'Развържи'), 'бутонът „Развържи"')) {
      await settle();
      ok('два push-а', h.pushes.length === 2, 'реално: ' + h.pushes.length);
      ok('до двата магазина', targets(h).join('|') === 'Гоце Делчев|Петрич', targets(h).join('|'));
      ok('заглавие „✖ Размяна отменена: Гоце Делчев → Петрич"',
        (h.pushes[0] || {}).title === '✖ Размяна отменена: Гоце Делчев → Петрич',
        JSON.stringify((h.pushes[0] || {}).title));
    }
    h.close();
  }

  /* ── 6. Провален push ───────────────────────────────────────────────────── */
  section('6. Провален push не сменя toast-а и не спира записа');
  {
    const h = env(PETRICH, {
      pushFails: true,
      swaps: [swap({ status: 'sent', sap_doc_num: '4900777', sent_at: '2026-09-13T08:00:00.000Z' })]
    });
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-sh'), '📄 ПРИЕТО В SAP'), 'бутонът за приемане (провален push)')) {
      await settle();
      ok('записът е минал', h.calls.patch.some(x => /stock_diff_swaps/.test(x.url) && x.body.status === 'received'),
        JSON.stringify(h.calls.patch.map(x => x.url)));
      ok('toast-ът е нормалният за успех', toasts(h).indexOf('📬 Прието в Петрич') >= 0, JSON.stringify(toasts(h)));
      ok('няма червен toast за push', !toasts(h).some(t => /push|известие/i.test(t)), JSON.stringify(toasts(h)));
    }
    h.close();
  }

  /* ── 7. Баджът на магазина ──────────────────────────────────────────────── */
  section('7. Бадж на магазина: FROM/linked и TO/sent броят, обратното — не');
  {
    /* Бланка, по която по СТАРОТО правило нищо не се чака: складът е отговорил,
       магазинът е отговорил. Брои се само заради размяната. */
    const answered = [
      line({ id: 'l-ex', report_id: 'rep-ex', store_name: 'Гоце Делчев',
             warehouse_response: 'sent', store_response: 'accepted' })
    ];
    const REPS = [rep({ id: 'rep-ex', store_name: 'Гоце Делчев' })];
    const h = env(GOTSE, { lines: answered, reports: REPS, swaps: [] });
    const count = sw => h.w.sdUnreviewedCountFor(REPS, answered, sw);
    ok('без размени → 0', count([]) === 0, String(count([])));
    ok('FROM при linked → БРОИ се',
      count([{ status: 'linked', from_line_id: 'l-ex', to_line_id: 'l-sh', from_store: 'Гоце Делчев', to_store: 'Петрич' }]) === 1);
    ok('FROM при sent → НЕ се брои (чака отсрещния)',
      count([{ status: 'sent', from_line_id: 'l-ex', to_line_id: 'l-sh', from_store: 'Гоце Делчев', to_store: 'Петрич' }]) === 0);
    ok('TO при sent → БРОИ се',
      count([{ status: 'sent', from_line_id: 'l-sh', to_line_id: 'l-ex', from_store: 'Петрич', to_store: 'Гоце Делчев' }]) === 1);
    ok('TO при linked → НЕ се брои (чака изпращача)',
      count([{ status: 'linked', from_line_id: 'l-sh', to_line_id: 'l-ex', from_store: 'Петрич', to_store: 'Гоце Делчев' }]) === 0);
    ok('чужда размяна → НЕ се брои',
      count([{ status: 'linked', from_line_id: 'l-ex', to_line_id: 'l-sh', from_store: 'Троян', to_store: 'Петрич' }]) === 0);
    const before = JSON.stringify(h.w.sdSwaps);
    count([{ status: 'linked', from_line_id: 'l-ex', to_line_id: 'l-sh', from_store: 'Гоце Делчев', to_store: 'Петрич' }]);
    ok('функцията НЕ променя глобалния sdSwaps', JSON.stringify(h.w.sdSwaps) === before);
    h.close();
  }

  report();
})();
