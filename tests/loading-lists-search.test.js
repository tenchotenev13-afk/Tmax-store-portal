/* Товарни листи — търсене в списъка (складът) и в картите (обектът).

   Складът има десетки листи и търси „онзи с изходящо 4600179694" или „тия за
   Петрич". Дотук нямаше как.

   Тихите грешки, които се пазят тук:
     · търсенето нулира чипа по статус (или обратно) — двете трябва да се
       КОМБИНИРАТ;
     · чиповете изчезват при празен резултат и няма как да се излезе обратно
       (правило 11);
     · полето губи фокуса при всеки клавиш, защото пре-рендира целия изглед;
     · „нищо не се намери" изглежда като „няма листи".

   Пускане:  node tests/loading-lists-search.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, fire, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WH2 = 'Логистичен склад Добрич';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };

const L = (id, status, date, wh) => ({ id: id, warehouse: wh || WH, list_date: date,
  status: status, executed_by: 'Иван', comment: '', created_at: date + 'T06:00:00.000Z',
  sent_at: status === 'draft' ? null : date + 'T07:00:00.000Z', done_at: null });
const IT = (id, list, doc, store) => ({ id: id, list_id: list, position: 1, kind: 'pallet',
  pallet_no: 1, pallet_total: 1, purchase_doc: doc, clears_doc: null, store_name: store,
  warehouse_comment: null, store_comment: null, partial: false, received: false,
  missing: false, missing_by: null, missing_at: null, created_at: 'x' });

/* Три листа: чернова за Петрич, изпратен за Гоце Делчев, приключен за Петрич. */
const LISTS = [L('L1', 'draft', '2026-09-21'), L('L2', 'sent', '2026-09-22'), L('L3', 'done', '2026-09-20')];
const ITEMS = [IT('i1', 'L1', '4600179694', 'Петрич'),
               IT('i2', 'L2', '4600179700', 'Гоце Делчев'),
               IT('i3', 'L3', '4700000001', 'Петрич')];

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      loading_lists: function (url) {
        let r = (opts.lists || LISTS).map(x => Object.assign({}, x));
        const m = /warehouse=eq\.([^&]*)/.exec(url);
        if (m) r = r.filter(x => x.warehouse === decodeURIComponent(m[1]));
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); r = r.filter(x => s.indexOf(x.status) >= 0); }
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const s = ids[1].split(','); r = r.filter(x => s.indexOf(String(x.id)) >= 0); }
        return r;
      },
      loading_list_items: function (url) {
        let r = (opts.items || ITEMS).map(x => Object.assign({}, x, { loading_list_products: [] }));
        const sm = /store_name=eq\.([^&]*)/.exec(url);
        if (sm) r = r.filter(x => x.store_name === decodeURIComponent(sm[1]));
        const lm = /list_id=in\.\(([^)]*)\)/.exec(url);
        if (lm) { const s = lm[1].split(','); r = r.filter(x => s.indexOf(String(x.list_id)) >= 0); }
        return r;
      },
      users: [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' }, { store_name: WH }],
      loading_list_products: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const q = h => h.doc.getElementById('ll-list-q');
const sq = h => h.doc.getElementById('ll-store-q');
const chips = h => Array.from(mod(h).querySelectorAll('button[onclick^="llSetStatusFilter"]'));
const rowsText = h => Array.from(mod(h).querySelectorAll('tbody tr, table tr'))
  .map(r => r.textContent).join(' | ');
const type = (h, el, v) => { el.value = v; fire(h.w, el, 'input'); };

(async function () {

  section('а) Складът: поле над чиповете, търсене по изходящ №');
  {
    const h = env(WAREHOUSE);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('полето е на екрана', !!q(h));
    ok('подсказва какво търси', /Търси: изходящ №, обект, склад/.test(q(h).getAttribute('placeholder')),
      q(h).getAttribute('placeholder'));
    ok('чиповете по статус са тук', chips(h).length === 6, String(chips(h).length));
    /* По подразбиране „Текущи" = чернова + изпратен. */
    ok('без търсене се виждат двата текущи', h.w.llVisibleLists().length === 2,
      JSON.stringify(h.w.llVisibleLists().map(x => x.id)));

    type(h, q(h), '9694');
    ok('по част от номера — само L1', h.w.llVisibleLists().map(x => x.id).join(',') === 'L1',
      JSON.stringify(h.w.llVisibleLists().map(x => x.id)));
    ok('фокусът остава в полето', h.doc.activeElement === q(h), h.doc.activeElement && h.doc.activeElement.id);
    ok('написаното също', q(h).value === '9694', q(h).value);
    ok('чиповете НЕ изчезват (правило 11)', chips(h).length === 6, String(chips(h).length));
  }

  section('б) По обект и по склад');
  {
    const h = env(WAREHOUSE);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llSetStatusFilter('all');

    type(h, q(h), 'петрич');
    ok('по обект (без регистър) — L1 и L3', h.w.llVisibleLists().map(x => x.id).join(',') === 'L1,L3',
      JSON.stringify(h.w.llVisibleLists().map(x => x.id)));
    type(h, q(h), 'гоце');
    ok('другият обект — L2', h.w.llVisibleLists().map(x => x.id).join(',') === 'L2');
    type(h, q(h), 'търговище');
    ok('по склад — и трите', h.w.llVisibleLists().length === 3,
      JSON.stringify(h.w.llVisibleLists().map(x => x.id)));
  }

  section('б2) admin вижда няколко склада — търсенето по склад има смисъл');
  {
    const lists = [L('L1', 'sent', '2026-09-21', WH), L('L2', 'sent', '2026-09-22', WH2)];
    const items = [IT('i1', 'L1', 'A', 'Петрич'), IT('i2', 'L2', 'B', 'Петрич')];
    const h = env(ADMIN, { lists: lists, items: items });
    h.w.llWarehouse = WH2;              /* admin избира склад явно */
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('вижда листите на избрания склад', h.w.llLists.length === 1 && h.w.llLists[0].id === 'L2',
      JSON.stringify(h.w.llLists.map(x => x.id)));
    type(h, q(h), 'добрич');
    ok('търсенето по склад го намира', h.w.llVisibleLists().map(x => x.id).join(',') === 'L2');
    type(h, q(h), 'търговище');
    ok('а чуждият склад не е тук', h.w.llVisibleLists().length === 0);
  }

  section('в) Търсене И статус се КОМБИНИРАТ');
  {
    const h = env(WAREHOUSE);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    type(h, q(h), 'петрич');
    ok('„Текущи" + Петрич → само L1 (L3 е приключен)',
      h.w.llVisibleLists().map(x => x.id).join(',') === 'L1',
      JSON.stringify(h.w.llVisibleLists().map(x => x.id)));
    h.w.llSetStatusFilter('done');
    ok('„Приключени" + Петрич → само L3', h.w.llVisibleLists().map(x => x.id).join(',') === 'L3',
      JSON.stringify(h.w.llVisibleLists().map(x => x.id)));
    ok('търсенето НЕ се губи при смяна на чипа', h.w.llListQuery === 'петрич', h.w.llListQuery);
    ok('и полето още го показва', q(h).value === 'петрич', q(h).value);
    h.w.llSetStatusFilter('all');
    ok('„Всички" + Петрич → L1 и L3', h.w.llVisibleLists().length === 2);
  }

  section('г) Нищо не се намери — казва се, и има как да се върнеш');
  {
    const h = env(WAREHOUSE);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    type(h, q(h), 'няма-такова');
    ok('нула листи', h.w.llVisibleLists().length === 0);
    ok('съобщението сочи търсенето, не „няма листи"',
      /Нищо не отговаря на/.test(mod(h).textContent) && !/Няма товарни листи в този изглед/.test(mod(h).textContent),
      mod(h).textContent.slice(0, 300));
    ok('полето е още там', !!q(h) && q(h).value === 'няма-такова');
    ok('чиповете също', chips(h).length === 6);
    const clear = btn(mod(h), '✕ Изчисти');
    if (ok('има бутон „Изчисти"', !!clear)) {
      realClick(h.w, clear);
      ok('списъкът се връща', h.w.llVisibleLists().length === 2, JSON.stringify(h.w.llListQuery));
      ok('и полето е празно', q(h).value === '');
    }
  }

  section('д) Обектът: търсене по изходящ №, склад и дата');
  {
    const lists = [L('L1', 'sent', '2026-09-21', WH), L('L2', 'sent', '2026-09-22', WH2)];
    const items = [IT('i1', 'L1', '4600179694', 'Петрич'), IT('i2', 'L2', '4700000002', 'Петрич')];
    const h = env(STORE, { lists: lists, items: items });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('две карти', h.doc.querySelectorAll('[id^="ll-card-"]').length === 2,
      String(h.doc.querySelectorAll('[id^="ll-card-"]').length));
    ok('полето е над картите', !!sq(h));
    ok('подсказва по какво', /изходящ №, склад, дата/.test(sq(h).getAttribute('placeholder')),
      sq(h).getAttribute('placeholder'));

    type(h, sq(h), '9694');
    ok('по изходящ № — една карта', h.doc.querySelectorAll('[id^="ll-card-"]').length === 1 &&
      !!h.doc.getElementById('ll-card-L1'), h.doc.querySelectorAll('[id^="ll-card-"]').length + '');
    ok('фокусът остава', h.doc.activeElement === sq(h));

    type(h, sq(h), 'добрич');
    ok('по склад — другата', !!h.doc.getElementById('ll-card-L2') && !h.doc.getElementById('ll-card-L1'));

    type(h, sq(h), '22.09.2026');
    ok('по дата, както е на екрана', !!h.doc.getElementById('ll-card-L2'),
      mod(h).textContent.slice(0, 200));
    type(h, sq(h), '2026-09-21');
    ok('и по ISO дата', !!h.doc.getElementById('ll-card-L1'));

    type(h, sq(h), 'няма');
    ok('празен резултат се казва', /Нищо не отговаря на/.test(mod(h).textContent), mod(h).textContent.slice(0, 200));
    ok('и полето остава, за да се изчисти', !!sq(h));
    realClick(h.w, btn(mod(h), '✕ Изчисти'));
    ok('двете карти се връщат', h.doc.querySelectorAll('[id^="ll-card-"]').length === 2);
  }

  section('е) Обект без нито един лист — полето не се показва напразно');
  {
    const h = env(STORE, { lists: [], items: [] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('казва „Няма товари"', /Няма товари за/.test(mod(h).textContent), mod(h).textContent.slice(0, 200));
    ok('без поле за търсене', !sq(h));
  }

  report();
})();
