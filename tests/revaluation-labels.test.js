/* Преоценка — етап 3 от 3 (25.11.2026): етикети за преоценените бройки
   (бутон „🏷 Етикети" при обработена бланка). Свежият прочит преди
   одобрение (rvRegApprove → rvSameCodeConflicts) е МАХНАТ на 25.11.2026 —
   еднакъв артикул с различен % вече се одобрява; секция 8 е обърната.

   Интеграционно: shared.js + admin.js + stock-returns.js + push.js +
   email.js + loading.js + revaluation.js + revisions.js, в реда от
   index.html. Лейаутът (мм, листове) е в jsdom само като стойности в
   style — истинското мерене е в Chromium (виж отчета на сесията).

   Секция 9: при processed номерата се показват само за четене (решение на
   Тенчо 25.11). Мутационна проверка — описана в лога
   claude/log/2026-11-25-preocenka-etap3-etiketi.md.
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, section, report, dayOffset, ticks } = H;

const CAMP = { id: 'c-1', title: 'Пожелателна преоценка 11.2026', kind: 'optional', starts_on: dayOffset(-1), ends_on: dayOffset(5), default_pct: 50, status: 'open', note: null };
const STORE_USER = { email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const ADMIN = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис' };
const REG_ACC = { email: 'reg@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Кърджали'] };
/* processed_at по обед UTC — датата е една и съща във всеки пояс на Европа */
const SUB = st => ({ id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: st, no_items: false, default_pct: 50,
  submitted_at: '2026-11-12T10:00:00Z', approved_at: '2026-11-12T11:00:00Z', processed_at: st === 'processed' ? '2026-11-13T12:07:57Z' : null });
const IT = (id, o) => Object.assign({ id: id, submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sort_order: 1, sap_code: '61540',
  product_name: 'Артикул ' + id, unit: 'БР', qty: 1, std_price: 12.98, discount_pct: 50, proposed_price: 6.49,
  store_comment: 'дефект', new_sap_code: '80' + id, sale_price: 3 }, o || {});
const UNITS = (item, n, from) => Array.from({ length: n }, (_, k) => ({ id: 'u-' + item + '-' + k, item_id: item, submission_id: 's-1', store_name: 'Кърджали',
  unit_no: 'Кърджали-П' + String((from || 1) + k).padStart(4, '0'), created_at: '2026-11-10T10:00:0' + (k % 10) + 'Z' }));

function env(o) {
  o = o || {};
  const db = { subs: (o.subs || []).map(x => Object.assign({}, x)), items: (o.items || []).map(x => Object.assign({}, x)), units: (o.units || []).slice(), fresh: o.fresh };
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'loading.js', 'revaluation.js', 'revisions.js'],
    user: o.user || STORE_USER,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: () => db.subs,
      revaluation_items: url => (db.fresh && /select=id,sap_code,discount_pct,proposed_price/.test(url)) ? db.fresh : db.items,
      revaluation_units: () => db.units,
      revaluation_codes: [],
      stores: [{ name: 'Кърджали' }],
      users: [],
      product_catalog: [],
      app_settings: o.settings || [{ key: 'revaluation_stores', value: 'Кърджали' }]
    },
    fail: o.fail,
    confirm: true,
    globals: { pushToPeople: () => Promise.resolve({ ok: true }), sendEmail: () => Promise.resolve({ ok: true }) }
  });
  h.db = db;
  h.colors = [];
  const t0 = h.w.toast;
  h.w.toast = (msg, c) => { h.colors.push(c); return t0(msg, c); };
  h.w.rvStoresOn = false; h.w.rvStoresList = ['Кърджали'];
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const $ = (h, id) => h.doc.getElementById(id);
const lblBtn = h => Array.prototype.find.call(mod(h).querySelectorAll('button'), b => /🏷 Етикети/.test(b.textContent));
const lastToast = h => { const t = h.calls.toast[h.calls.toast.length - 1]; return t ? [].concat(t).join(' ') : ''; };
const labels = h => Array.prototype.slice.call(h.doc.querySelectorAll('#rv-lbl-sheets .rv-lbl'));
const pages = h => h.doc.querySelectorAll('#rv-lbl-sheets .rv-lbl-page');
const pos = el => [el.style.left, el.style.top].join(' ');
async function open(h, user) {
  await h.w.loadRevaluation(); await ticks(6);
  if ((user || STORE_USER).role !== 'manager') { await h.w.rvCoOpenStore('Кърджали'); await ticks(6); }
}
async function openModal(h) { realClick(h.w, lblBtn(h)); await ticks(2); return $(h, 'rv-lbl-modal'); }
async function printIt(h, test) { realClick(h.w, $(h, test ? 'rv-lbl-test' : 'rv-lbl-print')); await ticks(2); }
function setNum(h, id, val) { const el = $(h, id); el.value = String(val); fire(h.w, el, 'change'); }

(async function run() {

  section('1. Бутонът: при processed — обект, ЦО (admin), регионален accounting; при другите статуси — няма');
  {
    for (const u of [STORE_USER, ADMIN, REG_ACC]) {
      const h = env({ user: u, subs: [SUB('processed')], items: [IT('1')] });
      await open(h, u);
      ok('processed → <button> „🏷 Етикети" (' + u.role + (u.is_regional ? ', регионален' : '') + ')', !!lblBtn(h) && lblBtn(h).tagName === 'BUTTON');
    }
    for (const st of ['draft', 'submitted', 'approved']) {
      for (const u of [STORE_USER, ADMIN]) {
        const h = env({ user: u, subs: [SUB(st)], items: [IT('1')] });
        await open(h, u);
        ok(st + ' → без бутон (' + u.role + ')', !lblBtn(h));
      }
    }
    const h = env({ subs: [SUB('processed')], items: [] });
    await open(h);
    ok('processed без редове → бутонът пак е там', !!lblBtn(h));
    const m = await openModal(h);
    ok('прозорецът казва „Няма редове за етикети"', !!m && !!$(h, 'rv-lbl-empty') && /Няма редове за етикети/.test($(h, 'rv-lbl-empty').textContent));
    ok('„🖨 Печат" е изключен, „Пробен лист" — не', $(h, 'rv-lbl-print').disabled && !$(h, 'rv-lbl-test').disabled);
  }

  section('2. Колко етикета: на номер; ред без номера → 1; без код/цена → не се печата (сив списък)');
  {
    const items = [IT('1', { qty: 3, sort_order: 1 }), IT('2', { sort_order: 2 }), IT('3', { new_sap_code: null, sort_order: 3, sap_code: '11111' }),
      IT('4', { sale_price: null, sort_order: 4, sap_code: '22222' })];
    const h = env({ subs: [SUB('processed')], items, units: UNITS('1', 3) });
    await open(h);
    await openModal(h);
    const chks = h.doc.querySelectorAll('#rv-lbl-modal .rv-lbl-chk');
    ok('2 реда с отметки, и двата отметнати', chks.length === 2 && Array.prototype.every.call(chks, c => c.checked));
    const ns = Array.prototype.map.call(h.doc.querySelectorAll('#rv-lbl-modal .rv-lbl-n'), td => td.textContent);
    ok('брой етикети: 3 и 1 (без номер)', ns[0] === '3' && /^1 без номер/.test(ns[1]), JSON.stringify(ns));
    const sk = $(h, 'rv-lbl-skipped');
    ok('сив списък „Не се печатат" с 11111 и 22222', !!sk && /11111/.test(sk.textContent) && /22222/.test(sk.textContent) && /#94a3b8|148, 163, 184/.test(sk.getAttribute('style')), sk && sk.textContent);
    ok('указанието за 100% е в прозореца', /Печатай в реален размер \(100%\), без „Побери в страницата“/.test($(h, 'rv-lbl-hint').textContent));
    await printIt(h);
    ok('4 етикета (3 + 1), 1 лист', labels(h).length === 4 && pages(h).length === 1, labels(h).length + ' / ' + pages(h).length);
    const units = labels(h).map(l => { const u = l.querySelector('.rv-lbl-unit'); return u ? u.textContent : '—'; });
    ok('номерата П0001–П0003 и „без номер" за стария ред', JSON.stringify(units) === JSON.stringify(['№ Кърджали-П0001', '№ Кърджали-П0002', '№ Кърджали-П0003', '—']), JSON.stringify(units));
    ok('нищо с кодовете 8011111 / 8022222 / 803 / 804', !labels(h).some(l => /Артикул [34]/.test(l.textContent)));
    ok('модулът е print, прозорецът е затворен', $(h, 'mod-print').style.display === 'block' && !$(h, 'rv-lbl-modal'));
    /* махната отметка → редът не се печата */
    realClick(h.w, btn($(h, 'mod-print'), '← Назад')); await ticks(6);
    ok('„← Назад" чисти #mod-print (@page margin:0 не остава)', $(h, 'mod-print').innerHTML === '');
    await openModal(h);
    const c1 = h.doc.querySelector('#rv-lbl-modal .rv-lbl-chk[data-id="1"]');
    c1.checked = false;
    await printIt(h);
    ok('без отметка на реда с 3 номера → 1 етикет', labels(h).length === 1);
  }

  section('3. Малък: координати на 1-ви, 3-ти, 21-ви, 22-ри; 22-рият е на втори лист');
  {
    const h = env({ subs: [SUB('processed')], items: [IT('1', { qty: 22 })], units: UNITS('1', 22) });
    await open(h);
    await openModal(h);
    ok('по подразбиране: малък, начало 1, изместване 0', $(h, 'rv-lbl-kind-small').checked && $(h, 'rv-lbl-start').value === '1' && $(h, 'rv-lbl-dx').value === '0' && $(h, 'rv-lbl-dy').value === '0');
    await printIt(h);
    const L = labels(h);
    ok('22 етикета на 2 листа', L.length === 22 && pages(h).length === 2);
    ok('№1: 13mm / 8mm', pos(L[0]) === '13mm 8mm', pos(L[0]));
    ok('№3: 133mm / 8mm', pos(L[2]) === '133mm 8mm', pos(L[2]));
    ok('№21: 133mm / 242mm (8 + 6×39)', pos(L[20]) === '133mm 242mm', pos(L[20]));
    ok('№22: на лист 2, 13mm / 8mm', L[21].parentNode === pages(h)[1] && pos(L[21]) === '13mm 8mm', pos(L[21]));
    ok('първите 21 са на лист 1', L.slice(0, 21).every(l => l.parentNode === pages(h)[0]));
    ok('лист: 210mm, клетка 58 × 37 с 3 мм навътре (CSS)', /\.rv-lbl-page\{position:relative;width:210mm;/.test($(h, 'mod-print').innerHTML) &&
      /\.rv-lbl-s\{width:58mm;height:37mm;padding:3mm;\}/.test($(h, 'mod-print').innerHTML) && /@page\{size:A4;margin:0;\}/.test($(h, 'mod-print').innerHTML));
  }

  section('4. Малък: начало от № 5; изместване +1 / −0,5 мм (помни се)');
  {
    const h = env({ subs: [SUB('processed')], items: [IT('1', { qty: 22 })], units: UNITS('1', 22) });
    await open(h);
    await openModal(h);
    $(h, 'rv-lbl-start').value = '5';
    setNum(h, 'rv-lbl-dx', '1'); setNum(h, 'rv-lbl-dy', '-0.5');
    await printIt(h);
    const L = labels(h);
    ok('първият етикет е в слот 5: 73 + 1 = 74mm / 47 − 0,5 = 46.5mm', L[0].dataset.slot === '5' && pos(L[0]) === '74mm 46.5mm', L[0].dataset.slot + ' ' + pos(L[0]));
    ok('22 етикета от слот 5 → 17 + 5, 2 листа', pages(h).length === 2 && pages(h)[0].querySelectorAll('.rv-lbl').length === 17 && pages(h)[1].querySelectorAll('.rv-lbl').length === 5);
    ok('втори лист започва от слот 1 (14mm / 7.5mm)', pos(pages(h)[1].querySelector('.rv-lbl')) === '14mm 7.5mm', pos(pages(h)[1].querySelector('.rv-lbl')));
    ok('localStorage: {dx:1, dy:-0.5}', h.w.localStorage.getItem('rv_lbl_offset') === '{"dx":1,"dy":-0.5}', h.w.localStorage.getItem('rv_lbl_offset'));
    realClick(h.w, btn($(h, 'mod-print'), '← Назад')); await ticks(6);
    await openModal(h);
    ok('отваряне наново: изместването е запомнено, началото — пак 1', $(h, 'rv-lbl-dx').value === '1' && $(h, 'rv-lbl-dy').value === '-0.5' && $(h, 'rv-lbl-start').value === '1');
    /* пробен лист: 21 рамки, без съдържание, с изместването */
    await printIt(h, true);
    const F = labels(h);
    ok('пробен лист: 21 рамки, 1 лист, без текст', F.length === 21 && pages(h).length === 1 && F.every(f => f.classList.contains('rv-lbl-frame') && f.textContent === ''));
    ok('пробен лист с изместването: 14mm / 7.5mm', pos(F[0]) === '14mm 7.5mm', pos(F[0]));
  }

  section('5. localStorage, който хвърля → стойности по подразбиране, без грешка');
  {
    const h = env({ subs: [SUB('processed')], items: [IT('1')], units: UNITS('1', 1) });
    await open(h);
    Object.defineProperty(h.w, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    await openModal(h);
    ok('прозорецът се отваря: малък, 0 / 0', !!$(h, 'rv-lbl-modal') && $(h, 'rv-lbl-kind-small').checked && $(h, 'rv-lbl-dx').value === '0');
    setNum(h, 'rv-lbl-dx', '2');
    await printIt(h);
    ok('печатът минава с изместването от полето (15mm)', labels(h).length === 1 && pos(labels(h)[0]) === '15mm 8mm', pos(labels(h)[0] || { style: {} }));
  }

  section('6. Голям А5: 3 етикета → 2 листа, долната половина празна; видът се помни');
  {
    const h = env({ subs: [SUB('processed')], items: [IT('1', { qty: 3 })], units: UNITS('1', 3) });
    await open(h);
    await openModal(h);
    $(h, 'rv-lbl-kind-big').checked = true; fire(h.w, $(h, 'rv-lbl-kind-big'), 'change'); await ticks(1);
    ok('голям: без „Започни от етикет №"', !$(h, 'rv-lbl-start') && $(h, 'rv-lbl-kind-big').checked);
    ok('отметките се пазят при смяна на вида', h.doc.querySelectorAll('#rv-lbl-modal .rv-lbl-chk:checked').length === 1);
    await printIt(h);
    const L = labels(h);
    ok('3 етикета на 2 листа', L.length === 3 && pages(h).length === 2);
    ok('лист 1: 0 / 0 и 0 / 148.5mm', pos(L[0]) === '0mm 0mm' && pos(L[1]) === '0mm 148.5mm', pos(L[0]) + ' | ' + pos(L[1]));
    ok('лист 2: само горната половина', pages(h)[1].querySelectorAll('.rv-lbl').length === 1 && pos(L[2]) === '0mm 0mm');
    ok('линия за рязане на 148.5mm на всеки лист', Array.prototype.every.call(pages(h), p => { const c = p.querySelector('.rv-lbl-cut'); return c && c.style.top === '148.5mm'; }));
    ok('CSS: 210 × 148,5', /\.rv-lbl-b\{width:210mm;height:148\.5mm;/.test($(h, 'mod-print').innerHTML));
    ok('localStorage rv_lbl_kind = big', h.w.localStorage.getItem('rv_lbl_kind') === 'big');
    realClick(h.w, btn($(h, 'mod-print'), '← Назад')); await ticks(6);
    await openModal(h);
    ok('отваряне наново → голям е избран', $(h, 'rv-lbl-kind-big').checked);
  }

  section('7. Съдържанието на един етикет');
  {
    const it = IT('1', { product_name: 'КИЛИМ MILAN 160/230CM 11275A-CH956 ВИЗОН', std_price: 12.98, sale_price: 3, new_sap_code: '8061540', store_comment: 'липсва рамо от тръбата към душ пита' });
    const h = env({ subs: [SUB('processed')], items: [it], units: UNITS('1', 1) });
    await open(h);
    await openModal(h);
    await printIt(h);
    const l = labels(h)[0];
    const t = sel => { const e = l.querySelector(sel); return e ? e.textContent : null; };
    ok('име', t('.rv-lbl-name') === 'КИЛИМ MILAN 160/230CM 11275A-CH956 ВИЗОН', t('.rv-lbl-name'));
    ok('стара цена „12,98 €" (зачертана)', t('.rv-lbl-old') === '12,98 €' && /\.rv-lbl-old\{text-decoration:line-through/.test($(h, 'mod-print').innerHTML), t('.rv-lbl-old'));
    ok('нова цена „3,00 €"', t('.rv-lbl-new') === '3,00 €', t('.rv-lbl-new'));
    ok('нов SAP код', t('.rv-lbl-code') === 'Код 8061540', t('.rv-lbl-code'));
    ok('номер на бройката', t('.rv-lbl-unit') === '№ Кърджали-П0001', t('.rv-lbl-unit'));
    ok('дата 13.11.2026', t('.rv-lbl-date') === 'Преоценка 13.11.2026', t('.rv-lbl-date'));
    ok('причина', t('.rv-lbl-why') === 'липсва рамо от тръбата към душ пита', t('.rv-lbl-why'));
    ok('малък: причината на 1 ред, името до 2 (CSS)', l.querySelector('.rv-lbl-why').classList.contains('rv-lbl-line') &&
      /\.rv-lbl-s \.rv-lbl-name\{[^}]*-webkit-line-clamp:2/.test($(h, 'mod-print').innerHTML) && /\.rv-lbl\{position:absolute;[^}]*overflow:hidden/.test($(h, 'mod-print').innerHTML));
    ok('без баркод', !/barcode|<svg|<canvas|<img/i.test($(h, 'rv-lbl-sheets').innerHTML));
    /* апостроф и <> в името — избягани */
    const h2 = env({ subs: [SUB('processed')], items: [IT('1', { product_name: "O'NEIL <b>x</b>" })] });
    await open(h2); await openModal(h2); await printIt(h2);
    ok('апостроф / <b> — като текст', labels(h2)[0].querySelector('.rv-lbl-name').textContent === "O'NEIL <b>x</b>");
  }

  section('8. rvRegApprove: един код с различен % → одобрява се, без свеж прочит (реален клик, 25.11.2026)');
  {
    const SETTINGS = [{ key: 'revaluation_stores', value: 'Кърджали' }];
    const diff = [IT('1', { sap_code: '14557', discount_pct: 30, proposed_price: 84 }), IT('2', { sap_code: '14557', discount_pct: 60, proposed_price: 48 })];
    let h = env({ user: REG_ACC, subs: [SUB('submitted')], items: diff, settings: SETTINGS });
    await open(h, REG_ACC);
    const ap = btn(mod(h), '✅ Одобри');
    ok('бутонът „✅ Одобри" е там', !!ap);
    realClick(h.w, ap); await ticks(8);
    const p2 = h.calls.patch.filter(p => /revaluation_submissions/.test(p.url));
    ok('30 % и 60 % за 14557 → PATCH approved', p2.length === 1 && p2[0].body.status === 'approved', JSON.stringify(p2.map(p => p.body)));
    ok('без свеж GET на редовете с id,sap_code,discount_pct', !h.calls.get.some(u => /select=id,sap_code,discount_pct,proposed_price/.test(u)));
    ok('без червен toast', h.colors[h.colors.length - 1] !== '#dc2626', lastToast(h));

    /* паднало четене на редовете вече не може да спре одобрението — няма такова четене */
    h = env({ user: REG_ACC, subs: [SUB('submitted')], items: diff, settings: SETTINGS, fail: { GET: /revaluation_items\?submission_id=eq\.s-1&select=id,sap_code/ } });
    await open(h, REG_ACC);
    realClick(h.w, btn(mod(h), '✅ Одобри')); await ticks(8);
    ok('…и при „падащ" прочит пак approved', h.calls.patch.filter(p => /revaluation_submissions/.test(p.url) && p.body.status === 'approved').length === 1);
  }

  section('8б. Етикети: един артикул, два реда с различни преоценени кодове и цени → два различни етикета');
  {
    const items = [IT('1', { sap_code: '14557', sort_order: 1, discount_pct: 30, new_sap_code: '8014557', sale_price: 84 }),
      IT('2', { sap_code: '14557', sort_order: 2, discount_pct: 60, new_sap_code: '8914557', sale_price: 48 })];
    const h = env({ subs: [SUB('processed')], items, units: UNITS('1', 1).concat(UNITS('2', 1, 2)) });
    await open(h);
    await openModal(h);
    await printIt(h);
    const ls = labels(h);
    const t = (l, sel) => { const e = l.querySelector(sel); return e ? e.textContent : null; };
    ok('2 етикета', ls.length === 2, ls.length);
    ok('първият: Код 8014557, 84,00 €', ls[0] && t(ls[0], '.rv-lbl-code') === 'Код 8014557' && t(ls[0], '.rv-lbl-new') === '84,00 €', ls[0] && t(ls[0], '.rv-lbl-code') + ' ' + t(ls[0], '.rv-lbl-new'));
    ok('вторият: Код 8914557, 48,00 €', ls[1] && t(ls[1], '.rv-lbl-code') === 'Код 8914557' && t(ls[1], '.rv-lbl-new') === '48,00 €', ls[1] && t(ls[1], '.rv-lbl-code') + ' ' + t(ls[1], '.rv-lbl-new'));
  }

  section('9. processed: номерата под кода — само за четене (обект, ЦО, регионален, „📁 История“)');
  {
    const items = [IT('1', { qty: 3, sort_order: 1 }), IT('2', { sort_order: 2 })];
    const unitsTxt = h => { const r = $(h, 'rv-row-1'); const e = r && r.querySelector('.rv-units'); return e ? e.textContent : ''; };
    for (const u of [STORE_USER, ADMIN, REG_ACC]) {
      const h = env({ user: u, subs: [SUB('processed')], items, units: UNITS('1', 3) });
      await open(h, u);
      ok('processed с номера → „№ Кърджали-П0001 … П0003" (' + u.role + (u.is_regional ? ', регионален' : '') + ')', unitsTxt(h) === '№ Кърджали-П0001 … П0003', unitsTxt(h));
      ok('ред 2 без номера → без ред с номера, без маркер (' + u.role + ')', !$(h, 'rv-row-2').querySelector('.rv-units') && !mod(h).querySelector('.rv-unit-miss'));
      const retry = Array.prototype.filter.call(mod(h).querySelectorAll('button'), b => /Опитай пак/.test(b.textContent));
      ok('без <button> „🔁 Опитай пак" (' + u.role + ')', retry.length === 0);
      ok('нищо не се пише в revaluation_units (' + u.role + ')', !h.calls.post.some(p => p.table === 'revaluation_units') && !h.calls.del.some(x => /revaluation_units/.test(x)));
    }
    /* „📁 История" → бланката на обекта през rvHistOpenStore */
    const h = env({ user: ADMIN, subs: [SUB('processed')], items, units: UNITS('1', 3) });
    await h.w.loadRevaluation(); await ticks(6);
    await h.w.rvHistOpenView(); await ticks(6);
    await h.w.rvHistOpenStore('c-1', 'Кърджали'); await ticks(8);
    ok('„📁 История" → бланката показва номерата', unitsTxt(h) === '№ Кърджали-П0001 … П0003', unitsTxt(h));
    /* processed БЕЗ нито един номер (стара бланка) */
    const h2 = env({ subs: [SUB('processed')], items, units: [] });
    await open(h2);
    ok('стара бланка без номера: няма .rv-units, .rv-unit-miss и <button> „Опитай пак"', !mod(h2).querySelector('.rv-units') && !mod(h2).querySelector('.rv-unit-miss') &&
      !Array.prototype.some.call(mod(h2).querySelectorAll('button'), b => /Опитай пак/.test(b.textContent)));
    /* draft без номер — маркерът си остава (етап 2 не е пипнат) */
    const h3 = env({ subs: [SUB('draft')], items: [IT('1', { qty: 2 })], units: [] });
    await open(h3);
    ok('чернова без номера → маркерът „без номер — опитай пак" е там', !!mod(h3).querySelector('.rv-unit-miss'));
  }

  report();
})();
