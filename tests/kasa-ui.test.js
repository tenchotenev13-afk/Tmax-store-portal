/* Каса — визуално: таблици и решетки на екраните.

   Комит А (само markup/CSS в екраните): таблиците са в „tbl-wrap tbl-compact
   tbl-auto" (като История), таблиците във формите и в Равнение — в
   overflow-x:auto, решетките с фиксиран брой колони са свиващи се
   (repeat(auto-fit,minmax(min(100%,Npx),1fr))). Печатните функции
   (_doPrintKasaReport, printZoborot) НЕ се пипат: изходът им е байт по байт
   същият като преди — еталонът в kasa-ui.expected.json е снет с --dump от
   версията ПРЕДИ промяната (f018d99) на същата фикстура.

   Пускане:  node tests/kasa-ui.test.js .
   Еталон от друга версия:  node tests/kasa-ui.test.js <корен> --dump */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset } = H;
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const DUMP = process.argv.indexOf('--dump') >= 0;
const clone = x => JSON.parse(JSON.stringify(x));
const delay = ms => new Promise(r => setTimeout(r, ms));

const USER = { email: 'm@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян', assigned_stores: [] };
const TODAY = dayOffset(0), OLD = dayOffset(-3);

function pos(id, date, n, over) {
  return Object.assign({ id, store_name: 'Троян', date, pos_number: n, kasa_number: n, cashier_name: 'Касиер ' + n, status: 'confirmed',
    total_turnover: 1200.5, cash_turnover: 800.25, card_turnover: 400.25, counted_cash: 790, razlika: -10.25, bills_50: 4, bills_20: 5, coins_50: 3,
    inkaso_50: 1, created_at: date + 'T10:00:00Z' }, over || {});
}
const REPORTS = [pos('p1', TODAY, 1), pos('p2', TODAY, 2, { status: 'draft' }), pos('p3', OLD, 1), pos('p4', OLD, 2, { status: 'returned' })];
const GLAVNA = { id: 'g1', store_name: 'Троян', date: TODAY, status: 'draft', bills_100: 2, bills_10: 7, coins_100: 0, slujebno: 5, sap_balance: 300 };
const ZOB = { id: 'z1', store_name: 'Троян', date: TODAY, status: 'confirmed', cash_bgn: 100, cash_eur: 200, card_eur: 300, voucheri: 5,
  pos_no_bank: 605, fu1_gross: 400, fu1_discount: 0, fu2_gross: 200, fu2_discount: 0, fu3_gross: 0, fu3_discount: 0, fu_total_net: 600, razlika: 5 };
const STORNO = [{ id: 's1', store_name: 'Троян', storno_date: TODAY, bon_date: TODAY, returned_sum: 50, new_sum: 40, articles: '123456 ТЕСТ', status: 'open',
  created_at: TODAY + 'T09:00:00Z' }];
const DOCS = [{ id: 'd1', store_name: 'Троян', date: TODAY, file_name: 'бележка.pdf', path: 'x/y.pdf', doc_type: 'other', created_at: TODAY + 'T11:00:00Z' }];

function env(over) {
  const h = boot({ modules: ['kasa.js', 'kasa-docs.js'], user: USER, data: {}, ...(over || {}) });
  const w = h.w;
  w.kasaReports = clone(REPORTS); w.kasaGlavna = clone(GLAVNA); w.zoborotData = clone(ZOB); w.kasaStorno = clone(STORNO);
  w.kasaSelectedDate = null;
  freeze(w, TODAY); /* печатът пише „Изготвен: <час>“ — часовникът е замразен */
  return h;
}
const mod = h => h.doc.getElementById('mod-kasa');
/* прехваща window.open + document.write на печатните функции */
function capture(w) {
  const out = { html: '' };
  w.open = function () { return { document: { write(s) { out.html += s; }, close() {} }, focus() {} }; };
  return out;
}
function freeze(w, iso) {
  const Real = w.Date, ms = new Real(iso + 'T12:00:00').getTime();
  w.Date = class extends Real { constructor(...a) { if (!a.length) super(ms); else super(...a); } static now() { return ms; } };
}
async function printReport(h) {
  const cap = capture(h.w);
  h.w._doPrintKasaReport(TODAY, clone(REPORTS).filter(r => r.date === TODAY), clone(GLAVNA), clone(GLAVNA), clone(DOCS));
  return cap.html;
}
async function printZob(h, z) {
  const cap = capture(h.w);
  h.w.saveZoborot = function () {};
  h.w.zoborotData = z;
  h.w.printZoborot();
  await delay(700);
  return cap.html;
}
const ZOB_B = Object.assign(clone(ZOB), { status: 'returned' });

async function snapshot() {
  const h = env();
  const a = await printReport(h);
  const b = await printZob(h, clone(ZOB));
  /* случаят на комит Б: работна дата ≠ днес, върнат запис */
  const h2 = env();
  h2.w.kasaSelectedDate = OLD;
  const c = await printZob(h2, clone(ZOB_B));
  return { report: a, zoborot: b, zoborot_other_day_returned: c };
}

(async function run() {
  if (DUMP) { console.log(JSON.stringify(await snapshot())); process.exit(0); }
  const EXPECTED = JSON.parse(fs.readFileSync(path.join(__dirname, 'kasa-ui.expected.json'), 'utf8'));
  const src = fs.readFileSync(path.join(ROOT, 'kasa.js'), 'utf8');

  section('1. Таблиците на екраните са „tbl-wrap tbl-compact tbl-auto“');
  for (const [name, fn, n] of [['ПОС (днешни + история)', 'renderKasa', 2], ['Главна каса', 'renderGlavna', 2], ['Сторно бележки', 'renderStorno', 1]]) {
    const h = env();
    if (guard(name + ': рендер', () => h.w[fn]())) {
      const wr = mod(h).querySelectorAll('.tbl-wrap');
      ok(name + ': ' + n + ' таблици в обвивки', wr.length === n, 'обвивки: ' + wr.length);
      ok(name + ': всяка е tbl-compact tbl-auto', Array.from(wr).every(x => x.classList.contains('tbl-compact') && x.classList.contains('tbl-auto') && !!x.querySelector('table')),
        Array.from(wr).map(x => x.className).join(' | '));
    }
    h.close();
  }
  {
    const h = env();
    h.w.kasaReports = clone(REPORTS).filter(r => r.date === OLD);
    guard('История (renderHistTable)', () => h.w.renderKasa());
    ok('История на ПОС отчетите: tbl-compact tbl-auto', !!mod(h).querySelector('.tbl-wrap.tbl-compact.tbl-auto'));
    h.close();
  }

  section('2. Таблиците във формата и в Равнение са в overflow-x:auto');
  {
    const h = env();
    guard('ПОС форма', () => h.w.openKasaForm(null));
    const t = Array.from(mod(h).querySelectorAll('table')).filter(x => x.parentElement.tagName === 'DIV' && /overflow-x:auto/.test(x.parentElement.getAttribute('style') || ''));
    ok('ПОС форма: 2 таблици (купюри, инкасо) в overflow-x:auto', t.length === 2, String(t.length));
    h.close();
    const z = env();
    guard('Равнение', () => z.w.renderZoborot());
    const tz = Array.from(mod(z).querySelectorAll('table')).filter(x => /overflow-x:auto/.test(x.parentElement.getAttribute('style') || ''));
    ok('Равнение: 2 таблици (ПОС данни, ФУ) в overflow-x:auto', tz.length === 2, String(tz.length));
    z.close();
  }

  section('3. Няма решетки с фиксиран брой колони в екраните');
  {
    const fixed = /grid-template-columns:\s*(?:\d+(?:\.\d+)?fr(?:\s|;)|repeat\(\s*\d+\s*,)/;
    const printA = src.indexOf('function _doPrintKasaReport'), printAend = src.indexOf('function unlockKasaReport');
    const printB = src.indexOf('function printZoborot'), printBend = src.indexOf('function stornoIsExempt');
    ok('границите на печатните функции са намерени', printA > 0 && printAend > printA && printB > printAend && printBend > printB);
    const screens = src.slice(0, printA) + src.slice(printAend, printB) + src.slice(printBend);
    ok('екраните: нула „grid-template-columns“ с фиксиран брой колони', !fixed.test(screens),
      (screens.match(new RegExp(fixed.source, 'g')) || []).join(' | '));
    ok('печатните функции пазят своите .grid2/.grid3 (хартия)', fixed.test(src.slice(printA, printAend)) && fixed.test(src.slice(printB, printBend)));
    /* auto-fill е само при плочките на ПОС формата: там 5 плочки стоят в 6 колони и празната шеста трябва да се запази (като преди) */
    const dyn = (screens.match(/repeat\(auto-(?:fit|fill),minmax\(min\(100%,\d+px\),1fr\)\)/g) || []).length;
    ok('шестте решетки са свиващи се (auto-fit/auto-fill + min(100%,Npx))', dyn === 6, String(dyn));
    for (const [name, fn] of [['ПОС', 'renderKasa'], ['Главна каса', 'renderGlavna'], ['Равнение', 'renderZoborot'], ['Сторно', 'renderStorno']]) {
      const h = env(); h.w[fn]();
      ok(name + ': в рендера няма фиксирана решетка', !fixed.test(mod(h).innerHTML));
      h.close();
    }
    const h = env(); h.w.openKasaForm(null);
    ok('ПОС форма: в рендера няма фиксирана решетка', !fixed.test(mod(h).innerHTML));
    h.close();
  }

  section('4. Печатът е байт по байт същият като преди (еталон от f018d99)');
  {
    const h = env();
    const a = await printReport(h);
    ok('Печат на ПОС отчети: непроменен (' + a.length + ' знака)', a === EXPECTED.report && a.length > 1000);
    const b = await printZob(h, clone(ZOB));
    ok('Печат на Равнение (работна дата = днес): непроменен (' + b.length + ' знака)', b === EXPECTED.zoborot && b.length > 500);
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
