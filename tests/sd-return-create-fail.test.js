/* Разлики → За връщане: автоматичният запис не се проваля тихо (02.10.2026).

   Цвети спира ръчния файл „По разлики" и разчита само на
   autoCreateReturnFromDiff(). Досега тя поглъщаше грешките (.catch → cb(), а
   sbPost с !ok изобщо не се проверяваше) — CLAUDE.md т.13. В базата стоят 4
   реда тип „Връщане" без запис в stock_returns (Раднево, 05–19.08.2026).

   Сега:
     · провалена проверка или POST (и отговор с !ok) → червен toast
       „Редът е решен като Връщане, но НЕ е добавен…" — ПОСЛЕДЕН, след
       „✅ Записано!"; решението остава записано;
     · ред тип „Връщане" без запис по diff_line_id (по ДАННИТЕ) показва
       „⚠️ Няма в За връщане" + „↩️ Добави в За връщане" (само canReviewDiff);
     · бутонът не дублира — нито при двоен клик, нито при повторен;
     · двете места, които викат функцията (бутонът „↩️ Връщане" и модалът
       ✏️), реагират еднакво.

   „Базата" тук помни PATCH-овете по stock_differences и POST-овете в
   stock_returns, за да се види маркерът след истинското презареждане.

   Пускане:  node tests/sd-return-create-fail.test.js .
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
const markers = (h, id) => Array.prototype.filter.call(mod(h).querySelectorAll('[data-return-missing]'),
  m => { const tr = m.closest('tr'); return tr && tr.querySelector('[data-id="' + id + '"]'); });
const addBtns = (h, id) => Array.prototype.filter.call(mod(h).querySelectorAll('button[data-id="' + id + '"]'),
  b => /sdAddMissingReturn/.test(b.getAttribute('onclick') || ''));
const returnBtn = (h, id) => Array.prototype.find.call(mod(h).querySelectorAll('button[data-id="' + id + '"]'),
  b => /resolveDiffLine/.test(b.getAttribute('onclick') || '') && /'return'/.test(b.getAttribute('onclick') || ''));

async function resolveAsReturn(h) {
  await settle();
  const b = returnBtn(h, 'l-new');
  if (!ok('бутонът „↩️ Връщане" на новия ред е на екрана', !!b)) return false;
  realClick(h.w, b);
  await settle();
  return true;
}

(async function run() {

  section('1. POST с !ok → червен toast (последен) и маркер на реда');
  {
    const h = env(CVETI, { fail: { POST: /stock_returns/ }, postFail: true });
    if (await resolveAsReturn(h)) {
      ok('решението е записано (PATCH type=return)', h.calls.patch.some(p => p.table === 'stock_differences' && p.body.type === 'return'));
      ok('POST към stock_returns е опитан', srPosts(h).length === 1);
      ok('последният toast е червеният', lastToast(h) === FAIL_MSG, h.calls.toast.join(' | '));
      ok('редът показва „⚠️ Няма в За връщане"', markers(h, 'l-new').length > 0);
      ok('и „↩️ Добави в За връщане"', addBtns(h, 'l-new').length > 0);
    }
    h.close();
  }

  section('2. POST хвърля (мрежа) → същото');
  {
    const h = env(CVETI, { throwPost: true, postFail: true });
    if (await resolveAsReturn(h)) {
      ok('последният toast е червеният', lastToast(h) === FAIL_MSG, h.calls.toast.join(' | '));
      ok('редът показва маркера', markers(h, 'l-new').length > 0);
    }
    h.close();
  }

  section('3. Провалена проверка (GET) → червен toast, без POST');
  {
    const h = env(CVETI, { fail: { GET: /stock_returns\?select=id&diff_line_id=eq/ } });
    if (await resolveAsReturn(h)) {
      ok('без POST (не знаем дали вече има запис)', srPosts(h).length === 0);
      ok('последният toast е червеният', lastToast(h) === FAIL_MSG, h.calls.toast.join(' | '));
    }
    h.close();
  }

  section('4. Успех → един POST, без маркер');
  {
    const h = env(CVETI);
    if (await resolveAsReturn(h)) {
      const p = srPosts(h);
      ok('един POST с diff_line_id = l-new', p.length === 1 && p[0].body.diff_line_id === 'l-new', JSON.stringify(p.map(x => x.body)));
      ok('без червен toast', h.calls.toast.indexOf(FAIL_MSG) < 0, h.calls.toast.join(' | '));
      ok('редът е без маркер', markers(h, 'l-new').length === 0);
    }
    h.close();
  }

  section('5. Стар ред без запис: маркер и бутон; бутонът не дублира');
  {
    const h = env(CVETI);
    await settle();
    ok('старият ред показва „⚠️ Няма в За връщане" (по данните)', markers(h, 'l-old').length > 0);
    const b = addBtns(h, 'l-old')[0];
    if (ok('„↩️ Добави в За връщане" е на реда', !!b)) {
      realClick(h.w, b);
      realClick(h.w, b);            /* двоен клик, докато първият тече */
      await settle();
      const p = srPosts(h).filter(x => x.body.diff_line_id === 'l-old');
      ok('двоен клик → един POST', p.length === 1, JSON.stringify(p.map(x => x.body)));
      ok('зелен toast', lastToast(h) === '✅ Добавено в „За връщане"', lastToast(h));
      ok('маркерът е изчезнал', markers(h, 'l-old').length === 0);
      h.w.sdAddMissingReturn('l-old');   /* повторен опит отвън */
      await settle();
      ok('повторен опит → пак един POST (има запис по diff_line_id)',
        srPosts(h).filter(x => x.body.diff_line_id === 'l-old').length === 1);
    }
    h.close();
  }

  section('6. Магазин: вижда маркера, не вижда бутона; директно → отказ');
  {
    const h = env(STORE);
    await settle();
    ok('магазин: маркерът е на стария ред', markers(h, 'l-old').length > 0);
    ok('магазин: бутон „Добави в За връщане" няма', addBtns(h, 'l-old').length === 0);
    h.w.sdAddMissingReturn('l-old');
    await settle();
    ok('магазин: директно извикване → без POST', srPosts(h).length === 0);
    h.close();
  }

  section('7. Проверката за връзките пада → маркер не се показва (не лъже)');
  {
    const h = env(CVETI, { fail: { GET: /stock_returns\?select=diff_line_id/ } });
    await settle();
    ok('без маркер, щом не знаем', markers(h, 'l-old').length === 0);
    h.close();
  }

  section('8. Модалът ✏️ реагира еднакво');
  {
    const h = env(CVETI, { fail: { POST: /stock_returns/ }, postFail: true });
    await settle();
    h.w.openSDModal('l-new');
    await settle();
    const t = h.doc.getElementById('sd-type');
    if (ok('модалът е отворен', !!t)) {
      t.value = 'return';
      /* Селектът „Магазин" за Цвети се пълни от users — тук е празен. */
      const st = h.doc.getElementById('sd-store');
      if (st.tagName === 'SELECT') { st.innerHTML = '<option>Раднево</option>'; st.value = 'Раднево'; }
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await settle();
      ok('PATCH на реда с type=return', h.calls.patch.some(p => p.table === 'stock_differences' && p.body.type === 'return'));
      ok('последният toast е червеният (след „✅ Записано!")', lastToast(h) === FAIL_MSG, h.calls.toast.join(' | '));
      ok('редът показва маркера', markers(h, 'l-new').length > 0);
    }
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
