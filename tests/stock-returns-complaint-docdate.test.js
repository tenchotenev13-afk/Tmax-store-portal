/* „За връщане" → „По рекламации": колона „Дата докум." между „Доставчик" и
   „Завод" — същото място като във файла на Цвети и в Excel износа (колона 3).
   (Точка 3 от Цвети.)

   До тази промяна полето „Дата на документ" съществуваше само в модала на
   „По разлики" и submitSR() записваше doc_date само там — в рекламациите
   датата нито се виждаше, нито се редактираше. Сега и двете.

   Пускане:  node tests/stock-returns-complaint-docdate.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

function row(o) {
  return Object.assign({
    id: 'r-1', source: 'complaint', store_name: 'Раднево', supplier: 'КАМ-04',
    product_name: null, sap_code: null, quantity: null,
    order_number: null, purchase_order: null, id_euro: null, plant: '1210',
    doc_date: null, withdrawal_date: null, confirmed_date: null,
    expiry_date: null, status: 'pending', reason: null, courier_info: null,
    control_comment: null, controller_comment: null,
    diff_line_id: null, photos: [], created_by: 'Цветелина Тенева'
  }, o);
}

/* „Базата": GET връща DB, а PATCH по id=eq.X се прилага върху нея, за да
   види презареждането след запис новата стойност — както на живо. */
function env(rows, tab) {
  const DB = JSON.parse(JSON.stringify(rows));
  let h;
  const applyPatches = () => {
    (h ? h.calls.patch : []).forEach(p => {
      const m = /id=eq\.([^&]+)/.exec(p.url);
      const r = m && DB.find(x => String(x.id) === decodeURIComponent(m[1]));
      if (r && !p.__applied) { Object.assign(r, p.body); p.__applied = true; }
    });
  };
  h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: {
      stock_returns: () => { applyPatches(); return JSON.parse(JSON.stringify(DB)); },
      stock_differences: [], differences_reports: [],
      /* Селектът за магазин в модала се пълни от users.store_name. */
      users: [{ store_name: 'Раднево' }, { store_name: 'Враца' }]
    }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = tab || 'complaint';
  h.w.srFilter = 'all';
  h.w.srStoreFilter = '';
  h.w.srSupplierFilter = '';
  h.w.srSearch = '';
  h.DB = DB;
  h.w.loadAllSuppliers = () => Promise.resolve([]);
  return h;
}

const settle = () => new Promise(res => setTimeout(res, 60));
const table = doc => doc.getElementById('mod-stock-returns').querySelector('table');
const heads = doc => Array.prototype.map.call(table(doc).querySelectorAll('thead th'), th => th.textContent.trim());
const cellsOf = (doc, po) => {
  const tr = Array.prototype.find.call(table(doc).querySelectorAll('tbody tr'),
    t => t.querySelector('td').textContent.trim() === po);
  return tr ? Array.prototype.map.call(tr.querySelectorAll('td'), td => td.textContent.trim()) : null;
};

(async function run() {

  section('а) Колоната е между „Доставчик" и „Завод", с датата или „—"');
  {
    const { w, doc } = env([
      row({ id: 'c-1', purchase_order: '4200015982', doc_date: '2026-08-17', plant: '1210' }),
      row({ id: 'c-2', purchase_order: '4200016001', doc_date: null, plant: '1203' })
    ]);
    if (guard('renderStockReturns() не хвърля', () => w.renderStockReturns())) {
      const H_ = heads(doc);
      const i = H_.indexOf('Дата докум.');
      ok('заглавието „Дата докум." е точно след „Доставчик" и преди „Завод"',
        i > 0 && H_[i - 1] === 'Доставчик' && H_[i + 1] === 'Завод', H_.join('|'));

      const a = cellsOf(doc, '4200015982');
      if (ok('редът с дата е на екрана', !!a)) {
        ok('датата е в същата колона, в дд.мм.гггг', a[i] === '17.08.2026', JSON.stringify(a[i]));
        ok('съседите са доставчикът и заводът', a[i - 1] === 'КАМ-04' && a[i + 1] === '1210',
          JSON.stringify([a[i - 1], a[i + 1]]));
      }
      const b = cellsOf(doc, '4200016001');
      if (ok('редът без дата е на екрана', !!b)) {
        ok('празната дата е „—"', b[i] === '—', JSON.stringify(b[i]));
        ok('заводът не е изместен', b[i + 1] === '1203', JSON.stringify(b[i + 1]));
      }
      const nTh = table(doc).querySelectorAll('thead th').length;
      const rowsTd = Array.prototype.map.call(table(doc).querySelectorAll('tbody tr'), tr => tr.querySelectorAll('td').length);
      ok('броят <th> (' + nTh + ') = броят <td> на всеки ред', rowsTd.every(n => n === nTh), rowsTd.join(','));
      ok('колоните са 12 (11 + действия)', nTh === 12, String(nTh));
    }
  }

  section('б) Редакция през модала → новата дата се вижда в таблицата след запис');
  {
    const { w, doc, calls } = env([
      row({ id: 'c-1', purchase_order: '4200015982', doc_date: null, supplier: 'КАМ-04' })
    ]);
    w.renderStockReturns();
    const tr = table(doc).querySelector('tbody tr');
    const edit = Array.prototype.find.call(tr.querySelectorAll('button'), b => b.textContent.trim() === '✏️');
    if (ok('бутонът ✏️ е на реда', !!edit)) {
      realClick(w, edit);
      await settle();
      const inp = doc.getElementById('sr-docdate');
      if (ok('в модала на рекламациите има поле „Дата на документ"', !!inp)) {
        ok('полето е празно за ред без дата', inp.value === '', JSON.stringify(inp.value));
        inp.value = '2026-09-03';
        const save = btn(doc, 'Запази');
        if (ok('бутонът „Запази" е на екрана', !!save)) {
          realClick(w, save);
          await settle();
          const p = calls.patch.find(x => /stock_returns/.test(x.url));
          if (ok('има PATCH към stock_returns', !!p, JSON.stringify(calls.patch.map(x => x.url)))) {
            ok('PATCH-ът е по id на реда', p.url.indexOf('id=eq.c-1') >= 0, p.url);
            ok('носи doc_date = 2026-09-03', p.body.doc_date === '2026-09-03', JSON.stringify(p.body.doc_date));
          }
          const H_ = heads(doc);
          const c = cellsOf(doc, '4200015982');
          ok('след презареждането таблицата показва 03.09.2026 в „Дата докум."',
            c && c[H_.indexOf('Дата докум.')] === '03.09.2026', JSON.stringify(c));
        }
      }
    }
  }

  section('в) Редакция на ред С дата, без да се пипа полето → датата се пази');
  {
    const { w, doc, calls } = env([
      row({ id: 'c-7', purchase_order: '4200017000', doc_date: '2026-07-01' })
    ]);
    w.renderStockReturns();
    w.openSRModal('c-7');
    await settle();
    const inp = doc.getElementById('sr-docdate');
    ok('полето е предпопълнено със записаната дата', inp && inp.value === '2026-07-01', JSON.stringify(inp && inp.value));
    realClick(w, btn(doc, 'Запази'));
    await settle();
    const p = calls.patch.find(x => /stock_returns/.test(x.url));
    ok('PATCH-ът връща същата дата, не null', p && p.body.doc_date === '2026-07-01', JSON.stringify(p && p.body.doc_date));
  }

  section('г) „По разлики" не е пипан: колоната си е на старото място');
  {
    const { w, doc } = env([row({ id: 'd-1', source: 'diff', purchase_order: 'PV-1', doc_date: '2026-08-17' })], 'diff');
    w.renderStockReturns();
    const H_ = heads(doc);
    ok('заглавията на „По разлики" са непроменени',
      H_.join('|') === 'Продукт|SAP|Кол.|Поръчка|ПВ-ЕВР|ИД-ЕВРО|Магазин|Доставчик|Дата докум.|Завод|Статус|Дата изтегляне|Изтеглена с|Коментар|',
      H_.join('|'));
  }

  report();
})();
