/* Палети, Чек лист, Администрация — само визуално.

   Таблиците са в „tbl-wrap tbl-compact tbl-auto" (закачен thead от 1200px, скрол в кутията под 1200px),
   решетките с фиксиран брой колони са свиващи се (repeat(auto-fit,minmax(min(100%,Npx),1fr))); в чек листа
   заглавният ред е закачен, „да“/„не“ са в различен цвят, а 💬 е поне 28×28px.

   Нищо друго: заявки, условия, текстове, изчисления, Excel на палетите и имейлът на чек листа са същите байт по
   байт — еталонът в small-tabs-ui.expected.json е снет с --dump от версията ПРЕДИ промяната (origin/main).

   Пускане:  node tests/small-tabs-ui.test.js .
   Еталон от друга версия:  node tests/small-tabs-ui.test.js <корен> --dump */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const DUMP = process.argv.indexOf('--dump') >= 0;
const clone = x => JSON.parse(JSON.stringify(x));

const ADMIN = { id: 'u-1', email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const MANAGER = { id: 'u-2', email: 'm@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' };
const STORES = ['Враца', 'Габрово', 'Добрич', 'Троян', 'Шумен'];
const USERS = STORES.concat(['Централен офис', 'Логистичен склад Добрич']).map(s => ({ store_name: s }));
const METRICS = [
  { key: 'revizia_953', label: 'ревизия', sublabel: '953', value_type: 'yes_no', sort_order: 1, active: true },
  { key: 'spravka_minusi', label: 'справка минуси', sublabel: 'подадено в срок/правилно', value_type: 'yes_no', sort_order: 2, active: true },
  { key: 'storna_priem', label: 'Сторна по грешни приеми', sublabel: 'брой сторнирани поръчки/позиции', value_type: 'number', sort_order: 3, active: true },
  { key: 'preocenka', label: 'преоценка', sublabel: 'подадено в срок/правилно', value_type: 'yes_no_none', sort_order: 4, active: true }
];
function crow(store, key, over) { return Object.assign({ store_name: store, metric_key: key, control_value: null, portal_value: null, control_num: null, comment: null }, over || {}); }
const CROWS = [
  crow('Враца', 'revizia_953', { control_value: 'da' }),
  crow('Враца', 'spravka_minusi', { control_value: 'ne', comment: 'липсва отчет' }),
  crow('Враца', 'storna_priem', { control_num: 3 }),
  crow('Враца', 'preocenka', { control_value: 'nyamat' }),
  crow('Габрово', 'revizia_953', { portal_value: 'da' }),
  crow('Габрово', 'spravka_minusi', { portal_value: 'ne' }),
  crow('Добрич', 'revizia_953', { control_value: 'ne' })
];
function palletRow(store, date, n) {
  return { id: store + date, store_name: store, report_date: date, submitted_by: 'Иван', euro_pallets: n, small_pallets: n + 1, nonstandard_pallets: 0, grate_pallets: 2, bilka_pallets: 1, sent_note: 'ок' };
}
const PALLETS = [palletRow('Враца', '2026-10-05', 10), palletRow('Враца', '2026-09-28', 14), palletRow('Габрово', '2026-10-04', 6), palletRow('Добрич', '2026-09-20', 8)];

function freeze(w, iso) {
  const Real = w.Date, ms = new Real(iso + 'T12:00:00').getTime();
  w.Date = class extends Real { constructor(...a) { if (!a.length) super(ms); else super(...a); } static now() { return ms; } };
}
function env(user, over) {
  const h = boot(Object.assign({
    modules: ['bulletin.js', 'pallets.js', 'checklist.js', 'admin.js'], user,
    data: { users: USERS, transport_pallets: PALLETS, weekly_checklist_metrics: METRICS, weekly_checklist: CROWS, app_settings: [], stores: STORES.map(n => ({ name: n })) }
  }, over || {}));
  freeze(h.w, '2026-10-06');
  return h;
}
function fakeXlsx(h) {
  const X = { written: [] };
  X.utils = { book_new: () => ({ names: [], sheets: {} }), aoa_to_sheet: aoa => ({ aoa }), book_append_sheet: (wb, ws, n) => { wb.names.push(n); wb.sheets[n] = ws; } };
  X.writeFile = (wb, name) => { X.written.push({ name, sheets: wb.names.map(n => ({ n, aoa: JSON.parse(JSON.stringify(wb.sheets[n].aoa, (k, v) => v)) })) }); };
  h.w.XLSX = X;
  return X;
}
const mod = (h, id) => h.doc.getElementById(id);
const wraps = root => Array.from(root.querySelectorAll('.tbl-wrap'));
const isCompact = el => el.classList.contains('tbl-compact') && el.classList.contains('tbl-auto');

async function snapshot() {
  const out = {};
  const a = env(ADMIN); const xa = fakeXlsx(a);
  a.w.loadPallets(); await ticks(); await ticks();
  a.w.exportPalletsExcel(); for (let i = 0; i < 6; i++) await ticks();
  out.palletsExcelAdmin = xa.written;
  const m = env(MANAGER); const xm = fakeXlsx(m);
  m.w.loadPallets(); await ticks(); await ticks();
  m.w.exportPalletsExcel(); for (let i = 0; i < 6; i++) await ticks();
  out.palletsExcelStore = xm.written;
  const c = env(ADMIN);
  out.checklistEmail = c.w.checklistEmailHtml(2026, 41, 1, clone(CROWS), clone(METRICS), STORES.slice(), 'бележка');
  out.checklistEmailNoNote = c.w.checklistEmailHtml(2026, 41, 2, [], clone(METRICS), STORES.slice(), null);
  out.checklistLegend = c.w.checklistLegendHtml();
  return out;
}

(async function run() {
  if (DUMP) { console.log(JSON.stringify(await snapshot())); process.exit(0); }
  const EXPECTED = JSON.parse(fs.readFileSync(path.join(__dirname, 'small-tabs-ui.expected.json'), 'utf8'));
  const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

  section('1. Палети: таблиците са tbl-compact tbl-auto, решетките са свиващи се');
  {
    const a = env(ADMIN);
    if (guard('админ: loadPallets()', () => a.w.loadPallets())) {
      await ticks(); await ticks();
      const w = wraps(mod(a, 'mod-pallets'));
      ok('обобщена справка: таблицата е в tbl-wrap tbl-compact tbl-auto', w.length === 1 && isCompact(w[0]) && !!w[0].querySelector('table'), w.map(x => x.className).join(' | '));
      ok('обобщена справка: ОБЩО е на мястото си (tfoot)', !!mod(a, 'mod-pallets').querySelector('tfoot tr'));
    }
    const m = env(MANAGER);
    if (guard('магазин: loadPallets()', () => m.w.loadPallets())) {
      await ticks(); await ticks();
      const w = wraps(mod(m, 'mod-pallets'));
      ok('магазин: таблицата „История“ е tbl-compact tbl-auto', w.length === 1 && isCompact(w[0]), w.map(x => x.className).join(' | '));
      const grids = Array.from(mod(m, 'mod-pallets').querySelectorAll('[style*="display:grid"]'));
      ok('магазин: двете решетки (въвеждане и текущи) са auto-fit', grids.length === 2 && grids.every(g => /repeat\(auto-fit,minmax\(min\(100%,110px\),1fr\)\)/.test(g.getAttribute('style'))), grids.map(g => g.getAttribute('style').slice(0, 80)).join(' | '));
      ok('магазин: във всяка решетка има 5 вида палети', grids.every(g => g.children.length === 5), grids.map(g => g.children.length).join(','));
    }
  }

  section('2. Чек лист: закачен заглавен ред, цветове „да“/„не“, 💬 ≥ 28px');
  {
    const h = env(ADMIN);
    if (guard('renderChecklist()', () => { h.w.loadChecklist(); })) {
      await ticks(); await ticks(); await ticks();
      const t = h.doc.getElementById('checklist-table');
      if (ok('таблицата #checklist-table е на екрана', !!t)) {
        const wrap = t.parentElement;
        ok('обвивката е tbl-wrap tbl-compact tbl-auto (закачен thead от 1200px)', wrap.classList.contains('tbl-wrap') && isCompact(wrap), wrap.className);
        const css = Array.from(h.doc.querySelectorAll('style')).map(s => s.textContent).join('\n');
        ok('общото правило: .tbl-compact thead th е sticky по top', /\.tbl-compact thead th\{position:sticky;top:/.test(css));
        const ths = t.querySelectorAll('thead th');
        const corner = ths[0];
        ok('„Обект“ остава закачена отляво и е над другите заглавия (z-index 3 > 2)', /position:sticky;left:0;z-index:3/.test(corner.getAttribute('style')) && corner.textContent.trim() === 'Обект', corner.getAttribute('style'));
        const first = t.querySelector('tbody tr td');
        ok('колоната с обекта в тялото остава закачена отляво', /position:sticky;left:0/.test(first.getAttribute('style')));
        const val = (store, key) => { const si = h.w.checklistStores.indexOf(store), mi = h.w.checklistMetrics.findIndex(m => m.key === key); const td = t.querySelector('td[data-si="' + si + '"][data-mi="' + mi + '"]'); return td && td.querySelector('.cl-val'); };
        const vDa = val('Враца', 'revizia_953'), vNe = val('Враца', 'spravka_minusi'), vNy = val('Враца', 'preocenka');
        ok('текстовете не са сменени: „да“, „не“, „нямат“', !!vDa && vDa.textContent === 'да' && !!vNe && vNe.textContent === 'не' && !!vNy && vNy.textContent === 'нямат', [vDa, vNe, vNy].map(x => x && x.textContent).join('|'));
        const col = el => (/(?:^|;)color:(#[0-9a-f]{3,6})/i.exec(el.getAttribute('style')) || [])[1];
        const bg = el => (/background:(#[0-9a-f]{3,6})/i.exec(el.getAttribute('style')) || [])[1];
        ok('„да“ и „не“ са с различен фон (зелен / червен)', !!bg(vDa) && !!bg(vNe) && bg(vDa) !== bg(vNe), bg(vDa) + ' / ' + bg(vNe));
        ok('потвърденото запазва тъмния текст (знакът „потвърдено“ от стария дизайн)', col(vDa) === '#0f172a' && col(vNe) === '#0f172a');
        ok('„нямат“ е без фон (неутрално)', !bg(vNy));
        const fDa = val('Габрово', 'revizia_953'), fNe = val('Габрово', 'spravka_minusi');
        ok('стойност от портала (бледа): светъл фон — различен за „да“/„не“ и по-светъл от потвърдените', !!bg(fDa) && !!bg(fNe) && bg(fDa) !== bg(fNe) && bg(fDa) !== bg(vDa) && bg(fNe) !== bg(vNe), [bg(fDa), bg(fNe), bg(vDa), bg(vNe)].join(' '));
        ok('бледата стойност пази сивия текст, курсива и заглавието „не е потвърдена“', col(fDa) === '#94a3b8' && /font-style:italic/.test(fDa.getAttribute('style')) && /не е потвърдена/.test(fDa.getAttribute('title')));
        const num = val('Враца', 'storna_priem');
        ok('числото е неутрално (без фон)', !!num && num.textContent === '3' && !bg(num));
        const icons = Array.from(t.querySelectorAll('.cl-cmt'));
        ok('във всяка клетка има 💬', icons.length === h.w.checklistStores.length * h.w.checklistMetrics.length, String(icons.length));
        ok('💬 е поне 28×28px (min-width/min-height)', icons.every(i => /min-width:28px/.test(i.getAttribute('style')) && /min-height:28px/.test(i.getAttribute('style'))));
        ok('💬 пази заглавието и прозрачността (има/няма коментар)', icons.some(i => /opacity:1/.test(i.getAttribute('style')) && i.getAttribute('title') === 'липсва отчет') && icons.some(i => /opacity:\.25/.test(i.getAttribute('style'))));
      }
    }
  }

  section('3. Администрация: таблиците са tbl-compact tbl-auto, решетката е свиваща се');
  {
    const h = env(ADMIN, { data: { users: [{ id: 'u1', email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', active: true, notify_groups: ['co'] }], stores: [], notification_topics: [{ key: 'overdue_tasks', label: 'Просрочени', schedule_type: 'daily', weekdays: [1, 2], scheduled_time: '08:15:00', active: true, sort_order: 1 }], notification_matrix: [], notification_overrides: [{ id: 'ovr-1', user_email: 'a@temax.bg', topic_key: 'overdue_tasks', mode: 'include', channel: 'both', scope: 'all', note: 'тест' }], notification_schedules: [{ id: 'sch-1', entity_type: 'task', entity_id: 't1', schedule_type: 'daily', scheduled_time: '09:00:00', active: true, created_by: 'a@temax.bg', last_sent_at: null }], product_catalog: [{ sap_code: '100', product_name: 'Тест артикул', default_unit: 'бр' }] } });
    guard('loadNotificationsAdmin()', () => h.w.loadNotificationsAdmin());
    for (let i = 0; i < 8; i++) await ticks();
    const card = mod(h, 'notif-admin-card');
    const ws = card ? wraps(card) : [];
    ok('картата „Известия“ има таблици', ws.length >= 2, 'tbl-wrap: ' + ws.length);
    ok('всички са tbl-wrap tbl-compact tbl-auto', ws.length > 0 && ws.every(isCompact), ws.map(x => x.className).join(' | '));
    guard('renderReportsAdmin() и renderNotifSchedules() директно', () => { try { h.w.renderReportsAdmin(); } catch (e) {} try { h.w.renderNotifSchedules(); } catch (e) {} });
    const all = wraps(mod(h, 'mod-admin'));
    /* двете статични таблици (потребители, обекти) са в index.html и не са част от тази промяна */
    const dyn = all.filter(x => !x.closest('#users-section, #stores-section') && !isCompact(x));
    ok('всички таблици, които рисува admin.js, са tbl-compact tbl-auto (извън двете статични от index.html)', all.filter(isCompact).length >= 4 && dyn.length === 2, 'компактни: ' + all.filter(isCompact).length + ', други: ' + dyn.length);
    ok('няма останала „гола“ tbl-wrap без tbl-compact в admin.js', !/<div class="tbl-wrap"><table/.test(src('admin.js')));
    /* таблицата на търсене в каталога (без обвивка досега) */
    h.doc.body.insertAdjacentHTML('beforeend', '<div id="catalog-host"></div>');
    guard('renderCatalogAdmin() + searchCatalog()', () => { h.w.renderCatalogAdmin(1); });
    const inp = h.doc.getElementById('catalog-search-inp');
    if (inp) { inp.value = 'тест'; h.w.searchCatalog(); for (let i = 0; i < 6; i++) await ticks(); }
    const res = h.doc.getElementById('catalog-search-results');
    ok('търсене в каталога: резултатът е таблица в tbl-wrap tbl-compact tbl-auto', !!res && !!res.querySelector('.tbl-wrap.tbl-compact.tbl-auto > table'), res && res.innerHTML.slice(0, 120));
    ok('…с резултата от търсенето (SAP 100)', !!res && /Тест артикул/.test(res.textContent));
    guard('модал „Нова забрана“ (_renderRestrictionModal)', () => h.w._renderRestrictionModal(['Враца', 'Габрово']));
    const g = h.doc.querySelector('#restriction-modal-ov [style*="display:grid"]');
    ok('модал „Нова забрана“: двете дати са в свиваща се решетка', !!g && /repeat\(auto-fit,minmax\(min\(100%,140px\),1fr\)\)/.test(g.getAttribute('style')) && g.children.length === 2, g && g.getAttribute('style'));
  }

  section('4. Няма решетки с фиксиран брой колони в трите файла (имейлът на чек листа е на таблици)');
  {
    const fixed = /grid-template-columns:\s*(?:\d+(?:\.\d+)?fr(?:\s|;)|repeat\(\s*\d+\s*,)/;
    for (const f of ['pallets.js', 'checklist.js', 'admin.js']) ok(f + ': няма grid-template-columns с фиксиран брой колони', !fixed.test(src(f)), (src(f).match(new RegExp(fixed.source, 'g')) || []).join(' | '));
  }

  section('5. Excel на палетите, имейлът и легендата на чек листа — същите байт по байт (еталон от origin/main)');
  {
    const got = await snapshot();
    ok('Excel на палетите (админ): същият (' + JSON.stringify(got.palletsExcelAdmin).length + ' знака)', JSON.stringify(got.palletsExcelAdmin) === JSON.stringify(EXPECTED.palletsExcelAdmin) && got.palletsExcelAdmin.length === 1);
    ok('Excel на палетите (магазин): същият', JSON.stringify(got.palletsExcelStore) === JSON.stringify(EXPECTED.palletsExcelStore) && got.palletsExcelStore.length === 1);
    ok('имейлът на чек листа (с коментар и бележка): същият (' + got.checklistEmail.length + ' знака)', got.checklistEmail === EXPECTED.checklistEmail && got.checklistEmail.length > 2000);
    ok('имейлът на чек листа (празна седмица): същият', got.checklistEmailNoNote === EXPECTED.checklistEmailNoNote);
    ok('легендата на чек листа: същата', got.checklistLegend === EXPECTED.checklistLegend && got.checklistLegend.length > 100);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
