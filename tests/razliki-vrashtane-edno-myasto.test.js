/* Разлики — „Връщане" се отбелязва на ЕДНО място (решение на Тенчо 26.11.2026
   по предложение на склад Раднево). Обектът отмята „✅ Взета" в „За връщане →
   По разлики"; редът в Разлики го следва сам (тригер razliki_return_sync в
   базата — той се мери в tests/sql/razliki-return-sync.test.sql, не тук).

   Тук:
     · обект + ред „Връщане" СЪС запис в „За връщане" → няма „✅ Върната",
       има бутон-връзка „↪ Отбележете във „За връщане““; реален клик → таб
       „За връщане", под-таб „По разлики", търсенето = SAP кода;
     · ред БЕЗ запис → старият бутон и старият PATCH;
     · паднала заявка за връзката → старият бутон + console.error;
     · офисът — без промяна;
     · директно sdMarkTaken за свързан ред → отказ, 0 PATCH;
     · надпис „✓ Върната дд.мм · от „За връщане““ при completed_by от синхрона;
     · ✏️ — статусът е заключен за обекта при свързан ред, и не се праща (двете посоки).
   stock-returns.js + stock-differences.js заредени заедно в реда от index.html.

   Мутации (26.11.2026, ръчно, всяка върната след пускане):
     M1 sdReturnMarkElsewhere без sdStoreHintsOn()        → §5 пада (офисът губи бутона)
     M2 sdReturnMarkElsewhere без !!sdReturnLinked[l.id] → §3 пада (несвързаният губи бутона)
     M3 sdMarkTaken без проверката sdReturnMarkElsewhere → §6 пада (PATCH минава)
     M4 sdOpenReturnFor без srSearch = …                 → §2 пада
     M6 submitSD без „|| sdReturnMarkElsewhere(origRecord)" → §8 пада (status минава през ✏️)
     M5 sdReturnSyncedHtml с indexOf(…)<0 вместо !==0    → НЕУЛОВЕНА: разликата е
        само при completed_by с „За връщане" в средата — тригерът и
        изравняването пишат само в началото; не е добавена проверка.
   Пускане:  node tests/razliki-vrashtane-edno-myasto.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'vraca@temax.bg', display_name: 'Склад Враца',
  role: 'sklad', store_name: 'Враца', assigned_stores: [] };

function line(o) {
  return Object.assign({ id: 'l', report_id: null, store_name: 'Враца', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'А', quantity: 2, type: 'return', status: 'pending',
    order_number: null, return_order_number: null, confirmed_date: null, credit_note_issued: false,
    comment: null, resolution_comment: null, attachments: [], warehouse_response: null,
    store_response: null, completed_by: null, completed_at: null, created_at: '2026-11-20T09:30:00Z' }, o);
}
const LINES = [
  line({ id: 'r-link', material_code: '222', material_name: 'ВРЪЩАНЕ СВЪРЗАНО' }),
  line({ id: 'r-free', material_code: '333', material_name: 'ВРЪЩАНЕ БЕЗ ЗАПИС' }),
  line({ id: 'r-sync', material_code: '444', material_name: 'ВРЪЩАНЕ ОТ СИНХРОНА', status: 'taken',
    completed_by: 'За връщане', completed_at: '2026-11-26T09:00:00.000Z' }),
  line({ id: 'r-hand', material_code: '555', material_name: 'ВРЪЩАНЕ РЪЧНО', status: 'taken',
    completed_by: 'Склад Враца', completed_at: '2026-11-25T09:00:00.000Z' })
];
const RETURNS = [
  { id: 'sr-1', store_name: 'Враца', source: 'diff', status: 'pending', diff_line_id: 'r-link',
    sap_code: '222', product_name: 'ВРЪЩАНЕ СВЪРЗАНО', supplier: 'ТЕСИ ООД', quantity: 2,
    doc_date: '2026-11-20', photos: [], created_at: '2026-11-20T10:00:00Z' },
  { id: 'sr-2', store_name: 'Враца', source: 'diff', status: 'taken', diff_line_id: 'r-sync',
    sap_code: '444', product_name: 'ВРЪЩАНЕ ОТ СИНХРОНА', supplier: 'ТЕСИ ООД', quantity: 1,
    doc_date: '2026-11-19', photos: [], created_at: '2026-11-19T10:00:00Z' }
];

async function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true, fail: opts.fail,
    data: { stock_differences: LINES, differences_reports: [], stock_returns: RETURNS, transport_orders: [],
            users: [{ store_name: 'Враца' }], contacts: [], stores: [], stock_diff_swaps: [],
            recurring_tasks: [], app_settings: [] }
  });
  h.errors = [];
  const origErr = h.w.console.error;
  h.w.console.error = function () { h.errors.push(Array.prototype.join.call(arguments, ' ')); };
  h.w.sdData = JSON.parse(JSON.stringify(LINES));
  h.w.diffReports = []; h.w.transportOrders = [];
  h.w.sdView = 'rows';
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'supplier';
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД']);
  await h.w.sdLoadReturnLinks();   /* реалното четене на връзките */
  h.w.renderStockDiff();
  h.restoreErr = () => { h.w.console.error = origErr; };
  return h;
}
const settle = async () => { for (let i = 0; i < 10; i++) await ticks(); };
const mod = h => h.doc.getElementById('mod-stock-diff');
const btnOn = (h, id, fn) => Array.prototype.find.call(mod(h).querySelectorAll('button[data-id="' + id + '"]'),
  b => (b.getAttribute('onclick') || '').indexOf(fn + '(') >= 0);
const sdPatches = (h, id) => h.calls.patch.filter(p => /stock_differences/.test(p.url) && p.url.indexOf('id=eq.' + id) >= 0);
const rowOf = (h, id) => { const b = mod(h).querySelector('[data-id="' + id + '"]'); return b && b.closest('tr'); };

(async function run() {

  section('1. Обект + свързан ред: връзка вместо „✅ Върната"');
  {
    const h = await env(STORE);
    ok('връзката е прочетена (sdReturnLinked[r-link])', !!h.w.sdReturnLinked && h.w.sdReturnLinked['r-link'] === true);
    ok('няма <button> „✅ Върната" (sdMarkTaken) за r-link', !btnOn(h, 'r-link', 'sdMarkTaken'));
    const lk = btnOn(h, 'r-link', 'sdOpenReturnFor');
    ok('има бутон-връзка', !!lk);
    ok('надписът е „↪ Отбележете във „За връщане““', !!lk && lk.textContent === '↪ Отбележете във „За връщане“', lk && lk.textContent);
    ok('нито един бутон в реда не казва „Върната"', !!rowOf(h, 'r-link') &&
      !Array.prototype.some.call(rowOf(h, 'r-link').querySelectorAll('button'), b => /Върната/.test(b.textContent)));
    h.close();
  }

  section('2. Реален клик по връзката → „За връщане" / „По разлики" / търсене по SAP');
  {
    const h = await env(STORE);
    h.w.srTab = 'complaint'; h.w.srSearch = 'старо'; h.w.srFilter = 'pending';
    realClick(h.w, btnOn(h, 'r-link', 'sdOpenReturnFor'), 'връзка');
    await settle();
    ok('под-таб „По разлики" (srTab=diff)', h.w.srTab === 'diff', h.w.srTab);
    ok('търсенето е SAP кодът', h.w.srSearch === '222', h.w.srSearch);
    ok('филтърът е „Всички" (редът се вижда в какъвто и статус да е)', h.w.srFilter === 'all', h.w.srFilter);
    const wrap = h.doc.getElementById('mod-stock-returns');
    ok('модулът „За връщане" е показан', !!wrap && wrap.style.display !== 'none', wrap && wrap.style.display);
    const inp = h.doc.getElementById('sr-search-input');
    ok('полето за търсене е попълнено', !!inp && inp.value === '222', inp && inp.value);
    ok('данните на „За връщане" са прочетени наново', h.calls.get.some(u => /stock_returns\?order=doc_date/.test(u)), h.calls.get.join(' | '));
    ok('редът е на екрана', !!wrap && wrap.textContent.indexOf('ВРЪЩАНЕ СВЪРЗАНО') >= 0);
    ok('редът от друг SAP НЕ е на екрана', !!wrap && wrap.textContent.indexOf('ВРЪЩАНЕ ОТ СИНХРОНА') < 0);
    h.close();
  }

  section('3. Ред БЕЗ запис в „За връщане" — старият бутон и старият запис');
  {
    const h = await env(STORE);
    ok('няма връзка за r-free', !btnOn(h, 'r-free', 'sdOpenReturnFor'));
    const b = btnOn(h, 'r-free', 'sdMarkTaken');
    if (ok('„✅ Върната" е там', !!b && b.textContent === '✅ Върната', b && b.textContent)) {
      realClick(h.w, b, '✅ Върната');
      await settle();
      const p = sdPatches(h, 'r-free')[0];
      ok('PATCH status taken, completed_by = обекта', !!p && p.body.status === 'taken' && p.body.completed_by === 'Склад Враца',
        JSON.stringify(p && p.body));
    }
    h.close();
  }

  section('4. Паднала заявка за връзката → старият бутон + console.error');
  {
    const h = await env(STORE, { fail: { GET: /stock_returns\?select=diff_line_id/ } });
    ok('sdReturnLinked е null', h.w.sdReturnLinked === null);
    ok('„✅ Върната" е там за r-link', !!btnOn(h, 'r-link', 'sdMarkTaken'));
    ok('няма връзка', !btnOn(h, 'r-link', 'sdOpenReturnFor'));
    ok('console.error', h.errors.some(e => /sdLoadReturnLinks/.test(e)), h.errors.join(' | '));
    h.close();
  }

  section('5. Офисът — без промяна');
  {
    const h = await env(CVETI);
    ok('„✅ Върната" за r-link е там', !!btnOn(h, 'r-link', 'sdMarkTaken'));
    ok('няма връзка', !btnOn(h, 'r-link', 'sdOpenReturnFor'));
    realClick(h.w, btnOn(h, 'r-link', 'sdMarkTaken'), '✅ Върната');
    await settle();
    ok('PATCH минава', sdPatches(h, 'r-link').length === 1);
    h.close();
  }

  section('6. Директно sdMarkTaken за свързан ред от обекта → отказ, 0 PATCH');
  {
    const h = await env(STORE);
    h.w.sdMarkTaken('r-link');
    await settle();
    ok('0 PATCH', sdPatches(h, 'r-link').length === 0, JSON.stringify(sdPatches(h, 'r-link')));
    ok('toast към „За връщане"', h.calls.toast.some(t => /За връщане → По разлики/.test(String(t))), h.calls.toast.join(' | '));
    h.close();
  }

  section('7. Надпис „✓ Върната дд.мм · от „За връщане““');
  {
    const h = await env(CVETI);
    const rs = rowOf(h, 'r-sync');
    const m = rs && rs.querySelector('[data-return-synced]');
    ok('редът от синхрона има надписа', !!m && m.textContent === '✓ Върната 26.11 · от „За връщане“', m && m.textContent);
    const rh = rowOf(h, 'r-hand');
    ok('ръчно отбелязаният — без надпис', !!rh && !rh.querySelector('[data-return-synced]'));
    ok('изравняването също носи надписа',
      /от „За връщане“/.test(h.w.sdReturnSyncedHtml(line({ status: 'taken', completed_by: 'За връщане (изравняване 26.11)' }))));
    ok('чакащ ред — без надпис', h.w.sdReturnSyncedHtml(line({ completed_by: 'За връщане' })) === '');
    h.close();
  }

  section('8. ✏️ не е заобиколен път (обект, свързан ред) — в двете посоки');
  {
    const h = await env(STORE);
    for (const [id, to] of [['r-link', 'taken'], ['r-sync', 'pending']]) {
      h.calls.patch.length = 0;
      h.w.openSDModal(id); await settle();
      const sel = h.doc.getElementById('sd-status'), ov = h.doc.getElementById('sd-ov');
      if (ok(id + ': модалът е отворен', !!sel && !!ov)) {
        ok(id + ': статусът е disabled', sel.disabled);
        ok(id + ': обяснение към „За връщане"', !!ov.querySelector('[data-return-locked]'));
        sel.disabled = false; sel.value = to;   /* подправен DOM */
        const save = Array.prototype.find.call(ov.querySelectorAll('button'), b => /Запази/.test(b.textContent));
        realClick(h.w, save, 'Запази'); await settle();
        const p = sdPatches(h, id)[0];
        if (ok(id + ': записът минава', !!p, h.calls.toast.join(' | '))) {
          ok(id + ': без status', !('status' in p.body), JSON.stringify(p.body));
          ok(id + ': без completed_by/at', !('completed_by' in p.body) && !('completed_at' in p.body), JSON.stringify(p.body));
        }
      }
      h.w.closeSDModal && h.w.closeSDModal();
    }
    h.close();
  }
  {
    const h = await env(CVETI);
    h.w.openSDModal('r-link'); await settle();
    const sel = h.doc.getElementById('sd-status');
    ok('офисът: статусът в ✏️ НЕ е заключен', !!sel && !sel.disabled);
    h.close();
  }

  report();
})();
