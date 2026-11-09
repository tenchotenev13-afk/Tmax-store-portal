/* История → Excel износ, блок „ГЛАВНА КАСА": „Разлика" се смята като на
   екрана, не се чете записаната kasa_glavna.razlika (history.js +
   glavnaRazlikaFrom в kasa.js).

   Записаната разлика остарява, ако ПОС отчет се поправи СЛЕД записа на
   Главна каса (типично след „↩ Върнат"). Екранът, печатът и дневният преглед
   смятат наново — Excel до 09.11.2026 показваше записаното число.
   Формулата: купюрите на ПОС отчетите за обекта и датата + колона „Главна"
   + служебно − SAP. ПОС отчетите идват с отделна заявка (не histData.kasa).

   Сценарий (записаните razlika нарочно са грешни):
     Шумен 01.10: ПОС 100.00 + 0.30, Главна 10, служебно 5, SAP 100 → 15.30
     Шумен 02.10: без ПОС отчети (граничен), Главна 20, SAP 19.50 → 0.50
     Карлово 01.10: ПОС 500 — НЕ бива да влиза в Шумен.

   Мутанти (09.11.2026, всеки събаря теста):
   М1. колоната пак чете parseFloat(g.razlika)              → секция 2 пада.
   М2. филтърът без r.date===g.date (само обект)             → секция 2 пада (02.10).
   М3. филтърът без r.store_name===g.store_name (само дата)  → секция 2 пада (Карлово).

   Пускане:  node tests/kasa-glavna-excel-razlika.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис' };

function pos(id, store, date, den) {
  return Object.assign({ id: id, store_name: store, date: date, pos_number: '1', kasa_number: '1', cashier_name: 'К',
    total_turnover: 0, cash_turnover: 0, card_turnover: 0, storna_total: 0, counted_cash: 0, razlika: 0,
    status: 'confirmed', created_at: date + 'T18:00:00Z' }, den);
}
const REPS = [
  pos('r-1', 'Шумен', '2026-10-01', { bills_50: 2 }),
  pos('r-2', 'Шумен', '2026-10-01', { coins_10: 3 }),
  pos('r-3', 'Карлово', '2026-10-01', { bills_500: 1 })
];
const GLS = [
  { id: 'g-1', store_name: 'Шумен', date: '2026-10-01', status: 'confirmed', bills_10: 1, counted_cash: 10, slujebno: 5, sap_balance: 100, razlika: -999 },
  { id: 'g-2', store_name: 'Шумен', date: '2026-10-02', status: 'draft', bills_20: 1, counted_cash: 20, slujebno: 0, sap_balance: 19.5, razlika: -1 }
];

function env(tables) {
  const data = { transport_orders: [], client_orders: [], stores: [], kasa_storno: [], kasa_storno_items: [],
    kasa_zoborot: [], kasa_documents: [] };
  Object.keys(tables).forEach(t => { data[t] = tables[t]; });
  const h = boot({ modules: ['kasa.js', 'kasa-docs.js', 'history.js'], user: ADMIN, data: data });
  h.cap = { sheets: {}, files: [] };
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: aoa => ({ __aoa: aoa }),
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); wb.Sheets[n] = ws; h.cap.sheets[n] = ws.__aoa; }
    },
    writeFile: (wb, f) => { h.cap.files.push(f); }
  };
  return h;
}
async function searchAndExport(h) {
  h.w.renderHistoryShell();
  h.doc.getElementById('h-from').value = '2026-10-01';
  h.doc.getElementById('h-to').value = '2026-10-31';
  h.doc.getElementById('h-type').value = 'kasa';
  realClick(h.w, btn(h.doc.getElementById('mod-history'), 'Търси →'), 'Търси →');
  await ticks(8);
  const b = btn(h.doc.getElementById('h-results'), 'Експорт Excel');
  if (!ok('бутонът „Експорт Excel" е на екрана', !!b)) return;
  realClick(h.w, b, 'Експорт Excel');
  await ticks(10);
}
/* Редовете на блока „ГЛАВНА КАСА" в листа на обекта → { дата: Разлика } */
function glavnaRaz(aoa) {
  const i = aoa.findIndex(r => r && r[0] === 'ГЛАВНА КАСА');
  if (i < 0) return null;
  const hdr = aoa[i + 1], col = hdr.indexOf('Разлика'), out = {};
  for (let k = i + 2; k < aoa.length && aoa[k] && aoa[k].length > 1; k++) out[aoa[k][0]] = aoa[k][col];
  return out;
}

(async function run() {

  section('1. Зареждане');
  {
    const h = env({ kasa_reports: REPS, kasa_glavna: GLS });
    ok('glavnaRazlikaFrom и GL_DENOM_COLS съществуват', typeof h.w.glavnaRazlikaFrom === 'function' && /bills_500/.test(h.w.GL_DENOM_COLS));
    h.close();
  }

  section('2. Excel: „Разлика" на Главна каса = формулата на екрана');
  {
    const h = env({ kasa_reports: REPS, kasa_glavna: GLS });
    await searchAndExport(h);
    ok('файлът е създаден', h.cap.files.length === 1, JSON.stringify(h.calls.toast));
    const sh = Object.keys(h.cap.sheets).find(n => n.indexOf('Шумен') >= 0);
    if (ok('лист за Шумен', !!sh, Object.keys(h.cap.sheets).join(','))) {
      const r = glavnaRaz(h.cap.sheets[sh]) || {};
      ok('01.10: 15.30 (ПОС 100.30 + Главна 10 + 5 − 100), не записаното −999', r['2026-10-01'] === 15.3, r['2026-10-01']);
      ok('02.10 без ПОС: 0.50 (само Главна 20 − 19.50), не записаното −1', r['2026-10-02'] === 0.5, r['2026-10-02']);
      const hdr = h.cap.sheets[sh][h.cap.sheets[sh].findIndex(x => x && x[0] === 'ГЛАВНА КАСА') + 1];
      ok('колоната „Главна налични" е counted_cash (10)', (h.cap.sheets[sh].find(x => x && x[0] === '2026-10-01' && x.length === hdr.length) || [])[hdr.indexOf('Главна налични')] === 10);
    }
    const g = h.calls.get.filter(u => u.indexOf('/kasa_reports?') >= 0 && decodeURIComponent(u).indexOf('select=id,store_name,date,') >= 0);
    ok('отделна заявка към kasa_reports с купюрите', g.length >= 1 && /bills_500/.test(decodeURIComponent(g[0])), g[0]);
    ok('и с order по id', g.length >= 1 && decodeURIComponent(g[0]).indexOf('id.desc') >= 0);
    h.close();
  }

  section('3. Провал на заявката за ПОС → файл НЯМА, червен toast');
  {
    /* sbGetAll маркира .partial при провалена страница — падаме само
       заявката с купюрите (select=id,store_name,date,…). */
    const h2 = boot({ modules: ['kasa.js', 'kasa-docs.js', 'history.js'], user: ADMIN,
      data: { transport_orders: [], client_orders: [], stores: [], kasa_storno: [], kasa_storno_items: [], kasa_zoborot: [], kasa_documents: [], kasa_reports: REPS, kasa_glavna: GLS },
      fail: { GET: u => decodeURIComponent(u).indexOf('select=id,store_name,date,') >= 0 ? { status: 500, body: { message: 'boom' } } : null } });
    h2.cap = { files: [] };
    h2.w.XLSX = { utils: { book_new: () => ({ SheetNames: [], Sheets: {} }), aoa_to_sheet: a => ({}), book_append_sheet: () => {} }, writeFile: (wb, f) => h2.cap.files.push(f) };
    h2.w.renderHistoryShell();
    h2.doc.getElementById('h-from').value = '2026-10-01';
    h2.doc.getElementById('h-to').value = '2026-10-31';
    h2.doc.getElementById('h-type').value = 'kasa';
    realClick(h2.w, btn(h2.doc.getElementById('mod-history'), 'Търси →'), 'Търси →');
    await ticks(8);
    realClick(h2.w, btn(h2.doc.getElementById('h-results'), 'Експорт Excel'), 'Експорт Excel');
    await ticks(10);
    ok('файл НЯМА', h2.cap.files.length === 0);
    ok('toast „Непълни данни … ПОС за главна каса"', h2.calls.toast.some(t => t.indexOf('ПОС за главна каса') >= 0), h2.calls.toast.join(' | '));
    h2.close();
  }

  report();
})();
