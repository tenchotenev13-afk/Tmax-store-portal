/* „За връщане" → „По разлики": без „Завод" (писмо на Цвети от 14.10.2026).

   Всички редове в „По разлики" са с plant 5521 и обектите се бъркаха.
     · srDocCell(r, true)  („По разлики")    — БЕЗ ред „Завод";
     · srDocCell(r)        („По рекламации") — със „Завод" (кодът на обекта);
     · формата за „По разлики" — няма #sr-plant, решетката е 3 колони;
       формата за „По рекламации" — #sr-plant си стои;
     · запис: редакция в „По разлики" НЕ праща plant (стойността в базата
       остава); нов ред получава 5521, без да се показва;
     · рекламация: plant се пише от полето, както досега.

   Пускане:  node tests/sr-diff-no-plant.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

function row(o) {
  return Object.assign({
    id: 'r-1', source: 'diff', store_name: 'Раднево', supplier: 'КАМ-04',
    product_name: 'АРТИКУЛ', sap_code: '111', quantity: 3,
    order_number: '4100140910', purchase_order: '4200014948', id_euro: '80413769', plant: '5521',
    doc_date: '2026-08-17', withdrawal_date: null, confirmed_date: null,
    expiry_date: null, status: 'pending', reason: '', courier_info: null,
    control_comment: null, controller_comment: null,
    diff_line_id: null, photos: [], created_by: 'Цветелина Тенева'
  }, o);
}
const DIFF = row({ id: 'd-1', product_name: 'РАЗЛИКА', plant: '5521' });
const COMPL = row({ id: 'c-1', source: 'complaint', product_name: 'РЕКЛАМАЦИЯ', order_number: null, plant: '5527', store_name: 'Пловдив' });

function env(tab) {
  const rows = [DIFF, COMPL];
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: { stock_returns: rows, stock_differences: [], differences_reports: [],
            users: [{ store_name: 'Раднево' }, { store_name: 'Пловдив' }] }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = tab;
  h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.w.loadAllSuppliers = () => Promise.resolve([]);
  h.w.renderStockReturns();
  return h;
}
const ov = h => h.doc.getElementById('sr-ov');
const posts = h => h.calls.post.filter(p => p.table === 'stock_returns');
const patches = h => h.calls.patch.filter(p => p.table === 'stock_returns');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const mod = h => h.doc.getElementById('mod-stock-returns');

async function openNew(h, store) {
  realClick(h.w, btn(mod(h), '+ Добави'), '+ Добави в За връщане');
  await ticks(); await ticks();
  h.doc.getElementById('sr-store').value = store;
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

  section('1. srDocCell: „Завод" само без withOrder');
  {
    const h = env('diff');
    const d = h.doc.createElement('tr');
    d.innerHTML = h.w.srDocCell(DIFF, true);
    ok('„По разлики" (withOrder): БЕЗ „Завод"', d.textContent.indexOf('Завод') < 0 && d.textContent.indexOf('5521') < 0, d.textContent);
    ok('„По разлики": поръчка, ПВ-ЕВР и ИД-ЕВРО си стоят',
      /Пор\.\s*4100140910/.test(d.textContent) && /ПВ-ЕВР\s*4200014948/.test(d.textContent) && /ИД-ЕВРО\s*80413769/.test(d.textContent), d.textContent);
    const c = h.doc.createElement('tr');
    c.innerHTML = h.w.srDocCell(COMPL);
    ok('„По рекламации" (без withOrder): със „Завод 5527"', /Завод\s*5527/.test(c.textContent), c.textContent);
    /* Гранично: ред само със завод в „По разлики" → клетката е „—", не празна. */
    const e = h.doc.createElement('tr');
    e.innerHTML = h.w.srDocCell({ plant: '5521' }, true);
    ok('ред само със завод в „По разлики" → „—"', e.textContent.trim() === '—', JSON.stringify(e.textContent));
    h.close();
  }

  section('2. На екрана: таблицата „По разлики" без „Завод", „По рекламации" със');
  {
    const h = env('diff');
    ok('„По разлики": „Завод" никъде в tbody', mod(h).querySelector('tbody').textContent.indexOf('Завод') < 0,
      mod(h).querySelector('tbody').textContent);
    h.close();
    const h2 = env('complaint');
    ok('„По рекламации": „Завод 5527" в tbody', /Завод\s*5527/.test(mod(h2).querySelector('tbody').textContent),
      mod(h2).querySelector('tbody').textContent);
    h2.close();
  }

  section('3. Формата „По разлики": без #sr-plant; нов ред → plant 5521');
  {
    const h = env('diff');
    await openNew(h, 'Раднево');
    if (ok('модалът се отваря', !!ov(h) && ov(h).classList.contains('open'))) {
      ok('няма #sr-plant', !h.doc.getElementById('sr-plant'));
      ok('няма етикет „Завод" във формата',
        !Array.from(ov(h).querySelectorAll('label')).some(l => l.textContent.trim() === 'Завод'));
      const grid = h.doc.getElementById('sr-order').closest('div[style*="grid"]');
      ok('решетката е 3 колони', /grid-template-columns:1fr 1fr 1fr;/.test(grid.getAttribute('style')), grid.getAttribute('style'));
      ok('в нея: Поръчка, НОВА ПВ-ЕВР, НОВА ИД-ЕВРО',
        Array.from(grid.querySelectorAll('label')).map(l => l.textContent).join('|') === 'Поръчка|НОВА ПВ-ЕВР|НОВА ИД-ЕВРО',
        Array.from(grid.querySelectorAll('label')).map(l => l.textContent).join('|'));
      h.doc.getElementById('sr-product').value = 'НОВ АРТИКУЛ';
      await save(h, 'Добави');
      const p = posts(h)[0];
      if (ok('POST към stock_returns', !!p, h.calls.toast.join(' | '))) {
        ok('нов ред: plant = 5521 (без да се показва)', p.body.plant === '5521', JSON.stringify(p.body.plant));
        ok('source = diff', p.body.source === 'diff');
      }
    }
    h.close();
  }

  section('4. Редакция в „По разлики": plant НЕ се праща');
  {
    /* Стойност, различна от 5521 — ако редакцията я пишеше, щеше да се види. */
    const h = env('diff');
    h.w.srData[0].plant = '1210';
    await openEdit(h, 'd-1');
    ok('няма #sr-plant и при редакция', !h.doc.getElementById('sr-plant'));
    await save(h, 'Запази');
    const p = patches(h)[0];
    if (ok('PATCH към stock_returns', !!p, h.calls.toast.join(' | '))) {
      ok('тялото НЕ съдържа plant', !has(p.body, 'plant'), JSON.stringify(p.body));
      ok('PATCH е по id=d-1', /id=eq\.d-1/.test(p.url), p.url);
    }
    h.close();
  }

  section('5. „По рекламации": #sr-plant си стои и се записва');
  {
    const h = env('complaint');
    await openEdit(h, 'c-1');
    const pl = h.doc.getElementById('sr-plant');
    if (ok('#sr-plant е във формата', !!pl)) {
      ok('със стойността на реда (5527)', pl.value === '5527', pl.value);
      pl.value = '5528';
      await save(h, 'Запази');
      const p = patches(h)[0];
      ok('PATCH носи plant = 5528', !!p && p.body.plant === '5528', p && JSON.stringify(p.body.plant));
    }
    h.close();
  }

  report();
})();
