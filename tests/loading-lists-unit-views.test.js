/* Товарни листи: единицата е ПАЛЕТ с няколко изходящи номера — как се вижда.

   Заглавието „Палет 2 от 5 · Габрово · изходящи: 4600186336, 4600186405" е
   едно и също в прегледа на склада, картата на обекта, печата и PDF-а;
   документите са под него. Описът носи документите и артикулите на ЦЕЛИЯ
   палет. Насипът няма палет — едно поле за един номер, не чипове. В Стока на
   път до всяка единица на обекта има „+ към палет N".

   Пускане:  node tests/loading-lists-unit-views.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, fire, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const MODULES = ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
                 'stock-differences.js', 'loading.js'];

const L1 = { id: 'L1', warehouse: WH, list_date: '2026-10-02', status: 'sent',
             executed_by: 'Иван', comment: '', created_by: 'x', created_at: '2026-10-02T06:00:00.000Z',
             sent_at: '2026-10-02T07:00:00.000Z', done_at: null };
const TRANSIT = [
  { purchase_doc: 'D-1', store_name: 'Петрич', doc_date: '2026-09-01' },
  { purchase_doc: 'D-2', store_name: 'Петрич', doc_date: '2026-09-01' },
  { purchase_doc: 'D-9', store_name: 'Гоце Делчев', doc_date: '2026-09-01' }
];

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: null, clears_doc: null, store_name: 'Петрич', warehouse_comment: null,
    store_comment: null, partial: false, received: false, missing: false, received_by: null,
    received_at: null, created_at: '2026-10-02T06:00:00.000Z', products: []
  }, o);
}
function env(items, user) {
  const h = boot({
    modules: MODULES, user: user || WAREHOUSE, confirm: true,
    data: {
      app_settings: [{ key: 'loading_transit_docs', value: 'on' }],
      goods_transit: TRANSIT,
      loading_lists: [L1],
      loading_list_items: function (url) {
        let rows = (items || []).map(r => Object.assign({}, r, {
          loading_list_products: (r.products || []).map(p => Object.assign({}, p)) }));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        return rows;
      },
      loading_list_products: [], loading_list_photos: [],
      users: [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' }, { store_name: 'Габрово' }],
      stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  /* Фалшив jsPDF: записва всеки текст. */
  const rec = { text: [] };
  function Doc() {}
  Doc.prototype.addFileToVFS = function () {};
  Doc.prototype.addFont = function () {};
  Doc.prototype.setFont = function () {};
  Doc.prototype.setFontSize = function () {};
  Doc.prototype.splitTextToSize = function (t) { return [String(t)]; };
  Doc.prototype.text = function (t) { rec.text.push(String(t)); };
  Doc.prototype.addPage = function () {};
  Doc.prototype.output = function () { return 'data:application/pdf;filename=x.pdf;base64,UERG'; };
  h.w.jspdf = { jsPDF: Doc };
  h.w.llPdfFont = () => Promise.resolve('Rk9OVA==');
  h.rec = rec;
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const idxOf = (h, doc) => h.w.llPendingDocs.findIndex(d => d.purchase_doc === doc);

const PROD = { sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 5, cartons: 1 };
const ITEMS = [
  /* Палет 1 за Петрич: два документа, артикулите — на първия. */
  it_({ id: 'a1', position: 1, pallet_no: 1, pallet_total: 2, purchase_doc: 'P1a', products: [PROD] }),
  it_({ id: 'a2', position: 2, pallet_no: 1, pallet_total: 2, purchase_doc: 'P1b',
        products: [{ sap_code: '5001', product_name: 'ТРЪБА', unit: 'л.м', qty: 3, cartons: null }] }),
  it_({ id: 'b1', position: 3, pallet_no: 2, pallet_total: 2, purchase_doc: 'P2' }),
  it_({ id: 'g1', position: 4, store_name: 'Габрово', pallet_no: 1, pallet_total: 1, purchase_doc: 'G1' })
];
const HEAD1 = 'Палет 1 от 2 · Петрич · изходящи: P1a, P1b';

(async function () {

  section('1. Преглед на склада: заглавие на единицата, документите под него');
  {
    const h = env(ITEMS);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.w.llOpenView('L1'); await ticks();
    const heads = Array.from(mod(h).querySelectorAll('tr[data-ll-unit-head]')).map(t => t.textContent);
    ok('заглавен ред за всяка единица (3)', heads.length === 3, JSON.stringify(heads));
    ok('„' + HEAD1 + '"', heads.some(t => t.indexOf(HEAD1) === 0), JSON.stringify(heads));
    ok('Габрово е сам', heads.some(t => t.indexOf('Палет 1 от 1 · Габрово · изходящи: G1') === 0));
    /* Редовете без под-редовете с артикули: заглавие, документи (↳), заглавие… */
    const seq = Array.from(mod(h).querySelectorAll('tbody tr'))
      .filter(t => t.hasAttribute('data-ll-unit-head') || t.textContent.indexOf('↳') >= 0)
      .map(t => t.hasAttribute('data-ll-unit-head') ? 'H:' + t.textContent.slice(0, 12) : 'D:' + (/P1a|P1b|P2|G1/.exec(t.textContent) || [''])[0]);
    ok('документите са непосредствено под своето заглавие',
      seq.join(' ') === 'H:Палет 1 от 1 D:G1 H:Палет 1 от 2 D:P1a D:P1b H:Палет 2 от 2 D:P2', seq.join(' '));
    const opis = Array.from(mod(h).querySelectorAll('tr[data-ll-unit-head] button[data-u]'));
    ok('„🖨 Опис" е веднъж на единица — на заглавния ред', opis.length === 1 && opis[0].getAttribute('data-u') === '1' && opis[0].getAttribute('data-s') === 'Петрич',
      String(opis.length));
    ok('редовете с документи нямат „Опис" и са „↳"',
      Array.from(mod(h).querySelectorAll('tbody tr')).filter(t => !t.hasAttribute('data-ll-unit-head') && t.querySelector('button[data-u]')).length === 0);
  }

  section('2. Картата на обекта и описът');
  {
    const h = env(ITEMS, STORE);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    const card = h.doc.getElementById('ll-card-L1');
    ok('картата: заглавие с обект и номера', card.textContent.indexOf(HEAD1) >= 0, card.textContent.slice(0, 200));
    ok('под него два документа', /2 документа/.test(card.textContent));
    h.w.llPrint('L1', 'Петрич', '1');
    const pr = h.doc.getElementById('mod-print');
    const t = pr.textContent;
    ok('описът носи ВСИЧКИ документи на палета', /P1a, P1b/.test(t), t.slice(0, 300));
    ok('и артикулите на двата документа', t.indexOf('ШУРУП 4X40') >= 0 && t.indexOf('ТРЪБА') >= 0);
    ok('но не и на другия палет', t.indexOf('P2') < 0);
  }

  section('3. Печат на листа и PDF');
  {
    const h = env(ITEMS);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.w.llPrint('L1');
    const pr = h.doc.getElementById('mod-print');
    const heads = Array.from(pr.querySelectorAll('tr[data-ll-unit-head]')).map(t => t.textContent);
    ok('печатът: заглавен ред за всяка единица', heads.length === 3, JSON.stringify(heads));
    ok('с обект и изходящи', heads.some(t => t === HEAD1), JSON.stringify(heads));
    /* „палет N от M" е САМО в заглавния ред; колоната „Вид" носи само вида. */
    const kinds = Array.from(pr.querySelectorAll('td.lp-kind')).map(t => t.textContent.trim());
    ok('колоната „Вид" няма „N от M"', kinds.length === 3 && kinds.every(k => !/ от /.test(k)) && kinds[0] === 'палет', JSON.stringify(kinds));

    const l = h.w.llLists.find(x => x.id === 'L1');
    await h.w.llBuildPdf(l, h.w.llItems, 'Петрич');
    const txt = h.rec.text;
    const iHead = txt.findIndex(x => x.indexOf(HEAD1) >= 0);
    ok('PDF: заглавие на единицата', iHead >= 0, JSON.stringify(txt));
    ok('и документите ѝ под него, по един ред',
      /изходящ № P1a/.test(txt[iHead + 1]) && txt.slice(iHead).some(x => /изходящ № P1b/.test(x)),
      txt.slice(iHead, iHead + 6).join(' | '));
    const iNext = txt.findIndex(x => /Палет 2 от 2/.test(x));
    ok('„Палет 2 от 2" е след „Палет 1 от 2"', iNext > iHead, txt.join(' | '));
  }

  section('4. Насип: едно поле за един номер, не чипове');
  {
    const h = env([]);
    h.w.llNewList(); h.w.llDraft.units = [];
    await ticks(); await ticks();
    h.w.llAddFreeRow();
    h.w.llSetRowField(0, 'store_name', 'Петрич');
    h.w.llUnitDocAdd(0, 'D-1, D-2');
    ok('палет: два чипа', h.w.llDraft.units[0].docs.join() === 'D-1,D-2');
    h.w.renderLoadingLists();
    ok('палет: има чипове', mod(h).querySelectorAll('[data-ll-doc-chip]').length === 2);
    h.w.llSetRowField(0, 'kind', 'bulk');
    ok('към насип — остава само първият номер', h.w.llDraft.units[0].docs.join() === 'D-1', h.w.llDraft.units[0].docs.join());
    ok('без номер на палет', h.w.llDraft.units[0].pallet_no === null);
    ok('няма чипове', mod(h).querySelectorAll('[data-ll-doc-chip]').length === 0);
    const input = h.doc.getElementById('ll-doc-in-0');
    ok('едно поле, със стойността', !!input && input.getAttribute('data-single') === '1' && input.value === 'D-1');
    input.value = '  D-5 '; fire(h.w, input, 'input');
    ok('писането сменя единствения номер', h.w.llDraft.units[0].docs.join() === 'D-5', h.w.llDraft.units[0].docs.join());
    h.w.llUnitDocAdd(0, 'X-1, X-2');
    ok('„запетая" при насип не прави втори номер', h.w.llDraft.units[0].docs.join() === 'X-1', h.w.llDraft.units[0].docs.join());
    input.value = ''; fire(h.w, input, 'input');
    ok('изчистено поле → без номер', h.w.llDraft.units[0].docs.length === 0);
  }

  section('5. Стока на път: „+ към палет N" добавя към съществуваща единица');
  {
    const h = env([]);
    h.w.llNewList(); h.w.llDraft.units = [];
    await ticks(); await ticks();
    h.w.llToggleDoc(idxOf(h, 'D-1'));
    h.w.renderLoadingLists();
    const row = d => mod(h).querySelector('tr[data-ll-doc="' + idxOf(h, d) + '"]');
    ok('D-1 е отметнат — без бутон', !btn(row('D-1'), '+ към'));
    const b = btn(row('D-2'), '+ към палет 1');
    if (ok('за D-2 има „+ към палет 1“ (същия обект)', !!b)) {
      ok('за другия обект няма такъв бутон', !btn(row('D-9'), '+ към'));
      realClick(h.w, b);
      await ticks();
      ok('D-2 е чип на палет 1', h.w.llDraft.units.length === 1 && h.w.llDraft.units[0].docs.join() === 'D-1,D-2',
        JSON.stringify(h.w.llDraft.units.map(u => u.docs)));
      ok('и е отметнат', h.w.llPendingDocs[idxOf(h, 'D-2')].checked === true);
      h.w.llToggleDoc(idxOf(h, 'D-2'));
      ok('разотмятането го маха от палета, палетът остава', h.w.llDraft.units.length === 1 && h.w.llDraft.units[0].docs.join() === 'D-1');
    }
    h.w.llToggleDoc(idxOf(h, 'D-2'));
    ok('обикновеното отмятане пак прави НОВ палет', h.w.llDraft.units.length === 2 && h.w.llDraft.units[1].pallet_no === 2,
      JSON.stringify(h.w.llDraft.units.map(u => u.docs + ':' + u.pallet_no)));
  }

  report();
})();
