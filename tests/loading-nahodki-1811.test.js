/* Товарни листи — находките от прегледа за инструкциите (18.11.2026, сесия
   ll-nahodki). Реални кликове върху inline onclick, loading.js зареден заедно
   с client-orders.js, transfers.js и notifications.js в реда от index.html.

   ПОКРИТО (т. от задачата):
     1. кавичка в 4 полета + data-store в печата — стойността в полето = записаната;
     2. ред с коментар / „Стока в стока" без обект спира записа, празен ред отпада;
     3. надписите „целия …" по вид (бутони, подсказка, confirm, toast);
     4. етикетът по вид — HTML и PDF, „В курса: единица i/n", побиране (llFitPt);
     5. „✕" на снимка — склад при чернова / при изпратен / admin / обект;
     6. колона „Извънгаб." и „Товарил" в списъка на склада;
     7. решение по извънреден ред от изгледа на склада приключва листа;
     8. QR от етикет за склад / admin — преглед с подчертана единица, без червен екран;
     9. llResetState при изход / вход;
    10. „🗑 Изтрий черновата" — видимост, отказ, успех, провал, 0 реда, обект;
    11. дългият „Коментар склад" — целият текст, писането не губи фокус.

   ПРЕДИ ПОПРАВКАТА (т.7 и т.8 — „свери с тест"): `LL_ONLY=т.7,т.8 node
   tests/loading-nahodki-1811.test.js <git archive 23b33e3>` → 3 ✅ / 8 ❌:
     · т.7 одобрение и отхвърляне от склада → 0 PATCH-а по loading_lists
       (llAutoDoneList търсеше листа само в llStoreLists); „ред без отговор →
       не се приключва" минава и тогава;
     · т.8 складов акаунт → червеният екран ИЗЛИЗА (labels-тестът дори го
       заковаваше); admin → без червен екран, но и НИЩО не се отваря
       (llCanEdit() → return true); друг склад → червен екран вместо
       съобщение. Обектът с чужд палет — червен екран и преди, и сега.
     Подозрението и по двете е потвърдено.
   LL_ONLY=<т.N,…> пуска само тези секции.

   МУТАЦИОННА ПРОВЕРКА (18.11.2026), всеки мутант срещу този тест:
     - escVal обратно в „Моят коментар" (llAttr → escVal)         — СЪБОРЕН
     - редът с коментар пак отпада тихо (махната проверката orphan) — СЪБОРЕН
     - складът трие снимка след изпращане (махнат stage 'sent')    — СЪБОРЕН
     - „Изтрий" работи и на изпратен лист (без status !== 'draft')  — СЪБОРЕН
     - llAutoDoneList пак само в llStoreLists                      — СЪБОРЕН
     - llResetState не нулира llCoDue                              — СЪБОРЕН
     - заглавието на извънгабаритния пак с llFitPt 0,56 / 36pt     — СЪБОРЕН
     - „⚡ Бързо добавяне" пак с llBlankRow (присвоява ред с коментар) — СЪБОРЕН
   Неубити: няма. Базата преди кръга: exit 0.

   ЕТИКЕТЪТ, МЕРЕН В БРАУЗЪР (18.11.2026, рендер с harness → localhost →
   getClientRects): с 0,56 за всички „ИЗВЪНГАБАРИТЕН 10 от 12" при 40pt
   (Arial bold) = 194 mm в кутия 190 → 2 реда; след llLabelTitlePt — 34pt,
   165 mm, 1 ред. „РУЛО 11 от 11" (най-дългото руло в базата към 18.11) —
   72pt, 171 mm. PDF (Roboto Regular) се побираше и преди: 178 → 151 mm.
   В базата към 18.11 няма номериран извънгабаритен ред.

   Пускане:  node tests/loading-nahodki-1811.test.js .
*/
'use strict';
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, fire, ticks, btn } = H;

const WH = 'Логистичен склад Търговище';
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager',
                store_name: 'Петрич', assigned_stores: [], is_regional: false };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad',
                    store_name: WH, assigned_stores: [], is_regional: false };
const WAREHOUSE_OTHER = { email: 'sklad.dobrich@temax.bg', display_name: 'Склад Добрич', role: 'sklad',
                          store_name: 'Логистичен склад Добрич', assigned_stores: [], is_regional: false };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [], is_regional: false };

const Q = 'Иван "Шефа" Петров';
const L_DRAFT = { id: 'L0', warehouse: WH, list_date: '2026-11-18', status: 'draft', executed_by: Q,
                  comment: 'внимавай с "крехкото"', created_by: 'Склад Търговище',
                  created_at: '2026-11-18T06:00:00.000Z', sent_at: null, done_at: null };
const L_SENT = Object.assign({}, L_DRAFT, { id: 'L1', status: 'sent', sent_at: '2026-11-18T07:00:00.000Z' });

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: null, clears_doc: null, store_name: 'Петрич', warehouse_comment: null,
    store_comment: null, nested_codes: null, partial: false, received: false, received_by: null,
    received_at: null, missing: false, missing_by: null, missing_at: null, wrong_store: null,
    added_by_store: false, approval_status: null, approval_by: null, approval_at: null,
    approval_comment: null, client_order_id: null, created_at: '2026-11-18T06:00:00.000Z'
  }, o);
}
const photo_ = o => Object.assign({ id: 'p1', list_id: 'L1', store_name: WH, stage: 'sent',
  path: 'https://x/p1.jpg', uploaded_by: 'Склад Търговище', uploaded_at: '2026-11-18T06:30:00.000Z' }, o);

const USERS = [
  { email: 'petrich@temax.bg', store_name: 'Петрич', active: true, is_regional: false, assigned_stores: [] },
  { email: 'gd@temax.bg', store_name: 'Гоце Делчев', active: true, is_regional: false, assigned_stores: [] },
  { email: 'sklad.tg@temax.bg', store_name: WH, active: true, is_regional: false, assigned_stores: [] }
];

/* Предишният jsdom се затваря при създаването на следващия: всяка секция
   ползва средите си една след друга, а ~30 незатворени прозореца бавеха пуска
   от ~50 сек до 6,5 мин (и „ЗАБИ" в npm test). */
let lastEnv = null;
function env(user, items, lists, opts) {
  /* След 3 сек, не веднага: асинхронни довършвания (llCoCheckSync → render)
     още може да чакат и биха гръмнали в затворен прозорец. */
  if (lastEnv) { const old = lastEnv; setTimeout(() => { try { old.close(); } catch (e) { /* вече затворен */ } }, 3000); }
  opts = opts || {};
  let ref = null;
  const applyPatches = (rows, table) => {
    if (!ref) return rows;
    ref.calls.patch.filter(p => p.table === table).forEach(p => {
      const m = /id=eq\.([^&]*)/.exec(p.url);
      if (!m) return;
      if (/approval_status=eq\.pending/.test(p.url)) {
        const r0 = rows.find(r => String(r.id) === decodeURIComponent(m[1]));
        if (!r0 || r0.approval_status !== 'pending') return;
      }
      const row = rows.find(r => String(r.id) === decodeURIComponent(m[1]));
      if (row) Object.assign(row, p.body);
    });
    return rows;
  };
  const h = boot({
    /* bulletin.js — toLocalISO (llTodayISO в „➕ Нов лист"). */
    modules: ['transport.js', 'client-orders.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js',
              'push.js', 'email.js', 'loading.js', 'transfers.js', 'notifications.js'],
    user: user,
    confirm: opts.confirm !== undefined ? opts.confirm : true,
    fail: opts.fail,
    data: {
      loading_list_items: function (url) {
        let rows = applyPatches((items || []).map(r => Object.assign({}, r)), 'loading_list_items');
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => String(r.store_name) === decodeURIComponent(st[1]));
        const li = /list_id=eq\.([^&]*)/.exec(url);
        if (li) rows = rows.filter(r => String(r.list_id) === decodeURIComponent(li[1]));
        const lin = /list_id=in\.\(([^)]*)\)/.exec(url);
        if (lin) { const s = lin[1].split(','); rows = rows.filter(r => s.indexOf(String(r.list_id)) >= 0); }
        return rows;
      },
      loading_lists: function (url) {
        let rows = applyPatches((lists || []).map(r => Object.assign({}, r)), 'loading_lists');
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const s = ids[1].split(','); rows = rows.filter(r => s.indexOf(String(r.id)) >= 0); }
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); rows = rows.filter(r => s.indexOf(r.status) >= 0); }
        const one = /[?&]id=eq\.([^&]*)/.exec(url);
        if (one) rows = rows.filter(r => String(r.id) === decodeURIComponent(one[1]));
        const wh = /warehouse=eq\.([^&]*)/.exec(url);
        if (wh) rows = rows.filter(r => r.warehouse === decodeURIComponent(wh[1]));
        return rows;
      },
      loading_list_photos: function (url) { return (opts.photos || []).map(r => Object.assign({}, r)); },
      users: USERS,
      app_settings: [{ key: 'loading_products', value: 'on' }],
      loading_list_products: [], product_catalog: [], stores: [], contacts: [],
      transport_orders: [], client_orders: [], stock_differences: [], differences_reports: [],
      stock_returns: [], goods_transit: [], transfers: [], transfer_cargo: [], transfer_cargo_events: []
    }
  });
  ref = h;
  lastEnv = h;
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: String(m), col: c }); return origToast(m, c); };
  h.w.pushToStores = () => Promise.resolve({ ok: true, status: 200, data: {} });
  h.w.pushToAll = () => Promise.resolve({ ok: true, data: {} });
  h.w.sendEmail = () => Promise.resolve({ ok: true, status: 200, data: {} });
  h.aprRows = 1;
  h.delCount = opts.delCount;   /* undefined → без Content-Range (count null) */
  const origFetch = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();
    const p = origFetch(url, init);
    if (method === 'PATCH' && /approval_status=eq\.pending/.test(url)) {
      return p.then(r => r.ok ? Object.assign({}, r, { headers: { get: k => (/^content-range$/i.test(k) ? '*/' + h.aprRows : null) } }) : r);
    }
    if (method === 'DELETE' && h.delCount !== undefined) {
      return p.then(r => r.ok ? Object.assign({}, r, { headers: { get: k => (/^content-range$/i.test(k) ? '*/' + h.delCount : null) } }) : r);
    }
    return p;
  };
  h.w.requestAnimationFrame = cb => setTimeout(cb, 0);
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const patchesTo = (h, t) => h.calls.patch.filter(p => p.table === t);
/* LL_ONLY=т.7,т.8 — пуска само тези секции (за сверката срещу стария код). */
const run = k => !process.env.LL_ONLY || process.env.LL_ONLY.split(',').indexOf(k) >= 0;
const hasToast = (h, re) => h.toasts.some(t => re.test(t.msg));

(async function () {

  /* ═══ т.1 Кавичка в поле ═══ */
  if (run('т.1')) { section('т.1 Кавичка: „Моят коментар" на обекта');
    const SC = 'кашонът е "мокър" и 0';
    const h = env(STORE, [it_({ id: 'i1', store_comment: SC })], [L_SENT]);
    h.w.loadLoadingLists(); await settle();
    const inp = h.doc.getElementById('ll-sc-i1');
    if (ok('полето е на екрана', !!inp, mod(h).textContent.slice(0, 200))) {
      ok('стойността в полето = записаната (с кавичките)', inp.value === SC, inp.value);
      inp.value = SC + '!';
      fire(h.w, inp, 'change'); await settle();
      const p = patchesTo(h, 'loading_list_items').pop();
      ok('записът носи целия текст', p && p.body.store_comment === SC + '!', JSON.stringify(p && p.body));
    }
  }

  if (run('т.1')) { section('т.1 Кавичка: „Товарил" и „Коментар" в редактора');
    const h = env(WAREHOUSE, [it_({ id: 'i1', list_id: 'L0' })], [L_DRAFT]);
    h.w.loadLoadingLists(); await settle();
    realClick(h.w, btn(mod(h), '✏️ Редакция')); await settle();
    const by = h.doc.getElementById('ll-by'), cm = h.doc.getElementById('ll-comment');
    if (ok('редакторът е отворен', !!by && !!cm, h.w.llView)) {
      ok('„Товарил" = записаното', by.value === Q, by.value);
      ok('„Коментар" = записаното', cm.value === L_DRAFT.comment, cm.value);
    }
  }

  if (run('т.1')) { section('т.1 Кавичка: „Коментар склад" в изгледа на изпратен лист + data-store в печата');
    const WC = 'стелажи 2.5" — горе';
    const ST = 'Обект "Х"';
    const h = env(WAREHOUSE, [it_({ id: 'i1', warehouse_comment: WC }), it_({ id: 'i2', position: 2, store_name: ST })], [L_SENT]);
    h.w.loadLoadingLists(); await settle();
    h.w.llOpenView('L1');
    const ta = h.doc.getElementById('ll-vwc-i1');
    if (ok('полето е на екрана', !!ta)) {
      ok('стойността в полето = записаната', ta.value === WC, ta.value);
      ta.value = WC + ' ok';
      fire(h.w, ta, 'change'); await settle();
      const p = patchesTo(h, 'loading_list_items').pop();
      ok('записът носи целия текст', p && p.body.warehouse_comment === WC + ' ok', JSON.stringify(p && p.body));
    }
    h.w.llPrint('L1'); await settle();
    const rows = Array.from(h.doc.querySelectorAll('#mod-print tr.lp-row[data-store]')).map(r => r.getAttribute('data-store'));
    ok('печат: data-store с кавичката е цял', rows.indexOf(ST) >= 0, JSON.stringify(rows));
  }

  /* ═══ т.2 Ред, който отпада мълчаливо ═══ */
  if (run('т.2')) { section('т.2 Ред с коментар / „Стока в стока" без обект спира записа');
    for (const fld of ['warehouse_comment', 'nested_codes']) {
      const h = env(WAREHOUSE, [], []);
      h.w.loadLoadingLists(); await settle();
      h.w.llNewList(); await settle();
      h.w.llDraft.units[0].store_name = 'Петрич';
      h.w.llDraft.units[2][fld] = fld === 'nested_codes' ? '98235/98234' : 'нещо важно';
      h.w.renderLoadingLists();
      realClick(h.w, btn(mod(h), '💾 Запази черновата')); await settle();
      ok(fld + ': нищо не се записва', h.calls.post.length === 0 && patchesTo(h, 'loading_lists').length === 0,
        JSON.stringify(h.calls.post.map(p => p.table)));
      ok(fld + ': червен toast с „Ред 3" и „липсва обект"',
        h.toasts.some(t => /Ред 3:/.test(t.msg) && /липсва обект/.test(t.msg) && t.col === '#dc2626'), JSON.stringify(h.toasts));
      ok(fld + ': фокусът е на обекта на ред 3', h.doc.activeElement && h.doc.activeElement.id === 'll-st-2',
        h.doc.activeElement && h.doc.activeElement.id);
      ok(fld + ': редът остава в редактора', h.w.llDraft.units.length === h.w.LL_NEW_ROWS);
    }
  }
  if (run('т.2')) { section('т.2 Напълно празните редове отпадат тихо');
    const h = env(WAREHOUSE, [], []);
    h.w.loadLoadingLists(); await settle();
    h.w.llNewList(); await settle();
    h.w.llDraft.units[4].store_name = 'Петрич';
    realClick(h.w, btn(mod(h), '💾 Запази черновата')); await settle();
    ok('листът се записва', h.calls.post.some(p => p.table === 'loading_lists'), JSON.stringify(h.calls.post.map(p => p.table)));
    ok('без червен toast', !h.toasts.some(t => t.col === '#dc2626'), JSON.stringify(h.toasts));
    const ip = h.calls.post.filter(p => p.table === 'loading_list_items');
    const body = ip.length ? [].concat(ip[0].body) : [];
    ok('записан е само редът с обект', ip.length === 1 && body.length === 1 && body[0].store_name === 'Петрич',
      JSON.stringify(ip.map(p => p.body)));
  }

  if (run('т.2')) { section('т.2 „⚡ Бързо добавяне" не присвоява ред с коментар (находка от прегледа)');
    const h = env(WAREHOUSE, [], []);
    h.w.loadLoadingLists(); await settle();
    h.w.llNewList(); await settle();
    h.w.llDraft.units[0].warehouse_comment = 'внимавай, мокро';
    h.w.llDraft.units[1].nested_codes = '98235/98234';
    h.w.llQuick.store = 'Петрич'; h.w.llQuick.pallet = 1; h.w.llQuick.roll = 0; h.w.llQuick.bulk = 0;
    h.w.llQuickAdd(); await settle();
    const u = h.w.llDraft.units;
    ok('редът с коментар остава без обект', u[0].store_name === '' && u[0].warehouse_comment === 'внимавай, мокро', JSON.stringify(u[0].store_name));
    ok('редът със „Стока в стока" остава без обект', u[1].store_name === '', JSON.stringify(u[1].store_name));
    ok('палетът отива на първия наистина празен ред', u[2].store_name === 'Петрич', JSON.stringify(u.slice(0, 3).map(x => x.store_name)));
    ok('llFreeSlot (и за „➕" от заявка): коментар / стока в стока → не е свободен',
      h.w.llFreeSlot(u[0]) === false && h.w.llFreeSlot(u[1]) === false && h.w.llFreeSlot(u[3]) === true);
  }

  /* ═══ т.3 Надписи по вид ═══ */
  if (run('т.3')) { section('т.3 Надписи „целия …" по вид — бутони, подсказка, confirm, toast');
    const KINDS = [
      ['pallet', '✅ Целият палет', '⛔ Неполучен целия палет', 'от палета', 'Палетът е отбелязан като неполучен'],
      ['roll', '✅ Цялото руло', '⛔ Неполучено цялото руло', 'от рулото', 'Рулото е отбелязано като неполучено'],
      ['oversize', '✅ Целият товар', '⛔ Неполучен целия товар', 'от товара', 'Товарът е отбелязан като неполучен']
    ];
    for (const [k, all, miss, of, done] of KINDS) {
      const items = [it_({ id: 'a', kind: k, purchase_doc: 'D1', warehouse_comment: 'x' }),
                     it_({ id: 'b', kind: k, purchase_doc: 'D2', warehouse_comment: 'x', position: 2 })];
      const h = env(STORE, items, [L_SENT]);
      h.w.loadLoadingLists(); await settle();
      const grp = mod(h).querySelector('tr[data-pallet-group="1"]:not([data-pallet-single])');
      if (!ok(k + ': групов ред', !!grp)) continue;
      ok(k + ': бутон „' + all + '"', !!btn(grp, all), grp.textContent);
      ok(k + ': бутон „' + miss + '"', !!btn(grp, miss), grp.textContent);
      const pc = grp.querySelector('input[id^="ll-pc-"]');
      ok(k + ': подсказката казва „' + miss.slice(2) + '"', pc && pc.getAttribute('placeholder').indexOf(miss.slice(2)) >= 0,
        pc && pc.getAttribute('placeholder'));
      realClick(h.w, btn(grp, all)); await settle();
      ok(k + ': confirm при „получен" казва „' + of + '"', h.calls.confirm.some(c => String(c).indexOf('2 реда ' + of + ' като получени') >= 0),
        JSON.stringify(h.calls.confirm));
      const h2 = env(STORE, items, [L_SENT]);
      h2.w.loadLoadingLists(); await settle();
      const g2 = mod(h2).querySelector('tr[data-pallet-group="1"]:not([data-pallet-single])');
      g2.querySelector('input[id^="ll-pc-"]').value = 'няма го';
      realClick(h2.w, btn(g2, miss)); await settle();
      ok(k + ': confirm при „неполучен" казва „' + of + '"', h2.calls.confirm.some(c => String(c).indexOf('2 реда ' + of + ' като НЕполучени') >= 0),
        JSON.stringify(h2.calls.confirm));
      ok(k + ': toast „' + done + '"', hasToast(h2, new RegExp(done)), JSON.stringify(h2.toasts));
    }
  }

  /* ═══ т.4 Етикетът ═══ */
  if (run('т.4')) { section('т.4 Етикетът по вид — HTML');
    const items = [
      it_({ id: 'p1', kind: 'pallet', pallet_no: 1, pallet_total: 1, purchase_doc: 'D1' }),
      it_({ id: 'r1', kind: 'roll', pallet_no: 2, pallet_total: 3, position: 2 }),
      it_({ id: 'o1', kind: 'oversize', pallet_no: 10, pallet_total: 12, position: 3, warehouse_comment: 'стелажи' })
    ];
    const h = env(WAREHOUSE, items, [L_SENT]);
    h.w.llQrSvg = () => '<svg></svg>';
    h.w.llLoadQrLib = () => Promise.resolve(true);
    h.w.loadLoadingLists(); await settle();
    h.w.llOpenView('L1');
    realClick(h.w, btn(mod(h), '🏷 Етикети на листа')); await settle();
    const pages = Array.from(h.doc.querySelectorAll('#mod-print .lt-page'));
    if (ok('3 етикета', pages.length === 3, String(pages.length))) {
      const t = pages.map(p => p.querySelector('.lt-pal').textContent);
      ok('палет: „ПАЛЕТ 1 от 1"', t[0] === 'ПАЛЕТ 1 от 1', t[0]);
      ok('руло: „РУЛО 2 от 3"', t[1] === 'РУЛО 2 от 3', t[1]);
      ok('извънгабаритен: „ИЗВЪНГАБАРИТЕН 10 от 12"', t[2] === 'ИЗВЪНГАБАРИТЕН 10 от 12', t[2]);
      ok('„В курса: единица i/n" на всеки', pages.every((p, i) => p.textContent.indexOf('единица ' + (i + 1) + '/3') >= 0));
      ok('никъде „палет i/n"', pages.every(p => !/палет \d+\/\d+/.test(p.textContent)));
      ok('описанието на извънгабаритния — под заглавието', pages[2].querySelector('.lt-sub') && pages[2].querySelector('.lt-sub').textContent === 'стелажи');
      ok('рулото без празен ред под заглавието', !pages[1].querySelector('.lt-sub'));
      /* Побиране. jsdom не мери, затова тук е МЕРЕНОТО в браузър (18.11.2026,
         Arial bold, като печата): „ИЗВЪНГАБАРИТЕН …" — 0,60 em на знак, палет /
         руло — 0,52–0,54. С 0,56 за всички „ИЗВЪНГАБАРИТЕН 10 от 12" излизаше
         194 mm в кутия от 190 и „12" падаше на втори ред; с llLabelTitlePt —
         165 mm, един ред. Тук: при 0,60 em заглавието влиза в 186 mm. */
      const MEASURED = { oversize: 0.60, roll: 0.52, pallet: 0.54 };
      const cases = [['oversize', 'ИЗВЪНГАБАРИТЕН 1 от 1'], ['oversize', 'ИЗВЪНГАБАРИТЕН 10 от 12'], ['oversize', 'ИЗВЪНГАБАРИТЕН 100 от 120'],
                     ['roll', 'РУЛО 11 от 11'], ['pallet', 'ПАЛЕТ 99 от 99']];
      cases.forEach(([k, t]) => {
        const pt = h.w.llLabelTitlePt({ kind: k }, t), w = t.length * MEASURED[k] * pt * 0.3528;
        ok('побира се на един ред: „' + t + '" (' + pt + 'pt ≈ ' + w.toFixed(0) + ' mm)', w <= 186, w.toFixed(1));
      });
      ok('шрифтът на извънгабаритния е реално под този на палета', parseFloat(pages[2].querySelector('.lt-pal').style.fontSize) < parseFloat(pages[0].querySelector('.lt-pal').style.fontSize));
      ok('палетът — както преди (llFitPt с 0,56 и 36pt)', h.w.llLabelTitlePt({ kind: 'pallet' }, 'ПАЛЕТ 1 от 2') === h.w.llFitPt('ПАЛЕТ 1 от 2', 80, 186, 36));
    }
  }
  if (run('т.4')) { section('т.4 Етикетът по вид — PDF');
    const items = [
      it_({ id: 'r1', kind: 'roll', pallet_no: 1, pallet_total: 1 }),
      it_({ id: 'o1', kind: 'oversize', pallet_no: 1, pallet_total: 2, position: 2, warehouse_comment: 'ламперия' })
    ];
    const h = env(WAREHOUSE, items, [L_SENT]);
    const rec = [];
    function Doc() {}
    Doc.prototype.text = function (t) { rec.push(String(t)); };
    Doc.prototype.output = () => 'data:application/pdf;base64,UERG';
    Doc.prototype.splitTextToSize = t => [String(t)];
    ['addFileToVFS', 'addFont', 'setFont', 'setFontSize', 'addPage', 'rect', 'setFillColor', 'setTextColor',
     'line', 'setDrawColor', 'setLineWidth', 'save'].forEach(m => { Doc.prototype[m] = function () {}; });
    h.w.jspdf = { jsPDF: Doc };
    h.w.llPdfFont = () => Promise.resolve('Rk9OVA==');
    h.w.llLoadQrLib = () => Promise.resolve(true);
    h.w.llQrMatrix = () => ({ n: 1, rows: [[true]] });
    h.w.loadLoadingLists(); await settle();
    await guard('llBuildLabelsPdf', () => h.w.llBuildLabelsPdf(h.w.llLists[0], h.w.llLabelUnits(h.w.llItemsOf('L1'))));
    await settle();
    ok('PDF: „РУЛО 1 от 1"', rec.indexOf('РУЛО 1 от 1') >= 0, JSON.stringify(rec));
    ok('PDF: „ИЗВЪНГАБАРИТЕН 1 от 2"', rec.indexOf('ИЗВЪНГАБАРИТЕН 1 от 2') >= 0);
    ok('PDF: „В курса: единица 2/2"', rec.indexOf('В курса: единица 2/2') >= 0);
    ok('PDF: описанието отделно', rec.indexOf('ламперия') >= 0);
    ok('PDF: никъде „ПАЛЕТ" и „палет i/n"', !rec.some(s => /ПАЛЕТ|палет \d/.test(s)), JSON.stringify(rec));
  }

  /* ═══ т.5 Снимки ═══ */
  if (run('т.5')) { section('т.5 „✕" на снимка от натоварването');
    const ph = [photo_({ id: 'p1', list_id: 'L0' })];
    const draft = env(WAREHOUSE, [it_({ id: 'i1', list_id: 'L0' })], [L_DRAFT], { photos: ph });
    draft.w.loadLoadingLists(); await settle();
    draft.w.llOpenView('L0');
    const x = mod(draft).querySelector('[data-ll-photo="p1"] button');
    ok('склад, чернова: „✕" се вижда', !!x);
    if (x) { realClick(draft.w, x); await settle(); ok('и трие', draft.calls.del.some(u => /loading_list_photos/.test(u)), JSON.stringify(draft.calls.del)); }

    const ph1 = [photo_({ id: 'p1', list_id: 'L1' })];
    const sent = env(WAREHOUSE, [it_({ id: 'i1' })], [L_SENT], { photos: ph1 });
    sent.w.loadLoadingLists(); await settle();
    sent.w.llOpenView('L1');
    ok('склад, изпратен: „✕" НЕ се вижда', !mod(sent).querySelector('[data-ll-photo="p1"] button'));
    const r = await sent.w.llDeletePhoto('L1', 'p1');
    ok('и извикване наум не трие', r === false && sent.calls.del.length === 0 && hasToast(sent, /Нямаш права/));

    const adm = env(ADMIN, [it_({ id: 'i1' })], [L_SENT], { photos: ph1 });
    adm.w.llWarehouse = WH;
    adm.w.loadLoadingLists(); await settle();
    adm.w.llOpenView('L1');
    ok('admin, изпратен: „✕" се вижда', !!mod(adm).querySelector('[data-ll-photo="p1"] button'));

    const recv = [photo_({ id: 'r1', list_id: 'L1', stage: 'received', store_name: 'Петрич', uploaded_by: 'Управител Петрич' })];
    const st = env(STORE, [it_({ id: 'i1' })], [L_SENT], { photos: recv });
    st.w.loadLoadingLists(); await settle();
    ok('обект, своя снимка при получаване, лист не е приключен: „✕" се вижда',
      !!mod(st).querySelector('[data-ll-photo="r1"] button'));
    const L_DONE = Object.assign({}, L_SENT, { status: 'done' });
    ok('обект, приключен лист: не може', st.w.llCanDeletePhoto(L_DONE, recv[0]) === false);
    ok('обект, чужда снимка от склада: не може', st.w.llCanDeletePhoto(L_SENT, ph1[0]) === false);
  }

  /* ═══ т.6 Списъкът на склада ═══ */
  if (run('т.6')) { section('т.6 Колона „Извънгаб." и „Товарил"');
    const items = [it_({ id: 'a', kind: 'oversize', warehouse_comment: 'x' }), it_({ id: 'b', kind: 'oversize', pallet_no: 2, position: 2, warehouse_comment: 'y' }),
                   it_({ id: 'c', kind: 'roll', position: 3 })];
    const h = env(WAREHOUSE, items, [L_SENT]);
    h.w.loadLoadingLists(); await settle();
    const ths = Array.from(mod(h).querySelectorAll('table.ll-tbl thead th')).map(t => t.textContent.trim());
    ok('колоните: … Палети, Извънгаб., Рула …, Товарил', ths.slice(3, 8).join('|') === 'Палети|Извънгаб.|Рула|Насип|Товарил', ths.join('|'));
    ok('без „Изпълнил"', ths.indexOf('Изпълнил') < 0);
    const tds = Array.from(mod(h).querySelectorAll('table.ll-tbl tbody tr')[0].children).map(t => t.textContent.trim());
    ok('редът: палети 0, извънгаб. 2, рула 1', tds[3] === '0' && tds[4] === '2' && tds[5] === '1', tds.join('|'));
  }

  /* ═══ т.7 Решение по извънреден ред от изгледа на склада ═══ */
  if (run('т.7')) { section('т.7 Одобрение / отхвърляне от склада приключва листа');
    const added = it_({ id: 'a1', position: 9, pallet_no: null, pallet_total: null, store_comment: 'палет с плочки',
      received: true, received_by: 'Управител Петрич', added_by_store: true, approval_status: 'pending' });
    for (const [label, approve, want] of [['одобрение', true, 'done'], ['отхвърляне', false, 'done']]) {
      const h = env(WAREHOUSE, [it_({ id: 'i1', received: true, received_by: 'Управител Петрич' }), Object.assign({}, added)], [L_SENT]);
      h.w.loadLoadingLists(); await settle();
      h.w.llOpenView('L1');
      h.doc.getElementById('ll-apr-a1').value = approve ? 'наред' : 'не е наше';
      realClick(h.w, btn(mod(h), approve ? '✅ Одобри' : '⛔ Отхвърли')); await settle();
      const lp = patchesTo(h, 'loading_lists');
      ok(label + ' от склада → PATCH status ' + want, lp.length === 1 && lp[0].body.status === want, JSON.stringify(lp.map(p => p.body)));
    }
    /* Не всички редове с отговор → листът остава отворен. */
    const h = env(WAREHOUSE, [it_({ id: 'i1' }), Object.assign({}, added)], [L_SENT]);
    h.w.loadLoadingLists(); await settle();
    h.w.llOpenView('L1');
    h.doc.getElementById('ll-apr-a1').value = 'ок';
    realClick(h.w, btn(mod(h), '✅ Одобри')); await settle();
    ok('ред без отговор → листът НЕ се приключва', patchesTo(h, 'loading_lists').length === 0);
  }

  /* ═══ т.8 QR от етикет за склад / admin ═══ */
  if (run('т.8')) { section('т.8 QR връзка от етикета');
    const items = [it_({ id: 'i1', kind: 'pallet', pallet_no: 1, pallet_total: 2, purchase_doc: 'D1' }),
                   it_({ id: 'i2', kind: 'pallet', pallet_no: 2, pallet_total: 2, position: 2 })];
    const tag = '#tl=L1&p=' + encodeURIComponent('pallet|2|Петрич');
    const h = env(WAREHOUSE, items, [L_SENT]);
    h.w.eval('llDeepLinkBoot(' + JSON.stringify(tag) + ')'); await settle();
    ok('складов акаунт: без червен екран', !h.doc.getElementById('ll-foreign-modal'));
    ok('отваря прегледа на листа', h.w.llView === 'view' && String(h.w.llCurrentId) === 'L1', h.w.llView + ' ' + h.w.llCurrentId);
    const hl = mod(h).querySelectorAll('tr[data-ll-hl="1"]');
    ok('подчертана е точно палет 2', hl.length === 1 && /палет 2 от 2/i.test(hl[0].textContent), hl.length + ' ' + (hl[0] && hl[0].textContent));

    const a = env(ADMIN, items, [L_SENT]);
    a.w.eval('llDeepLinkBoot(' + JSON.stringify(tag) + ')'); await settle();
    ok('admin: без червен екран', !a.doc.getElementById('ll-foreign-modal'));
    ok('admin: складът е избран и прегледът е отворен', a.w.llWarehouse === WH && a.w.llView === 'view', a.w.llWarehouse + ' ' + a.w.llView);
    ok('admin: подчертан ред', mod(a).querySelectorAll('tr[data-ll-hl="1"]').length === 1);

    const o = env(WAREHOUSE_OTHER, items, [L_SENT]);
    o.w.eval('llDeepLinkBoot(' + JSON.stringify(tag) + ')'); await settle();
    ok('друг склад: без червен екран, а съобщение', !o.doc.getElementById('ll-foreign-modal') && hasToast(o, /не е на склад/), JSON.stringify(o.toasts));

    const s = env(STORE, items, [L_SENT]);
    s.w.eval('llDeepLinkBoot(' + JSON.stringify('#tl=L1&p=' + encodeURIComponent('pallet|2|Габрово')) + ')'); await settle();
    ok('обект, чужд палет: червеният екран е на място', !!s.doc.getElementById('ll-foreign-modal'));
  }

  /* ═══ т.9 Нулиране при смяна на акаунт ═══ */
  if (run('т.9')) { section('т.9 llResetState при изход и при вход');
    const h = env(ADMIN, [], [L_SENT]);
    const dirty = () => { h.w.llWarehouse = WH; h.w.llCoDue = [{ id: 'co1' }]; h.w.llCoOther = { co1: {} };
      h.w.llCoSync = { L1: { state: 'x' } }; h.w.llCoWh = WH; h.w.llLists = [L_SENT]; h.w.llDraft = { units: [] }; };
    const clean = () => h.w.llWarehouse === '' && h.w.llCoDue.length === 0 && Object.keys(h.w.llCoOther).length === 0 &&
      Object.keys(h.w.llCoSync).length === 0 && h.w.llCoWh === '' && h.w.llLists.length === 0 && h.w.llDraft === null;
    dirty();
    guard('doLogout()', () => h.w.doLogout());
    ok('след изход — всичко е нулирано', clean(), JSON.stringify({ wh: h.w.llWarehouse, due: h.w.llCoDue.length }));
    dirty();
    h.w.currentUser = Object.assign({}, STORE);
    guard('startApp()', () => h.w.startApp());
    await settle();
    ok('след вход — избраният склад и заявките на предишния ги няма', h.w.llWarehouse === '' && h.w.llCoDue.length === 0 &&
      Object.keys(h.w.llCoSync).length === 0, JSON.stringify({ wh: h.w.llWarehouse, due: h.w.llCoDue.length }));
  }

  /* ═══ т.10 „🗑 Изтрий черновата" ═══ */
  if (run('т.10')) { section('т.10 „🗑 Изтрий черновата" — видимост');
    const items = [it_({ id: 'i1', list_id: 'L0' }), it_({ id: 'i2', list_id: 'L0', position: 2 })];
    const w = env(WAREHOUSE, items, [L_DRAFT]);
    w.w.loadLoadingLists(); await settle(); w.w.llOpenView('L0');
    ok('склад на листа, чернова: бутонът е до „Редакция"', !!btn(mod(w), '🗑 Изтрий черновата'));
    const s = env(WAREHOUSE, [it_({ id: 'i1' })], [L_SENT]);
    s.w.loadLoadingLists(); await settle(); s.w.llOpenView('L1');
    ok('изпратен лист: бутонът го НЯМА', !btn(mod(s), '🗑 Изтрий черновата'));
    const a = env(ADMIN, items, [L_DRAFT]);
    a.w.llWarehouse = WH; a.w.loadLoadingLists(); await settle(); a.w.llOpenView('L0');
    ok('admin, чернова: има го', !!btn(mod(a), '🗑 Изтрий черновата'));
    const o = env(WAREHOUSE_OTHER, items, [L_DRAFT]);
    ok('друг склад: llCanDeleteDraft = false', o.w.llCanDeleteDraft(L_DRAFT) === false);
    const st = env(STORE, items, [L_DRAFT]);
    ok('обект: llCanDeleteDraft = false', st.w.llCanDeleteDraft(L_DRAFT) === false);
    st.w.loadLoadingLists(); await settle();
    ok('обект: бутонът никъде на екрана', !btn(mod(st), 'Изтрий черновата'));
  }
  if (run('т.10')) { section('т.10 „🗑 Изтрий черновата" — отказ, успех, провал, 0 реда');
    const items = [it_({ id: 'i1', list_id: 'L0' }), it_({ id: 'i2', list_id: 'L0', position: 2 })];
    const no = env(WAREHOUSE, items, [L_DRAFT], { confirm: false });
    no.w.loadLoadingLists(); await settle(); no.w.llOpenView('L0');
    realClick(no.w, btn(mod(no), '🗑 Изтрий черновата')); await settle();
    ok('confirm с датата и броя редове', no.calls.confirm.some(c => /18\.11\.2026/.test(c) && /2 реда/.test(c)), JSON.stringify(no.calls.confirm));
    ok('отказ в confirm → нищо не се трие', no.calls.del.length === 0);

    const yes = env(WAREHOUSE, items, [L_DRAFT]);
    yes.w.loadLoadingLists(); await settle(); yes.w.llOpenView('L0');
    realClick(yes.w, btn(mod(yes), '🗑 Изтрий черновата')); await settle();
    const d = yes.calls.del.filter(u => /loading_lists/.test(u));
    ok('успех: DELETE по id и status=eq.draft', d.length === 1 && /id=eq\.L0/.test(d[0]) && /status=eq\.draft/.test(d[0]), JSON.stringify(yes.calls.del));
    ok('успех: редовете не се трият ръчно (каскадата)', !yes.calls.del.some(u => /loading_list_items|loading_list_photos/.test(u)));
    ok('успех: обратно в списъка + toast', yes.w.llView === 'list' && hasToast(yes, /Черновата от 18\.11\.2026 е изтрита/), yes.w.llView + JSON.stringify(yes.toasts));

    const bad = env(WAREHOUSE, items, [L_DRAFT], { fail: { DELETE: /loading_lists/ } });
    bad.w.loadLoadingLists(); await settle(); bad.w.llOpenView('L0');
    realClick(bad.w, btn(mod(bad), '🗑 Изтрий черновата')); await settle();
    ok('провал: червен toast, листът остава', bad.toasts.some(t => /НЕ беше изтрита/.test(t.msg) && t.col === '#dc2626') &&
      bad.w.llView === 'view' && bad.w.llLists.length === 1, JSON.stringify(bad.toasts));

    const zero = env(WAREHOUSE, items, [L_DRAFT], { delCount: 0 });
    zero.w.loadLoadingLists(); await settle(); zero.w.llOpenView('L0');
    realClick(zero.w, btn(mod(zero), '🗑 Изтрий черновата')); await settle();
    ok('0 изтрити реда (вече изпратен) → провал, не „изтрито"', hasToast(zero, /НЕ беше изтрита/) && !hasToast(zero, /е изтрита$/), JSON.stringify(zero.toasts));

    const sent = env(WAREHOUSE, [it_({ id: 'i1' })], [L_SENT]);
    sent.w.loadLoadingLists(); await settle();
    const r = await sent.w.llDeleteDraft('L1');
    ok('извикване наум на изпратен лист → нищо', r === false && sent.calls.del.length === 0 && hasToast(sent, /Само чернова/), JSON.stringify(sent.toasts));
  }

  /* ═══ т.11 Дълъг „Коментар склад" ═══ */
  if (run('т.11')) { section('т.11 Дълъг „Коментар склад" — целият текст, без загуба на фокус');
    const LONG = 'Палетът е с горен ред от стъклени буркани, да не се слага нищо отгоре; ' +
      'долу са плочките за Петрич, а кашоните с лепило са отзад вдясно до стената.';
    const h = env(WAREHOUSE, [it_({ id: 'i1', list_id: 'L0', warehouse_comment: LONG })], [L_DRAFT]);
    h.w.loadLoadingLists(); await settle();
    realClick(h.w, btn(mod(h), '✏️ Редакция')); await settle();
    const ta = h.doc.getElementById('ll-wc-0');
    if (ok('редактор: полето е <textarea>', ta && ta.tagName === 'TEXTAREA', ta && ta.tagName)) {
      ok('редактор: целият текст е в полето', ta.value === LONG);
      ok('редактор: расте — rows > 1, но ≤ 4', +ta.getAttribute('rows') > 1 && +ta.getAttribute('rows') <= 4, ta.getAttribute('rows'));
      ok('чипът „🧾 КЗ" и „Стока в стока" са след полето', ta.nextElementSibling !== null);
      ta.focus();
      ta.value = LONG + ' Ново.';
      fire(h.w, ta, 'input'); await settle();
      ok('писането не прерисува: същият елемент е във фокус', h.doc.activeElement === ta && h.doc.getElementById('ll-wc-0') === ta);
      ok('и стойността е в черновата', h.w.llDraft.units[0].warehouse_comment === LONG + ' Ново.');
    }
    const v = env(WAREHOUSE, [it_({ id: 'i1', warehouse_comment: LONG })], [L_SENT]);
    v.w.loadLoadingLists(); await settle(); v.w.llOpenView('L1');
    const vt = v.doc.getElementById('ll-vwc-i1');
    ok('изпратен лист: <textarea> с целия текст', vt && vt.tagName === 'TEXTAREA' && vt.value === LONG);
    ok('изпратен лист: rows > 1', vt && +vt.getAttribute('rows') > 1);
    ok('кратък текст → 1 ред', v.w.llTaRows('кратко') === 1 && v.w.llTaRows('') === 1 && v.w.llTaRows('x'.repeat(500)) === 4);
  }

  report();
})();
