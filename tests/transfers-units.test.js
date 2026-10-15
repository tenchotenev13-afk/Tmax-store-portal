/* Трансфери — приемане ПО ЕДИНИЦА (15.10.2026). ИНТЕГРАЦИОНЕН: shared.js +
   report.js + loading.js + transfers.js в реда от index.html — броячите и
   „застоял" идват от reportTransferOpenStates (report.js), deep link-ът минава
   през startApp → llDeepLinkBoot → tfDeepLinkBoot.

   „Получен" / „Разтоварен" се отбелязват за всяка единица (unit = 1..qty);
   товарът е приключен, когато всички са отбелязани; отметка без unit (стара)
   покрива целия товар.

   Какво заковава файлът:
   a) qty 3, received unit 1 и 2 → „получени 2/3", транспорт „Частично",
      В път 1, За потвърждение при мен 1, бутон „(1 остава)"; третата през
      прозорчето → „получен", „Завършен".
   b) стара отметка (unit null) при qty 3 → приключен.
   c) повторна отметка за същата единица → отказ с текста, 0 POST.
   d) deep link &u=2 → квадратче 2 подчертано в картата и избрано в
      прозорчето; след отметка нов deep link с u=2 → toast „Кашон 2/3 вече
      е получен в Раднево".
   e) multi-select 1+3 → ЕДИН POST с 2 реда (unit 1 и 3); провал → червен
      toast „Нищо не е записано (0 от 2)" — един INSERT е атомарен, тоест
      „записана 1 от 2" няма как да се случи (отклонение от задачата,
      обяснено в отчета).
   f) unloaded по единица в точка на прехвърляне: 2/3 → НЕ е в „Чакащи
      прехвърляне"; 3/3 → е; „От чакащите" взема целия товар (qty 3).
   g) история (карта) и печат: „1/3 · Раднево · Получен".
   h) problem с unit 3 → „Проблем (липсва) · 3/3"; през прозорчето — unit 3.
   i) qty 1 — без квадратчета, едно натискане, unit 1.
   j) застоял по последната единица (report.js), не по първата.
   + tfUnitsState (transfers.js) и reportTransferUnits (report.js) дават едно
     и също на едни и същи отметки.

   Мутационна проверка (15.10.2026, всяка поотделно върху transfers.js):
     1. отметка без unit НЕ покрива всички (махнато all = true) → пада b)
     2. „приключен" при ≥1 единица (done.length вместо left)    → пада a)
     3. повторна единица минава (махната проверката в
        tfEventAllowed)                                          → пада c)
   И трите събарят теста.

   Пускане:  node tests/transfers-units.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Кърджали', 'Раднево', 'Троян', 'Варна', 'Централен офис'];
const U = function (store) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: 'manager', store_name: store }; };
const daysAgo = function (n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d.toISOString(); };
const ISO = function (n) { return daysAgo(n).slice(0, 10); };

/* T1: Кърджали → Раднево, кашон ×3 за Раднево. */
const T1 = { id: 't1', transfer_num: 'Кърджали-0050', from_store: 'Кърджали', mode: 'bus', depart_date: ISO(3), depart_time: '08:00',
             stops: [], end_store: 'Раднево', status: 'planned', created_at: daysAgo(3) };
const X = { id: 'x', transfer_id: 't1', position: 1, kind: 'carton', qty: 3, recipient_store: 'Раднево', transfer_points: [] };
/* T2: Кърджали → Троян → Варна, палет ×3 за Варна, прехвърляне в Троян. */
const T2 = { id: 't2', transfer_num: 'Кърджали-0051', from_store: 'Кърджали', mode: 'bus', depart_date: ISO(25), depart_time: '08:00',
             stops: ['Троян'], end_store: 'Варна', status: 'partial', created_at: daysAgo(25) };
const Y = { id: 'y', transfer_id: 't2', position: 1, kind: 'pallet', qty: 3, recipient_store: 'Варна', transfer_points: ['Троян'] };
/* T3: qty 1 за Раднево. */
const T3 = { id: 't3', transfer_num: 'Кърджали-0052', from_store: 'Кърджали', mode: 'bus', depart_date: ISO(1), depart_time: '08:00',
             stops: [], end_store: 'Раднево', status: 'planned', created_at: daysAgo(1) };
const Z = { id: 'z', transfer_id: 't3', position: 1, kind: 'roll', qty: 1, recipient_store: 'Раднево', transfer_points: [] };

const ev = function (id, cargo, event, store, unit, ago, extra) {
  return Object.assign({ id: id, cargo_id: cargo.id, transfer_id: cargo.transfer_id, event: event, store_name: store,
    unit: unit, created_at: daysAgo(ago == null ? 0 : ago) }, extra || {});
};

function env(user, opts) {
  opts = opts || {};
  const box = { h: null };
  /* Фалшивата база пази POST-натите отметки (масив → по ред на единица). */
  const stored = function () {
    const rows = box.h ? [].concat.apply([], box.h.calls.post.filter(function (p) { return p.table === 'transfer_cargo_events' && !p.failed; })
      .map(function (p) { return Array.isArray(p.body) ? p.body : [p.body]; })) : [];
    return (opts.events || []).concat(rows.map(function (r, i) { return Object.assign({ id: 'p-' + i, created_at: new Date().toISOString() }, r); }));
  };
  const h = boot({
    modules: ['stock-differences.js', 'report.js', 'loading.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: opts.transfers || [T1],
      transfer_cargo: opts.cargo || [X],
      transfer_cargo_events: function () { return opts.failEvents ? (opts.events || []) : stored(); },
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: [], loading_list_products: [],
      loading_list_photos: [], app_settings: [], goods_transit: [], stores: [], contacts: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    },
    fail: opts.fail
  });
  box.h = h;
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ m: m, red: c === '#dc2626' }); return orig(m, c); };
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
const posts = function (h) { return h.calls.post.filter(function (p) { return p.table === 'transfer_cargo_events'; }); };
const counter = function (h, k) { const b = $(h, '.trf-counter[data-k="' + k + '"]'); return b ? Number(b.querySelector('.trf-counter-n').textContent) : null; };
async function open(h) { h.w.showModule('transfers'); await ticks(); await ticks(); }
async function card(h, id) { realClick(h.w, H.btn($(h, '#trf-table tbody tr[data-id="' + id + '"]'), 'Отвори')); await ticks(); }
const cardCargo = function (h, cid) { return $(h, '.trf-card-cargo[data-c="' + cid + '"]'); };
const stateOf = function (h, cid) { const c = cardCargo(h, cid); return c ? c.querySelector('.trf-state').textContent : ''; };
async function tick(h, n) { const u = $(h, '#tfe-u-' + n); u.checked = !u.checked; fire(h.w, u, 'change'); await ticks(); }

(async function () {

  section('a) qty 3: две единици → „получени 2/3"; третата → „получен"');
  {
    const h = env(U('Раднево'), { events: [ev('e1', X, 'received', 'Раднево', 1, 1), ev('e2', X, 'received', 'Раднево', 2, 0)] });
    await open(h);
    ok('транспортът е „Частично"', ($(h, '#trf-table tr[data-id="t1"] .trf-status') || {}).getAttribute && $(h, '#trf-table tr[data-id="t1"] .trf-status').getAttribute('data-status') === 'partial');
    ok('прогресът 0/1 товар', /0\/1/.test($(h, '#trf-table tr[data-id="t1"] .trf-progress').textContent));
    ok('🚐 В път = 1 (частично получен е още в път)', counter(h, 'transit') === 1, String(counter(h, 'transit')));
    ok('📥 За потвърждение при мен = 1 (остава 1 единица)', h.w.tfPendingItems('').length === 1);
    await card(h, 't1');
    ok('състоянието: „получени 2/3 в Раднево"', /получени 2\/3 в Раднево/.test(stateOf(h, 'x')), stateOf(h, 'x'));
    const b = cardCargo(h, 'x').querySelector('.trf-act-received');
    ok('бутонът: „✅ Получен (1 остава)"', !!b && /Получен \(1 остава\)/.test(b.textContent), b && b.textContent);
    ok('ивицата: 1 ✅ 2 ✅ 3 ⬜', $$(h, '.trf-card-cargo[data-c="x"] .trf-unit').map(function (s) { return s.getAttribute('data-done'); }).join('') === '110');
    realClick(h.w, b); await ticks();
    ok('прозорчето: 1 и 2 са отбелязани и заключени, 3 е избрано', $(h, '#tfe-u-1').disabled && $(h, '#tfe-u-2').disabled && $(h, '#tfe-u-3').checked && !$(h, '#tfe-u-3').disabled);
    realClick(h.w, $(h, '#tfe-save')); await ticks(); await ticks();
    const body = (posts(h)[0] || {}).body || {};
    ok('POST: received, unit 3', !Array.isArray(body) && body.event === 'received' && body.unit === 3, JSON.stringify(body));
    const pt = h.calls.patch.filter(function (p) { return p.table === 'transfers'; })[0];
    ok('транспортът → done', pt && pt.body.status === 'done', JSON.stringify(pt && pt.body));
    await open(h); await card(h, 't1');
    ok('състоянието: „✅ получен в Раднево"', /✅ получен в Раднево/.test(stateOf(h, 'x')), stateOf(h, 'x'));
    ok('без бутон „Получен"', !cardCargo(h, 'x').querySelector('.trf-act-received'));
    h.close();
  }

  section('b) стара отметка без unit покрива целия товар');
  {
    const h = env(U('Раднево'), { events: [ev('old', X, 'received', 'Раднево', null, 2)] });
    await open(h); await card(h, 't1');
    ok('qty 3 + една стара отметка → приключен', h.w.tfCargoDone(X, h.w.tfEventsOf('t1')));
    ok('„✅ получен в Раднево"', /✅ получен в Раднево/.test(stateOf(h, 'x')), stateOf(h, 'x'));
    ok('ивицата: 1 ✅ 2 ✅ 3 ✅', $$(h, '.trf-card-cargo[data-c="x"] .trf-unit').map(function (s) { return s.getAttribute('data-done'); }).join('') === '111');
    ok('нищо не чака потвърждение', h.w.tfPendingItems('').length === 0);
    h.close();
  }

  section('c) повторна отметка за същата единица → отказ, 0 POST');
  {
    const h = env(U('Раднево'), { events: [ev('e1', X, 'received', 'Раднево', 1, 0)] });
    await open(h); await card(h, 't1');
    const why = h.w.tfEventAllowed('received', T1, X, h.w.tfEventsOf('t1'), 'Раднево', false, 1);
    ok('правилото: „Кашон 1/3 вече е получен в Раднево."', why === 'Кашон 1/3 вече е получен в Раднево.', why);
    ok('свободна единица минава', h.w.tfEventAllowed('received', T1, X, h.w.tfEventsOf('t1'), 'Раднево', false, 2) === null);
    ok('несъществуваща единица → отказ', /Няма единица 4/.test(h.w.tfEventAllowed('received', T1, X, h.w.tfEventsOf('t1'), 'Раднево', false, 4) || ''));
    realClick(h.w, cardCargo(h, 'x').querySelector('.trf-act-received')); await ticks();
    /* Между отварянето и клика друг е отбелязал 1 — формата я държи избрана. */
    h.w.tfEvForm.units = [1];
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    ok('0 POST', posts(h).length === 0);
    ok('грешката е във формата', /Кашон 1\/3 вече е получен в Раднево/.test(($(h, '#tfe-error') || {}).textContent || ''));
    h.close();
  }

  section('d) deep link &u=2 → квадратче 2; после „вече е получен"');
  {
    const h = env(U('Раднево'), { events: [ev('e1', X, 'received', 'Раднево', 1, 0)] });
    h.w.history.replaceState(null, '', '/#tf=t1&c=x&u=2');
    h.w.startApp(); await ticks(); await ticks(); await ticks();
    ok('картата е отворена с подчертан товар', !!$(h, '#trf-card') && !!$(h, '.trf-card-cargo[data-c="x"][data-trf-hl="1"]'));
    const hlU = $(h, '.trf-card-cargo[data-c="x"] .trf-unit[data-trf-hl-unit="1"]');
    ok('в ивицата е подчертана единица 2', !!hlU && hlU.getAttribute('data-u') === '2', hlU && hlU.outerHTML);
    realClick(h.w, cardCargo(h, 'x').querySelector('.trf-act-received')); await ticks();
    ok('в прозорчето е избрана 2, не първата свободна', $(h, '#tfe-u-2').checked && !$(h, '#tfe-u-3').checked);
    ok('нищо не е записано само', posts(h).length === 0);
    realClick(h.w, $(h, '#tfe-save')); await ticks(); await ticks();
    ok('POST: unit 2', ((posts(h)[0] || {}).body || {}).unit === 2);
    h.w.tfDeepLinkBoot('#tf=t1&c=x&u=2'); await ticks(); await ticks(); await ticks();
    ok('повторно сканиране → toast „Кашон 2/3 вече е получен в Раднево"', h.toasts.some(function (t) { return t.m === 'Кашон 2/3 вече е получен в Раднево'; }), JSON.stringify(h.toasts.map(function (t) { return t.m; })));
    ok('и нищо не е избрано', !$(h, '.trf-unit[data-trf-hl-unit="1"]') && h.w.tfHighlightUnit === null);
    ok('и нищо не е записано', posts(h).length === 1);
    h.close();
  }

  section('e) multi-select 1 + 3 → един POST с 2 реда; провал → 0 от 2');
  {
    const h = env(U('Раднево'));
    await open(h); await card(h, 't1');
    realClick(h.w, cardCargo(h, 'x').querySelector('.trf-act-received')); await ticks();
    ok('първата свободна (1) е избрана', $(h, '#tfe-u-1').checked && !$(h, '#tfe-u-2').checked);
    await tick(h, 3);
    realClick(h.w, $(h, '#tfe-save')); await ticks(); await ticks();
    const bodies = posts(h).map(function (p) { return p.body; });
    ok('ЕДИН POST', bodies.length === 1, String(bodies.length));
    ok('с 2 реда: unit 1 и 3, received, Раднево', Array.isArray(bodies[0]) && bodies[0].map(function (r) { return r.unit + r.event + r.store_name; }).join('|') === '1receivedРаднево|3receivedРаднево', JSON.stringify(bodies[0]));
    ok('toast „✅ Получен · 1, 3 от 3"', h.toasts.some(function (t) { return t.m === '✅ Получен · 1, 3 от 3'; }), JSON.stringify(h.toasts.map(function (t) { return t.m; })));
    await ticks(); await ticks();
    ok('картата остава отворена (презареждане с keepView)', !!$(h, '#trf-card'));
    ok('след презареждане: „получени 2/3"', /получени 2\/3/.test(stateOf(h, 'x')), stateOf(h, 'x'));
    h.close();

    const h2 = env(U('Раднево'), { fail: { POST: /transfer_cargo_events/ }, failEvents: true });
    await open(h2); await card(h2, 't1');
    realClick(h2.w, cardCargo(h2, 'x').querySelector('.trf-act-received')); await ticks();
    await tick(h2, 3);
    realClick(h2.w, $(h2, '#tfe-save')); await ticks();
    const last = h2.toasts[h2.toasts.length - 1] || {};
    ok('провал → червен toast „Нищо не е записано (0 от 2)"', last.red && /^Нищо не е записано \(0 от 2\)/.test(last.m), JSON.stringify(last));
    ok('прозорчето остава отворено с избора', !!$(h2, '#tfe-ov') && $(h2, '#tfe-u-1').checked && $(h2, '#tfe-u-3').checked);
    ok('нищо не е добавено в паметта', h2.w.tfEventsOf('t1').length === 0);
    h2.close();
  }

  section('f) „Разтоварен" по единица в точка на прехвърляне');
  {
    const two = [ev('u1', Y, 'unloaded', 'Троян', 1, 1), ev('u2', Y, 'unloaded', 'Троян', 2, 1)];
    const h = env(U('Троян'), { transfers: [T2], cargo: [Y], events: two });
    await open(h);
    ok('2/3 → НЕ е в „Чакащи прехвърляне"', h.w.tfReshipItems(['Троян'], '').length === 0 && counter(h, 'reship') === 0);
    await card(h, 't2');
    ok('„⏸ разтоварени 2/3 в Троян — чака прехвърляне"', /разтоварени 2\/3 в Троян — чака прехвърляне/.test(stateOf(h, 'y')), stateOf(h, 'y'));
    ok('бутонът „⏸ Разтоварен — чака прехвърляне (1 остава)"', /Разтоварен — чака прехвърляне \(1 остава\)/.test((cardCargo(h, 'y').querySelector('.trf-act-unloaded') || {}).textContent || ''));
    h.close();

    const h2 = env(U('Троян'), { transfers: [T2], cargo: [Y], events: two.concat([ev('u3', Y, 'unloaded', 'Троян', 3, 0)]) });
    await open(h2);
    const re = h2.w.tfReshipItems(['Троян'], '');
    ok('3/3 → е в „Чакащи прехвърляне"', re.length === 1 && re[0].c.id === 'y' && counter(h2, 'reship') === 1);
    ok('чака от най-новата единица (днес)', re[0].days === 0 && re[0].ev.id === 'u3', JSON.stringify({ d: re[0].days, ev: re[0].ev.id }));
    realClick(h2.w, $(h2, '#trf-new')); await ticks();
    h2.w.tfAddReshipCargo('y'); await ticks();
    const lk = h2.w.tfForm.cargo.filter(function (c) { return c.locked; })[0];
    ok('„От чакащите" взема целия товар: qty 3, prev = y', !!lk && Number(lk.qty) === 3 && lk.prev_cargo_id === 'y', JSON.stringify(lk));
    h2.close();
  }

  section('g) история и печат: „1/3 · Раднево · Получен"');
  {
    const h = env(U('Раднево'), { events: [ev('e1', X, 'received', 'Раднево', 1, 0)] });
    await open(h); await card(h, 't1');
    const li = (cardCargo(h, 'x').querySelector('.trf-history li') || {}).textContent || '';
    ok('картата: „1/3 · Раднево · Получен"', /· 1\/3 · Раднево · Получен$/.test(li.trim()), li);
    h.w.printTransfer('t1'); await ticks();
    const pr = ($(h, '#mod-print') || {}).textContent || '';
    ok('печатът: „1/3 · Раднево · Получен"', /1\/3 · Раднево · Получен/.test(pr), pr.slice(0, 300));
    ok('отметка без unit — без „n/qty"', h.w.tfHistUnit({ unit: null, event: 'received' }) === '');
    h.close();
  }

  section('h) „Проблем" по единица');
  {
    const p3 = ev('p3', X, 'problem', 'Раднево', 3, 0, { problem_kind: 'missing', comment: 'липсва' });
    const h = env(U('Раднево'), { events: [p3] });
    await open(h);
    ok('текст: „Проблем (липсва) · 3/3"', /^Проблем \(липсва\) · 3\/3/.test(h.w.tfEventText(p3)), h.w.tfEventText(p3));
    ok('проблемът не приключва нищо', !h.w.tfCargoDone(X, h.w.tfEventsOf('t1')));
    await card(h, 't1');
    realClick(h.w, cardCargo(h, 'x').querySelector('.trf-act-problem')); await ticks();
    ok('„целият товар" е избран по подразбиране', $(h, '#tfe-whole').checked);
    await tick(h, 2);
    ok('единица 2 маха „целият товар"', !$(h, '#tfe-whole').checked && $(h, '#tfe-u-2').checked);
    const pk = $(h, '#tfe-pkind'); pk.value = 'damaged'; fire(h.w, pk, 'change');
    const cm = $(h, '#tfe-comment'); cm.value = 'смачкан'; fire(h.w, cm, 'input');
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    const b = (posts(h)[0] || {}).body || {};
    ok('POST: problem, unit 2', b.event === 'problem' && b.unit === 2 && b.problem_kind === 'damaged', JSON.stringify(b));
    h.close();

    const h2 = env(U('Раднево'));
    await open(h2); await card(h2, 't1');
    realClick(h2.w, cardCargo(h2, 'x').querySelector('.trf-act-problem')); await ticks();
    const pk2 = $(h2, '#tfe-pkind'); pk2.value = 'missing'; fire(h2.w, pk2, 'change');
    const cm2 = $(h2, '#tfe-comment'); cm2.value = 'липсва'; fire(h2.w, cm2, 'input');
    realClick(h2.w, $(h2, '#tfe-save')); await ticks();
    ok('целият товар → POST с unit null', ((posts(h2)[0] || {}).body || {}).unit === null);
    h2.close();
  }

  section('i) qty 1 — без квадратчета, едно натискане');
  {
    const h = env(U('Раднево'), { transfers: [T3], cargo: [Z] });
    await open(h); await card(h, 't3');
    const b = cardCargo(h, 'z').querySelector('.trf-act-received');
    ok('бутонът е „✅ Получен" без „остават"', !!b && /Получен$/.test(b.textContent.trim()), b && b.textContent);
    ok('без ивица с единици', !cardCargo(h, 'z').querySelector('.trf-units'));
    realClick(h.w, b); await ticks();
    ok('прозорчето е без квадратчета', !!$(h, '#tfe-ov') && !$(h, '#tfe-units'));
    realClick(h.w, $(h, '#tfe-save')); await ticks(); await ticks();
    const body = (posts(h)[0] || {}).body || {};
    ok('POST: един ред, unit 1', !Array.isArray(body) && body.unit === 1 && body.event === 'received', JSON.stringify(body));
    await open(h); await card(h, 't3');
    ok('„✅ получен в Раднево"', /✅ получен в Раднево/.test(stateOf(h, 'z')), stateOf(h, 'z'));
    h.close();
  }

  section('j) застоял — по последната единица');
  {
    const mixed = [ev('a1', Y, 'unloaded', 'Троян', 1, 20), ev('a2', Y, 'unloaded', 'Троян', 2, 2), ev('a3', Y, 'unloaded', 'Троян', 3, 2)];
    const h = env(U('Троян'), { transfers: [T2], cargo: [Y], events: mixed });
    await open(h);
    ok('първата единица преди 20 дни, последната преди 2 → НЕ е застоял', h.w.tfIsStale(Y) === null, JSON.stringify(h.w.tfIsStale(Y)));
    ok('🕒 Застояли = 0', counter(h, 'stale') === 0, String(counter(h, 'stale')));
    h.close();

    const old = [ev('b1', Y, 'unloaded', 'Троян', 1, 20), ev('b2', Y, 'unloaded', 'Троян', 2, 19), ev('b3', Y, 'unloaded', 'Троян', 3, 18)];
    const h2 = env(U('Троян'), { transfers: [T2], cargo: [Y], events: old });
    await open(h2);
    const st = h2.w.tfIsStale(Y);
    ok('всички преди 18+ дни → застоял „чака прехвърляне", 18 дни', !!st && st.reason === 'reship' && st.age === 18, JSON.stringify(st));
    h2.close();

    const part = [ev('c1', Y, 'unloaded', 'Троян', 1, 1)];
    const h3 = env(U('Троян'), { transfers: [T2], cargo: [Y], events: part });
    await open(h3);
    const st3 = h3.w.tfIsStale(Y);
    ok('частично разтоварен → „в път" от тръгването (25 дни)', !!st3 && st3.reason === 'transit' && st3.age === 25, JSON.stringify(st3));
    h3.close();
  }

  section('+ tfUnitsState = reportTransferUnits');
  {
    const h = env(U('Раднево'));
    const sets = [
      [], [ev('1', X, 'received', 'Раднево', 1, 1)], [ev('2', X, 'received', 'Раднево', null, 1)],
      [ev('3', X, 'received', 'Раднево', 3, 2), ev('4', X, 'received', 'Варна', 1, 1), ev('5', X, 'unloaded', 'Раднево', 2, 0)],
      [ev('6', X, 'received', 'Раднево', 9, 0), ev('7', X, 'received', 'Раднево', 2, 0)]
    ];
    const same = sets.every(function (evs) {
      const a = h.w.tfUnitsState(X, evs, 'received', 'Раднево'), b = h.w.reportTransferUnits(X, evs, 'received', 'Раднево');
      return JSON.stringify([a.qty, a.done, a.left, a.last && a.last.id]) === JSON.stringify([b.qty, b.done, b.left, b.last && b.last.id]);
    });
    ok('пет набора отметки — едно и също', same);
    ok('единица извън 1..qty се пренебрегва', h.w.tfUnitsState(X, sets[4], 'received', 'Раднево').done.join(',') === '2');
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
