/* Разлики: постоянни надписи над полетата за количество във формата (01.10.2026).

   При „Доставчик" редът има 4 полета и подсказките се режеха („Количество
   по…", „По стокова на…"), а щом се впише число — изчезваха. Сега всяко
   поле има надпис НАД себе си (diffQtyLabels().form*), а в полето е само
   „бр.". Думите са като на хартиената бланка:
     · Доставчик:    По входяща доставка (бр.) · По стокова на доставчика (бр.)
                     · Реално получено (бр.) · Мярка
     · Междускладов: По входяща доставка (бр.) · Реално получено (бр.) · Мярка
     · Сторна:       Количество по фактура (бр.) · Реално заприходено (бр.) · Мярка
   Смяна на посоката пре-рендира редовете: надписите се сменят, стойностите
   остават. Лейаутът при ~380px е измерен в Chrome при разработката —
   jsdom не смята ширини.

   Пускане:  node tests/diff-form-qty-labels.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

const WANT = {
  supplier:      [['di-qty', 'По входяща доставка (бр.)'], ['di-qty-supdoc', 'По стокова на доставчика (бр.)'],
                  ['di-qty-real', 'Реално получено (бр.)'], ['di-unit', 'Мярка']],
  interstore:    [['di-qty', 'По входяща доставка (бр.)'], ['di-qty-real', 'Реално получено (бр.)'], ['di-unit', 'Мярка']],
  wrong_receipt: [['di-qty', 'Количество по фактура (бр.)'], ['di-qty-real', 'Реално заприходено (бр.)'], ['di-unit', 'Мярка']]
};

function env() {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'], user: CVETI, confirm: true,
    data: { stock_differences: [], differences_reports: [], stock_returns: [], transport_orders: [],
      users: [{ store_name: 'Враца' }], contacts: [], stores: [], stock_diff_swaps: [] }
  });
  h.w.sdData = []; h.w.diffReports = []; h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'supplier';
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД']);
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 6; i++) await ticks(); };
/* [клас на контролата, надпис] в реда на мрежата, за първия ред артикул. */
function fields(h, rowIdx) {
  const row = h.doc.querySelectorAll('#diff-items .diff-item-row')[rowIdx || 0];
  return Array.prototype.map.call(row.querySelectorAll('.di-fld'), f => {
    const c = f.querySelector('input,select');
    return [c ? c.className.replace('fi ', '') : null, f.querySelector('.di-lbl').textContent];
  });
}
async function setDir(h, d) {
  const dir = h.doc.getElementById('diff-direction');
  dir.value = d; fire(h.w, dir, 'change');
  await settle();
}

(async function run() {

  const h = env();
  realClick(h.w, btn(h.doc.getElementById('mod-stock-diff'), '📝 Подай бланка'));
  await settle();

  section('1. Надписите за всяка посока — точно тези, в реда на полетата');
  for (const d of ['interstore', 'supplier', 'wrong_receipt']) {
    await setDir(h, d);
    const got = fields(h);
    ok('[' + d + '] надписи и полета', JSON.stringify(got) === JSON.stringify(WANT[d]), JSON.stringify(got));
    const qtyPh = Array.prototype.map.call(h.doc.querySelectorAll('#diff-items .diff-item-row:first-child input[type="number"]'),
      i => i.getAttribute('placeholder'));
    ok('[' + d + '] в полетата за количество подсказката е само „бр."', qtyPh.length > 0 && qtyPh.every(p => p === 'бр.'), JSON.stringify(qtyPh));
    ok('[' + d + '] всеки надпис съдържа „(бр.)", освен „Мярка"',
      got.every(([c, l]) => c === 'di-unit' ? l === 'Мярка' : l.indexOf('(бр.)') >= 0));
    ok('[' + d + '] мрежата е с толкова колони, колкото полета',
      h.doc.querySelector('#diff-items .di-fld').parentNode.getAttribute('style').indexOf('repeat(' + WANT[d].length + ',') >= 0);
  }

  section('2. Думите идват от diffQtyLabels() — едно място');
  {
    const q = h.w.diffQtyLabels;
    ok('supplier: formDoc/formSupDoc/formReal/unit',
      q('supplier').formDoc === WANT.supplier[0][1] && q('supplier').formSupDoc === WANT.supplier[1][1] &&
      q('supplier').formReal === WANT.supplier[2][1] && q('supplier').unit === 'Мярка');
    ok('wrong_receipt: formDoc = doc, formReal = real',
      q('wrong_receipt').formDoc === q('wrong_receipt').doc && q('wrong_receipt').formReal === q('wrong_receipt').real);
    ok('печатът/таблиците не са пипани (doc/docShort/printDoc)',
      q('supplier').doc === 'Количество по входяща (бр.)' && q('supplier').docShort === 'Кол. по входяща' && q('supplier').printDoc === 'Кол.');
  }

  section('3. Смяна на посоката: надписите се сменят, стойностите остават');
  {
    await setDir(h, 'supplier');
    realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), '+ Добави артикул'));
    const r = () => h.doc.querySelectorAll('#diff-items .diff-item-row');
    r()[0].querySelector('.di-name').value = 'ЛАЙСНА';
    r()[0].querySelector('.di-qty').value = '7';
    r()[0].querySelector('.di-qty-supdoc').value = '8';
    r()[0].querySelector('.di-qty-real').value = '6';
    r()[0].querySelector('.di-unit').value = 'кашон';
    r()[1].querySelector('.di-name').value = 'ЩУЦЕР';
    r()[1].querySelector('.di-qty').value = '2';
    await setDir(h, 'wrong_receipt');
    ok('→ сторна: надписите на реда 1 са на сторната', JSON.stringify(fields(h, 0)) === JSON.stringify(WANT.wrong_receipt), JSON.stringify(fields(h, 0)));
    ok('→ сторна: и на ред 2', JSON.stringify(fields(h, 1)) === JSON.stringify(WANT.wrong_receipt));
    ok('→ сторна: стойностите остават (7 / 6 / кашон, ред 2: 2)',
      r()[0].querySelector('.di-qty').value === '7' && r()[0].querySelector('.di-qty-real').value === '6' &&
      r()[0].querySelector('.di-unit').value === 'кашон' && r()[1].querySelector('.di-qty').value === '2' &&
      r()[0].querySelector('.di-name').value === 'ЛАЙСНА');
    ok('→ сторна: няма „По стокова"', !h.doc.querySelector('#diff-items .di-qty-supdoc'));
    await setDir(h, 'interstore');
    ok('→ междускладов: надписите', JSON.stringify(fields(h, 0)) === JSON.stringify(WANT.interstore), JSON.stringify(fields(h, 0)));
    ok('→ междускладов: стойностите остават', r()[0].querySelector('.di-qty').value === '7' && r()[0].querySelector('.di-qty-real').value === '6');
    await setDir(h, 'supplier');
    ok('→ доставчик: четирите надписа', JSON.stringify(fields(h, 0)) === JSON.stringify(WANT.supplier), JSON.stringify(fields(h, 0)));
    ok('→ доставчик: 7 / 6 остават', r()[0].querySelector('.di-qty').value === '7' && r()[0].querySelector('.di-qty-real').value === '6');
  }

  h.close();
  report();
})().catch(e => { console.error(e); process.exit(1); });
