/* Преоценка, етап 3а — обработка от Контролинг (revaluation.js).
   Интеграционно: shared.js + admin.js + stock-returns.js (SR_SHEET_TO_STORE)
   + push.js + email.js + revaluation.js, в реда от index.html. push и имейл
   са стъбнати СЛЕД зареждането; window.XLSX е фалшив и хваща aoa-тата.

   Мутационна проверка (15.10.2026) — всеки вариант е пуснат и е паднал:
     C1 rvCoProposeCode без допълване с нули („8" + sap_code)
        → пада „14557 → 8014557";
     C2 rvCoProposeCode добавя още една „8" пред вече преоценен код
        → пада „8025298 → същият код (повторна преоценка)";
     C3 rvCoDone без проверката за празен преоценен код
        → пада „цената е записана, кодът не → пак отказ";
     C4 TOTAL в „Общо" = qty × цена вместо co_qty × цена
        → пада „TOTAL = co_qty × sale_price (2 × 60,00 = 120,00)";
     C5 rvSapUnit без картата (връща стойността както е)
        → пада „„бр." → БР";
     C6 rvCanEdit без заключването на 'processed'
        → пада „регионалният при processed: без бутони за редакция" (обектът
        е заключен и от „пише само в чернова").
   (V1/V2 — rvVal/rsVal обратно към escAttr — падат в revaluation.test.js
   §5б и revision-schedule.test.js §3.)
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, guard, section, report, dayOffset, ticks } = H;

const CAMP = { id: 'c-1', title: 'Тестова преоценка Кърджали 10.2026', kind: 'mandatory', starts_on: dayOffset(-3), ends_on: dayOffset(5), default_pct: 50, status: 'open' };
const SUB = { id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: 'submitted', no_items: false, submitted_at: new Date().toISOString(), default_pct: null };
const ITEMS = [
  { id: 'i-1', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sort_order: 1, sap_code: '14557', product_name: 'ЛАМПА', unit: 'бр.', qty: 2, std_price: 120, discount_pct: 50, proposed_price: 60, store_comment: 'стар модел' },
  { id: 'i-2', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sort_order: 2, sap_code: '82216', product_name: 'КОФА', unit: 'xyz', qty: 1.23456, std_price: 10, discount_pct: 30, proposed_price: 7, store_comment: 'счупена дръжка' },
  { id: 'i-3', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sort_order: 3, sap_code: '8025298', product_name: 'ПРЕОЦ. ЛАМПА', unit: 'БР', qty: 3, std_price: 9, discount_pct: 50, proposed_price: 4.5, store_comment: 'пак' },
  { id: 'i-4', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sort_order: 4, sap_code: '103125', product_name: 'МАРКУЧ', unit: 'л.м', qty: 5, std_price: 2, discount_pct: 50, proposed_price: 1, store_comment: 'избелял' }
];
const ELITSA = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис' };
const KARDZHALI = { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const USERS = [
  { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали', active: true },
  { email: 'sklad.kardjali@temax.bg', display_name: 'Склад Кърджали', role: 'sklad', store_name: 'Кърджали', active: true },
  { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', store_name: 'Централен офис', active: true, is_regional: false, assigned_stores: [] },
  { email: 'reg.kardzhali@temax.bg', display_name: 'Регионален Кърджали', store_name: 'Централен офис', active: true, is_regional: true, assigned_stores: ['Кърджали'] }
];
const REG_K = { email: 'reg.kardzhali@temax.bg', display_name: 'Регионален Кърджали', role: 'accounting', store_name: 'Централен офис' };
const CC = [{ key: 'revaluation_done_cc', value: 't.tenev@temax.bg' }];

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function env(o) {
  o = o || {};
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user: o.user || ELITSA,
    confirm: o.confirm,
    fail: o.fail,
    data: {
      revaluation_campaigns: o.campaigns || [CAMP],
      revaluation_submissions: () => o.subs || [SUB],
      revaluation_items: () => o.items || ITEMS,
      stores: [{ name: 'Кърджали' }, { name: 'Шумен' }, { name: 'Централен офис' }],
      users: url => url.indexOf('store_name=eq.') >= 0
        ? USERS.filter(u => url.indexOf('store_name=eq.' + encodeURIComponent(u.store_name)) >= 0)
        : url.indexOf('email=eq.') >= 0 ? USERS.filter(u => url.indexOf(encodeURIComponent(u.email)) >= 0) : USERS,
      app_settings: o.settings || CC
    },
    globals: {
      pushToPeople: (names, title, msg) => { h.push.push({ names, title, msg }); return Promise.resolve({ ok: !o.pushFail }); },
      sendEmail: (to, subj, html, extra) => { h.mail.push({ to, subj, html, extra: extra || {} }); return Promise.resolve({ ok: true }); }
    }
  });
  h.push = []; h.mail = []; h.aoas = []; h.sheets = []; h.files = [];
  h.w.rvStoresOn = o.storesOn === undefined ? true : o.storesOn;
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: a => { h.aoas.push(a); return { __aoa: a }; },
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); wb.Sheets[n] = ws; h.sheets.push(n); }
    },
    write: () => 'QkFTRTY0',
    writeFile: (wb, f) => { h.files.push({ f, wb }); }
  };
  h.clip = null;
  Object.defineProperty(h.w.navigator, 'clipboard', { configurable: true, value: { writeText: t => { h.clip = t; return Promise.resolve(); } } });
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const pinkInput = (h, id, f) => h.doc.querySelector('#rv-row-' + id + ' input[data-f="' + f + '"]');
async function openCo(h, store) { await h.w.loadRevaluation(); await ticks(5); if (store) { await h.w.rvCoOpenStore(store); await ticks(5); } }

(async function run() {

  section('1. Списък на обектите (ЦО)');
  {
    const h = env(); await openCo(h);
    const row = h.doc.getElementById('rv-co-Кърджали');
    ok('Кърджали — „подадена“ и 4 реда', !!row && row.textContent.indexOf('подадена') >= 0 && row.textContent.indexOf('4') >= 0);
    const sh = h.doc.getElementById('rv-co-Шумен');
    ok('Шумен — „не е подала“, без „Отвори“', !!sh && sh.textContent.indexOf('не е подала') >= 0 && !btn(sh, 'Отвори'));
    ok('ЦО не е в списъка', !h.doc.getElementById('rv-co-Централен офис'));
    ok('обобщение', h.doc.getElementById('rv-co-tally').textContent.indexOf('подадени 1') >= 0);
    realClick(h.w, btn(row, 'Отвори')); await ticks(6);
    ok('„Отвори“ → бланката на Кърджали', h.w.rvStore === 'Кърджали' && !!h.doc.getElementById('rv-row-i-1'));
    ok('и „← Към списъка“', !!btn(mod(h), 'Към списъка'));
  }

  section('2. Предложени стойности — показани, НЕ записани');
  {
    const h = env(); await openCo(h, 'Кърджали');
    ok('14557 → 8014557', pinkInput(h, 'i-1', 'new_sap_code').value === '8014557');
    ok('103125 → 8103125', pinkInput(h, 'i-4', 'new_sap_code').value === '8103125');
    ok('82216 → 8082216', pinkInput(h, 'i-2', 'new_sap_code').value === '8082216');
    ok('8025298 → същият код (повторна преоценка)', pinkInput(h, 'i-3', 'new_sap_code').value === '8025298');
    ok('цена = предложението на обекта (60,00)', pinkInput(h, 'i-1', 'sale_price').value === '60,00');
    ok('прехвърлено = qty (2)', pinkInput(h, 'i-1', 'co_qty').value === '2');
    ok('предложените са маркирани (rv-prop)', pinkInput(h, 'i-1', 'new_sap_code').classList.contains('rv-prop'));
    ok('коментарът на Ели — празен, без предложение', pinkInput(h, 'i-1', 'co_comment').value === '');
    ok('нищо не е записано при отваряне', h.calls.patch.length === 0);
    ok('бадж „вече преоценен“ на 8025298', !!h.doc.querySelector('#rv-row-i-3 .rv-repeat'));
    ok('h.w.rvCoProposeCode: 6-цифрен 999999 → 8999999; 7-цифрен не-8 → няма', h.w.rvCoProposeCode('999999') === '8999999' && h.w.rvCoProposeCode('1234567') === null);
  }

  section('3. МЕ по SAP');
  {
    const h = env(); await openCo(h, 'Кърджали');
    const u = h.w.rvSapUnit;
    ok('„бр.“ → БР', u('бр.').unit === 'БР' && u('бр.').ok);
    ok('„кв.м“ → M2, „л.м“ → ЛМ, „ккт“ → ККТ, „кг“ → КГ (кирилица), „л“ → не е ок', u('кв.м').unit === 'M2' && u('л.м').unit === 'ЛМ' && u('ккт').unit === 'ККТ' && u('кг').unit === 'КГ' && !u('л').ok);
    ok('„БР“ (от ZSTOCK) → без промяна, ок', u('БР').unit === 'БР' && u('БР').ok);
    ok('„кашон“ → КАШ (15.10)', u('кашон').unit === 'КАШ' && u('кашон').ok);
    ok('„пакет“ → ПАК, „чифт“ → ЧФТ (16.10); „пале“ → остава, НЕ е ок', u('пакет').unit === 'ПАК' && u('чифт').unit === 'ЧФТ' && u('пакет').ok && u('пале').unit === 'пале' && !u('пале').ok);
    ok('„xyz“ → остава, НЕ е ок', u('xyz').unit === 'xyz' && !u('xyz').ok);
    ok('„xyz“ → жълт маркер „МЕ не е по SAP“ в екрана на ЦО', !!h.doc.querySelector('#rv-row-i-2 .rv-unit-bad'));
    ok('„бр.“ → без маркер, показва БР', !h.doc.querySelector('#rv-row-i-1 .rv-unit-bad') && h.doc.getElementById('rv-row-i-1').textContent.indexOf('БР') >= 0);
  }

  section('4. Пипане на реда записва и предложенията');
  {
    const h = env(); await openCo(h, 'Кърджали');
    const c = pinkInput(h, 'i-1', 'co_comment'); c.value = 'ок'; fire(h.w, c, 'change'); await ticks(3);
    const p = h.calls.patch.find(x => x.table === 'revaluation_items');
    ok('PATCH на i-1: коментар + предложените код/цена/прехвърлено', p && p.url.indexOf('id=eq.i-1') >= 0 && p.body.co_comment === 'ок' &&
      p.body.new_sap_code === '8014557' && p.body.sale_price === 60 && p.body.co_qty === 2 && p.body.co_by === 'Елица Гюрова' && !!p.body.co_at, JSON.stringify(p && p.body));
    ok('само един ред записан', h.calls.patch.length === 1);
    const q = pinkInput(h, 'i-2', 'co_qty'); q.value = '1,23456'; fire(h.w, q, 'change'); await ticks(3);
    const p2 = h.calls.patch.pop();
    ok('прехвърлено до 3 знака (1,23456 → 1.235)', p2 && p2.body.co_qty === 1.235, JSON.stringify(p2 && p2.body));
    const bad = pinkInput(h, 'i-3', 'sale_price'); bad.value = '-1'; fire(h.w, bad, 'change'); await ticks(3);
    ok('отрицателна цена → отказ, без PATCH', h.calls.patch.length === 1);
  }

  section('5. „Готово“ отказва при незаписан код/цена');
  {
    const h = env(); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(4);
    ok('„Готово“ отказва при незаписан код — без PATCH на бланката', !h.calls.patch.some(x => x.table === 'revaluation_submissions'));
    ok('4 реда маркирани', h.doc.querySelectorAll('#rv-rows .rv-bad').length === 4);
    ok('toast с указание', h.calls.toast.some(t => t.indexOf('Приеми предложените') >= 0));
    ok('без известия', h.push.length === 0 && h.mail.length === 0);
    const priced = clone(ITEMS).map(it => Object.assign(it, { sale_price: 5, co_qty: it.qty }));
    const g = env({ items: priced }); await openCo(g, 'Кърджали');
    realClick(g.w, btn(mod(g), 'Готово за обект')); await ticks(4);
    ok('цената е записана, кодът не → пак отказ', !g.calls.patch.some(x => x.table === 'revaluation_submissions') && g.doc.querySelectorAll('#rv-rows .rv-bad').length === 4);
  }

  section('6. „Приеми предложените за всички“ → „Готово“ → processed + известия');
  {
    const items = clone(ITEMS);
    const h = env({ items }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Приеми предложените')); await ticks(10);
    const ps = h.calls.patch.filter(x => x.table === 'revaluation_items');
    ok('4 PATCH-а с предложенията', ps.length === 4 && ps.every(x => x.body.new_sap_code && x.body.sale_price > 0));
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(10);
    const sp = h.calls.patch.find(x => x.table === 'revaluation_submissions');
    ok('PATCH status processed + processed_at/by', sp && sp.body.status === 'processed' && !!sp.body.processed_at && sp.body.processed_by === 'Елица Гюрова');
    ok('push само до управителя на обекта (19.10.2026)', h.push.length === 1 && h.push[0].names.join(',') === 'Управител Кърджали', h.push[0] && h.push[0].names.join(','));
    ok('само обектът — Елица не е сред получателите', h.push[0] && h.push[0].names.indexOf('Елица Гюрова') < 0);
    const m = h.mail[0];
    ok('имейл само до управителя на обекта', m && m.to.join(',') === 'managerkardjali@temax.bg', m && m.to.join(','));
    ok('тема „Преоценка · Кърджали · <кампания>: обработена“', m && m.subj === 'Преоценка · Кърджали · Тестова преоценка Кърджали 10.2026: обработена');
    ok('копие до revaluation_done_cc', m && JSON.stringify(m.extra.cc) === '["t.tenev@temax.bg"]');
    ok('attachment в payload: xlsx, base64', m && m.extra.attachments && m.extra.attachments[0].content === 'QkFTRTY0' && /^preocenka-8-.*\.xlsx$/.test(m.extra.attachments[0].filename), JSON.stringify(m && m.extra.attachments));
    ok('тялото — таблица с кода и преоценения код', m && m.html.indexOf('14557') >= 0 && m.html.indexOf('8014557') >= 0 && m.html.indexOf('<table') >= 0);
    ok('статус „Обработена“, розовите вече само за четене', h.doc.getElementById('rv-status').textContent.indexOf('Обработена') === 0 && !pinkInput(h, 'i-1', 'new_sap_code'));
    ok('без жълт toast (всичко е тръгнало)', !h.calls.toast.some(t => t.indexOf('Обработено, но') >= 0));
    ok('„Отключи“ остава, „Готово“ изчезва', !!btn(mod(h), 'Отключи') && !btn(mod(h), 'Готово за обект'));
  }

  section('7. Известия — проблеми се казват, бланката остава processed');
  {
    const done = clone(ITEMS).map(it => Object.assign(it, { new_sap_code: '8' + ('000000' + it.sap_code).slice(-6), sale_price: 5, co_qty: it.qty }));
    let h = env({ items: done, settings: [], pushFail: true }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(10);
    ok('бланката е processed въпреки проблемите', h.w.rvSub.status === 'processed');
    const t = h.calls.toast.find(x => x.indexOf('Обработено, но') >= 0) || '';
    ok('жълт toast: без копие + push не тръгна', t.indexOf('без копие') >= 0 && t.indexOf('push не тръгна') >= 0, t);
    ok('имейлът пак тръгва (без cc)', h.mail.length === 1 && !h.mail[0].extra.cc);
    const noSub = Object.assign({}, SUB, { no_items: true });
    h = env({ subs: [noSub], items: [] }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(10);
    const m = h.mail[0];
    ok('бланка „нямат“ → „Готово“ без таблица и без прикачен файл', m && m.html.indexOf('<table') < 0 && !m.extra.attachments && m.html.indexOf('няма артикули') >= 0);
    ok('и без жълт toast за липсващ файл', !h.calls.toast.some(x => x.indexOf('без прикачен файл') >= 0));
  }

  section('8. „Отключи бланката“ → draft, обектът пак може');
  {
    const proc = Object.assign({}, SUB, { status: 'processed', processed_at: new Date().toISOString(), processed_by: 'Елица Гюрова' });
    const h = env({ subs: [proc] }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Отключи бланката')); await ticks(5);
    const p = h.calls.patch.find(x => x.table === 'revaluation_submissions');
    ok('PATCH draft + reopened_at/by, processed_* = null', p && p.body.status === 'draft' && !!p.body.reopened_at && p.body.reopened_by === 'Елица Гюрова' && p.body.processed_at === null);
    const draft = Object.assign({}, SUB, { status: 'draft', reopened_at: new Date().toISOString() });
    const s = env({ user: KARDZHALI, subs: [draft] }); await s.w.loadRevaluation(); await ticks(6);
    ok('обектът след отключване — „Подай“ и „Изтрий ред“', !!btn(mod(s), 'Подай') && !!btn(mod(s), 'Изтрий ред'));
    const c0 = env({ confirm: false, subs: [proc] }); await openCo(c0, 'Кърджали');
    realClick(c0.w, btn(mod(c0), 'Отключи бланката')); await ticks(3);
    ok('без потвърждение → нищо', !c0.calls.patch.length);
  }

  section('9. Обектът при processed бланка');
  {
    const proc = Object.assign({}, SUB, { status: 'processed', processed_at: new Date().toISOString() });
    const items = clone(ITEMS).slice(0, 2);
    items[0].new_sap_code = '8014557'; items[0].sale_price = 60; items[0].co_qty = 2; items[0].co_comment = 'ок';
    items[1].new_sap_code = '8082216'; items[1].sale_price = 7; items[1].co_qty = 1;
    const h = env({ user: KARDZHALI, subs: [proc], items }); await h.w.loadRevaluation(); await ticks(6);
    ok('обектът при processed: без бутони за редакция', !btn(mod(h), 'Изтрий ред') && !btn(mod(h), 'Подай') && !btn(mod(h), '＋ Ред') && !btn(mod(h), 'Качи файл') && !btn(mod(h), 'Нямаме'));
    ok('без полета в редовете', h.doc.querySelectorAll('#rv-rows input').length === 0);
    ok('вижда розовите колони (само четене)', h.doc.getElementById('rv-row-i-1').textContent.indexOf('8014557') >= 0 && h.doc.getElementById('rv-row-i-1').textContent.indexOf('ок') >= 0);
    ok('без бутоните на ЦО', !btn(mod(h), 'Готово') && !btn(mod(h), 'Отключи'));
    realClick(h.w, btn(mod(h), 'Копирай новите кодове')); await ticks(3);
    ok('clipboard получава „8014557\\n8082216“', h.clip === '8014557\n8082216', JSON.stringify(h.clip));
    realClick(h.w, btn(mod(h), 'Изтегли моята бланка'));
    const r = h.aoas[0] && h.aoas[0].find(x => x[1] === '14557');
    ok('„Изтегли моята бланка“ с попълнени I–K', r && r[8] === '8014557' && r[9] === 60 && r[10] === 'ок');
    ok('МЕ в износа по SAP („бр.“ → БР)', r && r[4] === 'БР');
    ok('M = прехвърлено × цена (2 × 60 = 120)', r && r[12] === 120);
    const rg = env({ user: REG_K, subs: [proc], items }); await openCo(rg, 'Кърджали');
    ok('регионалният при processed: без бутони за редакция', !btn(mod(rg), 'Изтрий ред') && !btn(mod(rg), 'Качи файл') && !btn(mod(rg), '＋ Ред'));
    const rgs = env({ user: REG_K, subs: [Object.assign({}, SUB, { status: 'submitted' })] }); await openCo(rgs, 'Кърджали');
    ok('…а при submitted регионалният пише (контрол)', !!btn(mod(rgs), 'Изтрий ред'));
    const c = env({ user: KARDZHALI, subs: [Object.assign({}, SUB, { status: 'submitted' })] }); await c.w.loadRevaluation(); await ticks(6);
    ok('при submitted — без „Копирай новите кодове“ и без розови колони', !btn(mod(c), 'Копирай') && c.doc.getElementById('rv-row-i-1').textContent.indexOf('8014557') < 0);
  }

  section('10. Excel — кампания: лист на обект + „Общо“');
  {
    const subs = [SUB, Object.assign({}, SUB, { id: 's-2', store_name: 'Шумен', status: 'processed' }), Object.assign({}, SUB, { id: 's-3', store_name: 'Добрич', no_items: true }),
      Object.assign({}, SUB, { id: 's-4', store_name: 'Габрово', status: 'draft' })];
    const items = clone(ITEMS);
    items[0].co_qty = 2; items[0].sale_price = 60; items[0].new_sap_code = '8014557';
    items[1].co_qty = 1.23456; items[1].sale_price = 7;
    items[2].co_qty = 0; items[2].sale_price = 4.5;
    items.push({ id: 'i-9', submission_id: 's-2', campaign_id: 'c-1', store_name: 'Шумен', sort_order: 1, sap_code: '53531', product_name: 'АРКА', unit: 'БР', qty: 1, std_price: 17.79, proposed_price: 8.9, co_qty: 1, sale_price: 8.9 });
    items.push({ id: 'i-x', submission_id: 's-4', campaign_id: 'c-1', store_name: 'Габрово', sort_order: 1, sap_code: '1', qty: 1 });
    const h = env({ subs, items }); await openCo(h);
    await h.w.rvExportCampaign(); await ticks(5);
    ok('листове: 8 (Кърджали), 14 (Шумен), „Общо“; без чернова и „нямат“', h.sheets.join(',') === '8,14,Общо', h.sheets.join(','));
    const tot = h.aoas[h.aoas.length - 1];
    ok('„Общо“ — 13 колони + Прехвърлено + TOTAL', tot[0].length === 15 && tot[0][13] === 'Прехвърлено' && tot[0][14] === 'TOTAL');
    const r1 = tot.find(x => x[1] === '14557');
    ok('TOTAL = co_qty × sale_price (2 × 60,00 = 120,00)', r1 && r1[14] === 120, r1 && r1[14]);
    const r2 = tot.find(x => x[1] === '82216');
    ok('3 знака в количеството (1,235)', r2 && r2[13] === 1.235 && r2[3] === 1.235, r2 && (r2[13] + ' / ' + r2[3]));
    const r3 = tot.find(x => x[1] === '8025298');
    ok('ред с co_qty 0 → TOTAL 0, не грешка', r3 && r3[14] === 0 && r3[13] === 0);
    const r4 = tot.find(x => x[1] === '103125');
    ok('без co_qty → TOTAL празно', r4 && r4[14] === '' && r4[13] === '');
    const last = tot[tot.length - 1];
    ok('ред ОБЩО = сумата (120 + 8,65 + 0 + 8,9 = 137,55; 1,235 × 7 = 8,645 → 8,65)', last[0] === 'ОБЩО' && last[14] === 137.55, last[14]);
    ok('файл preocenka-kampania-…', /^preocenka-kampania-/.test(h.files[0] && h.files[0].f));
    const f = env({ fail: { GET: /revaluation_items\?campaign_id/ } }); await openCo(f);
    await f.w.rvExportCampaign(); await ticks(5);
    ok('паднало четене → Excel НЕ е направен, червен toast', !f.files.length && f.calls.toast.some(t => t.indexOf('непълни') >= 0));
  }

  section('11. supply — само чете; затворена кампания');
  {
    const h = env({ user: { email: 'sn@temax.bg', display_name: 'Снаб', role: 'supply', store_name: 'Централен офис' } }); await openCo(h, 'Кърджали');
    ok('supply вижда розовите (предложенията не се показват), без полета', h.doc.querySelectorAll('#rv-rows input').length === 0 && !!h.doc.querySelector('#rv-rows'));
    ok('supply — без „Готово“/„Отключи“/„Приеми“', !btn(mod(h), 'Готово') && !btn(mod(h), 'Отключи') && !btn(mod(h), 'Приеми'));
    ok('supply — Excel кампания има', !!btn(mod(h), 'Excel — кампания'));
    const closed = Object.assign({}, CAMP, { status: 'closed' });
    const proc = Object.assign({}, SUB, { status: 'processed', processed_at: new Date().toISOString() });
    const c = env({ campaigns: [closed], subs: [proc] }); await openCo(c, 'Кърджали');
    ok('processed при затворена кампания — отваря се, статус „Обработена“', c.doc.getElementById('rv-status').textContent.indexOf('Обработена') === 0);
    ok('…и може да се отключи', !!btn(mod(c), 'Отключи'));
  }

  section('12. Нищо тихо при нормален път');
  {
    const h = env({ items: clone(ITEMS) }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Приеми предложените')); await ticks(10);
    ok('нула notOk', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
    const f = env({ fail: { PATCH: /revaluation_items/ } }); await openCo(f, 'Кърджали');
    const c = pinkInput(f, 'i-1', 'co_comment'); c.value = 'x'; fire(f.w, c, 'change'); await ticks(4);
    ok('провален PATCH → ⚠ на реда + червен toast', !!f.doc.querySelector('#rv-row-i-1 .rv-err') && f.calls.toast.some(t => t.indexOf('Редът не е записан') >= 0));
  }

  report();
})();
