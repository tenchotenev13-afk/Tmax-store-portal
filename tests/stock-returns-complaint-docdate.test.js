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
/* Ред „<етикет> <стойност>" от клетката „Документ“ (компактна таблица „За връщане“). */
const docLine = (td, label) => { const d = Array.prototype.find.call(td.querySelectorAll('div'), x => x.textContent.trim().indexOf(label) === 0); return d ? d.textContent.trim().slice(label.length).trim() : ''; };
/* Клетките (елементи) на реда по ПВ-ЕВР — първата клетка е „Документ“. */
const cellsOf = (doc, po) => {
  const tr = Array.prototype.find.call(table(doc).querySelectorAll('tbody tr'), t => docLine(t.children[0], 'ПВ-ЕВР') === po);
  return tr ? Array.prototype.slice.call(tr.querySelectorAll('td')) : null;
};

(async function run() {

  section('а) Датата на документа е ред „Док.“ в клетката „Документ“, до завода; без дата няма такъв ред');
  {
    const { w, doc } = env([
      row({ id: 'c-1', purchase_order: '4200015982', doc_date: '2026-08-17', plant: '1210' }),
      row({ id: 'c-2', purchase_order: '4200016001', doc_date: null, plant: '1203' })
    ]);
    if (guard('renderStockReturns() не хвърля', () => w.renderStockReturns())) {
      const H_ = heads(doc);

ok('заглавия на „По рекламации“: Документ|Магазин · Доставчик|Статус|Коментари|Действия', H_.join('|') === 'Документ|Магазин · Доставчик|Статус|Коментари|Действия', H_.join('|'));

      const a = cellsOf(doc, '4200015982');
      if (ok('редът с дата е на екрана', !!a)) {
ok('датата е в клетката „Документ“, в дд.мм.гггг', docLine(a[0], 'Док.') === '17.08.2026', JSON.stringify(docLine(a[0], 'Док.')));
ok('доставчикът е в „Магазин · Доставчик“, а заводът — в „Документ“', /КАМ-04/.test(a[1].textContent) && docLine(a[0], 'Завод') === '1210',
          JSON.stringify([a[1].textContent, docLine(a[0], 'Завод')]));
      }
      const b = cellsOf(doc, '4200016001');
      if (ok('редът без дата е на екрана', !!b)) {
ok('без дата няма ред „Док.“', docLine(b[0], 'Док.') === '', JSON.stringify(docLine(b[0], 'Док.')));
ok('заводът не е изместен', docLine(b[0], 'Завод') === '1203', JSON.stringify(docLine(b[0], 'Завод')));
      }
      const nTh = table(doc).querySelectorAll('thead th').length;
      const rowsTd = Array.prototype.map.call(table(doc).querySelectorAll('tbody tr'), tr => tr.querySelectorAll('td').length);
      ok('броят <th> (' + nTh + ') = броят <td> на всеки ред', rowsTd.every(n => n === nTh), rowsTd.join(','));
ok('колоните са 5 (Документ, Магазин · Доставчик, Статус, Коментари, Действия)', nTh === 5, String(nTh));
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
          const c = cellsOf(doc, '4200015982');
ok('след презареждането таблицата показва 03.09.2026 в „Документ“', c && docLine(c[0], 'Док.') === '03.09.2026', c && JSON.stringify(docLine(c[0], 'Док.')));
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
    /* + „Потвърдена акт." и „Коментар обект" от 30.09.2026 (sr-diff-tab-columns). */
    ok('заглавията на „По разлики“ — 6 колони (компактна таблица)',
      H_.join('|') === 'Артикул|Документ|Магазин · Доставчик|Статус|Коментари|Действия',
      H_.join('|'));
  }

  report();
})();
