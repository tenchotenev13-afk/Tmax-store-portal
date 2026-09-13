/* „За връщане": поле „Поръчка" за ръчни редове + доставчик от справочника.

   order_number се пълнеше само от разликата (submitSD синхронизира реда в
   stock_returns). Ръчен ред в „По разлики" (без diff_line_id) нямаше откъде
   да го получи — колоната стоеше „—" завинаги.
     · ръчен ред     — #sr-order е редактируемо и submitSR го праща;
     · ред от разлика — #sr-order е само за четене и order_number НЕ се праща,
                        за да остане submitSD единственият източник;
     · „По рекламации" — полето го няма.

   „Доставчик" беше свободен текст и раждаше нови варианти на едно име. Сега
   има datalist от loadAllSuppliers() — свободният текст остава възможен.

   Пускане:  node tests/stock-returns-manual-order.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};
/* Второто име е с кавички — опциите не бива да се чупят в атрибута. */
const SUPPLIERS = ['ДЕНИ-А 8583 ООД', 'ИНТЕР КЕРАМИК "ТРЕЙДИНГ" ООД'];

function row(o) {
  return Object.assign({
    id: 'r-1', source: 'diff', store_name: 'Раднево', supplier: 'КАМ-04',
    product_name: 'АРТИКУЛ', sap_code: '111', quantity: 3,
    order_number: null, purchase_order: null, id_euro: null, plant: '5521',
    doc_date: '2026-08-17', withdrawal_date: null, confirmed_date: null,
    expiry_date: null, status: 'pending', reason: '', courier_info: null,
    control_comment: null, controller_comment: null,
    diff_line_id: null, photos: [], created_by: 'Цветелина Тенева'
  }, o);
}
const MANUAL   = row({ id: 'm-1', product_name: 'РЪЧЕН С НОМЕР', order_number: '4100140910' });
const MANUAL0  = row({ id: 'm-0', product_name: 'РЪЧЕН БЕЗ НОМЕР' });
const FROMDIFF = row({ id: 'd-1', product_name: 'ОТ РАЗЛИКА', diff_line_id: 'dl-1', order_number: '4100196440' });

function env(tab) {
  const rows = [MANUAL, MANUAL0, FROMDIFF, row({ id: 'c-1', source: 'complaint', product_name: 'РЕКЛАМАЦИЯ' })];
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: { stock_returns: rows, stock_differences: [], differences_reports: [],
            users: [{ store_name: 'Раднево' }, { store_name: 'Враца' }] }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = tab || 'diff';
  h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.suppliersCalls = 0;
  h.w.loadAllSuppliers = () => { h.suppliersCalls++; return Promise.resolve(SUPPLIERS.slice()); };
  h.w.renderStockReturns();
  return h;
}
const ov = h => h.doc.getElementById('sr-ov');
const posts = h => h.calls.post.filter(p => p.table === 'stock_returns');
const patches = h => h.calls.patch.filter(p => p.table === 'stock_returns');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

async function openNew(h) {
  /* В модула, не в целия документ - index.html има и друг „+ Добави" (doc-modal). */
  realClick(h.w, btn(h.doc.getElementById('mod-stock-returns'), '+ Добави'), '+ Добави в За връщане');
  await ticks(); await ticks();
  h.doc.getElementById('sr-store').value = 'Раднево';
}
async function openEdit(h, id) {
  const b = Array.from(h.doc.querySelectorAll('button[data-id="' + id + '"]'))
    .find(x => (x.getAttribute('onclick') || '').indexOf('openSRModal') >= 0);
  if (!b) throw new Error('няма ✏️ за ' + id);
  realClick(h.w, b);
  await ticks(); await ticks();
}
async function save(h, label) {
  realClick(h.w, btn(ov(h), label));
  await ticks(); await ticks();
}

(async function run() {

  section('а) „+ Добави" в „По разлики" → #sr-order редактируемо, POST носи стойността');
  {
    const h = env('diff');
    await openNew(h);
    if (ok('модалът се отваря', !!ov(h) && ov(h).classList.contains('open'))) {
      const o = h.doc.getElementById('sr-order');
      if (ok('#sr-order съществува', !!o)) {
        ok('и е редактируемо', o.readOnly === false && !o.hasAttribute('readonly'), o.outerHTML);
        ok('placeholder „напр. 4100196440"', o.getAttribute('placeholder') === 'напр. 4100196440');
        ok('празно при нов запис', o.value === '', JSON.stringify(o.value));
        ok('етикетът е „Поръчка"', o.parentNode.querySelector('label').textContent === 'Поръчка');
        ok('стои в реда с ПВ-ЕВР / ИД-ЕВРО / Завод',
          ['sr-po', 'sr-ie', 'sr-plant'].every(id => o.closest('div[style*="grid"]').querySelector('#' + id)));
        o.value = ' 4100196440 ';
        h.doc.getElementById('sr-product').value = 'НОВ АРТИКУЛ';
        await save(h, 'Добави');
        const p = posts(h)[0];
        if (ok('POST към stock_returns', !!p, h.calls.toast.join(' | '))) {
          ok('order_number = "4100196440" (без интервалите)', p.body.order_number === '4100196440', JSON.stringify(p.body.order_number));
          ok('source = diff', p.body.source === 'diff');
        }
      }
    }
  }
  {
    const h = env('diff');
    await openNew(h);
    h.doc.getElementById('sr-product').value = 'НОВ БЕЗ НОМЕР';
    await save(h, 'Добави');
    const p = posts(h)[0];
    if (ok('празно поле → POST', !!p, h.calls.toast.join(' | '))) {
      ok('order_number е null (ключът го има)', has(p.body, 'order_number') && p.body.order_number === null,
        JSON.stringify(p.body.order_number));
    }
  }

  section('б) Редакция на ръчен ред → PATCH носи order_number');
  {
    const h = env('diff');
    await openEdit(h, 'm-1');
    const o = h.doc.getElementById('sr-order');
    if (ok('#sr-order показва записания номер 4100140910', !!o && o.value === '4100140910', o && o.value)) {
      ok('редактируемо', o.readOnly === false);
      o.value = '4100201671';
      await save(h, 'Запази');
      const p = patches(h)[0];
      if (ok('PATCH към stock_returns', !!p, h.calls.toast.join(' | '))) {
        ok('order_number = "4100201671"', p.body.order_number === '4100201671', JSON.stringify(p.body.order_number));
        ok('към правилния ред', /id=eq\.m-1/.test(p.query || p.url || ''), p.query || p.url);
      }
    }
  }
  {
    const h = env('diff');
    await openEdit(h, 'm-0');
    const o0 = h.doc.getElementById('sr-order');
    if (ok('ръчен ред без номер: #sr-order е в модала', !!o0)) {
      o0.value = '4100140911';
      await save(h, 'Запази');
      const p = patches(h)[0];
      ok('ръчен ред без номер → PATCH с новия номер', !!p && p.body.order_number === '4100140911', p && JSON.stringify(p.body.order_number));
    }
  }

  section('в) Редакция на ред с diff_line_id → readonly, PATCH БЕЗ order_number');
  {
    const h = env('diff');
    await openEdit(h, 'd-1');
    const o = h.doc.getElementById('sr-order');
    if (ok('#sr-order съществува', !!o)) {
      ok('readonly', o.readOnly === true, o.outerHTML);
      ok('title „Идва от разликата — редактира се в Разлики"', o.getAttribute('title') === 'Идва от разликата — редактира се в Разлики');
      ok('показва номера от разликата 4100196440', o.value === '4100196440');
      /* дори някой да смени стойността в DOM-а (devtools), записът не я праща */
      o.value = '9999999999';
      await save(h, 'Запази');
      const p = patches(h)[0];
      if (ok('PATCH към stock_returns', !!p, h.calls.toast.join(' | '))) {
        ok('PATCH НЕ носи order_number', !has(p.body, 'order_number'), JSON.stringify(p.body.order_number));
      }
    }
  }

  section('г) „По рекламации" → няма #sr-order, POST без order_number');
  {
    const h = env('complaint');
    await openNew(h);
    ok('#sr-order го няма', !h.doc.getElementById('sr-order'));
    ok('модалът е за рекламация', !!h.doc.getElementById('sr-expiry'));
    await save(h, 'Добави');
    const p = posts(h)[0];
    if (ok('POST към stock_returns', !!p, h.calls.toast.join(' | '))) {
      ok('source = complaint', p.body.source === 'complaint');
      ok('POST НЕ носи order_number', !has(p.body, 'order_number'), JSON.stringify(p.body.order_number));
    }
  }

  section('д) „Доставчик" има подсказки от loadAllSuppliers (и в двата подтаба)');
  for (const tab of ['diff', 'complaint']) {
    const h = env(tab);
    await openNew(h);
    await ticks();
    const s = h.doc.getElementById('sr-supplier');
    const dl = h.doc.getElementById('sr-supplier-list');
    ok('[' + tab + '] #sr-supplier има list="sr-supplier-list"', !!s && s.getAttribute('list') === 'sr-supplier-list', s && s.outerHTML);
    ok('[' + tab + '] <datalist id="sr-supplier-list"> е в модала', !!dl && dl.tagName === 'DATALIST' && ov(h).contains(dl));
    ok('[' + tab + '] loadAllSuppliers е извикана', h.suppliersCalls >= 1, String(h.suppliersCalls));
    const vals = dl ? Array.from(dl.querySelectorAll('option')).map(x => x.value) : [];
    ok('[' + tab + '] опциите са точно двете имена (вкл. кавичките)', JSON.stringify(vals) === JSON.stringify(SUPPLIERS), JSON.stringify(vals));
    ok('[' + tab + '] при нов запис полето е празно, не „—"', !!s && s.value === '', s && JSON.stringify(s.value));
    ok('[' + tab + '] свободният текст остава - полето е <input>, не <select>', !!s && s.tagName === 'INPUT');
  }
  {
    const h = env('diff');
    await openEdit(h, 'm-1');
    ok('при редакция полето показва записания доставчик', h.doc.getElementById('sr-supplier').value === 'КАМ-04');
  }

  report();
})();
