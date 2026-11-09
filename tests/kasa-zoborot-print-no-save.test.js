/* Каса → Равнение → „🖨 Разпечатай" (kasa.js printZoborot).

   До 09.11.2026 печатът викаше saveZoborot() и отпечатваше след фиксирани
   400 ms: всеки печат беше запис, а при потвърдено равнение излизаше червено
   „Потвърденото равнение не може да се редактира". Сега печатът НЕ записва и
   отпечатва числата от екрана — за чернова/върнато от полетата (вкл.
   незапазена промяна), за потвърдено — записаните. Без чакане.

   Мутанти (09.11.2026, всеки събаря теста):
   М1. върнат saveZoborot() в началото на printZoborot      → секции 2 и 3 падат (PATCH / червено).
   М2. печатът пак чете само zoborotData (без полетата)      → секция 2 пада (незапазената стойност).
   М3. полетата се четат и при потвърдено (без status-проверката) → секция 3 пада.

   Пускане:  node tests/kasa-zoborot-print-no-save.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, dayOffset, ticks } = H;

const STORE = 'Троян';
const USER = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: STORE };
const DAY = dayOffset(-1);
function zob(status) {
  return { id: 'z-1', store_name: STORE, date: DAY, status: status,
    cash_bgn: 100, cash_eur: 200, card_eur: 300, bank_eur: 0, voucheri: 5,
    pos_no_bank: 605, fu1_gross: 400, fu1_discount: 0, fu2_gross: 200, fu2_discount: 0, fu3_gross: 0, fu3_discount: 0,
    fu_total_net: 600, razlika: 5 };
}
function env(z) {
  const h = boot({ modules: ['kasa.js', 'kasa-docs.js', 'history.js'], user: USER,
    data: { kasa_reports: [], kasa_glavna: [], kasa_zoborot: z ? [z] : [], kasa_documents: [], stores: [] } });
  h.w.kasaSetDate(DAY);
  h.w.kasaReports = [];
  h.w.zoborotData = z ? JSON.parse(JSON.stringify(z)) : null;
  h.cap = { html: '', opens: 0 };
  h.w.open = () => { h.cap.opens++; return { document: { write(s) { h.cap.html += s; }, close() {} }, focus() {} }; };
  h.toasts = [];
  const prev = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: m, c: c }); return prev(m, c); };
  return h;
}
const writes = h => h.calls.patch.concat(h.calls.post).filter(c => c.table === 'kasa_zoborot');
function clickPrint(h) { realClick(h.w, btn(h.doc.getElementById('mod-kasa'), 'Разпечатай')); }

(async function run() {

  section('1. Зареждане');
  {
    const h = env(null);
    ok('zoborotFormValues съществува', typeof h.w.zoborotFormValues === 'function');
    h.close();
  }

  section('2. Чернова с незапазена промяна → печат на екрана, без запис, без чакане');
  {
    const h = env(zob('draft'));
    if (guard('renderZoborot() не хвърля', () => h.w.renderZoborot())) {
      const f = h.doc.getElementById('zf-cash_bgn');
      if (ok('полето „в брой BGN" е input', !!f && f.tagName === 'INPUT')) {
        f.value = '150';                  /* 150+200+300+5 = 655; ФУ 600 → разлика 55 */
        clickPrint(h);
        ok('печатът е отворен ВЕДНАГА (без 400 ms)', h.cap.opens === 1 && h.cap.html.length > 500, h.cap.opens);
        ok('носи незапазената стойност 150.00', h.cap.html.indexOf('>150.00<') >= 0);
        ok('POS оборот 655.00', h.cap.html.indexOf('655.00 EUR') >= 0);
        ok('разлика 55.00', h.cap.html.indexOf('55.00 EUR') >= 0);
        ok('статус „Чернова"', h.cap.html.indexOf('Статус: ✏️ Чернова') >= 0);
        await ticks(10);
        await new Promise(r => setTimeout(r, 500));
        ok('НЯМА PATCH/POST към kasa_zoborot', writes(h).length === 0, JSON.stringify(writes(h)));
        ok('НЯМА „запазено"', !h.toasts.some(t => t.m.indexOf('запазено') >= 0));
      }
    }
    h.close();
  }

  section('3. Потвърдено → записаните числа, без червена грешка, без запис');
  {
    const h = env(zob('confirmed'));
    if (guard('renderZoborot() не хвърля', () => h.w.renderZoborot())) {
      /* при потвърдено полетата не са input; слагаме един с друга стойност,
         за да е сигурно, че печатът НЕ чете от DOM-а */
      const fake = h.doc.createElement('input'); fake.id = 'zf-cash_bgn'; fake.value = '999';
      h.doc.body.appendChild(fake);
      clickPrint(h);
      ok('печатът е отворен', h.cap.opens === 1);
      ok('записаното 100.00, не 999', h.cap.html.indexOf('>100.00<') >= 0 && h.cap.html.indexOf('999') < 0);
      ok('статус „Потвърден"', h.cap.html.indexOf('Статус: ✅ Потвърден') >= 0);
      await ticks(10);
      await new Promise(r => setTimeout(r, 500));
      ok('НЯМА червен toast', !h.toasts.some(t => t.c === '#dc2626'), JSON.stringify(h.toasts));
      ok('НЯМА запис', writes(h).length === 0);
    }
    h.close();
  }

  section('4. Ново равнение (без запис в базата) → печат от полетата, без POST');
  {
    const h = env(null);
    if (guard('renderZoborot() не хвърля', () => h.w.renderZoborot())) {
      const f = h.doc.getElementById('zf-card_eur');
      if (ok('полето „карта" е input', !!f)) {
        f.value = '42.5';
        clickPrint(h);
        ok('печатът носи 42.50', h.cap.html.indexOf('>42.50<') >= 0);
        await ticks(10);
        ok('НЯМА POST', writes(h).length === 0);
      }
    }
    h.close();
  }

  report();
})();
