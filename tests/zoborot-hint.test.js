/* Каса → Равнение: подсказка под разликата (zoborotHint, kasa.js).

   При разлика ≠ 0 под сумата се показва откъде идва — въведените ФУ се
   сравняват с ПОС отчетите (kasa_reports) за същия обект и ден.
   Реален случай: Кърджали, 13.10.2026 — ФУ 1 „Общ оборот" беше въведен
   8135,55 (= в брой 8223,27 − сторно 87,72 от отчета на каса 2), а трябва
   9275,18 (total_turnover). ФУ 2 = 2610,60 е вярно. Разлика 1139,63.
   (В базата записът вече е поправен — тук са грешните стойности от деня.)

   Подсказката е САМО на екрана — не влиза в printZoborot(), История и имейли.

   Мутационна проверка (14.10.2026) — всеки вариант събаря теста:
     1. loadZoborot() без зареждане на kasa_reports (само kasa_zoborot)
        (секции 4, 4в и 5: няма GET към kasa_reports,
        текстът е „Няма ПОС отчети" вместо „ФУ 1") → exit 1, 5 ❌.
     2. Сравнение по cash_turnover вместо total_turnover в zoborotHint
        → exit 1, 5 ❌ (секции 2, 2б и 3б:
        при верни ФУ сочи ФУ 1 като грешно).
     3. Подсказката се показва и при raz === 0 (махнато raz!==0 в рендера
        и в zoborotLiveCalc) → exit 1, 2 ❌ (секции 4б и 5б — разлика 0 при
        разменени в брой/карти, когато подсказката има какво да каже).
     4. Правило d сравнява Σ cash_turnover (ПРЕДИ сторното) с „в брой"
        вместо Σ cash_turnover − Σ storna_total → exit 1, 4 ❌ (секции 2, 2б и 3б).
     5. Картите по Σ card_turnover вместо Σ (total_turnover − cash_turnover)
        → exit 1, 4 ❌ (секции 2, 2б и 3б).
     Чистият код: exit 0, 36 ✅.

   Пускане:
     node tests/zoborot-hint.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, fire, ok, guard, section, report, ticks } = H;

const DAY = '2026-10-13';
const STORE = 'Кърджали';

const USER = {
  email: 'kardzhali@temax.bg', display_name: 'Кърджали',
  role: 'manager', store_name: STORE
};

const REPORTS = [
  { id: 'r-1', store_name: STORE, date: DAY, pos_number: 1, kasa_number: 1,
    cashier_name: 'КРАСИМИРА ПАВЛОВА', total_turnover: '2610.60',
    cash_turnover: '1904.65', card_turnover: '705.88', storna_total: '12.48' },
  { id: 'r-2', store_name: STORE, date: DAY, pos_number: 2, kasa_number: 2,
    cashier_name: 'АЙЛЯ АЛИ', total_turnover: '9275.18',
    cash_turnover: '8223.27', card_turnover: '1051.91', storna_total: '87.72' }
];

/* Записът в kasa_zoborot така, както беше въведен на 13.10 — с грешното ФУ 1. */
const ZOB = {
  id: 'z-1', store_name: STORE, date: DAY, status: 'draft',
  cash_bgn: 0, cash_eur: 10027.72, card_eur: 1757.86, bank_eur: 0, voucheri: 0,
  fu1_gross: 8135.55, fu1_discount: 87.72,
  fu2_gross: 2610.60, fu2_discount: 12.48,
  fu3_gross: 0, fu3_discount: 0,
  pos_no_bank: 11785.58, fu_total_net: 10645.95, razlika: 1139.63
};

function vals(fu1g) {
  return {
    fu: [{ gross: fu1g, discount: 87.72 }, { gross: 2610.60, discount: 12.48 }, { gross: 0, discount: 0 }],
    cashEur: 10027.72, cashBgn: 0, card: 1757.86, voucheri: 0
  };
}

function env(zob, reps) {
  const h = boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: USER,
    data: { kasa_zoborot: [zob], kasa_reports: reps, kasa_glavna: [], stores: [] }
  });
  h.w.kasaSelectedDate = DAY;
  h.w.kasaReports = [];
  return h;
}

(async function run() {

  section('1. zoborotHint — Кърджали 13.10 (грешно ФУ 1)');
  {
    const { w } = env(ZOB, REPORTS);
    ok('zoborotHint е глобална функция', typeof w.zoborotHint === 'function');
    const t = w.zoborotHint(vals(8135.55), REPORTS);
    ok('сочи ФУ 1', t.indexOf('ФУ 1:') === 0, t);
    ok('сочи каса 2 с касиера', t.indexOf('каса 2 (АЙЛЯ АЛИ)') >= 0, t);
    ok('дава верния общ оборот 9275,18', t.indexOf('общ оборот 9275,18') >= 0, t);
    ok('показва въведеното 8135,55', t.indexOf('въведен общ оборот 8135,55') >= 0, t);
    ok('разбивка: в брой 8223,27 + карти 1051,91, сторно 87,72',
      t.indexOf('(в брой 8223,27 + карти 1051,91, сторно 87,72)') >= 0, t);
    ok('не сочи ФУ 2 (то е вярно)', t.indexOf('ФУ 2') < 0, t);
  }

  section('2. Кърджали 13.10 — верни ФУ и верни ПОС → празна подсказка');
  {
    const { w } = env(ZOB, REPORTS);
    const v = vals(9275.18);
    /* „В брой" е реалното въведено 10027,72 — СЛЕД сторното:
       Σ cash_turnover 10127,92 − Σ storna_total 100,20. Сравнение без
       сторното (мутант 4) дава текст тук.
       Картите — реално въведените 1757,86, виж секция 2б. */
    const t = w.zoborotHint(v, REPORTS);
    ok("връща ''", t === '', JSON.stringify(t));
  }

  section('2б. Кърджали 13.10 — реално въведените карти (1757,86)');
  {
    const { w } = env(ZOB, REPORTS);
    /* Отчетът на каса 1: total 2610,60, в брой 1904,65, card_turnover
       705,88 — 0,07 липсват в card_turnover. Картите се смятат като
       Σ (total_turnover − cash_turnover) = 705,95 + 1051,91 = 1757,86 =
       въведеното. Сравнение по Σ card_turnover (1757,79 — мутант 5) дава
       текст тук. */
    const t = w.zoborotHint(vals(9275.18), REPORTS);
    ok("реалните 1757,86 → ''", t === '', JSON.stringify(t));
    const v = vals(9275.18); v.card = 705.88 + 1051.91;
    const t2 = w.zoborotHint(v, REPORTS);
    ok('карти 1757,79 → текст с „карти 1757,86"', t2 ===
      'ФУ съвпадат с отчетите; разликата е в ПОС данните: по отчети в брой 10027,72 (след сторно), карти 1757,86.', t2);
  }

  section('3. Без отчети за деня');
  {
    const { w } = env(ZOB, []);
    ok('текст за липсващи отчети',
      w.zoborotHint(vals(8135.55), []) === 'Няма ПОС отчети за деня — няма с какво да се сравни.');
  }

  section('3б. Правила c и d');
  {
    const { w } = env(ZOB, REPORTS);
    const v = vals(9275.18); v.fu[1].gross = 0;
    const c = w.zoborotHint(v, REPORTS);
    ok('c: невъведен отчет на каса 1', c ===
      'ПОС отчетът на каса 1 (КРАСИМИРА ПАВЛОВА, общ оборот 2610,60) не е въведен в нито едно ФУ.', c);
    const v2 = vals(9275.18); v2.cashEur = 10000;
    const d = w.zoborotHint(v2, REPORTS);
    ok('d: ФУ съвпадат, разликата е в брой', d ===
      'ФУ съвпадат с отчетите; разликата е в ПОС данните: по отчети в брой 10027,72 (след сторно), карти 1757,86.', d);
  }

  section('4. renderZoborot през loadZoborot — подсказката е на екрана');
  {
    const { w, doc, calls } = env(ZOB, REPORTS);
    guard('loadZoborot() не хвърля', () => w.loadZoborot());
    await ticks();
    ok('loadZoborot тегли kasa_reports за деня',
      calls.get.some(u => u.indexOf('kasa_reports') >= 0 && u.indexOf('date=eq.' + DAY) >= 0), calls.get.join(' | '));
    const hEl = doc.getElementById('zf-r-hint');
    ok('zf-r-hint съществува', !!hEl);
    ok("съдържа 'ФУ 1'", !!hEl && hEl.textContent.indexOf('ФУ 1') >= 0, hEl && hEl.textContent);
    ok('стои под сумата (zf-r-raz)', !!hEl && hEl.previousElementSibling &&
      hEl.previousElementSibling.id === 'zf-r-raz');
    ok('kasaReports съдържа отчетите за деня', w.kasaReports.filter(r => r.date === DAY).length === 2);
  }

  section('4б. Разлика 0 → няма zf-r-hint');
  {
    const zob0 = Object.assign({}, ZOB, { fu1_gross: 9275.18, fu_total_net: 11785.58, razlika: 0 });
    const { w, doc } = env(zob0, REPORTS);
    w.loadZoborot();
    await ticks();
    ok('zf-r-raz показва 0.00', (doc.getElementById('zf-r-raz') || {}).textContent === '0.00 EUR');
    ok('zf-r-hint липсва', !doc.getElementById('zf-r-hint'));

    /* Разлика 0, но подсказката ИМА какво да каже: в брой и карти разменени
       със същата обща сума (10000 + 1785,58 = 11785,58) — правило d дава
       текст. Без това мутант 3 оцелява: при верните данни подсказката е ''
       и няма какво да се покаже. */
    const zobSwap = Object.assign({}, zob0, { cash_eur: 10000, card_eur: 1785.58 });
    const h2 = env(zobSwap, REPORTS);
    ok('предпоставка: подсказката би дала текст', h2.w.zoborotHint({
      fu: [{ gross: 9275.18, discount: 87.72 }, { gross: 2610.60, discount: 12.48 }, { gross: 0, discount: 0 }],
      cashEur: 10000, cashBgn: 0, card: 1785.58, voucheri: 0 }, REPORTS) !== '');
    h2.w.loadZoborot();
    await ticks();
    ok('разлика 0 при разменени в брой/карти', (h2.doc.getElementById('zf-r-raz') || {}).textContent === '0.00 EUR');
    ok('zf-r-hint липсва и тогава', !h2.doc.getElementById('zf-r-hint'));
  }

  section('4в. Грешка при отчетите → рендер без подсказка');
  {
    const h = boot({
      modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
      user: USER,
      data: { kasa_zoborot: [ZOB], kasa_reports: REPORTS, stores: [] },
      fail: { GET: /kasa_reports/ }
    });
    h.w.kasaSelectedDate = DAY;
    h.w.kasaReports = [];
    h.w.loadZoborot();
    await ticks();
    ok('Равнението се рендира', !!h.doc.getElementById('zf-r-raz'));
    ok('без подсказка', !h.doc.getElementById('zf-r-hint'));
  }

  section('5. Реално въвеждане в ФУ 1 → подсказката изчезва');
  {
    const { w, doc } = env(ZOB, REPORTS);
    w.loadZoborot();
    await ticks();
    const inp = doc.getElementById('zf-fu1_gross');
    if (ok('полето zf-fu1_gross съществува', !!inp)) {
      ok('преди въвеждането подсказката е там', !!doc.getElementById('zf-r-hint'));
      inp.value = '9275.18';
      fire(w, inp, 'input');
      ok('zf-r-hint изчезва', !doc.getElementById('zf-r-hint'));
      ok('zf-r-raz показва 0.00', doc.getElementById('zf-r-raz').textContent === '0.00 EUR',
        doc.getElementById('zf-r-raz').textContent);
      /* и обратно — грешна стойност я връща, без презареждане */
      inp.value = '8135.55';
      fire(w, inp, 'input');
      const back = doc.getElementById('zf-r-hint');
      ok('при нова разлика подсказката се връща', !!back && back.textContent.indexOf('ФУ 1') >= 0);
    }
  }

  section('5б. Въвеждане до разлика 0, когато подсказката има какво да каже');
  {
    /* Същото като 5, но в брой/карти са разменени (обща сума същата): при
       ФУ 1 = 9275,18 разликата е 0, а правило d би дало текст. Подсказката
       трябва да изчезне заради разликата 0, не защото текстът е празен. */
    const { w, doc } = env(Object.assign({}, ZOB, { cash_eur: 10000, card_eur: 1785.58 }), REPORTS);
    w.loadZoborot();
    await ticks();
    const inp = doc.getElementById('zf-fu1_gross');
    if (ok('полето zf-fu1_gross съществува', !!inp)) {
      ok('преди въвеждането подсказката е там', !!doc.getElementById('zf-r-hint'));
      inp.value = '9275.18';
      fire(w, inp, 'input');
      ok('zf-r-raz показва 0.00', doc.getElementById('zf-r-raz').textContent === '0.00 EUR',
        doc.getElementById('zf-r-raz').textContent);
      ok('zf-r-hint изчезва при разлика 0', !doc.getElementById('zf-r-hint'));
    }
  }

  section('6. Печатът не носи подсказката');
  {
    const { w } = env(ZOB, REPORTS);
    w.loadZoborot();
    await ticks();
    const src = String(w.printZoborot);
    ok('printZoborot не вика zoborotHint', src.indexOf('zoborotHint') < 0 && src.indexOf('zf-r-hint') < 0);
  }

  report();
})();
