/* Excel с ИСТИНСКИЯ SheetJS 0.18.5 — VK11 (revaluation.js) и Палети (pallets.js).

   Бъг на живо (20.10.2026): SheetJS 0.18.5 хвърля „bad second format: .“ при
   aoa_to_sheet с dateNF 'dd.mm.yyyy' и Date клетка → „📄 VK11“ не правеше
   файл, Excel-ът на Палети гърмеше. Останалите тестове подменят window.XLSX
   и не могат да го видят. Поправката: dateNF 'dd"."mm"."yyyy'.

   Библиотеката: node_modules/xlsx/dist/xlsx.full.min.js — байт в байт
   файлът от cdnjs (…/xlsx/0.18.5/xlsx.full.min.js, сверено 20.10.2026).
   Зарежда се ВЪТРЕ в jsdom прозореца (w.eval), както браузърът зарежда
   CDN-а. НЕ window.XLSX = require('xlsx'): тогава Date от прозореца не е
   instanceof Date за Node-копието (друг realm), SheetJS го пише като низ и
   тестът минава и с бъга — проверено.

   Подменя се САМО XLSX.writeFile (изтеглянето); workbook-ът минава през
   истинските aoa_to_sheet / write / read, после клетките се форматират с
   XLSX.SSF.format — тоест каквото ще види Excel.

   Мутационна проверка (20.10.2026): dateNF обратно на 'dd.mm.yyyy' в
   revaluation.js → пада „VK11: без изключение“; в pallets.js → пада
   „Палети: файлът е направен“.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, dayOffset, realClick } = H;

const ROOT = path.resolve(process.argv[2] || '.');
const XLSX_SRC = fs.readFileSync(path.join(ROOT, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), 'utf8');

function realXlsx(h) {
  h.w.eval(XLSX_SRC);
  const X = h.w.XLSX;
  h.written = [];
  X.writeFile = (wb, name) => { h.written.push({ wb, name }); };
  return X;
}
/* Минава през истинския запис и четене — каквото ще отвори Excel. */
function roundTrip(X, wb) {
  const data = X.write(wb, { type: 'array', bookType: 'xlsx' });
  return X.read(data, { type: 'array', cellNF: true });
}
function fmt(X, cell) { return cell && cell.t === 'n' && cell.z ? X.SSF.format(cell.z, cell.v) : null; }

const CAMP = { id: 'c-1', title: 'Тест', kind: 'mandatory', starts_on: dayOffset(-2), ends_on: dayOffset(2), default_pct: 50, status: 'open' };
const SUB = { id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: 'submitted', no_items: false, submitted_at: new Date().toISOString(), default_pct: null };
const ITEM = { id: 'i-1', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sort_order: 1, sap_code: '14557', product_name: 'ЛАМПА',
  unit: 'бр.', qty: 2, std_price: 120, discount_pct: 50, proposed_price: 60, store_comment: 'стар модел', new_sap_code: '8014557', sale_price: 69.99, co_qty: 2 };
const ADMIN = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис' };

const pal = (store, date, v) => ({ id: store + '-' + date, store_name: store, report_date: date, euro_pallets: v[0], small_pallets: v[1],
  nonstandard_pallets: v[2], grate_pallets: v[3], bilka_pallets: v[4], sent_note: null, updated_by: null, created_by: 'x' });

(async function run() {

  section('1. VK11 с истинския SheetJS');
  {
    const h = boot({
      modules: ['admin.js', 'stock-returns.js', 'revaluation.js'],
      user: ADMIN,
      data: {
        revaluation_campaigns: [CAMP], revaluation_submissions: [SUB], revaluation_items: [ITEM], revaluation_codes: [],
        stores: [{ name: 'Кърджали' }], users: [], app_settings: []
      }
    });
    h.w.rvStoresOn = true;
    const X = realXlsx(h);
    ok('библиотеката е 0.18.5', X.version === '0.18.5', X.version);
    await h.w.loadRevaluation(); await ticks(5);
    await h.w.rvCoOpenStore('Кърджали'); await ticks(5);
    h.doc.getElementById('rv-vk-from').value = '2026-10-20';
    let err = null, ret;
    try { ret = h.w.rvVk11(); } catch (e) { err = e; }
    ok('VK11: без изключение', !err, err && String(err));
    ok('VK11: файлът е направен (VK11-8-2026-10-20.xlsx)', ret === true && h.written.length === 1 && h.written[0].name === 'VK11-8-2026-10-20.xlsx',
      h.written.map(x => x.name).join(','));
    if (h.written.length) {
      const wb = roundTrip(X, h.written[0].wb);
      const ws = wb.Sheets[wb.SheetNames[0]];
      ok('листът е „смяна на продажна цена “', wb.SheetNames[0] === 'смяна на продажна цена ');
      ok('ред: 8014557, БР, 69.99', ws.A2 && ws.A2.v === '8014557' && ws.B2.v === 'БР' && ws.C2.v === 69.99);
      ok('„Валидна от“ е число (Excel дата)', ws.D2 && ws.D2.t === 'n' && typeof ws.D2.v === 'number', JSON.stringify(ws.D2));
      ok('„Валидна от“ → „20.10.2026“ през SSF.format', fmt(X, ws.D2) === '20.10.2026', fmt(X, ws.D2));
      ok('„Валидна до“ → „31.12.9999“', fmt(X, ws.E2) === '31.12.9999', fmt(X, ws.E2));
    }
  }

  section('2. Палети — Excel с истинския SheetJS');
  {
    const h = boot({
      modules: ['pallets.js'],
      user: ADMIN,
      data: {
        users: ['Враца', 'Габрово'].map(s => ({ store_name: s })),
        transport_pallets: [pal('Враца', '2026-09-18', [20, 10, 8, 40, 9]), pal('Враца', '2026-09-11', [0, 2, 6, 40, 9]), pal('Габрово', '2026-09-05', [3, 0, 0, 0, 0])],
        app_settings: [{ key: 'pallets_drop_threshold', value: '10' }]
      }
    });
    const X = realXlsx(h);
    let err = null;
    const onErr = e => { err = e; };
    process.on('unhandledRejection', onErr);
    h.w.loadPallets(); await ticks(4);
    const b = h.doc.getElementById('pallets-export-btn');
    ok('бутонът „📊 Експорт Excel“ е там', !!b);
    try { realClick(h.w, b, 'Експорт'); } catch (e) { err = e; }
    await ticks(6);
    process.removeListener('unhandledRejection', onErr);
    ok('Палети: без изключение', !err, err && String(err));
    ok('Палети: файлът е направен', h.written.length === 1 && /^ТеМАХ_Палети_.*\.xlsx$/.test(h.written[0].name), h.written.map(x => x.name).join(','));
    ok('Палети: toast „✅ Excel изтеглен! (3 подавания, 2 обекта)“', h.calls.toast.indexOf('✅ Excel изтеглен! (3 подавания, 2 обекта)') >= 0, h.calls.toast.join(' | '));
    if (h.written.length) {
      const wb = roundTrip(X, h.written[0].wb);
      ok('два листа: Палети, Обобщение', wb.SheetNames.join(',') === 'Палети,Обобщение', wb.SheetNames.join(','));
      const dates = (name, head) => {
        const ws = wb.Sheets[name];
        const aoa = X.utils.sheet_to_json(ws, { header: 1, raw: true });
        const c = aoa[0].indexOf(head);
        const out = [];
        for (let r = 1; r < aoa.length; r++) {
          const cell = ws[X.utils.encode_cell({ r, c })];
          if (cell && cell.t === 'n') out.push(fmt(X, cell));
        }
        return { c, out };
      };
      const p = dates('Палети', 'Дата на подаване');
      ok('„Палети“: датите са Excel дати → дд.мм.гггг', p.c >= 0 && p.out.join(',') === '18.09.2026,11.09.2026,05.09.2026', p.out.join(','));
      const s = dates('Обобщение', 'Последно подаване');
      ok('„Обобщение“: последните дати → дд.мм.гггг', s.c >= 0 && s.out.length === 2 && s.out.every(x => /^\d{2}\.\d{2}\.\d{4}$/.test(x)) &&
        s.out.indexOf('18.09.2026') >= 0 && s.out.indexOf('05.09.2026') >= 0, s.out.join(','));
    }
  }

  report();
})();
