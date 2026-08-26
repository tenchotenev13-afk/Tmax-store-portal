/* Каса — прозорец от 7 дни в История (kasa.js).

   История държеше всичко: Кърджали има 118 записа и расте. Магазинът работи
   по вчерашния ден, счетоводството връща в рамките на ден-два — останалото е
   шум, който се прескача всеки път.

   Изключението е върнатият отчет: показва се ВИНАГИ, независимо от възрастта
   си. Той е предметът на работата, а изчезне ли от екрана, магазинът няма
   никакъв признак, че съществува.

   Прозорецът се смята от ЛОКАЛНА дата, НЕ от today(): today() е UTC и рано
   сутрин българско време връща вчерашна дата. Смятането е самостоятелно в
   kasa.js — той не зависи от bulletin.js по никакъв друг повод и тестът
   зарежда модулите БЕЗ него, за да закове това.

   Пускане:
     node tests/kasa-history-window.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset } = H;

/* ── 1. Данни ─────────────────────────────────────────────────────────────── */

const KASA_USER = {
  email: 'kasa@temax.bg', display_name: 'Каса Кърджали',
  role: 'kasa', store_name: 'Кърджали'
};

function rep(over) {
  const r = Object.assign({
    id: 'x', store_name: 'Кърджали', pos_number: 1, kasa_number: 1,
    cashier_name: '', status: 'confirmed', date: dayOffset(-1),
    total_turnover: 100, cash_turnover: 100, card_turnover: 0,
    storna_total: 0, counted_cash: 100, razlika: 0
  }, over);
  if (!r.cashier_name) r.cashier_name = r.id;   /* потвърденият ред няма бутон с id */
  return r;
}

/* Наборът, около който се върти цялата стъпка. */
function rows() {
  return [
    rep({ id: 'old-30', status: 'confirmed', date: dayOffset(-30) }),
    rep({ id: 'ret-30', status: 'returned',  date: dayOffset(-30) }),
    rep({ id: 'new-3',  status: 'confirmed', date: dayOffset(-3) }),
    rep({ id: 'edge-7', status: 'confirmed', date: dayOffset(-7) }),
    rep({ id: 'out-8',  status: 'confirmed', date: dayOffset(-8) })
  ];
}

function env(reports) {
  const h = boot({
    /* БЕЗ bulletin.js нарочно: прозорецът не бива да зависи от него. */
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: KASA_USER,
    data: { kasa_reports: [], kasa_glavna: [], kasa_zoborot: [], stores: [] }
  });
  h.w.kasaView = 'pos';
  h.w.kasaReports = reports || rows();
  return h;
}

/* Показаните редове по id (колоната Касиер), в реда на показване. */
function shown(doc) {
  const wrap = doc.getElementById('hist-table-wrap');
  if (!wrap) return null;
  return Array.prototype.slice.call(wrap.querySelectorAll('tbody tr'))
    .map(function (tr) { return tr.cells[2].textContent.trim(); });
}

(async function run() {

  section('1. Средата и помощниците');
  {
    const h = env();
    const { w } = h;
    ok('kasa.js е зареден', typeof w.renderKasa === 'function');
    ok('kasa.js НЕ зависи от bulletin.js за прозореца',
      typeof w.toLocalISO === 'undefined', 'toLocalISO е дефинирана — зависимостта се е върнала');
    ok('histWindowStart съществува', typeof w.histWindowStart === 'function');
    ok('histInWindow съществува', typeof w.histInWindow === 'function');
    ok('прозорецът е 7 дни', w.HIST_WINDOW_DAYS === 7, String(w.HIST_WINDOW_DAYS));

    if (typeof w.histWindowStart === 'function') {
      ok('началото е точно днес минус 7', w.histWindowStart() === dayOffset(-7),
        w.histWindowStart() + ' vs ' + dayOffset(-7));

      /* Същината на капана — и единствената ДЕТЕРМИНИРАНА проверка за него.
         Сравнение с dayOffset(-7) не върши работа: today() (UTC) и локалната
         дата съвпадат през по-голямата част от денонощието, тоест UTC вариант
         би минал в 9 сутринта и паднал в 23:30. Затова today() се подменя с
         явно грешна стойност: ако прозорецът се смяташе от нея, резултатът
         щеше да се измести. */
      const realToday = w.today;
      w.today = function () { return '1999-01-01'; };
      const withBrokenToday = w.histWindowStart();
      w.today = realToday;
      ok('прозорецът НЕ се смята от today() (UTC капанът)',
        withBrokenToday === dayOffset(-7), withBrokenToday);

      const inWithBroken = (function () {
        w.today = function () { return '1999-01-01'; };
        const v = w.histInWindow(rep({ date: dayOffset(-3) }));
        w.today = realToday;
        return v;
      })();
      ok('histInWindow също не зависи от today()', inWithBroken === true);
    }
    if (typeof w.histInWindow === 'function') {
      ok('отчет отпреди 3 дни е вътре', w.histInWindow(rep({ date: dayOffset(-3) })));
      ok('отчет отпреди 30 дни е вън', !w.histInWindow(rep({ date: dayOffset(-30) })));
      ok('ВЪРНАТ отпреди 30 дни е вътре',
        w.histInWindow(rep({ status: 'returned', date: dayOffset(-30) })));
      /* Граничният случай явно, не само типичният (CLAUDE.md т.10). */
      ok('точно на границата (-7) е ВЪТРЕ', w.histInWindow(rep({ date: dayOffset(-7) })));
      ok('един ден отвъд границата (-8) е ВЪН',
        !w.histInWindow(rep({ date: dayOffset(-8) })));
      ok('липсваща дата не хвърля и е вън', !w.histInWindow(rep({ date: null })));
      ok('null не хвърля', w.histInWindow(null) === false);
    }
    h.close();
  }

  section('2. Изгледът по подразбиране показва прозореца, не всичко');
  {
    const h = env();
    const { w, doc } = h;
    let list = null;
    if (guard('renderKasa() не хвърля', () => { w.renderKasa(); list = shown(doc); })) {
      if (ok('таблицата на История е рендирана', !!list, String(list))) {
        ok('потвърден отпреди 30 дни НЕ се вижда', list.indexOf('old-30') < 0, list.join(','));
        ok('потвърден отпреди 3 дни СЕ вижда', list.indexOf('new-3') >= 0, list.join(','));
        ok('граничният -7 се вижда', list.indexOf('edge-7') >= 0, list.join(','));
        ok('-8 не се вижда', list.indexOf('out-8') < 0, list.join(','));
        ok('ВЪРНАТ отпреди 30 дни СЕ вижда', list.indexOf('ret-30') >= 0, list.join(','));
        ok('върнатият стои НАЙ-ОТГОРЕ', list[0] === 'ret-30', list.join(','));
        ok('показани са точно 3 реда', list.length === 3, list.join(','));
      }
    }
    h.close();
  }

  section('3. Заглавието казва обхвата, не голото число');
  {
    const h = env();
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const txt = doc.getElementById('mod-kasa').textContent;
      ok('пише „История (последните 7 дни)"',
        txt.indexOf('История (последните 7 дни)') >= 0,
        (txt.match(/История[^№]{0,30}/) || [''])[0]);
      ok('не пише голото число „История (5)"', txt.indexOf('История (5)') < 0);
      /* Скритото се казва изрично — иначе „няма ги" и „не се показват"
         изглеждат еднакво. */
      ok('казва колко са скритите', txt.indexOf('Още 2 по-стари записа') >= 0,
        (txt.match(/Още \d+ по-стари[^.]*/) || ['липсва'])[0]);
      ok('сочи изхода през филтъра', txt.indexOf('Избери дата от филтъра') >= 0);
    }
    h.close();
  }

  section('4. Избраната дата НАДДЕЛЯВА над прозореца');
  {
    const h = env();
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const df = doc.getElementById('hist-date-filter');
      if (ok('филтърът по дата е на екрана', !!df)) {
        df.value = dayOffset(-30);
        if (guard('filterHistRep() не хвърля', () => w.filterHistRep())) {
          const list = shown(doc);
          if (ok('таблицата е пререндирана', !!list, String(list))) {
            ok('старият запис СЕ показва при избрана дата',
              list.indexOf('old-30') >= 0, list.join(','));
            ok('показани са само записите от тази дата',
              list.length === 2 && list.indexOf('ret-30') >= 0, list.join(','));
            ok('записите от прозореца отпадат при избрана дата',
              list.indexOf('new-3') < 0, list.join(','));
          }
        }
      }
    }
    h.close();
  }

  section('5. Празен филтър връща прозореца');
  {
    const h = env();
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const df = doc.getElementById('hist-date-filter');
      df.value = dayOffset(-30);
      guard('filter с дата', () => w.filterHistRep());
      if (guard('clearHistFilter() не хвърля', () => w.clearHistFilter())) {
        const list = shown(doc);
        if (ok('таблицата е пререндирана', !!list, String(list))) {
          ok('старият пак е скрит', list.indexOf('old-30') < 0, list.join(','));
          ok('върнатият пак се вижда', list.indexOf('ret-30') >= 0, list.join(','));
          ok('пресните пак се виждат', list.indexOf('new-3') >= 0, list.join(','));
        }
      }
    }
    h.close();
  }

  section('6. Филтърът по статус работи заедно с прозореца');
  {
    const h = env();
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      doc.getElementById('hist-status-filter').value = 'returned';
      if (guard('filterHistRep() не хвърля', () => w.filterHistRep())) {
        const list = shown(doc);
        if (ok('таблицата е пререндирана', !!list, String(list))) {
          ok('старият върнат минава и през двете',
            list.indexOf('ret-30') >= 0, list.join(','));
          ok('потвърдените отпадат', list.indexOf('new-3') < 0, list.join(','));
        }
      }
    }
    h.close();
  }

  section('7. Магазин само със стари записи пак стига до тях');
  {
    /* Гейтът на картата е по ЦЯЛАТА история, не по прозореца — иначе с
       картата изчезва и филтърът, тоест единственият път до записите. */
    const h = env([
      rep({ id: 'a-40', status: 'confirmed', date: dayOffset(-40) }),
      rep({ id: 'a-50', status: 'confirmed', date: dayOffset(-50) })
    ]);
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const txt = doc.getElementById('mod-kasa').textContent;
      ok('картата „История" се показва', txt.indexOf('История (последните') >= 0);
      ok('филтърът по дата е достъпен', !!doc.getElementById('hist-date-filter'));
      ok('казва, че 2 са скрити', txt.indexOf('Още 2 по-стари записа') >= 0);

      doc.getElementById('hist-date-filter').value = dayOffset(-40);
      if (guard('filterHistRep() не хвърля', () => w.filterHistRep())) {
        const list = shown(doc);
        ok('старият запис е достижим през филтъра',
          !!list && list.indexOf('a-40') >= 0, String(list));
      }
    }
    h.close();
  }

  section('8. Днешните отчети не влизат в История');
  {
    const h = env([
      rep({ id: 'today-1', status: 'confirmed', date: w0() }),
      rep({ id: 'y-1', status: 'confirmed', date: dayOffset(-1) })
    ]);
    const { w, doc } = h;
    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const list = shown(doc);
      if (ok('таблицата е рендирана', !!list, String(list))) {
        ok('днешният не е в История', list.indexOf('today-1') < 0, list.join(','));
        ok('вчерашният е в История', list.indexOf('y-1') >= 0, list.join(','));
      }
    }
    h.close();
  }

  report();
})();

/* renderKasa() дели по today() (UTC) — за реда „днес" ползваме същата
   функция, за да не се разминем при разлика между UTC и локално. */
function w0() { return new Date().toISOString().slice(0, 10); }
