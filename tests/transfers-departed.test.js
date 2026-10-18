/* Трансфери — отметка „🚚 Тръгна" за бус и камион + статус „Изпратен"
   (18.10.2026). ИНТЕГРАЦИОНЕН: report.js + transfers.js — „в път" /
   „застоял" идват от reportTransferOpenStates (report.js), общото правило
   с седмичния отчет.

   Какво заковава файлът:
   a) Бутонът: създателят и админът — да; спирка, получател, глобална роля
      (accounting) — не; куриер — не.
   b) Реален клик → прозорче → запис → PATCH transfers {departed_at ISO,
      departed_by, status 'sent'}; статус „Изпратен"; в картата „🚚 тръгна";
      повторно → отказ с причината, 0 PATCH.
   c) Получателят: „⏳ още не е тръгнал от Враца" преди, „🚚 в път от … —
      очаква се в Раднево" след — в картата, в „📥 За потвърждение" и в
      резултатите от търсенето по товар; „Получен" остава наличен и преди.
   d) „🗑 Изтрий" липсва след тръгване; tfCanDelete дава причината.
   e) Чипът „Изпратен" филтрира.
   f) Застоял: departed_at преди 8 дни, depart_date преди 2 → застоял 8 дни
      (броим от departed_at); без departed_at → от depart_date; tfIsStale и
      reportTransferStale дават едно и също.
   g) Печат: ред „Тръгнал" с часа и кой.
   h) Час преди създаването → отказ, 0 PATCH; час в бъдещето → отказ.

   Мутационна проверка (18.10.2026, всяка поотделно):
     1. tfComputeStatus без 'sent' (transfers.js)          → пада b), e)
     2. departed_at махнат от since (report.js)            → пада f)
     3. махната проверката „вече е тръгнал" (transfers.js) → пада b)
   И трите събарят теста.

   Пускане:  node tests/transfers-departed.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Враца', 'Монтана', 'Раднево', 'Централен офис'];
const U = function (store, role) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: role || 'manager', store_name: store }; };
const ADMIN = { id: 'adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const ACC = { id: 'acc', email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: 'Централен офис' };
const daysAgo = function (n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(9, 0, 0, 0); return d.toISOString(); };
const ISO = function (n) { return daysAgo(n).slice(0, 10); };

/* Бус Враца → Монтана → Раднево, товар за Раднево. */
const T = { id: 't1', transfer_num: 'Враца-0003', from_store: 'Враца', mode: 'bus', depart_date: ISO(2), depart_time: '08:00',
            driver: 'Иван', stops: ['Монтана'], end_store: 'Раднево', status: 'planned', created_at: daysAgo(10), departed_at: null, departed_by: null };
const C = { id: 'c1', transfer_id: 't1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Раднево', transfer_points: [] };
const K = { id: 'k1', transfer_num: 'Враца-0004', from_store: 'Враца', mode: 'courier', courier_company: 'Econt', stops: [], end_store: 'Раднево',
            status: 'planned', created_at: daysAgo(1), departed_at: null };
const KC = { id: 'kc', transfer_id: 'k1', position: 1, kind: 'carton', qty: 1, recipient_store: 'Раднево', transfer_points: [] };
const departed = function (n, extra) { return Object.assign({}, T, { departed_at: daysAgo(n), departed_by: 'Управител Враца', status: 'sent' }, extra || {}); };

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['stock-differences.js', 'report.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: opts.transfers || [T, K], transfer_cargo: opts.cargo || [C, KC], transfer_cargo_events: [],
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: [], app_settings: []
    }
  });
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ m: m, red: c === '#dc2626' }); return orig(m, c); };
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
const patches = function (h) { return h.calls.patch.filter(function (p) { return p.table === 'transfers'; }); };
async function open(h) { h.w.showModule('transfers'); await ticks(); await ticks(); }
async function card(h, id) { h.w.openTransferCard(id); await ticks(); }
const visibleIds = function (h) { return $$(h, '#trf-table tbody tr[data-id]').map(function (r) { return r.getAttribute('data-id'); }); };

(async function () {

  section('a) Кой вижда „🚚 Тръгна"');
  {
    const rows = [[U('Враца'), true, 'създателят'], [ADMIN, true, 'админ'], [U('Монтана'), false, 'спирка'],
                  [U('Раднево'), false, 'получател'], [ACC, false, 'accounting (офис)']];
    for (const r of rows) {
      const h = env(r[0]);
      await open(h); await card(h, 't1');
      ok(r[2] + ': бутон ' + (r[1] ? 'има' : 'няма'), !!$(h, '#trf-card') && !!$(h, '#trf-depart') === r[1]);
      h.close();
    }
    const hk = env(U('Враца'));
    await open(hk); await card(hk, 'k1');
    ok('куриер: бутон няма', !!$(hk, '#trf-card') && !$(hk, '#trf-depart'));
    ok('куриер: причината', /Предаден на куриер/.test(hk.w.tfCanDepart(K) || ''));
    hk.close();
  }

  section('b) Клик → прозорче → запис; повторно → отказ');
  {
    const h = env(U('Враца'));
    await open(h); await card(h, 't1');
    ok('преди: „Планиран"', $(h, '#trf-card .trf-status').getAttribute('data-status') === 'planned');
    realClick(h.w, $(h, '#trf-depart')); await ticks();
    const inp = $(h, '#tfd-time');
    ok('прозорчето: поле за час, по подразбиране сега', !!inp && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inp.value) && inp.value === h.w.tfLocalDT(new Date()), inp && inp.value);
    ok('min = създаването, max = сега', inp.getAttribute('min') === h.w.tfLocalDT(new Date(T.created_at)) && !!inp.getAttribute('max'));
    realClick(h.w, $(h, '#tfd-save')); await ticks();
    const p = patches(h)[0] || {};
    ok('PATCH transfers по id', p.url && /transfers\?id=eq\.t1$/.test(p.url), p.url);
    ok('departed_at — ISO, departed_by — името, status — sent',
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test((p.body || {}).departed_at) && p.body.departed_by === 'Управител Враца' && p.body.status === 'sent', JSON.stringify(p.body));
    ok('статусът е „Изпратен"', $(h, '#trf-card .trf-status').getAttribute('data-status') === 'sent' && /Изпратен/.test($(h, '#trf-card .trf-status').textContent));
    ok('в картата: „🚚 тръгна …" след шофьора', /шофьор Иван · 🚚 тръгна \d\d\.\d\d \d\d:\d\d/.test($(h, '#trf-card').textContent));
    ok('бутонът изчезва', !$(h, '#trf-depart'));
    h.w.openDepartModal('t1'); await ticks();
    const last = h.toasts[h.toasts.length - 1] || {};
    ok('повторно → „Транспортът вече е тръгнал на …"', last.red && /^Транспортът вече е тръгнал на \d\d\.\d\d \d\d:\d\d\.$/.test(last.m), JSON.stringify(last));
    ok('0 нови PATCH, без прозорче', patches(h).length === 1 && !$(h, '#tfd-ov'));
    /* И при запис от вече отворено прозорче (друг е отбелязал междувременно). */
    h.w.tfDepartForm = { tid: 't1', value: h.w.tfLocalDT(new Date()), saving: false };
    h.w.renderDepartModal(); realClick(h.w, $(h, '#tfd-save')); await ticks();
    ok('запис от отворено прозорче → отказ, 0 PATCH', patches(h).length === 1 && /вече е тръгнал/.test(($(h, '#tfd-error') || {}).textContent || ''));
    h.close();
  }

  section('c) Получателят: преди и след');
  {
    const h = env(U('Раднево'));
    await open(h);
    h.w.tfSetFilter('mine'); await ticks();
    const st = ($(h, '.trf-pending-row[data-c="c1"] .trf-state') || {}).textContent || '';
    ok('„За потвърждение" преди: „⏳ още не е тръгнал от Враца"', st === '⏳ още не е тръгнал от Враца', st);
    ok('„Получен" е наличен и преди тръгването', !!$(h, '.trf-pending-row[data-c="c1"] .trf-act-received'));
    await h.w.tfSearchCargo('Раднево'); await ticks();
    const hit = ($(h, '.trf-cargo-hit[data-c="c1"] .trf-cargo-last') || {}).textContent || '';
    ok('търсене по товар преди: „още не е тръгнал"', /още не е тръгнал от Враца/.test(hit), hit);
    h.close();

    const h2 = env(U('Раднево'), { transfers: [departed(1), K] });
    await open(h2); await card(h2, 't1');
    const want = '🚚 в път от ' + h2.w.tfFmtTs(daysAgo(1)) + ' — очаква се в Раднево';
    const st2 = $(h2, '.trf-card-cargo[data-c="c1"] .trf-state').textContent;
    ok('картата след: „🚚 в път от … — очаква се в Раднево"', st2 === want, st2);
    h2.w.closeTransferCard(); h2.w.tfSetFilter('mine'); await ticks();
    ok('„За потвърждение" след: същото', (($(h2, '.trf-pending-row[data-c="c1"] .trf-state') || {}).textContent || '') === want);
    await h2.w.tfSearchCargo('Раднево'); await ticks();
    ok('търсене по товар след: „в път от …"', /🚚 в път от .* — очаква се в Раднево/.test(($(h2, '.trf-cargo-hit[data-c="c1"] .trf-cargo-last') || {}).textContent || ''));
    ok('куриер — без промяна („очаква се")', /^⏳ очаква се в Раднево$/.test(h2.w.tfCargoStateText(K, KC, [])), h2.w.tfCargoStateText(K, KC, []));
    h2.close();
  }

  section('d) „🗑 Изтрий" след тръгване');
  {
    const h = env(U('Враца'), { transfers: [departed(1), K] });
    await open(h); await card(h, 't1');
    ok('бутон „Изтрий" няма', !$(h, '#trf-delete'));
    ok('tfCanDelete: „Тръгнал транспорт не се трие."', h.w.tfCanDelete(h.w.tfFindTransfer('t1')) === 'Тръгнал транспорт не се трие.');
    const h2 = env(U('Враца'));
    await open(h2); await card(h2, 't1');
    ok('контрол: нетръгнал — „Изтрий" има', !!$(h2, '#trf-delete'));
    h.close(); h2.close();
  }

  section('e) Чип „Изпратен"');
  {
    const T2 = Object.assign({}, T, { id: 't2', transfer_num: 'Враца-0005' });
    const C2 = Object.assign({}, C, { id: 'c2', transfer_id: 't2' });
    const h = env(U('Враца'), { transfers: [departed(1), T2], cargo: [C, C2] });
    await open(h);
    const chip = $(h, '.trf-q[data-g="status"][data-v="sent"]');
    ok('чип „Изпратен" съществува', !!chip && chip.textContent === 'Изпратен');
    realClick(h.w, chip); await ticks();
    ok('филтрира само тръгналия', visibleIds(h).join(',') === 't1', visibleIds(h).join(','));
    realClick(h.w, $(h, '.trf-q[data-g="status"][data-v="planned"]')); await ticks();
    ok('„Планиран" — само нетръгналия', visibleIds(h).join(',') === 't2', visibleIds(h).join(','));
    h.close();
    const h2 = env(U('Враца'), { transfers: [departed(1)], cargo: [C] });
    await open(h2);
    ok('редът в списъка носи „🚚 тръгна"', /🚚 тръгна \d\d\.\d\d \d\d:\d\d/.test(($(h2, '#trf-table tr[data-id="t1"] .trf-departed') || {}).textContent || ''));
    h2.close();
  }

  section('f) Застоял — от departed_at');
  {
    const h = env(U('Раднево'), { transfers: [departed(8, { depart_date: ISO(2) })], cargo: [C] });
    await open(h);
    const st = h.w.tfIsStale(C);
    ok('departed_at преди 8 дни, depart_date преди 2 → застоял „в път", 8 дни', !!st && st.reason === 'transit' && st.age === 8, JSON.stringify(st));
    const r = h.w.reportTransferStale(h.w.tfFindTransfer('t1'), C, [], false, 7, h.w.tfRefD());
    ok('reportTransferStale дава същото', !!r && r.age === st.age && r.reason === st.reason);
    h.close();
    const h2 = env(U('Раднево'), { transfers: [Object.assign({}, T, { depart_date: ISO(2) })], cargo: [C] });
    await open(h2);
    ok('без departed_at → от depart_date (2 дни) — не е застоял', h2.w.tfIsStale(C) === null);
    const os = h2.w.reportTransferOpenStates(h2.w.tfFindTransfer('t1'), C, [], false, h2.w.tfRefD());
    ok('„в път" от depart_date', os.length === 1 && os[0].reason === 'transit' && os[0].since === ISO(2), JSON.stringify(os));
    h2.close();
  }

  section('g) Печат');
  {
    const h = env(U('Враца'), { transfers: [departed(1), K] });
    await open(h);
    h.w.printTransfer('t1'); await ticks();
    const txt = ($(h, '#mod-print') || {}).textContent || '';
    ok('ред „Тръгнал" с часа и кой', txt.indexOf('Тръгнал' + h.w.tfFmtTs(daysAgo(1)) + ' · Управител Враца') >= 0, txt.slice(0, 300));
    h.w.printTransfer('k1'); await ticks();
    ok('куриер — без ред „Тръгнал"', !/Тръгнал/.test(($(h, '#mod-print') || {}).textContent || ''));
    h.close();
  }

  section('h) Час преди създаването / в бъдещето');
  {
    const h = env(U('Враца'));
    await open(h); await card(h, 't1');
    realClick(h.w, $(h, '#trf-depart')); await ticks();
    const inp = $(h, '#tfd-time');
    inp.value = h.w.tfLocalDT(new Date(new Date(T.created_at).getTime() - 3600000)); fire(h.w, inp, 'change');
    realClick(h.w, $(h, '#tfd-save')); await ticks();
    ok('час преди създаването → отказ', /преди създаването на транспорта/.test(($(h, '#tfd-error') || {}).textContent || ''), ($(h, '#tfd-error') || {}).textContent);
    ok('0 PATCH', patches(h).length === 0);
    const fut = h.w.tfValidateDepart(T, h.w.tfLocalDT(new Date(Date.now() + 3 * 3600000)));
    ok('час в бъдещето → отказ', fut.err === 'Часът не може да е в бъдещето.', JSON.stringify(fut));
    const exact = h.w.tfValidateDepart(T, h.w.tfLocalDT(new Date(T.created_at)));
    ok('точно в минутата на създаването → приема се', !!exact.iso, JSON.stringify(exact));
    ok('празно → „Въведи час на тръгване."', h.w.tfValidateDepart(T, '').err === 'Въведи час на тръгване.');
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
