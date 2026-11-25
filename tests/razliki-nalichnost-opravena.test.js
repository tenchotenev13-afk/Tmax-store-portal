/* Разлики, етап 6б — „✅ Наличността е оправена — пуснете заявката пак“
   (решения т.4 от срещата 12.11.2026; писмо на Миглена 20.10 — задънена улица).

   Складът е отговорил „📝 Пуснете заявка ZSTR тип 4“ (return), обектът —
   „⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА“ (no_stock) → „Ход: ЦО“ и складът нямаше бутон.
   1. Бутонът — само складът на бланката, само на return + no_stock; не на
      return без отговор, насочен, received, отворена размяна. Обект, admin,
      ЦО, чужд склад — не. Проверката гледа само <button>.
   2. Реален клик → модал → потвърждение → точно един PATCH: store_response*
      → null, warehouse_comment = досегашният + нов ред, warehouse_response не
      се праща. С и без коментар на обекта / склада / модала.
   3. След записа: при обекта двата бутона и „Ход: обекта“; ЦО пак има
      „✅ Приключи“. Push до обекта; провал на push → жълт toast.
   4. Провален PATCH → червен toast, редът в паметта — непокътнат, 0 push.

   Мутационна проверка (19.11.2026, мутант върху stock-differences.js, файлът —
   върнат от копие и сверен с cmp; чистият код: exit 0, 59/59):
     М1  бутонът и при return без no_stock                         → 4 ❌
     М2  warehouse_comment се презаписва вместо дописва            → 1 ❌
     М3  store_response не се нулира                               → 8 ❌
   Всички — exit 1.

   Пускане:  node tests/razliki-nalichnost-opravena.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';
const STORE = 'Карлово';
const U = {
  admin:   { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  migl:    { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  wh:      { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH },
  wh2:     { id: 'u-wh2', email: 'wh2@temax.bg', display_name: 'Склад Пловдив', role: 'logistics', store_name: 'Логистичен склад Пловдив' },
  store:   { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: STORE }
};
const DBU = [
  { id: 'u-adm', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-mp', notify_groups: ['controlling', 'razliki_co'], is_regional: false, assigned_stores: [] },
  { id: 'u-wh', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-wh2', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-st', notify_groups: [], is_regional: false, assigned_stores: [] }
];
const REP = { id: 'r1', direction: 'interstore', store_name: STORE, counterpart: WH, document_number: 'Dr1', doc_date: '2026-11-17',
  submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' };
const line = (id, cat, extra) => Object.assign({ id, report_id: 'r1', store_name: STORE, supplier: WH, material_code: 'S' + id,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр', difference_category: cat, type: null, status: 'new',
  warehouse_response: null, store_response: null, attachments: [] }, extra || {});

const NS = { warehouse_response: 'return', store_response: 'no_stock', store_response_by: 'Карлово',
  store_response_at: '2026-10-20T09:00:00Z', store_response_comment: 'SAP отказва — наличност 0', warehouse_comment: 'Пуснете ZSTR' };
const L = {
  f1: line('f1', 'excess', NS),                                                    /* ДА */
  f2: line('f2', 'excess', { warehouse_response: 'return', store_response: 'no_stock', store_response_at: '2026-10-21T09:00:00Z' }), /* ДА, без коментари */
  a1: line('a1', 'excess', { warehouse_response: 'return' }),                      /* return без отговор */
  a2: line('a2', 'excess', { warehouse_response: 'return', store_response: 'sap_done' }),
  a3: line('a3', 'excess', Object.assign({}, NS, { status: 'received', completed_by: 'ЦО', completed_at: '2026-11-01T10:00:00Z' })),
  a4: line('a4', 'excess', Object.assign({}, NS)),                                 /* с отворена размяна */
  a5: line('a5', 'pack_mismatch'),                                                 /* насочен по 5а */
  a6: line('a6', 'excess', { warehouse_response: 'will_send', store_response: 'no_stock' })
};
const ALL = Object.keys(L).map(k => L[k]);
const SWAPS = [{ id: 'sw1', from_line_id: 'zz', to_line_id: 'a4', from_store: 'Пловдив', to_store: STORE, warehouse: WH, status: 'linked', created_at: '2026-11-17T09:00:00Z' }];

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const clone = x => JSON.parse(JSON.stringify(x));

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true, fail: opts.fail,
    data: {
      stock_differences: clone(opts.lines || ALL), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: clone(SWAPS), users: DBU, contacts: [],
      differences_reports: [clone(REP)], storno_notes: [], storno_note_replies: []
    }
  });
  h.push = [];
  h.w.pushInterstoreDiff = (target, title, msg) => { h.push.push({ target, title, msg }); return Promise.resolve({ ok: !opts.pushFail }); };
  return h;
}
async function render(h, lines) {
  h.w.sdData = clone(lines || ALL);
  h.w.diffReports = [clone(REP)];
  h.w.sdSwaps = clone(SWAPS);
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'interstore'; h.w.sdView = 'reports';
  h.w.sdShowDone = { r1: true };
  await h.w.sdLoadMe(); await settle();
  h.w.renderStockDiff();
}
const row = (h, id) => {
  const rows = h.doc.querySelectorAll('[id^="diff-rep-"] tr');
  return Array.prototype.find.call(rows, tr => { const td = tr.querySelectorAll('td')[1]; return td && td.textContent.replace(/[^\wА-я ]/g, '').trim() === 'АРТ ' + id; }) || null;
};
/* Само <button> — заглавието на модала и надписите не се броят. */
const fixBtn = (h, id) => {
  const r = row(h, id);
  return r ? Array.prototype.find.call(r.querySelectorAll('button'), b => /Наличността е оправена/.test(b.textContent)) || null : null;
};
const btnTexts = (h, id) => { const r = row(h, id); return r ? Array.prototype.map.call(r.querySelectorAll('button'), b => b.textContent.trim()) : []; };
const turn = (h, id) => { const r = row(h, id); const t = r ? r.querySelector('.sd-turn') : null; return t ? t.textContent : null; };
const toasts = h => h.calls.toast.join(' | ');
const sdPatches = h => h.calls.patch.filter(x => x.table === 'stock_differences');

(async function run() {

  section('0. Редовете се намират');
  {
    const h = env(U.wh);
    await render(h);
    /* a5 е насочен по 5а — складът не го вижда (решение на Тенчо 22.11.2026,
       razliki-co-findings т.2). */
    Object.keys(L).filter(id => id !== 'a5').forEach(id => ok('ред ' + id + ' е в картата', !!row(h, id)));
    ok('насоченият a5 НЕ е в картата на склада', !row(h, 'a5'));
    h.close();
  }

  section('1. Кой и на кои редове вижда бутона');
  {
    const h = env(U.wh);
    await render(h);
    ok('склад: f1 (return + no_stock, с коментари) — ДА', !!fixBtn(h, 'f1'));
    ok('склад: f2 (return + no_stock, без коментари) — ДА', !!fixBtn(h, 'f2'));
    ok('склад: a1 (return без отговор на обекта) — не', !fixBtn(h, 'a1'), btnTexts(h, 'a1').join(' / '));
    ok('склад: a2 (return + sap_done) — не', !fixBtn(h, 'a2'));
    ok('склад: a3 (received) — не', !fixBtn(h, 'a3'));
    ok('склад: a4 (отворена размяна) — не', !fixBtn(h, 'a4'));
    ok('склад: a5 (насочен по 5а) — не', !fixBtn(h, 'a5'));
    ok('склад: a6 (will_send + no_stock) — не', !fixBtn(h, 'a6'));
    ok('sdCanStockFixed = бутонът (f1 true, a1 false)',
      h.w.sdCanStockFixed(h.w.sdData.find(x => x.id === 'f1'), h.w.diffReports[0]) === true &&
      h.w.sdCanStockFixed(h.w.sdData.find(x => x.id === 'a1'), h.w.diffReports[0]) === false);
    ok('f1 — „Ход: ЦО — или складът, ако оправи наличността“ преди записа', turn(h, 'f1') === 'Ход: ЦО — или складът, ако оправи наличността', turn(h, 'f1'));
    ok('f1 — who остава co (чипът „🏢 Ход: ЦО“ го брои)', h.w.sdInterstoreTurn(h.w.sdData.find(x => x.id === 'f1'), h.w.diffReports[0]).who === 'co');
    h.close();
  }
  for (const [name, u] of [['обект', U.store], ['admin', U.admin], ['ЦО (Миглена, razliki_co)', U.migl], ['чужд склад', U.wh2]]) {
    const h = env(u);
    await render(h);
    ok(name + ': без бутон на f1 и f2', !fixBtn(h, 'f1') && !fixBtn(h, 'f2'), btnTexts(h, 'f1').join(' / '));
    ok(name + ': sdCanStockFixed(f1) = false', h.w.sdCanStockFixed(h.w.sdData.find(x => x.id === 'f1'), h.w.diffReports[0]) === false);
    h.close();
  }
  {
    const h = env(U.store);
    await render(h);
    ok('обект: директно извикване на модала → нищо', (h.w.openSDStockFixedModal('f1'), !h.doc.getElementById('sdfix-ov')));
    const r = await h.w.submitSDStockFixed('f1'); await settle();
    ok('обект: директно извикване на записа → false, 0 PATCH', r === false && sdPatches(h).length === 0);
    h.close();
  }

  section('2. Клик → модал → потвърждение → един PATCH (с коментари)');
  let patched;
  {
    const h = env(U.wh);
    await render(h);
    realClick(h.w, fixBtn(h, 'f1')); await settle();
    ok('модалът е отворен', !!h.doc.getElementById('sdfix-ov'));
    ok('0 PATCH до потвърждение', sdPatches(h).length === 0);
    h.doc.getElementById('sdfix-comment').value = '  Заприходено с 311  ';
    const before = Date.now();
    realClick(h.w, h.doc.getElementById('sdfix-save')); await settle();
    const ps = sdPatches(h);
    ok('точно един PATCH към stock_differences', ps.length === 1, JSON.stringify(h.calls.patch));
    ok('без PATCH към други таблици', h.calls.patch.length === 1);
    const p = ps[0] || { body: {}, url: '' };
    ok('PATCH по id=eq.f1', /id=eq\.f1$/.test(p.url), p.url);
    const b = p.body;
    ok('тяло: точно шестте полета (+ zstr_number, razliki-dovarshvane 25.11)', JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['store_response', 'store_response_at', 'store_response_by', 'store_response_comment', 'warehouse_comment', 'zstr_number']), JSON.stringify(b));
    ok('zstr_number → null', b.zstr_number === null);
    ok('store_response* → null', b.store_response === null && b.store_response_by === null && b.store_response_at === null && b.store_response_comment === null, JSON.stringify(b));
    ok('warehouse_response не се праща (остава return)', !('warehouse_response' in b));
    const today = (() => { const d = new Date(before); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2); })();
    const expLine = '✅ Наличността е оправена ' + today + ' (Склад Търговище) — обектът беше отговорил „Няма наличност“ 20.10: SAP отказва — наличност 0 · Заприходено с 311';
    ok('warehouse_comment = досегашният + нов ред', b.warehouse_comment === 'Пуснете ZSTR\n' + expLine, JSON.stringify(b.warehouse_comment));
    ok('модалът е затворен', !h.doc.getElementById('sdfix-ov'));
    ok('зелен toast', /ходът е при обекта/.test(toasts(h)), toasts(h));
    ok('push до обекта (1)', h.push.length === 1 && h.push[0].target === STORE, JSON.stringify(h.push));
    ok('push текст', h.push[0] && h.push[0].msg === 'Наличността е оправена — пуснете заявката пак: Sf1 АРТ f1', h.push[0] && h.push[0].msg);
    ok('без жълт toast при успешен push', !/известието/.test(toasts(h)));
    patched = Object.assign(clone(L.f1), b);
    h.close();
  }
  {
    const h = env(U.wh);
    await render(h);
    realClick(h.w, fixBtn(h, 'f2')); await settle();
    realClick(h.w, h.doc.getElementById('sdfix-save')); await settle();
    const p = sdPatches(h)[0] || { body: {} };
    const d = new Date(); const today = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
    ok('без коментари: warehouse_comment = само новият ред',
      p.body.warehouse_comment === '✅ Наличността е оправена ' + today + ' (Склад Търговище) — обектът беше отговорил „Няма наличност“ 21.10', JSON.stringify(p.body.warehouse_comment));
    ok('без коментари: store_response → null', p.body.store_response === null);
    h.close();
  }

  section('3. След записа — ходът е на обекта');
  {
    const lines = [patched];
    const h = env(U.store, { lines });
    await render(h, lines);
    const t = btnTexts(h, 'f1');
    ok('обектът вижда „ЗАЯВКАТА Е ПУСНАТА“', t.some(x => /ЗАЯВКАТА Е ПУСНАТА/.test(x)), t.join(' / '));
    ok('обектът вижда „НЯМА НАЛИЧНОСТ В ЛОГИСТИКА“', t.some(x => /НЯМА НАЛИЧНОСТ В ЛОГИСТИКА/.test(x)), t.join(' / '));
    ok('нито един от двата не е активен (✓)', !t.some(x => /^✓/.test(x)), t.join(' / '));
    ok('„Ход: обекта — …“', /^Ход: обекта/.test(turn(h, 'f1') || ''), turn(h, 'f1'));
    ok('sdInterstoreTurn.who = store', h.w.sdInterstoreTurn(h.w.sdData[0], h.w.diffReports[0]).who === 'store');
    ok('diffLineWaitsStore = true (Бюлетин/банер)', h.w.diffLineWaitsStore(h.w.sdData[0]) === true);
    h.close();
  }
  {
    const lines = [patched];
    const h = env(U.wh, { lines });
    await render(h, lines);
    ok('складът: бутонът изчезва', !fixBtn(h, 'f1'));
    ok('складът: чип — не е „Прието обратно“/без отговор', h.w.sdWhChipKind(h.w.sdData[0], h.w.diffReports[0]) === null);
    h.close();
  }
  {
    const lines = [patched];
    const h = env(U.migl, { lines });
    await render(h, lines);
    ok('ЦО: „✅ Приключи (от свое име)“ остава', !!(row(h, 'f1') && row(h, 'f1').querySelector('.sd-route-close')));
    h.close();
  }

  section('4. Провален push → жълт toast, записът остава');
  {
    const h = env(U.wh, { pushFail: true });
    await render(h);
    realClick(h.w, fixBtn(h, 'f1')); await settle();
    realClick(h.w, h.doc.getElementById('sdfix-save')); await settle();
    ok('PATCH е направен', sdPatches(h).length === 1);
    ok('жълт toast за известието', /известието до обекта не тръгна/.test(toasts(h)), toasts(h));
    h.close();
  }

  section('5. Провален PATCH → червен toast, без промяна');
  {
    const h = env(U.wh, { fail: { PATCH: true } });
    await render(h);
    realClick(h.w, fixBtn(h, 'f1')); await settle();
    realClick(h.w, h.doc.getElementById('sdfix-save')); await settle();
    ok('червен toast „Грешка при запис“', /Грешка при запис/.test(toasts(h)), toasts(h));
    const l = h.w.sdData.find(x => x.id === 'f1');
    ok('редът в паметта — непокътнат', l.store_response === 'no_stock' && l.warehouse_comment === 'Пуснете ZSTR' && l.store_response_comment === 'SAP отказва — наличност 0', JSON.stringify(l));
    ok('модалът остава отворен', !!h.doc.getElementById('sdfix-ov'));
    ok('0 push', h.push.length === 0);
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
