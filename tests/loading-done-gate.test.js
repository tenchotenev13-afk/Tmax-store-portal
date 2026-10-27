/* Товарни листи — „✅ Приключи" при НЕОТМЕТНАТИ от обекта редове.

   Решение на Тенчо 27.10.2026 (вариант А, claude/task-loading-done-gate.md):
   складът НЕ може да приключи лист, докато има ред, по който обектът не се е
   произнесъл (received=false и missing=false) — червен toast с броя и
   обектите, нищо не се записва. Admin може, след confirm със същия текст.
   Повод: лист от 16.10.2026 (Търговище → Сливен, Раднево) приключен с 9
   неотметнати реда.

   Отхвърленият ред (approval_status='rejected') не съществува за листа и НЕ
   се брои. Ред, който чака одобрение, си остава със стария гейт и стария toast.

   Всичко минава през истински клик по „✅ Приключи" в изгледа на листа.

   МУТАЦИИ (пуснати 27.10.2026 — всичките убити, виж края на файла):
     M1  без новата проверка (llUnmarkedRows връща [])
     M2  брои и отхвърлените (llItemsOf вместо llLiveRows(llItemsOf))
     M3  admin също блокиран (махнат клонът за admin)
     M4  title на бутона без броя

   Пускане:  node tests/loading-done-gate.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const ANCHOR = new Date(2026, 9, 27, 10, 0, 0);   // 27.10.2026 10:00 София

const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const LOGISTICS = { email: 'log@temax.bg', display_name: 'Логистика 2',
                    role: 'logistics', store_name: 'Централен офис', assigned_stores: [] };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ',
                role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

const L_SENT = { id: 'L1', warehouse: WH, list_date: '2026-10-27', status: 'sent',
                 executed_by: 'Иван', comment: '', created_by: 'Склад Търговище',
                 created_at: '2026-10-27T05:00:00.000Z',
                 sent_at: '2026-10-27T05:30:00.000Z', done_at: null };

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet',
    pallet_no: 1, pallet_total: 1, purchase_doc: null, clears_doc: null,
    store_name: 'Сливен', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null, approval_status: null,
    created_at: '2026-10-27T05:00:00.000Z'
  }, o);
}
const REC = { received: true, received_by: 'Управител', received_at: '2026-10-27T08:00:00.000Z' };
const MISS = { missing: true, missing_by: 'Управител', missing_at: '2026-10-27T08:00:00.000Z' };

function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}

function env(user, items, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js',
              'push.js', 'email.js', 'loading.js'],
    user: user,
    confirm: opts.confirm !== undefined ? opts.confirm : true,
    data: {
      loading_list_items: function (url) {
        let rows = items.map(r => Object.assign({}, r));
        const lm = /list_id=eq\.([^&]*)/.exec(url);
        if (lm) rows = rows.filter(r => String(r.list_id) === decodeURIComponent(lm[1]));
        return rows;
      },
      loading_lists: [Object.assign({}, L_SENT)],
      users: [], stores: [], contacts: [], transport_orders: [], client_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  freezeDate(h.w);
  h.w.pushToStores = function () { return Promise.resolve({ ok: true, status: 200, data: {} }); };
  h.w.pushToAll = function () { return Promise.resolve({ ok: true, data: {} }); };
  h.w.sendEmail = function () { return Promise.resolve({ ok: true, status: 200, data: {} }); };
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return origToast(m, c); };
  return h;
}

const listPatches = h => h.calls.patch.filter(p => p.table === 'loading_lists');

/* Отваря листа и кликва „✅ Приключи". Връща бутона (за title-а). */
async function openAndClick(h) {
  h.w.loadLoadingLists();
  await ticks(); await ticks();
  h.w.llOpenView('L1');
  const b = btn(h.doc.getElementById('mod-loading'), '✅ Приключи');
  if (!b) return null;
  realClick(h.w, b);
  await ticks(); await ticks(); await ticks();
  return b;
}

(async function () {

  section('а) Склад, 3 реда, 1 неотметнат → червен toast, НУЛА PATCH');
  {
    const h = env(WAREHOUSE, [
      it_(Object.assign({ id: 'i1', position: 1 }, REC)),
      it_(Object.assign({ id: 'i2', position: 2, pallet_no: 2 }, REC)),
      it_({ id: 'i3', position: 3, pallet_no: 3 })
    ]);
    const b = await openAndClick(h);
    if (ok('бутонът „✅ Приключи" е видим (не се крие)', !!b)) {
      ok('title на бутона носи броя и обекта',
        b.getAttribute('title') === '1 ред още не е отметнат от обекта (Обект: Сливен)',
        b.getAttribute('title'));
    }
    const t = h.toasts[h.toasts.length - 1] || {};
    ok('toast „1 ред … (Обект: Сливен)"',
      t.msg === '1 ред още не е отметнат от обекта (Обект: Сливен)', JSON.stringify(h.toasts));
    ok('toast-ът е червен', t.col === '#dc2626', t.col);
    ok('НУЛА PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch));
    ok('без confirm — складът няма избор', h.calls.confirm.length === 0, JSON.stringify(h.calls.confirm));
  }

  section('а2) Logistics — същият гейт като склада; два обекта, сортирани');
  {
    const h = env(LOGISTICS, [
      it_(Object.assign({ id: 'i1', position: 1 }, REC)),
      it_({ id: 'i2', position: 2, pallet_no: 2, store_name: 'Сливен' }),
      it_({ id: 'i3', position: 3, pallet_no: 3, store_name: 'Раднево' })
    ]);
    h.w.eval("llWarehouse = " + JSON.stringify(WH));
    await openAndClick(h);
    const t = h.toasts[h.toasts.length - 1] || {};
    ok('„2 реда … (Обект: Раднево, Сливен)"',
      t.msg === '2 реда още не са отметнати от обекта (Обект: Раднево, Сливен)', JSON.stringify(h.toasts));
    ok('НУЛА PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch));
  }

  section('б) Склад, всички received → done, 1 PATCH, старият confirm');
  {
    const h = env(WAREHOUSE, [
      it_(Object.assign({ id: 'i1', position: 1 }, REC)),
      it_(Object.assign({ id: 'i2', position: 2, pallet_no: 2 }, REC)),
      it_(Object.assign({ id: 'i3', position: 3, pallet_no: 3 }, REC))
    ]);
    const b = await openAndClick(h);
    ok('без title, когато няма неотметнати', b && !b.hasAttribute('title'), b && b.getAttribute('title'));
    const lp = listPatches(h);
    if (ok('1 PATCH', lp.length === 1, JSON.stringify(h.calls.patch))) {
      ok('status:done', lp[0].body.status === 'done', JSON.stringify(lp[0].body));
      ok('done_at = фиксираният час', lp[0].body.done_at === ANCHOR.toISOString(), lp[0].body.done_at);
    }
    ok('confirm е старият текст', h.calls.confirm.length === 1 &&
      h.calls.confirm[0] === 'Приключи товарния лист?', JSON.stringify(h.calls.confirm));
  }

  section('в) Склад, 1 missing + останалите received → partial');
  {
    const h = env(WAREHOUSE, [
      it_(Object.assign({ id: 'i1', position: 1 }, REC)),
      it_(Object.assign({ id: 'i2', position: 2, pallet_no: 2 }, MISS)),
      it_(Object.assign({ id: 'i3', position: 3, pallet_no: 3 }, REC))
    ]);
    await openAndClick(h);
    const lp = listPatches(h);
    if (ok('1 PATCH', lp.length === 1, JSON.stringify(h.calls.patch))) {
      ok('status:partial', lp[0].body.status === 'partial', JSON.stringify(lp[0].body));
    }
  }

  section('г) Отхвърлен НЕОТМЕТНАТ ред не се брои → done');
  {
    const h = env(WAREHOUSE, [
      it_(Object.assign({ id: 'i1', position: 1 }, REC)),
      it_(Object.assign({ id: 'i2', position: 2, pallet_no: 2 }, REC)),
      it_({ id: 'i3', position: 3, pallet_no: 3, approval_status: 'rejected' })
    ]);
    await openAndClick(h);
    const lp = listPatches(h);
    if (ok('1 PATCH — отхвърленият не блокира', lp.length === 1, JSON.stringify(h.toasts))) {
      ok('status:done', lp[0].body.status === 'done', JSON.stringify(lp[0].body));
    }
  }

  section('д) Admin с неотметнат → confirm с броя; „не" → НУЛА PATCH');
  {
    const h = env(ADMIN, [
      it_(Object.assign({ id: 'i1', position: 1 }, REC)),
      it_({ id: 'i2', position: 2, pallet_no: 2 })
    ], { confirm: false });
    h.w.eval("llWarehouse = " + JSON.stringify(WH));
    await openAndClick(h);
    ok('един confirm с броя, обекта и въпроса', h.calls.confirm.length === 1 &&
      h.calls.confirm[0] === '1 ред още не е отметнат от обекта (Обект: Сливен)\nПриключваш ли все пак?',
      JSON.stringify(h.calls.confirm));
    ok('НУЛА PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch));
    ok('без червен toast — admin не е блокиран', !h.toasts.some(t => /не е отметнат/.test(t.msg)),
      JSON.stringify(h.toasts));
  }

  section('д2) Admin с неотметнат, „да" → PATCH, един-единствен confirm');
  {
    const h = env(ADMIN, [
      it_(Object.assign({ id: 'i1', position: 1 }, REC)),
      it_({ id: 'i2', position: 2, pallet_no: 2 })
    ], { confirm: true });
    h.w.eval("llWarehouse = " + JSON.stringify(WH));
    await openAndClick(h);
    const lp = listPatches(h);
    if (ok('1 PATCH', lp.length === 1, JSON.stringify(h.calls.patch))) {
      ok('status:done (неотметнатият не е липса)', lp[0].body.status === 'done', JSON.stringify(lp[0].body));
    }
    ok('точно един confirm (без втория „Приключи товарния лист?")', h.calls.confirm.length === 1,
      JSON.stringify(h.calls.confirm));
  }

  section('е) Ред, чакащ одобрение → старият toast, както досега');
  {
    const h = env(WAREHOUSE, [
      it_(Object.assign({ id: 'i1', position: 1 }, REC)),
      it_({ id: 'i2', position: 2, pallet_no: 2 }),
      it_(Object.assign({ id: 'i3', position: 3, pallet_no: 3, approval_status: 'pending' }, REC))
    ]);
    await openAndClick(h);
    const t = h.toasts[h.toasts.length - 1] || {};
    ok('toast „Има извънреден ред, който чака одобрение"',
      t.msg === 'Има извънреден ред, който чака одобрение', JSON.stringify(h.toasts));
    ok('жълт, както досега', t.col === '#d97706', t.col);
    ok('НУЛА PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch));
    ok('без confirm', h.calls.confirm.length === 0, JSON.stringify(h.calls.confirm));
  }

  report();
})();

/* ═══ МУТАНТИТЕ, ПУСНАТИ НА 27.10.2026 ═══════════════════════════════════════
   Чист код: 27 успешни, 0 неуспешни, exit 0 (база 69241aa + промяната).
   M1  llUnmarkedRows → return []                       → exit 1, 8 ❌ (а, а2, д, д2)
   M2  llItemsOf вместо llLiveRows(llItemsOf(...))       → exit 1, 1 ❌ (г: отхвърленият блокира)
   M3  без клона за admin (toast + return за всички)     → exit 1, 4 ❌ (д, д2)
   M4  title „Има неотметнати" без броя и обекта         → exit 1, 1 ❌ (а: title)
*/
