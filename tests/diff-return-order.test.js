/* Разлики: „Поръчка за връщане" (42…) — отделна колона return_order_number.
   (Точка 1 от Цвети, част 1.)

   Досега имаше само order_number („Поръчка"), а Цвети пишеше там поръчката
   ЗА ВРЪЩАНЕ (42…). Поръчката ОТ ДОСТАВЧИКА (41…) не се пазеше никъде.
     · модалът „Редактирай": поле „Поръчка за връщане" над бутоните —
       редактируемо само за canReviewDiff(); за магазина само за четене, ако
       е попълнено, и скрито, ако е празно;
     · submitSD: return_order_number се праща само от ЦО; order_number не се
       пипа от новото поле; магазинът не праща ключа изобщо;
     · таблицата: колона „Поръчка за връщане" до „Поръчка";
     · търсенето намира реда и по 42…, и по 41….

   Пускане:  node tests/diff-return-order.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'radnevo@temax.bg', display_name: 'Склад Раднево',
  role: 'sklad', store_name: 'Раднево', assigned_stores: [] };

function line(o) {
  return Object.assign({ id: 'l-1', report_id: null, store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'ПЛАНКА ЪГЛОВА', quantity: 2, quantity_supplier_doc: null,
    quantity_received: null, order_number: '4100196440', return_order_number: null,
    type: 'return', status: 'pending', comment: null, resolution_comment: null, attachments: [],
    credit_note_issued: false, difference_category: null, unit: 'бр.', confirmed_date: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    warehouse_response: null, store_corrected_at: null, created_at: '2026-09-20T08:00:00Z' }, o);
}

function env(user, lines, srRows) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: { stock_differences: lines, differences_reports: [],
            /* „За връщане": GET по diff_line_id връща само реда на тази разлика — както PostgREST. */
            stock_returns: url => { const m = /diff_line_id=eq.([^&]+)/.exec(url); return (srRows || []).filter(r => !m || r.diff_line_id === decodeURIComponent(m[1])); },
            transport_orders: [],
            users: [{ store_name: 'Раднево' }, { store_name: 'Враца' }], contacts: [], stores: [], stock_diff_swaps: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = [];
  h.w.transportOrders = [];
  h.w.sdView = 'rows'; /* изгледът „Редове" (таблицата) — подразбирането е „Бланки" */
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'supplier';
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД']);
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 6; i++) await ticks(); };
const editBtn = (h, id) => Array.prototype.find.call(h.doc.querySelectorAll('button[data-id="' + id + '"]'),
  b => (b.getAttribute('onclick') || '').indexOf('openSDModal') >= 0) || null;
const sdPatches = h => h.calls.patch.filter(p => /stock_differences/.test(p.url));
function mainTable(h) {
  return Array.prototype.find.call(h.doc.querySelectorAll('#mod-stock-diff table'),
    t => Array.prototype.some.call(t.querySelectorAll('thead th'), th => th.textContent.trim() === 'Дата потвърд.'));
}

(async function run() {

  section('а) Цвети записва 42… в новото поле → PATCH с return_order_number, order_number не се мени');
  {
    const h = env(CVETI, [line()]);
    const e = editBtn(h, 'l-1');
    if (ok('бутонът ✏️ е на реда', !!e)) {
      realClick(h.w, e);
      await settle();
      const inp = h.doc.getElementById('sd-return-order');
      if (ok('полето „Поръчка за връщане" е в модала и е редактируемо', !!inp && inp.tagName === 'INPUT')) {
        const ov = h.doc.getElementById('sd-ov');
        const save = btn(ov, 'Запази');
        const labels = Array.prototype.map.call(ov.querySelectorAll('label.fl'), l => l.textContent.trim());
        ok('полето е последното преди бутоните', labels[labels.length - 1] === 'Поръчка за връщане', labels.join(' | '));
        ok('„Поръчка" (41…) си е на мястото', h.doc.getElementById('sd-order').value === '4100196440');
        inp.value = '  4200017097 ';
        realClick(h.w, save);
        await settle();
        const p = sdPatches(h).find(x => /id=eq\.l-1/.test(x.url));
        if (ok('PATCH към реда', !!p, JSON.stringify(h.calls.patch.map(x => x.url)) + ' | ' + h.calls.toast.join(' | '))) {
          ok('return_order_number = „4200017097" (без интервали)', p.body.return_order_number === '4200017097',
            JSON.stringify(p.body.return_order_number));
          ok('order_number остава „4100196440"', p.body.order_number === '4100196440', JSON.stringify(p.body.order_number));
        }
      }
    }
    h.close();
  }

  section('а2) Цвети изчиства полето → null, не празен низ');
  {
    const h = env(CVETI, [line({ return_order_number: '4200017097' })]);
    realClick(h.w, editBtn(h, 'l-1'));
    await settle();
    const inp = h.doc.getElementById('sd-return-order');
    ok('полето е предпопълнено', inp && inp.value === '4200017097', inp && inp.value);
    inp.value = '';
    realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
    await settle();
    const p = sdPatches(h).find(x => /id=eq\.l-1/.test(x.url));
    ok('return_order_number = null', !!p && p.body.return_order_number === null, JSON.stringify(p && p.body));
    h.close();
  }

  section('б) Магазинер не може да редактира полето и не го праща');
  {
    const h = env(STORE, [line({ return_order_number: '4200017097' })]);
    const e = editBtn(h, 'l-1');
    if (ok('магазинерът има ✏️ на своя ред', !!e)) {
      realClick(h.w, e);
      await settle();
      ok('няма поле за въвеждане', !h.doc.getElementById('sd-return-order'));
      const ro = h.doc.getElementById('sd-return-order-ro');
      ok('номерът се вижда само за четене', !!ro && ro.textContent.trim() === '4200017097', ro && ro.textContent);
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await settle();
      const p = sdPatches(h).find(x => /id=eq\.l-1/.test(x.url));
      if (ok('запис от магазина минава', !!p, h.calls.toast.join(' | '))) {
        ok('PATCH-ът НЕ носи return_order_number', !('return_order_number' in p.body), JSON.stringify(p.body));
      }
      /* Подправен DOM: магазинът си добавя полето — пак не се праща. */
      h.w.openSDModal('l-1');
      await settle();
      h.doc.getElementById('sd-ov').insertAdjacentHTML('beforeend', '<input id="sd-return-order" value="4209999999">');
      h.calls.patch.length = 0;
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await settle();
      const p2 = sdPatches(h).find(x => /id=eq\.l-1/.test(x.url));
      ok('и с подправено поле не се праща', !!p2 && !('return_order_number' in p2.body), JSON.stringify(p2 && p2.body));
    }
    const h2 = env(STORE, [line({ return_order_number: null })]);
    realClick(h2.w, editBtn(h2, 'l-1'));
    await settle();
    ok('празно → магазинът не вижда полето изобщо',
      !h2.doc.getElementById('sd-return-order') && !h2.doc.getElementById('sd-return-order-ro') &&
      h2.doc.getElementById('sd-ov').textContent.indexOf('Поръчка за връщане') < 0);
    h.close(); h2.close();
  }

  section('в) Колоната „Поръчка за връщане" е до „Поръчка" и показва номера');
  {
    const h = env(CVETI, [line({ return_order_number: '4200017097' })]);
    const t = mainTable(h);
    if (ok('главната таблица е на екрана', !!t)) {
      const heads = Array.prototype.map.call(t.querySelectorAll('thead th'), th => th.textContent.trim());
      const i = heads.indexOf('Поръчка за връщане');
      ok('колоната е точно след „Поръчка"', i > 0 && heads[i - 1] === 'Поръчка', heads.join(' | '));
      const tds = t.querySelector('tbody tr').querySelectorAll('td');
      ok('в нея е 4200017097', tds[i] && tds[i].textContent.trim() === '4200017097', tds[i] && tds[i].textContent);
      ok('в „Поръчка" е 4100196440', tds[i - 1] && tds[i - 1].textContent.trim() === '4100196440');
      ok('<th> = <td> на реда', heads.length === tds.length, heads.length + ' срещу ' + tds.length);
    }
    h.close();
  }

  section('г) Търсенето намира реда и по 42…, и по 41…');
  {
    const lines = [line({ id: 'l-1', return_order_number: '4200017097', material_name: 'ТЪРСЕНИЯТ' }),
                   line({ id: 'l-2', order_number: '4100000001', material_name: 'ДРУГ' })];
    for (const q of ['4200017097', '4100196440']) {
      const h = env(CVETI, lines);
      h.w.sdSearch = q;
      h.w.renderStockDiff();
      const t = mainTable(h);
      const txt = t ? t.querySelector('tbody').textContent : '';
      ok('търсене „' + q + '" → ТЪРСЕНИЯТ', txt.indexOf('ТЪРСЕНИЯТ') >= 0, txt.slice(0, 120));
      ok('търсене „' + q + '" → без ДРУГ', txt.indexOf('ДРУГ') < 0);
      h.close();
    }
  }

  /* ── „За връщане": 41… → order_number, 42… → purchase_order (ПВ-ЕВР) ── */
  const srPatch = h => h.calls.patch.filter(p => /stock_returns/.test(p.url));
  const srPost = h => h.calls.post.filter(p => p.table === 'stock_returns');
  async function editSave(h, id, fields) {
    realClick(h.w, editBtn(h, id));
    await settle();
    Object.keys(fields).forEach(k => { h.doc.getElementById(k).value = fields[k]; });
    realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
    await settle();
  }

  section('д) Нов запис в „За връщане" (autoCreateReturnFromDiff): 41… → Поръчка, 42… → ПВ-ЕВР');
  {
    const h = env(CVETI, [line({ type: 'writein', return_order_number: '4200017097' })], []);
    await editSave(h, 'l-1', { 'sd-type': 'return' });
    const p = srPost(h)[0];
    if (ok('POST в stock_returns', !!p, JSON.stringify(h.calls.post.map(x => x.table)) + ' | ' + h.calls.toast.join(' | '))) {
      ok('order_number = 4100196440 (от доставчика)', p.body.order_number === '4100196440', JSON.stringify(p.body.order_number));
      ok('purchase_order = 4200017097 (за връщане)', p.body.purchase_order === '4200017097', JSON.stringify(p.body.purchase_order));
    }
    h.close();
  }

  section('е) Цвети записва 42… на ред с връщане → syncReturnOrder пише и ПВ-ЕВР');
  {
    const SR = [{ id: 'sr-1', diff_line_id: 'l-1', source: 'diff', order_number: '4100196440', purchase_order: null }];
    const h = env(CVETI, [line()], SR);
    await editSave(h, 'l-1', { 'sd-return-order': '4200017097' });
    const p = srPatch(h).find(x => /diff_line_id=eq\.l-1/.test(x.url));
    if (ok('PATCH към „За връщане"', !!p, JSON.stringify(h.calls.patch.map(x => x.url)))) {
      ok('order_number = 4100196440', p.body.order_number === '4100196440', JSON.stringify(p.body));
      ok('purchase_order = 4200017097', p.body.purchase_order === '4200017097', JSON.stringify(p.body));
    }
    ok('не се създава втори ред (вече има)', srPost(h).length === 0);
    h.close();
  }

  section('ж) Заварен 42… в „За връщане" НЕ се изтрива от запис, който не пипа полето');
  {
    /* Разликата няма return_order_number (празно преди и след), а в „За
       връщане" ПВ-ЕВР вече е 4200017243 (заварен / ръчен). */
    const SR = [{ id: 'sr-1', diff_line_id: 'l-1', source: 'diff', order_number: '4100196440', purchase_order: '4200017243' }];
    const h = env(CVETI, [line({ return_order_number: null })], SR);
    await editSave(h, 'l-1', { 'sd-comment': 'само коментар' });
    const p = srPatch(h).find(x => /diff_line_id=eq\.l-1/.test(x.url));
    if (ok('синхронизацията тече (order_number)', !!p)) {
      ok('PATCH-ът НЕ съдържа purchase_order — 4200017243 остава', !('purchase_order' in p.body), JSON.stringify(p.body));
    }
    /* Магазинът: ключът липсва изцяло → purchase_order не се праща никога. */
    const h2 = env(STORE, [line({ return_order_number: '4200017097' })], SR);
    await editSave(h2, 'l-1', { 'sd-comment': 'от магазина' });
    const p2 = srPatch(h2).find(x => /diff_line_id=eq\.l-1/.test(x.url));
    ok('магазин: PATCH без purchase_order', !!p2 && !('purchase_order' in p2.body), JSON.stringify(p2 && p2.body));
    h.close(); h2.close();
  }

  section('з) Цвети изчиства попълнен 42… → ПВ-ЕВР в „За връщане" се чисти (null)');
  {
    const SR = [{ id: 'sr-1', diff_line_id: 'l-1', source: 'diff', order_number: '4100196440', purchase_order: '4200017097' }];
    const h = env(CVETI, [line({ return_order_number: '4200017097' })], SR);
    await editSave(h, 'l-1', { 'sd-return-order': '' });
    const p = srPatch(h).find(x => /diff_line_id=eq\.l-1/.test(x.url));
    ok('purchase_order = null', !!p && p.body.purchase_order === null, JSON.stringify(p && p.body));
    h.close();
  }

  report();
})();
