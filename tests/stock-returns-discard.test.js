/* „За връщане": „изхвърляте" в „Коментар контролер" → без снимка и куриер.
   (Точка 4 от Цвети.)

   При излизане от „Невзета" (Взета / Приключена) submitSR() изисква снимка на
   товарителницата, дата на изтегляне и куриер. Когато контролерът е написал
   стоката да се ИЗХВЪРЛИ, куриер и товарителница няма — остава само датата
   (на изхвърлянето). Разпознаването е по корена „изхвърл", без значение от
   главни/малки букви (srIsDiscard). wasProven и lockStatus не се пипат.

   Пускане:  node tests/stock-returns-discard.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, fire, ticks } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

function row(o) {
  return Object.assign({
    id: 'c-1', source: 'complaint', store_name: 'Раднево', supplier: 'КАМ-04',
    product_name: null, sap_code: null, quantity: null, order_number: null,
    purchase_order: '4200016266', id_euro: 'E-66', plant: '1210', doc_date: null,
    withdrawal_date: null, confirmed_date: null, expiry_date: null, status: 'pending',
    reason: null, courier_info: '', control_comment: '', controller_comment: '',
    diff_line_id: null, photos: [], created_by: 'Цветелина Тенева'
  }, o);
}

function env(r, tab) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    /* Селектът за магазин в модала се пълни от users.store_name. */
    data: { stock_returns: [r], stock_differences: [], differences_reports: [],
            users: [{ store_name: 'Раднево' }, { store_name: 'Враца' }] }
  });
  h.w.srData = [JSON.parse(JSON.stringify(r))];
  h.w.srTab = tab || r.source;
  h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.w.srPendingPhotos = [];
  h.w.loadAllSuppliers = () => Promise.resolve([]);
  h.w.renderStockReturns();
  return h;
}

/* Истински път: ✏️ на реда → модал → полетата → „Запази". */
async function editAndSave(h, id, fields) {
  const b = Array.from(h.doc.querySelectorAll('button[data-id="' + id + '"]'))
    .find(x => (x.getAttribute('onclick') || '').indexOf('openSRModal') >= 0);
  if (!b) throw new Error('няма ✏️ за ' + id);
  realClick(h.w, b);
  await ticks(); await ticks();
  Object.keys(fields).forEach(k => {
    const el = h.doc.getElementById(k);
    if (!el) throw new Error('липсва поле #' + k);
    el.value = fields[k];
    if (k === 'sr-status' || k === 'sr-ctrl') fire(h.w, el, k === 'sr-status' ? 'change' : 'input');
  });
  realClick(h.w, btn(h.doc.getElementById('sr-ov'), 'Запази'));
  await ticks(); await ticks();
}
const srPatches = h => h.calls.patch.filter(p => /stock_returns/.test(p.url));

(async function run() {

  section('а) „изхвърляте", Взета, без снимка и куриер, с дата → PATCH минава');
  {
    const h = env(row());
    {
      await editAndSave(h, 'c-1', { 'sr-status': 'taken', 'sr-ctrl': 'изхвърляте', 'sr-wdate': '2026-09-28' });
      await ticks(); await ticks();
      const p = srPatches(h)[0];
      if (ok('има PATCH', !!p, 'toast: ' + h.calls.toast.join(' | '))) {
        ok('статусът е taken', p.body.status === 'taken', JSON.stringify(p.body.status));
        ok('коментарът на контролера е записан без промяна', p.body.controller_comment === 'изхвърляте',
          JSON.stringify(p.body.controller_comment));
        ok('датата е записана', p.body.withdrawal_date === '2026-09-28', JSON.stringify(p.body.withdrawal_date));
      }
      ok('няма блокиращ toast', !h.calls.toast.some(t => /Липсва/.test(t)), h.calls.toast.join(' | '));
    }
  }

  section('б) „ИЗХВЪРЛЯЙТЕ" (главни) → също минава; и в „По разлики"');
  {
    for (const src of ['complaint', 'diff']) {
      const h = env(row({ source: src }));
      await editAndSave(h, 'c-1', { 'sr-status': 'taken', 'sr-ctrl': 'ИЗХВЪРЛЯЙТЕ', 'sr-wdate': '2026-09-28' });
      await ticks(); await ticks();
      ok(src + ': има PATCH', srPatches(h).length === 1, 'toast: ' + h.calls.toast.join(' | '));
    }
    const h = env(row());
    await editAndSave(h, 'c-1', { 'sr-status': 'completed', 'sr-ctrl': 'стоката е изхвърлена', 'sr-wdate': '2026-09-28' });
    await ticks(); await ticks();
    ok('„изхвърлена" + Приключена → минава', srPatches(h).length === 1, 'toast: ' + h.calls.toast.join(' | '));
  }

  section('в) „изхвърляте" без дата → блокира с toast за дата');
  {
    const h = env(row());
    await editAndSave(h, 'c-1', { 'sr-status': 'taken', 'sr-ctrl': 'изхвърляте', 'sr-wdate': '' });
    await ticks(); await ticks();
    ok('няма PATCH', srPatches(h).length === 0, JSON.stringify(srPatches(h).map(p => p.body)));
    const t = h.calls.toast.join(' | ');
    ok('toast-ът иска датата', /Изхвърляне/.test(t) && /дата на изхвърляне/.test(t), t);
    ok('и НЕ иска снимка или куриер', !/снимка/.test(t) && !/куриер/.test(t), t);
  }

  section('г) „ИЗПРАЩАЙТЕ" без снимка → блокира както досега');
  {
    const h = env(row());
    await editAndSave(h, 'c-1', { 'sr-status': 'taken', 'sr-ctrl': 'ИЗПРАЩАЙТЕ', 'sr-wdate': '2026-09-28',
      'sr-courier': 'Еконт 5300123' });
    await ticks(); await ticks();
    ok('няма PATCH', srPatches(h).length === 0, JSON.stringify(srPatches(h).map(p => p.body)));
    const t = h.calls.toast.join(' | ');
    ok('старото съобщение „Липсва товарителница — снимка…"',
      /^Липсва товарителница — снимка на товарителницата$/.test(h.calls.toast[h.calls.toast.length - 1] || ''), t);
    const h2 = env(row());
    await editAndSave(h2, 'c-1', { 'sr-status': 'taken', 'sr-ctrl': '', 'sr-wdate': '' });
    await ticks(); await ticks();
    const t2 = h2.calls.toast[h2.calls.toast.length - 1] || '';
    ok('празен коментар: иска трите, както досега',
      t2 === 'Липсва товарителница — снимка на товарителницата, дата на изтегляне, изтеглена от/с куриер', t2);
  }

  section('д) Подсказката сменя текста на живо (oninput на sr-ctrl и смяна на статус)');
  {
    const h = env(row());
    const b = Array.from(h.doc.querySelectorAll('button[data-id="c-1"]'))
      .find(x => (x.getAttribute('onclick') || '').indexOf('openSRModal') >= 0);
    realClick(h.w, b);
    await ticks(); await ticks();
    const hint = h.doc.getElementById('sr-photo-hint');
    const st = h.doc.getElementById('sr-status');
    const ctrl = h.doc.getElementById('sr-ctrl');
    if (ok('подсказката и полетата са в модала', !!(hint && st && ctrl))) {
      ok('при „Невзета" е скрита', hint.style.display === 'none', hint.style.display);
      st.value = 'taken'; fire(h.w, st, 'change');
      ok('при „Взета" се показва', hint.style.display === 'block', hint.style.display);
      ok('текстът е за товарителница', /Задължително/.test(hint.textContent), hint.textContent);
      ctrl.value = 'ИЗХВЪРЛЯЙТЕ'; fire(h.w, ctrl, 'input');
      ok('след писане „ИЗХВЪРЛЯЙТЕ" → „🗑️ Изхвърляне: нужна е само дата."',
        hint.textContent.trim() === '🗑️ Изхвърляне: нужна е само дата.', hint.textContent);
      ctrl.value = 'ИЗПРАЩАЙТЕ'; fire(h.w, ctrl, 'input');
      ok('след смяна на „ИЗПРАЩАЙТЕ" → обратно за товарителница', /Задължително/.test(hint.textContent), hint.textContent);
    }
    /* Отваряне на ред, в който „изхвърляте" вече е записано. */
    const h2 = env(row({ status: 'taken', controller_comment: 'изхвърляте' }));
    h2.w.openSRModal('c-1');
    await ticks(); await ticks();
    const hint2 = h2.doc.getElementById('sr-photo-hint');
    ok('при отваряне със записано „изхвърляте" текстът е за изхвърляне',
      hint2 && /Изхвърляне/.test(hint2.textContent), hint2 && hint2.textContent);
  }

  section('е) srIsDiscard');
  {
    const h = env(row());
    const f = h.w.srIsDiscard;
    [['изхвърляте', true], ['ИЗХВЪРЛЯЙТЕ', true], ['Изхвърлена', true], ['да се изхвърли', true],
     ['ИЗПРАЩАЙТЕ', false], ['', false], [null, false], [undefined, false]]
      .forEach(([v, exp]) => ok(JSON.stringify(v) + ' → ' + exp, f(v) === exp));
  }

  report();
})();
