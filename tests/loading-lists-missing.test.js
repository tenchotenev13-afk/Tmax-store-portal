/* Товарни листи — „НЕПОЛУЧЕНО" по ред, приключване от обекта и статус
   „Частично приключен".

   Дотук редът имаше само received true/false и неотметнатият ред значеше
   „още не е дошъл". Обектът нямаше как да каже „това НЕ дойде", нито да
   приключи приемането си с липси — листът ставаше done само когато ВСИЧКИ
   редове на ВСИЧКИ обекти са получени, тоест лист с липсващ палет висеше
   „изпратен" завинаги.

   Въпросите, в които е лесно да се сбърка ТИХО, и затова са заковани тук:
     - липса БЕЗ обяснение — нищо не бива да се запише, а не „записва се с
       празен коментар"; това е единствената проверка пред PATCH-а;
     - llAutoCloseDoc НЕ се вика при липса. Обратното би обявило стоката за
       приета в „Стока на път" точно защото не е дошла;
     - „Приключи приемането" е СИВ, докато има ред без произнасяне. Активен
       бутон, който мълчаливо не прави нищо, е по-лош от липсващ;
     - партиалът е на ЦЕЛИЯ лист, не на обекта: лист с два обекта не става
       partial, докато вторият не приключи;
     - „Отмени" връща реда в ИЗЧАКВАНЕ, не в „получено".

   Пускане:  node tests/loading-lists-missing.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';

const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };

const L_SENT = { id: 'L1', warehouse: WH, list_date: '2026-09-02', status: 'sent',
                 executed_by: 'Иван', comment: '', created_by: 'Склад Търговище',
                 created_at: '2026-09-02T06:00:00.000Z',
                 sent_at: '2026-09-02T07:00:00.000Z', done_at: null };

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet',
    pallet_no: 1, pallet_total: 1, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null,
    created_at: '2026-09-02T06:00:00.000Z'
  }, o);
}

/* Същият мъничък сървър като в loading-lists-store.test.js: прилага
   записаните PATCH-ове, преди да върне редовете. Без това llAutoDoneList()
   пита сървъра и получава състоянието ОТПРЕДИ маркирането — тоест сценарий
   (г) не би проверявал нищо. */
function env(user, items, lists, transit, opts) {
  opts = opts || {};
  let ref = null;
  const applyPatches = (rows, table) => {
    if (!ref) return rows;
    ref.calls.patch.filter(p => p.table === table).forEach(p => {
      const m = /id=eq\.([^&]*)/.exec(p.url);
      if (!m) return;
      const row = rows.find(r => String(r.id) === decodeURIComponent(m[1]));
      if (row) Object.assign(row, p.body);
    });
    return rows;
  };
  const pick = (url, re, rows, field) => {
    const m = re.exec(url);
    if (!m) return rows;
    const want = decodeURIComponent(m[1]);
    return rows.filter(r => String(r[field]) === want);
  };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js',
              'loading.js', 'notifications.js'],
    user: user,
    confirm: opts.confirm !== undefined ? opts.confirm : true,
    fail: opts.fail,
    data: {
      loading_list_items: function (url) {
        let rows = applyPatches((items || []).map(r => Object.assign({}, r)), 'loading_list_items');
        rows = pick(url, /store_name=eq\.([^&]*)/, rows, 'store_name');
        rows = pick(url, /list_id=eq\.([^&]*)/, rows, 'list_id');
        /* Точно филтрите, които notifications.js праща. Мокът ТРЯБВА да ги
           прилага — иначе сценарий (е) минава и с махнат &missing=eq.false. */
        if (/received=eq\.false/.test(url)) rows = rows.filter(r => !r.received);
        if (/missing=eq\.false/.test(url))  rows = rows.filter(r => !r.missing);
        return rows;
      },
      loading_lists: function (url) {
        let rows = applyPatches((lists || []).map(r => Object.assign({}, r)), 'loading_lists');
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const s = ids[1].split(','); rows = rows.filter(r => s.indexOf(String(r.id)) >= 0); }
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); rows = rows.filter(r => s.indexOf(r.status) >= 0); }
        const st1 = /[?&]status=eq\.([^&]*)/.exec(url);
        if (st1) rows = rows.filter(r => r.status === decodeURIComponent(st1[1]));
        return rows;
      },
      goods_transit: function (url) {
        let rows = (transit || []).map(r => Object.assign({}, r));
        rows = pick(url, /purchase_doc=eq\.([^&]*)/, rows, 'purchase_doc');
        rows = pick(url, /store_name=eq\.([^&]*)/, rows, 'store_name');
        rows = pick(url, /[?&]status=eq\.([^&]*)/, rows, 'status');
        return rows;
      },
      users: [], stores: [], contacts: [], transport_orders: [], client_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.w.transportOrders = []; h.w.clientOrders = [];
  ref = h;
  return h;
}

const card = (doc, id) => doc.getElementById('ll-card-' + id);
const patchesTo = (h, table) => h.calls.patch.filter(p => p.table === table);
/* „Няма такъв бутон" се проверява САМО по <button> — думата „Неполучено"
   стои и в баджа „получени X · неполучени Y", и в заглавие на колона. */
const btnIn = (root, text) => (root ? btn(root, text) : null);

(async function () {

  section('а) „Неполучено" БЕЗ коментар — нищо не се записва');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100' })];
    const h = env(STORE, items, [L_SENT],
      [{ id: 't1', purchase_doc: 'D-100', store_name: 'Петрич', status: 'pending' }]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const b = btnIn(card(h.doc, 'L1'), '⛔ Неполучено');
    if (ok('има бутон „Неполучено"', !!b, card(h.doc, 'L1').innerHTML.slice(0, 400))) {
      /* Полето е празно — точно случаят, който трябва да бъде спрян. */
      const inp = h.doc.getElementById('ll-sc-i1');
      ok('полето „Моят коментар" е празно', !!inp && inp.value === '',
        inp ? JSON.stringify(inp.value) : 'няма поле');

      realClick(h.w, b);
      await ticks(); await ticks();

      ok('НУЛА PATCH-ове изобщо', h.calls.patch.length === 0,
        JSON.stringify(h.calls.patch.map(p => p.table + ' ' + JSON.stringify(p.body))));
      ok('червен toast с обяснение',
        h.calls.toast.some(t => /Опиши какво липсва в коментара/.test(String(t.msg || t))),
        JSON.stringify(h.calls.toast));
      ok('фокусът отива в полето', h.doc.activeElement === inp,
        h.doc.activeElement && h.doc.activeElement.id);
      ok('редът НЕ е станал missing локално', h.w.llStoreItems[0].missing !== true,
        String(h.w.llStoreItems[0].missing));
    }
  }

  section('б) С коментар — PATCH с missing:true, ред червен, документът НЕ се затваря');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100' })];
    const h = env(STORE, items, [L_SENT],
      [{ id: 't1', purchase_doc: 'D-100', store_name: 'Петрич', status: 'pending' }]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const inp = h.doc.getElementById('ll-sc-i1');
    inp.value = '  липсва целият палет  ';        /* нарочно с празни места */
    realClick(h.w, btnIn(card(h.doc, 'L1'), '⛔ Неполучено'));
    await ticks(); await ticks(); await ticks();

    const ip = patchesTo(h, 'loading_list_items');
    if (ok('точно един PATCH по реда', ip.length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('missing:true', ip[0].body.missing === true, JSON.stringify(ip[0].body));
      ok('missing_by е потребителят', ip[0].body.missing_by === 'Управител Петрич',
        JSON.stringify(ip[0].body.missing_by));
      ok('missing_at е попълнено', !!ip[0].body.missing_at);
      ok('received НЕ се пипа', !('received' in ip[0].body), JSON.stringify(ip[0].body));
      /* Коментарът пътува в СЪЩИЯ PATCH: onchange се задейства при blur само в
         истински браузър, а липса без обяснение не бива да се запише изобщо. */
      ok('коментарът влиза в същия PATCH, trim-нат',
        ip[0].body.store_comment === 'липсва целият палет',
        JSON.stringify(ip[0].body.store_comment));
      ok('URL сочи точния ред', /id=eq\.i1/.test(ip[0].url), ip[0].url);
    }

    /* Сърцевината: липсата НЕ затваря стоковия документ. */
    ok('НУЛА PATCH към goods_transit', patchesTo(h, 'goods_transit').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('и нула GET към goods_transit — llAutoCloseDoc не е викан изобщо',
      !h.calls.get.some(u => /goods_transit/.test(u)), h.calls.get.join(' | '));
    ok('листът НЕ се приключва от самото маркиране',
      patchesTo(h, 'loading_lists').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));

    const row = h.doc.querySelector('#mod-loading tr[data-missing="1"]');
    ok('редът носи data-missing', !!row);
    ok('и червен фон', !!row && /#fef2f2/.test(row.getAttribute('style') || ''),
      row && row.getAttribute('style'));
    ok('показва кой е маркирал',
      card(h.doc, 'L1').textContent.indexOf('Управител Петрич') >= 0,
      card(h.doc, 'L1').textContent.slice(0, 300));
    ok('бутонът „Получено" вече го няма на този ред',
      !btnIn(card(h.doc, 'L1'), '✅ Получено'));
    ok('броячът е „получени 0 · неполучени 1 / 1"',
      card(h.doc, 'L1').textContent.indexOf('получени 0 · неполучени 1 / 1') >= 0,
      card(h.doc, 'L1').textContent.slice(0, 200));
  }

  section('в) „Приключи приемането" — сив, докато има необработен ред');
  {
    const items = [
      it_({ id: 'i1', position: 1, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-100' }),
      it_({ id: 'i2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200' })
    ];
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    let fin = btnIn(card(h.doc, 'L1'), '🏁 Приключи приемането');
    if (ok('бутонът съществува', !!fin)) {
      ok('и е disabled при два необработени реда', fin.disabled === true, String(fin.disabled));
      ok('с обяснение в title',
        (fin.getAttribute('title') || '').indexOf('Отметни всеки ред') >= 0,
        fin.getAttribute('title'));
      /* Кликът по сив бутон не бива да прави нищо ДОРИ ако някой го извика. */
      h.w.llFinishReceiving('L1');
      await ticks();
      ok('извикването наум също не приключва нищо',
        patchesTo(h, 'loading_lists').length === 0,
        JSON.stringify(h.calls.patch.map(p => p.table)));
    }

    /* Ред 1 — получен. */
    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks();
    fin = btnIn(card(h.doc, 'L1'), '🏁 Приключи приемането');
    ok('още disabled — вторият ред е необработен', !!fin && fin.disabled === true,
      fin && String(fin.disabled));

    /* Ред 2 — неполучен, с коментар. */
    h.doc.getElementById('ll-sc-i2').value = 'вторият палет не дойде';
    realClick(h.w, btnIn(card(h.doc, 'L1'), '⛔ Неполучено'));
    await ticks(); await ticks(); await ticks();

    fin = btnIn(card(h.doc, 'L1'), '🏁 Приключи приемането');
    if (ok('вече enabled', !!fin && !fin.disabled, fin && String(fin.disabled))) {
      ok('и без title за блокировката', !fin.getAttribute('title'),
        fin.getAttribute('title'));
      realClick(h.w, fin);
      await ticks(); await ticks(); await ticks();
      const lp = patchesTo(h, 'loading_lists');
      if (ok('листът е приключен', lp.length === 1,
        JSON.stringify(h.calls.patch.map(p => p.table)))) {
        ok('status:partial — има липса', lp[0].body.status === 'partial',
          JSON.stringify(lp[0].body));
        ok('done_at е попълнено', !!lp[0].body.done_at);
      }
      ok('проверката е СЪС ЗАЯВКА и иска missing',
        h.calls.get.some(u => /loading_list_items/.test(u) &&
          /list_id=eq\.L1/.test(u) && /missing/.test(u)),
        h.calls.get.filter(u => /list_id=eq\.L1/.test(u)).join(' | '));
    }
  }

  section('г) Два обекта: partial чак след като вторият приключи');
  {
    /* Обект А (Гоце Делчев) е получил всичко. Обект Б (Петрич) има един
       получен и един липсващ ред. Листът НЕ бива да стане partial, преди
       Петрич да приключи — тоест маркирането на липсата само по себе си не
       затваря нищо. */
    const items = [
      it_({ id: 'a1', position: 1, store_name: 'Гоце Делчев', purchase_doc: 'D-900',
            received: true, received_by: 'Управител ГД', received_at: '2026-09-02T09:00:00.000Z' }),
      it_({ id: 'i1', position: 2, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-100',
            received: true, received_by: 'Управител Петрич', received_at: '2026-09-02T09:30:00.000Z' }),
      it_({ id: 'i2', position: 3, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200' })
    ];
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('Петрич вижда само своите два реда', h.w.llStoreItems.length === 2,
      JSON.stringify(h.w.llStoreItems.map(i => i.id)));

    h.doc.getElementById('ll-sc-i2').value = 'палет 2 липсва';
    realClick(h.w, btnIn(card(h.doc, 'L1'), '⛔ Неполучено'));
    await ticks(); await ticks(); await ticks();
    ok('самото маркиране НЕ приключва листа',
      patchesTo(h, 'loading_lists').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table + ':' + JSON.stringify(p.body))));

    realClick(h.w, btnIn(card(h.doc, 'L1'), '🏁 Приключи приемането'));
    await ticks(); await ticks(); await ticks();
    const lp = patchesTo(h, 'loading_lists');
    if (ok('след приключване листът е patch-нат', lp.length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('status:partial, защото има липса', lp[0].body.status === 'partial',
        JSON.stringify(lp[0].body));
    }
    ok('баджът в картата казва „Частично приключен"',
      card(h.doc, 'L1').textContent.indexOf('Частично приключен') >= 0,
      card(h.doc, 'L1').textContent.slice(0, 220));
  }

  section('г2) Същият лист БЕЗ липси → done, не partial');
  {
    const items = [
      it_({ id: 'a1', position: 1, store_name: 'Гоце Делчев', purchase_doc: 'D-900',
            received: true, received_by: 'Управител ГД', received_at: '2026-09-02T09:00:00.000Z' }),
      it_({ id: 'i1', position: 2, purchase_doc: 'D-100' })
    ];
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks(); await ticks();
    const lp = patchesTo(h, 'loading_lists');
    if (ok('листът е приключен от llAfterReceive', lp.length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('status:done', lp[0].body.status === 'done', JSON.stringify(lp[0].body));
    }
  }

  section('г3) Приключа ли пръв, обектът получава ОТГОВОР, а не мълчание');
  {
    /* Чуждият ред още чака. llAutoDoneList няма какво да запише и мълчи —
       без съобщение човекът натиска бутона и на екрана не се случва нищо,
       тоест натиска пак. Точно това е разликата от провал. */
    const items = [
      it_({ id: 'a1', position: 1, store_name: 'Гоце Делчев', purchase_doc: 'D-900' }),
      it_({ id: 'i1', position: 2, purchase_doc: 'D-100', received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T09:30:00.000Z' })
    ];
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const fin = btnIn(card(h.doc, 'L1'), '🏁 Приключи приемането');
    if (ok('бутонът е активен — моите редове са обработени', !!fin && !fin.disabled,
      fin && String(fin.disabled))) {
      realClick(h.w, fin);
      await ticks(); await ticks(); await ticks();
      ok('листът НЕ се приключва — чуждият ред чака',
        patchesTo(h, 'loading_lists').length === 0,
        JSON.stringify(h.calls.patch.map(p => p.table)));
      ok('но обектът получава съобщение, а не мълчание',
        h.calls.toast.some(t => /чака и останалите обекти/.test(String(t.msg || t))),
        JSON.stringify(h.calls.toast));
    }
  }

  section('д) „Отмени" връща реда в ИЗЧАКВАНЕ, не в „получено"');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', missing: true,
                         missing_by: 'Управител Петрич',
                         missing_at: '2026-09-02T10:00:00.000Z',
                         store_comment: 'не дойде' })];
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    /* Листът е sent: всеки ред е обработен, но приемането още не е
       приключено. Свиването тук би скрило единствения бутон, който го
       придвижва — затова картата остава отворена. */
    ok('картата НЕ се свива, докато листът е „изпратен"',
      h.w.llCollapsed['L1'] === undefined, JSON.stringify(h.w.llCollapsed));
    const b = btnIn(card(h.doc, 'L1'), '↩ Отмени');
    if (ok('има бутон „Отмени"', !!b, card(h.doc, 'L1').innerHTML.slice(0, 500))) {
      realClick(h.w, b);
      await ticks(); await ticks();

      const ip = patchesTo(h, 'loading_list_items');
      if (ok('точно един PATCH', ip.length === 1, JSON.stringify(ip.map(p => p.body)))) {
        ok('missing:false', ip[0].body.missing === false, JSON.stringify(ip[0].body));
        ok('missing_by → null',
          'missing_by' in ip[0].body && ip[0].body.missing_by === null, JSON.stringify(ip[0].body));
        ok('missing_at → null',
          'missing_at' in ip[0].body && ip[0].body.missing_at === null, JSON.stringify(ip[0].body));
        ok('received НЕ се пипа — редът пак ЧАКА, не е получен',
          !('received' in ip[0].body), JSON.stringify(ip[0].body));
      }
      ok('локално вече не е missing', h.w.llStoreItems[0].missing === false,
        String(h.w.llStoreItems[0].missing));
      ok('двата бутона се върнаха',
        !!btnIn(card(h.doc, 'L1'), '✅ Получено') &&
        !!btnIn(card(h.doc, 'L1'), '⛔ Неполучено'));
      ok('и НЕ е приключил нищо', patchesTo(h, 'loading_lists').length === 0,
        JSON.stringify(h.calls.patch.map(p => p.table)));
    }
  }

  section('е) notifLoadingListsPending НЕ брои missing редовете');
  {
    /* Единственият ред на L1 е заявен като липсващ — за обекта там няма какво
       да се прави, значи картата „товарни листи за получаване" няма място. */
    const items = [
      it_({ id: 'i1', list_id: 'L1', missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-09-02T10:00:00.000Z', store_comment: 'не дойде' })
    ];
    const h = env(STORE, items, [L_SENT], []);
    let seen = 'НЕ Е ВИКАН';
    h.w.notifLoadingListsPending(function (l) { seen = l; });
    await ticks(); await ticks();

    ok('заявката носи missing=eq.false',
      h.calls.get.some(u => /loading_list_items/.test(u) && /missing=eq\.false/.test(u)),
      h.calls.get.filter(u => /loading_list_items/.test(u)).join(' | '));
    ok('и пак received=eq.false',
      h.calls.get.some(u => /loading_list_items/.test(u) && /received=eq\.false/.test(u)),
      h.calls.get.filter(u => /loading_list_items/.test(u)).join(' | '));
    ok('резултатът е празен', seen === null || (Array.isArray(seen) && seen.length === 0),
      JSON.stringify(seen));
    ok('и списъкът със статуси остава status=eq.sent',
      h.calls.get.some(u => /loading_lists/.test(u) && /status=eq\.sent/.test(u)),
      h.calls.get.filter(u => /loading_lists/.test(u)).join(' | '));
  }

  section('е2) Ред, който още ЧАКА — картата излиза');
  {
    const items = [
      it_({ id: 'i1', list_id: 'L1' }),
      it_({ id: 'i2', list_id: 'L1', position: 2, missing: true,
            missing_by: 'Управител Петрич', missing_at: '2026-09-02T10:00:00.000Z' })
    ];
    const h = env(STORE, items, [L_SENT], []);
    let seen = 'НЕ Е ВИКАН';
    h.w.notifLoadingListsPending(function (l) { seen = l; });
    await ticks(); await ticks();
    ok('листът се брои заради чакащия ред',
      Array.isArray(seen) && seen.length === 1 && seen[0].id === 'L1',
      JSON.stringify(seen));
  }

  section('ж) Целият палет наведнъж — един коментар в четирите реда');
  {
    /* Четири документа на ЕДИН физически палет: човекът на рампата вижда една
       липсваща единица и пише обяснението веднъж. */
    const items = [1, 2, 3, 4].map(k => it_({
      id: 'i' + k, position: k, pallet_no: 1, pallet_total: 1,
      purchase_doc: 'D-' + k
    }));
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const grp = h.doc.querySelector('#mod-loading tr[data-pallet-group="1"]');
    ok('заглавният ред на палета е тук', !!grp);
    const b = btnIn(grp, '⛔ Неполучен целия палет');
    if (ok('има бутон за целия палет', !!b, grp && grp.innerHTML.slice(0, 500))) {
      /* Първо БЕЗ коментар. */
      realClick(h.w, b);
      await ticks();
      ok('без коментар — нула PATCH', h.calls.patch.length === 0,
        JSON.stringify(h.calls.patch.map(p => p.table)));
      ok('и червен toast',
        h.calls.toast.some(t => /Опиши какво липсва в коментара/.test(String(t.msg || t))),
        JSON.stringify(h.calls.toast));

      const pc = h.doc.getElementById('ll-pc-L1-1');
      ok('полето за коментар на палета съществува', !!pc);
      ok('фокусът е в него', h.doc.activeElement === pc,
        h.doc.activeElement && h.doc.activeElement.id);

      pc.value = 'палетът не беше на камиона';
      realClick(h.w, btnIn(h.doc.querySelector('#mod-loading tr[data-pallet-group="1"]'),
        '⛔ Неполучен целия палет'));
      await ticks(); await ticks(); await ticks();

      const ip = patchesTo(h, 'loading_list_items');
      if (ok('и четирите реда са patch-нати', ip.length === 4,
        String(ip.length) + ' :: ' + JSON.stringify(ip.map(p => p.url)))) {
        ok('всички с missing:true', ip.every(p => p.body.missing === true),
          JSON.stringify(ip.map(p => p.body.missing)));
        ok('и всички с ЕДИН И СЪЩ коментар',
          ip.every(p => p.body.store_comment === 'палетът не беше на камиона'),
          JSON.stringify(ip.map(p => p.body.store_comment)));
        ok('по един PATCH на ред, без повторения',
          new Set(ip.map(p => p.url)).size === 4, JSON.stringify(ip.map(p => p.url)));
      }
      ok('документите НЕ се затварят', patchesTo(h, 'goods_transit').length === 0,
        JSON.stringify(h.calls.patch.map(p => p.table)));
    }
  }

  section('з) Складът вижда липсата: статус, филтър, колона, преглед');
  {
    const L_PART = Object.assign({}, L_SENT, { id: 'L1', status: 'partial',
      done_at: '2026-09-02T12:00:00.000Z' });
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100', received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T10:00:00.000Z' }),
      it_({ id: 'i2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200',
            missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-09-02T11:00:00.000Z', store_comment: 'палет 2 не дойде' })
    ];
    const h = env(WAREHOUSE, items, [L_PART], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const t0 = h.doc.getElementById('mod-loading').textContent;
    ok('има отделен филтър „Частично (1)"', t0.indexOf('⛔ Частично (1)') >= 0,
      t0.slice(0, 500));
    /* Броячът на „Приключени" трябва да СЪВПАДА с това, което филтърът
       показва — done + partial. Разминат ли се, чипът обещава лист, който
       после го няма. */
    ok('и „Приключени" брои същия лист', t0.indexOf('✅ Приключени (1)') >= 0,
      t0.slice(0, 500));

    /* Филтърът „open" (по подразбиране) НЕ показва приключения с липси. */
    ok('по подразбиране листът не е в „Текущи"',
      h.w.llVisibleLists().length === 0,
      JSON.stringify(h.w.llVisibleLists().map(l => l.status)));
    h.w.llSetStatusFilter('done');
    ok('„Приключени" го показва', h.w.llVisibleLists().length === 1);
    h.w.llSetStatusFilter('partial');
    ok('и „Частично" също', h.w.llVisibleLists().length === 1);
    ok('баджът в реда казва „Частично приключен"',
      h.doc.getElementById('mod-loading').textContent.indexOf('Частично приключен') >= 0,
      h.doc.getElementById('mod-loading').textContent.slice(0, 500));

    h.w.llOpenView('L1');
    const t = h.doc.getElementById('mod-loading').textContent;
    ok('прегледът показва маркера „Неполучено"', t.indexOf('⛔ Неполучено') >= 0,
      t.slice(0, 600));
    ok('и кой го е заявил', t.indexOf('Управител Петрич') >= 0);
    ok('и коментарът на обекта', t.indexOf('палет 2 не дойде') >= 0, t.slice(0, 800));
    ok('обобщението има колона „Неполучени"', t.indexOf('Неполучени') >= 0);
    ok('редът в прегледа е червен',
      h.doc.querySelectorAll('#mod-loading tr[data-missing="1"]').length === 1,
      String(h.doc.querySelectorAll('#mod-loading tr[data-missing]').length));

    const sum = h.w.llSummaryByStore(items);
    ok('llSummaryByStore брои 1 липса', sum[0].missing === 1, JSON.stringify(sum[0]));
    ok('llCounts също', h.w.llCounts(items).missing === 1,
      JSON.stringify(h.w.llCounts(items)));
  }

  section('и) Ръчният бутон на склада с липси записва partial, не done');
  {
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100', received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T10:00:00.000Z' }),
      it_({ id: 'i2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200',
            missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-09-02T11:00:00.000Z', store_comment: 'няма го' })
    ];
    const h = env(WAREHOUSE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');

    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '✅ Приключи'));
    await ticks(); await ticks();
    const lp = patchesTo(h, 'loading_lists');
    if (ok('листът е patch-нат', lp.length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('status:partial', lp[0].body.status === 'partial', JSON.stringify(lp[0].body));
    }
  }

  section('и2) Ръчният бутон БЕЗ липси си остава done');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', received: true,
                         received_by: 'Управител Петрич',
                         received_at: '2026-09-02T10:00:00.000Z' })];
    const h = env(WAREHOUSE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '✅ Приключи'));
    await ticks(); await ticks();
    const lp = patchesTo(h, 'loading_lists');
    if (ok('листът е patch-нат', lp.length === 1)) {
      ok('status:done', lp[0].body.status === 'done', JSON.stringify(lp[0].body));
    }
  }

  section('к) Гейтът за обекта пуска и „partial" — картата не изчезва');
  {
    const L_PART = Object.assign({}, L_SENT, { status: 'partial',
      done_at: '2026-09-02T12:00:00.000Z' });
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', missing: true,
                         missing_by: 'Управител Петрич',
                         missing_at: '2026-09-02T11:00:00.000Z',
                         store_comment: 'не дойде' })];
    const h = env(STORE, items, [L_PART], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('заявката иска sent, done И partial',
      h.calls.get.some(u => /loading_lists/.test(u) && /status=in\.\(sent,done,partial\)/.test(u)),
      h.calls.get.filter(u => /loading_lists/.test(u)).join(' | '));
    ok('картата се рендира', !!card(h.doc, 'L1'),
      h.doc.getElementById('mod-loading').innerHTML.slice(0, 200));
    /* Приключеният лист е история — свит по подразбиране. */
    ok('и е свита', h.w.llCollapsed['L1'] === true, JSON.stringify(h.w.llCollapsed));
    realClick(h.w, btnIn(card(h.doc, 'L1'), '▼ Разгъни'));
    ok('обектът вижда кой и кога е заявил липсата',
      card(h.doc, 'L1').textContent.indexOf('⛔ Управител Петрич') >= 0,
      card(h.doc, 'L1').textContent.slice(0, 300));
    /* Коментарът е в <input>, не в текста — textContent не го вижда и
       проверка по него би минавала и с празно поле. Полето остава
       редактируемо и СЛЕД приключването по същата причина, по която е
       редактируемо и след „получено": какво точно липсва се доуточнява при
       подреждането на стоката, не на рампата. */
    const sc = h.doc.getElementById('ll-sc-i1');
    ok('коментарът му стои в полето', !!sc && sc.value === 'не дойде',
      sc && JSON.stringify(sc.value));
    ok('„Приключи приемането" го няма — листът вече е приключен',
      !btnIn(card(h.doc, 'L1'), '🏁 Приключи приемането'));
    ok('но „↩ Отмени" го има — стоката може да дойде с по-късен курс',
      !!btnIn(card(h.doc, 'L1'), '↩ Отмени'));
  }

  section('л) Печат: „НЕПОЛУЧЕНО" вместо празно каре');
  {
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100' }),
      it_({ id: 'i2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200',
            missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-09-02T11:00:00.000Z', store_comment: 'кашонът липсва' })
    ];
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1', 'Петрич');

    const pr = h.doc.getElementById('mod-print');
    ok('маркерът е в бланката', pr.textContent.indexOf('НЕПОЛУЧЕНО') >= 0,
      pr.textContent.slice(0, 600));
    ok('и коментарът на обекта', pr.textContent.indexOf('кашонът липсва') >= 0);
    ok('чакащият ред пак е с празно каре',
      pr.querySelectorAll('.lp-box').length === 1,
      String(pr.querySelectorAll('.lp-box').length));
    ok('маркерът е СОБСТВЕН клас, не lp-box',
      pr.querySelectorAll('.lp-miss').length === 1,
      String(pr.querySelectorAll('.lp-miss').length));
    /* CLAUDE.md т.12 — печатът наследява глобалния CSS на index.html, а jsdom
       не смята лейаут. Затова правилото се заковава като текст. */
    ok('.lp-miss е черно на сиво (черно-бял принтер)',
      /\.lp-miss\{[^}]*color:#000/.test(pr.innerHTML) &&
      /\.lp-miss\{[^}]*background:#ddd/.test(pr.innerHTML));
    ok('коментарът се пречупва (.lp-mtag), за да не излезе от клетката',
      /\.lp-mtag\{[^}]*white-space:normal/.test(pr.innerHTML) &&
      /\.lp-mtag\{[^}]*overflow-wrap:break-word/.test(pr.innerHTML));
    ok('.lp-tag си остава nowrap — кратките етикети не се пречупват',
      /\.lp-tag\{[^}]*white-space:nowrap/.test(pr.innerHTML));
  }

  section('м) „Всичко получено" прескача заявените липси');
  {
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100' }),
      it_({ id: 'i2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200',
            missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-09-02T11:00:00.000Z', store_comment: 'няма го' })
    ];
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Всичко получено'));
    await ticks(); await ticks(); await ticks();

    const ip = patchesTo(h, 'loading_list_items');
    if (ok('patch-нат е точно един ред', ip.length === 1,
      JSON.stringify(ip.map(p => p.url)))) {
      ok('и това е чакащият, не липсващият', /id=eq\.i1/.test(ip[0].url), ip[0].url);
    }
    ok('липсващият ред НЕ е станал received',
      h.w.llStoreItems.find(x => x.id === 'i2').received !== true,
      JSON.stringify(h.w.llStoreItems.find(x => x.id === 'i2')));
  }

  section('н) llMarkReceived по missing ред — отказва с обяснение');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', missing: true,
                         missing_by: 'Управител Петрич',
                         missing_at: '2026-09-02T11:00:00.000Z',
                         store_comment: 'няма го' })];
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llMarkReceived('i1');
    await ticks();
    ok('нула PATCH', h.calls.patch.length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('и обяснение защо',
      h.calls.toast.some(t => /отмени го първо/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
  }

  section('о) Провал при записа — редът НЕ се показва като липсващ');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100' })];
    const h = env(STORE, items, [L_SENT], [],
      { fail: { PATCH: /loading_list_items/ } });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.doc.getElementById('ll-sc-i1').value = 'не дойде';
    realClick(h.w, btnIn(card(h.doc, 'L1'), '⛔ Неполучено'));
    await ticks(); await ticks();

    ok('червен toast за провала',
      h.calls.toast.some(t => /Грешка при отмятане/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    ok('локално НЕ е missing', h.w.llStoreItems[0].missing !== true,
      String(h.w.llStoreItems[0].missing));
    ok('и на екрана няма червен ред',
      h.doc.querySelectorAll('#mod-loading tr[data-missing="1"]').length === 0,
      String(h.doc.querySelectorAll('#mod-loading tr[data-missing]').length));
  }

  report();
})();
