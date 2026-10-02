/* Товарни листи: ПАЛЕТЪТ Е ФИЗИЧЕСКА ЕДИНИЦА, НЕ ДОКУМЕНТ.

   Първата версия питаше „колко палета е този документ" и раждаше N реда.
   Проверка в базата на 03.09.2026 показа, че това е обратното на реалността:
   1987 чакащи реда се събират в 563 документа (обект+документ), 324 от които
   — 58% — са с ЕДИН артикул. Габрово чака 56 документа, Силистра и Дупница по
   50. Никой не кара 56 палета до Габрово: документите се консолидират върху
   три-четири палета. Тоест връзката е МНОГО ДОКУМЕНТА → ЕДИН ПАЛЕТ.

   Схемата не се пипа: един палет е няколко реда, споделящи store_name +
   pallet_no. Този тест пази точно това — че групирането, броенето и
   преномерирането гледат ТОВАРНАТА ЕДИНИЦА, а не реда.

   Пускане:  node tests/loading-lists-pallets.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };

const NEW_ID = 'NEW-LIST';
const L_SENT = { id: 'L1', warehouse: WH, list_date: '2026-09-02', status: 'sent',
                 executed_by: 'Иван', comment: '', created_by: 'Склад Търговище',
                 created_at: '2026-09-02T06:00:00.000Z',
                 sent_at: '2026-09-02T07:00:00.000Z', done_at: null };

/* Четири чакащи документа: три за Петрич, един за Гоце Делчев. */
const TRANSIT = [
  { purchase_doc: 'D-1', store_name: 'Петрич', doc_date: '2026-09-01' },
  { purchase_doc: 'D-2', store_name: 'Петрич', doc_date: '2026-09-01' },
  { purchase_doc: 'D-3', store_name: 'Петрич', doc_date: '2026-09-01' },
  { purchase_doc: 'D-9', store_name: 'Гоце Делчев', doc_date: '2026-09-01' }
];

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet',
    pallet_no: 1, pallet_total: 1, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    received: false, received_by: null, received_at: null,
    created_at: '2026-09-02T06:00:00.000Z'
  }, o);
}

function envWh() {
  const h = boot({
    /* bulletin.js носи toLocalISO(), stock-differences.js -
       isLogisticsWarehouseUser(). Редът в index.html вече е верен; тук се
       декларира явно, иначе ReferenceError мълчи до първия клик. */
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js'],
    user: WAREHOUSE, confirm: true,
    data: {
      /* Блокът „Документи от Стока на път" е зад app_settings
         'loading_transit_docs' (по подразбиране ИЗКЛЮЧЕН). Този тест описва
         включения блок, затова флагът е изричен. Изключеното състояние е
         в loading-transit-toggle.test.js. */
      app_settings: [{ key: 'loading_transit_docs', value: 'on' }],
      goods_transit: TRANSIT,
      loading_lists: [], loading_list_items: [],
      users: [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' }],
      stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  /* sbPostReturn връща създадения ред — иначе llSaveDraft няма id за редовете. */
  const realFetch = h.w.fetch;
  h.w.fetch = function (url, opt) {
    if (/loading_lists/.test(url) && opt && opt.method === 'POST') {
      return Promise.resolve({
        ok: true, status: 201,
        headers: { get: () => null },
        json: () => Promise.resolve([{ id: NEW_ID }]),
        text: () => Promise.resolve('')
      });
    }
    return realFetch.call(this, url, opt);
  };
  return h;
}
function envStore(items) {
  return boot({
    /* bulletin.js носи toLocalISO(), stock-differences.js -
       isLogisticsWarehouseUser(). Редът в index.html вече е верен; тук се
       декларира явно, иначе ReferenceError мълчи до първия клик. */
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js'],
    user: STORE, confirm: true,
    data: {
      loading_list_items: function (url) {
        let rows = items.map(r => Object.assign({}, r));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        const lid = /list_id=eq\.([^&]*)/.exec(url);
        if (lid) rows = rows.filter(r => String(r.list_id) === decodeURIComponent(lid[1]));
        return rows;
      },
      /* Блокът „Документи от Стока на път" е зад app_settings
         'loading_transit_docs' (по подразбиране ИЗКЛЮЧЕН). Този тест описва
         включения блок, затова флагът е изричен. Изключеното състояние е
         в loading-transit-toggle.test.js. */
      app_settings: [{ key: 'loading_transit_docs', value: 'on' }],
      loading_lists: [L_SENT], goods_transit: [],
      users: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
}
const itemPosts = c => c.post.filter(p => p.table === 'loading_list_items');
const idxOf = (h, doc) => h.w.llPendingDocs.indexOf(
  h.w.llPendingDocs.find(d => d.purchase_doc === doc));

(async function () {

  section('1. Единицата е палет с няколко изходящи номера');
  {
    const h = envWh();
    h.w.llNewList();
    /* llNewList() отваря черновата с 10 празни единици; тук се проверяват
       документите, затова бланката се изчиства (виж blank-rows.test.js). */
    h.w.llDraft.units = [];
    await ticks(); await ticks();
    ok('четирите документа са заредени', h.w.llPendingDocs.length === 4,
      String(h.w.llPendingDocs.length));

    /* Отмятането създава НОВА единица за всеки документ; другите два се
       добавят към палета на първия с чип. */
    h.w.llToggleDoc(idxOf(h, 'D-1'));
    ok('една единица след първото отмятане', h.w.llDraft.units.length === 1);
    h.w.llUnitDocAdd(0, 'D-2, D-3');
    ok('запетаята разделя номерата — три чипа', h.w.llDraft.units[0].docs.join() === 'D-1,D-2,D-3',
      h.w.llDraft.units[0].docs.join());
    h.w.llUnitDocAdd(0, 'D-2');
    ok('повторен номер не дублира чип', h.w.llDraft.units[0].docs.length === 3);

    const flat = h.w.llDraftFlat().rows;
    ok('в базата това са 3 реда', flat.length === 3, String(flat.length));
    const groups = h.w.llPalletGroups(flat);
    ok('но те са ЕДИН палет', groups.length === 1, String(groups.length));
    ok('палетът носи трите документа', groups[0].rows.length === 3, String(groups[0].rows.length));
    /* Точно тук първата версия лъжеше: броеше редове и показваше „3 палета". */
    ok('llCounts() брои 1 палет, не 3', h.w.llCounts(flat).pallet === 1, String(h.w.llCounts(flat).pallet));
    ok('а редовете са 3', h.w.llCounts(flat).total === 3, String(h.w.llCounts(flat).total));
    const sum = h.w.llSummaryByStore(flat);
    ok('обобщението по обект също казва 1 палет и 3 реда',
      sum.length === 1 && sum[0].pallet === 1 && sum[0].total === 3, JSON.stringify(sum));
  }

  section('2. Един и същ номер за РАЗНИ обекти е различен палет');
  {
    const h = envWh();
    h.w.llNewList();
    h.w.llDraft.units = [];
    await ticks(); await ticks();
    ['D-1', 'D-9'].forEach(d => h.w.llToggleDoc(idxOf(h, d)));
    const flat = h.w.llDraftFlat().rows;
    const groups = h.w.llPalletGroups(flat);
    ok('два палета, не един', groups.length === 2, String(groups.length));
    ok('и двата са №1 — всеки в своя обект', flat.every(r => r.pallet_no === 1),
      JSON.stringify(flat.map(r => r.pallet_no)));
    ok('llCounts() брои 2', h.w.llCounts(flat).pallet === 2, String(h.w.llCounts(flat).pallet));
    ok('и два обекта', h.w.llCounts(flat).stores === 2, String(h.w.llCounts(flat).stores));
  }

  section('3. Плътно преномериране при запис — „палет 2 от 5" не лъже');
  {
    const h = envWh();
    h.w.llNewList();
    h.w.llDraft.units = [];
    await ticks(); await ticks();
    /* Три единици за Петрич (автоматично 1,2,3) и една за Гоце Делчев. После в
       черновата остава дупка (1, 2, 5), както след махане на единица. */
    ['D-1', 'D-2', 'D-3', 'D-9'].forEach(d => h.w.llToggleDoc(idxOf(h, d)));
    ok('автоматични номера 1,2,3 за Петрич',
      h.w.llDraft.units.filter(u => u.store_name === 'Петрич').map(u => u.pallet_no).join() === '1,2,3');
    h.w.llDraft.units[2].pallet_no = 5;
    h.w.llSaveDraft();
    await ticks(); await ticks(); await ticks();

    const posts = itemPosts(h.calls);
    if (ok('редовете са записани', posts.length === 1,
      JSON.stringify(h.calls.post.map(p => p.table)))) {
      const rows = posts[0].body;
      const pet = rows.filter(r => r.store_name === 'Петрич');
      const gd = rows.filter(r => r.store_name === 'Гоце Делчев');
      ok('Петрич има 3 реда', pet.length === 3, String(pet.length));
      ok('номерата са 1,2,3 — не 1,2,5',
        pet.map(r => r.pallet_no).sort().join(',') === '1,2,3', pet.map(r => r.pallet_no).join(','));
      ok('„от" е 3 на всичките', pet.every(r => r.pallet_total === 3), JSON.stringify(pet.map(r => r.pallet_total)));
      /* Номерацията на другия обект е СВОЯ: той чака един палет, не четвъртия. */
      ok('Гоце Делчев е палет 1 от 1',
        gd.length === 1 && gd[0].pallet_no === 1 && gd[0].pallet_total === 1, JSON.stringify(gd));
    }
  }

  section('4. Палет с три номера → три реда със същия №');
  {
    const h = envWh();
    h.w.llNewList();
    h.w.llDraft.units = [];
    await ticks(); await ticks();
    const u = Object.assign(h.w.llBlankUnit(), { store_name: 'Петрич', docs: ['D-1', 'D-2', 'D-3'],
      products: [{ sap_code: '100', product_name: 'ШУРУП', unit: 'бр.', qty: 5, cartons: null, _inCat: true }] });
    h.w.llDraft.units.push(u);
    h.w.llAssignPalletNo(u);
    h.w.llSaveDraft();
    await ticks(); await ticks(); await ticks(); await ticks();
    const rows = itemPosts(h.calls)[0].body;
    ok('три реда', rows.length === 3, String(rows.length));
    ok('със същия палет №, обект и вид',
      rows.every(r => r.pallet_no === 1 && r.store_name === 'Петрич' && r.kind === 'pallet'),
      JSON.stringify(rows));
    ok('по един изходящ № на ред', rows.map(r => r.purchase_doc).join() === 'D-1,D-2,D-3');
    ok('позиции 1,2,3', rows.map(r => r.position).join() === '1,2,3');
  }

  section('5. Зареждане: редове с общ № → ЕДНА единица с няколко номера');
  {
    const h = envWh();
    const rows = [
      it_({ id: 'a1', position: 1, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-1', warehouse_comment: 'крехко' }),
      it_({ id: 'a2', position: 2, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-2' }),
      it_({ id: 'a3', position: 3, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-3' }),
      it_({ id: 'b1', position: 4, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-4' }),
      /* Палет без номер и насип са отделни единици. */
      it_({ id: 'n1', position: 5, pallet_no: null, pallet_total: null, purchase_doc: 'D-5' }),
      it_({ id: 'k1', position: 6, kind: 'bulk', pallet_no: null, pallet_total: null, purchase_doc: 'D-6' })
    ];
    const units = h.w.llUnitsFromRows(rows);
    ok('четири единици... и още две отделни — общо 4', units.length === 4, String(units.length));
    ok('първата носи три номера', units[0].docs.join() === 'D-1,D-2,D-3', units[0].docs.join());
    ok('и id-тата на редовете си', units[0]._rowIds.join() === 'a1,a2,a3', units[0]._rowIds.join());
    ok('коментарът се взима от реда, който го има', units[0].warehouse_comment === 'крехко');
    ok('палет 2 е сам', units[1].docs.join() === 'D-4' && units[1].pallet_no === 2);
    ok('палет без номер е отделна единица', units[2].docs.join() === 'D-5' && units[2].pallet_no === null);
    ok('насипът е отделна единица', units[3].kind === 'bulk' && units[3].docs.join() === 'D-6');
  }

  section('6. Номерацията е по ред на въвеждане и по обект; преместването я сменя');
  {
    const h = envWh();
    h.w.llNewList();
    h.w.llDraft.units = [];
    await ticks(); await ticks();
    ['D-1', 'D-2', 'D-9', 'D-3'].forEach(d => h.w.llToggleDoc(idxOf(h, d)));
    const lbl = () => h.w.llDraft.units.map(u => u.docs[0] + ':' + u.pallet_no).join(' ');
    ok('Петрич 1,2,3; Гоце Делчев 1', lbl() === 'D-1:1 D-2:2 D-9:1 D-3:3', lbl());
    h.w.llMoveRow(0, 1);                 /* D-1 слиза под D-2 */
    ok('D-2 е вече палет 1, D-1 — палет 2', lbl() === 'D-2:1 D-1:2 D-9:1 D-3:3', lbl());
    h.w.llMoveRow(2, -1);                /* Гоце Делчев се вмъква преди D-1 — Петрич не се пипа */
    ok('преместване през друг обект не пипа номерата на Петрич', lbl() === 'D-2:1 D-9:1 D-1:2 D-3:3', lbl());
  }

  section('7. Отмятане на документ в картата на обекта — по документ');
  {
    const items = [
      it_({ id: 'a1', position: 1, pallet_no: 1, pallet_total: 1, purchase_doc: 'D-1' }),
      it_({ id: 'a2', position: 2, pallet_no: 1, pallet_total: 1, purchase_doc: 'D-2' })
    ];
    const h = envStore(items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const c = h.doc.getElementById('ll-card-L1');
    ok('картата показва палета с двата документа',
      !!c && c.textContent.indexOf('2 документа') >= 0 && c.textContent.indexOf('D-1') >= 0 && c.textContent.indexOf('D-2') >= 0);
    const rowOf = id => Array.from(c.querySelectorAll('tbody tr')).find(tr => tr.textContent.indexOf(id) >= 0 && /Получено/.test(tr.textContent));
    const b = btn(rowOf('D-2'), '✅ Получено');
    if (ok('има бутон „Получено“ на реда на D-2', !!b)) {
      realClick(h.w, b);
      await ticks(); await ticks(); await ticks();
      const ip = h.calls.patch.filter(p => p.table === 'loading_list_items');
      ok('PATCH е само за D-2 (a2), не за палета', ip.length === 1 && /id=eq\.a2/.test(ip[0].url),
        JSON.stringify(ip.map(p => p.url)));
    }
  }

  section('8. Отмятането на цял палет отмята документите му наведнъж');
  {
    const items = [
      it_({ id: 'a1', position: 1, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-1' }),
      it_({ id: 'a2', position: 2, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-2' }),
      it_({ id: 'a3', position: 3, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-3' }),
      /* Втори палет — бутонът на първия няма работа с него. */
      it_({ id: 'b1', position: 4, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-4' })
    ];
    const h = envStore(items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const c = h.doc.getElementById('ll-card-L1');
    if (ok('картата се рендира', !!c)) {
      /* Заглавният ред на групата се разпознава по data-атрибут, не по текст. */
      const heads = c.querySelectorAll('tr[data-pallet-group="1"]');
      /* От 02.10.2026 заглавен ред има при ВСЕКИ номериран палет („N от M"),
         не само при няколко документа: тук са два — групиран и самотен. */
      ok('има заглавен ред за всеки от двата палета', heads.length === 2,
        String(heads.length));
      ok('групираният е първи (палет 1 преди палет 2)',
        heads[0].textContent.indexOf('3 документа') >= 0 && !heads[0].hasAttribute('data-pallet-single'));
      ok('самотният палет има кратък заглавен ред „1 документ"',
        heads[1].hasAttribute('data-pallet-single') && heads[1].textContent.indexOf('1 документ') >= 0 &&
        !btn(heads[1], '✅ Целият палет'), heads[1].textContent);
      ok('казва колко документа носи',
        heads[0].textContent.indexOf('3 документа') >= 0, heads[0].textContent);
      ok('самотният палет не е „1 документа"',
        c.textContent.indexOf('1 документа') < 0, c.textContent.slice(0, 300));

      const b = btn(heads[0], '✅ Целият палет');
      if (ok('има бутон „Целият палет"', !!b)) {
        realClick(h.w, b);
        await ticks(); await ticks(); await ticks();
        const ip = h.calls.patch.filter(p => p.table === 'loading_list_items');
        ok('точно 3 PATCH — трите документа на палета', ip.length === 3,
          JSON.stringify(ip.map(p => p.url)));
        ok('и трите са от палет 1',
          ip.every(p => /id=eq\.a[123]/.test(p.url)), JSON.stringify(ip.map(p => p.url)));
        ok('редът от втория палет НЕ е пипнат',
          !ip.some(p => /id=eq\.b1/.test(p.url)), JSON.stringify(ip.map(p => p.url)));
      }
    }
  }

  section('7. Рулото и насипът не се сливат в един „палет"');
  {
    const items = [
      it_({ id: 'r1', position: 1, kind: 'roll', pallet_no: null, pallet_total: null }),
      it_({ id: 'r2', position: 2, kind: 'roll', pallet_no: null, pallet_total: null }),
      it_({ id: 'b1', position: 3, kind: 'bulk', pallet_no: null, pallet_total: null })
    ];
    const h = envStore(items);
    ok('три отделни товарни единици',
      h.w.llPalletGroups(items).length === 3, String(h.w.llPalletGroups(items).length));
    const c = h.w.llCounts(items);
    ok('две рула и един насип', c.roll === 2 && c.bulk === 1, JSON.stringify(c));
    ok('нула палета', c.pallet === 0, String(c.pallet));
    if (guard('llRenumberPallets() не пипа рула и насип',
      () => h.w.llRenumberPallets(items))) {
      ok('номерата остават празни',
        items.every(i => i.pallet_no === null && i.pallet_total === null),
        JSON.stringify(items.map(i => [i.pallet_no, i.pallet_total])));
    }
  }

  report();
})();
