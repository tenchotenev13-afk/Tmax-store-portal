/* Товарни листи — „🛒 Рол контейнер" като отделен вид товарна единица.

   Контейнерът се товари, вози и приема като палета и получава свой опис. Но
   номерацията му е ОТДЕЛНА поредица: „палет 2 от 5" и „рол контейнер 2 от 3"
   са две различни обещания към един и същ обект.

   Тихите грешки, които се пазят тук:
     · обща поредица с палетите — четири палета и четири контейнера дават
       „палет 4 от 8", число, което не отговаря на нищо на рампата;
     · описът на палет 1 събира и контейнер 1 (или обратно), защото
       препратката е само число;
     · CHECK-ът в базата не знае новата стойност → 409 при запис.

   Пускане:  node tests/loading-lists-roll-container.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };

const LIST = { id: 'L1', warehouse: WH, list_date: '2026-09-23', status: 'sent',
               executed_by: 'Иван', comment: '', created_at: '2026-09-23T06:00:00.000Z',
               sent_at: '2026-09-23T07:00:00.000Z', done_at: null };
function item(o) {
  return Object.assign({
    list_id: 'L1', kind: 'pallet', pallet_no: 1, pallet_total: 1, purchase_doc: null,
    clears_doc: null, store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null, created_at: 'x'
  }, o);
}
const P = (item_id, pos, sap, name, qty) =>
  ({ id: 'P-' + item_id + '-' + pos, item_id: item_id, position: pos, sap_code: sap,
     product_name: name, unit: 'бр.', qty: qty, cartons: null, received_qty: null, created_at: 'x' });

function env(user, items, products) {
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      loading_lists: [LIST],
      loading_list_items: () => (items || []).map(it => Object.assign({}, it, {
        loading_list_products: (products || []).filter(p => p.item_id === it.id).map(p => Object.assign({}, p))
      })),
      users: [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' }, { store_name: WH }],
      loading_list_products: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  h.modules = [];
  h.w.showModule = function (m) { h.modules.push(m); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const pr = h => h.doc.getElementById('mod-print');

(async function () {

  section('а) Видът го има в менюто и се номерира като палет');
  {
    const h = env(WAREHOUSE, []);
    ok('LL_KINDS съдържа roll_container',
      h.w.LL_KINDS.some(k => k[0] === 'roll_container' && /Рол контейнер/.test(k[1])),
      JSON.stringify(h.w.LL_KINDS));
    ok('и е СЛЕД палета, преди рулото',
      h.w.LL_KINDS.map(k => k[0]).join(',') === 'pallet,roll_container,roll,bulk',
      h.w.LL_KINDS.map(k => k[0]).join(','));
    ok('номериран вид', h.w.llIsNumbered('roll_container') === true && h.w.llIsNumbered('pallet') === true);
    ok('рулото и насипът — не', !h.w.llIsNumbered('roll') && !h.w.llIsNumbered('bulk'));
    ok('етикетът е „рол контейнер N от M"',
      h.w.llKindLabel({ kind: 'roll_container', pallet_no: 2, pallet_total: 3 }) === 'рол контейнер 2 от 3',
      h.w.llKindLabel({ kind: 'roll_container', pallet_no: 2, pallet_total: 3 }));
    ok('без номер — само думата', h.w.llKindLabel({ kind: 'roll_container' }) === 'рол контейнер');
  }

  section('б) Номерацията е ОТДЕЛНА поредица от палетите');
  {
    const h = env(WAREHOUSE, []);
    /* Два палета и два контейнера за Петрич, с разредени номера. */
    const rows = [
      { kind: 'pallet', pallet_no: 1, store_name: 'Петрич' },
      { kind: 'roll_container', pallet_no: 5, store_name: 'Петрич' },
      { kind: 'pallet', pallet_no: 4, store_name: 'Петрич' },
      { kind: 'roll_container', pallet_no: 9, store_name: 'Петрич' },
      /* Друг обект — своя поредица. */
      { kind: 'pallet', pallet_no: 7, store_name: 'Гоце Делчев' }
    ];
    h.w.llRenumberPallets(rows);
    ok('палетите на Петрич: 1 от 2 и 2 от 2',
      rows[0].pallet_no === 1 && rows[0].pallet_total === 2 &&
      rows[2].pallet_no === 2 && rows[2].pallet_total === 2,
      JSON.stringify(rows.map(r => r.kind + r.pallet_no + '/' + r.pallet_total)));
    ok('контейнерите на Петрич: 1 от 2 и 2 от 2 — СВОЯ поредица',
      rows[1].pallet_no === 1 && rows[1].pallet_total === 2 &&
      rows[3].pallet_no === 2 && rows[3].pallet_total === 2,
      JSON.stringify(rows.map(r => r.kind + r.pallet_no + '/' + r.pallet_total)));
    ok('и НЕ са „от 4" — общата поредица би дала точно това',
      rows.filter(r => r.pallet_total === 4).length === 0,
      JSON.stringify(rows.map(r => r.pallet_total)));
    ok('другият обект си е сам', rows[4].pallet_no === 1 && rows[4].pallet_total === 1);
  }

  section('в) Групиране: палет 1 и контейнер 1 на един обект са РАЗНИ единици');
  {
    const h = env(WAREHOUSE, []);
    const rows = [
      item({ id: 'A', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-1' }),
      item({ id: 'B', position: 2, kind: 'roll_container', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-2' })
    ];
    const g = h.w.llPalletGroups(rows);
    ok('две групи, не една', g.length === 2, JSON.stringify(g.map(x => x.kind + x.pallet_no)));
    const c = h.w.llCounts(rows);
    ok('llCounts брои 1 палет и 1 контейнер', c.pallet === 1 && c.roll_container === 1, JSON.stringify(c));
    const sum = h.w.llSummaryByStore(rows);
    ok('обобщението по обект също', sum[0].pallet === 1 && sum[0].roll_container === 1, JSON.stringify(sum[0]));
  }

  section('г) Опис: контейнерът има свой, отделен от палета със същия номер');
  {
    const items = [
      item({ id: 'A', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-100' }),
      item({ id: 'B', position: 2, kind: 'roll_container', pallet_no: 1, pallet_total: 2, purchase_doc: 'ИЗХ-200' }),
      item({ id: 'C', position: 3, kind: 'roll_container', pallet_no: 2, pallet_total: 2, purchase_doc: 'ИЗХ-300' })
    ];
    const products = [P('A', 1, 'НА-ПАЛЕТА', 'СТОКА ОТ ПАЛЕТ', 5),
                      P('B', 1, 'В-КОНТЕЙНЕРА', 'СТОКА ОТ КОНТЕЙНЕР', 9)];
    const h = env(WAREHOUSE, items, products);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');

    const btns = Array.from(mod(h).querySelectorAll('button[data-u]'));
    ok('три бутона „Опис" — по един на единица', btns.length === 3,
      JSON.stringify(btns.map(b => b.getAttribute('data-u'))));
    ok('препратките носят вида: 1, rc1, rc2',
      btns.map(b => b.getAttribute('data-u')).join(',') === '1,rc1,rc2',
      btns.map(b => b.getAttribute('data-u')).join(','));

    /* Описът на КОНТЕЙНЕР 1 — не на палет 1. */
    realClick(h.w, btns[1]);
    const t = pr(h).textContent;
    ok('печатът е отворен', h.modules.indexOf('print') >= 0);
    ok('заглавието е „Рол контейнер 1 от 2"', t.indexOf('Рол контейнер 1 от 2') >= 0, t.slice(0, 260));
    ok('носи стоката на контейнера', t.indexOf('СТОКА ОТ КОНТЕЙНЕР') >= 0);
    ok('и НЕ стоката на палет 1', t.indexOf('СТОКА ОТ ПАЛЕТ') < 0);
    ok('изходящият номер е на контейнера', t.indexOf('ИЗХ-200') >= 0 && t.indexOf('ИЗХ-100') < 0);

    /* А описът на ПАЛЕТ 1 не бива да носи контейнера. */
    realClick(h.w, btns[0]);
    const t2 = pr(h).textContent;
    ok('палет 1 показва „Палет 1 от 1"', t2.indexOf('Палет 1 от 1') >= 0, t2.slice(0, 260));
    ok('със своята стока', t2.indexOf('СТОКА ОТ ПАЛЕТ') >= 0);
    ok('и без стоката на контейнера', t2.indexOf('СТОКА ОТ КОНТЕЙНЕР') < 0);
  }

  section('д) Обектът: груповото отмятане важи и за контейнера');
  {
    /* Два документа на ЕДИН контейнер — групов ред с бутони. */
    const items = [
      item({ id: 'B1', position: 1, kind: 'roll_container', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-200' }),
      item({ id: 'B2', position: 2, kind: 'roll_container', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-201' })
    ];
    const h = env(STORE, items, []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const grp = h.doc.querySelector('#mod-loading tr[data-pallet-group="1"]');
    if (ok('групов ред за контейнера', !!grp, h.doc.getElementById('mod-loading').innerHTML.slice(0, 300))) {
      ok('бутонът казва „целият рол контейнер"', /Целият рол контейнер/.test(grp.textContent), grp.textContent);
      const b = btn(grp, 'Целият рол контейнер');
      ok('и носи вида в data-k', b.getAttribute('data-k') === 'roll_container', b.getAttribute('data-k'));
      realClick(h.w, b);
      await ticks(); await ticks(); await ticks();
      const ip = h.calls.patch.filter(p => p.table === 'loading_list_items');
      ok('и двата реда са отметнати', ip.length === 2, JSON.stringify(ip.map(p => p.url)));
      ok('с received:true', ip.every(p => p.body.received === true));
    }
  }

  section('е) Схемата в репото знае новата стойност');
  {
    const fs = require('fs');
    const path = require('path');
    const root = process.argv[2] || path.join(__dirname, '..');
    const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20260923071737_loading_kind_roll_container.sql'), 'utf8');
    ok('миграцията разширява CHECK-а',
      /check \(kind in \('pallet', 'roll_container', 'roll', 'bulk'\)\)/.test(mig), mig.slice(0, 200));
    const down = fs.readFileSync(path.join(root, 'supabase/migrations/20260923071737_loading_kind_roll_container_down.sql'), 'utf8');
    ok('откатът го стеснява обратно', /check \(kind in \('pallet', 'roll', 'bulk'\)\)/.test(down));
    ok('и предупреждава, че гърми при заварен контейнер', /ГЪРМИ/.test(down));
    const mirror = fs.readFileSync(path.join(root, 'loading-list-kind-roll-container-schema.sql'), 'utf8');
    ok('огледалният файл в корена също', /roll_container/.test(mirror));
  }

  report();
})();
