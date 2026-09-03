/* Транспорт > Товарни листи — СКЛАДОВАТА страна (loading.js).

   Складът описва какво товари: палет / рула / насип, за кой обект, срещу коя
   покупка. Стоковата № НЕ се пише на ръка — избира се от чакащите документи
   в goods_transit, който държи по ЕДИН РЕД НА АРТИКУЛ: документ с 28 позиции
   е 28 реда там и ЕДИН избираем документ тук.

   Часовата зона се заковава ПРЕДИ всичко останало: сценарий „ж" сравнява
   локална дата срещу UTC дата, а това има смисъл само при известна зона.
   Без този ред тестът минава или пада според машината, на която върви —
   точно дефектът, който вече е известен от kasa-history-window.
*/
process.env.TZ = 'Europe/Sofia';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, fire, ticks } = H;

const WH_TG = 'Логистичен склад Търговище';
const NEW_ID = 'list-new-1';

/* ── Чакащите стокови документи: 3 документа, 2 обекта, 31 реда ──
   Документ А е с 28 позиции — той е причината за групирането. */
function transitRow(doc, store, i) {
  return {
    id: doc + '-' + i, purchase_doc: doc, store_name: store, supplier: WH_TG,
    doc_date: '2026-09-01', status: 'pending', position: String(i),
    material_code: '3' + i, material_name: 'АРТИКУЛ ' + i
  };
}
const TRANSIT = []
  .concat(Array.from({ length: 28 }, (_, i) => transitRow('4600179694', 'Петрич', i + 1)))
  .concat(Array.from({ length: 2 }, (_, i) => transitRow('4600179700', 'Гоце Делчев', i + 1)))
  .concat([transitRow('4600179701', 'Петрич', 1)]);

const USERS = [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' },
               { store_name: 'Централен офис' }, { store_name: WH_TG }];

const WAREHOUSE = {
  email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
  role: 'sklad', store_name: WH_TG, assigned_stores: []
};
const STORE = {
  email: 'petrich@temax.bg', display_name: 'Управител Петрич',
  role: 'manager', store_name: 'Петрич', assigned_stores: []
};
const ADMIN = {
  email: 'admin@temax.bg', display_name: 'Админ',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    /* loading.js вика toLocalISO() от bulletin.js и
       isLogisticsWarehouseUser() от stock-differences.js. В index.html редът
       вече е верен (поз. 6 и 19 срещу 21); тук се декларира явно, иначе
       ReferenceError мълчи до първия клик. */
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js'],
    user: user, confirm: true,
    fail: opts.fail,
    data: {
      goods_transit: TRANSIT,
      stock_differences: [], differences_reports: [], stock_returns: [],
      users: USERS,
      loading_lists: opts.lists || [],
      loading_list_items: opts.items || [],
      stores: [], contacts: [], transport_orders: []
    }
  });
  /* sbPostReturn иска СЪЗДАДЕНИЯ ред обратно (Prefer: return=representation).
     Стандартният mock връща {} за всеки POST, тоест листът щеше да е без id и
     редовете му биха тръгнали с list_id: undefined. Обвиваме fetch само за
     тази една таблица; всичко останало минава по общия път, включително
     правилата от `fail`. */
  const inner = h.w.fetch;
  h.w.fetch = function (url, init) {
    const m = ((init || {}).method || 'GET').toUpperCase();
    if (m === 'POST' && /\/rest\/v1\/loading_lists(\?|$)/.test(String(url))) {
      return inner(url, init).then(function () {
        let body = {};
        try { body = JSON.parse(init.body); } catch (e) { }
        const row = Object.assign({ id: NEW_ID }, Array.isArray(body) ? body[0] : body);
        return {
          ok: true, status: 201,
          json: () => Promise.resolve([row]),
          text: () => Promise.resolve(JSON.stringify([row]))
        };
      });
    }
    return inner(url, init);
  };
  h.w.llLists = []; h.w.llItems = []; h.w.llView = 'list';
  h.w.llCurrentId = null; h.w.llStatusFilter = 'open';
  h.w.llWarehouse = opts.warehouse || '';
  h.w.llDraft = null; h.w.llPendingDocs = []; h.w.llStores = [];
  h.w.llIncompleteSaves = {};
  h.w.invalidateStoreCaches();
  return h;
}

const mod = doc => doc.getElementById('mod-loading');
/* „Няма такъв бутон" се проверява САМО по <button>: обвиващият div съдържа
   текста на всеки бутон в него и проверка по textContent е винаги истина. */
function hasBtn(doc, text) { return !!btn(mod(doc), text); }
function itemPosts(calls) {
  return calls.post.filter(p => /loading_list_items/.test(p.url));
}

(async function () {

  section('а) Складът вижда „Нов товарен лист"; магазинът — не');
  {
    const h = env(WAREHOUSE);
    h.w.loadLoadingLists();
    await ticks();
    ok('складът има бутон за нов лист', hasBtn(h.doc, 'Нов товарен лист'),
      mod(h.doc).textContent.slice(0, 160));
    ok('llCanEdit() е true за склада', h.w.llCanEdit() === true);

    const s = env(STORE);
    s.w.loadLoadingLists();
    await ticks();
    ok('магазинът НЯМА бутон за нов лист', !hasBtn(s.doc, 'Нов товарен лист'),
      mod(s.doc).textContent.slice(0, 200));
    ok('llCanEdit() е false за магазина', s.w.llCanEdit() === false);
    ok('вижда обяснение „Няма товари за Петрич"',
      mod(s.doc).textContent.indexOf('Няма товари за Петрич') >= 0,
      mod(s.doc).textContent.slice(0, 200));
    ok('подтабът НЕ е скрит — бутонът в навигацията стои',
      !!s.doc.getElementById('tps-loading'));
  }

  section('б) Документ върху 3 палета + документ на свой палет + насип → 5 реда');
  {
    const h = env(WAREHOUSE);
    h.w.llNewList();
    await ticks(); await ticks();

    ok('документите са групирани — 3, не 31', h.w.llPendingDocs.length === 3,
      String(h.w.llPendingDocs.length));
    const docA = h.w.llPendingDocs.find(d => d.purchase_doc === '4600179694');
    ok('документът с 28 позиции е ЕДИН ред', !!docA && docA.items === 28,
      JSON.stringify(docA && docA.items));
    ok('и носи своя обект', docA.store_name === 'Петрич', docA.store_name);

    const iA = h.w.llPendingDocs.indexOf(docA);
    const iB = h.w.llPendingDocs.indexOf(
      h.w.llPendingDocs.find(d => d.purchase_doc === '4600179700'));
    /* Документ A е голям и се разстила върху три палета - затова обхват.
       Документ B е за ДРУГ обект, тоест собствената му номерация тръгва от 1. */
    h.w.llSetDocPallet(iA, '1-3');
    h.w.llToggleDoc(iA);
    h.w.llToggleDoc(iB);
    h.w.llAddFreeRow();
    h.w.llSetRowField(4, 'kind', 'bulk');
    h.w.llSetRowField(4, 'store_name', 'Петрич');
    ok('черновата има 5 реда', h.w.llDraft.items.length === 5,
      String(h.w.llDraft.items.length));

    h.w.llSaveDraft();
    await ticks(); await ticks(); await ticks();

    const posts = itemPosts(h.calls);
    if (ok('редовете са записани с един POST', posts.length === 1,
      JSON.stringify(h.calls.post.map(p => p.table)))) {
      const rows = posts[0].body;
      if (ok('точно 5 реда', Array.isArray(rows) && rows.length === 5,
        JSON.stringify(rows && rows.length))) {
        ok('позициите са 1..5', rows.map(r => r.position).join(',') === '1,2,3,4,5',
          rows.map(r => r.position).join(','));
        ok('всички сочат създадения лист',
          rows.every(r => r.list_id === NEW_ID), JSON.stringify(rows[0].list_id));
        ok('първите три са палет 1..3 от 3',
          rows.slice(0, 3).map(r => r.kind + r.pallet_no + '/' + r.pallet_total).join(' ')
            === 'pallet1/3 pallet2/3 pallet3/3',
          rows.slice(0, 3).map(r => r.kind + r.pallet_no + '/' + r.pallet_total).join(' '));
        ok('четвъртият е палет 1 от 1',
          rows[3].kind === 'pallet' && rows[3].pallet_no === 1 && rows[3].pallet_total === 1,
          JSON.stringify(rows[3]));
        ok('петият е насип без номерация',
          rows[4].kind === 'bulk' && rows[4].pallet_no === null && rows[4].pallet_total === null,
          JSON.stringify(rows[4]));
        ok('обектите идват от документите',
          rows.slice(0, 3).every(r => r.store_name === 'Петрич') &&
          rows[3].store_name === 'Гоце Делчев', JSON.stringify(rows.map(r => r.store_name)));
        ok('стоковата № е от документа, не писана на ръка',
          rows[0].purchase_doc === '4600179694' && rows[3].purchase_doc === '4600179700' &&
          rows[4].purchase_doc === null, JSON.stringify(rows.map(r => r.purchase_doc)));
      }
    }
    ok('листът е записан като чернова',
      h.calls.post.some(p => p.table === 'loading_lists' && p.body.status === 'draft'),
      JSON.stringify(h.calls.post.map(p => p.table)));
    ok('няма маркер за непълен запис', !h.w.llIncompleteSaves[NEW_ID]);
  }

  section('в) Провал на POST на редовете — червен toast, листът НЕ е изпратен');
  {
    const h = env(WAREHOUSE, { fail: { POST: /loading_list_items/ } });
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llToggleDoc(0);
    h.w.llSaveDraft();
    await ticks(); await ticks(); await ticks();

    ok('червено съобщение, че редовете липсват',
      h.calls.toast.some(t => /Листът е записан БЕЗ редовете/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    ok('грешката НЕ е погълната — маркерът стои',
      h.w.llIncompleteSaves[NEW_ID] === true, JSON.stringify(h.w.llIncompleteSaves));
    ok('НЕ се е появило съобщение за успех',
      !h.calls.toast.some(t => /Черновата е записана/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    ok('листът НЕ е изпратен',
      !h.calls.patch.some(p => p.body && p.body.status === 'sent'),
      JSON.stringify(h.calls.patch.map(p => p.body)));
    ok('и не е записан като sent при създаването',
      !h.calls.post.some(p => p.table === 'loading_lists' && p.body.status === 'sent'));

    /* Маркерът трябва да СЕ ВИЖДА, не само да съществува в паметта. */
    h.w.llLists = [{ id: NEW_ID, warehouse: WH_TG, list_date: '2026-09-03',
                     status: 'draft', executed_by: 'Склад' }];
    h.w.llItems = []; h.w.llView = 'list';
    h.w.renderLoadingLists();
    ok('маркерът „непълен запис" е на екрана',
      mod(h.doc).textContent.indexOf('непълен запис') >= 0,
      mod(h.doc).textContent.slice(0, 300));
  }

  section('г) Обобщението по обект се смята от редовете, не от заглавието');
  {
    const items = [
      { id: 'i1', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 2, store_name: 'Петрич', received: true, received_by: 'Управител Петрич', received_at: '2026-09-02T08:00:00.000Z' },
      { id: 'i2', list_id: 'L1', position: 2, kind: 'pallet', pallet_no: 2, pallet_total: 2, store_name: 'Петрич', received: false },
      { id: 'i3', list_id: 'L1', position: 3, kind: 'roll', store_name: 'Гоце Делчев', received: false },
      { id: 'i4', list_id: 'L1', position: 4, kind: 'bulk', store_name: 'Гоце Делчев', received: false }
    ];
    /* Заглавието нарочно НЕ носи броячи — те не са колона. */
    const lists = [{ id: 'L1', warehouse: WH_TG, list_date: '2026-09-02', status: 'sent',
                     executed_by: 'Склад', sent_at: '2026-09-02T06:00:00.000Z' }];
    const h = env(WAREHOUSE, { lists: lists, items: items });
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const sum = h.w.llSummaryByStore(items);
    ok('два обекта в обобщението', sum.length === 2, JSON.stringify(sum.map(s => s.store)));
    const p = sum.find(s => s.store === 'Петрич');
    const g = sum.find(s => s.store === 'Гоце Делчев');
    ok('Петрич: 2 палета, 0 рула, 0 насип',
      p.pallet === 2 && p.roll === 0 && p.bulk === 0, JSON.stringify(p));
    ok('Гоце Делчев: 0 палета, 1 руло, 1 насип',
      g.pallet === 0 && g.roll === 1 && g.bulk === 1, JSON.stringify(g));
    ok('получени 1/2 за Петрич', p.received === 1 && p.total === 2, JSON.stringify(p));
    ok('получени 0/2 за Гоце Делчев', g.received === 0 && g.total === 2, JSON.stringify(g));

    h.w.llOpenView('L1');
    if (guard('прегледът не хвърля', () => h.w.renderLoadingLists())) {
      const t = h.doc.getElementById('ll-summary');
      if (ok('таблицата с обобщението е на екрана', !!t)) {
        ok('редовете ѝ са два', t.querySelectorAll('tr').length === 3,
          String(t.querySelectorAll('tr').length));
      }
      ok('заглавието брои 2 обекта · 2 палета · 1 рула · 1 насип',
        mod(h.doc).textContent.indexOf('2 обекта · 2 палета · 1 рула · 1 насип') >= 0,
        mod(h.doc).textContent.slice(0, 400));
      ok('„палет 2 от 5" стил на етикета',
        h.w.llKindLabel(items[0]) === 'палет 1 от 2', h.w.llKindLabel(items[0]));
      ok('получилият се вижда с име', mod(h.doc).textContent.indexOf('Управител Петрич') >= 0);
    }
  }

  section('д) „Изпратен" → PATCH sent + sent_at; редовете стават readonly');
  {
    const lists = [{ id: 'L1', warehouse: WH_TG, list_date: '2026-09-02', status: 'draft',
                     executed_by: 'Склад' }];
    const items = [
      { id: 'i1', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
        purchase_doc: '4600179694', store_name: 'Петрич', warehouse_comment: 'на рампата', received: false }
    ];
    const h = env(WAREHOUSE, { lists: lists, items: items });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    ok('черновата има бутон „Изпратен"', hasBtn(h.doc, 'Изпратен'),
      mod(h.doc).textContent.slice(0, 200));

    realClick(h.w, btn(mod(h.doc), 'Изпратен'));
    await ticks(); await ticks();
    const pt = h.calls.patch.filter(p => /loading_lists/.test(p.url));
    if (ok('листът е patch-нат', pt.length === 1, JSON.stringify(h.calls.patch.map(p => p.url)))) {
      ok('status: sent', pt[0].body.status === 'sent', JSON.stringify(pt[0].body.status));
      ok('sent_at е попълнено', !!pt[0].body.sent_at, JSON.stringify(pt[0].body.sent_at));
      ok('URL сочи точния лист', /id=eq\.L1/.test(pt[0].url), pt[0].url);
    }

    /* Изпратен лист: редакция няма, редовете не се пипат — освен коментара
       на склада. Проверката е по <button> и <input>, не по текст. */
    h.w.llLists = [Object.assign({}, lists[0], { status: 'sent', sent_at: '2026-09-02T06:00:00.000Z' })];
    h.w.llItems = items.slice();
    h.w.llView = 'view'; h.w.llCurrentId = 'L1';
    h.w.renderLoadingLists();
    ok('няма бутон „Редакция"', !hasBtn(h.doc, 'Редакция'));
    ok('няма бутон „Изпратен" втори път', !hasBtn(h.doc, 'Изпратен'));
    ok('появява се „Приключен"', hasBtn(h.doc, 'Приключен'));
    ok('няма бутони за местене/триене на ред',
      !hasBtn(h.doc, '↑') && !hasBtn(h.doc, '↓') && !hasBtn(h.doc, '✕'));
    const inputs = mod(h.doc).querySelectorAll('input');
    ok('единственото поле е коментарът на склада', inputs.length === 1,
      Array.prototype.map.call(inputs, i => i.getAttribute('onchange') || i.type).join(' | '));
    ok('и то вика llSaveWarehouseComment',
      /llSaveWarehouseComment/.test(inputs[0].getAttribute('onchange') || ''),
      inputs[0].getAttribute('onchange'));
    ok('няма <select> по редовете', mod(h.doc).querySelectorAll('table select').length === 0,
      String(mod(h.doc).querySelectorAll('table select').length));
  }

  section('е) Изборът на склад е само за admin/logistics');
  {
    const a = env(ADMIN);
    a.w.loadLoadingLists();
    await ticks();
    ok('admin вижда select за склад', !!a.doc.getElementById('ll-wh'));
    ok('и още няма списък, докато не избере',
      mod(a.doc).textContent.indexOf('Избери склад') >= 0,
      mod(a.doc).textContent.slice(0, 200));
    ok('опциите са само логистичните складове',
      a.doc.getElementById('ll-wh').options.length === 1 + a.w.LOGISTICS_WAREHOUSES.length,
      String(a.doc.getElementById('ll-wh').options.length));

    /* Точният случай от заданието: admin изобщо без store_name. */
    const a2 = env({ email: 'a2@temax.bg', display_name: 'Админ 2', role: 'admin' });
    a2.w.loadLoadingLists();
    await ticks();
    ok('admin без store_name също вижда select', !!a2.doc.getElementById('ll-wh'));

    const h = env(WAREHOUSE);
    h.w.loadLoadingLists();
    await ticks();
    ok('складовият потребител НЯМА select', !h.doc.getElementById('ll-wh'));
    ok('а вижда своя склад изписан',
      mod(h.doc).textContent.indexOf(WH_TG) >= 0, mod(h.doc).textContent.slice(0, 200));
  }

  section('ж) Датата по подразбиране е ЛОКАЛНА, не UTC');
  {
    const h = env(WAREHOUSE);
    /* 04.09.2026 22:30 UTC = 05.09.2026 01:30 в София. today() (UTC) казва
       04-и, локалната дата — 05-и. Точно в този прозорец новият лист тръгваше
       с вчерашна дата. */
    const RealDate = h.w.Date;
    const FIXED = new RealDate('2026-09-04T22:30:00.000Z').getTime();
    h.w.Date = class extends RealDate {
      constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
      static now() { return FIXED; }
    };
    ok('UTC датата наистина е предният ден', h.w.today() === '2026-09-04', h.w.today());
    ok('llTodayISO() дава локалния ден', h.w.llTodayISO() === '2026-09-05', h.w.llTodayISO());
    ok('и двете НЕ съвпадат — прозорецът е реален', h.w.today() !== h.w.llTodayISO());

    h.w.llNewList();
    await ticks(); await ticks();
    ok('черновата тръгва с локалната дата', h.w.llDraft.list_date === '2026-09-05',
      h.w.llDraft.list_date);
    const inp = h.doc.getElementById('ll-date');
    if (ok('полето за дата е на екрана', !!inp)) {
      ok('и показва 2026-09-05', inp.value === '2026-09-05', inp.value);
    }
    ok('товарилият е попълнен по подразбиране',
      h.w.llDraft.executed_by === 'Склад Търговище', h.w.llDraft.executed_by);
    h.w.Date = RealDate;
  }

  section('з) Махане на ред от чернова трие по id');
  {
    const lists = [{ id: 'L1', warehouse: WH_TG, list_date: '2026-09-02', status: 'draft' }];
    const items = [
      { id: 'i1', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1, store_name: 'Петрич' },
      { id: 'i2', list_id: 'L1', position: 2, kind: 'roll', store_name: 'Петрич' }
    ];
    const h = env(WAREHOUSE, { lists: lists, items: items });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenEdit('L1');
    await ticks(); await ticks();
    ok('черновата е заредена с двата реда', h.w.llDraft.items.length === 2,
      String(h.w.llDraft.items.length));
    h.w.llRemoveRow(0);
    await ticks();
    ok('DELETE по id на реда', h.calls.del.some(u => /loading_list_items.*id=eq\.i1/.test(u)),
      JSON.stringify(h.calls.del));
    ok('и редът си отива от екрана', h.w.llDraft.items.length === 1,
      String(h.w.llDraft.items.length));
  }

  report();
})();
