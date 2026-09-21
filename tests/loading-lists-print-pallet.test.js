/* Товарни листи — „ОПИС НА ПАЛЕТ" (Пакет В1) и артикулите в печата на листа.

   Описът се лепи на самия палет. Един физически палет може да носи няколко
   документа — няколко реда в loading_list_items с един pallet_no. Описът е
   ЕДИН и изброява артикулите на всичките.

   Тихите грешки, които се пазят тук:
     · описът взима само ПЪРВИЯ ред на палета (другите документи изпадат);
     · взима палет 1 на ДРУГ обект — всеки обект има палет 1;
     · „Палет N от M" с грешно M;
     · в печата на целия лист под-редът с артикулите е отделен <tr>, а „Вид"
       е с rowspan — ако rowspan-ът не брои под-редовете, всички колони под
       него се изместват с една наляво. jsdom не смята лейаут, но броя на
       клетките в реда — да.

   CLAUDE.md т.12: печатът наследява CSS-а на index.html. Правилата, които го
   неутрализират, се заковават като текст; визуалното съответствие иска реален
   преглед от човек.

   Пускане:  node tests/loading-lists-print-pallet.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };

const LIST = { id: 'L1', warehouse: WH, list_date: '2026-09-21', status: 'sent',
               executed_by: 'Иван', comment: '', created_at: '2026-09-21T06:00:00.000Z',
               sent_at: '2026-09-21T07:00:00.000Z', done_at: null };

function item(o) {
  return Object.assign({
    list_id: 'L1', kind: 'pallet', pallet_no: 1, pallet_total: 2, purchase_doc: null,
    clears_doc: null, store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null, created_at: 'x'
  }, o);
}
const P = (item_id, position, sap, name, qty, unit, cartons) =>
  ({ id: 'P-' + item_id + '-' + position, item_id: item_id, position: position, sap_code: sap,
     product_name: name, unit: unit || 'бр.', qty: qty, cartons: cartons == null ? null : cartons,
     received_qty: null, created_at: 'x' });

/* Палет 1 на Петрич носи ДВА документа (два реда). Палет 2 — отделно.
   Палет 1 на Гоце Делчев — същият номер, друг обект. Руло без номер. */
const ITEMS = [
  item({ id: 'A', position: 1, pallet_no: 1, purchase_doc: 'ИЗХ-100' }),
  item({ id: 'B', position: 2, pallet_no: 1, purchase_doc: 'ИЗХ-101' }),
  item({ id: 'C', position: 3, pallet_no: 2, purchase_doc: 'ИЗХ-102' }),
  item({ id: 'D', position: 4, pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-900', store_name: 'Гоце Делчев' }),
  item({ id: 'E', position: 5, kind: 'roll', pallet_no: null, pallet_total: null, purchase_doc: 'ИЗХ-103' })
];
const PRODUCTS = [
  P('A', 1, '3200123', 'ШУРУП 4X40', 12, 'бр.', 2),
  P('A', 2, '5001', 'ТРЪБА 1/2" PPR', 6.5, 'л.м', null),
  P('B', 1, '3200124', 'ШУРУП 4X50', 100, 'бр.', 4),
  P('C', 1, 'ПАЛЕТ2', 'САМО НА ВТОРИЯ', 1, 'бр.', 1),
  P('D', 1, 'ЧУЖД', 'НА ГОЦЕ ДЕЛЧЕВ', 9, 'бр.', 1),
  P('E', 1, 'РУЛО1', 'ИЗОЛАЦИЯ 10М', 3, 'рол', 3)
];

function env() {
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: WAREHOUSE, confirm: true,
    data: {
      loading_lists: [LIST],
      /* Embed-ът: всеки ред идва с артикулите си под loading_list_products. */
      loading_list_items: () => ITEMS.map(it => Object.assign({}, it, {
        loading_list_products: PRODUCTS.filter(p => p.item_id === it.id).map(p => Object.assign({}, p))
      })),
      users: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  h.modules = [];
  const realShow = h.w.showModule;
  h.w.showModule = function (m) { h.modules.push(m); };
  return h;
}
const pr = h => h.doc.getElementById('mod-print');

(async function () {

  section('а) Палет с ДВА документа — описът носи артикулите на двата реда');
  {
    const h = env();
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');

    /* Истински клик по „🖨 Опис" на първия ред на палет 1 на Петрич. */
    const b = h.doc.getElementById('mod-loading')
      .querySelector('button[data-u="1"][data-s="Петрич"]');
    if (ok('бутонът „🖨 Опис" на палет 1 на Петрич', !!b)) {
      realClick(h.w, b);
      ok('отваря печата', h.modules.indexOf('print') >= 0, JSON.stringify(h.modules));
    }
    const t = pr(h).textContent;
    ok('това е описът, не целият лист', !!pr(h).querySelector('[data-ll-pallet-print]'));
    ok('„Палет 1 от 2"', t.indexOf('Палет 1 от 2') >= 0, t.slice(0, 300));
    ok('обектът', t.indexOf('Петрич') >= 0);
    ok('складът', t.indexOf(WH) >= 0);
    ok('датата', t.indexOf('21.09.2026') >= 0);
    ok('И ДВАТА изходящи номера', t.indexOf('ИЗХ-100') >= 0 && t.indexOf('ИЗХ-101') >= 0, t.slice(0, 500));

    const rows = pr(h).querySelectorAll('.lp-tbl tr.lp-row:not(.lp-sum)');
    ok('три артикула — от двата реда', rows.length === 3, String(rows.length));
    ok('от първия документ', t.indexOf('3200123') >= 0 && t.indexOf('ШУРУП 4X40') >= 0);
    ok('от втория документ', t.indexOf('3200124') >= 0 && t.indexOf('ШУРУП 4X50') >= 0);
    ok('в реда на въвеждане', rows[0].textContent.indexOf('3200123') >= 0 &&
      rows[1].textContent.indexOf('5001') >= 0 && rows[2].textContent.indexOf('3200124') >= 0,
      Array.from(rows).map(r => r.textContent).join(' | '));
    ok('номерацията 1..3', Array.from(rows).map(r => r.querySelector('td').textContent).join(',') === '1,2,3');
    ok('кавичката в името е цяла', t.indexOf('ТРЪБА 1/2" PPR') >= 0);
    ok('десетичната запетая', t.indexOf('6,5') >= 0);

    /* Какво НЕ бива да е вътре. */
    ok('НЕ е палет 2', t.indexOf('САМО НА ВТОРИЯ') < 0 && t.indexOf('ИЗХ-102') < 0);
    ok('НЕ е палет 1 на ДРУГ обект', t.indexOf('НА ГОЦЕ ДЕЛЧЕВ') < 0 && t.indexOf('ИЗХ-900') < 0);
    ok('НЕ е рулото', t.indexOf('ИЗОЛАЦИЯ') < 0);

    const sum = pr(h).querySelector('.lp-sum');
    if (ok('ред „Общо"', !!sum)) {
      ok('3 артикула', /Общо: 3 артикула/.test(sum.textContent), sum.textContent);
      /* Кашоните са една мярка — сумират се: 2 + 4 = 6. */
      ok('кашоните се сумират (6)', sum.querySelectorAll('td')[2].textContent === '6', sum.textContent);
      /* Бройките НЕ: палетът смесва бр. и л.м. */
      ok('бройките НЕ се сумират — смесени мерки', sum.querySelectorAll('td')[1].textContent === '',
        sum.querySelectorAll('td')[1].textContent);
    }
    ok('ред за подпис „Товарил"', t.indexOf('Товарил: име и подпис') >= 0);
    ok('и „Приел"', t.indexOf('Приел: име и подпис') >= 0);
    ok('лого', !!pr(h).querySelector('img.lp-logo'));
  }

  section('б) Бутонът „Опис" — по ЕДИН на палет, не на всеки ред');
  {
    const h = env();
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    const all = h.doc.getElementById('mod-loading').querySelectorAll('button[data-u]');
    /* A и B са един палет → 1; C → 1; D (друг обект) → 1; E (руло) → 1. */
    ok('четири бутона за пет реда', all.length === 4, String(all.length));
    ok('палет 1 на Петрич има ЕДИН бутон',
      h.doc.getElementById('mod-loading').querySelectorAll('button[data-u="1"][data-s="Петрич"]').length === 1);
  }

  section('в) Руло без номер — описът е за самия ред');
  {
    const h = env();
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1', 'Петрич', 'E');
    const t = pr(h).textContent;
    ok('заглавието е „Рула", не „Палет"', t.indexOf('Рула') >= 0 && t.indexOf('Палет ') < 0, t.slice(0, 300));
    ok('артикулът на рулото', t.indexOf('ИЗОЛАЦИЯ 10М') >= 0);
    ok('само той', pr(h).querySelectorAll('.lp-tbl tr.lp-row:not(.lp-sum)').length === 1);
    ok('изходящият му номер', t.indexOf('ИЗХ-103') >= 0);
  }

  section('г) Палет без артикули — ясно казано, не празна таблица');
  {
    const h = env();
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    /* Палет 1 на Гоце Делчев, но с изтрити артикули в паметта. */
    h.w.llItems.find(i => i.id === 'D').products = [];
    h.w.llPrint('L1', 'Гоце Делчев', '1');
    ok('„Няма въведени артикули"', pr(h).textContent.indexOf('Няма въведени артикули') >= 0);
    ok('„Палет 1 от 1" — M е на ТОЗИ обект', pr(h).textContent.indexOf('Палет 1 от 1') >= 0,
      pr(h).textContent.slice(0, 300));
  }

  section('д) Непознат палет — червен toast, нищо не се отпечатва');
  {
    const h = env();
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1', 'Петрич', '9');
    ok('toast', h.calls.toast.some(t => /Товарната единица не е намерена/.test(String(t))),
      JSON.stringify(h.calls.toast));
    ok('печатът не е отворен', h.modules.indexOf('print') < 0, JSON.stringify(h.modules));
  }

  section('е) Колоните на описа — сума 190mm, CSS-ът от т.12 е вътре');
  {
    const h = env();
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1', 'Петрич', '1');
    const cols = Array.from(pr(h).querySelectorAll('.lp-tbl colgroup col'))
      .map(c => parseFloat((c.getAttribute('style') || '').replace(/[^\d.]/g, '')));
    ok('шест колони', cols.length === 6, JSON.stringify(cols));
    ok('сумата е точно 190mm', cols.reduce((a, b) => a + b, 0) === 190, JSON.stringify(cols));
    const css = pr(h).innerHTML;
    ok('th white-space:normal (index.html:67)', /\.lp-tbl th\{[^}]*white-space:normal/.test(css));
    ok('box-sizing:border-box на клетките', /\.lp-tbl td\{[^}]*box-sizing:border-box/.test(css));
    ok('долната рамка на последния ред (index.html:69)', /\.lp-tbl tr:last-child td\{border-bottom:1px solid/.test(css));
    ok('един и същ CSS с печата на листа — llPrintCss()', css.indexOf(h.w.llPrintCss()) >= 0);
  }

  section('ж) Печатът на ЦЕЛИЯ лист: артикулите под всеки ред, rowspan-ът ги брои');
  {
    const h = env();
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1', 'Петрич');
    const t = pr(h).textContent;
    ok('целият лист, не опис', !pr(h).querySelector('[data-ll-pallet-print]'));
    const prows = pr(h).querySelectorAll('tr.lp-prow');
    /* Петрич: A, B, C, E — четири реда с артикули. D е на друг обект. */
    ok('четири под-реда с артикули', prows.length === 4, String(prows.length));
    ok('артикулите са вътре', t.indexOf('3200123') >= 0 && t.indexOf('ШУРУП 4X50') >= 0 && t.indexOf('ИЗОЛАЦИЯ') >= 0);
    ok('чуждият обект го няма', t.indexOf('НА ГОЦЕ ДЕЛЧЕВ') < 0);
    ok('кашоните на реда', /\(2 каш\.\)/.test(t), t.slice(0, 800));

    /* Палет 1 на Петрич: A + под-ред, B + под-ред = 4 реда → rowspan 4. */
    const kind = Array.from(pr(h).querySelectorAll('td.lp-kind')).find(td => /палет 1 от 2/.test(td.textContent));
    if (ok('клетката „Вид" за палет 1', !!kind)) {
      ok('rowspan брои и под-редовете (4, не 2)', kind.getAttribute('rowspan') === '4', kind.getAttribute('rowspan'));
    }
    /* Всеки ред на таблицата трябва да покрива точно 7 колони, като се сметне
       rowspan-ът отгоре. Изместена колона дава 6 или 8. */
    const tbl = Array.from(pr(h).querySelectorAll('table.lp-tbl')).find(x => /Стокова №/.test(x.textContent));
    const trs = Array.from(tbl.querySelectorAll('tr')).slice(1);
    let carry = 0, bad = [];
    trs.forEach((tr, idx) => {
      let w = 0;
      Array.from(tr.children).forEach(td => { w += parseInt(td.getAttribute('colspan') || '1', 10); });
      const kindCell = tr.querySelector('td.lp-kind');
      const width = w + (carry > 0 ? 1 : 0);
      if (width !== 7) bad.push(idx + ':' + width);
      if (carry > 0) carry--;
      if (kindCell) carry = parseInt(kindCell.getAttribute('rowspan') || '1', 10) - 1;
    });
    ok('всеки ред покрива точно 7 колони', bad.length === 0, JSON.stringify(bad));
    ok('.lp-plist пречупва дълги имена', /\.lp-plist\{[^}]*white-space:normal/.test(pr(h).innerHTML) &&
      /\.lp-plist\{[^}]*overflow-wrap:break-word/.test(pr(h).innerHTML));
  }

  section('ж2) КОНТРОЛ: rowspan-ът по брой РЕДОВЕ би изместил колоните');
  {
    /* Същата сметка като горе, но с rowspan = брой редове (старото поведение).
       Без този контрол проверката „7 колони" би могла да минава винаги. */
    const h = env();
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1', 'Петрич');
    const tbl = Array.from(pr(h).querySelectorAll('table.lp-tbl')).find(x => /Стокова №/.test(x.textContent));
    const k = Array.from(tbl.querySelectorAll('td.lp-kind')).find(td => /палет 1 от 2/.test(td.textContent));
    k.setAttribute('rowspan', '2');
    const trs = Array.from(tbl.querySelectorAll('tr')).slice(1);
    let carry = 0, bad = 0;
    trs.forEach(tr => {
      let w = 0;
      Array.from(tr.children).forEach(td => { w += parseInt(td.getAttribute('colspan') || '1', 10); });
      if (w + (carry > 0 ? 1 : 0) !== 7) bad++;
      if (carry > 0) carry--;
      const kc = tr.querySelector('td.lp-kind');
      if (kc) carry = parseInt(kc.getAttribute('rowspan') || '1', 10) - 1;
    });
    ok('КОНТРОЛ: със стария rowspan поне един ред е изместен', bad > 0, String(bad));
  }

  report();
})();
