/* Разлики → За връщане: запис, създаден ОТ ОБЕКТА, се брои за актуализиран (08.10.2026).

   Троян, 07.10.2026: обектът подаде разлика (тип „Връщане") в 17:23, автоматично
   се създаде запис в stock_returns с confirmed_date=NULL и тригерът изтри вече
   поставената отметка на „Изтегляне по разлики". Сега autoCreateReturnFromDiff
   записва confirmed_date=днес, confirmed_by='store:<обект>', confirmed_at —
   САМО когато потребителят е от обекта на реда (srConfirmedActor). Офисът (Цвети,
   ↩️ „Добави в За връщане", импортите) не получава следа.

   Пускане:  node tests/sr-created-by-store.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'radnevo@temax.bg', display_name: 'Склад Раднево', role: 'sklad', store_name: 'Раднево', assigned_stores: [] };
const FAIL_MSG = 'Редът е решен като Връщане, но НЕ е добавен в „За връщане" — опитай пак';

const REP = { id: 'rep-1', direction: 'supplier', store_name: 'Раднево', counterpart: 'ТЕСИ ООД', document_number: '180486328',
  photos: [], reviewed: false, created_at: '2026-09-28T09:00:00.000Z' };
const REP_OLD = Object.assign({}, REP, { id: 'rep-old', reviewed: true, created_at: '2026-08-17T09:00:00.000Z' });
function line(o) {
  return Object.assign({ id: 'l-new', report_id: 'rep-1', store_name: 'Раднево', supplier: 'ТЕСИ ООД', material_code: '111',
    material_name: 'ЛАЙСНА', quantity: 3, quantity_received: 5, difference_category: 'excess', type: null, status: 'new',
    order_number: '4100135756', return_order_number: null, comment: null, resolution_comment: null, attachments: [],
    credit_note_issued: false, warehouse_response: null, store_response: null, created_at: '2026-09-28T09:00:00.000Z' }, o);
}
/* Ред отпреди: решен като „Връщане" на 17.08, без запис в „За връщане". */
const OLD = line({ id: 'l-old', report_id: 'rep-old', material_name: 'ПЛАНКА ЪГЛОВА', type: 'return', status: 'taken',
  created_at: '2026-08-17T09:00:00.000Z' });

function env(user, opts) {
  opts = opts || {};
  let h;
  const baseLines = [line(), OLD];
  const lines = () => baseLines.map(l => {
    const o = Object.assign({}, l);
    (h ? h.calls.patch : []).filter(p => p.table === 'stock_differences' && p.url.indexOf('id=eq.' + l.id) >= 0)
      .forEach(p => Object.assign(o, p.body));
    return o;
  });
  const returns = () => (h ? h.calls.post : []).filter(p => p.table === 'stock_returns' && !opts.postFail)
    .map((p, i) => Object.assign({ id: 'sr-' + i }, p.body));
  h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'], user: user, confirm: true, fail: opts.fail,
    data: {
      stock_differences: () => lines(),
      differences_reports: [REP, REP_OLD],
      stock_returns: (url) => {
        const all = returns();
        const eq = /diff_line_id=eq\.([^&]+)/.exec(url);
        if (eq) return all.filter(r => r.diff_line_id === decodeURIComponent(eq[1]));
        const inn = /diff_line_id=in\.\(([^)]*)\)/.exec(url);
        if (inn) { const ids = decodeURIComponent(inn[1]).split(','); return all.filter(r => ids.indexOf(r.diff_line_id) >= 0); }
        return all;
      },
      stock_diff_swaps: [], transport_orders: [], users: [], stores: [], contacts: []
    }
  });
  if (opts.throwPost) {
    const realFetch = h.w.fetch;
    h.w.fetch = function (url, o) {
      if (/stock_returns/.test(String(url)) && o && o.method === 'POST') return Promise.reject(new Error('мрежата падна'));
      return realFetch.apply(this, arguments);
    };
  }
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'supplier'; h.w.sdShowDone = {};
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  h.w.loadStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 12; i++) await ticks(); };
const mod = h => h.doc.getElementById('mod-stock-diff');
const srPosts = h => h.calls.post.filter(p => p.table === 'stock_returns');
const lastToast = h => String(h.calls.toast[h.calls.toast.length - 1] || '');
/* Маркерът и „Добави в За връщане“ са на РЕДА (изглед „Редове“); „↩️ Връщане“ е в КАРТАТА на новата бланка (изглед „Бланки“). */
const viewIs = (h, v) => { if (h.w.sdView !== v) h.w.setSDView(v); };
const markers = (h, id) => (viewIs(h, 'rows'), Array.prototype.filter.call(mod(h).querySelectorAll('[data-return-missing]'),
  m => { const tr = m.closest('tr'); return tr && tr.querySelector('[data-id="' + id + '"]'); }));
const addBtns = (h, id) => (viewIs(h, 'rows'), Array.prototype.filter.call(mod(h).querySelectorAll('button[data-id="' + id + '"]'),
  b => /sdAddMissingReturn/.test(b.getAttribute('onclick') || '')));
const returnBtn = (h, id) => (viewIs(h, 'reports'), Array.prototype.find.call(mod(h).querySelectorAll('button[data-id="' + id + '"]'),
  b => /resolveDiffLine/.test(b.getAttribute('onclick') || '') && /'return'/.test(b.getAttribute('onclick') || '')));

/* Обектът няма бутон „↩️ Връщане" в картата — решава през функцията, която
   викат бутоните (resolveDiffLine), или през модала ✏️ (submitSD). И двата пътя
   създават записа през autoCreateReturnFromDiff. */
async function storeResolve(h) {
  await settle();
  h.w.resolveDiffLine('l-new', 'return');
  await settle();
  return true;
}
async function modalToReturn(h) {
  await settle();
  h.w.openSDModal('l-new');
  await ticks();
  const sel = h.doc.getElementById('sd-type');
  if (!sel) return false;
  sel.value = 'return';
  realClick(h.w, btn(h.doc, 'Запази'));
  await settle();
  return true;
}
async function resolveAsReturn(h) {
  await settle();
  const b = returnBtn(h, 'l-new');
  if (!ok('бутонът „↩️ Връщане" на новия ред е на екрана', !!b)) return false;
  realClick(h.w, b);
  await settle();
  return true;
}

const TROYAN = { email: 'sklad.troyan@temax.bg', display_name: 'Склад Троян', role: 'sklad', store_name: 'Троян', assigned_stores: [] };
const confBody = h => { const p = srPosts(h); return p.length ? p[p.length - 1].body : null; };
const HAS_TRACE = b => !!b && ('confirmed_date' in b || 'confirmed_by' in b || 'confirmed_at' in b);

(async function run() {

  section('1. Бутоните на реда (resolveDiffLine) са само за офиса — обектът решава през МОДАЛА');
  {
    const h = env(STORE);
    await storeResolve(h);
    ok('обектът през resolveDiffLine е отказан: нула POST', srPosts(h).length === 0, String(srPosts(h).length));
    ok('и казва защо', h.calls.toast.some(t => /Нямаш права/.test(String(t))), h.calls.toast.join(' | '));
    h.close();
  }

  section('1б. Обектът през МОДАЛА ✏️ (submitSD) — реалният път на Троян → следа от обекта');
  {
    const h = env(STORE);
    if (ok('модалът е записан', await modalToReturn(h))) {
      const b = confBody(h);
      if (ok('един POST към stock_returns', srPosts(h).length === 1, String(srPosts(h).length))) {
        ok('confirmed_by = store:Раднево', b.confirmed_by === 'store:Раднево', String(b.confirmed_by));
        ok('confirmed_date = днес', b.confirmed_date === h.w.today(), String(b.confirmed_date));
        ok('confirmed_at е ISO момент от днес',
          typeof b.confirmed_at === 'string' && b.confirmed_at.slice(0, 10) === new Date().toISOString().slice(0, 10), String(b.confirmed_at));
        ok('редът си остава pending / source=diff / diff_line_id',
          b.status === 'pending' && b.source === 'diff' && b.diff_line_id === 'l-new', JSON.stringify(b));
        ok('следата е СЪЩАТА, която би поставила ръчната форма (srConfirmedActor)',
          b.confirmed_by === h.w.srConfirmedActor('Раднево'));
      }
    }
    h.close();
  }

  section('2. Офисът решава същия ред → БЕЗ следа (обектът трябва да го актуализира сам)');
  {
    const h = env(CVETI);
    if (await resolveAsReturn(h)) {
      const b = confBody(h);
      ok('един POST', srPosts(h).length === 1);
      ok('без confirmed_date / confirmed_by / confirmed_at', !HAS_TRACE(b), JSON.stringify(b));
      ok('останалите полета са както преди', b.status === 'pending' && b.source === 'diff' && b.store_name === 'Раднево');
    }
    h.close();
  }

  section('3. Офисът ↩️ „Добави в За връщане" (стар ред) → БЕЗ следа');
  {
    const h = env(CVETI);
    await settle();
    const b0 = addBtns(h, 'l-old')[0];
    if (ok('бутонът го има', !!b0)) {
      realClick(h.w, b0);
      await settle();
      const b = confBody(h);
      ok('един POST за l-old', srPosts(h).length === 1 && b.diff_line_id === 'l-old', JSON.stringify(srPosts(h).map(x => x.body)));
      ok('без следа', !HAS_TRACE(b), JSON.stringify(b));
    }
    h.close();
  }

  section('4. Потребител на ДРУГ обект създава за чужд ред → БЕЗ следа');
  {
    const h = env(TROYAN);
    await settle();
    const l = h.w.sdData.find(x => x.id === 'l-new');
    let err = 'не е извикан';
    h.w.autoCreateReturnFromDiff(l, e => { err = e; });
    await settle();
    ok('записът е създаден (cb(null))', err === null, String(err));
    ok('без следа — редът е на Раднево, а потребителят е от Троян', !HAS_TRACE(confBody(h)), JSON.stringify(confBody(h)));
    h.close();
  }

  section('5. Липсва srConfirmedActor (модулът не е зареден) → записът пак се създава, без следа');
  {
    const h = env(STORE);
    await settle();
    h.w.srConfirmedActor = undefined;
    const l = h.w.sdData.find(x => x.id === 'l-new');
    let err = 'не е извикан';
    h.w.autoCreateReturnFromDiff(l, e => { err = e; });
    await settle();
    ok('cb(null)', err === null, String(err));
    ok('без следа, без изключение', srPosts(h).length === 1 && !HAS_TRACE(confBody(h)), JSON.stringify(confBody(h)));
    h.close();
  }

  section('6. Правилото е по обекта на РЕДА, не по ролята');
  {
    /* Управител на Раднево (не склад) — пак „обектът". */
    const MGR = Object.assign({}, STORE, { role: 'manager', display_name: 'Управител Раднево' });
    const h = env(MGR);
    if (await modalToReturn(h)) {
      ok('управителят на обекта = store:Раднево', confBody(h).confirmed_by === 'store:Раднево', String(confBody(h).confirmed_by));
    }
    h.close();
  }

  section('7. Съществуващ запис по diff_line_id → нов POST няма (и следа не се пише отгоре)');
  {
    const h = env(STORE);
    await settle();
    const l = h.w.sdData.find(x => x.id === 'l-new');
    h.w.autoCreateReturnFromDiff(l, () => {});
    await settle();
    const first = srPosts(h).length;
    h.w.autoCreateReturnFromDiff(l, () => {});
    await settle();
    ok('повторното извикване не праща втори POST', first === 1 && srPosts(h).length === 1, first + ' / ' + srPosts(h).length);
    h.close();
  }

  report();
})();
