/* Транспорт > 🎨 Зареждане (supply.js), Етап 1.

   Какво се заковава:
   - формата за обект: шаблонът се показва само ако обектът е в target_stores
     (или target_stores е null); редовете, предзаредените стойности за
     седмицата и „миналата седмица" като ориентир;
   - „Запази" с РЕАЛЕН клик: POST за нов ред, PATCH за съществуващ, празно
     поле = null (не 0), „0" = 0; created_by само при POST;
   - провал на кой да е от записите (тук: вторият PATCH) -> червен toast и
     НИКАКВО „Запазено" (правило 13);
   - навигацията: бутонът в под-нав на Транспорт, активен таб Транспорт;
   - ЦО/admin: само списък ✅/⬜ кой е попълнил седмицата;
   - supplyWeekStart(): понеделникът на ISO седмицата, неделя -> предишния.

   Пускане: node tests/supply.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, realClick, btn } = H;

const STORE = { email: 'sl@temax.bg', display_name: 'Иван Сливен', role: 'store', store_name: 'Сливен' };
const OTHER = { email: 'gb@temax.bg', display_name: 'Габрово', role: 'store', store_name: 'Габрово' };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

const TPL = {
  id: 'tpl-col', name: 'Колоранти', slug: 'colorants', col1_label: 'Брой за поръчка', col2_label: null,
  target_stores: ['Петрич', 'Сливен', "Кърджали"], active: true, sort_order: 0,
  instructions: 'Броят се всички налични бутилки. Ако нямате — 0.'
};
const ITEMS = [
  { id: 'it-a', template_id: 'tpl-col', sap_code: '39801', name: 'КОЛОРАНТ WB1 BLUE 1Л', supplier: 'ВАМКО ООД', active: true, sort_order: 1 },
  { id: 'it-b', template_id: 'tpl-col', sap_code: '62960', name: 'КОЛОРАНТ COLTEC BLACK XS 1Л', supplier: 'ОРГАХИМ ЕАД', active: true, sort_order: 2 }
];

function env(user, entries, extra) {
  return boot(Object.assign({
    modules: ['pallets.js', 'supply.js'],
    user: user,
    data: {
      supply_templates: [TPL],
      supply_template_items: ITEMS,
      supply_entries: () => entries || [],
      users: [{ store_name: 'Сливен' }, { store_name: 'Габрово' }]
    }
  }, extra || {}));
}
function mod(h) { return h.doc.getElementById('mod-supply'); }
function toastColor(h) { return (h.doc.getElementById('toast').style.background || '').replace(/\s/g, ''); }
const RED = /^(#dc2626|rgb\(220,38,38\))$/;

(async function () {

  section('0. supplyWeekStart(): понеделникът на ISO седмицата');
  {
    const h = env(STORE);
    const W = (y, m, d) => h.w.supplyWeekStart(new h.w.Date(y, m - 1, d, 9, 0, 0));
    ok('понеделник 14.09.2026 -> себе си', W(2026, 9, 14) === '2026-09-14', W(2026, 9, 14));
    ok('сряда 16.09.2026 -> 14.09', W(2026, 9, 16) === '2026-09-14', W(2026, 9, 16));
    ok('неделя 20.09.2026 -> 14.09 (не 21.09)', W(2026, 9, 20) === '2026-09-14', W(2026, 9, 20));
    ok('неделя 23:59 -> пак 14.09', h.w.supplyWeekStart(new h.w.Date(2026, 8, 20, 23, 59)) === '2026-09-14');
    ok('през границата на годината: пт 01.01.2027 -> 28.12.2026', W(2027, 1, 1) === '2026-12-28', W(2027, 1, 1));
    ok('през смяна на часа: нд 25.10.2026 -> 19.10', W(2026, 10, 25) === '2026-10-19', W(2026, 10, 25));
    ok('supplyAddDays(-7) през месеца', h.w.supplyAddDays('2026-10-05', -7) === '2026-09-28');
  }

  section('1. Обект в target_stores: формата се рендира');
  {
    const h = env(STORE);
    const wk = h.w.supplyWeekStart();
    const prev = h.w.supplyAddDays(wk, -7);
    const entries = [
      { id: 'e-b', template_id: 'tpl-col', item_id: 'it-b', store_name: 'Сливен', week_start: wk, qty1: 4, qty2: null,
        created_by: 'Мария', created_at: '2026-09-15T08:00:00Z', updated_by: 'Мария', updated_at: '2026-09-15T08:30:00Z' },
      { id: 'e-prev', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Сливен', week_start: prev, qty1: 7, qty2: null },
      /* чужд обект — не бива да влезе във формата, каквото и да върне заявката */
      { id: 'e-x', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Петрич', week_start: wk, qty1: 99, qty2: null }
    ];
    h.setData('supply_entries', () => entries);
    if (guard('loadSupply() не хвърля', () => h.w.loadSupply())) {
      await ticks(6);
      const m = mod(h);
      ok('заглавието на шаблона', m.innerHTML.indexOf('Колоранти') >= 0);
      ok('инструкцията', m.textContent.indexOf('Ако нямате — 0.') >= 0);
      ok('точно 2 реда артикули', m.querySelectorAll('tbody tr').length === 2, String(m.querySelectorAll('tbody tr').length));
      ok('колоната с col1_label', m.textContent.indexOf('Брой за поръчка') >= 0);
      ok('няма втора колона за вход (col2_label=null)', !h.doc.getElementById('sup-q2-it-a'));
      const a = h.doc.getElementById('sup-q1-it-a'), b = h.doc.getElementById('sup-q1-it-b');
      ok('поле A е празно (няма запис за седмицата; чуждото 99 не влиза)', a && a.value === '', a && a.value);
      ok('поле B е предзаредено с 4', b && b.value === '4', b && b.value);
      const prevCells = Array.from(m.querySelectorAll('td.sup-prev')).map(td => td.textContent.trim());
      ok('миналата седмица: A=7, B=—', prevCells.join('|') === '7|—', prevCells.join('|'));
      ok('„Последно запазено … от Мария"', /Последно запазено: \d\d\.\d\d\.\d{4} \d\d:\d\d от Мария/.test(m.textContent),
        (m.querySelector('.sup-last') || {}).textContent);
      ok('заявката за записите е по обекта и двете седмици',
        h.calls.get.some(u => /supply_entries\?/.test(u) && u.indexOf('store_name=eq.' + encodeURIComponent('Сливен')) >= 0 &&
          u.indexOf('week_start=in.(' + wk + ',' + prev + ')') >= 0), h.calls.get.join('\n'));
      ok('има бутон „💾 Запази"', !!btn(m, 'Запази'));
    }
  }

  section('2. Реален клик „Запази": POST за нов, PATCH за съществуващ, празно = null');
  {
    const h = env(STORE);
    const wk = h.w.supplyWeekStart();
    const entries = [{ id: 'e-b', template_id: 'tpl-col', item_id: 'it-b', store_name: 'Сливен', week_start: wk, qty1: 4, qty2: null,
      created_by: 'Мария', created_at: '2026-09-15T08:00:00Z' }];
    h.setData('supply_entries', () => entries);
    h.w.loadSupply(); await ticks(6);
    h.doc.getElementById('sup-q1-it-a').value = '12';
    h.doc.getElementById('sup-q1-it-b').value = '';          /* изтрита стойност */
    realClick(h.w, btn(mod(h), 'Запази'));
    await ticks(8);

    ok('точно 1 POST', h.calls.post.length === 1, String(h.calls.post.length));
    ok('точно 1 PATCH', h.calls.patch.length === 1, String(h.calls.patch.length));
    const p = (h.calls.post[0] || {}).body || {};
    ok('POST е към supply_entries', (h.calls.post[0] || {}).table === 'supply_entries');
    ok('POST: item_id=it-a, qty1=12 (число)', p.item_id === 'it-a' && p.qty1 === 12, JSON.stringify(p));
    ok('POST: qty2 = null', p.qty2 === null && 'qty2' in p);
    ok('POST: store_name, week_start, template_id', p.store_name === 'Сливен' && p.week_start === wk && p.template_id === 'tpl-col', JSON.stringify(p));
    ok('POST: created_by и updated_by = display_name', p.created_by === 'Иван Сливен' && p.updated_by === 'Иван Сливен');
    ok('POST: updated_at е попълнено', !!p.updated_at);
    const pa = h.calls.patch[0] || {};
    ok('PATCH по id на съществуващия ред', /supply_entries\?id=eq\.e-b$/.test(pa.url || ''), pa.url);
    ok('PATCH: празно поле -> qty1 null, НЕ 0', pa.body && pa.body.qty1 === null && 'qty1' in pa.body, JSON.stringify(pa.body));
    ok('PATCH: updated_by/updated_at, БЕЗ created_by', pa.body && pa.body.updated_by === 'Иван Сливен' && !!pa.body.updated_at && !('created_by' in pa.body));
    ok('toast „Запазено"', h.calls.toast.some(t => t.indexOf('Запазено') >= 0), h.calls.toast.join(' | '));
    ok('toast не е червен', !RED.test(toastColor(h)), toastColor(h));
    ok('нито една заявка с ok:false', h.calls.notOk.length === 0);
  }

  section('3. Граничен случай: „0" е 0; нов ред с празно поле не се създава');
  {
    const h = env(STORE);
    h.w.loadSupply(); await ticks(6);
    h.doc.getElementById('sup-q1-it-a').value = '0';
    h.doc.getElementById('sup-q1-it-b').value = '';
    realClick(h.w, btn(mod(h), 'Запази'));
    await ticks(8);
    ok('един POST (само за A)', h.calls.post.length === 1 && h.calls.post[0].body.item_id === 'it-a', String(h.calls.post.length));
    ok('qty1 = 0, не null', h.calls.post[0] && h.calls.post[0].body.qty1 === 0);
    ok('няма PATCH', h.calls.patch.length === 0);
  }

  section('4. Изцяло празна нова бланка: никакви записи, не „Запазено"');
  {
    const h = env(STORE);
    h.w.loadSupply(); await ticks(6);
    realClick(h.w, btn(mod(h), 'Запази'));
    await ticks(8);
    ok('нула POST/PATCH', h.calls.post.length === 0 && h.calls.patch.length === 0);
    ok('няма „Запазено"', !h.calls.toast.some(t => t.indexOf('Запазено') >= 0), h.calls.toast.join(' | '));
  }

  section('5. Невалидно количество: без заявки, червен toast');
  {
    const h = env(STORE);
    h.w.loadSupply(); await ticks(6);
    h.doc.getElementById('sup-q1-it-a').value = '-3';
    realClick(h.w, btn(mod(h), 'Запази'));
    await ticks(8);
    ok('нула POST/PATCH', h.calls.post.length === 0 && h.calls.patch.length === 0);
    ok('червен toast с кода на артикула', RED.test(toastColor(h)) && h.calls.toast.some(t => t.indexOf('39801') >= 0), h.calls.toast.join(' | '));
  }

  section('6. Провал на ВТОРИЯ PATCH -> червен toast, НЕ „Запазено"');
  {
    let patchN = 0;
    const h = env(STORE, null, { fail: { PATCH: () => (++patchN === 2) } });
    const wk = h.w.supplyWeekStart();
    const entries = ITEMS.map(i => ({ id: 'e-' + i.id, template_id: 'tpl-col', item_id: i.id, store_name: 'Сливен', week_start: wk, qty1: 1, qty2: null }));
    h.setData('supply_entries', () => entries);
    h.w.loadSupply(); await ticks(6);
    h.doc.getElementById('sup-q1-it-a').value = '5';
    h.doc.getElementById('sup-q1-it-b').value = '6';
    const getsBefore = h.calls.get.length;
    realClick(h.w, btn(mod(h), 'Запази'));
    await ticks(8);
    ok('два PATCH, нула POST', h.calls.patch.length === 2 && h.calls.post.length === 0,
      h.calls.patch.length + '/' + h.calls.post.length);
    ok('вторият е върнал ok:false', h.calls.notOk.length === 1 && h.calls.notOk[0].method === 'PATCH');
    ok('toast е червен', RED.test(toastColor(h)), toastColor(h));
    ok('съобщението казва колко не са записани', h.calls.toast.some(t => /1 от 2/.test(t)), h.calls.toast.join(' | '));
    ok('НЯМА „Запазено"', !h.calls.toast.some(t => t.indexOf('Запазено') >= 0), h.calls.toast.join(' | '));
    ok('формата не е презаредена (въведеното стои)', h.doc.getElementById('sup-q1-it-b').value === '6');
    ok('след провала няма ново зареждане на шаблоните',
      !h.calls.get.slice(getsBefore).some(u => /supply_templates/.test(u)));
  }

  section('7. Обект ИЗВЪН target_stores: шаблонът не се показва');
  {
    const h = env(OTHER);
    h.w.loadSupply(); await ticks(6);
    const m = mod(h);
    ok('съобщение „За вашия обект няма активни бланки."', m.textContent.indexOf('За вашия обект няма активни бланки.') >= 0, m.textContent.slice(0, 200));
    ok('„Колоранти" го няма', m.textContent.indexOf('Колоранти') < 0);
    ok('няма поле за количество', !h.doc.getElementById('sup-q1-it-a'));
    ok('няма бутон „Запази"', !btn(m, 'Запази'));
    ok('не тегли артикули и записи', !h.calls.get.some(u => /supply_template_items|supply_entries/.test(u)), h.calls.get.join('\n'));
  }

  section('8. target_stores = null -> за всички обекти');
  {
    const h = env(OTHER);
    h.setData('supply_templates', [Object.assign({}, TPL, { target_stores: null })]);
    h.w.loadSupply(); await ticks(6);
    ok('Габрово вижда бланката', !!h.doc.getElementById('sup-q1-it-a'));
  }

  section('9. Навигация: реален клик на „🎨 Зареждане" в под-нав на Транспорт');
  {
    const h = env(STORE);
    const b = h.doc.getElementById('tps-supply');
    ok('бутонът съществува', !!b);
    if (b) {
      realClick(h.w, b); await ticks(6);
      ok('под-нав се показва', h.doc.getElementById('transport-pallets-subnav').style.display === 'block');
      ok('бутонът е активен', b.classList.contains('active'));
      ok('„Палети" не е активен', !h.doc.getElementById('tps-pallets').classList.contains('active'));
      ok('#mod-supply е видим', mod(h).style.display === 'block');
      ok('#mod-pallets е скрит', h.doc.getElementById('mod-pallets').style.display === 'none');
      const tt = h.doc.getElementById('tab-transport');
      ok('таб Транспорт е активен', !tt || tt.classList.contains('active'));
      ok('loadSupply() е тръгнал (формата е рендирана)', !!h.doc.getElementById('sup-q1-it-a'));
    }
  }

  section('10. ЦО/admin: само ✅/⬜ по target_stores');
  {
    const h = env(ADMIN);
    const wk = h.w.supplyWeekStart();
    h.setData('supply_entries', () => [
      { template_id: 'tpl-col', store_name: 'Сливен', week_start: wk, qty1: 3, qty2: null },
      { template_id: 'tpl-col', store_name: 'Петрич', week_start: wk, qty1: null, qty2: null } /* само нулирани = не е попълнил */
    ]);
    h.w.loadSupply(); await ticks(6);
    const m = mod(h);
    ok('надпис за следващ етап', m.textContent.indexOf('Обобщението по магазини е в следващ етап.') >= 0);
    const spans = Array.from(m.querySelectorAll('.sup-ov-store')).map(s => s.textContent.trim());
    ok('3 обекта от target_stores', spans.length === 3, spans.join(' | '));
    ok('✅ Сливен', spans.indexOf('✅ Сливен') >= 0, spans.join(' | '));
    ok('⬜ Петрич (само null стойности)', spans.indexOf('⬜ Петрич') >= 0, spans.join(' | '));
    ok('⬜ Кърджали', spans.indexOf('⬜ Кърджали') >= 0);
    ok('„попълнили 1 от 3"', m.textContent.indexOf('попълнили 1 от 3') >= 0);
    ok('няма форма и бутон „Запази"', !h.doc.getElementById('sup-q1-it-a') && !btn(m, 'Запази'));
  }

  report();
})();
