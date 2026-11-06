/* Каса → Главна каса: записаната разлика = разликата на екрана (kasa.js).

   Екранът (renderGlavna / glavnaLiveCalc) смята РАЗЛИКА = общо налични
   (купюрите на ВСИЧКИ ПОС отчети за работния ден + колона „Главна")
   + служебно въведени − наличност SAP. saveGlavna() до 06.11.2026 записваше
   razlika само от колона „Главна" — Карлово, 05.11.2026: екран 0,10 EUR,
   в kasa_glavna −3836,05. counted_cash остава САМО „Главна" (така го четат
   печатът и дневният преглед като „Главна налични").

   Сценарият: ПОС отчети за деня + отчет за ДРУГ ден (не бива да влиза) →
   истински клик по „💾 Запази" → тялото на PATCH/POST носи razlika, равна
   на числото в #gl-r-razlika. Граничен случай: ден без ПОС отчети.

   Мутанти (06.11.2026, всеки събаря теста):
   М1. p.razlika = counted_cash + slujebno − sap (старата формула)
       → секции 2, 3, 4 падат (−3820.35 срещу 0.10).
   М2. glavnaAllCounted() без колона „Главна" (q=0 вместо g[...])
       → секции 2, 3, 5 падат.
   М3. glavnaAllCounted() без филтъра по дата (всички kasaReports)
       → секции 2, 4 падат (отчетът от друг ден добавя 2500).

   Пускане:
     node tests/kasa-glavna-razlika.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, fire, ok, guard, section, report, dayOffset, ticks } = H;

const STORE = 'Карлово';
const USER = { email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: STORE };
const DAY = dayOffset(-1);
const OTHER = dayOffset(-2);

function pos(id, n, date, denoms) {
  return Object.assign({
    id: id, store_name: STORE, date: date, pos_number: n, kasa_number: n,
    cashier_name: 'Касиер ' + n, status: 'confirmed',
    total_turnover: 0, cash_turnover: 0, card_turnover: 0, storna_total: 0,
    counted_cash: 0, razlika: 0
  }, denoms);
}
/* ПОС 1: 2000.30 · ПОС 2: 1820.15 · отчет от ДРУГ ден: 2500 */
const REPS = [
  pos('r-1', 1, DAY, { bills_50: 40, coins_10: 3 }),
  pos('r-2', 2, DAY, { bills_100: 18, bills_20: 1, coins_5: 3 }),
  pos('r-9', 1, OTHER, { bills_500: 5 })
];
/* Главна: 2 × 10 = 20.00 → общо 3840.45; SAP 3840.35 → разлика 0.10 */
function glavna(extra) {
  return Object.assign({
    id: 'g-1', store_name: STORE, date: DAY, status: 'draft',
    bills_10: 2, counted_cash: 20, slujebno: 0, sap_balance: 3840.35, razlika: -3820.35
  }, extra || {});
}

function env(reps, gl) {
  const h = boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: USER,
    data: { kasa_reports: reps, kasa_glavna: gl ? [gl] : [], kasa_zoborot: [], kasa_documents: [], stores: [] }
  });
  h.w.kasaSetDate(DAY);
  h.w.kasaReports = JSON.parse(JSON.stringify(reps));
  h.w.kasaGlavna = gl ? JSON.parse(JSON.stringify(gl)) : null;
  h.w.kasaView = 'glavna';
  return h;
}

/* „– 3820.35 EUR" → -3820.35 */
function screenRaz(doc) {
  const el = doc.getElementById('gl-r-razlika');
  if (!el) return NaN;
  const t = el.textContent.replace('EUR', '').trim();
  return t.indexOf('–') === 0 ? -parseFloat(t.slice(1)) : parseFloat(t);
}
function writeBody(calls) {
  const all = (calls.patch || []).concat(calls.post || []).filter(c => c.table === 'kasa_glavna');
  return all.length ? all[all.length - 1].body : null;
}

(async function run() {

  section('1. kasa.js се зарежда с glavnaAllCounted');
  {
    const h = env(REPS, glavna());
    ok('glavnaAllCounted съществува', typeof h.w.glavnaAllCounted === 'function');
    h.close();
  }

  section('2. Съществуваща Главна каса: PATCH носи разликата от екрана');
  {
    const h = env(REPS, glavna());
    const { w, doc, calls } = h;
    if (guard('renderGlavna() не хвърля', () => w.renderGlavna())) {
      const shown = screenRaz(doc);
      ok('на екрана разликата е 0.10', shown === 0.1, shown);
      const b = btn(doc.getElementById('mod-kasa'), 'Запази');
      if (ok('бутон „Запази" има', !!b)) {
        realClick(w, b);
        await ticks(6);
        const body = writeBody(calls);
        if (ok('има запис към kasa_glavna', !!body)) {
          ok('PATCH (има id), не POST', calls.patch.some(c => c.table === 'kasa_glavna'));
          ok('razlika = екрана (0.10)', body.razlika === shown, body.razlika);
          ok('counted_cash = САМО колона „Главна" (20)', body.counted_cash === 20, body.counted_cash);
          ok('sap_balance = 3840.35', body.sap_balance === 3840.35, body.sap_balance);
        }
      }
    }
    h.close();
  }

  section('3. Редакция на полетата → разликата следва живия екран');
  {
    const h = env(REPS, glavna());
    const { w, doc, calls } = h;
    if (guard('renderGlavna() не хвърля', () => w.renderGlavna())) {
      const b10 = doc.getElementById('gl-bills_10');
      const sl = doc.getElementById('gl-slujebno');
      b10.value = '5'; fire(w, b10, 'input');          /* Главна: 50.00 → общо 3870.45 */
      sl.value = '1.25'; fire(w, sl, 'input');
      const shown = screenRaz(doc);                      /* 3870.45 + 1.25 − 3840.35 = 31.35 */
      ok('живият екран показва 31.35', shown === 31.35, shown);
      realClick(w, btn(doc.getElementById('mod-kasa'), 'Запази'));
      await ticks(6);
      const body = writeBody(calls);
      if (ok('има запис', !!body)) {
        ok('razlika = живия екран (31.35)', body.razlika === shown, body.razlika);
        ok('counted_cash = 50 (само Главна)', body.counted_cash === 50, body.counted_cash);
      }
    }
    h.close();
  }

  section('4. Нова Главна каса (без id): POST носи разликата от екрана');
  {
    const h = env(REPS, null);
    const { w, doc, calls } = h;
    if (guard('renderGlavna() не хвърля', () => w.renderGlavna())) {
      doc.getElementById('gl-sap').value = '3820.45';
      fire(w, doc.getElementById('gl-sap'), 'input');
      const shown = screenRaz(doc);                      /* 3820.45 − 3820.45 = 0 */
      ok('екранът показва 0.00', shown === 0, shown);
      realClick(w, btn(doc.getElementById('mod-kasa'), 'Запази'));
      await ticks(6);
      const body = writeBody(calls);
      if (ok('има POST', calls.post.some(c => c.table === 'kasa_glavna') && !!body)) {
        ok('razlika = 0 (като екрана)', body.razlika === shown, body.razlika);
        ok('counted_cash = 0 (празна колона „Главна")', body.counted_cash === 0, body.counted_cash);
      }
    }
    h.close();
  }

  section('5. Граничен: ден БЕЗ ПОС отчети → разлика само от Главна');
  {
    const onlyOther = [REPS[2]];
    const h = env(onlyOther, glavna({ sap_balance: 19.9 }));
    const { w, doc, calls } = h;
    if (guard('renderGlavna() не хвърля', () => w.renderGlavna())) {
      const shown = screenRaz(doc);                      /* 20 − 19.9 = 0.10 */
      ok('екранът показва 0.10', shown === 0.1, shown);
      realClick(w, btn(doc.getElementById('mod-kasa'), 'Запази'));
      await ticks(6);
      const body = writeBody(calls);
      if (ok('има запис', !!body)) {
        ok('razlika = екрана', body.razlika === shown, body.razlika);
        ok('counted_cash = razlika + sap (нищо от ПОС)', body.counted_cash === 20, body.counted_cash);
      }
    }
    h.close();
  }

  report();
})();
