/* Разлики — магазинът не пипа „Липса" и коментара след решение (Цвети, 30.09.2026).

   „Магазин" = всеки, за когото canReviewDiff() е false.
     · „Липса": без бутон за кредитно (само текст), без „✅ Изписана", в ✏️
       статусът е заключен с „Липсите се изписват от Цветелина."; директно
       извикване на sdToggleCreditNote / sdMarkTaken отказва без PATCH;
       submitSD не праща status (кредитното изобщо не минава през модала);
     · всеки решен ред: коментарът в ✏️ е само за четене и не се праща;
     · „Заприхождаване"/„Връщане": „📥 Заприходена"/„✅ Върната" и смяната на
       статуса остават на магазина;
     · Цвети — всичко както преди.
   Плюс: запис на „Липса", ВЗЕТА от Цвети, през модала на магазина НЕ трие
   completed_by/at (статусът не се праща → състоянието не се мени).

   Пускане:  node tests/sd-store-missing-lock.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'vraca@temax.bg', display_name: 'Склад Враца',
  role: 'sklad', store_name: 'Враца', assigned_stores: [] };

function line(o) {
  return Object.assign({ id: 'l', report_id: null, store_name: 'Враца', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'А', quantity: 2, type: 'missing', status: 'pending',
    order_number: null, return_order_number: null, confirmed_date: null, credit_note_issued: false,
    comment: 'коментар на Цвети', resolution_comment: null, attachments: [], warehouse_response: null,
    store_response: null, completed_by: null, completed_at: null, created_at: '2026-09-21T09:30:00Z' }, o);
}
const LINES = [
  line({ id: 'm-p', material_name: 'ЛИПСА ЧАКАЩА' }),
  line({ id: 'm-t', material_name: 'ЛИПСА ВЗЕТА', status: 'taken', credit_note_issued: true,
    completed_by: 'Цветелина Тенева', completed_at: '2026-09-25T10:00:00.000Z' }),
  line({ id: 'w-p', material_name: 'ЗАПРИХ ЧАКАЩО', type: 'writein' }),
  line({ id: 'r-p', material_name: 'ВРЪЩАНЕ ЧАКАЩО', type: 'return' })
];

function env(user) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: { stock_differences: LINES, differences_reports: [], stock_returns: [], transport_orders: [],
            users: [{ store_name: 'Враца' }], contacts: [], stores: [], stock_diff_swaps: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(LINES));
  h.w.diffReports = []; h.w.transportOrders = [];
  h.w.sdView = 'rows'; /* изгледът „Редове" (таблицата) — подразбирането е „Бланки" */
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'supplier';
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД']);
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const mod = h => h.doc.getElementById('mod-stock-diff');
const row = (h, id) => { const b = mod(h).querySelector('[data-id="' + id + '"]'); return b && b.closest('tr'); };
const btnOn = (h, id, fn) => Array.prototype.find.call(mod(h).querySelectorAll('button[data-id="' + id + '"]'),
  b => (b.getAttribute('onclick') || '').indexOf(fn + '(') >= 0);
const sdPatches = (h, id) => h.calls.patch.filter(p => /stock_differences/.test(p.url) && p.url.indexOf('id=eq.' + id) >= 0);
const red = h => h.calls.toast.filter(t => /Цветелина/.test(String(t)));
async function openEdit(h, id) { realClick(h.w, btnOn(h, id, 'openSDModal')); await settle(); }
async function save(h) { realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази')); await settle(); }

(async function run() {

  section('1. Магазин + „Липса": таблицата');
  {
    const h = env(STORE);
    const tr = row(h, 'm-p');
    if (ok('редът „ЛИПСА ЧАКАЩА" е на екрана', !!tr)) {
      ok('няма бутон за кредитно', !btnOn(h, 'm-p', 'sdToggleCreditNote'));
      ok('кредитното е текст „❌ Няма"', tr.querySelector('.sd-credit').textContent.trim() === '❌ Няма',
        tr.querySelector('.sd-credit').textContent);
      ok('няма „✅ Изписана"', !btnOn(h, 'm-p', 'sdMarkTaken'));
      ok('✏️ си е там', !!btnOn(h, 'm-p', 'openSDModal'));
    }
    ok('ВЗЕТА „Липса": кредитното е текст „✅ Издадено"',
      !btnOn(h, 'm-t', 'sdToggleCreditNote') && row(h, 'm-t').querySelector('.sd-credit').textContent.trim() === '✅ Издадено');
    h.close();
  }

  section('2. Магазин + „Липса": директно извикване — отказ, без PATCH');
  {
    const h = env(STORE);
    h.w.sdToggleCreditNote('m-p');
    await settle();
    ok('sdToggleCreditNote: без PATCH', sdPatches(h, 'm-p').length === 0, JSON.stringify(sdPatches(h, 'm-p')));
    ok('sdToggleCreditNote: червен toast', red(h).length === 1, h.calls.toast.join(' | '));
    h.w.sdMarkTaken('m-p');
    await settle();
    ok('sdMarkTaken: без PATCH', sdPatches(h, 'm-p').length === 0, JSON.stringify(sdPatches(h, 'm-p')));
    ok('sdMarkTaken: червен toast', red(h).length === 2, h.calls.toast.join(' | '));
    h.close();
  }

  section('3. Магазин + „Липса": ✏️ модалът');
  {
    const h = env(STORE);
    await openEdit(h, 'm-p');
    const sel = h.doc.getElementById('sd-status');
    const ov = h.doc.getElementById('sd-ov');
    if (ok('модалът е отворен', !!ov && !!sel)) {
      ok('селектът „Статус" е disabled', sel.disabled);
      ok('обяснение „Липсите се изписват от Цветелина."', ov.textContent.indexOf('Липсите се изписват от Цветелина.') >= 0);
      const c = h.doc.getElementById('sd-comment');
      ok('коментарът е скрито поле (само за четене)', c && c.type === 'hidden', c && c.type);
      ok('и се вижда като текст', ov.textContent.indexOf('коментар на Цвети') >= 0);
      /* Дори някой да махне disabled и да смени стойността — не се праща. */
      sel.disabled = false; sel.value = 'taken'; c.value = 'пренаписан';
      await save(h);
      const p = sdPatches(h, 'm-p')[0];
      if (ok('записът минава (PATCH)', !!p, h.calls.toast.join(' | '))) {
        ok('без status', !('status' in p.body), JSON.stringify(p.body));
        ok('без credit_note_issued', !('credit_note_issued' in p.body));
        ok('без comment', !('comment' in p.body));
        ok('без completed_by/at', !('completed_by' in p.body) && !('completed_at' in p.body));
      }
    }
    h.close();
  }
  {
    /* ВЗЕТА от Цвети: записът на магазина не бива да изтрие кой я е изписал. */
    const h = env(STORE);
    await openEdit(h, 'm-t');
    await save(h);
    const p = sdPatches(h, 'm-t')[0];
    if (ok('ВЗЕТА „Липса": записът минава', !!p, h.calls.toast.join(' | '))) {
      ok('completed_by/at не се нулират', !('completed_by' in p.body) && !('completed_at' in p.body), JSON.stringify(p.body));
      ok('status не се праща', !('status' in p.body));
    }
    h.close();
  }

  section('4. Магазин + „Заприхождаване": статусът остава, коментарът — не');
  {
    const h = env(STORE);
    const b = btnOn(h, 'w-p', 'sdMarkTaken');
    if (ok('„📥 Заприходена" е на реда', !!b && b.textContent.trim() === '📥 Заприходена', b && b.textContent)) {
      realClick(h.w, b);
      await settle();
      const p = sdPatches(h, 'w-p')[0];
      ok('клик → PATCH status=taken', !!p && p.body.status === 'taken' && p.body.completed_by === 'Склад Враца', JSON.stringify(p && p.body));
    }
    ok('„✅ Върната" е на реда „Връщане"', !!btnOn(h, 'r-p', 'sdMarkTaken'));
    h.close();
  }
  {
    const h = env(STORE);
    await openEdit(h, 'w-p');
    const sel = h.doc.getElementById('sd-status');
    if (ok('✏️: статусът е отключен', !!sel && !sel.disabled)) {
      ok('без обяснението за Липса', h.doc.getElementById('sd-ov').textContent.indexOf('Липсите се изписват') < 0);
      ok('коментарът е само за четене', h.doc.getElementById('sd-comment').type === 'hidden');
      sel.value = 'taken';
      h.doc.getElementById('sd-comment').value = 'пренаписан';
      await save(h);
      const p = sdPatches(h, 'w-p')[0];
      ok('PATCH status=taken', !!p && p.body.status === 'taken', JSON.stringify(p && p.body) + ' | ' + h.calls.toast.join(' | '));
      ok('comment не отива в PATCH-а', !!p && !('comment' in p.body), JSON.stringify(p && p.body));
    }
    h.close();
  }

  section('5. Цвети + „Липса": всичко както преди');
  {
    const h = env(CVETI);
    const cb = btnOn(h, 'm-p', 'sdToggleCreditNote');
    if (ok('бутонът за кредитно е там', !!cb)) {
      realClick(h.w, cb);
      await settle();
      const p = sdPatches(h, 'm-p')[0];
      ok('клик → PATCH credit_note_issued=true', !!p && p.body.credit_note_issued === true, JSON.stringify(p && p.body));
    }
    ok('„✅ Изписана" е там', !!btnOn(h, 'm-p', 'sdMarkTaken'));
    h.close();
  }
  {
    const h = env(CVETI);
    realClick(h.w, btnOn(h, 'm-p', 'sdMarkTaken'));
    await settle();
    const p = sdPatches(h, 'm-p')[0];
    ok('„✅ Изписана" → PATCH status=taken', !!p && p.body.status === 'taken', JSON.stringify(p && p.body));
    ok('без червен toast', red(h).length === 0, h.calls.toast.join(' | '));
    h.close();
  }
  {
    const h = env(CVETI);
    await openEdit(h, 'm-p');
    const sel = h.doc.getElementById('sd-status');
    const c = h.doc.getElementById('sd-comment');
    if (ok('✏️: статусът е отключен', !!sel && !sel.disabled)) {
      ok('коментарът е поле за писане', c.type !== 'hidden', c.type);
      ok('без обяснението за Липса', h.doc.getElementById('sd-ov').textContent.indexOf('Липсите се изписват') < 0);
      sel.value = 'taken'; c.value = 'нов коментар';
      await save(h);
      const p = sdPatches(h, 'm-p')[0];
      ok('PATCH status=taken и comment', !!p && p.body.status === 'taken' && p.body.comment === 'нов коментар',
        JSON.stringify(p && p.body) + ' | ' + h.calls.toast.join(' | '));
    }
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
