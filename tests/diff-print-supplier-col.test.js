/* Трета количествена колона в ПЕЧАТНАТА бланка — quantity_supplier_doc.

   Полето се показваше в картата на бланката (renderDiffReportsSection) и в
   имейла до доставчика (diffEmailBodyHtml), но НЕ и в печата: на хартия
   стояха само „Кол." и „Получено". Разминаването е тихо — печатът изглежда
   пълен, докато някой не сравни трите изгледа един до друг.

   Колоната е само за посока „доставчик". При междускладов трансфер и при
   сторна по грешен прием стокова разписка на доставчик няма, тоест колоната
   не се рендира изобщо — празна колона на хартия се чете като липсващи данни.

   ЗАЩО СУМАТА НА ШИРИНИТЕ Е ОТДЕЛНА ПРОВЕРКА: .dp-tbl е с
   table-layout:fixed. Надхвърли ли сборът полезните 190mm на A4, браузърът
   не съобщава нищо — последната колона просто изпада извън листа. jsdom не
   смята лейаут, затова се проверява аритметиката на самите атрибути.

   Пускане:  node tests/diff-print-supplier-col.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard } = H;

/* Ширините ОТПРЕДИ промяната. Пътят без доставчик трябва да ги запази
   дословно — иначе „добавих колона" мълчаливо е разместило и печата на
   трансферите, които не съм пипал. */
const BASELINE_10 = [8, 18, 44, 11, 13, 22, 20, 15, 15, 24];

function line(o) {
  return Object.assign({
    id: 'l-1', report_id: 'rep-1',
    store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ',
    quantity: 5, quantity_supplier_doc: 3, quantity_received: 2,
    type: 'return', status: 'pending',
    order_number: null, confirmed_date: null,
    comment: null, resolution_comment: null, attachments: [],
    credit_note_issued: false, difference_category: 'undelivered', unit: 'бр.',
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    warehouse_response: null, warehouse_comment: null, store_corrected_at: null
  }, o);
}

function repOf(direction) {
  return {
    id: 'rep-1', direction: direction, store_name: 'Раднево',
    counterpart: 'ТЕСИ ООД', document_number: '180489966',
    doc_date: '2026-08-17', submitted_by: 'Склад Раднево',
    general_comment: '', created_at: '2026-08-17T08:14:18.000Z',
    photos: [], reviewed: false
  };
}

const ADMIN = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

/* Вдига средата за подадената посока. Печатът се рендира от самия тест. */
function printFor(direction, lines) {
  const rows = lines || [line({})];
  const rep = repOf(direction);
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: ADMIN,
    data: {
      stock_differences: rows, differences_reports: [rep],
      stock_returns: [], transport_orders: [], users: [], stores: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = [JSON.parse(JSON.stringify(rep))];
  h.w.transportOrders = [];
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = direction === 'supplier' ? 'supplier' : 'interstore';
  h.rep = rep;
  return h;
}

/* Заглавията на печатната таблица, само от .dp-tbl (не от .dp-meta). */
const ths = doc =>
  Array.from(doc.querySelectorAll('#mod-print .dp-tbl thead th'));
const thText = doc => ths(doc).map(t => (t.textContent || '').trim());

/* Числото пред "mm" в style="width:NNmm". Връща NaN при липсваща ширина —
   нарочно, за да провали сумата, вместо да я премълчи като 0. */
function widths(doc) {
  return ths(doc).map(t => {
    const m = /width:\s*([\d.]+)mm/.exec(t.getAttribute('style') || '');
    return m ? parseFloat(m[1]) : NaN;
  });
}
const sum = a => a.reduce((x, y) => x + y, 0);

/* Клетките на първия ред от тялото. */
const tds = doc =>
  Array.from(doc.querySelectorAll('#mod-print .dp-tbl tbody tr td'))
    .map(t => (t.textContent || '').trim());

(function run() {

  section('0. Средата и функцията');
  {
    const h = printFor('supplier');
    ok('renderDiffPrint съществува', typeof h.w.renderDiffPrint === 'function');
    ok('#mod-print съществува', !!h.w.document.getElementById('mod-print'));
    h.close();
  }

  section('1. Посока „доставчик" — 11 колони, „Стокова" е петата');
  {
    const h = printFor('supplier');
    const doc = h.w.document;
    if (guard('renderDiffPrint() не хвърля', () => h.w.renderDiffPrint(h.rep))) {
      const t = thText(doc);
      const wds = widths(doc);
      ok('11 заглавия в .dp-tbl', t.length === 11, 'реално ' + t.length + ': ' + t.join('|'));
      ok('петото заглавие е „Стокова"', t[4] === 'Стокова', String(t[4]));
      ok('единайсетото заглавие е „Коментар"', t[10] === 'Коментар', String(t[10]));
      ok('редът е Кол. | Стокова | Получено',
        t[3] === 'Кол.' && t[4] === 'Стокова' && t[5] === 'Получено',
        t.slice(3, 6).join(' | '));
      ok('всяка колона има ширина в mm', wds.every(x => !isNaN(x)), wds.join(','));
      ok('сумата на ширините е точно 190mm', sum(wds) === 190,
        'реално ' + sum(wds) + 'mm: ' + wds.join('+'));
      ok('ширините са зададените',
        wds.join(',') === '8,18,36,11,13,13,20,19,15,15,22', wds.join(','));

      const c = tds(doc);
      ok('редът има 11 клетки', c.length === 11, 'реално ' + c.length);
      ok('петата клетка носи quantity_supplier_doc (3)', c[4] === '3', String(c[4]));
      ok('четвъртата остава quantity (5)', c[3] === '5', String(c[3]));
      ok('шестата остава quantity_received (2)', c[5] === '2', String(c[5]));
    }
    h.close();
  }

  section('2. Междускладов трансфер — 10 колони, без „Стокова"');
  {
    const h = printFor('interstore');
    const doc = h.w.document;
    if (guard('renderDiffPrint() не хвърля', () => h.w.renderDiffPrint(h.rep))) {
      const t = thText(doc);
      const wds = widths(doc);
      ok('10 заглавия', t.length === 10, 'реално ' + t.length + ': ' + t.join('|'));
      ok('„Стокова" НЕ присъства', t.indexOf('Стокова') < 0, t.join('|'));
      ok('сумата на ширините е точно 190mm', sum(wds) === 190,
        'реално ' + sum(wds) + 'mm: ' + wds.join('+'));
      ok('ширините са ИДЕНТИЧНИ с тези отпреди промяната',
        wds.join(',') === BASELINE_10.join(','),
        'сега ' + wds.join(',') + ' срещу ' + BASELINE_10.join(','));
      ok('редът има 10 клетки', tds(doc).length === 10, 'реално ' + tds(doc).length);
    }
    h.close();
  }

  section('3. Сторна по грешен прием — 10 колони, етикети от diffQtyLabels');
  {
    const h = printFor('wrong_receipt');
    const doc = h.w.document;
    if (guard('renderDiffPrint() не хвърля', () => h.w.renderDiffPrint(h.rep))) {
      const t = thText(doc);
      const wds = widths(doc);
      ok('10 заглавия', t.length === 10, 'реално ' + t.length + ': ' + t.join('|'));
      ok('„Стокова" НЕ присъства', t.indexOf('Стокова') < 0, t.join('|'));
      ok('четвъртото заглавие е „Фактура"', t[3] === 'Фактура', String(t[3]));
      ok('петото заглавие е „Заприх."', t[4] === 'Заприх.', String(t[4]));
      ok('сумата на ширините е точно 190mm', sum(wds) === 190,
        'реално ' + sum(wds) + 'mm: ' + wds.join('+'));
      ok('ширините са ИДЕНТИЧНИ с тези отпреди промяната',
        wds.join(',') === BASELINE_10.join(','), wds.join(','));
    }
    h.close();
  }

  section('4. Непозната посока — колоната не се рендира');
  {
    /* 'transfer' НЕ е ключ в DIFF_DIRECTIONS (истинският е 'interstore').
       Регистърът пада на [0] = доставчик за ЕТИКЕТИТЕ, но printSupplierDoc
       сравнява строго със 'supplier', тоест колоната остава скрита. Тестът
       заковава коя от двете логики важи, за да не се разминат мълчаливо. */
    const h = printFor('transfer');
    const doc = h.w.document;
    if (guard('renderDiffPrint() не хвърля', () => h.w.renderDiffPrint(h.rep))) {
      const t = thText(doc);
      ok('10 заглавия при непозната посока', t.length === 10, 'реално ' + t.length);
      ok('„Стокова" НЕ присъства', t.indexOf('Стокова') < 0, t.join('|'));
      ok('сумата е 190mm', sum(widths(doc)) === 190, String(sum(widths(doc))));
    }
    h.close();
  }

  section('5. quantity_supplier_doc = null → тире, не „null"');
  {
    const h = printFor('supplier', [line({ quantity_supplier_doc: null })]);
    const doc = h.w.document;
    if (guard('renderDiffPrint() не хвърля', () => h.w.renderDiffPrint(h.rep))) {
      const c = tds(doc);
      ok('петата клетка е тире', c[4] === '—', String(c[4]));
      ok('никъде не пише „null"',
        (doc.getElementById('mod-print').textContent || '').indexOf('null') < 0);
    }
    h.close();
  }

  section('6. quantity_supplier_doc = 0 → „0", НЕ тире');
  {
    /* Класическият капан: `l.quantity_supplier_doc ? … : '—'` би скрил
       нулата, а 0 е валидно количество — точно то значи „по стоковата няма
       нищо по този артикул". Проверката трябва да е != null. */
    const h = printFor('supplier', [line({ quantity_supplier_doc: 0 })]);
    const doc = h.w.document;
    if (guard('renderDiffPrint() не хвърля', () => h.w.renderDiffPrint(h.rep))) {
      const c = tds(doc);
      ok('петата клетка е „0"', c[4] === '0', String(c[4]));
      ok('петата клетка НЕ е тире', c[4] !== '—', String(c[4]));
    }
    h.close();
  }

  section('7. Бланка без редове — colspan следва броя колони');
  {
    const hs = printFor('supplier', []);
    if (guard('доставчик: renderDiffPrint() не хвърля', () => hs.w.renderDiffPrint(hs.rep))) {
      const cell = hs.w.document.querySelector('#mod-print .dp-tbl tbody td');
      if (ok('празната клетка съществува', !!cell)) {
        ok('colspan е 11 при доставчик', cell.getAttribute('colspan') === '11',
          String(cell.getAttribute('colspan')));
      }
    }
    hs.close();

    const hi = printFor('interstore', []);
    if (guard('трансфер: renderDiffPrint() не хвърля', () => hi.w.renderDiffPrint(hi.rep))) {
      const cell = hi.w.document.querySelector('#mod-print .dp-tbl tbody td');
      if (ok('празната клетка съществува', !!cell)) {
        ok('colspan е 10 при трансфер', cell.getAttribute('colspan') === '10',
          String(cell.getAttribute('colspan')));
      }
    }
    hi.close();
  }

  report();
})();
