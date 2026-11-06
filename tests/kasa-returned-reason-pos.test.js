/* Каса → „📋 ПОС Отчети": причината за връщане се вижда (kasa.js).

   Досега под-табът показваше само бадж „↩ Върнат" и червено „✏️ Редактирай"
   — причината, кой и кога бяха само в Главна каса и Равнение
   (kasaReturnedBanner). Сега:
   - над картата „ПОС отчети — дд.мм.гггг" стои СЪЩАТА червена лента
     (#kasa-pos-returned, от kasaReturnedBanner), ако в работния ден има
     върнат ПОС отчет;
   - в Историята баджът „↩ Върнат" носи причината, кой и кога в title.

   Мутанти (06.11.2026, всеки събаря теста):
   М1. `if(retRep)` → `if(false)` (лентата я няма)       → секция 2 пада.
   М2. филтърът по 'draft' вместо 'returned'               → секции 2 и 3 падат.
   М3. title махнат от баджа в renderHistTable              → секция 4 пада.

   Пускане:
     node tests/kasa-returned-reason-pos.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset } = H;

const STORE = 'Троян';
const USER = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: STORE };
const DAY = dayOffset(-1);
const RET = { return_reason: 'Липсва снимка на Z-отчета', returned_by: 'Счетоводство Цвети', returned_at: '2026-11-05T09:15:00.000Z' };

function rep(id, n, date, status, extra) {
  return Object.assign({
    id: id, store_name: STORE, date: date, pos_number: n, kasa_number: n, cashier_name: 'Касиер ' + n,
    status: status, total_turnover: 100, cash_turnover: 100, card_turnover: 0, storna_total: 0,
    counted_cash: 100, razlika: 0
  }, extra || {});
}

function env(reps) {
  const h = boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: USER,
    data: { kasa_reports: reps, kasa_glavna: [], kasa_zoborot: [], kasa_documents: [], stores: [] }
  });
  h.w.kasaSetDate(DAY);
  h.w.kasaReports = JSON.parse(JSON.stringify(reps));
  return h;
}
function posCard(doc) {
  const cards = doc.getElementById('mod-kasa').querySelectorAll('.card');
  for (let i = 0; i < cards.length; i++) {
    const t = cards[i].querySelector('.card-title');
    if (t && t.textContent.indexOf('ПОС отчети —') >= 0) return cards[i];
  }
  return null;
}

(async function run() {

  section('1. Зареждане');
  {
    const h = env([]);
    ok('renderKasa и kasaReturnedBanner съществуват',
      typeof h.w.renderKasa === 'function' && typeof h.w.kasaReturnedBanner === 'function');
    h.close();
  }

  section('2. Върнат ПОС отчет в работния ден → лента с причината НАД таблицата');
  {
    const h = env([rep('r-1', 1, DAY, 'returned', RET), rep('r-2', 2, DAY, 'returned', RET)]);
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const bn = doc.getElementById('kasa-pos-returned');
      const card = posCard(doc);
      if (ok('лентата #kasa-pos-returned я има', !!bn) && ok('картата „ПОС отчети" я има', !!card)) {
        const t = bn.textContent;
        ok('носи „Върнат за корекция"', t.indexOf('Върнат за корекция') >= 0);
        ok('носи причината', t.indexOf(RET.return_reason) >= 0, t);
        ok('носи кой е върнал', t.indexOf(RET.returned_by) >= 0);
        ok('носи датата 05.11.2026', t.indexOf('05.11.2026') >= 0, t);
        ok('е ПРЕДИ картата (над таблицата)',
          !!(bn.compareDocumentPosition(card) & 4 /* FOLLOWING */));
        ok('е същият HTML като kasaReturnedBanner()', bn.innerHTML === w.kasaReturnedBanner(w.kasaReports[0]));
        ok('лентата е една, не по една за отчет',
          doc.getElementById('mod-kasa').innerHTML.split('Върнат за корекция').length - 1 === 1);
      }
    }
    h.close();
  }

  section('3. Без върнат отчет → няма лента (вкл. чернова с останала причина)');
  {
    const h = env([rep('r-1', 1, DAY, 'confirmed'), rep('r-2', 2, DAY, 'draft', RET)]);
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      ok('картата я има', !!posCard(doc));
      ok('лентата я НЯМА', !doc.getElementById('kasa-pos-returned'));
      ok('текст „Върнат за корекция" няма', doc.getElementById('mod-kasa').textContent.indexOf('Върнат за корекция') < 0);
    }
    h.close();
  }

  section('4. История: върнатият ред носи причината в title на баджа');
  {
    const old = dayOffset(-3);
    const h = env([rep('r-1', 1, DAY, 'confirmed'), rep('r-7', 1, old, 'returned', RET), rep('r-8', 2, old, 'confirmed')]);
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      ok('лента над днешната таблица НЯМА (върнатият е в друг ден)', !doc.getElementById('kasa-pos-returned'));
      const b = doc.querySelectorAll('#mod-kasa .kasa-hist-returned');
      if (ok('баджът „↩ Върнат" в Историята е един', b.length === 1, b.length)) {
        const t = b[0].getAttribute('title') || '';
        ok('title носи причината', t.indexOf(RET.return_reason) >= 0, t);
        ok('title носи кой', t.indexOf(RET.returned_by) >= 0, t);
        ok('title носи датата', t.indexOf('05.11.2026') >= 0, t);
        ok('баджът пак казва „↩ Върнат"', b[0].textContent.indexOf('↩ Върнат') >= 0);
      }
    }
    h.close();
  }

  section('5. Кавичка в причината не чупи атрибута');
  {
    const old = dayOffset(-3);
    const h = env([rep('r-7', 1, old, 'returned', Object.assign({}, RET, { return_reason: 'Сума "0" <грешна>' }))]);
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const b = doc.querySelector('#mod-kasa .kasa-hist-returned');
      ok('title е цял с кавичките', !!b && (b.getAttribute('title') || '').indexOf('Сума "0" <грешна>') >= 0,
        b && b.getAttribute('title'));
    }
    h.close();
  }

  report();
})();
