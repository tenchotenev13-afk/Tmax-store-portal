/* „📦 Пикинг", етап 2, част А — единици (палет / насип / кашон), етикети с QR,
   опис, „Приключи събирането", deep link #pk=<id>, вътрешната лента.
   Интеграционно: shared.js + stock-returns.js + loading.js (llLoadQrLib /
   llQrSvg / LL_PORTAL_URL) + transfers.js + picking.js в реда от index.html.

   Фикстура — редове от седмица 41 (КОРИТО 13456 за Сливен и Раднево,
   КАЛЪФ 64694, МЕХАНИЗЪМ 87800) + синтетични. Базата е фалшив PostgREST в
   паметта: уникалност (склад, обект, вид, №, ден) на picking_pallets и
   (pallet_id, line_id) на picking_pallet_items → 409 / 23505; DELETE на
   единица трие каскадно редовете ѝ. „Скрита" единица = създадена от друго
   устройство след зареждането (в базата я има, в GET — не).

   Мутационна проверка (22.10.2026) — всеки вариант е пуснат и е паднал:
     M1 „✓ Взето" не пише в picking_pallet_items
        → падат „редът е в палета с 10", „… и в същия палет с 20" и чипът (0 реда · 0);
     M2 „➕ В единицата" презаписва вместо сбор
        → пада „10 → PATCH със СБОРА 40" (тялото е {"qty":10}) и всичко след него
          за събраното (остатък 30 извън единица);
     M3 „↩ Върни" минава за ред в единица
        → пада „↩ Върни → отказ …, без PATCH" (редът се отваря, а частта остава);
     M4 етикетите включват отворените единици
        → пада „2 етикета — палет №1 и насип №1, без отворения" (излизат 3);
     M5 „Приключи" минава при остатък извън единица
        → пада „„Извън единица: 87800 … — 20"" (минава като събрано).
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, section, report, ticks } = H;

const TG = 'Логистичен склад Търговище';
const USERS = 'ten.tenev@temax.bg, v.filev@temax.bg, kardzhali@temax.bg';
const TENCHO = { email: 'ten.tenev@temax.bg', display_name: 'Тенчо', role: 'admin', store_name: 'Централен офис' };
const VIKTOR = { email: 'v.filev@temax.bg', display_name: 'Виктор', role: 'logistics', store_name: TG };
const KARDZHALI = { email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const OTHER = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const RED = '#dc2626';

const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
function line(id, store, code, name, qty, extra) {
  return Object.assign({ id, batch_id: 'b1', warehouse: TG, store_name: store, sap_code: code, product_name: name, unit: 'БР',
    qty_requested: qty, supply_group: null, sap_order: null, sap_item: null, line_no: 2, status: 'open', qty_picked: null,
    comment: null, done_by: null, done_at: null, created_at: '2026-10-22T08:00:00Z' }, extra || {});
}
const LINES = () => [
  line('L1', 'Сливен', '13456', 'КОРИТО СТРОИТЕЛНО PVC ПРАВО 40Л', 10, { supply_group: '110', sap_order: '1131783028', sap_item: '10', line_no: 2 }),
  line('L2', 'Сливен', '64694', 'КАЛЪФ МАСА ЗА ГЛАДЕНЕ ORIGIN 50/140СМ', 40, { line_no: 3 }),
  line('L3', 'Сливен', '87800', 'МЕХАНИЗЪМ ИЗПРАЗВАЩ 1СТЕП.4803/4802', 20, { line_no: 4 }),
  line('L5', 'Сливен', '99005', 'СИНТЕТИЧЕН ОТВОРЕН РЕД', 3, { line_no: 5 }),
  line('L4', 'Раднево', '13456', 'КОРИТО СТРОИТЕЛНО PVC ПРАВО 40Л', 10, { supply_group: '110', sap_order: '1211685744', sap_item: '10', line_no: 6 })
];

function fakeDb(o) {
  o = o || {};
  return { users: USERS, batches: [{ id: 'b1', warehouse: TG, source: 'planned', file_name: 'Планиран 41.xlsx', uploaded_at: new Date().toISOString() }],
    lines: o.lines || LINES(), pallets: o.pallets || [], items: o.items || [], hidden: o.hidden || [], log: [], seq: 100 };
}
function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, headers: { get: () => null },
    json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
const inList = (q, col) => ((q.match(new RegExp(col + '=in\\.\\(([^)]*)\\)')) || [])[1] || '').split(',').filter(Boolean);
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    const body = init && init.body ? JSON.parse(init.body) : null;
    db.log.push({ m, tbl, url: u, q, body });
    const idEq = (q.match(/(?:^|&)id=eq\.([^&]+)/) || [])[1];
    const copy = a => a.map(x => Object.assign({}, x));
    if (m === 'GET') {
      if (/offset=[1-9]/.test(q)) return resp(200, []);
      if (tbl === 'app_settings') return resp(200, [{ key: 'picking_users', value: db.users }]);
      if (tbl === 'picking_batches') return resp(200, copy(db.batches));
      if (tbl === 'picking_lines') {
        const b = inList(q, 'batch_id'), ids = inList(q, 'id');
        return resp(200, copy(db.lines.filter(l => b.length ? b.indexOf(l.batch_id) >= 0 : ids.indexOf(l.id) >= 0)));
      }
      if (tbl === 'picking_pallets') {
        if (idEq) return resp(200, copy(db.pallets.filter(p => p.id === idEq)));
        return resp(200, copy(db.pallets.filter(p => db.hidden.indexOf(p.id) < 0)));
      }
      if (tbl === 'picking_pallet_items') { const p = inList(q, 'pallet_id'); return resp(200, copy(db.items.filter(i => p.indexOf(i.pallet_id) >= 0))); }
      return resp(200, []);
    }
    if (m === 'POST' && tbl === 'picking_pallets') {
      if (db.pallets.some(p => p.warehouse === body.warehouse && p.store_name === body.store_name && p.kind === body.kind && p.no === body.no && p.created_on === body.created_on))
        return resp(409, { code: '23505', message: 'duplicate key value violates unique constraint "picking_pallets_no_uq"' });
      const row = Object.assign({ id: uuid(++db.seq), created_at: new Date(Date.now() + db.seq).toISOString(), note: null, closed_by: null, closed_at: null,
        shipment_id: null, loaded_by: null, loaded_at: null, received_status: null, received_by: null, received_at: null, receive_note: null }, body);
      db.pallets.push(row);
      return resp(201, [row]);
    }
    if (m === 'POST' && tbl === 'picking_pallet_items') {
      if (db.items.some(i => i.pallet_id === body.pallet_id && i.line_id === body.line_id)) return resp(409, { code: '23505', message: 'dup' });
      const row = Object.assign({ id: 'i-' + (++db.seq), qty_received: null, receive_comment: null, created_at: new Date().toISOString() }, body);
      db.items.push(row);
      return resp(201, [row]);
    }
    if (m === 'PATCH') {
      const arr = { picking_lines: db.lines, picking_pallets: db.pallets, picking_pallet_items: db.items }[tbl] || [];
      arr.filter(x => x.id === idEq).forEach(x => Object.assign(x, body));
      return resp(204, null);
    }
    if (m === 'DELETE') {
      if (tbl === 'picking_pallets') { db.pallets = db.pallets.filter(p => p.id !== idEq); db.items = db.items.filter(i => i.pallet_id !== idEq); }
      if (tbl === 'picking_pallet_items') db.items = db.items.filter(i => i.id !== idEq);
      return resp(204, null);
    }
    return resp(405, { message: 'not in fake' });
  };
}
function env(user, db) {
  const h = boot({ modules: ['stock-returns.js', 'loading.js', 'transfers.js', 'picking.js'], user, data: {} });
  install(h, db);
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: String(m), c: c || '' }); try { orig(m, c); } catch (e) {} };
  h.qrTexts = [];
  h.w.qrcode = function () {
    let text = '';
    return { addData: t => { text = t; h.qrTexts.push(t); }, make() {}, getModuleCount: () => 21, isDark: (r, c) => ((r * 7 + c * 3 + text.length) % 5) < 2 };
  };
  return h;
}
const $ = (h, id) => h.doc.getElementById(id);
const lastToast = h => h.toasts[h.toasts.length - 1] || { m: '', c: '' };
const writes = (db, tbl, m) => db.log.filter(x => x.m === m && x.tbl === tbl);
const nonGet = db => db.log.filter(x => x.m !== 'GET').length;
const palletGets = db => db.log.filter(x => x.m === 'GET' && /^picking_pallet/.test(x.tbl || ''));
const pickingGets = db => db.log.filter(x => x.m === 'GET' && /^picking_/.test(x.tbl || ''));
const rowOf = (h, id) => $(h, 'pk-row-' + id);
const chip = (h, store) => Array.from(h.doc.querySelectorAll('.pk-chip')).find(b => b.getAttribute('data-pk-store') === store) || null;
const unitChips = h => Array.from(h.doc.querySelectorAll('.pk-unit'));
async function open(h, wh) { if (wh) h.w.pkWarehouse = wh; await h.w.loadPicking(); await ticks(10); }
async function pick(h, id, qty) {
  if (!$(h, 'pk-qty-' + id)) { realClick(h.w, btn(rowOf(h, id), '✓ Взето')); await ticks(2); }
  if (qty != null) $(h, 'pk-qty-' + id).value = String(qty);
  realClick(h.w, btn(rowOf(h, id), 'Запиши')); await ticks(10);
}

(async function run() {

  section('1. Достъп и вътрешната лента');
  {
    const d = fakeDb(); const h = env(OTHER, d);
    await open(h, TG);
    ok('извън списъка: „Нямаш достъп"', !!$(h, 'pk-noaccess'));
    ok('извън списъка: 0 GET към picking_pallet*', palletGets(d).length === 0, palletGets(d).map(x => x.tbl).join(','));
    h.w.pkDeepLinkBoot('#pk=' + uuid(1)); await ticks(10);
    ok('извън списъка + #pk= → „Нямаш достъп", пак 0 GET към picking_pallet*', !!$(h, 'pk-noaccess') && palletGets(d).length === 0);
  }
  {
    const d = fakeDb(); const h = env(KARDZHALI, d);
    await open(h);
    ok('обект в списъка: само „🚚 Изпращане"', !$(h, 'pks-collect') && !!$(h, 'pks-ship') && $(h, 'pks-ship').classList.contains('active'));
    /* От част Б обектът вижда „Пристигащи" (picking-ship.test.js) — тук само
       че не чете качванията и редовете за пикинг на склада. */
    ok('обект: „Пристигащи", без GET към picking_batches / picking_lines', !!$(h, 'pk-recv-none') &&
      !pickingGets(d).some(x => x.tbl === 'picking_batches' || x.tbl === 'picking_lines'), pickingGets(d).map(x => x.tbl).join(','));
  }
  const db = fakeDb();
  const h = env(TENCHO, db);
  {
    await open(h, TG);
    ok('склад/ЦО: лентата има и двата под-бутона', !!$(h, 'pks-collect') && !!$(h, 'pks-ship'));
    realClick(h.w, $(h, 'pks-ship')); await ticks(10);
    ok('„🚚 Изпращане" → изгледът на изпращането (не е скрит)', !!$(h, 'pk-ship-empty') && !$(h, 'pk-units'));
    realClick(h.w, $(h, 'pks-collect')); await ticks(10);
    ok('„📦 Събиране" → обратно към списъка', !!$(h, 'pk-units') && !$(h, 'pk-ship-empty'));
    realClick(h.w, chip(h, 'Сливен')); await ticks(2);
    ok('Сливен: без единици', unitChips(h).length === 0);
  }

  section('2. ✓ Взето без текуща → палет №1 с реда; второто — в същия');
  let p1;
  {
    await pick(h, 'L1');
    const pp = writes(db, 'picking_pallets', 'POST');
    p1 = db.pallets[0];
    ok('POST на палет: вид pallet, № 1, днес, Сливен, Търговище', pp.length === 1 && p1.kind === 'pallet' && p1.no === 1 &&
      p1.created_on === h.w.today() && p1.store_name === 'Сливен' && p1.warehouse === TG, JSON.stringify(pp[0] && pp[0].body));
    ok('toast „Палет №1 е създаден"', h.toasts.some(t => /Палет №1 е създаден/.test(t.m)));
    const it = db.items.find(i => i.line_id === 'L1');
    ok('редът е в палета с 10', it && it.pallet_id === p1.id && it.qty === 10, JSON.stringify(it));
    ok('редът е picked', db.lines.find(l => l.id === 'L1').status === 'picked');
    await pick(h, 'L3');
    ok('второ Взето → без нов палет', writes(db, 'picking_pallets', 'POST').length === 1);
    ok('… и в същия палет с 20', (db.items.find(i => i.line_id === 'L3') || {}).pallet_id === p1.id && db.items.find(i => i.line_id === 'L3').qty === 20);
    ok('чипът: „📦 Палет №1 · 2 реда · 30", подчертан', unitChips(h).length === 1 && /Палет №1 · 2 реда · 30/.test(unitChips(h)[0].textContent) && unitChips(h)[0].classList.contains('active'),
      unitChips(h).map(c => c.textContent).join('|'));
    realClick(h.w, $(h, 'pk-f-all')); await ticks(2);
    ok('под реда: „📦 Палет №1 × 10" с ✕', /Палет №1 × 10/.test(h.doc.querySelector('[data-pk-parts="L1"]').textContent) && !!h.doc.querySelector('[data-pk-parts="L1"] .pk-part-x'));
  }

  section('3. Затвори → Взето → отказ');
  {
    realClick(h.w, $(h, 'pk-unit-close')); await ticks(6);
    ok('палетът е closed', db.pallets[0].status === 'closed' && !!db.pallets[0].closed_at);
    ok('чипът ✅, бутон „🔓 Отвори"', /✅/.test(unitChips(h)[0].textContent) && !!$(h, 'pk-unit-open'));
    const nl = writes(db, 'picking_lines', 'PATCH').length, ni = writes(db, 'picking_pallet_items', 'POST').length;
    await pick(h, 'L2');
    ok('отказ „отвори единица", червен', /отвори единица/i.test(lastToast(h).m) && lastToast(h).c === RED, lastToast(h).m);
    ok('… без PATCH на реда и без запис в единица', writes(db, 'picking_lines', 'PATCH').length === nl && writes(db, 'picking_pallet_items', 'POST').length === ni);
    ok('редът остава open', db.lines.find(l => l.id === 'L2').status === 'open');
  }

  section('4. ➕ Нова единица → насип, текуща; ➕ В единицата = сбор');
  let bulk;
  {
    realClick(h.w, $(h, 'pk-unit-new')); await ticks(2);
    ok('изборът: палет / насип / кашон', !!$(h, 'pk-new-pallet') && !!$(h, 'pk-new-bulk') && !!$(h, 'pk-new-carton'));
    realClick(h.w, $(h, 'pk-new-bulk')); await ticks(6);
    bulk = db.pallets.find(p => p.kind === 'bulk');
    ok('насип №1, текущ', bulk && bulk.no === 1 && /Насип №1/.test($(h, 'pk-cur-name').textContent));
    await pick(h, 'L2', 40);
    const it = db.items.find(i => i.line_id === 'L2');
    ok('Взето 40 → в насипа', it && it.pallet_id === bulk.id && it.qty === 40);
    realClick(h.w, h.doc.querySelector('[data-pk-parts="L2"] .pk-part-x')); await ticks(6);
    ok('✕ → DELETE на частта, редът е извън единица', writes(db, 'picking_pallet_items', 'DELETE').length === 1 && !db.items.some(i => i.line_id === 'L2'));
    ok('бутон „➕ В единицата (40)"', /В единицата \(40\)/.test(btn(rowOf(h, 'L2'), '➕ В единицата').textContent));
    realClick(h.w, btn(rowOf(h, 'L2'), '➕ В единицата')); await ticks(2);
    $(h, 'pk-add-L2').value = '30';
    realClick(h.w, btn(rowOf(h, 'L2'), 'Добави')); await ticks(6);
    ok('30 в насипа', (db.items.find(i => i.line_id === 'L2') || {}).qty === 30);
    realClick(h.w, btn(rowOf(h, 'L2'), '➕ В единицата')); await ticks(2);
    ok('предварително = остатъкът 10', $(h, 'pk-add-L2') && Number($(h, 'pk-add-L2').value) === 10);
    const n0 = nonGet(db);
    $(h, 'pk-add-L2').value = '0'; realClick(h.w, btn(rowOf(h, 'L2'), 'Добави')); await ticks(4);
    ok('0 → отказ, без запис', nonGet(db) === n0 && lastToast(h).c === RED);
    $(h, 'pk-add-L2').value = '11'; realClick(h.w, btn(rowOf(h, 'L2'), 'Добави')); await ticks(4);
    ok('11 (над остатъка) → отказ, без запис', nonGet(db) === n0 && /Над остатъка/.test(lastToast(h).m));
    $(h, 'pk-add-L2').value = '10'; realClick(h.w, btn(rowOf(h, 'L2'), 'Добави')); await ticks(6);
    const pt = writes(db, 'picking_pallet_items', 'PATCH').slice(-1)[0];
    ok('10 → PATCH със СБОРА 40 (не презапис)', pt && pt.body.qty === 40 && db.items.find(i => i.line_id === 'L2').qty === 40, pt && JSON.stringify(pt.body));
    ok('няма втори ред за същата единица', db.items.filter(i => i.line_id === 'L2').length === 1);
    ok('остатък 0 → бутонът „➕ В единицата" изчезва', !btn(rowOf(h, 'L2'), '➕ В единицата'));
  }

  section('5. ↩ Върни на ред в единица; 🗑 само празна');
  {
    const n = writes(db, 'picking_lines', 'PATCH').length;
    realClick(h.w, btn(rowOf(h, 'L2'), '↩ Върни')); await ticks(4);
    ok('↩ Върни → отказ „Махни го от единиците първо", без PATCH', /Махни го от единиците първо/.test(lastToast(h).m) && writes(db, 'picking_lines', 'PATCH').length === n);
    ok('непразната текуща — без 🗑', !$(h, 'pk-unit-del'));
    const d0 = writes(db, 'picking_pallets', 'DELETE').length;
    await h.w.pkDeleteUnit(bulk.id); await ticks(2);
    ok('pkDeleteUnit на непразна → отказ, без DELETE', writes(db, 'picking_pallets', 'DELETE').length === d0 && lastToast(h).c === RED);
    realClick(h.w, $(h, 'pk-unit-new')); await ticks(2);
    realClick(h.w, $(h, 'pk-new-carton')); await ticks(6);
    ok('празен кашон → 🗑', !!$(h, 'pk-unit-del'));
    realClick(h.w, $(h, 'pk-unit-del')); await ticks(6);
    ok('🗑 → DELETE, кашонът го няма', writes(db, 'picking_pallets', 'DELETE').length === d0 + 1 && !db.pallets.some(p => p.kind === 'carton'));
  }

  section('6. ✅ Приключи събирането');
  {
    realClick(h.w, unitChips(h).find(c => /Насип/.test(c.textContent))); await ticks(2);
    const n0 = nonGet(db);
    realClick(h.w, $(h, 'pk-finish')); await ticks(2);
    const iss = $(h, 'pk-finish-issues');
    ok('с отворен ред и отворена единица → списък', iss && /Неотметнат ред: 99005/.test(iss.textContent) && /Отворена единица: 🧱 Насип №1/.test(iss.textContent), iss && iss.textContent);
    ok('… без запис и без „въпреки това"', nonGet(db) === n0 && !btn(iss, 'въпреки'));
    ok('чипът на обекта — без „✅ събрано"', !/събрано/.test(chip(h, 'Сливен').textContent));
    realClick(h.w, btn(rowOf(h, 'L5'), '⤼ Пропусни')); await ticks(2);
    $(h, 'pk-comment-L5').value = 'няма';
    realClick(h.w, btn(rowOf(h, 'L5'), 'Запиши')); await ticks(6);
    realClick(h.w, $(h, 'pk-unit-close')); await ticks(6);
    realClick(h.w, $(h, 'pk-finish')); await ticks(2);
    ok('чисто → „Събрано: 2 единици · 3 реда"', $(h, 'pk-finish-ok') && /Събрано: 2 единици · 3 реда/.test($(h, 'pk-finish-ok').textContent), $(h, 'pk-finish-ok') && $(h, 'pk-finish-ok').textContent);
    ok('… с „🏷 Етикети"', !!$(h, 'pk-finish-labels'));
    ok('чипът на обекта: „✅ събрано"', /✅ събрано/.test(chip(h, 'Сливен').textContent));
    ok('Раднево (отворен ред) — без „събрано"', !/събрано/.test(chip(h, 'Раднево').textContent));
  }

  section('7. Остатък извън единица → не е събрано');
  {
    realClick(h.w, unitChips(h).find(c => /Палет №1/.test(c.textContent))); await ticks(2);
    realClick(h.w, $(h, 'pk-unit-open')); await ticks(6);
    realClick(h.w, h.doc.querySelector('[data-pk-parts="L3"] .pk-part-x')); await ticks(6);
    realClick(h.w, $(h, 'pk-unit-close')); await ticks(6);
    realClick(h.w, $(h, 'pk-finish')); await ticks(2);
    ok('„Извън единица: 87800 … — 20"', $(h, 'pk-finish-issues') && /Извън единица: 87800 .* — 20/.test($(h, 'pk-finish-issues').textContent));
    realClick(h.w, $(h, 'pk-unit-open')); await ticks(6);
    realClick(h.w, btn(rowOf(h, 'L3'), '➕ В единицата')); await ticks(2);
    realClick(h.w, btn(rowOf(h, 'L3'), 'Добави')); await ticks(6);
    realClick(h.w, $(h, 'pk-unit-close')); await ticks(6);
    realClick(h.w, $(h, 'pk-finish')); await ticks(2);
    ok('пак събрано', !!$(h, 'pk-finish-ok'));
  }

  section('8. 🏷 Етикети — само затворените, QR #pk=<id>');
  {
    realClick(h.w, $(h, 'pk-unit-new')); await ticks(2);
    realClick(h.w, $(h, 'pk-new-pallet')); await ticks(6);
    const openP = db.pallets.find(p => p.status === 'open');
    ok('нов отворен палет №2', openP && openP.no === 2);
    realClick(h.w, $(h, 'pk-labels')); await ticks(6);
    const pr = $(h, 'mod-print');
    const labels = Array.from(pr.querySelectorAll('.pk-lbl'));
    ok('печатът е видим', pr.style.display === 'block');
    ok('2 етикета — палет №1 и насип №1, без отворения', labels.length === 2 && labels.every(l => l.getAttribute('data-pk-label') !== openP.id),
      labels.map(l => l.getAttribute('data-pk-label')).join(','));
    const want = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/#pk=' + p1.id;
    ok('QR текстът е URL с #pk=<id>', h.qrTexts.indexOf(want) >= 0 && labels[0].getAttribute('data-pk-qr-text') === want, h.qrTexts.join(' | '));
    ok('в етикета има SVG на QR', !!labels[0].querySelector('.pk-lbl-qr svg'));
    ok('етикет: склад, ОБЕКТ, вид + №, „№ за маркер"', /Търговище/.test(labels[0].textContent) && /СЛИВЕН/.test(labels[0].textContent) &&
      /Палет № 1/.test(labels[0].textContent) && /№ за маркер/.test(labels[0].textContent), labels[0].textContent);
    ok('редовете: КОРИТО · 10 и МЕХАНИЗЪМ · 20', /13456 · КОРИТО[^·]*· 10/.test(labels[0].textContent) && /87800 · МЕХАНИЗЪМ[^·]*· 20/.test(labels[0].textContent));
    ok('1 страница', pr.querySelectorAll('.pk-lbl-page').length === 1);
    realClick(h.w, btn(pr, '← Назад')); await ticks(6);
  }

  section('9. 🖨 Опис — всички редове на единицата');
  {
    realClick(h.w, chip(h, 'Сливен')); await ticks(2);
    realClick(h.w, unitChips(h).find(c => /Палет №1/.test(c.textContent))); await ticks(2);
    realClick(h.w, $(h, 'pk-unit-opis')); await ticks(2);
    const rows = Array.from(h.doc.querySelectorAll('#pk-opis .pk-opis-row'));
    ok('2 реда (L1, L3)', rows.length === 2 && rows.map(r => r.getAttribute('data-pk-line')).join(',') === 'L1,L3', rows.map(r => r.getAttribute('data-pk-line')).join(','));
    ok('L1: код, име, 10 БР, заявка / поз., събрал', /13456/.test(rows[0].textContent) && /10 БР/.test(rows[0].textContent) && /1131783028 \/ 10/.test(rows[0].textContent) && /Тенчо/.test(rows[0].textContent));
    const css = $(h, 'mod-print').querySelector('style').textContent;
    ok('CSS т.12: white-space:normal / box-sizing / долна рамка', /\.pk-tbl th,\.pk-tbl td\{[^}]*white-space:normal/.test(css) &&
      /\.pk-tbl th,\.pk-tbl td\{[^}]*box-sizing:border-box/.test(css) && /\.pk-tbl tr:last-child td\{[^}]*border-bottom:1px solid/.test(css));
  }

  section('10. Етикети — 4 на A4');
  {
    const pallets = [], items = [];
    for (let i = 1; i <= 5; i++) {
      pallets.push({ id: uuid(i), warehouse: TG, store_name: 'Сливен', kind: 'pallet', no: i, created_on: '2026-10-22', status: 'closed', created_by: 'Тенчо', created_at: '2026-10-22T09:0' + i + ':00Z' });
      items.push({ id: 'it' + i, pallet_id: uuid(i), line_id: 'L1', qty: 1, created_at: '2026-10-22T09:00:00Z' });
    }
    const d = fakeDb({ pallets, items });
    d.lines.forEach(l => { l.status = 'picked'; });
    const h5 = env(VIKTOR, d);
    await open(h5);
    realClick(h5.w, chip(h5, 'Сливен')); await ticks(2);
    await h5.w.pkLabels(); await ticks(4);
    const pages = Array.from(h5.doc.querySelectorAll('#mod-print .pk-lbl-page'));
    ok('5 затворени → 2 страници: 4 + 1', pages.length === 2 && pages[0].querySelectorAll('.pk-lbl').length === 4 && pages[1].querySelectorAll('.pk-lbl').length === 1);
    ok('CSS: page-break след всяка страница', /\.pk-lbl-page\{[^}]*page-break-after:always/.test(h5.doc.querySelector('#mod-print style').textContent));
  }

  section('11. № — сблъсък с друго устройство: един опит с +1');
  {
    const day = (function () { const h0 = env(VIKTOR, fakeDb()); return h0.w.today(); })();
    const hid = { id: uuid(901), warehouse: TG, store_name: 'Сливен', kind: 'pallet', no: 1, created_on: day, status: 'open' };
    const d = fakeDb({ pallets: [hid], hidden: [hid.id] });
    const hx = env(VIKTOR, d);
    await open(hx);
    realClick(hx.w, chip(hx, 'Сливен')); await ticks(2);
    await pick(hx, 'L1');
    const posts = writes(d, 'picking_pallets', 'POST').map(p => p.body.no);
    ok('POST № 1 → 409 → POST № 2', posts.join(',') === '1,2', posts.join(','));
    ok('toast „Палет №2 е създаден", редът е в №2', hx.toasts.some(t => /Палет №2 е създаден/.test(t.m)) &&
      d.items.find(i => i.line_id === 'L1').pallet_id === d.pallets.find(p => p.no === 2).id);
    const hid2 = Object.assign({}, hid, { id: uuid(902), no: 2 });
    const d2 = fakeDb({ pallets: [hid, hid2], hidden: [hid.id, hid2.id] });
    const hy = env(VIKTOR, d2);
    await open(hy);
    realClick(hy.w, chip(hy, 'Сливен')); await ticks(2);
    await pick(hy, 'L1');
    ok('втори сблъсък → червен toast, нито PATCH на реда, нито запис в единица',
      writes(d2, 'picking_pallets', 'POST').length === 2 && lastToast(hy).c === RED && writes(d2, 'picking_lines', 'PATCH').length === 0 && d2.items.length === 0, lastToast(hy).m);
  }

  section('12. Deep link #pk=<id>');
  {
    const d = fakeDb({ pallets: [{ id: uuid(7), warehouse: TG, store_name: 'Раднево', kind: 'bulk', no: 3, created_on: '2026-10-22', status: 'closed', created_at: '2026-10-22T09:00:00Z' }],
      items: [{ id: 'i7', pallet_id: uuid(7), line_id: 'L4', qty: 10, created_at: '2026-10-22T09:00:00Z' }] });
    d.lines.find(l => l.id === 'L4').status = 'picked';
    const hd = env(TENCHO, d);
    ok('pkParseDeep: чужд хеш → null', hd.w.pkParseDeep('#tf=1&c=2&u=1') === null && hd.w.pkParseDeep('#pk=xyz') === null);
    ok('pkDeepLinkBoot връща true за #pk=', hd.w.pkDeepLinkBoot('#pk=' + uuid(7)) === true);
    await ticks(14);
    ok('ЦО без избран склад → складът на единицата', hd.w.pkActiveWarehouse() === TG);
    ok('обектът Раднево е избран', chip(hd, 'Раднево') && chip(hd, 'Раднево').classList.contains('active'));
    const cur = h => h.doc.querySelector('.pk-unit.active');
    ok('единицата е текуща (подчертана)', cur(hd) && cur(hd).getAttribute('data-pk-unit') === uuid(7) && /Насип №3/.test(cur(hd).textContent));
    const hv = env(Object.assign({}, VIKTOR, { store_name: 'Логистичен склад Добрич' }), fakeDb({ pallets: d.pallets.map(x => Object.assign({}, x)) }));
    hv.w.pkDeepLinkBoot('#pk=' + uuid(7)); await ticks(14);
    ok('склад Добрич + единица от Търговище → червен toast', /от Логистичен склад Търговище/.test(lastToast(hv).m) && lastToast(hv).c === RED, lastToast(hv).m);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
