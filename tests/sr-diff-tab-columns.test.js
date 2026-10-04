/* „За връщане" → „По разлики": колони „Потвърдена акт." и „Коментар обект".
   (30.09.2026.)

   Импортът за „По разлики" (srImportDiffList) пише confirmed_date и
   store_comment, но таблицата и модалът на този подтаб ги нямаха — Цвети не
   виждаше нито датите, нито текста на обектите.
     · таблицата: двете колони след „Изтеглена с", преди „Коментар" (както в
       „По рекламации"); празна дата — „—";
     · модалът: „Коментар обект" и тук (датата вече е в общата част);
       редактират магазинът и Цвети/admin;
     · търсенето по store_comment важи и тук;
     · Excel на „По разлики": двете колони на същото място;
     · „По рекламации" — без промяна.
   Данните са в самия тест — без git история.

   Пускане:  node tests/sr-diff-tab-columns.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'radnevo@temax.bg', display_name: 'Склад Раднево',
  role: 'sklad', store_name: 'Раднево', assigned_stores: [] };

function row(o) {
  return Object.assign({ id: 'd-1', source: 'diff', store_name: 'Раднево', supplier: 'ЕЛМАК ЕООД',
    product_name: 'ЦИРКУЛЯР', sap_code: '20923', quantity: 1, order_number: '4100141066',
    purchase_order: null, id_euro: null, plant: '5521', doc_date: null, withdrawal_date: null,
    confirmed_date: '2026-09-02', status: 'pending', reason: null, courier_info: '',
    control_comment: null, controller_comment: null, store_comment: 'НЕВЗЕТА · чакаме куриер',
    expiry_date: null, diff_line_id: null, photos: [] }, o);
}
const settle = async (n) => { for (let i = 0; i < (n || 6); i++) await ticks(); };
const mod = h => h.doc.getElementById('mod-stock-returns');
const heads = h => Array.prototype.map.call(mod(h).querySelectorAll('thead th'), th => th.textContent.trim());
/* Редът по име на артикул (title на първия ред в „Артикул“); клетките — като текст. */
const cells = (h, name) => {
  const tr = Array.prototype.find.call(mod(h).querySelectorAll('tbody tr'), x => { const d = x.querySelector('td div'); return d && d.getAttribute('title') === name; });
  return tr ? Array.prototype.map.call(tr.querySelectorAll('td'), td => td.textContent.trim()) : null;
};

function env(user, rows, tab) {
  const DB = { rows: JSON.parse(JSON.stringify(rows)) };
  let h;
  h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'], user: user, confirm: true,
    data: {
      stock_returns: url => {
        if (url.indexOf('select=supplier') >= 0) return [{ supplier: 'ЕЛМАК ЕООД' }];
        if (url.indexOf('source=eq.diff&select=id') >= 0) return [];
        /* зареждането на модула: всичко, вкл. вмъкнатото от импорта */
        const posted = [];
        (h ? h.calls.post : []).filter(p => p.table === 'stock_returns')
          .forEach((p, i) => (Array.isArray(p.body) ? p.body : [p.body]).forEach((b, j) => posted.push(Object.assign({ id: 'new-' + i + '-' + j }, b))));
        return DB.rows.concat(posted);
      },
      stock_differences: [], differences_reports: [], users: [{ store_name: 'Раднево' }]
    }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = tab || 'diff'; h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.w.srPendingPhotos = [];
  h.w.loadAllSuppliers = () => Promise.resolve(['ЕЛМАК ЕООД']);
  h.cap = { aoas: [] };
  h.w.renderStockReturns();
  return h;
}

(async function run() {

  section('а) Импорт на ред с дата и коментар → двете се виждат в таблицата на правилното място');
  {
    const h = env(CVETI, []);
    const WB = { SheetNames: ['21'], Sheets: { '21': { __aoa: [
      ['ДОСТАВЧИК', 'МАТЕРИАЛ', 'НАИМЕНОВАНИЕ', 'КОЛИЧЕСТВО', 'ПОРЪЧКА', 'ДАТА НА ПОТВЪРДЕНА АКТУАЛИЗАЦИЯ', 'КОМЕНТАР '],
      ['ЕЛМАК', 20923, 'ЦИРКУЛЯР RAIDER', 1, 4100141066, '02.09.2026', 'НЕВЗЕТА', 'чакаме куриер']
    ] } } };
    h.w.XLSX = { read: () => WB, utils: { sheet_to_json: (s) => s.__aoa } };
    h.w.FileReader = function () { const self = this; this.readAsArrayBuffer = function () {
      setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0); }; };
    realClick(h.w, btn(mod(h), '📤 Импорт от Excel'));
    Object.defineProperty(h.doc.getElementById('sr-import-file'), 'files', { value: [{ name: 'r.xlsx' }], configurable: true });
    realClick(h.w, btn(h.doc, 'Започни импорт'));
    await new Promise(res => setTimeout(res, 80));
    ok('импортът вмъкна реда', h.calls.post.some(p => p.table === 'stock_returns'), (h.doc.getElementById('sr-import-progress') || {}).innerHTML);
    /* „Затвори" → презареждане на модула (loadStockReturns) → таблицата. */
    realClick(h.w, btn(h.doc.getElementById('sr-import-ov'), 'Затвори'));
    await settle(10);
    const H_ = heads(h);
    ok('„По разлики“: 6 колони — Артикул|Документ|Магазин · Доставчик|Статус|Коментари|Действия',
      H_.join('|') === 'Артикул|Документ|Магазин · Доставчик|Статус|Коментари|Действия', H_.join('|'));
    const iC = 3, iS = 4; /* „Потвърдена акт." е в клетката „Статус", „Коментар обект" — в „Коментари" */
    const c = cells(h, 'ЦИРКУЛЯР RAIDER');
    if (ok('редът е в таблицата на „По разлики"', !!c, JSON.stringify(h.w.srData.map(r => r.product_name)))) {
      ok('датата: потвърдена акт. 02.09.2026', /потвърдена акт\.\s*02\.09\.2026/.test(c[iC]), JSON.stringify(c[iC]));
      /* Редът е вмъкнат от импорта → под датата стои и произходът ѝ.
         Без това клетката би изглеждала като обектова актуализация. */
      ok('и под нея — произходът ѝ (от импорт)',
        c[iC].indexOf('от импорт') > 0, JSON.stringify(c[iC]));
      ok('коментарът на обекта: „Обект: НЕВЗЕТА · чакаме куриер“', c[iS] === 'Обект: НЕВЗЕТА · чакаме куриер', JSON.stringify(c[iS]));
      ok('<th> = <td>', c.length === H_.length, c.length + ' / ' + H_.length);
    }
    h.close();
  }

  section('а2) Празна дата → „—"; търсенето по store_comment важи и тук');
  {
    const h = env(CVETI, [row(), row({ id: 'd-2', product_name: 'ДРУГ', confirmed_date: null, store_comment: null })]);
    const H_ = heads(h);
    ok('празна дата → няма ред „потвърдена акт.“', cells(h, 'ДРУГ')[3].indexOf('потвърдена акт.') < 0, cells(h, 'ДРУГ')[3]);
    h.w.srSearch = 'чакаме куриер'; h.w.renderStockReturns();
    const names = Array.prototype.map.call(mod(h).querySelectorAll('tbody tr'), x => x.querySelector('td div').getAttribute('title'));
    ok('търсене „чакаме куриер" → само ЦИРКУЛЯР', names.join('|') === 'ЦИРКУЛЯР', names.join('|'));
    h.close();
  }

  section('б) Магазинер редактира „Коментар обект" в „По разлики" → PATCH със store_comment');
  {
    const h = env(STORE, [row()]);
    const b = Array.from(mod(h).querySelectorAll('button[data-id="d-1"]')).find(x => (x.getAttribute('onclick') || '').indexOf('openSRModal') >= 0);
    if (ok('✏️ е на реда', !!b)) {
      realClick(h.w, b);
      await settle();
      const sc = h.doc.getElementById('sr-store-cmt'), cd = h.doc.getElementById('sr-cdate');
      ok('полето „Коментар обект" е в модала на „По разлики"', !!sc && !sc.readOnly && sc.value === 'НЕВЗЕТА · чакаме куриер');
      ok('и датата (общата част) е там', !!cd && cd.value === '2026-09-02');
      sc.value = 'стоката е на рампата'; cd.value = '2026-09-10';
      realClick(h.w, btn(h.doc.getElementById('sr-ov'), 'Запази'));
      await settle();
      const p = h.calls.patch.find(x => /stock_returns/.test(x.url) && x.url.indexOf('id=eq.d-1') >= 0);
      if (ok('PATCH', !!p, h.calls.toast.join(' | '))) {
        ok('store_comment = „стоката е на рампата"', p.body.store_comment === 'стоката е на рампата', JSON.stringify(p.body.store_comment));
        ok('confirmed_date = 2026-09-10', p.body.confirmed_date === '2026-09-10', JSON.stringify(p.body.confirmed_date));
      }
    }
    h.close();
  }

  section('в) Excel на „По разлики" — двете колони на мястото от екрана');
  {
    const h = env(CVETI, [row()]);
    h.w.XLSX = { utils: { book_new: () => ({ SheetNames: [], Sheets: {} }), aoa_to_sheet: a => { h.cap.aoas.push(a); return {}; },
      book_append_sheet: () => {} }, writeFile: () => {} };
    realClick(h.w, Array.prototype.find.call(mod(h).querySelectorAll('button'), b => b.textContent.trim() === '📥 Excel'));
    const aoa = h.cap.aoas[0] || [];
    const head = aoa[6] || [];
    const iC = head.indexOf('Потвърдена акт.'), iS = head.indexOf('Коментар обект');
    ok('заглавия: след „Изтеглена с", преди „Коментар"', iC > 0 && head[iC - 1] === 'Изтеглена с' && head[iS + 1] === 'Коментар', head.join('|'));
    ok('стойности: 02.09.2026 и текстът', aoa[7] && aoa[7][iC] === '02.09.2026' && aoa[7][iS] === 'НЕВЗЕТА · чакаме куриер', JSON.stringify(aoa[7]));
ok('Excel-ът не е пипан: пази пълния списък колони (екранът е компактен — 6)', head.length > heads(h).length, head.length + ' / ' + heads(h).length);
    h.close();
  }

  section('г) „По рекламации" — без промяна');
  {
    const h = env(CVETI, [row({ id: 'c-1', source: 'complaint', purchase_order: '4200016266' })], 'complaint');
ok('заглавията на „По рекламации“ — 5 колони (компактна таблица)', heads(h).join('|') === 'Документ|Магазин · Доставчик|Статус|Коментари|Действия', heads(h).join('|'));
    h.close();
  }

  report();
})();
