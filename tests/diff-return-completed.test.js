/* Разлики: статус „Приключена" за редове „Връщане". (Точка 2 от Цвети.)

   По модела на „За връщане": status='completed', задава го само
   canCompleteSR() (Цвети/admin) от модала „Редактирай"; за другите статусът
   на приключен ред е заключен и не се праща. Само за тип „Връщане".
     · чипове при тип „Връщане": Невзета / Взета / Приключени; първите два НЕ
       включват приключените; „Всички" ги включва;
     · в сборния изглед неутралното „Приключени" (taken) ги включва;
     · бутонът „✅ Върната" го няма на приключен ред;
     · Excel износът показва „ПРИКЛЮЧЕНА".
   Статусът НЕ се синхронизира със „За връщане" — и 'taken' не се
   синхронизира днес (проверено 29.09.2026).

   Пускане:  node tests/diff-return-completed.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'vraca@temax.bg', display_name: 'Склад Враца',
  role: 'sklad', store_name: 'Враца', assigned_stores: [] };

function line(o) {
  return Object.assign({ id: 'l', report_id: null, store_name: 'Враца', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'А', quantity: 2, type: 'return', status: 'pending',
    order_number: null, return_order_number: null, confirmed_date: null, credit_note_issued: false,
    comment: null, resolution_comment: null, attachments: [], warehouse_response: null, store_response: null,
    created_at: '2026-09-21T09:30:00Z' }, o);
}
const LINES = [
  line({ id: 'r-p', material_name: 'ВРЪЩАНЕ НЕВЗЕТО', status: 'pending' }),
  line({ id: 'r-t', material_name: 'ВРЪЩАНЕ ВЗЕТО', status: 'taken' }),
  line({ id: 'r-c', material_name: 'ВРЪЩАНЕ ПРИКЛЮЧЕНО', status: 'completed' }),
  line({ id: 'm-p', material_name: 'ЛИПСА ЧАКАЩА', type: 'missing', status: 'pending' }),
  line({ id: 'w-t', material_name: 'ЗАПРИХОДЕНО', type: 'writein', status: 'taken' })
];

function env(user, lines) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: { stock_differences: lines, differences_reports: [], stock_returns: [], transport_orders: [],
            users: [{ store_name: 'Враца' }], contacts: [], stores: [], stock_diff_swaps: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = []; h.w.transportOrders = [];
  h.w.sdView = 'rows'; /* изгледът „Редове" (таблицата) — подразбирането е „Бланки" */
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'supplier';
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД']);
  h.cap = { aoas: [] };
  h.w.XLSX = { utils: { book_new: () => ({ SheetNames: [], Sheets: {} }), aoa_to_sheet: a => { h.cap.aoas.push(a); return {}; },
    book_append_sheet: () => {} }, writeFile: () => {} };
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 6; i++) await ticks(); };
const mod = h => h.doc.getElementById('mod-stock-diff');
function names(h) {
  const t = Array.prototype.find.call(mod(h).querySelectorAll('table'),
    x => !!x.querySelector('#sd-rows')); /* долната таблица е с #sd-rows; „Дата потвърд.“ вече не е собствена колона */
  return t ? Array.prototype.map.call(t.querySelectorAll('tbody tr'), tr => tr.querySelector('.sd-name').textContent.trim()) : [];
}
const statusChip = (h, f) => mod(h).querySelector('button[data-f="' + f + '"][onclick^="setSDFilter"]');
const typeChip = (h, f) => mod(h).querySelector('button[data-f="' + f + '"][onclick^="setSDTypeFilter"]');
const editBtn = (h, id) => Array.prototype.find.call(mod(h).querySelectorAll('button[data-id="' + id + '"]'),
  b => (b.getAttribute('onclick') || '').indexOf('openSDModal') >= 0);
const sdPatch = (h, id) => h.calls.patch.find(p => /stock_differences/.test(p.url) && p.url.indexOf('id=eq.' + id) >= 0);

(async function run() {

  section('а) Цвети приключва „Връщане" през модала → PATCH status=completed');
  {
    const h = env(CVETI, LINES);
    realClick(h.w, editBtn(h, 'r-t'));
    await settle();
    const sel = h.doc.getElementById('sd-status');
    const opt = sel && sel.querySelector('option[value="completed"]');
    if (ok('опцията „🏁 ПРИКЛЮЧЕНА" е в селекта', !!opt, sel && sel.innerHTML)) {
      ok('селектът е отключен', !sel.disabled);
      sel.value = 'completed';
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await settle();
      const p = sdPatch(h, 'r-t');
      ok('PATCH status = completed', !!p && p.body.status === 'completed', JSON.stringify(p && p.body.status) + ' | ' + h.calls.toast.join(' | '));
      ok('completed_by/at не се пипат (taken → completed е в едно и също „приключено" състояние)',
        !!p && !('completed_by' in p.body) && !('completed_at' in p.body), JSON.stringify(p && p.body));
    }
    /* pending → completed: completed_by се попълва. */
    const h2 = env(CVETI, LINES);
    realClick(h2.w, editBtn(h2, 'r-p'));
    await settle();
    h2.doc.getElementById('sd-status').value = 'completed';
    realClick(h2.w, btn(h2.doc.getElementById('sd-ov'), 'Запази'));
    await settle();
    const p2 = sdPatch(h2, 'r-p');
    ok('невзета → приключена: completed_by = Цвети', !!p2 && p2.body.status === 'completed' && p2.body.completed_by === 'Цветелина Тенева',
      JSON.stringify(p2 && p2.body));
    h.close(); h2.close();
  }

  section('б) Чиповете при тип „Връщане": Невзета / Взета / Приключени');
  {
    const h = env(CVETI, LINES);
    realClick(h.w, typeChip(h, 'return'));
    const c = statusChip(h, 'completed');
    ok('чипът „🏁 Приключени (1)"', !!c && c.textContent.trim() === '🏁 Приключени (1)', c && c.textContent);
    ok('„Всички (3)" ги включва', statusChip(h, 'all').textContent.indexOf('(3)') >= 0, statusChip(h, 'all').textContent);
    ok('„Невзета (1)"', statusChip(h, 'pending').textContent.indexOf('(1)') >= 0, statusChip(h, 'pending').textContent);
    ok('„Взета (1)" — без приключените', statusChip(h, 'taken').textContent.indexOf('(1)') >= 0, statusChip(h, 'taken').textContent);
    realClick(h.w, statusChip(h, 'taken'));
    ok('клик „Взета" → само ВЪРНАТОТО взето', names(h).join('|') === 'ВРЪЩАНЕ ВЗЕТО', names(h).join('|'));
    realClick(h.w, statusChip(h, 'pending'));
    ok('клик „Невзета" → без приключеното', names(h).join('|') === 'ВРЪЩАНЕ НЕВЗЕТО', names(h).join('|'));
    realClick(h.w, statusChip(h, 'completed'));
    ok('клик „Приключени" → само приключеното', names(h).join('|') === 'ВРЪЩАНЕ ПРИКЛЮЧЕНО', names(h).join('|'));
    const tr = Array.prototype.find.call(mod(h).querySelectorAll('tbody tr'), x => x.textContent.indexOf('ВРЪЩАНЕ ПРИКЛЮЧЕНО') >= 0);
    ok('баджът е „🏁 ПРИКЛЮЧЕНА"', tr && tr.querySelector('.sd-st').textContent.trim() === '🏁 ПРИКЛЮЧЕНА');
    ok('на приключения ред няма „✅ Върната"', !!tr && !Array.prototype.some.call(tr.querySelectorAll('button'),
      b => /sdMarkTaken/.test(b.getAttribute('onclick') || '')));
    /* Смяна на типа от „Приключени" → филтърът по статус се връща на „Всички". */
    realClick(h.w, typeChip(h, 'missing'));
    ok('при друг тип чипът „Приключени" го няма', !statusChip(h, 'completed'));
    ok('и филтърът се връща на „Всички"', h.w.sdFilter === 'all', h.w.sdFilter);
    h.close();
  }

  section('в) Сборният изглед: неутралното „Приключени" включва и completed');
  {
    const h = env(CVETI, LINES);
    realClick(h.w, statusChip(h, 'taken'));
    const n = names(h);
    ok('„Приключени" (всички типове) = взетото + приключеното + заприходеното',
      n.sort().join('|') === ['ВРЪЩАНЕ ВЗЕТО', 'ВРЪЩАНЕ ПРИКЛЮЧЕНО', 'ЗАПРИХОДЕНО'].sort().join('|'), n.join('|'));
    ok('„Чакащи" (всички типове) без приключеното', (() => { realClick(h.w, statusChip(h, 'pending')); return names(h).indexOf('ВРЪЩАНЕ ПРИКЛЮЧЕНО') < 0; })());
    h.close();
  }

  section('г) Магазинер: не вижда опцията и не може да смени статуса на приключен ред');
  {
    const h = env(STORE, LINES);
    realClick(h.w, editBtn(h, 'r-t'));
    await settle();
    ok('на невзет/взет ред няма опция „ПРИКЛЮЧЕНА"', !h.doc.querySelector('#sd-status option[value="completed"]'));
    h.w.closeSDModal();
    realClick(h.w, editBtn(h, 'r-c'));
    await settle();
    const sel = h.doc.getElementById('sd-status');
    ok('на приключен ред селектът е заключен и показва ПРИКЛЮЧЕНА', !!sel && sel.disabled && sel.value === 'completed',
      sel && (sel.disabled + ' ' + sel.value));
    /* Подправен DOM: отключен селект, върнат на „pending". */
    sel.disabled = false; sel.value = 'pending';
    h.doc.getElementById('sd-comment').value = 'коментар от магазина';
    realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
    await settle();
    const p = sdPatch(h, 'r-c');
    if (ok('записът минава (коментарът е разрешен)', !!p, h.calls.toast.join(' | '))) {
      ok('PATCH-ът НЕ носи status', !('status' in p.body), JSON.stringify(p.body));
      ok('и не пипа completed_by/at', !('completed_by' in p.body) && !('completed_at' in p.body));
    }
    /* Подправена опция „completed" на невзет ред → отказ. */
    const h2 = env(STORE, LINES);
    realClick(h2.w, editBtn(h2, 'r-p'));
    await settle();
    const s2 = h2.doc.getElementById('sd-status');
    s2.insertAdjacentHTML('beforeend', '<option value="completed">x</option>'); s2.value = 'completed';
    realClick(h2.w, btn(h2.doc.getElementById('sd-ov'), 'Запази'));
    await settle();
    ok('подправено „completed" от магазина → няма PATCH', !sdPatch(h2, 'r-p'));
    ok('toast „само от Цвети/admin"', h2.calls.toast.some(t => String(t).indexOf('само от Цвети/admin') >= 0), h2.calls.toast.join(' | '));
    h.close(); h2.close();
  }

  section('д) Други типове — без промяна');
  {
    const h = env(CVETI, LINES);
    realClick(h.w, editBtn(h, 'm-p'));
    await settle();
    ok('Липса: няма опция „ПРИКЛЮЧЕНА"', !h.doc.querySelector('#sd-status option[value="completed"]'));
    h.w.closeSDModal();
    realClick(h.w, editBtn(h, 'w-t'));
    await settle();
    ok('Заприхождаване: няма опция „ПРИКЛЮЧЕНА"', !h.doc.querySelector('#sd-status option[value="completed"]'));
    h.w.closeSDModal();
    realClick(h.w, typeChip(h, 'writein'));
    ok('Заприхождаване: чиповете са три, без „Приключени"', !statusChip(h, 'completed'));
    /* Подправено completed на Липса → отказ. */
    realClick(h.w, typeChip(h, 'all'));
    realClick(h.w, editBtn(h, 'm-p'));
    await settle();
    const s = h.doc.getElementById('sd-status');
    s.insertAdjacentHTML('beforeend', '<option value="completed">x</option>'); s.value = 'completed';
    realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
    await settle();
    ok('Липса + подправено completed → няма PATCH', !sdPatch(h, 'm-p'));
    ok('toast „само за тип Връщане"', h.calls.toast.some(t => String(t).indexOf('само за тип „Връщане"') >= 0), h.calls.toast.join(' | '));
    h.close();
  }

  section('е) Excel показва „ПРИКЛЮЧЕНА"');
  {
    const h = env(CVETI, LINES);
    realClick(h.w, typeChip(h, 'return'));
    realClick(h.w, btn(mod(h), '📥 Excel'));
    const aoa = h.cap.aoas[0] || [];
    const r = aoa.find(x => x[4] === 'ВРЪЩАНЕ ПРИКЛЮЧЕНО');
    ok('статус „ПРИКЛЮЧЕНА"', !!r && r[9] === 'ПРИКЛЮЧЕНА', JSON.stringify(r && r[9]));
    ok('взетото си е „ВЗЕТА"', (aoa.find(x => x[4] === 'ВРЪЩАНЕ ВЗЕТО') || [])[9] === 'ВЗЕТА');
    h.close();
  }

  report();
})();
