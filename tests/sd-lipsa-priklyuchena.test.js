/* Разлики: „🏁 Приключена" и за тип „Липса" (Цветелина, документ 20.10 т.4,
   отговор 21.10.2026).

   При „Липса" чипът „Приключени" показваше редовете с „Взета". Цвети иска
   там да са САМО редовете, които тя е маркирала като осчетоводени, и те да
   излизат от другите списъци. Същият модел като при „Връщане" (29.09.2026):
   status='completed', задава го само canCompleteSR() (Цвети/admin).
     а) Цвети: Липса „Взета" → ✏️ → „ПРИКЛЮЧЕНА" → PATCH status=completed;
     б) accounting и магазинът — без опцията;
     в) чипове при Липса: „Невзета" / „Взета" / „🏁 Приключени", без
        дублирано „Приключени"; „Взета" без приключените;
     г) „Връщане" — както преди; „Заприхождаване" — без трети чип;
     д) смяна от Липса към „Всички типове" при филтър 'completed' → „Всички".

   Мутационна проверка (22.10.2026) — и шестте падат с exit 1:
     M1 опцията в модала само за „Връщане"               → 2 ❌
     M2 „Взета" при Липса брои и completed               → 2 ❌
     M3 трети чип и при „Заприхождаване"                 → 2 ❌
     M4 setSDTypeFilter нулира 'completed' и при Липса   → 2 ❌
     M5 неутралните „Чакащи/Приключени" при Липса        → 3 ❌
     M6 submitSD отказва completed за Липса              → 5 ❌

   Пускане:  node tests/sd-lipsa-priklyuchena.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: [] };
const ACC = { email: 'acc@temax.bg', display_name: 'Оперативен счетоводител',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'vraca@temax.bg', display_name: 'Склад Враца',
  role: 'sklad', store_name: 'Враца', assigned_stores: [] };

function line(o) {
  return Object.assign({ id: 'l', report_id: null, store_name: 'Враца', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'А', quantity: 2, type: 'missing', status: 'pending',
    order_number: null, return_order_number: null, confirmed_date: null, credit_note_issued: false,
    comment: null, resolution_comment: null, attachments: [], warehouse_response: null, store_response: null,
    completed_by: 'Цветелина Тенева', completed_at: '2026-10-20T08:00:00Z',
    created_at: '2026-10-20T07:30:00Z' }, o);
}
const LINES = [
  line({ id: 'm-p', material_name: 'ЛИПСА НЕВЗЕТА', status: 'pending', completed_by: null, completed_at: null }),
  line({ id: 'm-t1', material_name: 'ЛИПСА ВЗЕТА 1', status: 'taken' }),
  line({ id: 'm-t2', material_name: 'ЛИПСА ВЗЕТА 2', status: 'taken' }),
  line({ id: 'm-c', material_name: 'ЛИПСА ПРИКЛЮЧЕНА', status: 'completed' }),
  line({ id: 'r-t', material_name: 'ВРЪЩАНЕ ВЗЕТО', type: 'return', status: 'taken' }),
  line({ id: 'r-c', material_name: 'ВРЪЩАНЕ ПРИКЛЮЧЕНО', type: 'return', status: 'completed' }),
  line({ id: 'r-p', material_name: 'ВРЪЩАНЕ НЕВЗЕТО', type: 'return', status: 'pending', completed_by: null, completed_at: null }),
  line({ id: 'w-t', material_name: 'ЗАПРИХОДЕНО', type: 'writein', status: 'taken' }),
  line({ id: 'w-p', material_name: 'НЕЗАПРИХОДЕНО', type: 'writein', status: 'pending', completed_by: null, completed_at: null })
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
  h.w.sdView = 'rows';
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
  const t = Array.prototype.find.call(mod(h).querySelectorAll('table'), x => !!x.querySelector('#sd-rows'));
  return t ? Array.prototype.map.call(t.querySelectorAll('tbody tr'), tr => tr.querySelector('.sd-name').textContent.trim()).sort() : [];
}
const statusChip = (h, f) => mod(h).querySelector('button[data-f="' + f + '"][onclick^="setSDFilter"]');
const typeChip = (h, f) => mod(h).querySelector('button[data-f="' + f + '"][onclick^="setSDTypeFilter"]');
const chipTexts = h => Array.prototype.map.call(mod(h).querySelectorAll('button[onclick^="setSDFilter"]'), b => b.textContent.trim());
const editBtn = (h, id) => Array.prototype.find.call(mod(h).querySelectorAll('button[data-id="' + id + '"]'),
  b => (b.getAttribute('onclick') || '').indexOf('openSDModal') >= 0);
const sdPatch = (h, id) => h.calls.patch.find(p => /stock_differences/.test(p.url) && p.url.indexOf('id=eq.' + id) >= 0);

(async function run() {

  section('а) Цвети: Липса „Взета" → ✏️ → „ПРИКЛЮЧЕНА" → запис');
  {
    const h = env(CVETI, LINES);
    realClick(h.w, editBtn(h, 'm-t1'));
    await settle();
    const sel = h.doc.getElementById('sd-status');
    const opt = sel && sel.querySelector('option[value="completed"]');
    if (ok('опцията „🏁 ПРИКЛЮЧЕНА" е в селекта', !!opt && opt.textContent.indexOf('ПРИКЛЮЧЕНА') >= 0, sel && sel.innerHTML)) {
      ok('селектът е отключен', !sel.disabled);
      sel.value = 'completed';
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await settle();
      const p = sdPatch(h, 'm-t1');
      ok('PATCH status = completed', !!p && p.body.status === 'completed', JSON.stringify(p && p.body) + ' | ' + h.calls.toast.join(' | '));
      ok('типът остава „missing"', !!p && (!('type' in p.body) || p.body.type === 'missing'), JSON.stringify(p && p.body.type));
      ok('completed_by/at не се пипат (taken → completed, както при Връщане)',
        !!p && !('completed_by' in p.body) && !('completed_at' in p.body), JSON.stringify(p && p.body));
      ok('нищо не се пише в „За връщане"', !h.calls.post.some(c => /stock_returns/.test(c.url)) &&
        !h.calls.patch.some(c => /stock_returns/.test(c.url)), JSON.stringify(h.calls.post.map(c => c.url)));
      ok('toast „Записано!"', h.calls.toast.some(t => String(t).indexOf('Записано') >= 0), h.calls.toast.join(' | '));
    }
    /* Невзета → приключена: completed_by се попълва, както при Връщане. */
    const h2 = env(CVETI, LINES);
    realClick(h2.w, editBtn(h2, 'm-p'));
    await settle();
    h2.doc.getElementById('sd-status').value = 'completed';
    realClick(h2.w, btn(h2.doc.getElementById('sd-ov'), 'Запази'));
    await settle();
    const p2 = sdPatch(h2, 'm-p');
    ok('невзета → приключена: completed_by = Цвети, completed_at попълнено',
      !!p2 && p2.body.status === 'completed' && p2.body.completed_by === 'Цветелина Тенева' && !!p2.body.completed_at,
      JSON.stringify(p2 && p2.body));
    /* Баджът и печатът на приключен ред. */
    const tr = Array.prototype.find.call(mod(h2).querySelectorAll('tbody tr'), x => x.textContent.indexOf('ЛИПСА ПРИКЛЮЧЕНА') >= 0);
    ok('баджът на реда е „🏁 ПРИКЛЮЧЕНА"', !!tr && tr.querySelector('.sd-st').textContent.trim() === '🏁 ПРИКЛЮЧЕНА',
      tr && tr.querySelector('.sd-st').textContent);
    h.close(); h2.close();
  }

  section('б) accounting (не Цвети) и магазинът — без опцията');
  {
    const h = env(ACC, LINES);
    realClick(h.w, editBtn(h, 'm-t1'));
    await settle();
    ok('accounting: няма опция „ПРИКЛЮЧЕНА" на Липса', !!h.doc.getElementById('sd-status') &&
      !h.doc.querySelector('#sd-status option[value="completed"]'));
    h.w.closeSDModal();
    realClick(h.w, editBtn(h, 'm-c'));
    await settle();
    const sel = h.doc.getElementById('sd-status');
    ok('accounting: приключен ред — селектът заключен на ПРИКЛЮЧЕНА', !!sel && sel.disabled && sel.value === 'completed',
      sel && (sel.disabled + ' ' + sel.value));
    h.w.closeSDModal();
    /* Подправено completed от accounting → отказ. */
    realClick(h.w, editBtn(h, 'm-t2'));
    await settle();
    const s2 = h.doc.getElementById('sd-status');
    s2.insertAdjacentHTML('beforeend', '<option value="completed">x</option>'); s2.value = 'completed';
    realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
    await settle();
    ok('accounting + подправено completed → няма PATCH', !sdPatch(h, 'm-t2'), h.calls.toast.join(' | '));
    h.close();

    const hs = env(STORE, LINES);
    const eb = editBtn(hs, 'm-t1');
    if (eb) {
      realClick(hs.w, eb);
      await settle();
      ok('магазин: няма опция „ПРИКЛЮЧЕНА" на Липса', !hs.doc.querySelector('#sd-status option[value="completed"]'));
    } else {
      ok('магазин: няма ✏️ на Липса изобщо (не може да стигне до опцията)', true);
    }
    hs.close();
  }

  section('в) Чиповете при Липса: Невзета / Взета (2) / 🏁 Приключени (1)');
  {
    const h = env(CVETI, LINES);
    realClick(h.w, typeChip(h, 'missing'));
    const t = statusChip(h, 'taken'), c = statusChip(h, 'completed');
    ok('чипът „taken" = „✅ Взета (2)"', !!t && t.textContent.trim() === '✅ Взета (2)', t && t.textContent);
    ok('чипът „🏁 Приключени (1)"', !!c && c.textContent.trim() === '🏁 Приключени (1)', c && c.textContent);
    ok('„⏳ Невзета (1)"', statusChip(h, 'pending').textContent.trim() === '⏳ Невзета (1)', statusChip(h, 'pending').textContent);
    ok('„Всички (4)" включва приключените', statusChip(h, 'all').textContent.trim() === 'Всички (4)', statusChip(h, 'all').textContent);
    ok('само един чип с думата „Приключени"', chipTexts(h).filter(x => x.indexOf('Приключени') >= 0).length === 1, chipTexts(h).join(' | '));
    realClick(h.w, statusChip(h, 'completed'));
    ok('клик „Приключени" → само приключеното', names(h).join('|') === 'ЛИПСА ПРИКЛЮЧЕНА', names(h).join('|'));
    realClick(h.w, statusChip(h, 'taken'));
    ok('клик „Взета" → само взетите, без приключеното', names(h).join('|') === 'ЛИПСА ВЗЕТА 1|ЛИПСА ВЗЕТА 2', names(h).join('|'));
    realClick(h.w, statusChip(h, 'pending'));
    ok('клик „Невзета" → само невзетото', names(h).join('|') === 'ЛИПСА НЕВЗЕТА', names(h).join('|'));
    /* Excel на видяното при „Приключени". */
    realClick(h.w, statusChip(h, 'completed'));
    realClick(h.w, btn(mod(h), '📥 Excel'));
    const aoa = h.cap.aoas[0] || [];
    const r = aoa.find(x => x[4] === 'ЛИПСА ПРИКЛЮЧЕНА');
    ok('Excel: „ПРИКЛЮЧЕНА"', !!r && r[9] === 'ПРИКЛЮЧЕНА', JSON.stringify(r && r[9]));
    h.close();
  }

  section('г) „Връщане" — както преди; „Заприхождаване" — без трети чип');
  {
    const h = env(CVETI, LINES);
    realClick(h.w, typeChip(h, 'return'));
    ok('Връщане: чиповете', chipTexts(h).join(' | ') === 'Всички (3) | ⏳ Невзета (1) | ✅ Взета (1) | 🏁 Приключени (1)', chipTexts(h).join(' | '));
    realClick(h.w, statusChip(h, 'taken'));
    ok('Връщане: „Взета" без приключеното', names(h).join('|') === 'ВРЪЩАНЕ ВЗЕТО', names(h).join('|'));
    realClick(h.w, statusChip(h, 'completed'));
    ok('Връщане: „Приключени" → само приключеното', names(h).join('|') === 'ВРЪЩАНЕ ПРИКЛЮЧЕНО', names(h).join('|'));
    realClick(h.w, typeChip(h, 'writein'));
    ok('Заприхождаване: няма чип „Приключени"', !statusChip(h, 'completed'), chipTexts(h).join(' | '));
    ok('Заприхождаване: филтърът се връща на „Всички"', h.w.sdFilter === 'all', h.w.sdFilter);
    ok('Заприхождаване: чиповете', chipTexts(h).join(' | ') === 'Всички (2) | ⏳ Незаприходена (1) | 📥 Заприходена (1)', chipTexts(h).join(' | '));
    h.w.closeSDModal && h.w.closeSDModal();
    realClick(h.w, editBtn(h, 'w-t'));
    await settle();
    ok('Заприхождаване: няма опция „ПРИКЛЮЧЕНА" в модала', !h.doc.querySelector('#sd-status option[value="completed"]'));
    h.close();
  }

  section('д) Смяна Липса → „Всички типове" при филтър „Приключени" → „Всички"');
  {
    const h = env(CVETI, LINES);
    realClick(h.w, typeChip(h, 'return'));
    realClick(h.w, statusChip(h, 'completed'));
    realClick(h.w, typeChip(h, 'missing'));
    ok('Връщане → Липса пази „Приключени"', h.w.sdFilter === 'completed', h.w.sdFilter);
    ok('и показва приключената липса', names(h).join('|') === 'ЛИПСА ПРИКЛЮЧЕНА', names(h).join('|'));
    realClick(h.w, typeChip(h, 'all'));
    ok('Липса → Всички типове: филтърът се нулира', h.w.sdFilter === 'all', h.w.sdFilter);
    ok('сборният изглед: неутрални думи, без трети чип', !statusChip(h, 'completed') &&
      statusChip(h, 'taken').textContent.indexOf('Приключени') >= 0, chipTexts(h).join(' | '));
    realClick(h.w, statusChip(h, 'taken'));
    ok('сборното „Приключени" включва и приключената липса', names(h).indexOf('ЛИПСА ПРИКЛЮЧЕНА') >= 0, names(h).join('|'));
    h.close();
  }

  report();
})();
