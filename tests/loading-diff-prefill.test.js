/* „⚠️ Разлика" от неполучен палет — бланката се отваря попълнена.

   Магазинът вече е описал веднъж какво чака: складът, документът и артикулите
   стоят в товарния лист и в „Стока на път". Преписването им на ръка е точно
   мястото, където се греши — оттам и предварителното попълване.

   ДВЕ НЕЩА, КОИТО ТЕСТЪТ ПАЗИ ОСОБЕНО:
   1. openDiffSubmitModal() БЕЗ аргумент трябва да е байт по байт същата.
      Заковано е със снимка (SHA256) на HTML-а на модала, взета от версията
      ПРЕДИ промяната. Датата по подразбиране се нормализира, иначе снимката
      би гниела с всеки нов ден.
   2. Бутонът НЕ пише нищо. „Получих палета" и „имам разлика по него" са две
      различни твърдения и не бива да се случват с един клик.

   Пускане:  node tests/loading-diff-prefill.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;
const crypto = require('crypto');

/* Снимка на модала без параметър, взета от stock-differences.js в 828e0b6
   (преди добавянето на prefill). Дължина 5388 знака. */
const MODAL_SHA = 'c01990f53ddcda8401a86a9ab8025244d2b779c7c3be4516c7180bdaed427132';
const MODAL_LEN = 5388;

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
    pallet_no: 2, pallet_total: 5, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    created_at: '2026-09-02T06:00:00.000Z'
  }, o);
}
/* Три позиции по документа — това очакваме да влезе в бланката. */
const TRANSIT = {
  'D-100': [
    { material_code: '34989', material_name: 'ЩУЦЕР МЕТАЛЕН', ordered_qty: 10, unit: 'бр.' },
    { material_code: '34990', material_name: 'КРАН СФЕРИЧЕН', ordered_qty: 4, unit: 'бр.' },
    { material_code: '34991', material_name: 'ПРОФИЛ ПВЦ', ordered_qty: 2.5, unit: 'м' }
  ],
  'D-777': [
    { material_code: '55501', material_name: 'БАТЕРИЯ DURACELL', ordered_qty: 6, unit: 'бр.' }
  ]
};

function env(user, items) {
  const h = boot({
    /* Реалният ред от index.html: stock-differences.js (поз. 19) ПРЕДИ
       loading.js (поз. 21) — llOpenDiffForItem вика openDiffSubmitModal. */
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      loading_list_items: function (url) {
        let rows = (items || []).map(r => Object.assign({}, r));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        return rows;
      },
      loading_lists: [L_SENT],
      goods_transit: function (url) {
        const m = /purchase_doc=eq\.([^&]*)/.exec(url);
        if (!m) return [];
        return (TRANSIT[decodeURIComponent(m[1])] || []).map(r => Object.assign({}, r));
      },
      users: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.w.sdData = []; h.w.diffReports = [];
  return h;
}
const card = (doc, id) => doc.getElementById('ll-card-' + id);
const modal = doc => doc.getElementById('diff-submit-ov');
const val = (doc, id) => { const e = doc.getElementById(id); return e ? e.value : null; };
function rows(doc) {
  return Array.prototype.map.call(doc.querySelectorAll('#diff-items .diff-item-row'), r => ({
    sap: r.querySelector('.di-sap').value,
    name: r.querySelector('.di-name').value,
    qty: r.querySelector('.di-qty').value,
    cat: r.querySelector('.di-cat').value
  }));
}

(async function () {

  section('а) Без параметър модалът е БАЙТ ПО БАЙТ същият');
  {
    const h = env(STORE, []);
    h.w.openDiffSubmitModal();
    const ov = modal(h.doc);
    if (ok('модалът се отваря', !!ov)) {
      const html = ov.outerHTML.replace(/value="\d{4}-\d{2}-\d{2}"/g, 'value="__TODAY__"');
      const sha = crypto.createHash('sha256').update(html).digest('hex');
      ok('дължината съвпада със снимката', html.length === MODAL_LEN,
        html.length + ' срещу ' + MODAL_LEN);
      ok('SHA256 съвпада със снимката', sha === MODAL_SHA, sha);
      ok('има точно един празен ред', rows(h.doc).length === 1, String(rows(h.doc).length));
      ok('и той е наистина празен',
        rows(h.doc)[0].sap === '' && rows(h.doc)[0].name === '' && rows(h.doc)[0].qty === '',
        JSON.stringify(rows(h.doc)[0]));
    }
  }

  section('б) Неполучен палет с документ → бланка, попълнена от документа');
  {
    const items = [it_({ id: 'i1', position: 3, pallet_no: 2, pallet_total: 5,
                         purchase_doc: 'D-100', warehouse_comment: 'кашонът е леко смачкан' })];
    const h = env(STORE, items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const b = btn(card(h.doc, 'L1'), '⚠️ Разлика');
    if (ok('бутонът „Разлика" е на реда', !!b, card(h.doc, 'L1').textContent.slice(0, 200))) {
      realClick(h.w, b);
      await ticks(); await ticks();

      ok('заявката към goods_transit е с точния филтър',
        h.calls.get.some(u => /goods_transit/.test(u) &&
          /purchase_doc=eq\.D-100/.test(u) && /store_name=eq\./.test(u) &&
          /order=position/.test(u)),
        h.calls.get.filter(u => /goods_transit/.test(u)).join(' | '));

      if (ok('бланката е отворена', !!modal(h.doc))) {
        ok('посоката е междускладов трансфер', val(h.doc, 'diff-direction') === 'interstore',
          val(h.doc, 'diff-direction'));
        ok('изпращачът е складът от листа', val(h.doc, 'diff-counterpart') === WH,
          val(h.doc, 'diff-counterpart'));
        ok('документът е D-100', val(h.doc, 'diff-docnum') === 'D-100',
          val(h.doc, 'diff-docnum'));
        ok('датата е на товарния лист', val(h.doc, 'diff-docdate') === '2026-09-02',
          val(h.doc, 'diff-docdate'));

        const r = rows(h.doc);
        if (ok('трите позиции от документа са вътре', r.length === 3, String(r.length))) {
          ok('SAP кодовете идват от документа',
            r.map(x => x.sap).join(',') === '34989,34990,34991', r.map(x => x.sap).join(','));
          ok('наименованията също',
            r[0].name === 'ЩУЦЕР МЕТАЛЕН' && r[2].name === 'ПРОФИЛ ПВЦ',
            JSON.stringify(r.map(x => x.name)));
          ok('количествата са поръчаните', r.map(x => x.qty).join(',') === '10,4,2.5',
            r.map(x => x.qty).join(','));
          /* Категорията е преценка на магазина, не на подателя. */
          ok('категорията остава ПРАЗНА', r.every(x => x.cat === ''),
            JSON.stringify(r.map(x => x.cat)));
        }

        const c = val(h.doc, 'diff-comment');
        ok('коментарът сочи палета', c.indexOf('палет 2 от 5') >= 0, c);
        ok('и позицията', c.indexOf('позиция 3') >= 0, c);
        ok('и склада с датата', c.indexOf(WH) >= 0 && c.indexOf('02.09.2026') >= 0, c);
        ok('и носи коментара на склада', c.indexOf('Коментар склад: кашонът е леко смачкан') >= 0, c);
      }
    }
  }

  section('в) clears_doc бие purchase_doc и в бланката');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', clears_doc: 'D-777' })];
    const h = env(STORE, items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    realClick(h.w, btn(card(h.doc, 'L1'), '⚠️ Разлика'));
    await ticks(); await ticks();

    ok('питаме за D-777', h.calls.get.some(u => /purchase_doc=eq\.D-777/.test(u)),
      h.calls.get.filter(u => /goods_transit/.test(u)).join(' | '));
    ok('и НЕ за D-100', !h.calls.get.some(u => /purchase_doc=eq\.D-100/.test(u)),
      h.calls.get.filter(u => /goods_transit/.test(u)).join(' | '));
    ok('документът в бланката е D-777', val(h.doc, 'diff-docnum') === 'D-777',
      val(h.doc, 'diff-docnum'));
    const r = rows(h.doc);
    ok('артикулът е от D-777', r.length === 1 && r[0].name === 'БАТЕРИЯ DURACELL',
      JSON.stringify(r));
  }

  section('г) Ред без документ → един празен ред и „без документ" в коментара');
  {
    const items = [it_({ id: 'i1', kind: 'bulk', pallet_no: null, pallet_total: null,
                         purchase_doc: null, clears_doc: null })];
    const h = env(STORE, items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    realClick(h.w, btn(card(h.doc, 'L1'), '⚠️ Разлика'));
    await ticks(); await ticks();

    ok('нула заявки към goods_transit',
      !h.calls.get.some(u => /goods_transit/.test(u)), h.calls.get.join(' | '));
    ok('бланката е отворена', !!modal(h.doc));
    ok('един празен ред', rows(h.doc).length === 1 && rows(h.doc)[0].name === '',
      JSON.stringify(rows(h.doc)));
    ok('документът е празен', val(h.doc, 'diff-docnum') === '', val(h.doc, 'diff-docnum'));
    const c = val(h.doc, 'diff-comment');
    ok('коментарът казва „без документ"', c.indexOf('стокова № без документ') >= 0, c);
    /* llKindLabel() дава „насип" с малка буква — вътре в изречението е точно
       това, което трябва, и не се „поправя" заради теста. */
    ok('и назовава вида, не палет №', c.indexOf('насип') >= 0 && c.indexOf('палет') < 0, c);
  }

  section('д) Получен ред — няма бутон');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', received: true,
                         received_by: 'Управител Петрич',
                         received_at: '2026-09-03T09:00:00.000Z' })];
    const h = env(STORE, items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    /* Само по <button> — думата „разлика" може да стои и в текст. */
    ok('няма бутон „Разлика"', !btn(card(h.doc, 'L1'), 'Разлика'),
      card(h.doc, 'L1').textContent.slice(0, 200));
    ok('и няма бутон „Получено"', !btn(card(h.doc, 'L1'), 'Получено'));
  }

  section('е) Складов потребител — няма бутон');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100' })];
    const h = env(WAREHOUSE, items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('складът не вижда магазинската карта', !card(h.doc, 'L1'));
    ok('и никъде няма бутон „Разлика"',
      !btn(h.doc.getElementById('mod-loading'), 'Разлика'),
      h.doc.getElementById('mod-loading').textContent.slice(0, 150));
  }

  section('ж) Кликът НЕ пише нищо');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100' })];
    const h = env(STORE, items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    realClick(h.w, btn(card(h.doc, 'L1'), '⚠️ Разлика'));
    await ticks(); await ticks();

    ok('нула PATCH', h.calls.patch.length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('нула POST', h.calls.post.length === 0,
      JSON.stringify(h.calls.post.map(p => p.table)));
    ok('нула DELETE', h.calls.del.length === 0, JSON.stringify(h.calls.del));
    ok('редът НЕ е отметнат като получен', h.w.llStoreItems[0].received === false,
      String(h.w.llStoreItems[0].received));
  }

  section('з) Модулът „Разлики" не е зареден — не гърми');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100' })];
    const h = env(STORE, items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.openDiffSubmitModal = undefined;
    if (guard('llOpenDiffForItem() не хвърля', () => h.w.llOpenDiffForItem('i1'))) {
      ok('казва защо', h.calls.toast.some(t => /не е зареден/.test(String(t.msg || t))),
        JSON.stringify(h.calls.toast));
      ok('и не пита сървъра', !h.calls.get.some(u => /goods_transit/.test(u)),
        h.calls.get.join(' | '));
    }
  }

  section('и) Заглавният ред на палета — бутон само докато е недокоснат');
  {
    const three = [
      it_({ id: 'a1', position: 1, pallet_no: 1, pallet_total: 1, purchase_doc: 'D-100' }),
      it_({ id: 'a2', position: 2, pallet_no: 1, pallet_total: 1, purchase_doc: 'D-777' })
    ];
    const h = env(STORE, three);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const head = h.doc.querySelector('#mod-loading tr[data-pallet-group="1"]');
    if (ok('групираният палет има заглавен ред', !!head)) {
      ok('и бутон „Разлика" в него', !!btn(head, 'Разлика'), head.textContent);
    }

    /* Един отметнат ред — въпросът вече е за конкретния ред, не за палета. */
    const partly = [
      it_({ id: 'a1', position: 1, pallet_no: 1, pallet_total: 1, purchase_doc: 'D-100',
            received: true, received_by: 'Управител Петрич',
            received_at: '2026-09-03T09:00:00.000Z' }),
      it_({ id: 'a2', position: 2, pallet_no: 1, pallet_total: 1, purchase_doc: 'D-777' })
    ];
    const h2 = env(STORE, partly);
    h2.w.loadLoadingLists();
    await ticks(); await ticks();
    const head2 = h2.doc.querySelector('#mod-loading tr[data-pallet-group="1"]');
    if (ok('заглавният ред още е там', !!head2)) {
      ok('но вече БЕЗ бутон „Разлика"', !btn(head2, 'Разлика'), head2.textContent);
      ok('а неотметнатият ред пак си има', !!btn(card(h2.doc, 'L1'), 'Разлика'));
    }
  }

  report();
})();
