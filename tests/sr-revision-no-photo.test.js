/* „За връщане": „заприходете с ревизия" в „Коментар контролер" → без снимка
   и куриер, само дата (05.11.2026; идея на Нина Ковачева, Склад Карлово;
   решение на Тенчо — без нов бутон). Същото изключение като за изхвърляне
   (srIsDiscard, 28.09.2026): srIsRevision по корените „ревизи" / „заприход",
   srProofExempt решава кое важи — при двете думи печели изхвърлянето.

   Какво заковава файлът (истински клик на „Запази"):
   а) „Заприходете с ревизия" + Взета + дата, без снимка и куриер → PATCH
   б) същото без дата → червен toast „Заприхождаване с ревизия — липсва дата
      на заприхождаване", 0 PATCH
   в) без дума за ревизия / изхвърляне → пак иска снимка и куриер
   г) „изхвърлете" → както досега; „изхвърлете … ревизия" → печели изхвърлянето
   д) заключен коментар (По рекламации, магазин) — решава ЗАПИСАНОТО, не
      подправеното поле, и в двете посоки
   е) подсказката под статуса — текстът за ревизия (на живо и при отваряне)
   ж) редакция на вече взет запис без снимка/куриер/дата → не се блокира (wasProven)

   Мутационна проверка (05.11.2026, всяка поотделно в stock-returns.js):
     1. махната проверката за ревизия (srProofExempt без srIsRevision)      → пада а), б), д), е) (11 ❌)
     2. ревизия чете полето вместо записаното при заключен коментар        → пада д) в двете посоки (4 ❌)
     3. махнато изискването за дата при ревизия                            → пада б) (2 ❌)
   И трите събарят теста (exit 1).

   Пускане:  node tests/sr-revision-no-photo.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, fire, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'kardzhali@temax.bg', display_name: 'Склад Кърджали', role: 'sklad', store_name: 'Кърджали', assigned_stores: [] };

function row(o) {
  return Object.assign({
    id: 'r-1', source: 'diff', store_name: 'Кърджали', supplier: 'ЕЛМАК ЕООД',
    product_name: 'Смесител', sap_code: '19676', quantity: 1, order_number: null,
    purchase_order: null, id_euro: null, plant: null, doc_date: null,
    withdrawal_date: null, confirmed_date: null, expiry_date: null, status: 'pending',
    reason: null, courier_info: '', control_comment: '', controller_comment: '',
    store_comment: null, diff_line_id: null, photos: [], created_by: 'Цветелина Тенева'
  }, o);
}

function env(user, r) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: { stock_returns: [r], stock_differences: [], differences_reports: [],
            users: [{ store_name: 'Кърджали' }, { store_name: 'Враца' }] }
  });
  h.w.srData = [JSON.parse(JSON.stringify(r))];
  h.w.srTab = r.source;
  h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.w.srPendingPhotos = [];
  h.w.loadAllSuppliers = () => Promise.resolve(['ЕЛМАК ЕООД']);
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ m: String(m), c: c }); return orig(m, c); };
  h.w.renderStockReturns();
  return h;
}
const settle = async () => { for (let i = 0; i < 6; i++) await ticks(); };
async function openEdit(h, id) {
  const b = Array.from(h.doc.querySelectorAll('#mod-stock-returns button[data-id="' + id + '"]'))
    .find(x => (x.getAttribute('onclick') || '').indexOf('openSRModal') >= 0);
  if (!b) throw new Error('няма ✏️ за ' + id);
  realClick(h.w, b);
  await settle();
}
/* Полетата → „Запази". sr-ctrl / sr-status — със събитие, както от човек. */
async function editAndSave(h, fields) {
  await openEdit(h, 'r-1');
  Object.keys(fields).forEach(k => {
    const el = h.doc.getElementById(k);
    if (!el) throw new Error('липсва поле #' + k);
    if (k === 'sr-ctrl') el.readOnly = false;   /* при заключен — подправяне на DOM */
    el.value = fields[k];
    if (k === 'sr-status') fire(h.w, el, 'change');
    if (k === 'sr-ctrl') fire(h.w, el, 'input');
  });
  realClick(h.w, btn(h.doc.getElementById('sr-ov'), 'Запази'));
  await settle();
}
const srPatches = h => h.calls.patch.filter(p => /stock_returns/.test(p.url));
const lastToast = h => h.toasts[h.toasts.length - 1] || { m: '' };
const RED = '#dc2626';

(async function run() {

  section('а) „Заприходете с ревизия" + Взета + дата, без снимка и куриер → записва');
  {
    const h = env(CVETI, row());
    await editAndSave(h, { 'sr-status': 'taken', 'sr-ctrl': 'Заприходете с ревизия', 'sr-wdate': '2026-11-05', 'sr-courier': '' });
    const p = srPatches(h)[0];
    if (ok('има PATCH', !!p, h.toasts.map(t => t.m).join(' | '))) {
      ok('status = taken, датата е записана', p.body.status === 'taken' && p.body.withdrawal_date === '2026-11-05', JSON.stringify(p.body));
      ok('коментарът на контролера — без промяна', p.body.controller_comment === 'Заприходете с ревизия', JSON.stringify(p.body.controller_comment));
    }
    ok('няма червен toast', !h.toasts.some(t => t.c === RED), h.toasts.map(t => t.m).join(' | '));
    h.close();
    for (const txt of ['ЗАПРИХОДЕТЕ НА РЕВИЗИЯ.', 'ревизия', 'заприходена']) {
      const h2 = env(CVETI, row());
      await editAndSave(h2, { 'sr-status': 'completed', 'sr-ctrl': txt, 'sr-wdate': '2026-11-05' });
      ok('„' + txt + '" + Приключена → PATCH', srPatches(h2).length === 1, h2.toasts.map(t => t.m).join(' | '));
      h2.close();
    }
  }

  section('б) Ревизия без дата → червен toast за дата на заприхождаване, 0 PATCH');
  {
    const h = env(CVETI, row());
    await editAndSave(h, { 'sr-status': 'taken', 'sr-ctrl': 'Заприходете с ревизия', 'sr-wdate': '' });
    ok('няма PATCH', srPatches(h).length === 0, JSON.stringify(srPatches(h).map(p => p.body)));
    const t = lastToast(h);
    ok('червен toast „Заприхождаване с ревизия — липсва дата на заприхождаване"',
      t.c === RED && t.m === 'Заприхождаване с ревизия — липсва дата на заприхождаване', JSON.stringify(t));
    h.close();
  }

  section('в) Без ревизия / изхвърляне → пак снимка и куриер');
  {
    const h = env(CVETI, row());
    await editAndSave(h, { 'sr-status': 'taken', 'sr-ctrl': 'КЪМ ЛС ТЪРГОВИЩЕ', 'sr-wdate': '' });
    ok('няма PATCH', srPatches(h).length === 0);
    ok('иска трите, както досега', lastToast(h).m === 'Липсва товарителница — снимка на товарителницата, дата на изтегляне, изтеглена от/с куриер', lastToast(h).m);
    h.close();
  }

  section('г) Изхвърляне — както досега; и двете думи → изхвърлянето');
  {
    const h = env(CVETI, row());
    await editAndSave(h, { 'sr-status': 'taken', 'sr-ctrl': 'изхвърлете', 'sr-wdate': '' });
    ok('„изхвърлете" без дата → „Изхвърляне — липсва дата на изхвърляне"', lastToast(h).m === 'Изхвърляне — липсва дата на изхвърляне', lastToast(h).m);
    h.close();
    const h2 = env(CVETI, row());
    await editAndSave(h2, { 'sr-status': 'taken', 'sr-ctrl': 'Изхвърлете и заприходете с ревизия', 'sr-wdate': '' });
    ok('и двете думи → съобщението е за изхвърляне', lastToast(h2).m === 'Изхвърляне — липсва дата на изхвърляне', lastToast(h2).m);
    ok('srProofExempt: и двете → discard', h2.w.srProofExempt('Изхвърлете и заприходете с ревизия') === 'discard');
    h2.close();
  }

  section('д) Заключен коментар (По рекламации, магазин) — решава записаното');
  {
    /* Записано „Заприходете с ревизия", магазинът изтрива полето → пак минава само с дата. */
    const h = env(STORE, row({ source: 'complaint', controller_comment: 'Заприходете с ревизия' }));
    await openEdit(h, 'r-1');
    ok('полето е заключено за магазина', h.doc.getElementById('sr-ctrl').readOnly === true);
    ok('подсказката при отваряне е за ревизия', /Заприхождаване с ревизия/.test(h.doc.getElementById('sr-photo-hint').textContent));
    h.w.closeSRModal();
    await editAndSave(h, { 'sr-status': 'taken', 'sr-ctrl': '', 'sr-wdate': '2026-11-05' });
    const p = srPatches(h)[0];
    ok('записано „ревизия", подправено празно поле → PATCH само с дата', !!p && p.body.status === 'taken', h.toasts.map(t => t.m).join(' | '));
    ok('и не праща controller_comment', !!p && !('controller_comment' in p.body));
    h.close();
    /* Обратното: записано „КЪМ ЛС", магазинът подправя на „заприходете с ревизия" → снимката пак се иска. */
    const h2 = env(STORE, row({ source: 'complaint', controller_comment: 'КЪМ ЛС ТЪРГОВИЩЕ' }));
    await editAndSave(h2, { 'sr-status': 'taken', 'sr-ctrl': 'заприходете с ревизия', 'sr-wdate': '2026-11-05' });
    ok('подправено „ревизия" → няма PATCH', srPatches(h2).length === 0);
    ok('искат се снимка и куриер', /^Липсва товарителница — снимка на товарителницата, изтеглена от\/с куриер$/.test(lastToast(h2).m), lastToast(h2).m);
    h2.close();
  }

  section('е) Подсказката под статуса');
  {
    const h = env(CVETI, row());
    await openEdit(h, 'r-1');
    const hint = h.doc.getElementById('sr-photo-hint'), st = h.doc.getElementById('sr-status'), ctrl = h.doc.getElementById('sr-ctrl');
    st.value = 'taken'; fire(h.w, st, 'change');
    ok('по подразбиране — за товарителница', /Задължително/.test(hint.textContent), hint.textContent);
    ctrl.value = 'Заприходете с ревизия'; fire(h.w, ctrl, 'input');
    ok('„Заприходете с ревизия" → текстът за ревизия',
      hint.textContent.trim() === '📋 Заприхождаване с ревизия: нужна е само дата на заприхождаване — без снимка на товарителница и без куриер.', hint.textContent);
    ctrl.value = 'ИЗХВЪРЛЯЙТЕ'; fire(h.w, ctrl, 'input');
    ok('„ИЗХВЪРЛЯЙТЕ" → за изхвърляне (непроменено)', hint.textContent.trim() === '🗑️ Изхвърляне: нужна е само дата.', hint.textContent);
    h.close();
    const h2 = env(CVETI, row({ status: 'taken', controller_comment: 'Заприходете на ревизия.' }));
    h2.w.openSRModal('r-1'); await settle();
    const hint2 = h2.doc.getElementById('sr-photo-hint');
    ok('при отваряне със записана „ревизия" — текстът за ревизия', !!hint2 && /Заприхождаване с ревизия/.test(hint2.textContent), hint2 && hint2.textContent);
    h2.close();
  }

  section('ж) Редакция на вече взет запис — не се блокира (wasProven)');
  {
    const h = env(CVETI, row({ status: 'taken', controller_comment: '' }));
    await editAndSave(h, { 'sr-status': 'completed', 'sr-ctrl': 'КЪМ ЛС', 'sr-wdate': '', 'sr-courier': '' });
    ok('PATCH без снимка, дата и куриер', srPatches(h).length === 1 && srPatches(h)[0].body.status === 'completed', h.toasts.map(t => t.m).join(' | '));
    h.close();
  }

  section('з) srIsRevision');
  {
    const h = env(CVETI, row());
    [['Заприходете с ревизия', true], ['ЗАПРИХОДЕТЕ', true], ['ревизия', true], ['РЕВИЗИЯТА', true], ['заприходена', true],
     ['КЪМ ЛС', false], ['изхвърлете', false], ['', false], [null, false], [undefined, false]]
      .forEach(([v, exp]) => ok(JSON.stringify(v) + ' → ' + exp, h.w.srIsRevision(v) === exp));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
