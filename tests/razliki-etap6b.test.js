/* Разлики, етап 6б — бутоните на склада и обекта според категорията
   (среща 12.11.2026 — С5; решение Б на Тенчо 18.11: при излишък
   „📤 Изпратено“ го няма). Само междускладов, ненасочен по 5а ред.
   Стойностите в базата — същите; сменят се бутоните и надписите.

   1. Складът: липса → точно 3 бутона; излишък → точно 2; без категория →
      старите 4; „Ход: ЦО“ (return + no_stock) → 0 бутона, само надписът;
      заварен отговор извън списъка → „✓ <надпис>“ като надпис (не бутон) +
      позволените; клик → модалът със стойността и надписа → запис → push.
   2. Обектът при return: липса / излишък / без категория — текстовете;
      кликът записва същата стойност; заглавието на push-а по категория.
   3. Надписите на отговорите — картата (за оглед), „Решени редове“, Excel,
      банерът на обекта.
   4. „Ход:“ при return без отговор на обекта — по категория.
   5. 5а и 6а не са счупени: насоченият ред, „✅ Приключи“, чипът.

   Проверките „няма бутон“ са само по <button>.

   Мутационна проверка (18.11.2026, мутант върху stock-differences.js, файлът
   — върнат от копие и сверен с cmp; чистият код: exit 0, 173/173):
     М1  излишък пак с „📤 Изпратено“ (sent в SD_WH_BY_CAT.excess)        → 8 ❌
     М2  „Ход: ЦО“ ред с бутони на склада (без проверката coTurn)         → 4 ❌
     М3  Excel със стария надпис (WH_RESPONSE_LABELS в exportSDExcel)     → 8 ❌
     М4  обектът със стария бутон „📄 ПУСНАТО В SAP“ (SD_STORE_BTN)       → 4 ❌
     М5  „Ход:“ при излишък — старият текст от 6а                         → 1 ❌
   Всички — exit 1 (М5 събаря и razliki-etap6a — 4 ❌).

   Пускане:  node tests/razliki-etap6b.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';
const STORE = 'Карлово';
const U = {
  admin: { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  migl:  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  wh:    { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH },
  store: { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: STORE }
};
const DBU = [
  { id: 'u-adm', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-mp', notify_groups: ['controlling', 'razliki_co'], is_regional: false, assigned_stores: [] },
  { id: 'u-wh', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-st', notify_groups: [], is_regional: false, assigned_stores: [] }
];
const REP = { id: 'r1', direction: 'interstore', store_name: STORE, counterpart: WH, document_number: 'D1', doc_date: '2026-11-18',
  submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-18T08:00:00Z' };
const line = (id, cat, extra) => Object.assign({ id, report_id: 'r1', store_name: STORE, supplier: WH, material_code: 'S' + id,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр', difference_category: cat, type: null, status: 'new',
  warehouse_response: null, store_response: null, attachments: [] }, extra || {});

const OLD4 = ['📤 Изпратено', '📄 Изпратено по система', '⏳ Ще изпрати', '↩️ Обратно'];
const U3 = ['📤 Изпратено', '⏳ Ще се изпрати със следващ транспорт', '📄 Приемете по документи, пускам нова заявка'];
const E2 = ['📝 Пуснете заявка ZSTR тип 4', '📄 Изписано по система'];

const L = {
  u0: line('u0', 'undelivered'),
  e0: line('e0', 'excess'),
  x0: line('x0', null),
  o0: line('o0', 'wrong_qty_other'),                                   /* друга категория */
  ur: line('ur', 'undelivered', { warehouse_response: 'return' }),
  er: line('er', 'excess', { warehouse_response: 'return' }),
  xr: line('xr', null, { warehouse_response: 'return' }),
  es: line('es', 'excess', { warehouse_response: 'sent', warehouse_comment: 'пуснете заявка' }),   /* заварен */
  us: line('us', 'undelivered', { warehouse_response: 'sent_sap' }),   /* заварен */
  ew: line('ew', 'excess', { warehouse_response: 'sent_sap' }),
  uw: line('uw', 'undelivered', { warehouse_response: 'will_send' }),
  ec: line('ec', 'excess', { warehouse_response: 'return', store_response: 'no_stock', store_response_comment: 'няма' }),
  xc: line('xc', null, { warehouse_response: 'return', store_response: 'no_stock' }),
  ud: line('ud', 'undelivered', { warehouse_response: 'return', store_response: 'sap_done', store_response_by: 'Карлово' }),
  ed: line('ed', 'excess', { warehouse_response: 'return', store_response: 'sap_done', store_response_by: 'Карлово' }),
  xd: line('xd', null, { warehouse_response: 'return', store_response: 'sap_done', store_response_by: 'Карлово' }),
  un: line('un', 'undelivered', { warehouse_response: 'return', store_response: 'no_stock', store_response_comment: 'не мога' }),
  pm: line('pm', 'pack_mismatch')                                       /* насочен към ЦО по 5а */
};
const ALL = Object.keys(L).map(k => L[k]);

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const clone = x => JSON.parse(JSON.stringify(x));

function env(user, lines) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true,
    data: {
      stock_differences: clone(lines || ALL), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: DBU, contacts: [],
      differences_reports: clone([REP]), storno_notes: [], storno_note_replies: []
    }
  });
  h.push = [];
  h.w.pushInterstoreDiff = (target, title, msg) => { h.push.push({ target, title, msg }); return Promise.resolve({ ok: true }); };
  h.cap = { aoas: [] };
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: aoa => { h.cap.aoas.push(aoa); return { __aoa: aoa }; },
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); wb.Sheets[n] = ws; }
    },
    writeFile: () => {}
  };
  return h;
}
async function render(h, lines, view) {
  h.w.sdData = clone(lines || ALL);
  h.w.diffReports = clone([REP]);
  h.w.sdSwaps = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'interstore'; h.w.sdView = view || 'reports';
  h.w.sdShowDone = { r1: true };
  await h.w.sdLoadMe(); await settle();
  h.w.renderStockDiff();
}
const row = (h, id) => {
  const rows = h.doc.querySelectorAll('[id^="diff-rep-"] tr');
  return Array.prototype.find.call(rows, tr => { const td = tr.querySelectorAll('td')[1]; return td && td.textContent.replace(/[^\wА-я ]/g, '').trim() === 'АРТ ' + id; }) || null;
};
const txt = el => el.textContent.trim();
/* Бутоните на склада — само <button> с data-val (openWarehouseResponseModal). */
const whBtns = (h, id) => { const r = row(h, id); return r ? Array.prototype.map.call(r.querySelectorAll('button[data-val]'), txt) : null; };
const whBtn = (h, id, val) => { const r = row(h, id); return r ? r.querySelector('button[data-val="' + val + '"]') : null; };
/* Бутоните на обекта при return. */
const stBtns = (h, id) => { const r = row(h, id); return r ? Array.prototype.filter.call(r.querySelectorAll('button'),
  b => /sdSetStoreResponse|openStoreNoStockModal/.test(b.getAttribute('onclick') || '')).map(txt) : null; };
const stBtn = (h, id, re) => { const r = row(h, id); return r ? Array.prototype.find.call(r.querySelectorAll('button'),
  b => re.test(b.getAttribute('onclick') || '')) : null; };
const cellText = (h, id) => { const r = row(h, id); return r ? r.textContent : ''; };
const turn = (h, id) => { const r = row(h, id); const t = r ? r.querySelector('.sd-turn') : null; return t ? t.textContent : null; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async function run() {

  section('0. Редовете се намират');
  {
    const h = env(U.wh);
    await render(h);
    Object.keys(L).forEach(id => ok('ред ' + id + ' е в картата', !!row(h, id)));
    h.close();
  }

  section('1. Складът — бутони по категория');
  {
    const h = env(U.wh);
    await render(h);
    ok('липса без отговор → точно 3', same(whBtns(h, 'u0'), U3), JSON.stringify(whBtns(h, 'u0')));
    ok('излишък без отговор → точно 2', same(whBtns(h, 'e0'), E2), JSON.stringify(whBtns(h, 'e0')));
    ok('без категория → старите 4', same(whBtns(h, 'x0'), OLD4), JSON.stringify(whBtns(h, 'x0')));
    ok('друга категория → старите 4', same(whBtns(h, 'o0'), OLD4), JSON.stringify(whBtns(h, 'o0')));
    ok('излишък без „📤 Изпратено“ бутон', !whBtn(h, 'e0', 'sent'));
    ok('липса без „Изпратено по система“ бутон', !whBtn(h, 'u0', 'sent_sap'));
    /* активният — с „✓ “ */
    ok('липса + return → активният е „✓ 📄 Приемете по документи…“',
      same(whBtns(h, 'ur'), ['📤 Изпратено', '⏳ Ще се изпрати със следващ транспорт', '✓ 📄 Приемете по документи, пускам нова заявка']), JSON.stringify(whBtns(h, 'ur')));
    ok('излишък + return → активният е „✓ 📝 Пуснете заявка ZSTR тип 4“',
      same(whBtns(h, 'er'), ['✓ 📝 Пуснете заявка ZSTR тип 4', '📄 Изписано по система']), JSON.stringify(whBtns(h, 'er')));
    ok('излишък + sent_sap → „✓ 📄 Изписано по система“', same(whBtns(h, 'ew'), ['📝 Пуснете заявка ZSTR тип 4', '✓ 📄 Изписано по система']));
    ok('липса + will_send → „✓ ⏳ Ще се изпрати със следващ транспорт“',
      same(whBtns(h, 'uw'), ['📤 Изпратено', '✓ ⏳ Ще се изпрати със следващ транспорт', '📄 Приемете по документи, пускам нова заявка']));
    /* заварен отговор извън списъка */
    const es = row(h, 'es'), lg = es && es.querySelector('.sd-wh-legacy');
    ok('излишък + заварен sent → надпис „✓ 📤 Изпратено“', !!lg && txt(lg) === '✓ 📤 Изпратено', lg && txt(lg));
    ok('… надписът не е бутон', !!lg && lg.tagName !== 'BUTTON' && !lg.closest('button'));
    ok('… до него само двата позволени бутона', same(whBtns(h, 'es'), E2), JSON.stringify(whBtns(h, 'es')));
    ok('… коментарът на склада остава', /пуснете заявка/.test(cellText(h, 'es')));
    const us = row(h, 'us'), lg2 = us && us.querySelector('.sd-wh-legacy');
    ok('липса + заварен sent_sap → „✓ 📄 Изпратено по система“ + трите', !!lg2 && txt(lg2) === '✓ 📄 Изпратено по система' && same(whBtns(h, 'us'), U3),
      (lg2 && txt(lg2)) + ' ' + JSON.stringify(whBtns(h, 'us')));
    ok('без категория — без надпис-заместител', !row(h, 'x0').querySelector('.sd-wh-legacy') && !row(h, 'xr').querySelector('.sd-wh-legacy'));
    /* „Ход: ЦО“ — нула бутона на склада */
    ok('„Ход: ЦО“ излишък (return + no_stock) → 0 бутона на склада', same(whBtns(h, 'ec'), []), JSON.stringify(whBtns(h, 'ec')));
    ok('… надписът на отговора остава', /📝 Пуснете заявка ZSTR тип 4/.test(cellText(h, 'ec')), cellText(h, 'ec'));
    ok('… и „Ход: ЦО“ е там', /^Ход: ЦО/.test(turn(h, 'ec') || ''), turn(h, 'ec'));
    ok('„Ход: ЦО“ без категория → 0 бутона на склада', same(whBtns(h, 'xc'), []), JSON.stringify(whBtns(h, 'xc')));
    ok('… надписът „↩️ Обратно движение“ остава', /↩️ Обратно движение/.test(cellText(h, 'xc')));
    ok('„Ход: ЦО“ липса (un) → 0 бутона на склада', same(whBtns(h, 'un'), []));
    ok('ред с отговор на обекта sap_done → бутоните на склада са там (ходът е негов)', same(whBtns(h, 'ed'), ['✓ 📝 Пуснете заявка ZSTR тип 4', '📄 Изписано по система']));
    ok('… и „📬 Прието обратно“', /📬 Прието обратно/.test(cellText(h, 'ed')));
    ok('насочен по 5а (pack_mismatch) → 0 бутона на склада', same(whBtns(h, 'pm'), []));
    h.close();
  }

  section('1б. Складът — клик → модал → запис → push');
  for (const [id, val, label, cat] of [
    ['e0', 'return', '📝 Пуснете заявка ZSTR тип 4', 'излишък'],
    ['e0', 'sent_sap', '📄 Изписано по система', 'излишък'],
    ['u0', 'return', '📄 Приемете по документи, пускам нова заявка', 'липса'],
    ['u0', 'will_send', '⏳ Ще се изпрати със следващ транспорт', 'липса'],
    ['x0', 'return', '↩️ Обратно движение', 'без категория']
  ]) {
    const lines = [L[id]];
    const h = env(U.wh, lines);
    await render(h, lines);
    realClick(h.w, whBtn(h, id, val)); await settle();
    const ov = h.doc.getElementById('whr-ov');
    ok(cat + ' ' + val + ': модалът е отворен', !!ov);
    const title = ov ? ov.querySelector('.bmod > div').textContent : '';
    ok(cat + ' ' + val + ': заглавие „' + label + '“', title === label, title);
    const save = ov && Array.prototype.find.call(ov.querySelectorAll('button'), b => /submitWarehouseResponse/.test(b.getAttribute('onclick') || ''));
    ok(cat + ' ' + val + ': „Запази“ носи стойността', !!save && save.getAttribute('data-val') === val);
    h.doc.getElementById('whr-comment').value = 'к';
    realClick(h.w, save); await settle();
    const p = h.calls.patch.find(x => x.table === 'stock_differences');
    ok(cat + ' ' + val + ': PATCH id=eq.' + id + ', warehouse_response = ' + val, !!p && p.body.warehouse_response === val && p.url.endsWith('id=eq.' + id), p && (p.url + ' ' + JSON.stringify(p.body)));
    ok(cat + ' ' + val + ': без нови полета в записа', !!p && same(Object.keys(p.body).sort(), ['warehouse_comment', 'warehouse_response']), p && JSON.stringify(p.body));
    const ps = h.push.find(x => x.target === STORE);
    ok(cat + ' ' + val + ': push до обекта с надписа', !!ps && ps.msg === WH + ': ' + label + ' · АРТ ' + id, ps && ps.msg);
    h.close();
  }

  section('2. Обектът при return — бутони по категория');
  {
    const h = env(U.store);
    await render(h);
    ok('липса → „📄 ИЗПИСАНО В SAP“ / „⛔ НЕ МОГА ДА ИЗПИША“', same(stBtns(h, 'ur'), ['📄 ИЗПИСАНО В SAP', '⛔ НЕ МОГА ДА ИЗПИША']), JSON.stringify(stBtns(h, 'ur')));
    ok('излишък → „📝 ЗАЯВКАТА Е ПУСНАТА“ / „⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА“', same(stBtns(h, 'er'), ['📝 ЗАЯВКАТА Е ПУСНАТА', '⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА']), JSON.stringify(stBtns(h, 'er')));
    ok('без категория → старите', same(stBtns(h, 'xr'), ['📄 ПУСНАТО В SAP', '⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА']), JSON.stringify(stBtns(h, 'xr')));
    ok('липса, вече sap_done → „✓ 📄 ИЗПИСАНО В SAP“ активен', same(stBtns(h, 'ud'), ['✓ 📄 ИЗПИСАНО В SAP', '⛔ НЕ МОГА ДА ИЗПИША']), JSON.stringify(stBtns(h, 'ud')));
    ok('липса, no_stock → „✓ ⛔ НЕ МОГА ДА ИЗПИША“ активен', same(stBtns(h, 'un'), ['📄 ИЗПИСАНО В SAP', '✓ ⛔ НЕ МОГА ДА ИЗПИША']));
    ok('обектът няма бутони на склада', same(whBtns(h, 'u0'), []) && same(whBtns(h, 'e0'), []));
    h.close();
  }

  section('2б. Обектът — кликът записва същата стойност, push по категория');
  for (const [id, title] of [['er', '📝 Разлика: Заявката е пусната'], ['ur', '📄 Разлика: Изписано в SAP'], ['xr', '📄 Разлика: пуснато в SAP']]) {
    const lines = [L[id]];
    const h = env(U.store, lines);
    await render(h, lines);
    realClick(h.w, stBtn(h, id, /sdSetStoreResponse/)); await settle();
    const p = h.calls.patch.find(x => x.table === 'stock_differences');
    ok(id + ': PATCH store_response = sap_done', !!p && p.body.store_response === 'sap_done', p && JSON.stringify(p.body));
    ok(id + ': същите полета като досега', !!p && same(Object.keys(p.body).sort(), ['store_response', 'store_response_at', 'store_response_by']), p && JSON.stringify(p.body));
    const ps = h.push.find(x => x.target === WH);
    ok(id + ': push до склада „' + title + '“', !!ps && ps.title === title, ps && ps.title);
    ok(id + ': текстът на push-а — непроменен', !!ps && ps.msg === STORE + ': АРТ ' + id + ' — приемете обратно', ps && ps.msg);
    h.close();
  }
  for (const [id, title, mtitle] of [['ur', '⛔ Разлика: Не мога да изпиша', '⛔ Не мога да изпиша'],
    ['er', '⛔ Разлика: Няма наличност в логистика', '⛔ Няма наличност в логистика'],
    ['xr', '⛔ Разлика: няма наличност в логистика', '⛔ Няма наличност в логистика']]) {
    const lines = [L[id]];
    const h = env(U.store, lines);
    await render(h, lines);
    realClick(h.w, stBtn(h, id, /openStoreNoStockModal/)); await settle();
    const ov = h.doc.getElementById('sdnostock-ov');
    ok(id + ' no_stock: модалът е отворен', !!ov);
    const t = ov ? ov.querySelector('.bmod > div').textContent : '';
    ok(id + ' no_stock: заглавие „' + mtitle + '“', t === mtitle, t);
    h.doc.getElementById('sdnostock-comment').value = 'SAP отказва';
    realClick(h.w, Array.prototype.find.call(ov.querySelectorAll('button'), b => /sdSetStoreResponse/.test(b.getAttribute('onclick') || ''))); await settle();
    const p = h.calls.patch.find(x => x.table === 'stock_differences');
    ok(id + ' no_stock: PATCH no_stock + коментар', !!p && p.body.store_response === 'no_stock' && p.body.store_response_comment === 'SAP отказва', p && JSON.stringify(p.body));
    const ps = h.push.find(x => x.target === WH);
    ok(id + ' no_stock: push „' + title + '“', !!ps && ps.title === title, ps && ps.title);
    h.close();
  }

  section('3. Надписите — картата за оглед (admin), „Решени редове“, Excel');
  const EXP = {
    ur: ['📄 Приемете по документи, пускам нова заявка', null],
    er: ['📝 Пуснете заявка ZSTR тип 4', null],
    xr: ['↩️ Обратно движение', null],
    es: ['📤 Изпратено', null],
    ew: ['📄 Изписано по система', null],
    uw: ['⏳ Ще се изпрати със следващ транспорт', null],
    ud: ['📄 Приемете по документи, пускам нова заявка', '📄 Изписано в SAP'],
    ed: ['📝 Пуснете заявка ZSTR тип 4', '📝 Заявката е пусната'],
    xd: ['↩️ Обратно движение', '📄 Пуснато в SAP'],
    un: ['📄 Приемете по документи, пускам нова заявка', '⛔ Не мога да изпиша'],
    ec: ['📝 Пуснете заявка ZSTR тип 4', '⛔ Няма наличност в логистика'],
    xc: ['↩️ Обратно движение', '⛔ Няма наличност в логистика']
  };
  {
    const h = env(U.admin);
    await render(h);
    Object.keys(EXP).forEach(id => {
      const [w, s] = EXP[id], t = cellText(h, id);
      ok('карта ' + id + ': „' + w + '“', t.indexOf(w) >= 0, t);
      if (s) ok('карта ' + id + ': „' + s + '“', t.indexOf(s) >= 0, t);
    });
    ok('карта ud: без стария „Пуснато в SAP“', cellText(h, 'ud').indexOf('Пуснато в SAP') < 0);
    ok('карта er: без стария „↩️ Обратно движение“', cellText(h, 'er').indexOf('Обратно движение') < 0);
    ok('admin — 0 бутона на склада', same(whBtns(h, 'u0'), []) && same(whBtns(h, 'e0'), []));
    h.close();
  }
  {
    /* „Решени редове“ показват само редове с решение (type) — тук „Липса“. */
    const typed = ALL.map(l => Object.assign({}, l, { type: 'missing' }));
    const h = env(U.admin, typed);
    await render(h, typed, 'rows');
    const rowsTbl = Array.prototype.find.call(h.doc.querySelectorAll('#mod-stock-diff table'), t => !!t.querySelector('#sd-rows'));
    const wh = id => {
      if (!rowsTbl) return null;
      const tr = Array.prototype.find.call(rowsTbl.querySelectorAll('tbody tr'), tr => { const n = tr.querySelector('.sd-name'); return n && n.textContent.trim() === 'АРТ ' + id; });
      const c = tr && tr.querySelector('.sd-c-wh');
      return c ? c.textContent : null;
    };
    ok('„Решени редове“: таблицата е на екрана', !!rowsTbl);
    Object.keys(EXP).forEach(id => {
      const [w, s] = EXP[id], t = wh(id);
      ok('„Решени редове“ ' + id + ': „' + w + '“' + (s ? ' + „' + s + '“' : ''), t != null && t.indexOf(w) >= 0 && (!s || t.indexOf(s) >= 0), t);
    });
    h.w.exportSDExcel(); await settle();
    const aoa = h.cap.aoas[0] || [];
    const col = aoa.length ? aoa[0].indexOf('Отговор на склада') : -1;
    ok('Excel: колона „Отговор на склада“', col >= 0, aoa[0] && aoa[0].join('|'));
    Object.keys(EXP).forEach(id => {
      const r = aoa.find(x => x[4] === 'АРТ ' + id);
      const [w, s] = EXP[id];
      ok('Excel ' + id + ': „' + w + '“' + (s ? ' + „' + s + '“' : ''), !!r && String(r[col]).indexOf(w) === 0 && (!s || String(r[col]).indexOf(s) >= 0), r && r[col]);
    });
    h.close();
  }

  section('3б. Банерът на обекта сочи бутоните, които ги има');
  {
    const lines = [L.ur, L.er];
    const h = env(U.store, lines);
    h.w.autoCompleteActive = () => true;
    await render(h, lines);
    const b = h.doc.getElementById('sd-waiting-note');
    const t = b ? b.textContent : '';
    ok('банерът е на екрана', !!b);
    ['📄 ИЗПИСАНО В SAP', '⛔ НЕ МОГА ДА ИЗПИША', '📝 ЗАЯВКАТА Е ПУСНАТА', '⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА'].forEach(x =>
      ok('банер: „' + x + '“', t.indexOf('„' + x + '“') >= 0, t));
    ok('банер: без стария „ПУСНАТО В SAP“', t.indexOf('ПУСНАТО В SAP') < 0, t);
    h.close();
  }

  section('4. „Ход:“ при return без отговор на обекта');
  {
    const h = env(U.store);
    await render(h);
    ok('липса', turn(h, 'ur') === 'Ход: обекта — да изпише в SAP или да отбележи, че не може', turn(h, 'ur'));
    ok('излишък', turn(h, 'er') === 'Ход: обекта — да пусне заявка ZSTR тип 4 или да отбележи, че няма наличност в логистика', turn(h, 'er'));
    ok('без категория — текстът от 6а', turn(h, 'xr') === 'Ход: обекта — да пусне движението в SAP или да отбележи, че няма наличност', turn(h, 'xr'));
    ok('return + sap_done — непроменен', turn(h, 'ed') === 'Ход: склада — „📬 Прието обратно“', turn(h, 'ed'));
    ok('return + no_stock — „Ход: ЦО“', turn(h, 'ec') === 'Ход: ЦО — складът и обектът нямат следващ ход', turn(h, 'ec'));
    h.close();
  }

  section('5. 5а и 6а не са счупени');
  {
    const h = env(U.migl);
    await render(h);
    const pm = row(h, 'pm');
    ok('насоченият ред: надпис „➡️ Към ЦО“', !!pm && /➡️ Към ЦО/.test(pm.textContent), pm && pm.textContent);
    ok('насоченият ред: без „Ход:“', turn(h, 'pm') === null);
    ['u0', 'e0', 'x0', 'ec', 'xc', 'pm'].forEach(id => ok('Миглена: „✅ Приключи“ на ' + id, !!(row(h, id) && row(h, id).querySelector('button.sd-route-close'))));
    const chip = h.doc.getElementById('sd-co-turn-chip');
    /* Ход на ЦО: ec, xc, un (return + no_stock) и pm (насочен към ЦО). */
    ok('чипът „🏢 Ход: ЦО (4)“', !!chip && /🏢 Ход: ЦО \(4\)/.test(chip.textContent), chip && chip.textContent);
    h.close();
  }
  {
    const h = env(U.admin);
    await render(h);
    ok('admin без група: 0 „✅ Приключи“', h.doc.querySelectorAll('button.sd-route-close').length === 0);
    ok('admin без група: без чипа', !h.doc.getElementById('sd-co-turn-chip'));
    h.close();
  }
  {
    const h = env(U.wh);
    await render(h);
    ok('склад: 0 „✅ Приключи“', h.doc.querySelectorAll('button.sd-route-close').length === 0);
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
