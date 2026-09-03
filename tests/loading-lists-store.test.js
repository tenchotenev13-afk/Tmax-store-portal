/* Товарни листи — МАГАЗИНСКА страна: отмятане на получените палети и
   автозатваряне на стоковия документ в „Стока на път".

   Досега затварянето на документа беше втора ръчна стъпка в друг таб и по
   правило не се правеше — документите стояха pending с месеци. Сега
   отмятането на ПОСЛЕДНИЯ палет по документа го затваря само.

   Двата въпроса, които тестът пази, са точно тези, в които е лесно да се
   сбърка тихо:
     - „всички ли са получени" — един палет от пет не затваря документа;
     - status=eq.pending във филтъра — без него PATCH-ът би прегазил и вече
       приетите, и отказаните редове на същия документ.

   Пускане:  node tests/loading-lists-store.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';

const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const OTHER = { email: 'gd@temax.bg', display_name: 'Управител Гоце Делчев',
                role: 'manager', store_name: 'Гоце Делчев', assigned_stores: [] };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };

const L_SENT  = { id: 'L1', warehouse: WH, list_date: '2026-09-02', status: 'sent',
                  executed_by: 'Иван', comment: '', created_by: 'Склад Търговище',
                  created_at: '2026-09-02T06:00:00.000Z', sent_at: '2026-09-02T07:00:00.000Z', done_at: null };
const L_DRAFT = { id: 'L2', warehouse: WH, list_date: '2026-09-03', status: 'draft',
                  executed_by: null, comment: '', created_by: 'Склад Търговище',
                  created_at: '2026-09-03T06:00:00.000Z', sent_at: null, done_at: null };
/* Втори ИЗПРАТЕН лист — за да се провери, че „Всичко получено" не прескача
   границата на своята карта. */
const L_SENT2 = { id: 'L3', warehouse: WH, list_date: '2026-09-01', status: 'sent',
                  executed_by: 'Петър', comment: '', created_by: 'Склад Търговище',
                  created_at: '2026-09-01T06:00:00.000Z', sent_at: '2026-09-01T07:00:00.000Z', done_at: null };

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet',
    pallet_no: 1, pallet_total: 1, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    created_at: '2026-09-02T06:00:00.000Z'
  }, o);
}

/* Мъничък сървър: прилага записаните PATCH-ове върху редовете, преди да ги
   върне. Без това llAutoDoneList() пита сървъра и получава състоянието
   ОТПРЕДИ отмятането — тоест сценарий (ж) не би бил проверка на нищо. */
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
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: user,
    confirm: opts.confirm !== undefined ? opts.confirm : true,
    fail: opts.fail,
    data: {
      loading_list_items: function (url) {
        let rows = applyPatches((items || []).map(r => Object.assign({}, r)), 'loading_list_items');
        rows = pick(url, /store_name=eq\.([^&]*)/, rows, 'store_name');
        rows = pick(url, /list_id=eq\.([^&]*)/, rows, 'list_id');
        return rows;
      },
      loading_lists: function (url) {
        let rows = applyPatches((lists || []).map(r => Object.assign({}, r)), 'loading_lists');
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const s = ids[1].split(','); rows = rows.filter(r => s.indexOf(String(r.id)) >= 0); }
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); rows = rows.filter(r => s.indexOf(r.status) >= 0); }
        return rows;
      },
      goods_transit: function (url) {
        let rows = (transit || []).map(r => Object.assign({}, r));
        rows = pick(url, /purchase_doc=eq\.([^&]*)/, rows, 'purchase_doc');
        rows = pick(url, /store_name=eq\.([^&]*)/, rows, 'store_name');
        rows = pick(url, /[?&]status=eq\.([^&]*)/, rows, 'status');
        return rows;
      },
      users: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  ref = h;
  return h;
}

const card = (doc, id) => doc.getElementById('ll-card-' + id);
/* „Няма такъв бутон" се проверява САМО по <button> — текстът „Получено"
   стои и в заглавието на колоната, и в баджа „получени n/N". */
function btnIn(root, text) { return root ? btn(root, text) : null; }
function patchesTo(h, table) { return h.calls.patch.filter(p => p.table === table); }

(async function () {

  section('а) Обектът вижда само своите редове и само от изпратени листи');
  {
    const items = [
      it_({ id: 'i1', list_id: 'L1', position: 1, purchase_doc: 'D-100', store_name: 'Петрич' }),
      it_({ id: 'i2', list_id: 'L1', position: 2, purchase_doc: 'D-200', store_name: 'Гоце Делчев' }),
      it_({ id: 'i3', list_id: 'L2', position: 1, purchase_doc: 'D-300', store_name: 'Петрич' })
    ];
    const h = env(STORE, items, [L_SENT, L_DRAFT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    ok('заявката носи филтъра по обект',
      h.calls.get.some(u => /loading_list_items/.test(u) && /store_name=eq\./.test(u)),
      h.calls.get.filter(u => /loading_list_items/.test(u)).join(' | '));
    ok('заявката за листите иска само sent/done',
      h.calls.get.some(u => /loading_lists/.test(u) && /status=in\.\(sent,done\)/.test(u)),
      h.calls.get.filter(u => /loading_lists/.test(u)).join(' | '));

    const wrap = h.doc.getElementById('mod-loading');
    ok('картата на изпратения лист се рендира', !!card(h.doc, 'L1'));
    ok('черновата НЕ се показва', !card(h.doc, 'L2'), wrap.innerHTML.indexOf('L2'));
    ok('редът от черновата го няма', wrap.innerHTML.indexOf('D-300') < 0);
    ok('чуждият ред го няма', wrap.innerHTML.indexOf('D-200') < 0);
    ok('моят ред е тук', wrap.innerHTML.indexOf('D-100') >= 0);
    ok('броячът е получени 0/1', wrap.textContent.indexOf('получени 0/1') >= 0,
      wrap.textContent.slice(0, 200));
  }

  section('б) Един палет от два — документът НЕ се затваря');
  {
    const items = [
      it_({ id: 'i1', list_id: 'L1', position: 1, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-100' }),
      it_({ id: 'i2', list_id: 'L1', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-100' })
    ];
    const h = env(STORE, items, [L_SENT],
      [{ id: 't1', purchase_doc: 'D-100', store_name: 'Петрич', status: 'pending' }]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const b = btnIn(card(h.doc, 'L1'), '✅ Получено');
    if (ok('има бутон „Получено"', !!b)) {
      realClick(h.w, b);
      await ticks(); await ticks(); await ticks();

      const ip = patchesTo(h, 'loading_list_items');
      if (ok('редът е patch-нат', ip.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)))) {
        ok('received:true', ip[0].body.received === true, JSON.stringify(ip[0].body));
        ok('received_by е потребителят', ip[0].body.received_by === 'Управител Петрич',
          JSON.stringify(ip[0].body.received_by));
        ok('received_at е попълнено', !!ip[0].body.received_at);
      }
      ok('goods_transit НЕ е patch-нат — вторият палет още не е получен',
        patchesTo(h, 'goods_transit').length === 0,
        JSON.stringify(h.calls.patch.map(p => p.table)));
      ok('и листът НЕ е приключен', patchesTo(h, 'loading_lists').length === 0);
    }
  }

  section('в) Последният палет по документа го затваря — с точния филтър');
  {
    const items = [
      it_({ id: 'i1', list_id: 'L1', position: 1, pallet_no: 1, pallet_total: 2,
            purchase_doc: 'D-100', received: true, received_by: 'Управител Петрич',
            received_at: '2026-09-02T10:00:00.000Z' }),
      it_({ id: 'i2', list_id: 'L1', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-100' }),
      /* Ред за друг обект — листът НЕ бива да се приключва заради Петрич. */
      it_({ id: 'i9', list_id: 'L1', position: 3, purchase_doc: 'D-900', store_name: 'Гоце Делчев' })
    ];
    const h = env(STORE, items, [L_SENT],
      [{ id: 't1', purchase_doc: 'D-100', store_name: 'Петрич', status: 'pending' }]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks();

    const gp = patchesTo(h, 'goods_transit');
    if (ok('goods_transit е patch-нат', gp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('филтърът носи документа', /purchase_doc=eq\.D-100/.test(gp[0].url), gp[0].url);
      ok('филтърът носи обекта',
        /store_name=eq\.(Петрич|%D0%9F)/.test(decodeURIComponent(gp[0].url)) ||
        /store_name=eq\./.test(gp[0].url), gp[0].url);
      ok('филтърът носи status=eq.pending', /status=eq\.pending/.test(gp[0].url), gp[0].url);
      ok('status става received', gp[0].body.status === 'received', JSON.stringify(gp[0].body));
      ok('updated_by по конвенцията на transit.js',
        gp[0].body.updated_by === 'Управител Петрич', JSON.stringify(gp[0].body.updated_by));
      ok('updated_at е попълнено', !!gp[0].body.updated_at);
    }
    ok('съобщението сочи документа',
      h.calls.toast.some(t => /📦 Стоков документ D-100 е приет/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    ok('листът НЕ е приключен — чуждият ред още не е получен',
      patchesTo(h, 'loading_lists').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
  }

  section('г) clears_doc бие purchase_doc');
  {
    const items = [
      it_({ id: 'i1', list_id: 'L1', purchase_doc: 'D-100', clears_doc: 'D-777' })
    ];
    const h = env(STORE, items, [L_SENT], [
      { id: 't1', purchase_doc: 'D-100', store_name: 'Петрич', status: 'pending' },
      { id: 't7', purchase_doc: 'D-777', store_name: 'Петрич', status: 'pending' }
    ]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('редът показва „изчиства"',
      card(h.doc, 'L1').textContent.indexOf('изчиства D-777') >= 0,
      card(h.doc, 'L1').textContent.slice(0, 250));

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks();

    const gp = patchesTo(h, 'goods_transit');
    if (ok('точно един PATCH', gp.length === 1, JSON.stringify(gp.map(p => p.url)))) {
      ok('затваря D-777', /purchase_doc=eq\.D-777/.test(gp[0].url), gp[0].url);
      ok('и НЕ затваря D-100', !/purchase_doc=eq\.D-100/.test(gp[0].url), gp[0].url);
    }
    ok('llItemDocKey() връща clears_doc',
      h.w.llItemDocKey({ purchase_doc: 'A', clears_doc: 'B' }) === 'B');
    ok('и purchase_doc, когато clears_doc липсва',
      h.w.llItemDocKey({ purchase_doc: 'A', clears_doc: null }) === 'A');
  }

  section('д) Ред без документ — нищо не се затваря');
  {
    const items = [it_({ id: 'i1', list_id: 'L1', kind: 'bulk', pallet_no: null,
                         pallet_total: null, purchase_doc: null })];
    const h = env(STORE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('стоковата е показана като „без"',
      card(h.doc, 'L1').textContent.indexOf('без') >= 0);

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks();
    ok('нула PATCH към goods_transit', patchesTo(h, 'goods_transit').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('нула GET към goods_transit',
      !h.calls.get.some(u => /goods_transit/.test(u)),
      h.calls.get.join(' | '));
    ok('llItemDocKey() е null', h.w.llItemDocKey(items[0]) === null);
  }

  section('е) Провал при затварянето — палетът ОСТАВА получен, но с маркер');
  {
    const items = [it_({ id: 'i1', list_id: 'L1', purchase_doc: 'D-100' })];
    const h = env(STORE, items, [L_SENT],
      [{ id: 't1', purchase_doc: 'D-100', store_name: 'Петрич', status: 'pending' }],
      { fail: { PATCH: /goods_transit/ } });
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks();

    ok('редът пак е отметнат като получен',
      patchesTo(h, 'loading_list_items').some(p => p.body.received === true),
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('локално също е received', h.w.llStoreItems[0].received === true);
    ok('червен toast за документа',
      h.calls.toast.some(t => /Документ D-100 НЕ беше затворен/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    ok('НЕ казва, че документът е приет',
      !h.calls.toast.some(t => /е приет в Стока на път/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    /* Маркерът се търси по data-атрибут, не по текст: думата „документ"
       стои и в заглавието на колоната. */
    ok('редът носи data-doc-failed',
      h.doc.querySelectorAll('#mod-loading tr[data-doc-failed="1"]').length === 1,
      String(h.doc.querySelectorAll('#mod-loading tr[data-doc-failed]').length));
    ok('llDocFailures помни точно този ред', h.w.llDocFailures['i1'] === true,
      JSON.stringify(h.w.llDocFailures));
  }

  section('ж) Последният ред на ЦЕЛИЯ лист го приключва');
  {
    const items = [
      it_({ id: 'i1', list_id: 'L1', position: 1, purchase_doc: 'D-100', store_name: 'Петрич' }),
      it_({ id: 'i9', list_id: 'L1', position: 2, purchase_doc: 'D-900', store_name: 'Гоце Делчев',
            received: true, received_by: 'Управител Гоце Делчев',
            received_at: '2026-09-02T09:00:00.000Z' })
    ];
    const h = env(STORE, items, [L_SENT],
      [{ id: 't1', purchase_doc: 'D-100', store_name: 'Петрич', status: 'pending' }]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('обектът вижда само своя ред', h.w.llStoreItems.length === 1,
      JSON.stringify(h.w.llStoreItems.map(i => i.id)));

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks(); await ticks();

    const lp = patchesTo(h, 'loading_lists');
    if (ok('листът е приключен', lp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('status:done', lp[0].body.status === 'done', JSON.stringify(lp[0].body));
      ok('done_at е попълнено', !!lp[0].body.done_at);
      ok('URL сочи точния лист', /id=eq\.L1/.test(lp[0].url), lp[0].url);
    }
    ok('проверката е СЪС ЗАЯВКА за целия лист, не от видимите редове',
      h.calls.get.some(u => /loading_list_items/.test(u) && /list_id=eq\.L1/.test(u)),
      h.calls.get.filter(u => /loading_list_items/.test(u)).join(' | '));
  }

  section('з) Другият обект вижда своето и отмята само своето');
  {
    const items = [
      it_({ id: 'i1', list_id: 'L1', position: 1, purchase_doc: 'D-100', store_name: 'Петрич' }),
      it_({ id: 'i8', list_id: 'L1', position: 2, purchase_doc: 'D-800', store_name: 'Гоце Делчев' }),
      it_({ id: 'i9', list_id: 'L1', position: 3, purchase_doc: 'D-900', store_name: 'Гоце Делчев' }),
      /* Същият обект, ДРУГ лист — бутонът на L1 няма работа с този ред. */
      it_({ id: 'i7', list_id: 'L3', position: 1, purchase_doc: 'D-700', store_name: 'Гоце Делчев' })
    ];
    const h = env(OTHER, items, [L_SENT, L_SENT2], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const c = card(h.doc, 'L1');
    ok('редовете на Петрич не се показват', c.textContent.indexOf('D-100') < 0,
      c.textContent.slice(0, 250));
    ok('своите два реда са тук',
      c.textContent.indexOf('D-800') >= 0 && c.textContent.indexOf('D-900') >= 0);
    ok('броячът е получени 0/2', c.textContent.indexOf('получени 0/2') >= 0);

    realClick(h.w, btnIn(c, '✅ Всичко получено'));
    await ticks(); await ticks(); await ticks();

    const ip = patchesTo(h, 'loading_list_items');
    ok('точно два PATCH', ip.length === 2, JSON.stringify(ip.map(p => p.url)));
    ok('и двата са на редовете на този обект',
      ip.every(p => /id=eq\.(i8|i9)/.test(p.url)), JSON.stringify(ip.map(p => p.url)));
    ok('нито един не е на чуждия ред',
      !ip.some(p => /id=eq\.i1/.test(p.url)), JSON.stringify(ip.map(p => p.url)));
    ok('и нито един не е на ред от ДРУГИЯ лист',
      !ip.some(p => /id=eq\.i7/.test(p.url)), JSON.stringify(ip.map(p => p.url)));
    ok('другата карта е налице и още е неполучена',
      !!card(h.doc, 'L3') && card(h.doc, 'L3').textContent.indexOf('получени 0/1') >= 0,
      card(h.doc, 'L3') && card(h.doc, 'L3').textContent.slice(0, 160));
    ok('received_by е този потребител',
      ip.every(p => p.body.received_by === 'Управител Гоце Делчев'),
      JSON.stringify(ip.map(p => p.body.received_by)));
  }

  section('и) Частична пратка — палетът е приет, документът остава чакащ');
  {
    /* Двата палета по документа са получени — единствената разлика спрямо
       сценарий (в) е отметката „частично". */
    const items = [
      it_({ id: 'i1', list_id: 'L1', position: 1, pallet_no: 1, pallet_total: 2,
            purchase_doc: 'D-100', partial: true, received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T10:00:00.000Z' }),
      it_({ id: 'i2', list_id: 'L1', position: 2, pallet_no: 2, pallet_total: 2,
            purchase_doc: 'D-100', partial: true })
    ];
    const h = env(STORE, items, [L_SENT],
      [{ id: 't1', purchase_doc: 'D-100', store_name: 'Петрич', status: 'pending' }]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const c = card(h.doc, 'L1');
    ok('редът носи маркер „частично"',
      c.querySelectorAll('[data-partial="1"]').length >= 1,
      String(c.querySelectorAll('[data-partial]').length));

    realClick(h.w, btnIn(c, '✅ Получено'));
    await ticks(); await ticks(); await ticks();

    ok('палетът Е отметнат',
      patchesTo(h, 'loading_list_items').some(p => p.body.received === true),
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('goods_transit НЕ е патчнат, макар всички палети да са получени',
      patchesTo(h, 'goods_transit').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('не се пита и със заявка — решението е локално',
      !h.calls.get.some(u => /goods_transit/.test(u)), h.calls.get.join(' | '));
    ok('съобщението обяснява защо',
      h.calls.toast.some(t => /документ D-100 остава чакащ \(частична пратка\)/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    ok('и НЕ казва, че документът е приет',
      !h.calls.toast.some(t => /е приет в Стока на път/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
  }

  section('й) Същите редове БЕЗ отметката — документът се затваря');
  {
    /* Огледалото на (й): единствената разлика е partial:false. Без този
       сценарий проверката отгоре щеше да минава и срещу код, който изобщо
       не затваря документи. */
    const items = [
      it_({ id: 'i1', list_id: 'L1', position: 1, pallet_no: 1, pallet_total: 2,
            purchase_doc: 'D-100', partial: false, received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T10:00:00.000Z' }),
      it_({ id: 'i2', list_id: 'L1', position: 2, pallet_no: 2, pallet_total: 2,
            purchase_doc: 'D-100', partial: false })
    ];
    const h = env(STORE, items, [L_SENT],
      [{ id: 't1', purchase_doc: 'D-100', store_name: 'Петрич', status: 'pending' }]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('няма маркер „частично"',
      card(h.doc, 'L1').querySelectorAll('[data-partial]').length === 0,
      String(card(h.doc, 'L1').querySelectorAll('[data-partial]').length));

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks();

    ok('goods_transit Е патчнат', patchesTo(h, 'goods_transit').length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('съобщението е за приет документ',
      h.calls.toast.some(t => /📦 Стоков документ D-100 е приет/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
  }

  section('к) Отметката е на ДОКУМЕНТА, не на реда (редактор на склада)');
  {
    const h = env(WAREHOUSE, [], [], []);
    h.w.llStores = ['Петрич'];
    h.w.llDraft = { list_date: '2026-09-03', executed_by: '', comment: '', items: [
      { id: null, kind: 'pallet', pallet_no: 1, pallet_total: null, purchase_doc: 'D-1',
        clears_doc: null, store_name: 'Петрич', warehouse_comment: '', partial: false, _docKey: 'k1' },
      { id: null, kind: 'pallet', pallet_no: 2, pallet_total: null, purchase_doc: 'D-1',
        clears_doc: null, store_name: 'Петрич', warehouse_comment: '', partial: false, _docKey: 'k1' },
      { id: null, kind: 'pallet', pallet_no: 3, pallet_total: null, purchase_doc: 'D-2',
        clears_doc: null, store_name: 'Петрич', warehouse_comment: '', partial: false, _docKey: 'k2' }
    ]};
    h.w.llPendingDocs = [];
    h.w.llView = 'edit';
    h.w.llSetRowPartial(0, true);
    ok('и двата реда на D-1 станаха частични',
      h.w.llDraft.items[0].partial === true && h.w.llDraft.items[1].partial === true,
      JSON.stringify(h.w.llDraft.items.map(i => i.partial)));
    ok('редът на ДРУГИЯ документ не е пипнат',
      h.w.llDraft.items[2].partial === false,
      JSON.stringify(h.w.llDraft.items.map(i => i.partial)));
    h.w.llSetRowPartial(1, false);
    ok('махането също важи за целия документ',
      h.w.llDraft.items.every(i => i.partial === false),
      JSON.stringify(h.w.llDraft.items.map(i => i.partial)));

    /* И най-важното: отметката трябва да СТИГНЕ до базата. Без тази проверка
       целият сценарий (и) минава и срещу код, който я забравя при записа —
       щеше да работи до първото презареждане на страницата. */
    h.w.llSetRowPartial(0, true);
    const rows = h.w.llBuildItemRows('L-NEW', h.w.llDraft.items);
    ok('llBuildItemRows() носи partial за отметнатия документ',
      rows[0].partial === true && rows[1].partial === true,
      JSON.stringify(rows.map(r => r.partial)));
    ok('и false за другия', rows[2].partial === false,
      JSON.stringify(rows.map(r => r.partial)));

    /* И обратната посока: отметката трябва да се ЧЕТЕ при редакция. Забрави ли
       се тук, складът отмята „частично", записва, отваря пак — квадратчето е
       празно и следващият запис мълчаливо изтрива отметката. */
    const saved = [
      it_({ id: 's1', list_id: 'LD', position: 1, pallet_no: 1, purchase_doc: 'D-1', partial: true }),
      it_({ id: 's2', list_id: 'LD', position: 2, pallet_no: 2, purchase_doc: 'D-2', partial: false })
    ];
    h.w.llLists = [{ id: 'LD', warehouse: WH, list_date: '2026-09-03', status: 'draft',
                     executed_by: '', comment: '' }];
    h.w.llItems = saved;
    h.w.llOpenEdit('LD');
    ok('редакцията чете partial от записания ред',
      h.w.llDraft.items[0].partial === true && h.w.llDraft.items[1].partial === false,
      JSON.stringify(h.w.llDraft.items.map(i => i.partial)));
  }

  section('л) Праг от 20 палета при създаване — отказът връща стойността');
  {
    const h = env(WAREHOUSE, [], [], [], { confirm: false });
    h.w.llView = 'edit';
    h.w.llCurrentId = null;
    h.w.llStores = ['Петрич', 'Гоце Делчев'];
    h.w.llDraft = { list_date: '2026-09-03', executed_by: 'Иван', comment: '', items: [] };
    h.w.llPendingDocs = [{ purchase_doc: 'D-100', store_name: 'Петрич',
                           doc_date: '2026-09-01', items: 28, checked: false, pallet_spec: '2' }];

    if (guard('llSetDocPallet(1-25) при confirm=false не хвърля',
      () => h.w.llSetDocPallet(0, '1-25'))) {
      ok('стойността се връща на предишната', h.w.llPendingDocs[0].pallet_spec === '2',
        String(h.w.llPendingDocs[0].pallet_spec));
      ok('нула редове са материализирани', h.w.llDraft.items.length === 0,
        String(h.w.llDraft.items.length));
    }
    /* Под прага изобщо не пита. */
    h.w.llSetDocPallet(0, '1-5');
    ok('5 палета минават без въпрос', h.w.llPendingDocs[0].pallet_spec === '1-5',
      String(h.w.llPendingDocs[0].pallet_spec));

    h.w.confirm = () => true;
    h.w.llSetDocPallet(0, '1-25');
    ok('с потвърждение 25 се приемат', h.w.llPendingDocs[0].pallet_spec === '1-25',
      String(h.w.llPendingDocs[0].pallet_spec));
  }

  section('м) Складът вижда кой и кога е получил (колоната от стъпка 2)');
  {
    const items = [
      it_({ id: 'i1', list_id: 'L1', purchase_doc: 'D-100', received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T10:00:00.000Z' })
    ];
    const h = env(WAREHOUSE, items, [L_SENT], []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    const t = h.doc.getElementById('mod-loading').textContent;
    ok('името на приемача е в прегледа', t.indexOf('Управител Петрич') >= 0, t.slice(0, 400));
    ok('и датата на приемане', t.indexOf('02.09.2026') >= 0, t.slice(0, 400));
    ok('обобщението брои получените', t.indexOf('1/1') >= 0, t.slice(0, 400));
  }

  report();
})();
