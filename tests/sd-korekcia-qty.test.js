/* Разлики — корекция на количествата в бланка (Цветелина, 20.10.2026
   т.5 и т.6; отговор 21.10). Само при посока доставчик.

   Д6 — обектът, „✏️ Коригирай подадената разлика": ново поле „По стокова на
        доставчика" (sdc-qty-sup → quantity_supplier_doc), със същата проверка
        за номер на документ. Ключалките — както досега (само преди решение,
        не при сторно, само собственият обект).
   Д5 — Цвети, ✏️ (openSDModal): „Реално получено" (sd-qty-real) и „По стокова
        на доставчика" (sd-qty-sup) — и след решение; type и quantity не се
        пипат. Само ред от доставчикова бланка, без storeLocked; „+ Добави
        ръчно" (ред без бланка) ги няма.

   а) обект, supplier без тип → ✏️ → „По стокова" от реда; PATCH; празно → null;
      180507457 → тост, без PATCH
   б) обект, interstore → полето го няма; ред с тип → бутонът ✏️ го няма
   в) Цвети (accounting/admin), supplier с тип missing → двете полета → PATCH
      с quantity_received и quantity_supplier_doc; type и quantity — същите
   г) Цвети, interstore → полетата ги няма; PATCH-ът е без тях
   д) магазин на решен ред (storeLocked) → полетата не са редактируеми
   е) след запис прегледът на имейла показва новите числа
   ж) „+ Добави ръчно" → полетата ги няма

   Мутационна проверка (21.10.2026, поотделно върху stock-differences.js; при
   всяка тестът пада с exit 1):
     1. „По стокова" от обекта не се записва                      → пада (а)
     2. полетата и при interstore (без проверка на посоката)       → пада (г)
     3. записът на Цвети трие type (data.type = null)              → пада (в)
     4. „По стокова" в Цвети не се записва                         → пада (в)
     5. полетата на Цвети и при storeLocked                        → пада (д)

   Пускане:  node tests/sd-korekcia-qty.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const STORE = { email: 'shumen@temax.bg', display_name: 'Склад Шумен', role: 'sklad', store_name: 'Шумен', assigned_stores: [] };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Шумен'] };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rep(o) {
  return Object.assign({ id: 'rep-1', direction: 'supplier', store_name: 'Шумен', counterpart: 'ТЕСИ ООД',
    document_number: '180508904', doc_date: '2026-10-20', submitted_by: 'Склад Шумен', general_comment: '',
    photos: [], reviewed: false, email_pending: false, email_sent_at: null, created_at: '2026-10-20T08:00:00Z' }, o);
}
function line(o) {
  return Object.assign({ id: 'l-1', report_id: 'rep-1', store_name: 'Шумен', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'ПЛАНКА ЪГЛОВА', quantity: 10, quantity_received: 7,
    quantity_supplier_doc: 9, type: null, status: 'new', comment: 'Липсват', resolution_comment: null,
    attachments: [], difference_category: 'undelivered', unit: 'бр.', order_number: '4100204934',
    confirmed_date: null, store_corrected_at: null, credit_note_issued: false }, o);
}

function env(user, R, L, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'email.js'],
    user: user, confirm: true,
    data: { stock_differences: L, differences_reports: [R], stock_returns: [], transport_orders: [],
      users: [{ store_name: 'Шумен' }], contacts: [], stores: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(L));
  h.w.diffReports = [JSON.parse(JSON.stringify(R))];
  h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = R.direction;
  h.w.sdView = opts.view || 'reports';
  h.w.loadStockDiff = function () {}; /* презареждането би върнало статичните данни */
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const patches = (h, t) => h.calls.patch.filter(p => p.table === t);
const correctBtn = h => Array.prototype.find.call(h.doc.querySelectorAll('button'), b => /openSDCorrectModal\(/.test(b.getAttribute('onclick') || ''));
const editBtn = (h, id) => Array.prototype.find.call(h.doc.querySelectorAll('#sd-rows button'),
  b => /openSDModal\(/.test(b.getAttribute('onclick') || '') && b.dataset.id === id);

(async function run() {

  section('а) обект, supplier ред без тип → „По стокова" в корекцията');
  {
    const h = env(STORE, rep(), [line()]);
    const b = correctBtn(h);
    if (ok('бутонът ✏️ за корекция е в картата', !!b)) {
      realClick(h.w, b, '✏️');
      const f = h.doc.getElementById('sdc-qty-sup');
      ok('полето „По стокова" е там, със стойност 9 от реда', !!f && f.value === '9', f && f.value);
      ok('надписът е „По стокова на доставчика (бр.)"', h.doc.getElementById('sdc-ov').textContent.indexOf('По стокова на доставчика (бр.)') >= 0);
      f.value = '8';
      realClick(h.w, btn(h.doc.getElementById('sdc-ov'), '💾 Запази корекцията'), 'Запази');
      await settle();
      const p = patches(h, 'stock_differences');
      ok('един PATCH', p.length === 1, JSON.stringify(p.map(x => x.body)));
      ok('quantity_supplier_doc = 8', p[0] && p[0].body.quantity_supplier_doc === 8, p[0] && JSON.stringify(p[0].body));
      ok('store_corrected_at се пише', p[0] && !!p[0].body.store_corrected_at);
    }
    h.close();

    const h2 = env(STORE, rep(), [line()]);
    realClick(h2.w, correctBtn(h2), '✏️');
    h2.doc.getElementById('sdc-qty-sup').value = '';
    realClick(h2.w, btn(h2.doc.getElementById('sdc-ov'), '💾 Запази корекцията'), 'Запази');
    await settle();
    const p2 = patches(h2, 'stock_differences');
    ok('празно → quantity_supplier_doc = null', p2.length === 1 && p2[0].body.quantity_supplier_doc === null, p2[0] && JSON.stringify(p2[0].body));
    h2.close();

    const h3 = env(STORE, rep(), [line()]);
    realClick(h3.w, correctBtn(h3), '✏️');
    h3.doc.getElementById('sdc-qty-sup').value = '180507457';
    realClick(h3.w, btn(h3.doc.getElementById('sdc-ov'), '💾 Запази корекцията'), 'Запази');
    await settle();
    ok('180507457 → без PATCH', patches(h3, 'stock_differences').length === 0);
    ok('180507457 → тост за номер на документ', h3.calls.toast.some(t => /номер на документ \(180507457\)/.test(t)), h3.calls.toast.join(' | '));
    h3.close();
  }

  section('б) обект, interstore → полето го няма; ред с тип → бутонът го няма');
  {
    const h = env(STORE, rep({ direction: 'interstore', counterpart: 'Логистичен склад Търговище' }),
      [line({ difference_category: 'excess', quantity_supplier_doc: null })]);
    const b = correctBtn(h);
    if (ok('interstore: бутонът ✏️ е там', !!b)) {
      realClick(h.w, b, '✏️');
      ok('interstore: няма поле „По стокова"', !h.doc.getElementById('sdc-qty-sup'));
      realClick(h.w, btn(h.doc.getElementById('sdc-ov'), '💾 Запази корекцията'), 'Запази');
      await settle();
      const p = patches(h, 'stock_differences');
      ok('interstore: PATCH без quantity_supplier_doc', p.length === 1 && !('quantity_supplier_doc' in p[0].body), p[0] && JSON.stringify(p[0].body));
    }
    h.close();
    const h2 = env(STORE, rep(), [line({ type: 'missing', status: 'pending' })]);
    ok('ред с тип: няма бутон за корекция', !correctBtn(h2));
    h2.close();
  }

  section('в) Цвети, supplier ред с тип missing → двете полета в ✏️');
  for (const u of [CVETI, ADMIN]) {
    const L = [line({ type: 'missing', status: 'pending', quantity: 3 })];
    const h = env(u, rep({ reviewed: true }), L, { view: 'rows' });
    const b = editBtn(h, 'l-1');
    if (ok(u.role + ': ✏️ в „Решени редове"', !!b)) {
      realClick(h.w, b, '✏️');
      await settle(); /* admin: магазинът в селекта идва асинхронно (sbGet users) */
      const fr = h.doc.getElementById('sd-qty-real'), fs = h.doc.getElementById('sd-qty-sup');
      ok(u.role + ': „Реално получено" = 7', !!fr && fr.value === '7', fr && fr.value);
      ok(u.role + ': „По стокова" = 9', !!fs && fs.value === '9', fs && fs.value);
      ok(u.role + ': полетата са input за число', !!fr && fr.type === 'number' && !!fs && fs.type === 'number');
      fr.value = '6'; fs.value = '8';
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'), 'Запази');
      await settle();
      const p = patches(h, 'stock_differences');
      const body = (p[0] && p[0].body) || {};
      ok(u.role + ': PATCH с quantity_received = 6 и quantity_supplier_doc = 8',
        body.quantity_received === 6 && body.quantity_supplier_doc === 8, JSON.stringify(body));
      ok(u.role + ': type остава missing', body.type === 'missing', body.type);
      ok(u.role + ': quantity остава 3 (без преизчисление)', body.quantity === 3, String(body.quantity));
    }
    h.close();
  }

  section('г) Цвети, interstore → полетата ги няма; PATCH-ът е като преди');
  {
    const h = env(CVETI, rep({ direction: 'interstore', counterpart: 'Логистичен склад Търговище', reviewed: true }),
      [line({ type: 'return', status: 'pending', quantity_supplier_doc: null })], { view: 'rows' });
    const b = editBtn(h, 'l-1');
    if (ok('✏️ в „Решени редове" (interstore)', !!b)) {
      realClick(h.w, b, '✏️');
      ok('няма „Реално получено" и „По стокова"', !h.doc.getElementById('sd-qty-real') && !h.doc.getElementById('sd-qty-sup'));
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'), 'Запази');
      await settle();
      const p = patches(h, 'stock_differences');
      ok('PATCH без quantity_received / quantity_supplier_doc',
        p.length >= 1 && !('quantity_received' in p[0].body) && !('quantity_supplier_doc' in p[0].body), p[0] && JSON.stringify(p[0].body));
    }
    h.close();
  }

  section('д) магазин на решен ред (storeLocked) → полетата не са редактируеми');
  {
    const h = env(STORE, rep({ reviewed: true }), [line({ type: 'writein', status: 'pending' })], { view: 'rows' });
    h.w.openSDModal('l-1');
    const ov = h.doc.getElementById('sd-ov');
    ok('модалът е отворен', !!ov && ov.classList.contains('open'));
    ok('няма поле „Реално получено" / „По стокова" за писане',
      !h.doc.getElementById('sd-qty-real') && !h.doc.getElementById('sd-qty-sup'));
    h.close();
  }

  section('е) след запис прегледът на имейла показва новите числа');
  {
    const L = [line({ type: 'missing', status: 'pending' })];
    const h = env(CVETI, rep({ reviewed: true }), L, { view: 'rows' });
    realClick(h.w, editBtn(h, 'l-1'), '✏️');
    await settle();
    h.doc.getElementById('sd-qty-real').value = '5';
    h.doc.getElementById('sd-qty-sup').value = '11';
    realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'), 'Запази');
    await settle();
    /* loadStockDiff е изключен — прилагаме записа, както би го върнала базата */
    const body = patches(h, 'stock_differences')[0].body;
    Object.assign(h.w.sdData[0], { quantity_received: body.quantity_received, quantity_supplier_doc: body.quantity_supplier_doc });
    const html = h.w.diffEmailBodyHtml(h.w.diffReports[0], h.w.sdData, '');
    ok('имейлът има „По стокова" 11 и „Реално" 5',
      /text-align:right;">11<\/td><td[^>]*>5<\/td>/.test(html), html.slice(html.indexOf('<tr><td'), html.indexOf('<tr><td') + 600));
    h.close();
  }

  section('ж) „+ Добави ръчно" → полетата ги няма');
  {
    const h = env(CVETI, rep(), [line()], { view: 'rows' });
    h.w.openSDModal(null);
    ok('нов запис: няма „Реално получено" / „По стокова"',
      !h.doc.getElementById('sd-qty-real') && !h.doc.getElementById('sd-qty-sup'));
    h.close();
  }

  report();
})();
