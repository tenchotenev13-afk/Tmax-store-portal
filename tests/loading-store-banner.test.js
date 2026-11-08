/* Товарни листи — банерът на обекта „📦 N реда от товарни листи … чакат
   отговор" (08.11.2026, по модела на Стока на път, 8191625).

   ПОВОД (чатът, 08.11, само четене): в листи със status='sent' — 137 реда на
   8 обекта без received и без missing, най-старият лист изпратен 05.10.
   В Стока на път обектът вече вижда такъв банер; в Товарни листи — не.

   ТВЪРДЕНИЯТА (реалният ред от index.html, loadLoadingLists → llLoadStoreSide):
   1. N реда в три изпратени листа с разбъркани sent_at → точният текст и
      най-ранният sent_at (не първият, не последният лист в масива).
   2. Етикетите в банера = текста на бутоните на реда (LL_RECV_LABEL /
      LL_MISS_LABEL), а броят = броя бутони „✅ Получено" на екрана.
   3. Не се броят: обработените (received / missing), редовете от чернова
      (не идват изобщо) и от приключен лист (done / partial), чуждият обект.
   4. 1 ред — единствено число, „(от дд.мм)"; без sent_at — без скобите.
   5. 0 чакащи → няма банер.
   6. Склад, admin и глобален профил (контролинг) → няма банер.
   7. Истински клик „✅ Получено" → броят пада с 1.

   МУТАЦИИ (ръчно, 08.11.2026 — всяка пада): M1 датата от най-новия лист;
   M2 брои всеки статус на лист (и draft/done); M3 банерът и на склада
   (без llCanEdit гейта); M4 етикетите на ръка с друг текст.

   Пускане:  node tests/loading-store-banner.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';
const ME = 'Севлиево';
const STORE = { email: 'sevlievo@temax.bg', display_name: 'Управител Севлиево', role: 'manager', store_name: ME, assigned_stores: [] };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const ACC = { email: 'c@temax.bg', display_name: 'Контролинг', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] };

function list(id, status, sentAt) {
  return { id: id, warehouse: WH, list_date: (sentAt || '2026-10-01').slice(0, 10), status: status,
    executed_by: 'Иван', comment: '', created_by: 'Склад Търговище',
    created_at: '2026-09-01T06:00:00.000Z', sent_at: sentAt, done_at: null };
}
let seq = 0;
function it_(o) {
  seq++;
  return Object.assign({ id: 'i' + seq, list_id: 'L1', position: seq, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: 'D-' + seq, clears_doc: null, store_name: ME, warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null, missing: false,
    approval_status: null, created_at: '2026-09-02T06:00:00.000Z' }, o);
}

function env(user, items, lists) {
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
    user: user, confirm: true,
    data: {
      loading_list_items: function (url) {
        let rows = applyPatches(items.map(r => Object.assign({}, r)), 'loading_list_items');
        rows = pick(url, /store_name=eq\.([^&]*)/, rows, 'store_name');
        rows = pick(url, /list_id=eq\.([^&]*)/, rows, 'list_id');
        return rows;
      },
      loading_lists: function (url) {
        let rows = applyPatches(lists.map(r => Object.assign({}, r)), 'loading_lists');
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const s = ids[1].split(','); rows = rows.filter(r => s.indexOf(String(r.id)) >= 0); }
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); rows = rows.filter(r => s.indexOf(r.status) >= 0); }
        return rows;
      },
      goods_transit: [], users: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  ref = h;
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 12); i++) await ticks(); }
async function open(user, items, lists) {
  const h = env(user, items, lists);
  if (!guard('loadLoadingLists не хвърля', () => h.w.loadLoadingLists())) return null;
  await settle();
  return h;
}
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const banner = h => h.doc.getElementById('ll-wait-note');
const recvBtns = h => Array.from(h.doc.querySelectorAll('#mod-loading button')).filter(b => /llMarkReceived\(/.test(b.getAttribute('onclick') || ''));
const missBtns = h => Array.from(h.doc.querySelectorAll('#mod-loading button')).filter(b => /llMarkMissing\(/.test(b.getAttribute('onclick') || ''));

/* Три изпратени листа: най-старият (05.10) е ПО СРЕДАТА, най-новият (20.10)
   — първи. Плюс чернова (по-стара), приключени done и partial (по-стари) и
   чужд обект — нищо от тях не бива да се брои, нито да дава датата. */
function fixture() {
  seq = 0;
  const lists = [
    list('L1', 'sent', '2026-10-20T08:00:00.000Z'),
    list('L2', 'sent', '2026-10-05T07:30:00.000Z'),
    list('L3', 'sent', '2026-10-12T09:00:00.000Z'),
    list('LD', 'draft', null),
    list('LX', 'done', '2026-09-10T07:00:00.000Z'),
    list('LP', 'partial', '2026-09-15T07:00:00.000Z')
  ];
  const items = [
    it_({ list_id: 'L1' }), it_({ list_id: 'L1' }), it_({ list_id: 'L1', received: true, received_by: 'Севлиево' }),
    it_({ list_id: 'L2' }), it_({ list_id: 'L2', missing: true, missing_by: 'Севлиево' }),
    it_({ list_id: 'L3' }), it_({ list_id: 'L3' }), it_({ list_id: 'L3', store_name: 'Габрово' }),
    it_({ list_id: 'LD' }), it_({ list_id: 'LD' }),
    it_({ list_id: 'LX', received: true }),
    /* Ред в partial лист, върнат с „↩ Отмени" — известието и картата при вход
       не го броят (status=eq.sent), банерът също. */
    it_({ list_id: 'LP' })
  ];
  return { lists, items };
}

(async function () {

  section('1. Обект: 5 чакащи реда в 3 изпратени листа, най-старият от 05.10');
  {
    const f = fixture();
    const h = await open(STORE, f.items, f.lists);
    if (h) {
      const b = banner(h);
      const EXP = '📦 5 реда от товарни листи са изпратени към вас и чакат отговор (най-старият от 05.10). ' +
        'Отбележете всеки — ✅ Получено или ⛔ Неполучено. Дотогава листът не се приключва.';
      ok('банерът е там', !!b);
      ok('точният текст', txt(b) === EXP, txt(b));
      ok('числото е <b>5</b>', !!b && txt(b.querySelector('b')) === '5');
      ok('стои над картите на листите', !!b && !!h.doc.getElementById('ll-card-L1') &&
        (b.compareDocumentPosition(h.doc.getElementById('ll-card-L1')) & 4) !== 0);
      ok('дата от чернова / done / partial (10.09, 15.09) не влиза', txt(b).indexOf('10.09') < 0 && txt(b).indexOf('15.09') < 0);

      section('2. Етикетите = бутоните; броят = бутоните „✅ Получено" в изпратените листи');
      ok('LL_RECV_LABEL = „✅ Получено"', h.w.LL_RECV_LABEL === '✅ Получено', h.w.LL_RECV_LABEL);
      ok('LL_MISS_LABEL = „⛔ Неполучено"', h.w.LL_MISS_LABEL === '⛔ Неполучено', h.w.LL_MISS_LABEL);
      const rb = recvBtns(h), mb = missBtns(h);
      ok('всеки бутон за получено е с текста от банера', rb.length > 0 && rb.every(x => txt(x) === h.w.LL_RECV_LABEL), JSON.stringify(rb.map(txt)));
      ok('всеки бутон за неполучено е с текста от банера', mb.length > 0 && mb.every(x => txt(x) === h.w.LL_MISS_LABEL), JSON.stringify(mb.map(txt)));
      const inSent = rb.filter(x => { const c = x.closest('[id^="ll-card-"]'); return c && /ll-card-L[123]$/.test(c.id); });
      ok('бутоните в изпратените листи = 5', inSent.length === 5, inSent.length);

      section('3. Истински клик „✅ Получено" → 4');
      const first = inSent[0];
      realClick(h.w, first);
      await settle();
      ok('PATCH received=true', h.calls.patch.some(p => p.table === 'loading_list_items' && p.body.received === true), JSON.stringify(h.calls.patch.map(p => p.body)));
      ok('банерът казва 4', /^📦 4 реда от товарни листи/.test(txt(banner(h))), txt(banner(h)));
      ok('нищо в „loading_lists" не е писано (листът не е затворен)', !h.calls.patch.some(p => p.table === 'loading_lists'));
      h.close();
    }
  }

  section('4. Чужд обект в паметта (регионален изглед) — не се брои');
  {
    const f = fixture();
    const h = await open(STORE, f.items, f.lists);
    if (h) {
      h.w.llStoreItems = h.w.llStoreItems.concat([it_({ list_id: 'L1', store_name: 'Габрово' }), it_({ list_id: 'L2', store_name: 'Габрово' })]);
      ok('пак 5', h.w.llStoreWaitRows().length === 5, h.w.llStoreWaitRows().length);
      h.close();
    }
  }

  section('5. Един ред — единствено число; без sent_at — без скобите');
  {
    seq = 0;
    const h = await open(STORE, [it_({ list_id: 'L1' }), it_({ list_id: 'LX', received: true })],
      [list('L1', 'sent', '2026-10-07T06:00:00.000Z'), list('LX', 'done', '2026-09-01T06:00:00.000Z')]);
    if (h) {
      const EXP = '📦 1 ред от товарен лист е изпратен към вас и чака отговор (от 07.10). ' +
        'Отбележете го — ✅ Получено или ⛔ Неполучено. Дотогава листът не се приключва.';
      ok('точният текст', txt(banner(h)) === EXP, txt(banner(h)));
      h.close();
    }
    seq = 0;
    const h2 = await open(STORE, [it_({ list_id: 'L1' }), it_({ list_id: 'L1' })], [list('L1', 'sent', null)]);
    if (h2) {
      const EXP = '📦 2 реда от товарни листи са изпратени към вас и чакат отговор. ' +
        'Отбележете всеки — ✅ Получено или ⛔ Неполучено. Дотогава листът не се приключва.';
      ok('без дата — без „(…)"', txt(banner(h2)) === EXP, txt(banner(h2)));
      h2.close();
    }
  }

  section('6. 0 чакащи → няма банер');
  {
    seq = 0;
    const h = await open(STORE, [it_({ list_id: 'L1', received: true }), it_({ list_id: 'L1', missing: true }), it_({ list_id: 'LP' })],
      [list('L1', 'sent', '2026-10-07T06:00:00.000Z'), list('LP', 'partial', '2026-10-01T06:00:00.000Z')]);
    if (h) {
      ok('картата е там, банерът — не', !!h.doc.getElementById('ll-card-L1') && !banner(h));
      h.close();
    }
  }

  section('7. Склад, admin, контролинг → няма банер');
  for (const [name, user] of [['склад', WAREHOUSE], ['admin', ADMIN], ['контролинг (глобален)', ACC]]) {
    const f = fixture();
    const h = await open(user, f.items, f.lists);
    if (h) {
      ok(name + ': без банер', !banner(h) && h.doc.getElementById('mod-loading').innerHTML.indexOf('чакат отговор') < 0);
      /* По-силно: чакащи редове на СОБСТВЕНОТО му име в паметта (склад, към
         който обект връща; ЦО като получател) — пак без банер. Иначе „без
         банер" минава само защото редовете са на друг обект. */
      h.w.llStoreLists = f.lists.filter(l => l.status === 'sent');
      h.w.llStoreItems = f.items.filter(i => /^L[123]$/.test(i.list_id)).map(i => Object.assign({}, i, { store_name: user.store_name }));
      h.w.renderLoadingLists();
      ok(name + ': без банер и с чакащи редове на свое име', !banner(h) && h.doc.getElementById('mod-loading').innerHTML.indexOf('чакат отговор') < 0);
      h.close();
    }
  }

  report();
})();
