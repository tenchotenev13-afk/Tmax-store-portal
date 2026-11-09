/* Трансфери — банерът на обекта „🚚 N товара пътуват към вас и чакат отговор"
   (08.11.2026, по модела на Стока на път 8191625 и Товарни листи b49ff7a).

   ПРАВИЛОТО (решение на Тенчо 08.11 — строго): товар, по който обектът има
   бутон за крайната отметка днес (получател → „✅ Получен"; първа точка на
   прехвърляне → „⏸ Разтоварен — чака прехвърляне"), И транспортът е тръгнал:
   бус — departed_at; куриер — „Предаден на куриер" за ТОЗИ товар. Датата —
   най-ранният такъв момент, както картата показва тръгването (tfFmtTs).

   ТВЪРДЕНИЯТА (реалният ред от index.html, showModule('transfers')):
   1. Севлиево: 4 товара (2 получени като получател, 1 точка на прехвърляне,
      1 куриер предаден), най-старият 21.10 — по средата; не се броят: вече
      получен, чужд обект, нетръгнал бус с минала дата (01.10), куриер без
      „Предаден".
   2. Етикетите в банера = текста на бутоните в „📥 За потвърждение при мен".
   3. Истински клик „✅ Получен" → запис → банерът казва 3.
   4. 1 товар — единствено число; невалидна дата — без скобите; 0 → без банер.
   5. Чужд обект (Габрово) — само своя товар.
   6. Складът е реален получател — вижда своя; admin и контролинг — без банер.

   МУТАЦИИ (ръчно, 08.11.2026 — всяка пада): M1 датата от най-новия; M2 брои
   нетръгнали; M3 брои вече отбелязаните; M4 банерът и на глобален профил.

   Пускане:  node tests/transfers-store-banner.test.js . */
'use strict';
process.env.TZ = 'Europe/Sofia';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const WH = 'Логистичен склад Търговище';
const STORES = ['Севлиево', 'Габрово', 'Троян', 'Варна', 'Кърджали', 'Централен офис', WH];
const U = (store, role) => ({ id: 'u-' + store, email: 'x@temax.bg', display_name: 'Управител ' + store, role: role || 'manager', store_name: store, assigned_stores: [] });
const ADMIN = U('Централен офис', 'admin');
const ACC = U('Централен офис', 'accounting');

const bus = (id, departed, extra) => Object.assign({ id: id, transfer_num: 'Кърджали-' + id, from_store: 'Кърджали', mode: 'bus',
  depart_date: '2026-10-01', depart_time: '08:00', driver: 'Иван', stops: [], end_store: 'Севлиево',
  status: departed ? 'sent' : 'planned', departed_at: departed, created_at: '2026-09-29T08:00:00Z' }, extra || {});
const cg = (id, tid, recip, extra) => Object.assign({ id: id, transfer_id: tid, position: 1, kind: 'pallet', qty: 1,
  recipient_store: recip, transfer_points: [] }, extra || {});

function fixture() {
  const transfers = [
    bus('T1', '2026-10-25T08:00:00Z'),
    bus('T2', '2026-10-21T08:35:00Z'),                       /* най-старият тръгнал */
    bus('T3', '2026-11-02T10:00:00Z', { end_store: 'Троян', stops: ['Севлиево'] }),
    bus('T4', null, { depart_date: '2026-10-01' }),           /* НЕ е тръгнал, датата е минала */
    { id: 'T5', transfer_num: 'Варна-T5', from_store: 'Варна', mode: 'courier', courier_company: 'Econt', waybill_no: null,
      stops: [], end_store: 'Севлиево', status: 'partial', created_at: '2026-09-20T09:00:00Z' }
  ];
  const cargo = [
    cg('c1', 'T1', 'Севлиево'),
    cg('c2', 'T1', 'Севлиево', { position: 2 }),             /* вече получен */
    cg('c9', 'T1', WH, { position: 3 }),                     /* за склада */
    cg('c3', 'T2', 'Севлиево'),
    cg('c4', 'T2', 'Габрово', { position: 2 }),              /* чужд */
    cg('c5', 'T3', 'Троян', { transfer_points: ['Севлиево'] }), /* точка на прехвърляне */
    cg('c6', 'T4', 'Севлиево'),
    cg('c7', 'T5', 'Севлиево'),                              /* предаден на куриер */
    cg('c8', 'T5', 'Севлиево', { position: 2 })              /* не е предаден */
  ];
  const events = [
    { id: 'e1', cargo_id: 'c2', transfer_id: 'T1', store_name: 'Севлиево', event: 'received', unit: null, created_at: '2026-10-26T09:00:00Z' },
    { id: 'e2', cargo_id: 'c7', transfer_id: 'T5', store_name: 'Варна', event: 'handed_to_courier', unit: null, created_at: '2026-10-30T09:00:00Z' }
  ];
  return { transfers, cargo, events };
}

function env(user, f) {
  const box = { h: null };
  const storedEvents = function () {
    const rows = box.h ? [].concat.apply([], box.h.calls.post.filter(p => p.table === 'transfer_cargo_events')
      .map(p => Array.isArray(p.body) ? p.body : [p.body])) : [];
    const posted = rows.map((r, i) => Object.assign({ id: 'ev-' + i, created_at: '2026-11-08T1' + i + ':00:00Z' }, r));
    return f.events.concat(posted);
  };
  const h = boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      transfers: f.transfers, transfer_cargo: f.cargo, transfer_cargo_events: storedEvents,
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: []
    }
  });
  box.h = h;
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 8); i++) await ticks(); }
async function open(user, f) { const h = env(user, f || fixture()); h.w.showModule('transfers'); await settle(); return h; }
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const banner = h => h.doc.getElementById('trf-wait-note');
const TAIL = ' Дотогава трансферът не става „Завършен“.';

(async function () {

  section('1. Севлиево: 4 товара, най-старият тръгнал на 21.10');
  {
    const h = await open(U('Севлиево'));
    const EXP = '🚚 4 товара пътуват към вас и чакат отговор (най-старият тръгнал на 21.10). ' +
      'Отбележете всеки с ✅ Получен или ⏸ Разтоварен — чака прехвърляне, когато пристигне.' + TAIL;
    ok('точният текст', txt(banner(h)) === EXP, txt(banner(h)));
    ok('товарите са c1, c3, c5, c7', h.w.tfStoreWaitItems().map(x => x.c.id).sort().join(',') === 'c1,c3,c5,c7',
      h.w.tfStoreWaitItems().map(x => x.c.id).join(','));
    ok('числото е <b>4</b>', txt(banner(h).querySelector('b')) === '4');
    ok('дата от нетръгнал бус (01.10) не влиза', txt(banner(h)).indexOf('01.10') < 0);
    ok('последствието идва от TF_STATUS_LABELS.done', h.w.TF_STATUS_LABELS.done === 'Завършен');
    ok('банерът е над таблицата', !!h.doc.getElementById('trf-table') &&
      (banner(h).compareDocumentPosition(h.doc.getElementById('trf-table')) & 4) !== 0);

    section('2. Етикетите в банера = бутоните');
    realClick(h.w, h.doc.querySelector('.trf-filter[data-f="mine"]')); await settle();
    const bt = k => Array.from(h.doc.querySelectorAll('.trf-act-' + k)).map(txt);
    ['received', 'unloaded'].forEach(k => {
      const lbl = h.w.tfEventBtnText(k);
      ok('бутон „' + lbl + '" е на екрана', bt(k).indexOf(lbl) >= 0, JSON.stringify(bt(k)));
      ok('… и е в банера', txt(banner(h)).indexOf(lbl) >= 0);
    });
    ok('банерът стои и във филтъра „За потвърждение"', !!banner(h));
    /* „⚠️ Проблем" НЕ е в банера (решение 09.11): не маха товара от броя.
       Бутонът си стои на екрана — банерът просто не го предлага. */
    ok('„Проблем" го няма в банера', txt(banner(h)).indexOf('Проблем') < 0 && txt(banner(h)).indexOf(h.w.tfEventBtnText('problem')) < 0, txt(banner(h)));
    ok('… а бутонът „⚠️ Проблем" е на екрана', bt('problem').indexOf(h.w.tfEventBtnText('problem')) >= 0, JSON.stringify(bt('problem')));

    section('3. Истински клик „✅ Получен" при c1 → 3');
    const b = h.doc.querySelector('.trf-pending-row[data-c="c1"] .trf-act-received');
    if (ok('бутонът на c1 го има', !!b)) {
      realClick(h.w, b); await settle();
      const save = h.doc.getElementById('tfe-save');
      if (ok('прозорчето е отворено', !!save)) {
        realClick(h.w, save); await settle(12);
        const p = h.calls.post.filter(x => x.table === 'transfer_cargo_events').map(x => x.body);
        ok('записано received за c1', JSON.stringify(p).indexOf('"c1"') >= 0 && JSON.stringify(p).indexOf('received') >= 0, JSON.stringify(p));
        ok('банерът казва 3', /^🚚 3 товара пътуват/.test(txt(banner(h))), txt(banner(h)));
      }
    }
    h.close();
  }

  section('4. Един товар; невалидна дата; нула');
  {
    const f = fixture();
    f.transfers = f.transfers.filter(t => t.id === 'T2');
    f.cargo = f.cargo.filter(c => c.transfer_id === 'T2');
    const h = await open(U('Севлиево'), f);
    const EXP = '🚚 1 товар пътува към вас и чака отговор (тръгнал на 21.10). ' +
      'Отбележете го с ✅ Получен, когато пристигне.' + TAIL;
    ok('единствено число', txt(banner(h)) === EXP, txt(banner(h)));
    h.close();

    const f2 = fixture();
    f2.transfers = [bus('T1', 'не е дата')];
    f2.cargo = [cg('c1', 'T1', 'Севлиево'), cg('cx', 'T1', 'Севлиево', { position: 2 })];
    const h2 = await open(U('Севлиево'), f2);
    ok('без дата — без скобите', txt(banner(h2)) === '🚚 2 товара пътуват към вас и чакат отговор. ' +
      'Отбележете всеки с ✅ Получен, когато пристигне.' + TAIL, txt(banner(h2)));
    ok('без дата — без „Проблем"', txt(banner(h2)).indexOf('Проблем') < 0);
    h2.close();

    /* Само точка на прехвърляне — само „⏸ Разтоварен", без „Получен". */
    const f4 = fixture();
    f4.transfers = f4.transfers.filter(t => t.id === 'T3');
    f4.cargo = f4.cargo.filter(c => c.transfer_id === 'T3');
    const h4 = await open(U('Севлиево'), f4);
    ok('само точка: „Отбележете го с ⏸ Разтоварен — чака прехвърляне"', txt(banner(h4)) === '🚚 1 товар пътува към вас и чака отговор (тръгнал на 02.11). ' +
      'Отбележете го с ⏸ Разтоварен — чака прехвърляне, когато пристигне.' + TAIL, txt(banner(h4)));
    h4.close();

    const h3 = await open(U('Варна'));
    ok('Варна (само изпращач) — без банер', !banner(h3));
    h3.close();
  }

  section('5. Чужд обект — само своето');
  {
    const h = await open(U('Габрово'));
    ok('Габрово: 1 товар, c4, от 21.10', h.w.tfStoreWaitItems().map(x => x.c.id).join(',') === 'c4' &&
      /^🚚 1 товар пътува към вас и чака отговор \(тръгнал на 21\.10\)/.test(txt(banner(h))), txt(banner(h)));
    h.close();
  }

  section('6. Склад — да; admin и контролинг — не');
  {
    const h = await open(U(WH, 'logistics'));
    ok('складът е логистичен (tfWarehouseStore)', h.w.tfWarehouseStore() === WH, h.w.tfWarehouseStore());
    ok('складът: 1 товар (c9), от 25.10', /^🚚 1 товар пътува към вас и чака отговор \(тръгнал на 25\.10\)/.test(txt(banner(h))), txt(banner(h)));
    h.close();
    for (const [name, user] of [['admin', ADMIN], ['контролинг', ACC]]) {
      const hx = await open(user);
      ok(name + ': без банер', !banner(hx) && !!hx.doc.getElementById('trf-table'));
      hx.close();
    }
  }

  report();
})();
