/* Транспорт > 🎨 Зареждане (supply.js), Етапи 1–2.

   Какво се заковава:
   - формата за обект: шаблонът се показва само ако обектът е в target_stores
     (или target_stores е null); редовете, предзаредените стойности за
     седмицата и „миналата седмица" като ориентир;
   - „Запази" с РЕАЛЕН клик: POST за нов ред, PATCH за съществуващ, празно
     поле = null (не 0), „0" = 0; created_by само при POST;
   - провал на кой да е от записите (тук: вторият PATCH) -> червен toast и
     НИКАКВО „Запазено" (правило 13);
   - навигацията: бутонът в под-нав на Транспорт, активен таб Транспорт;
   - ЦО/admin: списък ✅/⬜ кой е попълнил седмицата (Етап 1) и матрица
     артикули × обекти с избор на седмица, чипове по доставчик, скриване на
     празните редове и пълен Excel износ (Етап 2);
   - supplyWeekStart(): понеделникът на ISO седмицата, неделя -> предишния;
   - снимки-подсказки (supply_templates.photos) под указанията: href,
     target=_blank, rel=noopener; без снимки — без контейнер;
   - колоната САП се скрива при бланка без нито един код (floor-lm) във
     формата и в матрицата, а в Excel остава празна;
   - бланка без нито един доставчик: в матрицата няма ред с чипове и колона
     „Доставчик"; в Excel колоната остава празна. При ЕДИН доставчик
     чиповете си стоят (секция 13).

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

  section('10. ЦО/admin: ✅/⬜ по target_stores над матрицата');
  {
    const h = env(ADMIN);
    const wk = h.w.supplyWeekStart();
    h.setData('supply_entries', () => [
      { template_id: 'tpl-col', store_name: 'Сливен', week_start: wk, qty1: 3, qty2: null },
      { template_id: 'tpl-col', store_name: 'Петрич', week_start: wk, qty1: null, qty2: null } /* само нулирани = не е попълнил */
    ]);
    h.w.loadSupply(); await ticks(6);
    const m = mod(h);
    ok('placeholder-ът „следващ етап" го няма', m.textContent.indexOf('следващ етап') < 0);
    const spans = Array.from(m.querySelectorAll('.sup-ov-store')).map(s => s.textContent.trim());
    ok('3 обекта от target_stores', spans.length === 3, spans.join(' | '));
    ok('✅ Сливен', spans.indexOf('✅ Сливен') >= 0, spans.join(' | '));
    ok('⬜ Петрич (само null стойности)', spans.indexOf('⬜ Петрич') >= 0, spans.join(' | '));
    ok('⬜ Кърджали', spans.indexOf('⬜ Кърджали') >= 0);
    ok('„попълнили 1 от 3"', m.textContent.indexOf('попълнили 1 от 3') >= 0);
    ok('няма форма и бутон „Запази"', !h.doc.getElementById('sup-q1-it-a') && !btn(m, 'Запази'));
  }

  section('11. Матрица: 2 обекта × 2 артикула, празна клетка и Общо само от наличните');
  {
    const tpl = Object.assign({}, TPL, { target_stores: ['Сливен', 'Петрич'] });
    const h = env(ADMIN);
    h.setData('supply_templates', [tpl]);
    const wk = h.w.supplyWeekStart();
    h.setData('supply_entries', () => [
      { id: '1', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 5, qty2: null },
      { id: '2', template_id: 'tpl-col', item_id: 'it-b', store_name: 'Сливен', week_start: wk, qty1: 0, qty2: null },
      { id: '3', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Петрич', week_start: wk, qty1: 3, qty2: null }
      /* Петрич няма запис за it-b */
    ]);
    h.w.loadSupply(); await ticks(8);
    const m = mod(h);
    const heads = Array.from(m.querySelectorAll('table.sup-matrix thead th')).map(th => th.textContent.trim());
    ok('колоните: САП | Име | Доставчик | Петрич | Сливен | Общо', heads.join('|') === 'САП|Име|Доставчик|Петрич|Сливен|Общо', heads.join('|'));
    const rowA = m.querySelector('tr[data-item="it-a"]'), rowB = m.querySelector('tr[data-item="it-b"]');
    const cellsOf = tr => tr ? Array.from(tr.querySelectorAll('td.sup-cell,td.sup-total')).map(td => td.textContent) : [];
    ok('ред A: Петрич 3, Сливен 5, Общо 8', cellsOf(rowA).join('|') === '3|5|8', cellsOf(rowA).join('|'));
    ok('ред B: Петрич ПРАЗНО (не 0), Сливен 0, Общо 0', cellsOf(rowB).join('|') === '|0|0', JSON.stringify(cellsOf(rowB)));
    ok('редовете са по sort_order', Array.from(m.querySelectorAll('tbody tr[data-item]')).map(tr => tr.getAttribute('data-item')).join(',') === 'it-a,it-b');
    const wrap = m.querySelector('.sup-matrix-wrap');
    ok('таблицата е в контейнер с overflow-x:auto', !!wrap && /overflow-x:\s*auto/.test(wrap.getAttribute('style') || ''));
    ok('„попълнили 2 от 2" остава', m.textContent.indexOf('Колоранти — попълнили 2 от 2') >= 0);
    const wrapIdx = m.innerHTML.indexOf('sup-matrix-wrap'), rosterIdx = m.innerHTML.indexOf('sup-ov-store');
    ok('списъкът ✅/⬜ е ПРЕДИ таблицата', rosterIdx >= 0 && rosterIdx < wrapIdx);
    ok('заявката за записите е по седмица и е страницирана',
      h.calls.get.some(u => /supply_entries\?/.test(u) && u.indexOf('week_start=eq.' + wk) >= 0 && /limit=1000&offset=0/.test(u)), h.calls.get.join('\n'));

    const all = Object.assign({}, TPL, { target_stores: null, id: 'tpl-all', slug: 'all' });
    const h2 = env(ADMIN);
    h2.setData('supply_templates', [all]);
    h2.setData('supply_template_items', ITEMS.map(i => Object.assign({}, i, { template_id: 'tpl-all' })));
    h2.setData('supply_entries', () => [
      { id: '9', template_id: 'tpl-all', item_id: 'it-a', store_name: 'Габрово', week_start: h2.w.supplyWeekStart(), qty1: 1, qty2: null }
    ]);
    h2.w.loadSupply(); await ticks(8);
    const heads2 = Array.from(mod(h2).querySelectorAll('table.sup-matrix thead th')).map(th => th.textContent.trim());
    ok('target_stores=null -> колони само за обектите със записи', heads2.join('|') === 'САП|Име|Доставчик|Габрово|Общо', heads2.join('|'));
  }

  section('12. Шаблон с col2_label -> двойни колони');
  {
    const tpl = Object.assign({}, TPL, { target_stores: ['Сливен', 'Петрич'], col2_label: 'Наличност' });
    const h = env(ADMIN);
    h.setData('supply_templates', [tpl]);
    const wk = h.w.supplyWeekStart();
    h.setData('supply_entries', () => [
      { id: '1', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 5, qty2: 11 },
      { id: '2', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Петрич', week_start: wk, qty1: 2, qty2: null }
    ]);
    h.w.loadSupply(); await ticks(8);
    const m = mod(h);
    const trs = m.querySelectorAll('table.sup-matrix thead tr');
    ok('заглавието е на два реда', trs.length === 2, String(trs.length));
    const top = trs[0] ? Array.from(trs[0].children).map(th => th.textContent.trim() + '/' + (th.getAttribute('colspan') || '1')) : [];
    ok('горен ред: Петрич, Сливен и Общо с colspan=2', top.slice(3).join('|') === 'Петрич/2|Сливен/2|Общо/2', top.join('|'));
    const sub = trs[1] ? Array.from(trs[1].children).map(th => th.textContent.trim()) : [];
    ok('долен ред: 3 × (Брой за поръчка, Наличност)', sub.join('|') === 'Брой за поръчка|Наличност|Брой за поръчка|Наличност|Брой за поръчка|Наличност', sub.join('|'));
    const rowA = m.querySelector('tr[data-item="it-a"]');
    const vals = rowA ? Array.from(rowA.querySelectorAll('td.sup-cell,td.sup-total')).map(td => td.textContent) : [];
    ok('ред A: Петрич 2/празно, Сливен 5/11, Общо 7/11', vals.join('|') === '2||5|11|7|11', JSON.stringify(vals));
    const rowB = m.querySelector('tr[data-item="it-b"]');
    const valsB = rowB ? Array.from(rowB.querySelectorAll('td.sup-cell,td.sup-total')).map(td => td.textContent) : [];
    ok('ред B без записи: 6 празни клетки, Общо също празно', valsB.length === 6 && valsB.every(x => x === ''), JSON.stringify(valsB));
  }

  const ITEM_C = { id: 'it-c', template_id: 'tpl-col', sap_code: '63223', name: 'КОЛОРАНТ KRAFT 01 ЯРКО ЖЪЛТ 1Л', supplier: 'ДФХ БЪЛГАРИЯ ЕООД', active: true, sort_order: 3 };
  function ovEnv() {
    const h = env(ADMIN);
    const wk = h.w.supplyWeekStart();
    h.setData('supply_templates', [Object.assign({}, TPL, { target_stores: ['Сливен', 'Петрич'] })]);
    h.setData('supply_template_items', ITEMS.concat([ITEM_C]));
    const rows = [
      { id: '1', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 5, qty2: null },
      { id: '2', template_id: 'tpl-col', item_id: 'it-b', store_name: 'Петрич', week_start: wk, qty1: 4, qty2: null }
      /* it-c: без нито един запис -> празен ред */
    ];
    h.setData('supply_entries', () => rows);
    return h;
  }
  const visibleItems = h => Array.from(mod(h).querySelectorAll('table.sup-matrix tbody tr[data-item]')).map(tr => tr.getAttribute('data-item')).join(',');
  const chips = h => Array.from(mod(h).querySelectorAll('.sup-chip'));
  const chipNames = h => chips(h).map(c => c.textContent.trim()).join('|');
  const chipBy = (h, name) => chips(h).find(c => c.textContent.trim() === name);
  function setHide(h, on) {
    const box = mod(h).querySelector('.sup-hide-empty');
    box.checked = on;
    H.fire(h.w, box, 'change');
  }

  section('13. Чип по доставчик и „Скрий празните редове"');
  {
    const h = ovEnv();
    h.w.loadSupply(); await ticks(8);
    ok('чипове: Всички + 3 доставчика', chipNames(h) === 'Всички|ВАМКО ООД|ОРГАХИМ ЕАД|ДФХ БЪЛГАРИЯ ЕООД', chipNames(h));
    ok('„Всички" е активен по подразбиране', chips(h)[0].classList.contains('active'));
    ok('по подразбиране: всичките 3 реда, включително празния', visibleItems(h) === 'it-a,it-b,it-c', visibleItems(h));
    const cb = mod(h).querySelector('.sup-hide-empty');
    ok('чекбоксът е изключен по подразбиране', !!cb && !cb.checked);

    realClick(h.w, chipBy(h, 'ОРГАХИМ ЕАД'));
    ok('чип ОРГАХИМ: остава само it-b', visibleItems(h) === 'it-b', visibleItems(h));
    ok('чипът ОРГАХИМ е активен, „Всички" не е', chipBy(h, 'ОРГАХИМ ЕАД').classList.contains('active') && !chips(h)[0].classList.contains('active'));
    realClick(h.w, chipBy(h, 'ДФХ БЪЛГАРИЯ ЕООД'));
    ok('чип ДФХ: само празният it-c', visibleItems(h) === 'it-c', visibleItems(h));
    setHide(h, true);
    ok('ДФХ + скрий празните: нула реда и съобщение', visibleItems(h) === '' && mod(h).textContent.indexOf('Няма редове за показване.') >= 0, visibleItems(h));
    realClick(h.w, chipBy(h, 'Всички'));
    ok('„Всички" + скрий празните: it-a,it-b', visibleItems(h) === 'it-a,it-b', visibleItems(h));
    ok('чекбоксът остава отметнат след ново рендиране', mod(h).querySelector('.sup-hide-empty').checked);
    setHide(h, false);
    ok('изключен чекбокс: празният ред се връща', visibleItems(h) === 'it-a,it-b,it-c', visibleItems(h));

    const h1 = env(ADMIN);
    h1.setData('supply_template_items', [ITEMS[0]]);
    h1.w.loadSupply(); await ticks(8);
    ok('при 1 доставчик чиповете НЕ се крият (Всички + ВАМКО)', chipNames(h1) === 'Всички|ВАМКО ООД', chipNames(h1));
  }

  section('14. ◀ мести седмицата 7 дни назад и презарежда');
  {
    const h = env(ADMIN);
    const wk = h.w.supplyWeekStart();
    const prev = h.w.supplyAddDays(wk, -7);
    h.setData('supply_templates', [Object.assign({}, TPL, { target_stores: ['Сливен'] })]);
    h.setData('supply_entries', url => [
      { id: 'n', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 1, qty2: null },
      { id: 'p', template_id: 'tpl-col', item_id: 'it-a', store_name: 'Сливен', week_start: prev, qty1: 42, qty2: null }
    ].filter(e => url.indexOf('week_start=eq.' + e.week_start) >= 0));
    h.w.loadSupply(); await ticks(8);
    const lbl = () => (h.doc.getElementById('sup-week-label') || {}).textContent;
    const cellA = () => { const td = mod(h).querySelector('tr[data-item="it-a"] td.sup-cell'); return td ? td.textContent : null; };
    ok('по подразбиране текущата седмица', lbl() === 'Седмица от ' + h.w.fmtDate(wk), lbl());
    ok('▶ е изключен на текущата седмица', h.doc.getElementById('sup-week-next').disabled);
    ok('стойност от текущата седмица: 1', cellA() === '1', cellA());
    const getsBefore = h.calls.get.length;
    realClick(h.w, h.doc.getElementById('sup-week-prev'));
    await ticks(8);
    ok('етикетът показва седмицата 7 дни по-рано', lbl() === 'Седмица от ' + h.w.fmtDate(prev), lbl());
    const newGets = h.calls.get.slice(getsBefore);
    ok('нов GET към supply_entries за предишната седмица', newGets.some(u => /supply_entries\?/.test(u) && u.indexOf('week_start=eq.' + prev) >= 0), newGets.join('\n'));
    ok('матрицата е презаредена: 42', cellA() === '42', cellA());
    ok('▶ вече е активен', !h.doc.getElementById('sup-week-next').disabled);
    realClick(h.w, h.doc.getElementById('sup-week-next'));
    await ticks(8);
    ok('▶ връща към текущата', lbl() === 'Седмица от ' + h.w.fmtDate(wk) && cellA() === '1', lbl() + ' / ' + cellA());
    h.w.loadSupply(); await ticks(8);
    realClick(h.w, h.doc.getElementById('sup-week-prev')); await ticks(8);
    h.w.loadSupply(); await ticks(8);
    ok('ново отваряне на таба връща текущата седмица', lbl() === 'Седмица от ' + h.w.fmtDate(wk), lbl());
  }

  section('15. Excel: пълен износ, без филтъра по доставчик');
  {
    const h = ovEnv();
    h.w.loadSupply(); await ticks(8);
    const wk = h.w.supplyWeekStart();
    const x = { sheets: [], aoa: null, file: null };
    h.w.XLSX = {
      utils: {
        book_new: () => ({ SheetNames: [] }),
        aoa_to_sheet: aoa => { x.aoa = aoa; return {}; },
        book_append_sheet: (wb, ws, name) => { x.sheets.push(name); }
      },
      writeFile: (wb, name) => { x.file = name; }
    };
    /* включваме филтър и скриване — износът трябва да ги игнорира */
    realClick(h.w, chipBy(h, 'ОРГАХИМ ЕАД'));
    setHide(h, true);
    ok('преди износа на екрана е само it-b', visibleItems(h) === 'it-b', visibleItems(h));
    const b = mod(h).querySelector('.sup-excel');
    ok('бутон „📥 Excel" над таблицата', !!b && b.textContent.indexOf('📥 Excel') >= 0 &&
      mod(h).innerHTML.indexOf('sup-excel') < mod(h).innerHTML.indexOf('sup-matrix-wrap'));
    realClick(h.w, b);
    await ticks(2);
    const aoa = x.aoa || [];
    ok('заглавен ред като в матрицата', (aoa[0] || []).join('|') === 'САП|Име|Доставчик|Петрич|Сливен|Общо', (aoa[0] || []).join('|'));
    ok('заглавен + по 1 ред на артикул (3), въпреки филтъра', aoa.length === 4, String(aoa.length));
    ok('редовете: it-a, it-b и ПРАЗНИЯТ it-c', aoa.slice(1).map(r => r[0]).join(',') === '39801,62960,63223', aoa.slice(1).map(r => r[0]).join(','));
    ok('ред it-a: [39801, име, ВАМКО, null, 5, 5]', JSON.stringify(aoa[1]) === JSON.stringify(['39801', 'КОЛОРАНТ WB1 BLUE 1Л', 'ВАМКО ООД', null, 5, 5]), JSON.stringify(aoa[1]));
    ok('празните клетки са null, не 0', !!aoa[3] && aoa[3].slice(3).every(v => v === null), JSON.stringify(aoa[3]));
    ok('един лист с име „Колоранти"', x.sheets.join('|') === 'Колоранти', x.sheets.join('|'));
    ok('файл zarezhdane_colorants_<week_start>.xlsx', x.file === 'zarezhdane_colorants_' + wk + '.xlsx', x.file);
    ok('при наличен window.XLSX не се зарежда скрипт', !h.doc.querySelector('script[src*="xlsx"]'));
    ok('екранът не е пипнат от износа (пак само it-b)', visibleItems(h) === 'it-b', visibleItems(h));

    const longName = 'Колоранти/Бои: [тест]*? дълго име над трийсет и един знака';
    const sn = h.w.supplySheetName(longName);
    ok('име на лист: без \\ / ? * [ ] : и до 31 знака', sn.length <= 31 && !/[\\\/?*\[\]:]/.test(sn), sn + ' (' + sn.length + ')');

    const h2 = ovEnv();
    h2.w.loadSupply(); await ticks(8);
    delete h2.w.XLSX;
    realClick(h2.w, mod(h2).querySelector('.sup-excel'));
    const sc = h2.doc.querySelector('script[src*="xlsx"]');
    ok('без window.XLSX: зарежда cdnjs xlsx 0.18.5', !!sc && sc.getAttribute('src') === 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', sc && sc.getAttribute('src'));
  }

  section('16. Над 1000 записа: втора страница; провал -> грешка, не непълна матрица');
  {
    const h = env(ADMIN);
    const wk = h.w.supplyWeekStart();
    h.setData('supply_templates', [Object.assign({}, TPL, { target_stores: ['Сливен'] })]);
    const filler = [];
    for (let i = 0; i < 1000; i++) filler.push({ id: 'f' + i, template_id: 'tpl-col', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 1, qty2: null });
    h.setData('supply_entries', url => /offset=0(&|$)/.test(url) ? filler
      : [{ id: 'last', template_id: 'tpl-col', item_id: 'it-b', store_name: 'Сливен', week_start: wk, qty1: 9, qty2: null }]);
    h.w.loadSupply(); await ticks(10);
    ok('има заявка с offset=1000', h.calls.get.some(u => /supply_entries\?.*offset=1000/.test(u)), h.calls.get.join('\n'));
    const c = mod(h).querySelector('tr[data-item="it-b"] td.sup-cell');
    ok('записът от втората страница е в матрицата (9)', !!c && c.textContent === '9', c && c.textContent);

    const h2 = env(ADMIN, null, { fail: { GET: /supply_entries/ } });
    h2.w.loadSupply(); await ticks(10);
    ok('при провал няма матрица', !mod(h2).querySelector('table.sup-matrix'));
    ok('при провал има съобщение за грешка', mod(h2).textContent.indexOf('Грешка при зареждане на записите') >= 0, mod(h2).textContent.slice(0, 160));
  }

  section('17. ЦО с роля извън isGlobal() вижда обобщението; обектът — не');
  {
    const h = env({ email: 'sn@temax.bg', display_name: 'Снабдяване', role: 'supply', store_name: 'Централен офис' });
    h.w.loadSupply(); await ticks(8);
    ok('ЦО (role=supply) вижда матрицата', !!mod(h).querySelector('table.sup-matrix'));
    ok('и няма форма', !h.doc.getElementById('sup-q1-it-a'));
    const h2 = env(STORE);
    h2.w.loadSupply(); await ticks(8);
    ok('обектът няма матрица, чипове, ◀ ▶ и Excel', !mod(h2).querySelector('table.sup-matrix') && !mod(h2).querySelector('.sup-chip') &&
      !h2.doc.getElementById('sup-week-prev') && !mod(h2).querySelector('.sup-excel'));
    ok('формата на обекта си е на мястото', !!h2.doc.getElementById('sup-q1-it-a'));
  }

  /* ── Бланки от 19.09.2026: снимки-подсказки и шаблон без САП кодове ── */
  const PH = n => 'https://tenchotenev13-afk.github.io/Tmax-store-portal/img/supply/cable-reel-' + n + '.jpg';
  const CABLES = {
    id: 'tpl-cab', name: 'Кабели на макара', slug: 'cables-reels', col1_label: 'Налична макара', col2_label: null,
    target_stores: null, active: true, sort_order: 2, photos: [PH(1), PH(2), PH(3)],
    instructions: 'Попълваме само брой макари. Ако нямате — пишете 0.'
  };
  const CABLE_ITEMS = [
    { id: 'c-1', template_id: 'tpl-cab', sap_code: '23237', name: 'ПВВ-МБ1 2X1', supplier: null, active: true, sort_order: 1 },
    { id: 'c-2', template_id: 'tpl-cab', sap_code: '23238', name: 'ПВВ-МБ1 2X1.5', supplier: null, active: true, sort_order: 2 }
  ];
  const FLOOR = {
    id: 'tpl-floor', name: 'Подови настилки (линейни метри)', slug: 'floor-lm',
    col1_label: 'Общ брой места в търговска зала', col2_label: 'Брой за трансфер/поръчка ОБЩО (зала и склад)',
    target_stores: null, active: true, sort_order: 1, photos: null,
    instructions: 'Първата колона е броят места за ролки в търговската зала.'
  };
  const FLOOR_ITEMS = [
    { id: 'f-1', template_id: 'tpl-floor', sap_code: null, name: 'Балатум 4м.', supplier: null, active: true, sort_order: 1 },
    { id: 'f-2', template_id: 'tpl-floor', sap_code: null, name: 'Балатум 3м.', supplier: null, active: true, sort_order: 2 }
  ];
  function tplEnv(user, tpls, items, entries) {
    const h = env(user);
    h.setData('supply_templates', tpls);
    h.setData('supply_template_items', items);
    h.setData('supply_entries', () => entries || []);
    return h;
  }
  const card = (h, id) => h.doc.getElementById(id);

  section('18. Снимки-подсказки под указанията');
  {
    const withBad = Object.assign({}, CABLES, { photos: CABLES.photos.concat(['javascript:alert(1)', '']) });
    const h = tplEnv(STORE, [withBad], CABLE_ITEMS);
    h.w.loadSupply(); await ticks(6);
    const c = card(h, 'sup-card-tpl-cab');
    const box = c && c.querySelector('.sup-photos');
    ok('има контейнер .sup-photos', !!box);
    const links = box ? Array.from(box.querySelectorAll('a')) : [];
    ok('точно 3 снимки (javascript: и празният низ са отхвърлени)', links.length === 3, String(links.length));
    ok('href-овете са трите URL-а по ред', links.map(a => a.getAttribute('href')).join('|') === [PH(1), PH(2), PH(3)].join('|'),
      links.map(a => a.getAttribute('href')).join('|'));
    ok('всяка връзка е target=_blank', links.length === 3 && links.every(a => a.getAttribute('target') === '_blank'));
    ok('всяка връзка е rel=noopener', links.length === 3 && links.every(a => /\bnoopener\b/.test(a.getAttribute('rel') || '')));
    const imgs = box ? Array.from(box.querySelectorAll('img')) : [];
    ok('миниатюрите сочат същите URL-и', imgs.map(i => i.getAttribute('src')).join('|') === [PH(1), PH(2), PH(3)].join('|'));
    ok('височина 90px', imgs.length === 3 && imgs.every(i => /height:\s*90px/.test(i.getAttribute('style') || '')));
    ok('контейнерът е flex, wrap, gap 8px', !!box && /display:\s*flex/.test(box.getAttribute('style')) &&
      /flex-wrap:\s*wrap/.test(box.getAttribute('style')) && /gap:\s*8px/.test(box.getAttribute('style')));
    const html = c ? c.innerHTML : '';
    ok('снимките са ПОД указанията и НАД таблицата',
      html.indexOf('Ако нямате — пишете 0.') < html.indexOf('sup-photos') && html.indexOf('sup-photos') < html.indexOf('<table'));

    const h2 = tplEnv(STORE, [Object.assign({}, CABLES, { id: 'tpl-null', photos: null }), Object.assign({}, CABLES, { id: 'tpl-empty', slug: 'e', photos: [] })],
      CABLE_ITEMS.concat(CABLE_ITEMS.map(i => Object.assign({}, i, { id: i.id + 'e', template_id: 'tpl-empty' }))).map(i => i.template_id === 'tpl-cab' ? Object.assign({}, i, { template_id: 'tpl-null' }) : i));
    h2.w.loadSupply(); await ticks(6);
    ok('photos=null: няма контейнер', !!card(h2, 'sup-card-tpl-null') && !card(h2, 'sup-card-tpl-null').querySelector('.sup-photos'));
    ok('photos=[]: няма контейнер', !!card(h2, 'sup-card-tpl-empty') && !card(h2, 'sup-card-tpl-empty').querySelector('.sup-photos'));
    ok('в целия модул няма нито една .sup-photos', !mod(h2).querySelector('.sup-photos'));
  }

  section('19. Обект: floor-lm без САП колона и с две колони; кабелите със САП');
  {
    const h = tplEnv(STORE, [FLOOR, CABLES], FLOOR_ITEMS.concat(CABLE_ITEMS));
    h.w.loadSupply(); await ticks(6);
    const fc = card(h, 'sup-card-tpl-floor'), cc = card(h, 'sup-card-tpl-cab');
    const fHeads = fc ? Array.from(fc.querySelectorAll('thead th')).map(th => th.textContent.trim()) : [];
    ok('floor-lm: колони Име | Доставчик | col1 | col2 | Миналата седмица (без САП)',
      fHeads.join('|') === 'Име|Доставчик|Общ брой места в търговска зала|Брой за трансфер/поръчка ОБЩО (зала и склад)|Миналата седмица', fHeads.join('|'));
    const fRow = fc ? fc.querySelector('tbody tr') : null;
    ok('floor-lm: всеки ред има 5 клетки (колкото заглавията)', !!fRow && fRow.children.length === 5, fRow && String(fRow.children.length));
    ok('floor-lm: първата клетка е името, не празен САП', !!fRow && fRow.children[0].textContent.trim() === 'Балатум 4м.');
    ok('floor-lm: две полета за вход на ред', !!h.doc.getElementById('sup-q1-f-1') && !!h.doc.getElementById('sup-q2-f-1'));
    ok('floor-lm (photos=null): без снимки', !!fc && !fc.querySelector('.sup-photos'));
    const cHeads = cc ? Array.from(cc.querySelectorAll('thead th')).map(th => th.textContent.trim()) : [];
    ok('кабели: САП е първа колона', cHeads[0] === 'САП', cHeads.join('|'));
    ok('кабели: снимките са там', !!cc && cc.querySelectorAll('.sup-photos a').length === 3);

    h.doc.getElementById('sup-q1-f-1').value = '6';
    h.doc.getElementById('sup-q2-f-1').value = '14';
    realClick(h.w, btn(fc, 'Запази'));
    await ticks(8);
    const p = (h.calls.post[0] || {}).body || {};
    ok('floor-lm запис: един POST с qty1=6 и qty2=14', h.calls.post.length === 1 && p.item_id === 'f-1' && p.qty1 === 6 && p.qty2 === 14, JSON.stringify(p));
  }

  section('20. ЦО: floor-lm матрица без САП, двойни колони; Excel пази САП празна');
  {
    const wkH = env(ADMIN); const wk = wkH.w.supplyWeekStart();
    const h = tplEnv(ADMIN, [FLOOR, CABLES], FLOOR_ITEMS.concat(CABLE_ITEMS), [
      { id: 'e1', template_id: 'tpl-floor', item_id: 'f-1', store_name: 'Сливен', week_start: wk, qty1: 6, qty2: 14 },
      { id: 'e2', template_id: 'tpl-floor', item_id: 'f-1', store_name: 'Габрово', week_start: wk, qty1: 3, qty2: null },
      { id: 'e3', template_id: 'tpl-cab', item_id: 'c-1', store_name: 'Сливен', week_start: wk, qty1: 2, qty2: null }
    ]);
    h.w.loadSupply(); await ticks(8);
    const fo = card(h, 'sup-ov-tpl-floor'), co = card(h, 'sup-ov-tpl-cab');
    const trs = fo ? fo.querySelectorAll('table.sup-matrix thead tr') : [];
    const top = trs[0] ? Array.from(trs[0].children).map(th => th.textContent.trim() + '/' + (th.getAttribute('colspan') || '1')) : [];
    ok('floor-lm горен ред: Име | Габрово×2 | Сливен×2 | Общо×2 (без САП и Доставчик)',
      top.join('|') === 'Име/1|Габрово/2|Сливен/2|Общо/2', top.join('|'));
    const sub = trs[1] ? Array.from(trs[1].children).map(th => th.textContent.trim()) : [];
    ok('floor-lm долен ред: 3 × (col1, col2)', sub.length === 6 && sub[0] === FLOOR.col1_label && sub[1] === FLOOR.col2_label, sub.join('|'));
    const r1 = fo ? fo.querySelector('tr[data-item="f-1"]') : null;
    ok('floor-lm ред: 1 + 6 клетки (без САП и Доставчик)', !!r1 && r1.children.length === 7, r1 && String(r1.children.length));
    const vals = r1 ? Array.from(r1.querySelectorAll('td.sup-cell,td.sup-total')).map(td => td.textContent) : [];
    ok('floor-lm стойности: Габрово 3/празно, Сливен 6/14, Общо 9/14', vals.join('|') === '3||6|14|9|14', JSON.stringify(vals));
    ok('floor-lm: първата клетка е името', !!r1 && r1.children[0].textContent.trim() === 'Балатум 4м.');
    const cHead = co ? co.querySelector('table.sup-matrix thead th') : null;
    ok('кабели в матрицата: САП остава', !!cHead && cHead.textContent.trim() === 'САП');
    ok('без нито един доставчик: няма ред с чипове', !!fo && !fo.querySelector('.sup-chips') && !fo.querySelector('.sup-chip'));
    ok('без нито един доставчик: няма колона „Доставчик"', !!fo && Array.from(fo.querySelectorAll('thead th')).every(th => th.textContent.trim() !== 'Доставчик'));
    ok('чекбоксът и Excel бутонът си стоят', !!fo && !!fo.querySelector('.sup-hide-empty') && !!fo.querySelector('.sup-excel'));
    const r2 = fo ? fo.querySelector('tr[data-item="f-2"]') : null;
    ok('празен ред: клетки 7', !!r2 && r2.children.length === 7);
    const hE = tplEnv(ADMIN, [Object.assign({}, FLOOR, { target_stores: ['Сливен', 'Габрово'] })], FLOOR_ITEMS, []);
    hE.w.loadSupply(); await ticks(8);
    setHide(hE, true);
    const emptyTd = card(hE, 'sup-ov-tpl-floor') && card(hE, 'sup-ov-tpl-floor').querySelector('tbody td[colspan]');
    ok('„Няма редове" с colspan = листовите колони без Доставчик (1 + 3×2 = 7)',
      !!emptyTd && emptyTd.getAttribute('colspan') === '7', emptyTd && emptyTd.getAttribute('colspan'));
    const co2 = card(h, 'sup-ov-tpl-cab');
    ok('кабели (също без доставчик): няма чипове и колона „Доставчик", САП остава',
      !!co2 && !co2.querySelector('.sup-chips') &&
      Array.from(co2.querySelectorAll('thead th')).map(th => th.textContent.trim()).slice(0, 2).join('|') === 'САП|Име');

    const x = { aoa: null, file: null };
    h.w.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: a => { x.aoa = a; return {}; }, book_append_sheet: () => {} },
      writeFile: (wb, n) => { x.file = n; } };
    realClick(h.w, fo.querySelector('.sup-excel'));
    await ticks(2);
    const aoa = x.aoa || [];
    ok('Excel floor-lm: първата заглавка е САП', (aoa[0] || [])[0] === 'САП', (aoa[0] || []).join('|'));
    ok('Excel floor-lm: заглавки с двойни колони',
      (aoa[0] || []).slice(3).join('|') === ['Габрово — ' + FLOOR.col1_label, 'Габрово — ' + FLOOR.col2_label, 'Сливен — ' + FLOOR.col1_label,
        'Сливен — ' + FLOOR.col2_label, 'Общо — ' + FLOOR.col1_label, 'Общо — ' + FLOOR.col2_label].join('|'), (aoa[0] || []).slice(3).join('|'));
    ok('Excel floor-lm: 1 + 2 реда', aoa.length === 3, String(aoa.length));
    ok('Excel floor-lm: заглавки САП | Име | Доставчик остават', (aoa[0] || []).slice(0, 3).join('|') === 'САП|Име|Доставчик', (aoa[0] || []).slice(0, 3).join('|'));
    ok('Excel floor-lm: клетките „Доставчик" са празни', aoa.slice(1).every(r => r[2] === ''), JSON.stringify(aoa.slice(1).map(r => r[2])));
    ok('Excel floor-lm: САП клетките са празни', aoa.slice(1).every(r => r[0] === ''), JSON.stringify(aoa.slice(1).map(r => r[0])));
    ok('Excel floor-lm ред 1: [\'\', Балатум 4м., \'\', 3, null, 6, 14, 9, 14]',
      JSON.stringify(aoa[1]) === JSON.stringify(['', 'Балатум 4м.', '', 3, null, 6, 14, 9, 14]), JSON.stringify(aoa[1]));
    ok('Excel файл: zarezhdane_floor-lm_<week>.xlsx', x.file === 'zarezhdane_floor-lm_' + wk + '.xlsx', x.file);
  }

  report();
})();
