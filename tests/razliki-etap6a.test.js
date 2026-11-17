/* Разлики, етап 6а — ЦО приключва всеки междускладов ред + ред „Ход:“
   (среща 12.11.2026 — С5; писма на Миглена 27–28.10, 10.11, 13.11 и Цвети 13.11).

   1. „✅ Приключи (от свое име)“ на всеки отворен междускладов ред: САМО
      групата 'razliki_co' (решение на Тенчо 17.11 — admin без групата не);
      насочен damaged — и регионалният на обекта; обект без регионален —
      само 'razliki_co'; склад, обект, accounting без групата — не;
      received и отворена размяна — без бутон. Без коментар — отказ; с
      коментар — точният PATCH; последният ред затваря бланката; push до обекта
      и склада след успешен запис, не и при провал. После „✅ Приключено от …“.
   2. „Ход:“ — всеки ред от таблицата с точния текст; received / късно получен
      — без ред; насоченият по 5а — без ред „Ход:“ (има си надпис).
   3. Чипът „🏢 Ход: ЦО (N)“ — брой, филтър, видим при 0, невидим за склад/обект.
   4. 5а не е счупен: насоченият ред — надписът и старото право (регионалният).

   pushInterstoreDiff — фалшив (push.js не е зареден, sdNotifyInterstore го
   търси по глобално име).

   Мутационна проверка (17.11.2026, мутант върху stock-differences.js, файлът
   — върнат от копие и сверен с cmp; чистият код: exit 0, 210/210; след
   решението на Тенчо 17.11 — само 'razliki_co', admin сам не):
     М1  бутонът без проверка на ролята (sdIsCOCloser → true)             → 42 ❌
     М1б ролята admin пак дава бутона (старият вариант)                   → 11 ❌
     М2  return+no_stock → ход на обекта (who 'store')                    →  4 ❌
     М3  чипът брои и received (sdInterstoreTurn без проверка за status)   → 13 ❌
     М4  damaged без 'razliki_co' (само регионалният)                     →  6 ❌
   Всички — exit 1.

   Пускане:  node tests/razliki-etap6a.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';
const STORE = 'Карлово';
const U = {
  admin:   { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  adminCO: { id: 'u-adc', email: 'adc@temax.bg', display_name: 'Админ ЦО', role: 'admin', store_name: 'Централен офис' },
  migl:   { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  vasilka: { id: 'u-vs', email: 'v.shikova@temax.bg', display_name: 'Василка Шикова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  reg:     { id: 'u-pg', email: 'p.georgieva@temax.bg', display_name: 'П. Георгиева', role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Карлово'] },
  wh:      { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH },
  store:   { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: STORE }
};
const DBU = [
  { id: 'u-adm', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-adc', notify_groups: ['razliki_co'], is_regional: false, assigned_stores: [] },
  { id: 'u-mp', notify_groups: ['controlling', 'razliki_co'], is_regional: false, assigned_stores: [] },
  { id: 'u-vs', notify_groups: ['co', 'razliki_barcode'], is_regional: false, assigned_stores: [] },
  { id: 'u-pg', notify_groups: [], is_regional: true, assigned_stores: ['Карлово'] },
  { id: 'u-wh', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-st', notify_groups: [], is_regional: false, assigned_stores: [] }
];

const rep = (id) => ({ id, direction: 'interstore', store_name: STORE, counterpart: WH, document_number: 'D' + id, doc_date: '2026-11-17',
  submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' });
const REP = rep('r1');
const line = (id, cat, extra, rid) => Object.assign({ id, report_id: rid || 'r1', store_name: STORE, supplier: WH, material_code: 'S' + id,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр', difference_category: cat, type: null, status: 'new',
  warehouse_response: null, store_response: null, attachments: [] }, extra || {});

/* Всеки ред от таблицата на т.2. */
const T = {
  n0: [line('n0', 'undelivered'), 'Ход: склада — да отговори'],
  n1: [line('n1', 'undelivered', { warehouse_response: 'will_send' }), 'Ход: склада — да изпрати стоката'],
  n2: [line('n2', 'undelivered', { warehouse_response: 'sent' }), 'Ход: обекта — да потвърди ПРИЕТО, когато стоката пристигне'],
  n3: [line('n3', 'excess', { warehouse_response: 'sent_sap' }), 'Ход: обекта — да потвърди в SAP'],
  n4: [line('n4', 'excess', { warehouse_response: 'return' }), 'Ход: обекта — да пусне движението в SAP или да отбележи, че няма наличност'],
  n5: [line('n5', 'excess', { warehouse_response: 'return', store_response: 'sap_done' }), 'Ход: склада — „📬 Прието обратно“'],
  n6: [line('n6', 'excess', { warehouse_response: 'return', store_response: 'no_stock', store_response_comment: 'няма' }), 'Ход: ЦО — складът и обектът нямат следващ ход'],
  n8: [line('n8', 'undelivered'), 'Ход: по размяната']
};
const N7 = line('n7', 'undelivered', { status: 'received', warehouse_response: 'sent', store_response: 'accepted', completed_by: 'Карлово', completed_at: '2026-11-16T10:00:00Z' });
const N10 = line('n10', 'undelivered', { status: 'received', store_response: 'accepted', store_response_comment: 'Получено междувременно на 16.11.2026', completed_at: '2026-11-16T10:00:00Z' });
const N9 = line('n9', 'pack_mismatch');            /* насочен към ЦО по 5а */
const D9 = line('d9', 'damaged');                  /* насочен към регионалния по 5а */
const ALL = Object.keys(T).map(k => T[k][0]).concat([N7, N10, N9, D9]);
const SWAPS = [{ id: 'sw1', from_line_id: 'zz', to_line_id: 'n8', from_store: 'Пловдив', to_store: STORE, warehouse: WH, status: 'linked', created_at: '2026-11-17T09:00:00Z' }];

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const clone = x => JSON.parse(JSON.stringify(x));

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true, fail: opts.fail,
    data: {
      stock_differences: clone(opts.lines || ALL), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: clone(opts.swaps || SWAPS), users: DBU, contacts: [],
      differences_reports: clone(opts.reps || [REP]), storno_notes: [], storno_note_replies: []
    }
  });
  h.push = [];
  h.w.pushInterstoreDiff = (target, title, msg) => { h.push.push({ target, title, msg }); return Promise.resolve({ ok: true }); };
  return h;
}
async function render(h, lines, reps, swaps) {
  h.w.sdData = clone(lines || ALL);
  h.w.diffReports = clone(reps || [REP]);
  h.w.sdSwaps = clone(swaps || SWAPS);
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'interstore'; h.w.sdView = 'reports';
  h.w.sdShowDone = { r1: true, r2: true };
  await h.w.sdLoadMe(); await settle();
  h.w.renderStockDiff();
}
const row = (h, id) => {
  const rows = h.doc.querySelectorAll('[id^="diff-rep-"] tr');
  return Array.prototype.find.call(rows, tr => { const td = tr.querySelectorAll('td')[1]; return td && td.textContent.indexOf('АРТ ' + id) === 0 && td.textContent.replace(/[^\wА-я ]/g, '').trim() === 'АРТ ' + id; }) || null;
};
const closeBtn = (h, id) => { const r = row(h, id); return r ? r.querySelector('.sd-route-close') : null; };
const turn = (h, id) => { const r = row(h, id); const t = r ? r.querySelector('.sd-turn') : null; return t ? t.textContent : null; };
const chip = h => h.doc.getElementById('sd-co-turn-chip');
const toasts = h => h.calls.toast.join(' | ');

(async function run() {

  section('0. Редовете се намират');
  {
    const h = env(U.admin);
    await render(h);
    ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'd9'].forEach(id => ok('ред ' + id + ' е в картата', !!row(h, id)));
    h.close();
  }

  section('1. „✅ Приключи“ — кой го вижда и на кои редове');
  {
    const yes = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
    const cases = [
      /* Решение на Тенчо 17.11: ролята admin сама НЕ дава бутона. */
      ['admin без група', U.admin, { open: false, n9: false, d9: false }],
      ['admin с razliki_co', U.adminCO, { open: true, n9: true, d9: true }],
      ['Миглена (razliki_co, accounting)', U.migl, { open: true, n9: true, d9: true }],
      ['Василка (accounting, без razliki_co)', U.vasilka, { open: false, n9: false, d9: false }],
      ['регионален на Карлово', U.reg, { open: false, n9: false, d9: true }],
      ['склад', U.wh, { open: false, n9: false, d9: false }],
      ['обект', U.store, { open: false, n9: false, d9: false }]
    ];
    for (const [name, u, exp] of cases) {
      const h = env(u);
      await render(h);
      yes.forEach(id => ok(name + ': ' + id + ' → ' + (exp.open ? 'има' : 'няма'), !!closeBtn(h, id) === exp.open));
      ok(name + ': n9 (насочен към ЦО) → ' + exp.n9, !!closeBtn(h, 'n9') === exp.n9);
      ok(name + ': d9 (насочен към регионалния) → ' + exp.d9, !!closeBtn(h, 'd9') === exp.d9);
      ['n7', 'n10'].forEach(id => ok(name + ': ' + id + ' (received) → няма', !closeBtn(h, id)));
      ok(name + ': n8 (отворена размяна) → няма', !closeBtn(h, 'n8'));
      h.close();
    }
    /* damaged на обект без регионален (Кърджали) → само 'razliki_co'. */
    const KRJ = Object.assign(rep('r1'), { store_name: 'Кърджали' });
    const krj = [line('d9', 'damaged', { store_name: 'Кърджали' })];
    for (const [name, u, exp] of [['Миглена (razliki_co)', U.migl, true], ['admin с razliki_co', U.adminCO, true],
      ['admin без група', U.admin, false], ['регионален на Карлово', U.reg, false], ['Василка', U.vasilka, false]]) {
      const hk = env(u, { lines: krj, reps: [KRJ] });
      await render(hk, krj, [KRJ]);
      ok('Кърджали damaged, ' + name + ' → ' + (exp ? 'бутон' : 'без бутон'), !!closeBtn(hk, 'd9') === exp);
      hk.close();
    }
    /* Затворена размяна не спира бутона. */
    const h = env(U.adminCO);
    await render(h, ALL, [REP], [Object.assign({}, SWAPS[0], { status: 'closed' })]);
    ok('затворена размяна → бутонът е там', !!closeBtn(h, 'n8'));
    h.close();
  }

  section('2. „✅ Приключи“ — модал, коментар, PATCH, push');
  {
    const lines = [line('n6', 'excess', { warehouse_response: 'return', store_response: 'no_stock' }), N7];
    const h = env(U.migl, { lines });
    await render(h, lines);
    realClick(h.w, closeBtn(h, 'n6')); await settle();
    ok('модалът е отворен', !!h.doc.getElementById('sdroute-ov'));
    realClick(h.w, h.doc.getElementById('sdroute-save')); await settle();
    ok('без коментар: 0 PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch));
    ok('без коментар: toast', /Впиши коментар/.test(toasts(h)), toasts(h));
    ok('без коментар: 0 push', h.push.length === 0);
    h.doc.getElementById('sdroute-comment').value = '  Наличността е оправена от ЦО  ';
    const before = Date.now();
    realClick(h.w, h.doc.getElementById('sdroute-save')); await settle();
    const p = h.calls.patch.find(x => x.table === 'stock_differences');
    ok('PATCH stock_differences?id=eq.n6', !!p && /id=eq\.n6$/.test(p.url), p && p.url);
    const b = p ? p.body : {};
    ok('тяло: точно четирите полета', JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['completed_at', 'completed_by', 'resolution_comment', 'status']), JSON.stringify(b));
    ok('received, completed_by = Миглена Павлова, коментарът без интервали',
      b.status === 'received' && b.completed_by === 'Миглена Павлова' && b.resolution_comment === 'Наличността е оправена от ЦО', JSON.stringify(b));
    ok('completed_at = сега', Math.abs(new Date(b.completed_at).getTime() - before) < 60000, b.completed_at);
    ok('последен отворен → бланката се затваря', h.calls.patch.some(x => x.table === 'differences_reports' && /id=eq\.r1/.test(x.url)));
    const msg = 'ЦО приключи ред Sn6 · Карлово: Наличността е оправена от ЦО';
    ok('push до обекта', h.push.some(x => x.target === STORE && x.msg === msg), JSON.stringify(h.push));
    ok('push до склада', h.push.some(x => x.target === WH && x.msg === msg), JSON.stringify(h.push));
    ok('точно 2 push', h.push.length === 2, String(h.push.length));
    h.close();
  }
  {
    const lines = [line('n0', 'undelivered'), line('n1', 'undelivered', { warehouse_response: 'will_send' })];
    const h = env(U.adminCO, { lines });
    await render(h, lines);
    realClick(h.w, closeBtn(h, 'n0')); await settle();
    h.doc.getElementById('sdroute-comment').value = 'Решено по телефона';
    realClick(h.w, h.doc.getElementById('sdroute-save')); await settle();
    ok('не последен → бланката НЕ се затваря', h.calls.patch.filter(x => x.table === 'stock_differences').length === 1 &&
      !h.calls.patch.some(x => x.table === 'differences_reports'));
    ok('push и тук (2)', h.push.length === 2);
    h.close();
  }
  {
    const lines = [line('n0', 'undelivered')];
    const h = env(U.adminCO, { lines, fail: { PATCH: true } });
    await render(h, lines);
    realClick(h.w, closeBtn(h, 'n0')); await settle();
    h.doc.getElementById('sdroute-comment').value = 'Опит';
    realClick(h.w, h.doc.getElementById('sdroute-save')); await settle();
    ok('провален запис: toast „Грешка при запис“', /Грешка при запис/.test(toasts(h)), toasts(h));
    ok('провален запис: 0 push', h.push.length === 0, JSON.stringify(h.push));
    ok('провален запис: модалът стои', !!h.doc.getElementById('sdroute-ov'));
    h.close();
  }
  {
    /* Приключеният от ЦО — за всички роли: кой, кога, коментар; без „📬 Получено“ и без „чака склада“. */
    const closed = [line('c1', 'undelivered', { status: 'received', completed_by: 'Миглена Павлова', completed_at: '2026-11-17T09:30:00Z', resolution_comment: 'Решено' }),
      line('c2', 'excess', { warehouse_response: 'return', store_response: 'no_stock', status: 'received', completed_by: 'Админ', completed_at: '2026-11-17T09:30:00Z', resolution_comment: 'Оправено' }),
      line('n0', 'undelivered')];
    for (const [name, u] of [['склад', U.wh], ['обект', U.store], ['admin', U.admin]]) {
      const h = env(u, { lines: closed });
      await render(h, closed);
      const c1 = row(h, 'c1'), c2 = row(h, 'c2');
      ok(name + ': c1 „✅ Приключено от Миглена Павлова · 17.11 — Решено“', !!c1 && c1.textContent.indexOf('✅ Приключено от Миглена Павлова · 17.11 — Решено') >= 0, c1 && c1.textContent);
      ok(name + ': c1 без „чака склада“ и без „📬 Получено“', !!c1 && c1.textContent.indexOf('чака склада') < 0 && c1.textContent.indexOf('📬 Получено') < 0);
      ok(name + ': c2 — отговорите + „✅ Приключено от Админ“', !!c2 && c2.textContent.indexOf('↩️ Обратно') >= 0 && c2.textContent.indexOf('✅ Приключено от Админ · 17.11 — Оправено') >= 0, c2 && c2.textContent);
      ok(name + ': без ред „Ход:“ на приключените', !turn(h, 'c1') && !turn(h, 'c2'));
      h.close();
    }
    /* Обикновен приключен (без resolution_comment) — непроменен: „📬 Получено“. */
    const h = env(U.admin);
    await render(h);
    ok('n7: „📬 Получено“ както досега', row(h, 'n7').textContent.indexOf('📬 Получено') >= 0 && row(h, 'n7').textContent.indexOf('Приключено от') < 0);
    h.close();
  }

  section('3. „Ход:“ — всеки ред от таблицата, за всички роли');
  for (const [name, u] of [['admin', U.admin], ['склад', U.wh], ['обект', U.store], ['Василка', U.vasilka]]) {
    const h = env(u);
    await render(h);
    Object.keys(T).forEach(id => ok(name + ': ' + id + ' → „' + T[id][1] + '“', turn(h, id) === T[id][1], String(turn(h, id))));
    ['n7', 'n10'].forEach(id => ok(name + ': ' + id + ' (received) → без „Ход:“', turn(h, id) === null));
    ok(name + ': n9 (насочен) → без „Ход:“, с надписа от 5а', turn(h, 'n9') === null && row(h, 'n9').textContent.indexOf('➡️ Към ЦО — не касае склада') >= 0);
    ok(name + ': d9 (насочен) → без „Ход:“, с надписа от 5а', turn(h, 'd9') === null && row(h, 'd9').textContent.indexOf('➡️ При регионалния — увредена стока') >= 0);
    h.close();
  }
  {
    const h = env(U.admin);
    ok('sdInterstoreTurn: комбинация извън таблицата → null', h.w.sdInterstoreTurn(line('x', 'excess', { warehouse_response: 'sent', store_response: 'no_stock' }), REP) === null);
    ok('sdInterstoreTurn: доставчик → null', h.w.sdInterstoreTurn(line('x', 'excess'), Object.assign({}, REP, { direction: 'supplier' })) === null);
    ok('sdInterstoreTurn: насочен към ЦО → who co', h.w.sdInterstoreTurn(N9, REP).who === 'co');
    ok('sdInterstoreTurn: насочен към регионалния → who regional', h.w.sdInterstoreTurn(D9, REP).who === 'regional');
    ok('старите етикети не са сменени', h.w.WH_RESPONSE_LABELS['return'] === '↩️ Обратно движение' && h.w.SD_STORE_BTN.no_stock === '⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА');
    h.close();
  }

  section('4. Чипът „🏢 Ход: ЦО“');
  {
    const R2 = rep('r2');
    /* c9 — приключен ред, който преди приключването е бил „ход на ЦО“: не се брои. */
    const lines = ALL.concat([line('x1', 'undelivered', null, 'r2'),
      line('c9', 'excess', { warehouse_response: 'return', store_response: 'no_stock', status: 'received', completed_by: 'Админ', completed_at: '2026-11-17T09:30:00Z', resolution_comment: 'ок' }, 'r2')]);
    for (const [name, u] of [['admin с razliki_co', U.adminCO], ['Миглена', U.migl]]) {
      const h = env(u, { lines, reps: [REP, R2] });
      await render(h, lines, [REP, R2]);
      ok(name + ': чипът е видим', !!chip(h));
      ok(name + ': „🏢 Ход: ЦО (2)“ (n6 + насоченият n9)', !!chip(h) && chip(h).textContent === '🏢 Ход: ЦО (2)', chip(h) && chip(h).textContent);
      ok(name + ': без филтър — и двете бланки', !!h.doc.getElementById('diff-rep-r1') && !!h.doc.getElementById('diff-rep-r2'));
      realClick(h.w, chip(h)); await settle();
      ok(name + ': след клик — само r1', !!h.doc.getElementById('diff-rep-r1') && !h.doc.getElementById('diff-rep-r2'));
      ok(name + ': чипът е активен и пак (2)', !!chip(h) && chip(h).textContent === '🏢 Ход: ЦО (2)');
      realClick(h.w, chip(h)); await settle();
      ok(name + ': втори клик — пак и двете', !!h.doc.getElementById('diff-rep-r1') && !!h.doc.getElementById('diff-rep-r2'));
      realClick(h.w, chip(h)); await settle();
      h.w.setSDDirTab('supplier'); h.w.setSDDirTab('interstore');
      ok(name + ': смяна на подтаба нулира филтъра', !!h.doc.getElementById('diff-rep-r2'));
      h.close();
    }
    {
      const zero = [line('n0', 'undelivered'), N7];
      const h = env(U.adminCO, { lines: zero });
      await render(h, zero);
      ok('при 0 — чипът е видим „🏢 Ход: ЦО (0)“', !!chip(h) && chip(h).textContent === '🏢 Ход: ЦО (0)', chip(h) && chip(h).textContent);
      h.w.setSDDirTab('supplier');
      ok('в подтаб „Доставчици“ — няма чип', !chip(h));
      h.close();
    }
    for (const [name, u] of [['склад', U.wh], ['обект', U.store], ['Василка', U.vasilka], ['регионален', U.reg], ['admin без група', U.admin]]) {
      const h = env(u);
      await render(h);
      ok(name + ': без чип', !chip(h));
      h.close();
    }
  }

  section('5. 5а не е счупен');
  {
    const h = env(U.reg);
    await render(h);
    realClick(h.w, closeBtn(h, 'd9')); await settle();
    h.doc.getElementById('sdroute-comment').value = 'За ремонт';
    realClick(h.w, h.doc.getElementById('sdroute-save')); await settle();
    const p = h.calls.patch.find(x => x.table === 'stock_differences');
    ok('регионалният приключва damaged (5а)', !!p && /id=eq\.d9$/.test(p.url) && p.body.completed_by === 'П. Георгиева');
    ok('push: „Регионалният приключи ред …“', h.push.length === 2 && h.push[0].msg === 'Регионалният приключи ред Sd9 · Карлово: За ремонт', JSON.stringify(h.push));
    h.close();
    const h2 = env(U.wh);
    await render(h2);
    ok('склад: насоченият n9 — надпис, без бутоните на склада',
      row(h2, 'n9').textContent.indexOf('➡️ Към ЦО — не касае склада') >= 0 && row(h2, 'n9').querySelectorAll('[onclick^="openWarehouseResponseModal"]').length === 0);
    ok('склад: обикновеният n0 — 4 бутона на склада', row(h2, 'n0').querySelectorAll('[onclick^="openWarehouseResponseModal"]').length === 4);
    h2.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
