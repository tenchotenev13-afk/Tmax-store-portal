/* Разлики — четирите доработки преди инструкцията (25.11.2026, сесия
   razliki-dovarshvane; решения на Тенчо 25.11.2026).

   1. Надпис за склада: „📥 Бланки към склада — чакат отговор“ (офисът и
      обектът — „🆕 Нови подадени бланки — чакат преглед“); празното състояние
      при филтър — също.
   2. „➡️ Към Контролинг“: бутон само за склада на бланката при ход на склада
      (без отговор / will_send без отговор на обекта / return + sap_done);
      модал със задължителен коментар → един PATCH (to_co_*); после „Ход: ЦО“,
      чипът на ЦО, „✅ Приключи“ на razliki_co, без бутоните на склада и
      обекта, баджът на склада, известие до razliki_co (провал → жълт toast),
      Excel, печат, report.js (reportDiffCOTurn / reportWhDiffKind /
      reportMinusOdTurn, седмичният сбор), diffLineWaitsStore.
   3. Номер на ZSTR: излишък + return → „📝 ЗАЯВКАТА Е ПУСНАТА“ отваря модал
      със задължителен номер (празно / интервали → червен toast, 0 PATCH);
      липса → без поле; no_stock / „Наличността е оправена“ / смяна на
      отговора на склада → zstr_number = null. Показване: карта (обект /
      склад / офис), Решени редове, Excel, печат, push, търсене.
   4. Обектът маха грешно качен файл: „✕“ без 72 ч и без подател, само докато
      никой не е действал; модал в страницата; свежа проверка; PATCH без
      елемента + DELETE в Storage (паднал → жълт toast); последната
      задължителна стокова / снимка — не се маха.

   Мутационна проверка (25.11.2026, мутант върху копие, файлът върнат и сверен
   с cmp; чистият код: exit 0) — виж края на claude/log/2026-11-25-razliki-dovarshvane.md.

   Пускане:  node tests/razliki-dovarshvane.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks } = H;

const DAY = 86400000;
const WH = 'Логистичен склад Търговище';
const STORE = 'Карлово';
const U = {
  admin: { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  migl:  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  wh:    { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH },
  wh2:   { id: 'u-wh2', email: 'wh2@temax.bg', display_name: 'Склад Пловдив', role: 'logistics', store_name: 'Логистичен склад Пловдив' },
  store: { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: STORE },
  store2:{ id: 'u-st2', email: 'karlovo2@temax.bg', display_name: 'Склад Карлово', role: 'sklad', store_name: STORE }
};
const DBU = [
  { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', notify_groups: ['controlling', 'razliki_co'], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-wh2', email: 'wh2@temax.bg', display_name: 'Склад Пловдив', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-st2', email: 'karlovo2@temax.bg', display_name: 'Склад Карлово', notify_groups: [], is_regional: false, assigned_stores: [], active: true }
];
const DBU_NOCO = DBU.map(u => Object.assign({}, u, { notify_groups: [] }));

const REP = { id: 'r1', direction: 'interstore', store_name: STORE, counterpart: WH, document_number: 'Dr1', doc_date: '2026-11-17',
  submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' };
const line = (id, cat, extra) => Object.assign({ id, report_id: 'r1', store_name: STORE, supplier: WH, material_code: 'S' + id,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр', difference_category: cat, type: null, status: 'new',
  warehouse_response: null, store_response: null, attachments: [], created_at: '2026-11-17T08:00:00Z' }, extra || {});
const TOCO = { to_co_at: '2026-11-24T09:00:00Z', to_co_by: 'Склад Търговище', to_co_comment: 'Няма я при нас — ревизия' };
const L = {
  c1: line('c1', 'undelivered'),                                                             /* ДА — без отговор */
  c2: line('c2', 'undelivered', { warehouse_response: 'will_send' }),                       /* ДА — will_send */
  c3: line('c3', 'excess', { warehouse_response: 'return', store_response: 'sap_done', zstr_number: '4500012345' }), /* ДА — return + sap_done */
  n1: line('n1', 'undelivered', { warehouse_response: 'sent' }),                            /* ход на обекта */
  n2: line('n2', 'excess', { warehouse_response: 'return' }),                               /* ход на обекта */
  n3: line('n3', 'excess', { warehouse_response: 'return', store_response: 'no_stock' }),   /* ЦО */
  n4: line('n4', 'undelivered', { status: 'received', completed_by: 'Карлово', completed_at: '2026-11-20T10:00:00Z' }),
  n5: line('n5', 'undelivered'),                                                            /* отворена размяна */
  n6: line('n6', 'pack_mismatch'),                                                          /* насочен по 5а */
  t1: line('t1', 'undelivered', TOCO),                                                      /* вече предаден, без отговор */
  t2: line('t2', 'excess', Object.assign({ warehouse_response: 'return', store_response: 'sap_done', zstr_number: '4500099999' }, TOCO)), /* предаден, return + sap_done */
  t3: line('t3', 'undelivered', Object.assign({ warehouse_response: 'will_send' }, TOCO))  /* предаден, will_send */
};
const ALL = Object.keys(L).map(k => L[k]);
const SWAPS = [{ id: 'sw1', from_line_id: 'zz', to_line_id: 'n5', from_store: 'Пловдив', to_store: STORE, warehouse: WH, status: 'linked', created_at: '2026-11-17T09:00:00Z' }];

const settle = async () => { for (let i = 0; i < 10; i++) await ticks(); };
const clone = x => JSON.parse(JSON.stringify(x));

function env(user, opts) {
  opts = opts || {};
  const reps = opts.reps || [REP];
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'report.js'],
    user, confirm: true, fail: opts.fail,
    data: {
      stock_differences: clone(opts.dbLines || opts.lines || ALL), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: clone(opts.swaps || SWAPS), users: opts.users || DBU, contacts: [],
      differences_reports: clone(opts.dbReps || reps), storno_notes: [], storno_note_replies: []
    }
  });
  h.reps = reps;
  h.push = []; h.ppl = []; h.mail = [];
  h.w.pushInterstoreDiff = (target, title, msg) => { h.push.push({ target, title, msg }); return Promise.resolve({ ok: true }); };
  h.w.pushToPeople = (names, title, msg) => { h.ppl.push({ names, title, msg }); return Promise.resolve({ ok: !opts.pushFail }); };
  h.w.sendEmail = (to, subj, html) => { h.mail.push({ to, subj, html }); return Promise.resolve({ ok: !opts.mailFail }); };
  return h;
}
async function render(h, lines, o) {
  o = o || {};
  h.w.sdData = clone(lines || ALL);
  h.w.diffReports = clone(h.reps);
  h.w.sdSwaps = clone(o.swaps || SWAPS);
  h.w.sdNotes = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = o.search || '';
  h.w.sdDirTab = o.dir || 'interstore'; h.w.sdView = 'reports';
  h.w.sdShowDone = {}; h.reps.forEach(r => { h.w.sdShowDone[r.id] = true; });
  await h.w.sdLoadMe(); await settle();
  h.w.renderStockDiff();
}
const row = (h, id) => {
  const rows = h.doc.querySelectorAll('[id^="diff-rep-"] tr');
  return Array.prototype.find.call(rows, tr => { const td = tr.querySelectorAll('td')[1]; return td && td.textContent.replace(/[^\wА-я ]/g, '').trim().indexOf('АРТ ' + id) === 0; }) || null;
};
/* Само <button>. */
const btns = (h, id) => { const r = row(h, id); return r ? Array.prototype.slice.call(r.querySelectorAll('button')) : []; };
const btnTexts = (h, id) => btns(h, id).map(b => b.textContent.trim());
const tocoBtn = (h, id) => btns(h, id).find(b => /Към Контролинг/.test(b.textContent)) || null;
const turn = (h, id) => { const r = row(h, id); const t = r ? r.querySelector('.sd-turn') : null; return t ? t.textContent : null; };
const toasts = h => h.calls.toast.join(' | ');
const sdPatches = h => h.calls.patch.filter(x => x.table === 'stock_differences');
const L_ = (h, id) => h.w.sdData.find(x => x.id === id);
const rep0 = h => h.w.diffReports[0];

(async function run() {

  /* ════════════════ 1. НАДПИС ЗА СКЛАДА ════════════════ */
  section('1. Надпис за склада');
  {
    const h = env(U.wh);
    await render(h);
    const html = h.doc.body.innerHTML;
    ok('склад: „📥 Бланки към склада — чакат отговор (…)“', /📥 Бланки към склада — чакат отговор \(\d+/.test(html));
    ok('склад: без „Нови подадени бланки“', html.indexOf('Нови подадени бланки') < 0);
    h.w.sdSearch = 'няма-такова-нещо'; h.w.renderStockDiff();
    const e = h.doc.body.innerHTML;
    ok('склад, празен филтър: „📥 Има 1 бланка към склада…“', /📥 Има 1 бланка към склада, но нито една не отговаря/.test(e), (e.match(/Има[^<]{0,80}/) || [''])[0]);
    ok('склад, празен филтър: без „непрегледана“', e.indexOf('непрегледан') < 0);
    h.close();
  }
  for (const [name, u] of [['офис (admin)', U.admin], ['обект', U.store]]) {
    const h = env(u);
    await render(h);
    const html = h.doc.body.innerHTML;
    ok(name + ': „🆕 Нови подадени бланки — чакат преглед“', html.indexOf('🆕 Нови подадени бланки — чакат преглед (') >= 0);
    ok(name + ': без надписа на склада', html.indexOf('Бланки към склада') < 0);
    h.close();
  }

  /* ════════════════ 2. „➡️ КЪМ КОНТРОЛИНГ“ ════════════════ */
  section('2а. Кой и на кои редове вижда бутона');
  {
    const h = env(U.wh);
    await render(h);
    ['c1', 'c2', 'c3'].forEach(id => ok('склад на бланката: ' + id + ' — ДА', !!tocoBtn(h, id), btnTexts(h, id).join(' / ')));
    [['n1', 'sent (ход на обекта)'], ['n2', 'return без отговор (ход на обекта)'], ['n3', 'return + no_stock (ЦО)'], ['n4', 'приключен'],
     ['n5', 'отворена размяна'], ['t1', 'вече предаден'], ['t2', 'предаден return+sap_done'], ['t3', 'предаден will_send']].forEach(x =>
      ok('склад на бланката: ' + x[0] + ' (' + x[1] + ') — не', !tocoBtn(h, x[0]), btnTexts(h, x[0]).join(' / ')));
    ok('насочен n6 — складът не го вижда изобщо', !row(h, 'n6'));
    ok('sdCanToCO = бутонът (c1 true, n2 false, t1 false)',
      h.w.sdCanToCO(L_(h, 'c1'), rep0(h)) === true && h.w.sdCanToCO(L_(h, 'n2'), rep0(h)) === false && h.w.sdCanToCO(L_(h, 't1'), rep0(h)) === false);
    ok('sdCanToCO на насочения n6 — false', h.w.sdCanToCO(L_(h, 'n6'), rep0(h)) === false);
    h.close();
  }
  for (const [name, u] of [['чужд склад', U.wh2], ['обект', U.store], ['razliki_co (Миглена)', U.migl], ['admin без група', U.admin]]) {
    const h = env(u);
    await render(h);
    ok(name + ': без бутон на c1, c2, c3', !tocoBtn(h, 'c1') && !tocoBtn(h, 'c2') && !tocoBtn(h, 'c3'), btnTexts(h, 'c3').join(' / '));
    ok(name + ': sdCanToCO(c1) = false', h.w.sdCanToCO(L_(h, 'c1'), rep0(h)) === false);
    h.close();
  }
  {
    const h = env(U.store);
    await render(h);
    h.w.openSDToCOModal('c1');
    ok('обект: директен модал → нищо', !h.doc.getElementById('sdtoco-ov'));
    const r = await h.w.submitSDToCO('c1'); await settle();
    ok('обект: директен запис → false, 0 PATCH', r === false && sdPatches(h).length === 0);
    h.close();
  }

  section('2б. Клик → модал → коментар (празен / интервали / истински) → един PATCH');
  let patchedC3;
  {
    const h = env(U.wh);
    await render(h);
    realClick(h.w, tocoBtn(h, 'c3')); await settle();
    ok('модалът е отворен', !!h.doc.getElementById('sdtoco-ov'));
    realClick(h.w, h.doc.getElementById('sdtoco-save')); await settle();
    ok('празен коментар → червен toast, 0 PATCH', /Впиши коментар/.test(toasts(h)) && sdPatches(h).length === 0, toasts(h));
    h.doc.getElementById('sdtoco-comment').value = '    ';
    realClick(h.w, h.doc.getElementById('sdtoco-save')); await settle();
    ok('само интервали → 0 PATCH, модалът стои', sdPatches(h).length === 0 && !!h.doc.getElementById('sdtoco-ov'));
    h.doc.getElementById('sdtoco-comment').value = '  Не е при нас, проверете ревизията  ';
    realClick(h.w, h.doc.getElementById('sdtoco-save')); await settle();
    const ps = sdPatches(h);
    ok('точно един PATCH към stock_differences', ps.length === 1, JSON.stringify(h.calls.patch));
    ok('без PATCH към други таблици', h.calls.patch.length === 1);
    const b = (ps[0] || {}).body || {};
    ok('PATCH по id=eq.c3', ps[0] && /id=eq\.c3$/.test(ps[0].url));
    ok('тяло: точно to_co_at / to_co_by / to_co_comment', JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['to_co_at', 'to_co_by', 'to_co_comment']), JSON.stringify(b));
    ok('to_co_by = складът, коментарът — trim', b.to_co_by === 'Склад Търговище' && b.to_co_comment === 'Не е при нас, проверете ревизията', JSON.stringify(b));
    ok('to_co_at — валидна дата', !isNaN(Date.parse(b.to_co_at)));
    ok('warehouse_response / store_response НЕ се пращат', !('warehouse_response' in b) && !('store_response' in b));
    ok('модалът е затворен', !h.doc.getElementById('sdtoco-ov'));
    ok('известие: push до Миглена (razliki_co)', h.ppl.length === 1 && JSON.stringify(h.ppl[0].names) === JSON.stringify(['Миглена Павлова']), JSON.stringify(h.ppl));
    ok('известие: push текстът носи обект, артикул, количество, коментар',
      h.ppl[0] && /Карлово/.test(h.ppl[0].msg) && /Sc3 АРТ c3 — 2 бр/.test(h.ppl[0].msg) && /проверете ревизията/.test(h.ppl[0].msg), h.ppl[0] && h.ppl[0].msg);
    ok('известие: имейл до m.pavlova@temax.bg', h.mail.length === 1 && JSON.stringify(h.mail[0].to) === JSON.stringify(['m.pavlova@temax.bg']), JSON.stringify(h.mail.map(m => m.to)));
    ok('известие: имейлът носи коментара на склада', h.mail[0] && h.mail[0].html.indexOf('проверете ревизията') >= 0);
    ok('без жълт toast при успех', !/не тръгна/.test(toasts(h)), toasts(h));
    patchedC3 = Object.assign(clone(L.c3), b);
    h.close();
  }
  for (const [name, o, re] of [['празна група', { users: DBU_NOCO }, /няма получатели/], ['паднал push', { pushFail: true }, /push/], ['паднал имейл', { mailFail: true }, /имейл/]]) {
    const h = env(U.wh, o);
    await render(h);
    realClick(h.w, tocoBtn(h, 'c1')); await settle();
    h.doc.getElementById('sdtoco-comment').value = 'x';
    realClick(h.w, h.doc.getElementById('sdtoco-save')); await settle();
    ok(name + ': PATCH е направен', sdPatches(h).length === 1);
    ok(name + ': жълт toast „известието до ЦО не тръгна“', /известието до ЦО не тръгна/.test(toasts(h)) && re.test(toasts(h)), toasts(h));
    h.close();
  }
  {
    const h = env(U.wh, { fail: { PATCH: true } });
    await render(h);
    realClick(h.w, tocoBtn(h, 'c1')); await settle();
    h.doc.getElementById('sdtoco-comment').value = 'x';
    realClick(h.w, h.doc.getElementById('sdtoco-save')); await settle();
    ok('паднал PATCH → червен toast, 0 известия, редът — непокътнат', /Грешка при запис/.test(toasts(h)) && h.ppl.length === 0 && !L_(h, 'c1').to_co_at);
    h.close();
  }

  section('2в. След записа — ход на ЦО, само за четене за склада и обекта');
  {
    const h = env(U.wh);
    await render(h);
    const t = turn(h, 't2');
    ok('t2: „Ход: ЦО — предаден от склада 24.11“', t === 'Ход: ЦО — предаден от склада 24.11', t);
    ok('sdInterstoreTurn(t1).who = co', h.w.sdInterstoreTurn(L_(h, 't1'), rep0(h)).who === 'co');
    ok('склад: t1/t2/t3 — нито един бутон', btns(h, 't1').length === 0 && btns(h, 't2').length === 0 && btns(h, 't3').length === 0,
      [btnTexts(h, 't1'), btnTexts(h, 't2'), btnTexts(h, 't3')].map(x => x.join('/')).join(' | '));
    ok('склад: t2 без „📬 Прието обратно“', btnTexts(h, 't2').every(x => !/Прието обратно/.test(x)));
    ok('склад: c3 (непредаден) — „📬 Прието обратно“ остава', btnTexts(h, 'c3').some(x => /Прието обратно/.test(x)));
    ok('склад: t2 надписът „➡️ Към Контролинг 24.11 (Склад Търговище): …“',
      (row(h, 't2').querySelector('.sd-toco') || {}).textContent === '➡️ Към Контролинг 24.11 (Склад Търговище): Няма я при нас — ревизия');
    ok('sdWhChipKind: t1/t2/t3 → null; c1 noanswer, c3 takeback',
      h.w.sdWhChipKind(L_(h, 't1'), rep0(h)) === null && h.w.sdWhChipKind(L_(h, 't2'), rep0(h)) === null && h.w.sdWhChipKind(L_(h, 't3'), rep0(h)) === null &&
      h.w.sdWhChipKind(L_(h, 'c1'), rep0(h)) === 'noanswer' && h.w.sdWhChipKind(L_(h, 'c3'), rep0(h)) === 'takeback');
    const only = ['t1', 't2', 't3'].map(id => L_(h, id));
    ok('баджът на склада: бланка само с предадени редове — 0', h.w.sdUnreviewedCountFor([rep0(h)], only, []) === 0);
    ok('баджът на склада: заедно с c1 — 1', h.w.sdUnreviewedCountFor([rep0(h)], only.concat([L_(h, 'c1')]), []) === 1);
    h.close();
  }
  {
    const h = env(U.store);
    await render(h);
    ok('обект: t1/t2/t3 — нито един бутон', btns(h, 't1').length === 0 && btns(h, 't2').length === 0 && btns(h, 't3').length === 0,
      [btnTexts(h, 't1'), btnTexts(h, 't2')].map(x => x.join('/')).join(' | '));
    ok('обект: t1 (undelivered) — без „📦 Получено междувременно“', btnTexts(h, 't1').every(x => !/Получено междувременно/.test(x)));
    ok('обект: c1 (непредаден undelivered) — „📦 Получено междувременно“ остава', btnTexts(h, 'c1').some(x => /Получено междувременно/.test(x)));
    ok('обект: вижда надписа „➡️ Към Контролинг …“', !!row(h, 't1').querySelector('.sd-toco'));
    ok('diffLineWaitsStore: c1, c2, c3, t1, t2, t3 — нито един', ['c1', 'c2', 'c3', 't1', 't2', 't3'].every(id => h.w.diffLineWaitsStore(L_(h, id)) === false));
    ok('diffLineWaitsStore: n2 (return без отговор) — да (контрола)', h.w.diffLineWaitsStore(L_(h, 'n2')) === true);
    /* Защита в обработчиците, не само липса на бутон. */
    h.w.sdSetStoreResponse('t2', 'no_stock', 'x'); await settle();
    ok('обект: sdSetStoreResponse на предаден → 0 PATCH', sdPatches(h).length === 0);
    h.w.sdConfirmInterstore('t2', 'store'); await settle();
    ok('обект: sdConfirmInterstore на предаден → 0 PATCH', sdPatches(h).length === 0);
    h.close();
  }
  {
    const h = env(U.wh);
    await render(h);
    h.w.submitWarehouseResponse('t1', 'sent'); await settle();
    ok('склад: submitWarehouseResponse на предаден → 0 PATCH', sdPatches(h).length === 0);
    h.close();
  }
  {
    const h = env(U.migl);
    await render(h);
    ok('razliki_co: t1/t2/t3 — „✅ Приключи (от свое име)“', ['t1', 't2', 't3'].every(id => !!(row(h, id) && row(h, id).querySelector('.sd-route-close'))));
    const chip = h.doc.getElementById('sd-co-turn-chip');
    /* n3 (return + no_stock) + t1, t2, t3 = 4; n6 насочен = 5. */
    ok('чипът „🏢 Ход: ЦО (5)“ брои предадените', chip && /Ход: ЦО \(5\)/.test(chip.textContent), chip && chip.textContent);
    ok('razliki_co вижда надписа', !!row(h, 't2').querySelector('.sd-toco'));
    h.close();
  }
  {
    const h = env(U.admin);
    await render(h);
    ok('admin без група: без „✅ Приключи“ на t1', !(row(h, 't1') && row(h, 't1').querySelector('.sd-route-close')));
    ok('admin: вижда надписа', !!row(h, 't1').querySelector('.sd-toco'));
    h.close();
  }
  {
    /* Записаният от 2б ред, рендиран наново при склада — заварен ред БЕЗ
       новите полета (c1) и новият (patchedC3). */
    const lines = [clone(L.c1), patchedC3];
    const h = env(U.wh, { lines });
    await render(h, lines);
    ok('нов запис: c3 вече е „Ход: ЦО“, без бутони', /^Ход: ЦО — предаден от склада /.test(turn(h, 'c3') || '') && btns(h, 'c3').length === 0, turn(h, 'c3') + ' / ' + btnTexts(h, 'c3').join('/'));
    ok('заварен ред без to_co_*: c1 — бутоните на склада + „Към Контролинг“', btnTexts(h, 'c1').length >= 2 && !!tocoBtn(h, 'c1'), btnTexts(h, 'c1').join(' / '));
    h.close();
  }

  section('2г. Excel и печат');
  {
    const h = env(U.admin);
    await render(h);
    const aoa = h.w.sdExcelRows([L_(h, 't2'), L_(h, 'c1')]);
    const hd = aoa[0];
    const iWh = hd.indexOf('Отговор на склада'), iZ = hd.indexOf('Заявка ZSTR №'), iC = hd.indexOf('Към Контролинг');
    ok('Excel: колоните „Заявка ZSTR №“ и „Към Контролинг“ след „Отговор на склада“', iWh >= 0 && iZ === iWh + 1 && iC === iWh + 2, JSON.stringify(hd));
    /* 22: + „ИД №“ (razliki-id-nomer, 28.11.2026) — износът съдържа междускладова бланка. */
    ok('Excel: 22 колони в заглавието (беше 19, после 21)', hd.length === 22, String(hd.length));
    ok('Excel: t2 — „Към Контролинг 24.11 (Склад Търговище): Няма я при нас — ревизия“', aoa[1][iC] === 'Към Контролинг 24.11 (Склад Търговище): Няма я при нас — ревизия', aoa[1][iC]);
    ok('Excel: t2 — заявка 4500099999', aoa[1][iZ] === '4500099999', aoa[1][iZ]);
    ok('Excel: заварен c1 — празни клетки', aoa[2][iZ] === '' && aoa[2][iC] === '');
    ok('Excel: всеки ред със същия брой клетки', aoa.every(r => r.length === hd.length));
    h.w.renderDiffPrint(rep0(h));
    const pr = h.doc.getElementById('mod-print');
    const tocoCells = pr ? pr.querySelectorAll('.dp-toco') : [];
    ok('печат: 3 реда „➡️ Към Контролинг …“ (t1, t2, t3)', tocoCells.length === 3, String(tocoCells.length));
    ok('печат: CSS .dp-extra с white-space:normal', /\.dp-extra\{[^}]*white-space:normal/.test(pr.innerHTML));
    h.close();
  }

  section('2д. report.js — седмичният сбор, складовата секция, „Минуси“');
  {
    const h = env(U.wh);
    const R = { id: 'R', direction: 'interstore', store_name: STORE, counterpart: WH };
    const mk = o => Object.assign({ id: 'x', report_id: 'R', status: 'new', difference_category: 'undelivered', warehouse_response: null, store_response: null, store_response_comment: null, created_at: new Date(Date.now() - 2 * DAY).toISOString() }, o);
    ok('reportDiffCOTurn: без отговор + to_co_at → true', h.w.reportDiffCOTurn(mk({ to_co_at: TOCO.to_co_at })) === true);
    ok('reportDiffCOTurn: без отговор, без to_co_at → false', h.w.reportDiffCOTurn(mk({})) === false);
    ok('reportWhDiffKind: return + sap_done + to_co_at → null', h.w.reportWhDiffKind(mk({ warehouse_response: 'return', store_response: 'sap_done', to_co_at: TOCO.to_co_at }), R, false, Date.now()) === null);
    ok('reportWhDiffKind: return + sap_done → takeback (контрола)', h.w.reportWhDiffKind(mk({ warehouse_response: 'return', store_response: 'sap_done' }), R, false, Date.now()) === 'takeback');
    const ml = Object.assign(mk({ to_co_at: TOCO.to_co_at, type: null }), { differences_reports: { direction: 'interstore', store_name: STORE } });
    ok('reportMinusOdTurn: предаден → „co“ (офис)', h.w.reportMinusOdTurn(ml, [], STORE) === 'co');
    const ml2 = Object.assign(mk({ type: null }), { differences_reports: { direction: 'interstore', store_name: STORE } });
    ok('reportMinusOdTurn: непредаден без отговор → „warehouse“ (контрола)', h.w.reportMinusOdTurn(ml2, [], STORE) === 'warehouse');
    /* Пълна матрица: правилата на отчета ≡ браузъра и с to_co_at. */
    const cats = [null, 'undelivered', 'excess', 'pack_mismatch', 'damaged'];
    const wrs = [null, 'sent', 'sent_sap', 'will_send', 'return'];
    const srs = [null, 'accepted', 'sap_done', 'no_stock'];
    let n = 0, bad = [], badCo = [];
    const t0 = Date.now();
    cats.forEach(c => wrs.forEach(w => srs.forEach(s => [false, true].forEach(sw => [null, TOCO.to_co_at].forEach(tc => [2, 8].forEach(dd => {
      const id = 'M' + (n++);
      const l = { id, report_id: 'R', difference_category: c, warehouse_response: w, store_response: s, status: 'new', store_response_comment: null,
        to_co_at: tc, created_at: new Date(t0 - dd * DAY).toISOString() };
      h.w.sdSwaps = sw ? [{ id: 'S' + id, from_line_id: 'zz', to_line_id: id, status: 'linked' }] : [];
      const a = h.w.sdWhChipKind(l, R), b = h.w.reportWhDiffKind(l, R, sw, t0);
      if (a !== b) bad.push(JSON.stringify([c, w, s, sw, !!tc]) + ' sd=' + a + ' report=' + b);
      if (!sw) {
        const t = h.w.sdInterstoreTurn(l, R);
        const co = !!t && (t.who === 'co' || t.who === 'regional');
        if (co !== h.w.reportDiffCOTurn(l)) badCo.push(JSON.stringify([c, w, s, !!tc]) + ' turn=' + (t && t.who));
      }
    }))))));
    h.w.sdSwaps = [];
    ok('матрица: ' + n + ' комбинации', n === 5 * 5 * 4 * 2 * 2 * 2);
    ok('reportWhDiffKind ≡ sdWhChipKind (и с to_co_at)', bad.length === 0, bad.slice(0, 4).join(' | '));
    ok('reportDiffCOTurn ≡ „Ход:“ на ЦО / регионалния (и с to_co_at)', badCo.length === 0, badCo.slice(0, 4).join(' | '));
    h.close();
  }
  {
    /* Седмичният: предаденият ред минава от „чака склада“ в „чака ЦО“, сборът — същият. */
    const ago = d => new Date(Date.now() - d * DAY).toISOString();
    const reps = [{ id: 'S1', direction: 'interstore', store_name: 'Троян', reviewed: false, created_at: ago(10) }];
    const rows = to => [
      { report_id: 'S1', store_name: 'Троян', status: 'new', warehouse_response: null, store_response: null, difference_category: 'undelivered', to_co_at: to },
      { report_id: 'S1', store_name: 'Троян', status: 'new', warehouse_response: 'will_send', store_response: null, difference_category: 'undelivered', to_co_at: to },
      { report_id: 'S1', store_name: 'Троян', status: 'new', warehouse_response: 'return', store_response: 'sap_done', difference_category: 'excess', to_co_at: to },
      { report_id: 'S1', store_name: 'Троян', status: 'new', warehouse_response: 'return', store_response: null, difference_category: 'excess', to_co_at: null }
    ];
    const run1 = async to => {
      const h = boot({
        modules: ['bulletin.js', 'report.js'], user: U.admin,
        data: {
          users: ['Троян', 'Централен офис'].map(s => ({ store_name: s })),
          app_settings: [{ key: 'diff_stale_days', value: '3' }],
          differences_reports: url => (String(url).indexOf('created_at=') >= 0 ? [] : clone(reps)),
          stock_differences: url => { h0.urls.push(String(url)); return clone(rows(to)); },
          stock_returns: [], kasa_storno: [], kasa_zoborot: [], goods_transit: [], transport_pallets: [], client_orders: [], transport_orders: [],
          bulletins: [], recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [], bulletin_tasks: [], task_completions: [], report_snapshots: []
        }
      });
      const h0 = h; h0.urls = [];
      const c = await new Promise(res => h.w.collectCrossModuleWeeklySummary(res, null, null));
      const t = ((c && c.diffStale && c.diffStale.byStore) || []).find(g => g.store === 'Троян') || {};
      const urls = h0.urls.slice();
      h.close();
      return { t, urls };
    };
    const before = await run1(null), after = await run1(TOCO.to_co_at);
    const sum = g => (g.warehouse || 0) + (g.coSide || 0) + (g.storeSide || 0) + (g.transit || 0);
    ok('преди: чака склада 3, ЦО 0, обекта 1', before.t.warehouse === 3 && before.t.coSide === 0 && before.t.storeSide === 1, JSON.stringify(before.t));
    ok('след: чака склада 0, ЦО 3, обекта 1', after.t.warehouse === 0 && after.t.coSide === 3 && after.t.storeSide === 1, JSON.stringify(after.t));
    ok('сборът е същият (4 = 4)', sum(before.t) === 4 && sum(after.t) === 4);
    ok('заявката тегли to_co_at', after.urls.some(u => /select=[^&]*to_co_at/.test(u)), after.urls.join(' | '));
  }

  /* ════════════════ 3. НОМЕР НА ZSTR ════════════════ */
  section('3а. Излишък + return → модал със задължителен номер');
  {
    const h = env(U.store);
    await render(h);
    const b = btns(h, 'n2').find(x => /ЗАЯВКАТА Е ПУСНАТА/.test(x.textContent));
    ok('обект: n2 (излишък + return) има „📝 ЗАЯВКАТА Е ПУСНАТА“', !!b, btnTexts(h, 'n2').join(' / '));
    realClick(h.w, b); await settle();
    ok('кликът отваря модал, 0 PATCH', !!h.doc.getElementById('sdzstr-ov') && sdPatches(h).length === 0);
    ok('модалът има поле „Номер на заявката“', !!h.doc.getElementById('sdzstr-number') && /Номер на заявката \*/.test(h.doc.getElementById('sdzstr-ov').textContent));
    realClick(h.w, h.doc.getElementById('sdzstr-save')); await settle();
    ok('празно → червен toast, 0 PATCH', /Впиши номера на заявката/.test(toasts(h)) && sdPatches(h).length === 0, toasts(h));
    h.doc.getElementById('sdzstr-number').value = '   ';
    realClick(h.w, h.doc.getElementById('sdzstr-save')); await settle();
    ok('само интервали → 0 PATCH, модалът стои', sdPatches(h).length === 0 && !!h.doc.getElementById('sdzstr-ov'));
    h.doc.getElementById('sdzstr-number').value = '  4500077777 ';
    realClick(h.w, h.doc.getElementById('sdzstr-save')); await settle();
    const p = sdPatches(h)[0] || { body: {} };
    ok('един PATCH: store_response sap_done + zstr_number (trim)', sdPatches(h).length === 1 && p.body.store_response === 'sap_done' && p.body.zstr_number === '4500077777', JSON.stringify(p.body));
    ok('тялото: точно 4 полета', JSON.stringify(Object.keys(p.body).sort()) === JSON.stringify(['store_response', 'store_response_at', 'store_response_by', 'zstr_number']), JSON.stringify(p.body));
    ok('модалът е затворен', !h.doc.getElementById('sdzstr-ov'));
    ok('push до склада носи „· заявка № 4500077777“', h.push.some(x => x.target === WH && /· заявка № 4500077777/.test(x.msg)), JSON.stringify(h.push));
    h.close();
  }
  {
    /* Липса + return → „📄 ИЗПИСАНО В SAP“ без поле. */
    const lines = [line('u1', 'undelivered', { warehouse_response: 'return' })];
    const h = env(U.store, { lines });
    await render(h, lines);
    const b = btns(h, 'u1').find(x => /ИЗПИСАНО В SAP/.test(x.textContent));
    ok('липса: „📄 ИЗПИСАНО В SAP“', !!b, btnTexts(h, 'u1').join(' / '));
    realClick(h.w, b); await settle();
    ok('липса: без модал, директно един PATCH', !h.doc.getElementById('sdzstr-ov') && sdPatches(h).length === 1);
    ok('липса: zstr_number = null', sdPatches(h)[0] && sdPatches(h)[0].body.zstr_number === null, JSON.stringify(sdPatches(h)[0] && sdPatches(h)[0].body));
    h.close();
  }
  {
    /* Без категория + return → без поле. */
    const lines = [line('o1', null, { warehouse_response: 'return' })];
    const h = env(U.store, { lines });
    await render(h, lines);
    const b = btns(h, 'o1').find(x => /ПУСНАТО В SAP/.test(x.textContent));
    realClick(h.w, b); await settle();
    ok('без категория: без модал, zstr_number = null', !h.doc.getElementById('sdzstr-ov') && sdPatches(h).length === 1 && sdPatches(h)[0].body.zstr_number === null);
    h.close();
  }
  {
    /* Смяна от sap_done (с номер) на no_stock → номерът се нулира. */
    const lines = [line('z1', 'excess', { warehouse_response: 'return', store_response: 'sap_done', zstr_number: '4500011111' })];
    const h = env(U.store, { lines });
    await render(h, lines);
    realClick(h.w, btns(h, 'z1').find(x => /НЯМА НАЛИЧНОСТ/.test(x.textContent))); await settle();
    realClick(h.w, h.doc.querySelector('#sdnostock-ov button[data-lid]')); await settle();
    const p = sdPatches(h)[0] || { body: {} };
    ok('no_stock: zstr_number = null в същия PATCH', sdPatches(h).length === 1 && p.body.store_response === 'no_stock' && p.body.zstr_number === null, JSON.stringify(p.body));
    h.close();
  }
  {
    /* „✅ Наличността е оправена“ → zstr_number = null. */
    const lines = [line('f1', 'excess', { warehouse_response: 'return', store_response: 'no_stock', zstr_number: '4500022222' })];
    const h = env(U.wh, { lines });
    await render(h, lines);
    realClick(h.w, btns(h, 'f1').find(x => /Наличността е оправена/.test(x.textContent))); await settle();
    realClick(h.w, h.doc.getElementById('sdfix-save')); await settle();
    const p = sdPatches(h)[0] || { body: {} };
    ok('наличността е оправена: zstr_number = null', p.body.zstr_number === null && 'zstr_number' in p.body, JSON.stringify(p.body));
    h.close();
  }
  {
    /* Складът сменя отговора и нулира отговора на обекта → номерът също. */
    const lines = [line('w1', 'excess', { warehouse_response: 'return', store_response: 'sap_done', zstr_number: '4500033333' })];
    const h = env(U.wh, { lines });
    await render(h, lines);
    h.w.openWarehouseResponseModal('w1', 'sent_sap');
    h.w.submitWarehouseResponse('w1', 'sent_sap'); await settle();
    const p = sdPatches(h)[0] || { body: {} };
    ok('смяна на отговора на склада: store_response и zstr_number → null', p.body.store_response === null && p.body.zstr_number === null, JSON.stringify(p.body));
    h.close();
  }

  section('3б. Показване на номера');
  for (const [name, u] of [['склад', U.wh], ['офис', U.admin], ['обект', U.store]]) {
    const h = env(u);
    await render(h);
    const txt = row(h, 'c3') ? row(h, 'c3').textContent : '';
    ok(name + ': картата — „· заявка № 4500012345“ до отговора на обекта', txt.indexOf('· заявка № 4500012345') >= 0, txt.slice(0, 300));
    h.close();
  }
  {
    const lines = [line('e1', 'excess', { warehouse_response: 'return', store_response: 'sap_done' })];
    const h = env(U.wh, { lines });
    await render(h, lines);
    const txt = row(h, 'e1').textContent;
    ok('заварен sap_done без номер — без „заявка №“ и без „—“ след отговора', txt.indexOf('заявка №') < 0 && /Заявката е пусната/.test(txt), txt.slice(0, 200));
    h.close();
  }
  {
    const h = env(U.admin);
    await render(h);
    const html = h.w.sdStoreResponseLabel(L_(h, 'c3'));
    ok('sdStoreResponseLabel (Решени / Приети редове) носи номера', html.indexOf('· заявка № 4500012345') >= 0, html);
    h.w.renderDiffPrint(rep0(h));
    const z = h.doc.querySelectorAll('#mod-print .dp-zstr');
    ok('печат: „📝 Заявката е пусната · заявка № …“ (c3 и t2)', z.length === 2 && /Заявката е пусната · заявка № 4500012345/.test(z[0].textContent), Array.prototype.map.call(z, x => x.textContent).join(' | '));
    h.close();
  }
  {
    const h = env(U.wh);
    await render(h, null, { search: '4500012345' });
    ok('търсене по номера: бланката се намира', !!h.doc.getElementById('diff-rep-r1'));
    h.w.sdSearch = '4599999990'; h.w.renderStockDiff();
    ok('търсене по чужд номер: бланката я няма', !h.doc.getElementById('diff-rep-r1'));
    h.close();
  }

  /* ════════════════ 4. ОБЕКТЪТ МАХА ФАЙЛ ════════════════ */
  section('4а. Кой вижда „✕“');
  const SB = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/public/';
  const ph = (n, kind) => Object.assign({ url: SB + 'bulletin-files/differences/' + n + '.jpg', name: n + '.jpg' }, kind ? { kind } : {});
  /* Бланка от доставчик, подадена ПРЕДИ 10 дни, от ДРУГ човек на обекта. */
  const SREP = { id: 's1', direction: 'supplier', store_name: STORE, counterpart: 'Доставчик ООД', document_number: '123', doc_date: '2026-11-10',
    submitted_by: 'Някой друг', general_comment: '', reviewed: false, created_at: new Date(Date.now() - 10 * DAY).toISOString(),
    photos: [ph('stk1', 'stokova'), ph('stk2', 'stokova'), ph('pic1'), ph('pic2')] };
  const sline = (id, extra) => Object.assign({ id, report_id: 's1', store_name: STORE, supplier: 'Доставчик ООД', material_code: '100' + id,
    material_name: 'ДОСТ ' + id, quantity: 1, unit: 'бр', difference_category: 'undelivered', type: null, status: 'new',
    warehouse_response: null, store_response: null, created_at: '2026-11-10T08:00:00Z',
    attachments: [{ type: 'image', url: SB + 'bulletin-files/stock-differences/sd_' + id + '_1.jpg', filename: 'ред.jpg' }] }, extra || {});
  const envS = (u, o) => { o = o || {}; const reps = [o.rep || SREP]; return env(u, Object.assign({ reps, lines: o.lines || [sline('a')], swaps: [] }, o)); };
  const xBtns = h => Array.prototype.slice.call(h.doc.querySelectorAll('#diff-rep-s1 button.sd-file-x'));
  for (const [name, u] of [['обект (manager)', U.store], ['обект (друг потребител на обекта)', U.store2]]) {
    const h = envS(u);
    await render(h, [sline('a')], { dir: 'supplier', swaps: [] });
    const xs = xBtns(h);
    ok(name + ': „✕“ на 4-те файла на бланката + 1 на реда (без 72 ч, без подател)', xs.length === 5, String(xs.length));
    h.close();
  }
  for (const [name, u] of [['admin', U.admin], ['Миглена', U.migl], ['склад', U.wh]]) {
    const h = envS(u);
    await render(h, [sline('a')], { dir: 'supplier', swaps: [] });
    ok(name + ': без „✕“ (офисът пази днешното си право)', xBtns(h).length === 0);
    h.close();
  }
  {
    const touched = [sline('a', { type: 'writein' })];
    const h = envS(U.store, { lines: touched });
    await render(h, touched, { dir: 'supplier', swaps: [] });
    ok('офисът е решил ред → без „✕“', xBtns(h).length === 0);
    h.close();
  }
  {
    const rep = Object.assign({}, SREP, { reviewed: true });
    const h = envS(U.store, { rep });
    h.w.sdData = [sline('a')]; h.w.diffReports = [clone(rep)]; h.w.sdSwaps = []; h.w.sdNotes = [];
    ok('прегледана бланка → sdCanStoreRemoveFile = false', h.w.sdCanStoreRemoveFile(rep) === false);
    h.close();
  }

  section('4б. Клик → модал в страницата → свежа проверка → PATCH + DELETE');
  {
    const h = envS(U.store);
    await render(h, [sline('a')], { dir: 'supplier', swaps: [] });
    const x = xBtns(h).find(b => /pic2/.test(b.dataset.url));
    realClick(h.w, x); await settle();
    ok('модалът е в страницата (не confirm())', !!h.doc.getElementById('sdfx-ov') && h.calls.confirm.length === 0);
    ok('0 PATCH до потвърждение', h.calls.patch.length === 0);
    realClick(h.w, h.doc.getElementById('sdfx-go')); await settle();
    const p = h.calls.patch.filter(c => c.table === 'differences_reports');
    ok('свежа проверка: GET на бланката и редовете преди записа', h.calls.get.some(u => /differences_reports\?id=eq\.s1/.test(u)) && h.calls.get.some(u => /stock_differences\?report_id=eq\.s1/.test(u)), h.calls.get.slice(-6).join(' | '));
    ok('един PATCH към differences_reports', p.length === 1 && h.calls.patch.length === 1, JSON.stringify(h.calls.patch));
    ok('photos без pic2 (3 остават, редът е запазен)', p[0] && JSON.stringify(p[0].body.photos.map(z => z.name)) === JSON.stringify(['stk1.jpg', 'stk2.jpg', 'pic1.jpg']), p[0] && JSON.stringify(p[0].body));
    ok('DELETE на файла в Storage', h.calls.del.some(u => /storage\/v1\/object\/bulletin-files\/differences\/pic2\.jpg$/.test(u)), h.calls.del.join(' | '));
    ok('зелен toast', /Файлът е махнат/.test(toasts(h)) && !/хранилището/.test(toasts(h)), toasts(h));
    h.close();
  }
  {
    const h = envS(U.store, { fail: { DELETE: /storage/ } });
    await render(h, [sline('a')], { dir: 'supplier', swaps: [] });
    realClick(h.w, xBtns(h).find(b => /pic1/.test(b.dataset.url))); await settle();
    realClick(h.w, h.doc.getElementById('sdfx-go')); await settle();
    ok('паднало триене в Storage: PATCH е направен', h.calls.patch.length === 1);
    ok('паднало триене в Storage: жълт toast', /не е изтрит от хранилището/.test(toasts(h)), toasts(h));
    h.close();
  }
  {
    /* Файл на реда (stock_differences.attachments). */
    const h = envS(U.store);
    await render(h, [sline('a')], { dir: 'supplier', swaps: [] });
    realClick(h.w, xBtns(h).find(b => b.dataset.kind === 'line')); await settle();
    realClick(h.w, h.doc.getElementById('sdfx-go')); await settle();
    const p = sdPatches(h);
    ok('файл на реда: PATCH attachments = []', p.length === 1 && /id=eq\.a$/.test(p[0].url) && JSON.stringify(p[0].body) === '{"attachments":[]}', JSON.stringify(p));
    ok('файл на реда: DELETE в Storage', h.calls.del.some(u => /sd_a_1\.jpg$/.test(u)));
    h.close();
  }
  {
    /* Свежа проверка: в базата складът/офисът вече е действал → 0 PATCH. */
    const h = envS(U.store, { dbLines: [sline('a', { type: 'missing' })] });
    await render(h, [sline('a')], { dir: 'supplier', swaps: [] });
    realClick(h.w, xBtns(h).find(b => /pic1/.test(b.dataset.url))); await settle();
    realClick(h.w, h.doc.getElementById('sdfx-go')); await settle();
    ok('свежата проверка спира: 0 PATCH, 0 DELETE, червен toast', h.calls.patch.length === 0 && h.calls.del.length === 0 && /Някой вече е действал/.test(toasts(h)), toasts(h));
    h.close();
  }
  {
    const h = envS(U.store, { fail: { GET: /differences_reports\?id=eq/ } });
    await render(h, [sline('a')], { dir: 'supplier', swaps: [] });
    realClick(h.w, xBtns(h).find(b => /pic1/.test(b.dataset.url))); await settle();
    realClick(h.w, h.doc.getElementById('sdfx-go')); await settle();
    ok('паднала проверка: 0 PATCH', h.calls.patch.length === 0 && /не се зареди/.test(toasts(h)), toasts(h));
    h.close();
  }

  section('4в. Задължителните файлове пазят бланката');
  const keepCase = async (name, rep, lines, re, expectKeep) => {
    const h = envS(U.store, { rep, lines });
    await render(h, lines, { dir: rep.direction, swaps: [] });
    const x = xBtns(h).find(b => re.test(b.dataset.url));
    ok(name + ': има „✕“', !!x);
    if (x) { realClick(h.w, x); await settle(); }
    const modal = !!h.doc.getElementById('sdfx-ov');
    if (expectKeep) ok(name + ': НЕ се маха — toast „Първо качете верния файл…“, без модал', !modal && /Първо качете верния файл, после махнете грешния/.test(toasts(h)), toasts(h));
    else ok(name + ': маха се — модалът се отваря', modal, toasts(h));
    h.close();
  };
  await keepCase('последна стокова при доставчик', Object.assign({}, SREP, { photos: [ph('stk1', 'stokova'), ph('pic1')] }), [sline('a')], /stk1/, true);
  await keepCase('една от две стокови', SREP, [sline('a')], /stk1/, false);
  await keepCase('последна стокова при „Без документ“', Object.assign({}, SREP, { no_document: true, photos: [ph('stk1', 'stokova')] }), [sline('a')], /stk1/, false);
  await keepCase('последна снимка при категория със задължителни снимки', Object.assign({}, SREP, { photos: [ph('stk1', 'stokova'), ph('stk2', 'stokova'), ph('pic1')] }), [sline('a', { difference_category: 'damaged' })], /pic1/, true);
  await keepCase('последна снимка при задължителни снимки + „Без документ“', Object.assign({}, SREP, { no_document: true, photos: [ph('pic1')] }), [sline('a', { difference_category: 'damaged' })], /pic1/, false);
  await keepCase('последна снимка при баркод вместо SAP код', Object.assign({}, SREP, { photos: [ph('stk1', 'stokova'), ph('stk2', 'stokova'), ph('pic1')] }), [sline('a', { material_code: '3800123456789' })], /pic1/, true);
  await keepCase('последна снимка без задължение', Object.assign({}, SREP, { photos: [ph('stk1', 'stokova'), ph('stk2', 'stokova'), ph('pic1')] }), [sline('a')], /pic1/, false);
  {
    /* Последната стокова — и в записа (свежа проверка), не само в бутона:
       в базата втората стокова вече я няма. */
    const dbRep = Object.assign({}, SREP, { photos: [ph('stk1', 'stokova'), ph('pic1')] });
    const h = envS(U.store, { dbReps: [dbRep] });
    await render(h, [sline('a')], { dir: 'supplier', swaps: [] });
    realClick(h.w, xBtns(h).find(b => /stk1/.test(b.dataset.url))); await settle();
    realClick(h.w, h.doc.getElementById('sdfx-go')); await settle();
    ok('записът проверява наново: последната стокова в базата → 0 PATCH + toast', h.calls.patch.length === 0 && /Първо качете верния файл/.test(toasts(h)), toasts(h));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
