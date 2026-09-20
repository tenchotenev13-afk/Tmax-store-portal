/* Каса — защита срещу дублирани ПОС отчети и равнения (kasa.js).

   Четири механизма правеха дубли (проверено в базата на 20.09.2026, вече
   почистено):
     1. двойно натискане на „Запази" — два реда в една минута
        (kasa_zoborot Габрово 20.08, kasa_reports Търговище 11.08);
     2. НОВ ПОС отчет вместо поправка на върнатия (Добрич 15.09) — върнатият
        остава да виси в „Непоправени от по-рано" завинаги;
     3. повторно въвеждане на същия отчет (Сливен 12.08, Раднево 30.07);
     4. празен отчет с нулев оборот, потвърден от счетоводството
        (Севлиево 05.08).

   ГРАНИЦАТА, която тестът пази в ОБРАТНАТА посока: два ПОС отчета за ЕДИН ПОС
   в ЕДИН ден са ЛЕГИТИМНИ (смени, два Z-отчета — 35 случая в базата). Затова
   по ПОС+ден няма забрана, а въпрос, и различен касиер минава БЕЗ въпрос.
   Секцията „различен касиер" е точно това — без нея горните проверки биха
   минавали и срещу код, който просто забранява всичко.

   Двата клика са СИНХРОННИ, без await между тях — така изглежда истинското
   двойно натискане. Изчака ли се отговорът, вторият запис е съзнателен и
   ТРЯБВА да мине; това също е проверено, за да не се окаже ключалката вечна.

   Пускане:  node tests/kasa-dedup.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

const MGR = { email: 'm@temax.bg', display_name: 'Управител Сливен',
              role: 'manager', store_name: 'Сливен' };

function env(over) {
  return boot(Object.assign({
    modules: ['kasa.js', 'kasa-docs.js'],
    user: MGR,
    confirm: true,
    data: { kasa_reports: [], kasa_glavna: [], kasa_zoborot: [], stores: [] }
  }, over || {}));
}

const wrap = function (h) { return h.doc.getElementById('mod-kasa'); };
const postsTo = function (h, t) {
  return h.calls.post.filter(function (x) { return x.table === t; });
};
const patchesTo = function (h, t) {
  return h.calls.patch.filter(function (x) { return x.table === t; });
};
const toastText = function (h) { return JSON.stringify(h.calls.toast); };

/* Попълва формата за НОВ ПОС отчет и връща бутона „💾 Запази чернова". */
function posForm(h, over) {
  over = over || {};
  h.w.openKasaForm(null);
  const set = function (id, val) {
    const el = h.doc.getElementById(id);
    if (el) el.value = String(val);
  };
  set('kf-date', over.date);
  set('kf-pos', over.pos == null ? 1 : over.pos);
  set('kf-cashier', over.cashier == null ? 'Мария Иванова' : over.cashier);
  set('kf-total_turnover', over.total == null ? 120 : over.total);
  set('kf-cash_turnover', over.cash == null ? 120 : over.cash);
  return btn(wrap(h), 'Запази чернова');
}

function posRow(over) {
  return Object.assign({
    id: 'r-1', store_name: 'Сливен', date: '2026-08-12', pos_number: 1,
    kasa_number: 1, cashier_name: 'Мария Иванова', status: 'confirmed',
    total_turnover: 120, cash_turnover: 120, card_turnover: 0,
    storna_total: 0, counted_cash: 120, razlika: 0
  }, over || {});
}

(async function run() {

  const TODAY = (function () {
    const h = boot({ modules: ['kasa.js'], user: MGR, data: {} });
    const d = h.w.today(); h.close(); return d;
  })();

  /* ── 1. Двоен клик ──────────────────────────────────────────────────────── */
  section('1. Двоен клик по „Запази чернова" → ЕДНА заявка');
  {
    const h = env();
    const b = posForm(h, { date: TODAY });
    if (ok('бутонът съществува', !!b)) {
      realClick(h.w, b);
      realClick(h.w, b); /* веднага, без await — това е двойното натискане */
      await ticks(6);
      ok('точно един POST към kasa_reports', postsTo(h, 'kasa_reports').length === 1,
         'реално: ' + postsTo(h, 'kasa_reports').length);
      ok('бутонът е бил заключен по време на заявката', h.calls.get.length >= 1);
    }
    h.close();
  }

  section('1б) след отговора ключалката пуска — вторият СЪЗНАТЕЛЕН запис минава');
  {
    const h = env();
    const b = posForm(h, { date: TODAY });
    realClick(h.w, b);
    await ticks(6);
    const after1 = postsTo(h, 'kasa_reports').length;
    /* loadKasa() е пре-рендирал екрана; формата се отваря наново. */
    const b2 = posForm(h, { date: TODAY, cashier: 'Петър Петров' });
    realClick(h.w, b2);
    await ticks(6);
    ok('първият запис е минал', after1 === 1, 'реално: ' + after1);
    ok('вторият също минава — ключалката не е вечна',
       postsTo(h, 'kasa_reports').length === 2,
       'реално: ' + postsTo(h, 'kasa_reports').length);
    h.close();
  }

  section('1в) двоен клик по „Запази" на Равнението → ЕДНА заявка');
  {
    const h = env();
    h.w.zoborotData = null;
    if (guard('renderZoborot() не хвърля', function () { h.w.renderZoborot(); })) {
      const b = btn(wrap(h), 'Запази');
      if (ok('бутонът съществува', !!b)) {
        realClick(h.w, b);
        realClick(h.w, b);
        await ticks(6);
        ok('точно един POST към kasa_zoborot', postsTo(h, 'kasa_zoborot').length === 1,
           'реално: ' + postsTo(h, 'kasa_zoborot').length);
      }
    }
    h.close();
  }

  section('1г) 409 от уникалния индекс → PATCH, не „Грешка при запис"');
  {
    /* Вторият таб вече е записал реда; POST-ът се удря в
       kasa_zoborot(store_name,date) и трябва да стане дописване. */
    const h = env({ fail: { POST: { status: 409, url: /kasa_zoborot/,
                                    body: { message: 'duplicate key value' } } } });
    h.w.zoborotData = null;
    if (guard('renderZoborot() не хвърля', function () { h.w.renderZoborot(); })) {
      realClick(h.w, btn(wrap(h), 'Запази'));
      await ticks(6);
      const pt = patchesTo(h, 'kasa_zoborot');
      if (ok('409-ят е станал PATCH', pt.length === 1, 'реално: ' + pt.length)) {
        ok('PATCH-ът е по обект и дата, не по id',
           pt[0].url.indexOf('date=eq.') >= 0 && pt[0].url.indexOf('id=eq.') < 0, pt[0].url);
      }
      ok('няма съобщение за грешка', toastText(h).indexOf('Грешка при запис') < 0, toastText(h));
    }
    h.close();
  }

  /* ── 2. Върнат отчет за същия ПОС ───────────────────────────────────────── */
  section('2. Върнат отчет за ПОС N → нов отчет се БЛОКИРА');
  {
    const h = env({ data: {
      kasa_reports: [posRow({ id: 'r-ret', date: TODAY, pos_number: 1, status: 'returned' })],
      kasa_glavna: [], kasa_zoborot: [], stores: []
    } });
    realClick(h.w, posForm(h, { date: TODAY, pos: 1, cashier: 'Друг Касиер' }));
    await ticks(6);
    ok('няма POST', postsTo(h, 'kasa_reports').length === 0,
       'реално: ' + postsTo(h, 'kasa_reports').length);
    ok('съобщението сочи ПОС номера и „Редактирай"',
       /Има върнат отчет за ПОС 1/.test(toastText(h)) && /Редактирай/.test(toastText(h)),
       toastText(h));
    ok('не е питано с confirm', h.calls.confirm.length === 0, JSON.stringify(h.calls.confirm));
    h.close();
  }

  section('2б) върнат отчет за ДРУГ ПОС не пречи');
  {
    const h = env({ data: {
      /* Заявката е с pos_number=eq.2, но стъбът връща цялата таблица — значи
         решава JS-ът, и точно това мери проверката. */
      kasa_reports: function (url) {
        const m = /pos_number=eq\.(\d+)/.exec(url);
        const all = [posRow({ id: 'r-ret', date: TODAY, pos_number: 1, status: 'returned' })];
        return m ? all.filter(function (x) { return String(x.pos_number) === m[1]; }) : all;
      },
      kasa_glavna: [], kasa_zoborot: [], stores: []
    } });
    realClick(h.w, posForm(h, { date: TODAY, pos: 2, cashier: 'Друг Касиер' }));
    await ticks(6);
    ok('записът минава', postsTo(h, 'kasa_reports').length === 1,
       'реално: ' + postsTo(h, 'kasa_reports').length);
    ok('няма блокиращо съобщение', toastText(h).indexOf('Има върнат отчет') < 0, toastText(h));
    h.close();
  }

  /* ── 3. Същият касиер — ВЪПРОС, не забрана ──────────────────────────────── */
  section('3. Същият касиер на същия ПОС → confirm; „Отказ" спира записа');
  {
    const h = env({
      confirm: false,
      data: { kasa_reports: [posRow({ date: TODAY, pos_number: 1, cashier_name: 'Мария Иванова' })],
              kasa_glavna: [], kasa_zoborot: [], stores: [] }
    });
    realClick(h.w, posForm(h, { date: TODAY, pos: 1, cashier: 'Мария Иванова' }));
    await ticks(6);
    ok('питано е веднъж', h.calls.confirm.length === 1, JSON.stringify(h.calls.confirm));
    ok('въпросът носи касиера и ПОС номера',
       /Мария Иванова/.test(JSON.stringify(h.calls.confirm)) &&
       /ПОС 1/.test(JSON.stringify(h.calls.confirm)), JSON.stringify(h.calls.confirm));
    ok('въпросът предлага „втора смяна"',
       /втора смяна/.test(JSON.stringify(h.calls.confirm)), JSON.stringify(h.calls.confirm));
    ok('при отказ НЯМА POST', postsTo(h, 'kasa_reports').length === 0,
       'реално: ' + postsTo(h, 'kasa_reports').length);
    h.close();
  }

  section('3б) същият касиер + „Да" (втора смяна) → записът МИНАВА');
  {
    const h = env({
      confirm: true,
      data: { kasa_reports: [posRow({ date: TODAY, pos_number: 1, cashier_name: 'Мария Иванова' })],
              kasa_glavna: [], kasa_zoborot: [], stores: [] }
    });
    realClick(h.w, posForm(h, { date: TODAY, pos: 1, cashier: 'Мария Иванова' }));
    await ticks(6);
    ok('питано е', h.calls.confirm.length === 1);
    ok('записът минава', postsTo(h, 'kasa_reports').length === 1,
       'реално: ' + postsTo(h, 'kasa_reports').length);
    h.close();
  }

  section('3в) същото име с друга големина на буквите пак пита');
  {
    const h = env({
      confirm: false,
      data: { kasa_reports: [posRow({ date: TODAY, pos_number: 1, cashier_name: 'мария иванова ' })],
              kasa_glavna: [], kasa_zoborot: [], stores: [] }
    });
    realClick(h.w, posForm(h, { date: TODAY, pos: 1, cashier: 'Мария Иванова' }));
    await ticks(6);
    ok('питано е въпреки различния регистър', h.calls.confirm.length === 1,
       JSON.stringify(h.calls.confirm));
    h.close();
  }

  section('4. РАЗЛИЧЕН касиер на същия ПОС → БЕЗ въпрос (две смени са норма)');
  {
    const h = env({
      confirm: false, /* питане тук би значело блокиран легитимен запис */
      data: { kasa_reports: [posRow({ date: TODAY, pos_number: 1, cashier_name: 'Мария Иванова' })],
              kasa_glavna: [], kasa_zoborot: [], stores: [] }
    });
    realClick(h.w, posForm(h, { date: TODAY, pos: 1, cashier: 'Петър Петров' }));
    await ticks(6);
    ok('НЕ е питано', h.calls.confirm.length === 0, JSON.stringify(h.calls.confirm));
    ok('записът минава', postsTo(h, 'kasa_reports').length === 1,
       'реално: ' + postsTo(h, 'kasa_reports').length);
    h.close();
  }

  /* ── 5. Празен отчет не се потвърждава ──────────────────────────────────── */
  section('5. Празен отчет (нули навсякъде) НЕ се потвърждава');
  {
    const h = env();
    h.w.kasaReports = [posRow({ id: 'r-0', date: TODAY, status: 'draft',
                                total_turnover: 0, cash_turnover: 0, counted_cash: 0 })];
    if (guard('renderKasa() не хвърля', function () { h.w.renderKasa(); })) {
      realClick(h.w, btn(wrap(h), 'Потвърди'));
      await ticks(6);
      ok('няма PATCH', patchesTo(h, 'kasa_reports').length === 0,
         'реално: ' + patchesTo(h, 'kasa_reports').length);
      ok('казано е защо', /Празен отчет не може да се потвърди/.test(toastText(h)), toastText(h));
      ok('дори не е питано за потвърждение', h.calls.confirm.length === 0,
         JSON.stringify(h.calls.confirm));
    }
    h.close();
  }

  section('5б) НЕнулев отчет се потвърждава както преди');
  {
    const h = env();
    h.w.kasaReports = [posRow({ id: 'r-1', date: TODAY, status: 'draft' })];
    if (guard('renderKasa() не хвърля', function () { h.w.renderKasa(); })) {
      realClick(h.w, btn(wrap(h), 'Потвърди'));
      await ticks(6);
      const pt = patchesTo(h, 'kasa_reports');
      if (ok('има PATCH', pt.length === 1, 'реално: ' + pt.length)) {
        ok('статусът е confirmed', pt[0].body.status === 'confirmed', JSON.stringify(pt[0].body));
      }
      ok('няма съобщение за празен отчет',
         toastText(h).indexOf('Празен отчет') < 0, toastText(h));
    }
    h.close();
  }

  section('5в) нулев оборот, но преброени пари → НЕ е празен, потвърждава се');
  {
    /* Границата: „празен" значи и трите нули. Само total_turnover=0 при
       налични пари в касата е съвсем друго нещо и не бива да се блокира. */
    const h = env();
    h.w.kasaReports = [posRow({ id: 'r-2', date: TODAY, status: 'draft',
                                total_turnover: 0, cash_turnover: 0, counted_cash: 45.5 })];
    if (guard('renderKasa() не хвърля', function () { h.w.renderKasa(); })) {
      realClick(h.w, btn(wrap(h), 'Потвърди'));
      await ticks(6);
      ok('потвърждава се', patchesTo(h, 'kasa_reports').length === 1,
         'реално: ' + patchesTo(h, 'kasa_reports').length);
    }
    h.close();
  }

  section('5г) двоен клик по „Потвърди" → ЕДИН PATCH');
  {
    const h = env();
    h.w.kasaReports = [posRow({ id: 'r-1', date: TODAY, status: 'draft' })];
    if (guard('renderKasa() не хвърля', function () { h.w.renderKasa(); })) {
      const b = btn(wrap(h), 'Потвърди');
      realClick(h.w, b);
      realClick(h.w, b);
      await ticks(6);
      ok('точно един PATCH по самия отчет', patchesTo(h, 'kasa_reports').length === 1,
         'реално: ' + patchesTo(h, 'kasa_reports').length);
    }
    h.close();
  }

  report();
})();
