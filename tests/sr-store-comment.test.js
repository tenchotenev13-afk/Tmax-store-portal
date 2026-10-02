/* „За връщане" → „По рекламации": коментарите на Цвети + „Коментар обект".
   (29.09.2026.)

   „Коментар" (control_comment) и „Коментар контролер" (controller_comment) —
   САМО за Цвети/admin (canCompleteSR). За останалите полетата са readonly и
   при запис ключовете ИЗОБЩО не се пращат (и с подправен DOM). Нова колона
   store_comment („Коментар обект") — пише я магазинът и Цвети/admin.
     · таблицата: „Коментар обект" между „Изтеглена с" и „Потвърдена акт.";
       търсенето я включва;
     · „изхвърляте" в коментара на контролера важи и за магазина — решава
       ЗАПИСАНОТО, не полето (подправено поле не отменя снимката);
     · Excel „един лист": на мястото от екрана; многолистовият: 0–10 и 11+
       непроменени, store_comment най-накрая (импортът го игнорира).

   Пускане:  node tests/sr-store-comment.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'radnevo@temax.bg', display_name: 'Склад Раднево',
  role: 'sklad', store_name: 'Раднево', assigned_stores: [] };

function row(o) {
  return Object.assign({ id: 'c-1', source: 'complaint', store_name: 'Раднево', supplier: 'ЕЛМАК ЕООД',
    product_name: null, sap_code: null, quantity: null, order_number: null, purchase_order: '4200016266',
    id_euro: 'E-66', plant: '1210', doc_date: null, withdrawal_date: null, confirmed_date: null,
    expiry_date: null, status: 'pending', reason: null, courier_info: '', control_comment: 'КИ 123',
    controller_comment: 'КЪМ ЛС ТЪРГОВИЩЕ', store_comment: null, diff_line_id: null, photos: [] }, o);
}

function env(user, rows) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: { stock_returns: rows, stock_differences: [], differences_reports: [], users: [{ store_name: 'Раднево' }] }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = 'complaint'; h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.w.srPendingPhotos = [];
  h.w.loadAllSuppliers = () => Promise.resolve(['ЕЛМАК ЕООД']);
  h.cap = { files: [] };
  h.w.XLSX = { utils: { book_new: () => ({ SheetNames: [], Sheets: {} }), aoa_to_sheet: a => ({ __aoa: a }),
    book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); wb.Sheets[n] = ws; },
    sheet_to_json: (sheet, o) => { if (o && o.header === 1) return sheet.__aoa; throw new Error('само header:1'); } },
    writeFile: (wb, fname) => { h.cap.files.push({ wb, fname }); } };
  h.w.renderStockReturns();
  return h;
}
const settle = async () => { for (let i = 0; i < 6; i++) await ticks(); };
const mod = h => h.doc.getElementById('mod-stock-returns');
async function openEdit(h, id) {
  const b = Array.from(mod(h).querySelectorAll('button[data-id="' + id + '"]'))
    .find(x => (x.getAttribute('onclick') || '').indexOf('openSRModal') >= 0);
  if (!b) throw new Error('няма ✏️ за ' + id);
  realClick(h.w, b);
  await settle();
}
async function save(h) { realClick(h.w, btn(h.doc.getElementById('sr-ov'), 'Запази')); await settle(); }
const srPatch = (h, id) => h.calls.patch.find(p => /stock_returns/.test(p.url) && p.url.indexOf('id=eq.' + id) >= 0);

(async function run() {

  section('а) Цвети редактира двата коментара и „Коментар обект" → PATCH с трите');
  {
    const h = env(CVETI, [row()]);
    await openEdit(h, 'c-1');
    const cc = h.doc.getElementById('sr-cc'), ctrl = h.doc.getElementById('sr-ctrl'), sc = h.doc.getElementById('sr-store-cmt');
    if (ok('трите полета са в модала', !!(cc && ctrl && sc))) {
      ok('двата коментара са редактируеми за Цвети', !cc.readOnly && !ctrl.readOnly);
      cc.value = 'КИ 456'; ctrl.value = 'ИЗПРАЩАЙТЕ'; sc.value = '  чакаме куриер  ';
      await save(h);
      const p = srPatch(h, 'c-1');
      if (ok('PATCH', !!p, h.calls.toast.join(' | '))) {
        ok('control_comment = „КИ 456"', p.body.control_comment === 'КИ 456', JSON.stringify(p.body.control_comment));
        ok('controller_comment = „ИЗПРАЩАЙТЕ"', p.body.controller_comment === 'ИЗПРАЩАЙТЕ', JSON.stringify(p.body.controller_comment));
        ok('store_comment = „чакаме куриер" (без интервали)', p.body.store_comment === 'чакаме куриер', JSON.stringify(p.body.store_comment));
      }
    }
    h.close();
  }

  section('б) Магазинер: двата коментара — readonly и НЕ се пращат (и с подправен DOM); store_comment — да');
  {
    const h = env(STORE, [row()]);
    await openEdit(h, 'c-1');
    const cc = h.doc.getElementById('sr-cc'), ctrl = h.doc.getElementById('sr-ctrl'), sc = h.doc.getElementById('sr-store-cmt');
    ok('„Коментар" е readonly и показва написаното от Цвети', cc && cc.readOnly && cc.value === 'КИ 123');
    ok('„Коментар контролер" е readonly', ctrl && ctrl.readOnly && ctrl.value === 'КЪМ ЛС ТЪРГОВИЩЕ');
    ok('„Коментар обект" е редактируем', sc && !sc.readOnly);
    /* Подправен DOM: махнат readonly, нов текст. */
    cc.readOnly = false; cc.value = 'ИЗТРИТО ОТ МАГАЗИНА';
    ctrl.readOnly = false; ctrl.value = '';
    sc.value = 'стоката е на рампата';
    await save(h);
    const p = srPatch(h, 'c-1');
    if (ok('PATCH', !!p, h.calls.toast.join(' | '))) {
      ok('НЕ носи control_comment', !('control_comment' in p.body), JSON.stringify(p.body));
      ok('НЕ носи controller_comment', !('controller_comment' in p.body), JSON.stringify(p.body));
      ok('носи store_comment = „стоката е на рампата"', p.body.store_comment === 'стоката е на рампата', JSON.stringify(p.body.store_comment));
    }
    h.close();
  }

  section('в) Колоната в таблицата; търсене по текст от store_comment');
  {
    const rows = [row({ id: 'c-1', store_comment: 'ЧАКАМЕ ПАЛЕТ' }), row({ id: 'c-2', purchase_order: '4200016267', store_comment: null })];
    const h = env(CVETI, rows);
    const heads = Array.prototype.map.call(mod(h).querySelectorAll('thead th'), th => th.textContent.trim());
    const i = heads.indexOf('Коментар обект');
    ok('„Коментар обект" е между „Изтеглена с" и „Потвърдена акт."', i > 0 && heads[i - 1] === 'Изтеглена с' && heads[i + 1] === 'Потвърдена акт.',
      heads.join('|'));
    const tr = Array.prototype.find.call(mod(h).querySelectorAll('tbody tr'), x => x.querySelector('td').textContent.trim() === '4200016266');
    ok('клетката показва текста', tr && tr.querySelectorAll('td')[i].textContent.trim() === 'ЧАКАМЕ ПАЛЕТ');
    ok('<th> = <td>', tr && tr.querySelectorAll('td').length === heads.length);
    h.w.srSearch = 'чакаме палет'; h.w.renderStockReturns();
    const pos = Array.prototype.map.call(mod(h).querySelectorAll('tbody tr'), x => x.querySelector('td').textContent.trim());
    ok('търсене „чакаме палет" → само c-1', pos.join('|') === '4200016266', pos.join('|'));
    h.close();
  }

  section('г) „изхвърляте" в коментара на контролера, отворен от магазинер → без снимка');
  {
    const h = env(STORE, [row({ controller_comment: 'ИЗХВЪРЛЯЙТЕ' })]);
    await openEdit(h, 'c-1');
    ok('подсказката е за изхвърляне', (h.doc.getElementById('sr-photo-hint') || {}).textContent.indexOf('Изхвърляне') >= 0);
    h.doc.getElementById('sr-status').value = 'taken';
    h.doc.getElementById('sr-wdate').value = '2026-09-29';
    await save(h);
    const p = srPatch(h, 'c-1');
    ok('минава без снимка и куриер (PATCH status=taken)', !!p && p.body.status === 'taken', h.calls.toast.join(' | '));
    ok('и не праща controller_comment', !!p && !('controller_comment' in p.body));
    /* Обратното: записано „КЪМ ЛС", магазинът подправя полето на „изхвърляте" →
       решава записаното, снимката пак се иска. */
    const h2 = env(STORE, [row({ controller_comment: 'КЪМ ЛС ТЪРГОВИЩЕ' })]);
    await openEdit(h2, 'c-1');
    const c2 = h2.doc.getElementById('sr-ctrl'); c2.readOnly = false; c2.value = 'изхвърляте';
    h2.doc.getElementById('sr-status').value = 'taken';
    h2.doc.getElementById('sr-wdate').value = '2026-09-29';
    await save(h2);
    ok('подправено „изхвърляте" → няма PATCH', !srPatch(h2, 'c-1'));
    ok('искат се снимка и куриер', h2.calls.toast.some(t => /Липсва товарителница — снимка/.test(String(t))), h2.calls.toast.join(' | '));
    h.close(); h2.close();
  }

  section('д) Excel: „един лист" — на мястото от екрана; многолистовият — 0–10 и 11+ непроменени, накрая');
  {
    const h = env(CVETI, [row({ store_comment: 'ЧАКАМЕ ПАЛЕТ' })]);
    realClick(h.w, btn(mod(h), '📥 Excel (един лист)'));
    const one = h.cap.files[0].wb.Sheets[h.cap.files[0].wb.SheetNames[0]].__aoa;
    const j = one[0].indexOf('Коментар обект');
    ok('един лист: след „Изтеглена с", преди „Потвърдена акт."', j > 0 && one[0][j - 1] === 'Изтеглена с' && one[0][j + 1] === 'Потвърдена акт.',
      one[0].join('|'));
    ok('един лист: стойността', one[1][j] === 'ЧАКАМЕ ПАЛЕТ', JSON.stringify(one[1][j]));
    realClick(h.w, Array.prototype.find.call(mod(h).querySelectorAll('button'), b => b.textContent.trim() === '📥 Excel'));
    const multi = h.cap.files[1].wb.Sheets['21'].__aoa;
    ok('многолистов: 0–10 = srXlHead (огледалото на импорта)', multi[0].slice(0, 11).join('|') === h.w.srXlHead(false).join('|'), multi[0].join('|'));
    ok('многолистов: „Коментар обект" НАЙ-НАКРАЯ', multi[0][multi[0].length - 1] === 'Коментар обект' && multi[1][multi[1].length - 1] === 'ЧАКАМЕ ПАЛЕТ');
    let back = null;
    back = h.w.parseDiffReturnsWorkbook(h.cap.files[1].wb);
    ok('импортът чете реда и НЕ връща store_comment', back.length === 1 && !('store_comment' in back[0]) &&
      back[0].controller_comment === 'КЪМ ЛС ТЪРГОВИЩЕ', JSON.stringify(back[0] && Object.keys(back[0])));
    h.close();
  }

  section('е) Импорт: без canCompleteSR() коментарите НЕ се пишат; при Цвети — да (само нови редове от 02.10.2026)');
  {
    const LOGI = { email: 'logi@temax.bg', display_name: 'Логистик', role: 'logistics',
      store_name: 'Централен офис', assigned_stores: [] };
    const HEAD = ['НОВА ПВ-ЕВР', 'НОВА ИД-ЕВРО', 'Доставчик', 'Дата на документ', 'Завод', 'Статус',
      'Дата на изтегляне', 'Изтеглена с', 'Потвърдена акт.', 'Коментар', 'Коментар контролер'];
    const line = (po, cc, ctrl) => [po, 'E', 'ЕЛМАК ЕООД', '02.08.2026', '1210', 'НЕВЗЕТА', '', 'Спиди', '', cc, ctrl];
    async function runImport(user) {
      const existing = [{ id: 'db-1', purchase_order: '4200000001', status: 'taken' }];
      const h = boot({
        modules: ['stock-returns.js', 'stock-differences.js'], user: user, confirm: true,
        data: { stock_returns: url => url.indexOf('purchase_order=in.') < 0 ? [] : existing.filter(r => url.indexOf(r.purchase_order) >= 0),
                stock_differences: [], differences_reports: [] }
      });
      h.w.srData = []; h.w.srTab = 'complaint'; h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
      const WB = { SheetNames: ['21'], Sheets: { '21': { __aoa: [HEAD, line('4200000001', 'КИ ОТ ФАЙЛ', 'НАСОКА ОТ ФАЙЛ'),
        line('4200000002', 'КИ НОВ', 'НАСОКА НОВ')] } } };
      h.w.XLSX = { read: () => WB, utils: { sheet_to_json: (s, o) => { if (o && o.header === 1) return s.__aoa; throw new Error('header:1'); } } };
      h.w.FileReader = function () { const self = this; this.readAsArrayBuffer = function () {
        setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0); }; };
      h.w.renderStockReturns();
      realClick(h.w, btn(mod(h), '📤 Импорт от Excel'));
      const inp = h.doc.getElementById('sr-import-file');
      Object.defineProperty(inp, 'files', { value: [{ name: 'obobshten.xlsx' }], configurable: true });
      realClick(h.w, btn(h.doc, 'Започни импорт'));
      await new Promise(res => setTimeout(res, 60));
      const ins = [];
      h.calls.post.filter(p => p.table === 'stock_returns').forEach(p => (Array.isArray(p.body) ? p.body : [p.body]).forEach(b => ins.push(b)));
      const upd = h.calls.patch.find(p => /stock_returns/.test(p.url) && p.url.indexOf('id=eq.db-1') >= 0);
      return { h, ins, upd };
    }
    /* logistics: може да импортира (canAddSR), но не е canCompleteSR. */
    const a = await runImport(LOGI);
    ok('logistics: canCompleteSR() е false', a.h.w.canCompleteSR() === false);
    const n = a.ins.find(r => r.purchase_order === '4200000002');
    if (ok('logistics: новият ред е вмъкнат', !!n, a.h.calls.toast.join(' | '))) {
      ok('logistics: новият ред БЕЗ control_comment и controller_comment',
        !('control_comment' in n) && !('controller_comment' in n), JSON.stringify(Object.keys(n)));
      ok('logistics: другите полета — да (куриер, ИД)', n.courier_info === 'Спиди' && n.id_euro === 'E');
    }
    /* От 02.10.2026 импортът само добавя нови редове — съществуващият не се пипа. */
    ok('logistics: съществуващият НЕ се обновява (няма PATCH)', !a.upd && a.h.calls.patch.length === 0);
    a.h.close();

    const c = await runImport(CVETI);
    const n2 = c.ins.find(r => r.purchase_order === '4200000002');
    ok('Цвети: новият ред носи двата коментара', !!n2 && n2.control_comment === 'КИ НОВ' && n2.controller_comment === 'НАСОКА НОВ',
      JSON.stringify(n2));
    ok('Цвети: съществуващият НЕ се обновява (няма PATCH)', !c.upd && c.h.calls.patch.length === 0);
    ok('Цвети: store_comment импортът не пипа', !!n2 && !('store_comment' in n2));
    c.h.close();
  }

  report();
})();
