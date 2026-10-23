/* „Разлики": created_by се записва САМО при нов ред (решение на Тенчо,
   23.10.2026; същото като submitSR в „За връщане", 02fb8a1).

   ПОВОД. submitSD() пращаше created_by = текущия потребител и при редакция
   (sdEditId → PATCH), тоест който редактира ред, ставаше „създател". На 23.10
   290 от 1721 реда имаха created_by, различен от автора на бланката
   (differences_reports.submitted_by), 284 от тях — „Цветелина Тенева".
   Заварените редове НЕ се поправят.

   ТВЪРДЕНИЯТА (истински клик на „Добави“ / „Запази“ в модала):
   · нов ред → POST носи created_by на потребителя;
   · редакция от офиса на ред, създаден от обекта → PATCH БЕЗ created_by;
   · редакция от обекта → PATCH без created_by;
   · останалите полета на PATCH-а — както преди.

   МУТАЦИИ (пускани ръчно на 23.10.2026, всяка пада):
   M1 created_by пак и при редакция (условието `if(!sdEditId)` махнато);
   M2 created_by липсва и при нов ред (редът `data.created_by = …` махнат);
   M3 resolution_comment изпаднал заедно с created_by (махнат от data).

   Пускане: node tests/sd-created-by.test.js . */
'use strict';

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
    type: 'missing', status: 'pending', comment: 'коментар на обекта', resolution_comment: 'бележка на Цвети',
    attachments: [], credit_note_issued: false, difference_category: null, unit: 'бр.', confirmed_date: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    warehouse_response: null, store_corrected_at: null, created_by: 'Склад Раднево',
    created_at: '2026-10-20T08:00:00Z' }, o);
}

function env(user, lines) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: { stock_differences: lines, differences_reports: [], stock_returns: [],
            transport_orders: [],
            users: [{ store_name: 'Раднево' }, { store_name: 'Враца' }], contacts: [], stores: [], stock_diff_swaps: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = [];
  h.w.transportOrders = [];
  h.w.sdView = 'rows';
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'supplier';
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД']);
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 6; i++) await ticks(); };
const editBtn = (h, id) => Array.prototype.find.call(h.doc.querySelectorAll('button[data-id="' + id + '"]'),
  b => (b.getAttribute('onclick') || '').indexOf('openSDModal') >= 0) || null;
const sdPatches = h => h.calls.patch.filter(p => p.table === 'stock_differences');
const sdPosts = h => h.calls.post.filter(p => p.table === 'stock_differences');
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
/* Ключовете, които PATCH-ът от submitSD носеше и преди промяната. */
const KEEP = ['store_name', 'supplier', 'material_code', 'material_name', 'quantity', 'order_number',
  'confirmed_date', 'type', 'status', 'comment', 'resolution_comment'];

async function editAndSave(h, id, fill) {
  const e = editBtn(h, id);
  if (!ok('бутонът ✏️ е на реда', !!e)) return null;
  realClick(h.w, e);
  await settle();
  if (fill) fill(h.doc);
  h.calls.patch.length = 0; h.calls.post.length = 0; h.calls.toast.length = 0;
  const save = btn(h.doc.getElementById('sd-ov'), 'Запази');
  if (!ok('бутонът „Запази“ го има', !!save)) return null;
  realClick(h.w, save);
  await settle();
  const p = sdPatches(h).filter(x => /id=eq\.l-1/.test(x.url));
  ok('точно един PATCH към реда', p.length === 1, p.length + ' | ' + h.calls.toast.join(' | '));
  ok('POST към stock_differences няма', sdPosts(h).length === 0);
  return p[0] || null;
}

(async function run() {

  section('1. Нов ред → POST с created_by на потребителя');
  {
    const h = env(CVETI, []);
    h.w.openSDModal(null);
    await settle();
    const st = h.doc.getElementById('sd-store');
    if (st && !st.value) {
      if (st.tagName === 'SELECT' && !Array.prototype.some.call(st.options, o => o.value === 'Раднево'))
        st.insertAdjacentHTML('beforeend', '<option>Раднево</option>');
      st.value = 'Раднево';
    }
    h.doc.getElementById('sd-name').value = 'НОВ АРТИКУЛ';
    h.doc.getElementById('sd-qty').value = '3';
    h.calls.post.length = 0; h.calls.patch.length = 0; h.calls.toast.length = 0;
    const add = btn(h.doc.getElementById('sd-ov'), 'Добави');
    if (ok('бутонът „Добави“ го има', !!add)) {
      realClick(h.w, add);
      await settle();
      const p = sdPosts(h);
      ok('точно един POST към stock_differences', p.length === 1, p.length + ' | ' + h.calls.toast.join(' | '));
      if (p.length) {
        const b = Array.isArray(p[0].body) ? p[0].body[0] : p[0].body;
        ok('POST носи created_by = „Цветелина Тенева"', b.created_by === 'Цветелина Тенева', String(b.created_by));
        ok('и името на артикула', b.material_name === 'НОВ АРТИКУЛ', String(b.material_name));
      }
      ok('PATCH към stock_differences няма', sdPatches(h).length === 0);
    }
    h.close();
  }

  section('2. Редакция ОТ ОФИСА на ред, създаден от обекта → PATCH без created_by');
  {
    const h = env(CVETI, [line()]);
    const p = await editAndSave(h, 'l-1', d => {
      const c = d.getElementById('sd-ctrl-comment'); if (c) c.value = 'нова бележка';
    });
    if (p) {
      ok('PATCH-ът НЯМА ключ created_by', !has(p.body, 'created_by'), JSON.stringify(p.body.created_by));
      KEEP.forEach(k => ok('PATCH-ът пак носи ' + k, has(p.body, k)));
      ok('бележката на Цвети е новата', p.body.resolution_comment === 'нова бележка', String(p.body.resolution_comment));
      ok('store_name е на реда', p.body.store_name === 'Раднево', String(p.body.store_name));
    }
    h.close();
  }

  section('3. Редакция ОТ ОБЕКТА → PATCH без created_by');
  {
    const h = env(STORE, [line({ created_by: 'Цветелина Тенева' })]);
    let today = null;
    const p = await editAndSave(h, 'l-1', d => {
      today = h.w.today();
      d.getElementById('sd-cdate').value = today;
    });
    if (p) {
      ok('PATCH-ът НЯМА ключ created_by', !has(p.body, 'created_by'), JSON.stringify(p.body.created_by));
      /* Магазин + решен ред „Липса": comment и status не се пращат — така е и
         преди тази промяна (submitSD, „коментарът е само за четене"). */
      KEEP.filter(k => k !== 'comment' && k !== 'status')
        .forEach(k => ok('PATCH-ът пак носи ' + k, has(p.body, k)));
      ok('comment НЕ се праща (както преди)', !has(p.body, 'comment'));
      ok('status НЕ се праща (както преди)', !has(p.body, 'status'));
      ok('датата е новата', p.body.confirmed_date === today, String(p.body.confirmed_date));
      /* Решен ред — store_corrected_at не се слага (както преди: само при нерешен). */
      ok('store_corrected_at НЕ се слага за решен ред (както преди)', !has(p.body, 'store_corrected_at'));
      ok('return_order_number НЕ се праща от обекта (както преди)', !has(p.body, 'return_order_number'));
    }
    h.close();
  }

  report();
})();
