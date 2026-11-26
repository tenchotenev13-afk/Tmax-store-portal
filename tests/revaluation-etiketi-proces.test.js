/* Преоценка — пропуските в процеса около етикетите (25.11.2026, сесия
   preocenka-etiketi-proces):
   А. етикетите следват „Прехвърлено" (co_qty): БР с по-малко прехвърлени от
      номерата → избор на бройките; co_qty = 0 → нищо; M2 и др. → 1 при co_qty > 0;
   Б. „Цените важат от" (revaluation_submissions.prices_valid_from) — поле в
      потвърждението на „✅ Готово за обект", показване, етикет, VK11, История;
   В. известието „обработена" — датата + „Отпечатайте етикетите…";
      бележката в бланката на обекта.
   Г. (бележката след „Добави") е в tests/revaluation-units.test.js, секции 1, 4, 6.

   Интеграционно: shared.js + admin.js + stock-returns.js + push.js +
   email.js + loading.js + revaluation.js + revisions.js, в реда от index.html.
   Мутационна проверка — в лога claude/log/2026-11-25-preocenka-etiketi-proces.md.
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, section, report, dayOffset, ticks } = H;

const CAMP = { id: 'c-1', title: 'Пожелателна преоценка 11.2026', kind: 'optional', starts_on: dayOffset(-1), ends_on: dayOffset(5), default_pct: 50, status: 'open', note: null };
const STORE_USER = { email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const SKLAD = { email: 'sklad.kj@temax.bg', display_name: 'Склад Кърджали', role: 'sklad', store_name: 'Кърджали' };
const ADMIN = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис' };
const REG_ACC = { email: 'reg@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Кърджали'] };
const SUB = (st, o) => Object.assign({ id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: st, no_items: false, default_pct: 50,
  submitted_at: '2026-11-12T10:00:00Z', approved_at: '2026-11-12T11:00:00Z', processed_at: st === 'processed' ? '2026-11-13T12:07:57Z' : null, prices_valid_from: null }, o || {});
const IT = (id, o) => Object.assign({ id: id, submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sort_order: 1, sap_code: '61540',
  product_name: 'Артикул ' + id, unit: 'БР', qty: 1, std_price: 12.98, discount_pct: 50, proposed_price: 6.49,
  store_comment: 'дефект', new_sap_code: '80' + id, sale_price: 3 }, o || {});
const UNITS = (item, n, from) => Array.from({ length: n }, (_, k) => ({ id: 'u-' + item + '-' + k, item_id: item, submission_id: 's-1', store_name: 'Кърджали',
  unit_no: 'Кърджали-П' + String((from || 1) + k).padStart(4, '0'), created_at: '2026-11-10T10:00:0' + (k % 10) + 'Z' }));
const USERS = [{ display_name: 'Управител Кърджали', email: 'managerkardjali@temax.bg', role: 'manager', store_name: 'Кърджали', active: true }];

function env(o) {
  o = o || {};
  const db = { subs: (o.subs || []).map(x => Object.assign({}, x)), items: (o.items || []).map(x => Object.assign({}, x)), units: (o.units || []).slice() };
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'loading.js', 'revaluation.js', 'revisions.js'],
    user: o.user || STORE_USER,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: () => db.subs,
      revaluation_items: () => db.items,
      revaluation_units: () => db.units,
      revaluation_codes: [],
      stores: [{ name: 'Кърджали' }],
      users: USERS,
      product_catalog: [],
      app_settings: [{ key: 'revaluation_stores', value: 'Кърджали' }, { key: 'revaluation_done_cc', value: 't.tenev@temax.bg' }]
    },
    confirm: true,
    globals: {
      pushToPeople: (names, title, msg) => { h.push.push({ names, title, msg }); return Promise.resolve({ ok: true }); },
      sendEmail: (to, subj, html, extra) => { h.mail.push({ to, subj, html, extra: extra || {} }); return Promise.resolve({ ok: true }); }
    }
  });
  h.db = db;
  h.push = []; h.mail = []; h.files = [];
  h.colors = [];
  const t0 = h.w.toast;
  h.w.toast = (msg, c) => { h.colors.push(c); return t0(msg, c); };
  h.w.rvStoresOn = false; h.w.rvStoresList = ['Кърджали'];
  h.w.XLSX = {
    utils: { book_new: () => ({ s: [] }), aoa_to_sheet: (aoa) => ({ aoa }), book_append_sheet: (wb, sh, n) => wb.s.push({ sh, n }) },
    writeFile: (wb, f) => { h.files.push({ f, wb }); },
    write: () => 'QkFTRTY0'
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const $ = (h, id) => h.doc.getElementById(id);
const lblBtn = h => Array.prototype.find.call(mod(h).querySelectorAll('button'), b => /🏷 Етикети/.test(b.textContent));
const lastToast = h => { const t = h.calls.toast[h.calls.toast.length - 1]; return t ? [].concat(t).join(' ') : ''; };
const labels = h => Array.prototype.slice.call(h.doc.querySelectorAll('#rv-lbl-sheets .rv-lbl'));
const unitsOf = h => labels(h).map(l => { const u = l.querySelector('.rv-lbl-unit'); return u ? u.textContent.replace('№ Кърджали-', '') : '—'; });
const subPatch = h => h.calls.patch.filter(p => /revaluation_submissions/.test(p.url));
async function open(h, user) {
  await h.w.loadRevaluation(); await ticks(6);
  if ((user || STORE_USER).role !== 'manager' && (user || STORE_USER).role !== 'sklad') { await h.w.rvCoOpenStore('Кърджали'); await ticks(6); }
}
async function openModal(h) { realClick(h.w, lblBtn(h)); await ticks(2); return $(h, 'rv-lbl-modal'); }
async function printIt(h) { realClick(h.w, $(h, 'rv-lbl-print')); await ticks(2); }
const uChk = (h, item) => Array.prototype.slice.call(h.doc.querySelectorAll('#rv-lbl-modal .rv-lbl-u[data-id="' + item + '"]'));
function setDate(h, id, val) { const el = $(h, id); el.value = val; fire(h.w, el, 'change'); }
const DONE_ITEMS = () => [IT('1', { qty: 2, co_qty: 2, new_sap_code: '8061540', sale_price: 3 })];

(async function run() {

  section('А1. БР, 3 номера, co_qty 2 → отметнати първите 2, печат 2; смяна на отметките → печатат се избраните');
  {
    const h = env({ subs: [SUB('processed')], items: [IT('1', { qty: 3, co_qty: 2 })], units: UNITS('1', 3) });
    await open(h);
    await openModal(h);
    const pick = h.doc.querySelector('#rv-lbl-modal .rv-lbl-pick');
    ok('бележка „прехвърлени 2 от 3 — отметни кои бройки"', !!pick && /прехвърлени 2 от 3 — отметни кои бройки/.test(pick.textContent), pick && pick.textContent);
    const u = uChk(h, '1');
    ok('3 отметки за бройките, отметнати П0001 и П0002', u.length === 3 && u[0].checked && u[1].checked && !u[2].checked, u.map(c => c.dataset.u + ':' + c.checked).join(' '));
    await printIt(h);
    ok('печат: 2 етикета — П0001, П0002', JSON.stringify(unitsOf(h)) === '["П0001","П0002"]', JSON.stringify(unitsOf(h)));
    realClick(h.w, btn($(h, 'mod-print'), '← Назад')); await ticks(6);
    await openModal(h);
    let c = uChk(h, '1');
    c[0].click(); c[2].click();   /* махам П0001, слагам П0003 — клик на отметката (без onclick — realClick иска атрибут) */
    ok('кликът сменя отметките', !c[0].checked && c[1].checked && c[2].checked);
    /* смяна на вида пази избора на бройките */
    $(h, 'rv-lbl-kind-big').checked = true; fire(h.w, $(h, 'rv-lbl-kind-big'), 'change'); await ticks(1);
    c = uChk(h, '1');
    ok('смяна на вида пази избраните бройки (П0002, П0003)', !c[0].checked && c[1].checked && c[2].checked);
    await printIt(h);
    ok('печат: избраните — П0002, П0003', JSON.stringify(unitsOf(h)) === '["П0002","П0003"]', JSON.stringify(unitsOf(h)));
  }

  section('А1б. co_qty = 0 → нито един етикет, редът е сив; co_qty ≥ номерата → всички');
  {
    const items = [IT('1', { qty: 2, co_qty: 0, sort_order: 1 }), IT('2', { qty: 2, co_qty: 2, sort_order: 2 })];
    const h = env({ subs: [SUB('processed')], items, units: UNITS('1', 2).concat(UNITS('2', 2, 3)) });
    await open(h);
    await openModal(h);
    const r1 = $(h, 'rv-lbl-row-1');
    ok('ред с co_qty 0: сив, „нищо не е прехвърлено", отметката е изключена и празна', !!r1 && r1.classList.contains('rv-lbl-row-zero') && /нищо не е прехвърлено/.test(r1.textContent) &&
      r1.querySelector('.rv-lbl-chk').disabled && !r1.querySelector('.rv-lbl-chk').checked, r1 && r1.textContent);
    ok('ред с co_qty 2 = 2 номера → без избор на бройки', uChk(h, '2').length === 0);
    await printIt(h);
    ok('печат: само ред 2 — П0003, П0004', JSON.stringify(unitsOf(h)) === '["П0003","П0004"]', JSON.stringify(unitsOf(h)));
    /* само нулев ред → нищо */
    const g = env({ subs: [SUB('processed')], items: [IT('1', { qty: 1, co_qty: 0 })], units: UNITS('1', 1) });
    await open(g); await openModal(g); await printIt(g);
    ok('само ред с co_qty 0 → 0 етикета, червен toast', labels(g).length === 0 && /Не е отметнат нито един ред/.test(lastToast(g)), lastToast(g));
  }

  section('А2. Един номер (M2): печата се при co_qty > 0; повторна преоценка — всички; стара бланка без номера');
  {
    const items = [IT('1', { unit: 'M2', qty: 9.33, co_qty: 6.48, sort_order: 1 }), IT('2', { unit: 'M2', qty: 6.178, co_qty: 0, sort_order: 2 }),
      IT('3', { sap_code: '8061540', qty: 2, co_qty: null, sort_order: 3 }), IT('4', { qty: 1, co_qty: 1, sort_order: 4 })];
    const h = env({ subs: [SUB('processed')], items, units: UNITS('1', 1, 1).concat(UNITS('2', 1, 2)).concat(UNITS('3', 2, 3)) });
    await open(h); await openModal(h); await printIt(h);
    ok('M2 co 6,48 → 1 (П0001); M2 co 0 → 0; повторна 2 → П0003, П0004; стар ред без номер → 1', JSON.stringify(unitsOf(h)) === '["П0001","П0003","П0004","—"]', JSON.stringify(unitsOf(h)));
    /* стара бланка без номера и co_qty 0 → нищо */
    const g = env({ subs: [SUB('processed')], items: [IT('1', { co_qty: 0, sort_order: 1 }), IT('2', { co_qty: 3, qty: 3, sort_order: 2 })], units: [] });
    await open(g); await openModal(g); await printIt(g);
    ok('стара бланка: co 0 → 0, co 3 → един етикет без номер', labels(g).length === 1 && labels(g)[0].querySelector('.rv-lbl-name').textContent === 'Артикул 2');
  }

  section('Б4. „✅ Готово за обект": поле за дата; без дата не се обработва; с дата — в PATCH-а');
  {
    const h = env({ user: ADMIN, subs: [SUB('approved')], items: DONE_ITEMS() });
    await open(h, ADMIN);
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(6);
    ok('прозорец с „Цените важат от", по подразбиране днес', !!$(h, 'rv-done-modal') && $(h, 'rv-done-from').value === dayOffset(0), $(h, 'rv-done-from') && $(h, 'rv-done-from').value);
    ok('без confirm()', h.calls.confirm.length === 0);
    $(h, 'rv-done-from').value = '';
    realClick(h.w, $(h, 'rv-done-ok')); await ticks(6);
    ok('без дата → червен toast, без PATCH, прозорецът остава', subPatch(h).length === 0 && h.colors[h.colors.length - 1] === '#dc2626' &&
      /Въведи от кога важат цените/.test(lastToast(h)) && !!$(h, 'rv-done-modal'), lastToast(h));
    $(h, 'rv-done-from').value = '2026-02-30';
    realClick(h.w, $(h, 'rv-done-ok')); await ticks(6);
    ok('несъществуваща дата 30.02 → пак отказ', subPatch(h).length === 0);
    $(h, 'rv-done-from').value = '2026-12-01';
    realClick(h.w, $(h, 'rv-done-ok')); await ticks(12);
    const p = subPatch(h)[0];
    ok('с дата → ЕДИН PATCH: status processed + prices_valid_from 2026-12-01', subPatch(h).length === 1 && p.body.status === 'processed' && p.body.prices_valid_from === '2026-12-01' && !!p.body.processed_at, JSON.stringify(p && p.body));
    ok('прозорецът е затворен, бланката е processed', !$(h, 'rv-done-modal') && h.w.rvSub.status === 'processed');
    ok('ЦО вижда „Цените важат от 01.12.2026"', !!$(h, 'rv-valid-from') && /Цените важат от 01\.12\.2026/.test($(h, 'rv-valid-from').textContent));
    ok('ЦО: без жълтата бележка за обекта и без „Отпечатайте…"', !$(h, 'rv-valid-future') && !$(h, 'rv-print-note'));
    ok('VK11 „Валидна от" вече е записаната дата', $(h, 'rv-vk-from').value === '2026-12-01', $(h, 'rv-vk-from').value);

    /* В7. известието */
    const m = h.mail[0], pu = h.push[0];
    ok('имейл: „Цените важат от 01.12.2026" и „Отпечатайте етикетите: Ревизии и преоценка → Преоценка → „🏷 Етикети“"', !!m &&
      /Цените важат от 01\.12\.2026/.test(m.html) && m.html.indexOf('Отпечатайте етикетите: Ревизии и преоценка → Преоценка → „🏷 Етикети“') >= 0, m && m.html);
    ok('имейл: получателите без промяна (управителят + копие)', m && m.to.join(',') === 'managerkardjali@temax.bg' && (m.extra.cc || []).join(',') === 't.tenev@temax.bg');
    ok('push: датата и „Отпечатайте етикетите…"', !!pu && /обработена\nЦените важат от 01\.12\.2026\. Отпечатайте етикетите: Ревизии и преоценка → Преоценка → „🏷 Етикети“$/.test(pu.msg), pu && pu.msg);
    ok('push: само управителят', pu && pu.names.join(',') === 'Управител Кърджали');
  }

  section('Б4б. По подразбиране — „Валидна от" на VK11 (пази се и след пререндер); „Отказ" не обработва');
  {
    const h = env({ user: ADMIN, subs: [SUB('approved')], items: DONE_ITEMS() });
    await open(h, ADMIN);
    setDate(h, 'rv-vk-from', '2026-11-30');
    h.w.rvRender();
    ok('„Валидна от" се пази след пререндер', $(h, 'rv-vk-from').value === '2026-11-30', $(h, 'rv-vk-from').value);
    const pr = h.w.rvCoDone(); await ticks(6);
    ok('прозорецът взема 2026-11-30', $(h, 'rv-done-from').value === '2026-11-30', $(h, 'rv-done-from').value);
    realClick(h.w, $(h, 'rv-done-cancel')); await ticks(4);
    ok('„Отказ" → false, без PATCH, прозорецът изчезва', (await pr) === false && subPatch(h).length === 0 && !$(h, 'rv-done-modal'));
  }

  section('Б5/В8. Обектът: „цените важат от", жълтата бележка при бъдеща дата, „Отпечатайте етикетите"');
  {
    const fut = dayOffset(3), futTxt = fut.split('-').reverse().join('.');
    for (const u of [STORE_USER, SKLAD]) {
      const h = env({ user: u, subs: [SUB('processed', { prices_valid_from: fut })], items: [IT('1')] });
      await open(h, u);
      ok('цените важат от ' + futTxt + ' (' + u.role + ')', !!$(h, 'rv-valid-from') && $(h, 'rv-valid-from').textContent.indexOf(futTxt) >= 0);
      const y = $(h, 'rv-valid-future');
      ok('жълта бележка „Етикетите се слагат на стоката от ' + futTxt + '" (' + u.role + ')', !!y && y.textContent.indexOf('Етикетите се слагат на стоката от ' + futTxt) >= 0 && /#fef9c3|254, 249, 195/.test(y.getAttribute('style')));
      const n = $(h, 'rv-print-note');
      ok('бележка „Отпечатайте етикетите…" над таблицата (' + u.role + ')', !!n && n.textContent.indexOf('Отпечатайте етикетите: Ревизии и преоценка → Преоценка → „🏷 Етикети“') >= 0 &&
        (n.compareDocumentPosition($(h, 'rv-rows')) & 4) !== 0 && n.tagName === 'DIV');
      ok('бутонът „🏷 Етикети" си е там (' + u.role + ')', !!lblBtn(h));
    }
    const h = env({ subs: [SUB('processed', { prices_valid_from: dayOffset(0) })], items: [IT('1')] });
    await open(h);
    ok('днешна дата → без жълтата бележка, „Отпечатайте…" остава', !$(h, 'rv-valid-future') && !!$(h, 'rv-print-note') && !!$(h, 'rv-valid-from'));
    const r = env({ user: REG_ACC, subs: [SUB('processed', { prices_valid_from: fut })], items: [IT('1')] });
    await open(r, REG_ACC);
    ok('регионалният вижда „Цените важат от", без бележките за обекта', !!$(r, 'rv-valid-from') && !$(r, 'rv-valid-future') && !$(r, 'rv-print-note'));
    const o = env({ subs: [SUB('processed')], items: [IT('1')] });
    await open(o);
    ok('стара бланка (NULL) → без „Цените важат от", „Отпечатайте…" остава', !$(o, 'rv-valid-from') && !!$(o, 'rv-print-note'));
    const d = env({ subs: [SUB('approved', { prices_valid_from: fut })], items: [IT('1')] });
    await open(d);
    ok('неприключена бланка → нищо от това', !$(d, 'rv-valid-from') && !$(d, 'rv-print-note'));
  }

  section('Б5. Етикетът: prices_valid_from; стара бланка — processed_at');
  {
    const h = env({ subs: [SUB('processed', { prices_valid_from: '2026-12-01' })], items: [IT('1')], units: UNITS('1', 1) });
    await open(h); await openModal(h); await printIt(h);
    const dt = l => { const e = l.querySelector('.rv-lbl-date'); return e ? e.textContent : ''; };
    ok('„Преоценка 01.12.2026"', dt(labels(h)[0]) === 'Преоценка 01.12.2026', dt(labels(h)[0]));
    const g = env({ subs: [SUB('processed')], items: [IT('1')], units: UNITS('1', 1) });
    await open(g); await openModal(g); await printIt(g);
    ok('NULL → processed_at: „Преоценка 13.11.2026"', dt(labels(g)[0]) === 'Преоценка 13.11.2026', dt(labels(g)[0]));
  }

  section('Б4. „🔓 Отключи" нулира датата заедно с processed_at');
  {
    const h = env({ user: ADMIN, subs: [SUB('processed', { prices_valid_from: '2026-12-01' })], items: [IT('1')], units: UNITS('1', 1) });
    await open(h, ADMIN);
    realClick(h.w, btn(mod(h), 'Отключи бланката')); await ticks(10);
    const p = subPatch(h)[0];
    ok('PATCH: prices_valid_from null, processed_at null', !!p && p.body.prices_valid_from === null && p.body.processed_at === null && p.body.status === 'draft', JSON.stringify(p && p.body));
    ok('rvSub.prices_valid_from = null', h.w.rvSub.prices_valid_from === null);
  }

  section('Б6. VK11 при обработена: записаната дата; смяна → жълт toast, файлът пак се прави');
  {
    const h = env({ user: ADMIN, subs: [SUB('processed', { prices_valid_from: '2026-12-01' })], items: DONE_ITEMS() });
    await open(h, ADMIN);
    ok('„Валидна от" = 2026-12-01', $(h, 'rv-vk-from').value === '2026-12-01');
    realClick(h.w, btn(mod(h), 'VK11')); await ticks(8);
    ok('същата дата → без жълт toast', h.files.length === 1 && !/се различава/.test(lastToast(h)), lastToast(h));
    setDate(h, 'rv-vk-from', '2026-12-05');
    realClick(h.w, btn(mod(h), 'VK11')); await ticks(8);
    ok('друга дата → файл с 2026-12-05 + жълт toast „се различава от записаната 01.12.2026"', h.files.length === 2 && /2026-12-05/.test(h.files[1].f) &&
      /„Валидна от" 05\.12\.2026 се различава от записаната 01\.12\.2026/.test(lastToast(h)) && h.colors[h.colors.length - 1] === '#d97706', lastToast(h));
    ok('записаната дата не е пипната (без PATCH)', subPatch(h).length === 0);
  }

  section('Б5. „📁 История" показва датата');
  {
    const h = env({ user: ADMIN, subs: [SUB('processed', { prices_valid_from: '2026-12-01', processed_by: 'Елица Гюрова' })], items: [IT('1')] });
    await h.w.loadRevaluation(); await ticks(6);
    await h.w.rvHistOpenView(); await ticks(6);
    h.w.rvHistExp['c:c-1'] = true; h.w.rvRender();
    const s = $(h, 'rv-hist-s-s-1');
    ok('„… · цените от 01.12.2026"', !!s && /цените от 01\.12\.2026/.test(s.textContent), s && s.textContent);
    ok('заявката за историята иска prices_valid_from', h.calls.get.some(u => /revaluation_submissions\?select=.*prices_valid_from/.test(u)));
  }

  report();
})();
