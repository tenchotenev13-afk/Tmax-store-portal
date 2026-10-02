/* Товарни листи: № на палет по подразбиране и подредба по обект/вид/палет.

   Две неща, които се пазят тук:
     1) Нов документ / нов ред получава СЛЕДВАЩИЯ свободен № за обекта (max+1),
        не 1. Два документа на един палет става само когато складът изрично
        напише същия номер. Полето „Палет №" показва предложението още преди
        отмятането; смяна на обекта преномерира по новия обект.
     2) Прегледът, картата на обекта, печатът и PDF-ът са в ЕДНА подредба:
        обект → вид → палет № → позиция. „1 от 2" никога не е след „2 от 2" за
        същия обект и вид.

   Пускане:  node tests/loading-lists-pallet-default.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const MODULES = ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
                 'stock-differences.js', 'loading.js'];

const L1 = { id: 'L1', warehouse: WH, list_date: '2026-10-02', status: 'sent',
             executed_by: 'Иван', comment: '', created_by: 'x', created_at: '2026-10-02T06:00:00.000Z',
             sent_at: '2026-10-02T07:00:00.000Z', done_at: null };

const TRANSIT = [
  { purchase_doc: 'D-1', store_name: 'Петрич', doc_date: '2026-09-01' },
  { purchase_doc: 'D-2', store_name: 'Петрич', doc_date: '2026-09-01' },
  { purchase_doc: 'D-3', store_name: 'Петрич', doc_date: '2026-09-01' },
  { purchase_doc: 'D-9', store_name: 'Гоце Делчев', doc_date: '2026-09-01' }
];

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: null, clears_doc: null, store_name: 'Петрич', warehouse_comment: null,
    store_comment: null, partial: false, received: false, missing: false, received_by: null,
    received_at: null, created_at: '2026-10-02T06:00:00.000Z'
  }, o);
}

function env(items, user) {
  return boot({
    modules: MODULES, user: user || WAREHOUSE, confirm: true,
    data: {
      app_settings: [{ key: 'loading_transit_docs', value: 'on' }],
      goods_transit: TRANSIT,
      loading_lists: [L1],
      loading_list_items: function (url) {
        let rows = (items || []).map(r => Object.assign({}, r, { loading_list_products: [] }));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        return rows;
      },
      loading_list_products: [],
      users: [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' }, { store_name: 'Габрово' }],
      stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
}
const idxOf = (h, doc) => h.w.llPendingDocs.findIndex(d => d.purchase_doc === doc);
const nums = h => h.w.llDraft.items.map(i => i.store_name + ':' + i.pallet_no).join(' ');
const DOCRE = /(?:^|[^A-Za-z0-9])(G1|G2|P1a|P1b|P2|PO|PB)(?![A-Za-z0-9])/;
const mod = h => h.doc.getElementById('mod-loading');

/* Редовете трябва да вървят като подредбата обект → вид → № (без дупки назад). */
function inOrder(rows) {
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a.store !== b.store) continue;
    if (a.kind === b.kind && a.no > b.no) return false;
  }
  return true;
}

(async function () {

  section('1. Отмятане на документи — max+1, не 1');
  {
    const h = env([]);
    h.w.llNewList();
    h.w.llDraft.items = [];
    await ticks(); await ticks();
    ['D-1', 'D-2', 'D-3'].forEach(d => h.w.llToggleDoc(idxOf(h, d)));
    ok('Петрич: 1, 2, 3 (всеки документ на свой палет)', nums(h) === 'Петрич:1 Петрич:2 Петрич:3', nums(h));
    h.w.llToggleDoc(idxOf(h, 'D-9'));
    ok('Гоце Делчев започва от 1 — номерацията е по обект', /Гоце Делчев:1$/.test(nums(h)), nums(h));
    const field = d => h.doc.querySelector('tr[data-ll-doc="' + idxOf(h, d) + '"] input[onchange*="llSetDocPallet"]');
    ok('отметнат документ показва номера, на който е', field('D-2').value === '2', field('D-2').value);
  }

  section('2. Полето „Палет №" показва предложението още преди отмятането');
  {
    const h = env([]);
    h.w.llNewList(); h.w.llDraft.items = [];
    await ticks(); await ticks();
    h.w.renderLoadingLists();
    const field = d => h.doc.querySelector('tr[data-ll-doc="' + idxOf(h, d) + '"] input[onchange*="llSetDocPallet"]');
    ok('празна чернова: всички предлагат 1', ['D-1', 'D-2', 'D-9'].every(d => field(d).value === '1'));
    h.w.llToggleDoc(idxOf(h, 'D-1'));
    ok('след D-1 на палет 1, D-2 (същия обект) предлага 2', field('D-2').value === '2', field('D-2').value);
    ok('D-9 (друг обект) още предлага 1', field('D-9').value === '1', field('D-9').value);
  }

  section('3. Същият номер, въведен ИЗРИЧНО, групира документите');
  {
    const h = env([]);
    h.w.llNewList(); h.w.llDraft.items = [];
    await ticks(); await ticks();
    h.w.llToggleDoc(idxOf(h, 'D-1'));
    h.w.llSetDocPallet(idxOf(h, 'D-2'), '1');
    h.w.llToggleDoc(idxOf(h, 'D-2'));
    ok('D-1 и D-2 са на палет 1', nums(h) === 'Петрич:1 Петрич:1', nums(h));
    ok('това е ЕДИН палет', h.w.llPalletGroups(h.w.llDraft.items).length === 1);
    const note = mod(h).querySelector('[data-ll-pallet-note]');
    ok('жълт ред: „Палет 1 за Петрич носи 2 документа"',
      note && note.textContent.indexOf('Палет 1 за Петрич носи 2 документа') >= 0, note && note.textContent);
    h.w.llToggleDoc(idxOf(h, 'D-3'));
    ok('третият, без изрично въведен №, не се лепва към тях — отива на 2', nums(h) === 'Петрич:1 Петрич:1 Петрич:2', nums(h));
    const note2 = mod(h).querySelector('[data-ll-pallet-note]');
    ok('предупреждението пак е само за палет 1', note2 && note2.textContent.indexOf('Палет 2') < 0);
  }

  section('4. „➕ Добави нов ред" и смяна на обект');
  {
    const h = env([]);
    h.w.llNewList();
    await ticks(); await ticks();
    ok('10-те предварителни реда са без номер', h.w.llDraft.items.slice(0, 10).every(i => i.pallet_no == null));
    h.w.llDraft.items = [
      Object.assign(h.w.llBlankDraftRow(), { store_name: 'Петрич', pallet_no: 1 }),
      Object.assign(h.w.llBlankDraftRow(), { store_name: 'Петрич', pallet_no: 2 }),
      Object.assign(h.w.llBlankDraftRow(), { store_name: 'Габрово', pallet_no: 1 })
    ];
    h.w.llAddFreeRow();
    const added = h.w.llDraft.items[3];
    ok('нов ред получава № (не null)', added.pallet_no != null, String(added.pallet_no));
    h.w.llSetRowField(3, 'store_name', 'Петрич');
    ok('смяна на обекта → следващият свободен за Петрич (3)', h.w.llDraft.items[3].pallet_no === 3, String(h.w.llDraft.items[3].pallet_no));
    h.w.llSetRowField(3, 'store_name', 'Габрово');
    ok('и обратно → следващият за Габрово (2), не 3', h.w.llDraft.items[3].pallet_no === 2, String(h.w.llDraft.items[3].pallet_no));
    h.w.llSetRowField(3, 'kind', 'oversize');
    ok('друг вид има своя поредица: извънгабаритен 1', h.w.llDraft.items[3].pallet_no === 1, String(h.w.llDraft.items[3].pallet_no));
    h.w.llSetRowField(3, 'kind', 'bulk');
    ok('насипът няма номер', h.w.llDraft.items[3].pallet_no === null);
    h.w.llSetRowField(3, 'kind', 'pallet');
    ok('обратно към палет → следващият свободен', h.w.llDraft.items[3].pallet_no === 2, String(h.w.llDraft.items[3].pallet_no));
    /* Гранично: точно на дупка — max+1, не „първия свободен". */
    h.w.llDraft.items[0].pallet_no = 5;
    ok('max+1 при дупка (има 5 и 2 → 6)', h.w.llNextPalletNo(h.w.llDraft.items, 'Петрич', 'pallet') === 6,
      String(h.w.llNextPalletNo(h.w.llDraft.items, 'Петрич', 'pallet')));
    ok('собственият ред не се брои (skip)',
      h.w.llNextPalletNo(h.w.llDraft.items, 'Петрич', 'pallet', h.w.llDraft.items[0]) === 3);
  }

  section('5. Редакторът: „палет N" с цвят по палет');
  {
    const h = env([]);
    h.w.llNewList(); h.w.llDraft.items = [];
    await ticks(); await ticks();
    h.w.llToggleDoc(idxOf(h, 'D-1'));
    h.w.llSetDocPallet(idxOf(h, 'D-2'), '1');
    h.w.llToggleDoc(idxOf(h, 'D-2'));
    h.w.llToggleDoc(idxOf(h, 'D-3'));
    const b = Array.from(mod(h).querySelectorAll('[data-ll-pbadge]'));
    ok('три реда носят етикет', b.length === 3, String(b.length));
    ok('етикетите казват „палет 1/1/2"', b.map(x => x.textContent).join(',') === 'палет 1,палет 1,палет 2', b.map(x => x.textContent).join(','));
    const col = x => x.style.background;
    ok('един палет = един цвят', col(b[0]) === col(b[1]) && col(b[0]) !== col(b[2]), b.map(col).join(' | '));
  }

  section('6. Подредба: обект → вид → палет № → позиция (преглед, печат, PDF)');
  {
    /* Позициите са нарочно размесени спрямо палетите. */
    const items = [
      it_({ id: 'a', position: 1, store_name: 'Петрич', pallet_no: 2, pallet_total: 2, purchase_doc: 'P2' }),
      it_({ id: 'b', position: 2, store_name: 'Габрово', pallet_no: 2, pallet_total: 2, purchase_doc: 'G2' }),
      it_({ id: 'c', position: 3, store_name: 'Петрич', pallet_no: 1, pallet_total: 2, purchase_doc: 'P1a' }),
      it_({ id: 'd', position: 4, store_name: 'Габрово', pallet_no: 1, pallet_total: 2, purchase_doc: 'G1' }),
      it_({ id: 'e', position: 5, store_name: 'Петрич', kind: 'oversize', pallet_no: 1, pallet_total: 1, purchase_doc: 'PO', warehouse_comment: 'стелажи' }),
      it_({ id: 'f', position: 6, store_name: 'Петрич', pallet_no: 1, pallet_total: 2, purchase_doc: 'P1b' }),
      it_({ id: 'g', position: 7, store_name: 'Петрич', kind: 'bulk', pallet_no: null, pallet_total: null, purchase_doc: 'PB' })
    ];
    const WANT = 'G1,G2,P1a,P1b,P2,PO,PB';

    const h = env(items);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.w.llOpenView('L1'); await ticks();
    const view = Array.from(mod(h).querySelectorAll('tbody tr'))
      .map(tr => DOCRE.exec(tr.children[2] && tr.children[2].textContent))
      .filter(Boolean).map(m => m[1]).join(',');
    ok('преглед на склада: ' + WANT, view === WANT, view);

    h.w.llPrint('L1');
    const pr = h.doc.getElementById('mod-print');
    const printed = Array.from(pr.querySelectorAll('tr.lp-row[data-store]'))
      .map(tr => Array.from(tr.children).map(td => DOCRE.exec(td.textContent)).find(Boolean)).filter(Boolean).map(m => m[1]).join(',');
    ok('печат: ' + WANT, printed === WANT, printed);

    const pdf = h.w.llPdfRows(items).map(i => i.purchase_doc).join(',');
    ok('PDF: ' + WANT, pdf === WANT, pdf);

    /* „1 от 2" никога не е след „2 от 2" за същия обект и вид. */
    const labels = h.w.llPdfRows(items).map(i => ({ store: i.store_name, kind: i.kind, no: i.pallet_no }));
    ok('редът „1 от 2" не е след „2 от 2"', inOrder(labels));

    const s = env(items, { email: 'p@temax.bg', display_name: 'Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] });
    s.w.loadLoadingLists(); await ticks(); await ticks();
    const card = s.doc.getElementById('ll-card-L1');
    const cardOrder = Array.from(card.querySelectorAll('tbody tr'))
      .map(tr => DOCRE.exec(tr.children[1] && tr.children[1].textContent)).filter(Boolean).map(m => m[1]).join(',');
    ok('картата на обекта: P1a,P1b,P2,PO,PB', cardOrder === 'P1a,P1b,P2,PO,PB', cardOrder);
    const heads = Array.from(card.querySelectorAll('tr[data-pallet-group="1"]')).map(t => t.textContent.trim());
    ok('заглавен ред за всеки номериран палет (3: палет 1, палет 2, извънгабаритен 1)', heads.length === 3, JSON.stringify(heads));
    ok('„палет 1 от 2" е преди „палет 2 от 2"',
      heads[0].indexOf('палет 1 от 2') === 0 && heads[1].indexOf('палет 2 от 2') === 0, JSON.stringify(heads));
    ok('групираният палет казва „2 документа"', heads[0].indexOf('2 документа') >= 0, heads[0]);
  }

  report();
})();
