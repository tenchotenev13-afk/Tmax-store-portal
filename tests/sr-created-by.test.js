/* „За връщане": created_by се записва САМО при нов ред (решение на Тенчо,
   23.10.2026).

   ПОВОД. submitSR() пращаше created_by = текущия потребител и при редакция.
   Обектът потвърждава реда през ✏️ и името му лягаше върху създателя: от 52
   реда source='diff' (08–21.10), създадени от решение на Цветелина в
   „Разлики", 49 носеха името на обекта. Заварените редове НЕ се поправят.

   ТВЪРДЕНИЯТА (истински клик на „Добави“ / „Запази“ във формата):
   · нов ред → POST носи created_by на потребителя;
   · редакция от обекта на ред, създаден от „Цветелина Тенева" → PATCH БЕЗ
     created_by, а следата confirmed_by/confirmed_at е 'store:<обект>';
   · редакция от офиса → PATCH без created_by, следата е 'office:<име>';
   · редакция без смяна на датата → нито created_by, нито следа;
   · останалите полета на PATCH-а са както преди.

   МУТАЦИИ (пускани ръчно на 23.10.2026, всяка пада):
   M1 created_by пак и при редакция (условието `if(!srEditId)` махнато);
   M2 created_by липсва и при нов ред (редът `data.created_by = …` махнат);
   M3 следата confirmed_by изтрита заедно с created_by (`delete data.confirmed_by`
      след присвояването на следата).

   Пускане: node tests/sr-created-by.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, btn, ticks } = H;

const STORE = 'Троян';
const STORE_USER = { email: 't@temax.bg', display_name: 'Иван Петров', role: 'manager', store_name: STORE };
const OFFICE_USER = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'accounting', store_name: 'Централен офис' };

function row(over) {
  return Object.assign({
    id: 'r1', store_name: STORE, status: 'pending', source: 'diff',
    product_name: 'Лепило', sap_code: '1001', quantity: 2, supplier: 'Доставчик ЕООД',
    purchase_order: '', id_euro: '', doc_date: null, order_number: '4100206561',
    diff_line_id: 'dl-1', confirmed_date: null, confirmed_by: null, confirmed_at: null,
    created_by: 'Цветелина Тенева', created_at: '2026-10-21T14:30:00Z', photos: []
  }, over || {});
}

async function view(user, rows) {
  const h = boot({
    modules: ['stock-returns.js'],
    user: user,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      stock_returns: () => rows, stock_differences: [],
      recurring_tasks: [], recurring_task_versions: []
    }
  });
  if (!guard('loadStockReturns() не хвърля', () => h.w.loadStockReturns())) return null;
  for (let i = 0; i < 60; i++) {
    if ((h.doc.getElementById('mod-stock-returns').innerHTML || '').indexOf('Стока за връщане') >= 0) break;
    await ticks();
  }
  return h;
}
const ov = h => h.doc.getElementById('sr-ov');

/* Отваря формата, пуска fill() и натиска бутона с текст label. */
async function submitVia(h, id, label, fill) {
  if (!guard('openSRModal() не хвърля', () => h.w.openSRModal(id))) return false;
  await ticks(); await ticks();
  const st = h.doc.getElementById('sr-store');
  if (st && !st.value) st.value = STORE;
  if (fill) fill(h.doc);
  h.calls.post.length = 0; h.calls.patch.length = 0; h.calls.toast.length = 0;
  const b = btn(ov(h), label);
  if (!ok('бутонът „' + label + '“ го има', !!b)) return false;
  realClick(h.w, b);
  await ticks(); await ticks();
  return true;
}
const srPost = h => h.calls.post.filter(c => c.table === 'stock_returns');
const srPatch = h => h.calls.patch.filter(c => c.table === 'stock_returns');
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

(async function () {

  section('1. Нов ред → created_by е на потребителя');
  {
    const h = await view(OFFICE_USER, []);
    if (h && await submitVia(h, null, 'Добави', d => {
      const p = d.getElementById('sr-product'); if (p) p.value = 'Нов артикул';
    })) {
      const p = srPost(h);
      ok('има точно един POST към stock_returns', p.length === 1, String(p.length) + ' | ' + h.calls.toast.join(' | '));
      if (p.length) {
        const body = Array.isArray(p[0].body) ? p[0].body[0] : p[0].body;
        ok('POST носи created_by = „Цветелина Тенева"', body.created_by === 'Цветелина Тенева', String(body.created_by));
      }
      ok('PATCH няма', srPatch(h).length === 0);
    }
  }

  section('2. Редакция ОТ ОБЕКТА на ред, създаден от офиса → без created_by');
  {
    const h = await view(STORE_USER, [row()]);
    let today = null;
    if (h && await submitVia(h, 'r1', 'Запази', d => {
      today = h.w.today();
      d.getElementById('sr-cdate').value = today;
    })) {
      const p = srPatch(h);
      ok('има точно един PATCH към stock_returns', p.length === 1, String(p.length) + ' | ' + h.calls.toast.join(' | '));
      if (p.length) {
        const b = p[0].body;
        ok('PATCH-ът е по id на реда', p[0].url.indexOf('id=eq.r1') >= 0, p[0].url);
        ok('PATCH-ът НЯМА ключ created_by', !has(b, 'created_by'), JSON.stringify(b.created_by));
        ok('confirmed_date е днешната', b.confirmed_date === today, String(b.confirmed_date));
        ok('следата е на ОБЕКТА', b.confirmed_by === 'store:' + STORE, String(b.confirmed_by));
        ok('и има час на следата', !!b.confirmed_at, String(b.confirmed_at));
        /* Останалите полета — както преди промяната. */
        ['store_name', 'supplier', 'source', 'withdrawal_date', 'courier_info', 'photos', 'status',
          'product_name', 'sap_code', 'quantity', 'purchase_order', 'id_euro', 'doc_date', 'controller_comment']
          .forEach(k => ok('PATCH-ът пак носи ' + k, has(b, k)));
        ok('store_name е на реда', b.store_name === STORE, String(b.store_name));
        ok('source е diff', b.source === 'diff', String(b.source));
        ok('plant НЕ се праща при редакция (както преди)', !has(b, 'plant'));
        ok('order_number НЕ се праща за ред от разлика (както преди)', !has(b, 'order_number'));
      }
    }
  }

  section('3. Редакция ОТ ОФИСА → без created_by, следа office:<име>');
  {
    const h = await view(OFFICE_USER, [row({ created_by: 'Склад Троян' })]);
    let today = null;
    if (h && await submitVia(h, 'r1', 'Запази', d => {
      today = h.w.today();
      d.getElementById('sr-cdate').value = today;
    })) {
      const p = srPatch(h);
      ok('има точно един PATCH', p.length === 1, String(p.length) + ' | ' + h.calls.toast.join(' | '));
      if (p.length) {
        const b = p[0].body;
        ok('PATCH-ът НЯМА ключ created_by', !has(b, 'created_by'), JSON.stringify(b.created_by));
        ok('следата е на ОФИСА', b.confirmed_by === 'office:Цветелина Тенева', String(b.confirmed_by));
        ok('confirmed_date е днешната', b.confirmed_date === today, String(b.confirmed_date));
      }
      ok('POST няма', srPost(h).length === 0);
    }
  }

  section('4. Редакция БЕЗ смяна на датата → нито created_by, нито следа');
  {
    const h = await view(STORE_USER, [row({ confirmed_date: '2026-10-20', confirmed_by: 'store:' + STORE, confirmed_at: '2026-10-20T07:00:00Z' })]);
    if (h && await submitVia(h, 'r1', 'Запази', d => {
      d.getElementById('sr-courier').value = 'Еконт';
    })) {
      const p = srPatch(h);
      ok('има точно един PATCH', p.length === 1, String(p.length));
      if (p.length) {
        const b = p[0].body;
        ok('PATCH-ът НЯМА created_by', !has(b, 'created_by'));
        ok('PATCH-ът НЯМА confirmed_by (датата не се мени)', !has(b, 'confirmed_by'));
        ok('PATCH-ът НЯМА confirmed_at', !has(b, 'confirmed_at'));
        ok('датата си е същата', b.confirmed_date === '2026-10-20', String(b.confirmed_date));
        ok('новият куриер е в PATCH-а', b.courier_info === 'Еконт', String(b.courier_info));
      }
    }
  }

  report();
})();
