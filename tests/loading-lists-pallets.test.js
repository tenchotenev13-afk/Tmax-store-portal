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

  section('1. llParsePalletSpec — едно поле за двете посоки');
  {
    const h = envWh();
    const p = s => JSON.stringify(h.w.llParsePalletSpec(s));
    ok('„2" → [2]', p('2') === '[2]', p('2'));
    ok('„1,3" → [1,3]', p('1,3') === '[1,3]', p('1,3'));
    ok('„1-3" → [1,2,3]', p('1-3') === '[1,2,3]', p('1-3'));
    ok('„3-1" се изправя → [1,2,3]', p('3-1') === '[1,2,3]', p('3-1'));
    ok('дубликатите отпадат: „1,1,2" → [1,2]', p('1,1,2') === '[1,2]', p('1,1,2'));
    ok('интервалите не пречат: „1 - 3" → [1,2,3]', p('1 - 3') === '[1,2,3]', p('1 - 3'));
    /* Празно и боклук дават [1]: документ без палет няма смисъл, а мълчаливо
       нула реда би изгубила документа без следа. */
    ok('празно → [1]', p('') === '[1]', p(''));
    ok('боклук → [1]', p('абв') === '[1]', p('абв'));
    ok('нула и отрицателни отпадат: „0,-2,3" → [3]', p('0,-2,3') === '[3]', p('0,-2,3'));
    /* Таванът пази срещу изпуснат клавиш: „1-9999" не е пратка, а авария. */
    ok('„1-9999" е орязано до 100 номера',
      h.w.llParsePalletSpec('1-9999').length === 100,
      String(h.w.llParsePalletSpec('1-9999').length));
  }

  section('2. Три документа на ЕДИН палет — консолидацията');
  {
    const h = envWh();
    h.w.llNewList();
    await ticks(); await ticks();
    ok('четирите документа са заредени', h.w.llPendingDocs.length === 4,
      String(h.w.llPendingDocs.length));

    /* И трите документа за Петрич отиват на палет 1 — това е един физически
       палет с три стокови разписки върху него. */
    ['D-1', 'D-2', 'D-3'].forEach(d => {
      const i = idxOf(h, d);
      h.w.llSetDocPallet(i, '1');
      h.w.llToggleDoc(i);
    });
    ok('черновата има 3 РЕДА', h.w.llDraft.items.length === 3,
      String(h.w.llDraft.items.length));

    const groups = h.w.llPalletGroups(h.w.llDraft.items);
    ok('но те са ЕДИН палет', groups.length === 1, String(groups.length));
    ok('палетът носи трите документа', groups[0].rows.length === 3,
      String(groups[0].rows.length));
    /* Точно тук първата версия лъжеше: броеше редове и показваше „3 палета". */
    ok('llCounts() брои 1 палет, не 3', h.w.llCounts(h.w.llDraft.items).pallet === 1,
      String(h.w.llCounts(h.w.llDraft.items).pallet));
    ok('а редовете са 3', h.w.llCounts(h.w.llDraft.items).total === 3,
      String(h.w.llCounts(h.w.llDraft.items).total));

    const sum = h.w.llSummaryByStore(h.w.llDraft.items);
    ok('обобщението по обект също казва 1 палет',
      sum.length === 1 && sum[0].pallet === 1, JSON.stringify(sum));
    ok('и 3 реда за отмятане', sum[0].total === 3, JSON.stringify(sum[0]));
  }

  section('3. Един и същ номер за РАЗНИ обекти е различен палет');
  {
    const h = envWh();
    h.w.llNewList();
    await ticks(); await ticks();
    [['D-1', '1'], ['D-9', '1']].forEach(([d, spec]) => {
      const i = idxOf(h, d);
      h.w.llSetDocPallet(i, spec);
      h.w.llToggleDoc(i);
    });
    const groups = h.w.llPalletGroups(h.w.llDraft.items);
    ok('два палета, не един', groups.length === 2, String(groups.length));
    ok('llCounts() брои 2', h.w.llCounts(h.w.llDraft.items).pallet === 2,
      String(h.w.llCounts(h.w.llDraft.items).pallet));
    ok('и два обекта', h.w.llCounts(h.w.llDraft.items).stores === 2,
      String(h.w.llCounts(h.w.llDraft.items).stores));
  }

  section('4. Плътно преномериране при запис — „палет 2 от 5" не лъже');
  {
    const h = envWh();
    h.w.llNewList();
    await ticks(); await ticks();
    /* Складът е въвел 1, 2 и 5 за Петрич — палетите са ТРИ, не пет.
       Плюс един за Гоце Делчев, чиято номерация е независима. */
    [['D-1', '1'], ['D-2', '2'], ['D-3', '5'], ['D-9', '4']].forEach(([d, spec]) => {
      const i = idxOf(h, d);
      h.w.llSetDocPallet(i, spec);
      h.w.llToggleDoc(i);
    });
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
        pet.map(r => r.pallet_no).sort().join(',') === '1,2,3',
        pet.map(r => r.pallet_no).join(','));
      ok('„от" е 3 на всичките',
        pet.every(r => r.pallet_total === 3), JSON.stringify(pet.map(r => r.pallet_total)));
      /* Номерацията на другия обект е СВОЯ: той чака един палет, не четвъртия. */
      ok('Гоце Делчев е палет 1 от 1',
        gd.length === 1 && gd[0].pallet_no === 1 && gd[0].pallet_total === 1,
        JSON.stringify(gd));
    }
  }

  section('5. Документ върху няколко палета — обратната посока');
  {
    const h = envWh();
    h.w.llNewList();
    await ticks(); await ticks();
    const i1 = idxOf(h, 'D-1');
    h.w.llSetDocPallet(i1, '1-3');
    h.w.llToggleDoc(i1);
    /* Втори документ на палет 2 — тоест той дели палет с част от първия. */
    const i2 = idxOf(h, 'D-2');
    h.w.llSetDocPallet(i2, '2');
    h.w.llToggleDoc(i2);

    ok('четири реда', h.w.llDraft.items.length === 4, String(h.w.llDraft.items.length));
    const groups = h.w.llPalletGroups(h.w.llDraft.items);
    ok('три палета', groups.length === 3, String(groups.length));
    const p2 = groups.find(g => Number(g.pallet_no) === 2);
    ok('палет 2 носи ДВА документа', p2 && p2.rows.length === 2,
      JSON.stringify(p2 && p2.rows.map(r => r.purchase_doc)));
    ok('и това са D-1 и D-2',
      p2.rows.map(r => r.purchase_doc).sort().join(',') === 'D-1,D-2',
      p2.rows.map(r => r.purchase_doc).join(','));
  }

  section('6. Отмятането на цял палет отмята документите му наведнъж');
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
      ok('има ЕДИН заглавен ред за групиран палет', heads.length === 1,
        String(heads.length));
      ok('казва колко документа носи',
        heads[0].textContent.indexOf('3 документа') >= 0, heads[0].textContent);
      ok('самотният палет НЯМА заглавен ред',
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
