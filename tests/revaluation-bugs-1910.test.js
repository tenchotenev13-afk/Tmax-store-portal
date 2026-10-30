/* Преоценка — 7 поправки преди отваряне за обектите (решения на Тенчо, 19.10.2026).
   Интеграционно: shared.js + admin.js + stock-returns.js + push.js + email.js
   + revaluation.js в реда от index.html; push и имейл са стъбнати, XLSX е фалшив.

   1. Надписът за прозореца — различен за ЦО и за обекта.
   2. „🔓 Отключи бланката“ — само при rvStoresOn и отворен прозорец.
   3. Отключването пише no_items = false.
   4. rvSapUnit — само стойностите от списъка (L, KG, M, TOM → не е ок).
   5. „Прехвърлено“ задължително за „Готово“; Тотал = TOTAL при празно co_qty.
   6. MM41 / VK11 — само ЦО (не supply); VK11 предупреждава за МЕ не по SAP.
   7. „Готово“ — само до управителя; копието тръгва винаги.

   Мутационна проверка (19.10.2026) — всеки вариант е пуснат и е паднал:
     M2 rvCoCanUnlock() връща винаги true
        → пада „rvStoresOn=false → бутонът е disabled“;
     M4 върнат регексът /^[A-ZА-Я0-9]+$/ в rvSapUnit
        → пада „KG → не е ок“;
     M5 махната проверката за co_qty в rvCoDone
        → пада „празно co_qty → „Готово“ отказва“;
     M6 VK11 отново преди `if(!rvIsCO()) return h;`
        → пада „supply: без бутон VK11“;
     M7 махнат филтърът по role === 'manager' в rvCoNotifyDone
        → пада „push само до управителя“.
   Допълнително паднаха: M1 (ЦО с текста на обекта), M3 (без no_items в
   PATCH-а), M5b (Тотал пада обратно към qty), M6b (rvMm41 за rvIsCoViewer),
   M7b (без cc като основен получател).
     M8 VK11 toast без списъка „МЕ не е по SAP“ (20.10.2026)
        → пада „toast „VK11: 3 реда · МЕ не е по SAP: 8014557 (KG), 8033333 (L)““.
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, btn, section, report, dayOffset, ticks } = H;

const OPEN = { id: 'c-1', title: 'Преоценка 10.2026', kind: 'mandatory', starts_on: dayOffset(-3), ends_on: dayOffset(5), default_pct: 50, status: 'open' };
const EXPIRED = Object.assign({}, OPEN, { starts_on: dayOffset(-10), ends_on: dayOffset(-1) });
const CLOSED = Object.assign({}, OPEN, { status: 'closed' });
const SUB = { id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: 'submitted', no_items: false, submitted_at: new Date().toISOString(), default_pct: null };
const PROC = Object.assign({}, SUB, { status: 'processed', processed_at: new Date().toISOString(), processed_by: 'Елица Гюрова' });
function item(id, o) {
  return Object.assign({ id, submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sort_order: 1, sap_code: '14557', product_name: 'ЛАМПА',
    unit: 'бр.', qty: 2, std_price: 120, discount_pct: 50, proposed_price: 60, store_comment: 'стар модел',
    new_sap_code: '8014557', sale_price: 60, co_qty: 2 }, o || {});
}
const ADMIN = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис' };
const SUPPLY = { email: 'sn@temax.bg', display_name: 'Снаб', role: 'supply', store_name: 'Централен офис' };
const STORE = { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const USERS_K = [
  { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали', active: true },
  { email: 'kasa.kardjali@temax.bg', display_name: 'Каса Кърджали', role: 'kasa', store_name: 'Кърджали', active: true },
  { email: 'sklad.kardjali@temax.bg', display_name: 'Склад Кърджали', role: 'sklad', store_name: 'Кърджали', active: true },
  { email: 'old.manager@temax.bg', display_name: 'Стар управител', role: 'manager', store_name: 'Кърджали', active: false }
];
const CC = [{ key: 'revaluation_done_cc', value: 't.tenev@temax.bg' }];

function env(o) {
  o = o || {};
  const users = o.users || USERS_K;
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user: o.user || ADMIN,
    confirm: o.confirm,
    data: {
      revaluation_campaigns: [o.campaign || OPEN],
      revaluation_submissions: () => o.subs || [SUB],
      revaluation_items: () => o.items || [item('i-1')],
      revaluation_codes: [],
      stores: [{ name: 'Кърджали' }, { name: 'Шумен' }, { name: 'Централен офис' }],
      /* Мокът филтрира САМО по обект — role/active ги филтрира кодът. */
      users: url => url.indexOf('store_name=eq.') >= 0
        ? users.filter(u => url.indexOf('store_name=eq.' + encodeURIComponent(u.store_name)) >= 0)
        : users,
      app_settings: o.settings || CC
    },
    globals: {
      pushToPeople: (names, title, msg) => { h.push.push({ names, title, msg }); return Promise.resolve({ ok: true }); },
      sendEmail: (to, subj, html, extra) => { h.mail.push({ to, subj, html, extra: extra || {} }); return Promise.resolve({ ok: true }); }
    }
  });
  h.push = []; h.mail = []; h.aoas = []; h.files = [];
  h.w.rvStoresOn = o.storesOn === undefined ? true : o.storesOn;
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: a => { h.aoas.push(a); return { __aoa: a }; },
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); wb.Sheets[n] = ws; }
    },
    write: () => 'QkFTRTY0',
    writeFile: (wb, f) => { h.files.push(f); }
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const win = h => { const el = h.doc.getElementById('rv-window'); return el ? el.textContent : ''; };
async function openCo(h, store) { await h.w.loadRevaluation(); await ticks(5); if (store) { await h.w.rvCoOpenStore(store); await ticks(5); } }

(async function run() {

  section('1. Надписът за прозореца — ЦО и обект');
  {
    let h = env({ campaign: EXPIRED }); await openCo(h);
    ok('ЦО, изтекла: „Кампанията е извън прозореца — обектите не могат да подават. Обработката от ЦО продължава.“',
      win(h) === 'Кампанията е извън прозореца — обектите не могат да подават. Обработката от ЦО продължава.', win(h));
    ok('ЦО: без „само за четене“', win(h).indexOf('само за четене') < 0);
    h = env({ campaign: CLOSED }); await openCo(h, 'Кърджали');
    ok('ЦО, затворена (в бланката): „Кампанията е затворена — обектите не могат да подават. Обработката от ЦО продължава.“',
      win(h) === 'Кампанията е затворена — обектите не могат да подават. Обработката от ЦО продължава.', win(h));
    h = env({ campaign: EXPIRED, user: SUPPLY }); await openCo(h);
    ok('supply (ЦО зрител) — същият текст', win(h).indexOf('Обработката от ЦО продължава') >= 0);
    h = env({ campaign: EXPIRED, user: STORE }); await openCo(h);
    ok('обект, изтекла: старият текст', win(h) === 'Извън прозореца на кампанията — бланката е само за четене.', win(h));
    h = env({ campaign: CLOSED, user: STORE }); await openCo(h);
    ok('обект, затворена: старият текст', win(h) === 'Кампанията е затворена — само за четене.', win(h));
    ok('обект: без „Обработката от ЦО“', win(h).indexOf('Обработката от ЦО') < 0);
    h = env(); await openCo(h);
    ok('отворена кампания в прозореца → без надпис', !h.doc.getElementById('rv-window'));
  }

  section('2. „Отключи бланката“ — само когато обектът може да подаде наново');
  {
    const TITLE = 'Обектът не може да подаде наново — кампанията е извън прозореца или Преоценка е скрита за този обект';
    let h = env({ subs: [PROC], storesOn: false }); await openCo(h, 'Кърджали');
    let b = btn(mod(h), 'Отключи бланката');
    ok('rvStoresOn=false → бутонът е показан, но disabled', !!b && b.disabled === true);
    ok('…с title за причината', b && b.getAttribute('title') === TITLE, b && b.getAttribute('title'));
    realClick(h.w, b); await ticks(4);
    ok('…и извикан (клик) → отказ без запис, toast с причината', !h.calls.patch.some(x => x.table === 'revaluation_submissions') && h.calls.toast.indexOf(TITLE) >= 0);
    ok('…без confirm', h.calls.confirm.length === 0);

    h = env({ subs: [PROC], campaign: EXPIRED }); await openCo(h, 'Кърджали');
    b = btn(mod(h), 'Отключи бланката');
    ok('изтекла кампания (on) → disabled', !!b && b.disabled === true);
    await h.w.rvCoUnlock(); await ticks(3);
    ok('rvCoUnlock() отвън → отказ, без PATCH', !h.calls.patch.length && h.calls.toast.indexOf(TITLE) >= 0);

    h = env({ subs: [PROC], campaign: CLOSED }); await openCo(h, 'Кърджали');
    b = btn(mod(h), 'Отключи бланката');
    ok('затворена кампания → disabled', !!b && b.disabled === true);

    h = env({ subs: [PROC] }); await openCo(h, 'Кърджали');
    b = btn(mod(h), 'Отключи бланката');
    ok('отворена + on → активен, без title', !!b && !b.disabled && !b.getAttribute('title'));
    realClick(h.w, b); await ticks(5);
    const p = h.calls.patch.find(x => x.table === 'revaluation_submissions');
    ok('…клик → PATCH draft', p && p.body.status === 'draft');
  }

  section('3. Отключване пише no_items = false');
  {
    const noSub = Object.assign({}, SUB, { no_items: true });
    const h = env({ subs: [noSub], items: [] }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Отключи бланката')); await ticks(5);
    const p = h.calls.patch.find(x => x.table === 'revaluation_submissions');
    ok('PATCH: status draft + no_items false', p && p.body.status === 'draft' && p.body.no_items === false, p && JSON.stringify(p.body));
    ok('rvSub.no_items = false след отключване', h.w.rvSub.no_items === false);
    ok('статусът е „Чернова“, не „Нямат“', h.doc.getElementById('rv-status').textContent === 'Чернова');
    /* обектът вижда обикновена чернова — пак може да добавя редове или „нямаме“ */
    const draft = Object.assign({}, SUB, { status: 'draft', no_items: false });
    const s = env({ user: STORE, subs: [draft], items: [] }); await s.w.loadRevaluation(); await ticks(6);
    ok('обектът след отключване: „＋ Ред“, „Подай“ и „Нямаме за преоценка“', !!btn(mod(s), 'Ред') && !!btn(mod(s), 'Подай') && !!btn(mod(s), 'Нямаме за преоценка'));
  }

  section('4. rvSapUnit — само по SAP списъка');
  {
    const h = env();
    const u = h.w.rvSapUnit;
    ['KG', 'L', 'M', 'TOM'].forEach(x => { const r = u(x); ok('„' + x + '“ → не е ок (остава ' + x + ')', r.ok === false && r.unit === x, JSON.stringify(r)); });
    ok('„кг“ → КГ, ок', u('кг').unit === 'КГ' && u('кг').ok === true);
    ok('„M2“ (латинско, от ZSTOCK) → ок', u('M2').ok === true && u('M2').unit === 'M2');
    ok('„БР“ → ок', u('БР').ok === true);
    ok('„ABC“ → не е ок', u('ABC').ok === false);
    const g = env({ items: [item('i-1', { unit: 'KG' })] }); await openCo(g, 'Кърджали');
    ok('ред с МЕ „KG“ → жълт маркер „МЕ не е по SAP“', !!g.doc.querySelector('#rv-row-i-1 .rv-unit-bad'));
  }

  section('5. „Прехвърлено“ е задължително за „Готово“');
  {
    let h = env({ items: [item('i-1'), item('i-2', { sap_code: '82216', new_sap_code: '8082216', co_qty: null })] }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(5);
    ok('празно co_qty → „Готово“ отказва, без PATCH', !h.calls.patch.some(x => x.table === 'revaluation_submissions'));
    const bad = h.doc.querySelector('#rv-row-i-2 .rv-bad');
    ok('маркер на реда „няма прехвърлено количество“', !!bad && bad.textContent.indexOf('няма прехвърлено количество') >= 0, bad && bad.textContent);
    ok('редът с прехвърлено не е маркиран', !h.doc.querySelector('#rv-row-i-1 .rv-bad'));
    ok('toast „1 ред е без записан код/цена/прехвърлено … Нищо не е обработено.“',
      h.calls.toast.some(t => t.indexOf('1 ред е без записан код/цена/прехвърлено — „Приеми предложените“ или попълни. Нищо не е обработено.') === 0), h.calls.toast.join(' | '));
    ok('без известия', !h.push.length && !h.mail.length);

    h = env({ items: [item('i-1', { co_qty: 0 })] }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(10);
    const sp = h.calls.patch.find(x => x.table === 'revaluation_submissions');
    ok('co_qty = 0 → минава (processed)', sp && sp.body.status === 'processed');
  }

  section('5б. Тотал преоценка = TOTAL — и двете по co_qty');
  {
    const items = [item('i-1'), item('i-2', { sap_code: '82216', new_sap_code: '8082216', sale_price: 7, co_qty: null, qty: 3 })];
    const h = env({ items }); await openCo(h);
    await h.w.rvExportCampaign(); await ticks(5);
    const sheet = h.aoas[0], total = h.aoas[h.aoas.length - 1];
    const s1 = sheet.find(r => r[1] === '14557'), s2 = sheet.find(r => r[1] === '82216');
    const t1 = total.find(r => r[1] === '14557'), t2 = total.find(r => r[1] === '82216');
    ok('лист: Тотал преоценка = 2 × 60 = 120', s1 && s1[12] === 120, s1 && s1[12]);
    ok('Общо: TOTAL = 120 (същото)', t1 && t1[14] === 120 && t1[12] === 120);
    ok('празно co_qty → Тотал преоценка празно (без падане към qty)', s2 && s2[12] === '', s2 && s2[12]);
    ok('празно co_qty → TOTAL празно', t2 && t2[14] === '' && t2[12] === '' && t2[13] === '');
    ok('ОБЩО = 120', total[total.length - 1][14] === 120);
  }

  section('6. MM41 и VK11 — само ЦО');
  {
    let h = env({ user: SUPPLY }); await openCo(h);
    ok('supply, обзор: без бутон MM41', !btn(mod(h), 'MM41'));
    ok('supply: „Excel — кампания“ остава', !!btn(mod(h), 'Excel — кампания'));
    const r1 = await h.w.rvMm41(); await ticks(4);
    ok('supply: rvMm41() → отказ, без файл', r1 === false && !h.files.length);
    await h.w.rvCoOpenStore('Кърджали'); await ticks(5);
    ok('supply, бланка: без бутон VK11', !btn(mod(h), 'VK11'));
    ok('supply: „Excel — този обект“ остава', !!btn(mod(h), 'Excel — този обект'));
    const r2 = h.w.rvVk11(); await ticks(2);
    ok('supply: rvVk11() → отказ, без файл', r2 === false && !h.files.length);

    h = env(); await openCo(h);
    await h.w.rvCoOpenStore('Кърджали'); await ticks(5);
    ok('admin: MM41 има (в бланката, 30.10.2026)', !!btn(mod(h), 'MM41'));
    ok('admin: VK11 има', !!btn(mod(h), 'VK11'));
    realClick(h.w, btn(mod(h), 'VK11')); await ticks(2);
    ok('admin: VK11 прави файл', h.files.length === 1 && /^VK11-/.test(h.files[0]), h.files.join(','));
    ok('VK11 с МЕ по SAP → toast „VK11: 1 реда“ без предупреждение', h.calls.toast.indexOf('VK11: 1 реда') >= 0, h.calls.toast.join(' | '));

    /* МЕ не по SAP → жълто предупреждение като при MM41, файлът пак се прави (20.10.2026) */
    const items = [item('i-1', { unit: 'KG' }), item('i-2', { sap_code: '82216', new_sap_code: '8082216' }),
      item('i-3', { sap_code: '33333', new_sap_code: '8033333', unit: 'L' })];
    h = env({ items }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'VK11')); await ticks(2);
    ok('VK11 с KG и L → файлът пак е направен', h.files.length === 1 && /^VK11-/.test(h.files[0]), h.files.join(','));
    ok('toast „VK11: 3 реда · МЕ не е по SAP: 8014557 (KG), 8033333 (L)“',
      h.calls.toast.indexOf('VK11: 3 реда · МЕ не е по SAP: 8014557 (KG), 8033333 (L)') >= 0, h.calls.toast.join(' | '));
  }

  section('7. Известие „Готово“ — само управителят; копието винаги');
  {
    let h = env(); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(10);
    ok('push само до управителя (без каса, склад и неактивния)', h.push.length === 1 && h.push[0].names.join(',') === 'Управител Кърджали', h.push[0] && h.push[0].names.join(','));
    const m = h.mail[0];
    ok('имейл само до управителя', m && m.to.join(',') === 'managerkardjali@temax.bg', m && m.to.join(','));
    ok('копие до revaluation_done_cc', m && JSON.stringify(m.extra.cc) === '["t.tenev@temax.bg"]');
    ok('без жълт toast', !h.calls.toast.some(t => t.indexOf('Обработено, но') >= 0));

    const noMgr = USERS_K.filter(u => u.role !== 'manager' || !u.active);
    h = env({ users: noMgr }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(10);
    ok('бланката е processed', h.w.rvSub.status === 'processed');
    const m2 = h.mail[0];
    ok('без имейл на управител → копието е основен получател', h.mail.length === 1 && m2.to.join(',') === 't.tenev@temax.bg' && !m2.extra.cc, m2 && JSON.stringify({ to: m2.to, cc: m2.extra.cc }));
    ok('toast „обектът няма имейл на управител — пратено само до копието“', h.calls.toast.some(t => t.indexOf('обектът няма имейл на управител — пратено само до копието') >= 0), h.calls.toast.join(' | '));
    ok('без push до каса/склад', !h.push.some(p => p.names.length));

    h = env({ users: noMgr, settings: [] }); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(10);
    ok('без управител и без копие → нищо не тръгва, казва се', !h.mail.length && h.calls.toast.some(t => t.indexOf('обектът няма имейл на управител и няма копие') >= 0));
  }

  report();
})();
