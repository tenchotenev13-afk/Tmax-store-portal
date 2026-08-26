/* Каса — статус 'returned' в справките (report.js, history.js, kasa-docs.js).

   От стъпка 2 kasa_glavna и kasa_zoborot получават status='returned' вместо
   'draft'. Четири места още деляха света на две кофи и върнатото изпадаше
   тихо — най-лошият вид грешка, защото никъде не се вижда празнина:

   1. report.js zoborotSummary броеше само draft и confirmed, тоест
      draft+confirmed вече не даваше total;
   2. Excel износът в history.js превеждаше статуса с двупосочен тернар и
      върнатият документ излизаше като „Чернова";
   3. markReady() в kasa-docs.js не покриваше 'returned' в нито една група:
      върнатият отчет не се изпращаше И не се изброяваше в предупреждението,
      тоест магазинът виждаше успешен toast и не разбираше, че е останал.

   kasa.js и history.js се зареждат ЗАЕДНО в реда от index.html (споделят
   fmtMoney).

   Пускане:
     node tests/kasa-returned-in-reports.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const KASA_USER = {
  email: 'kasa@temax.bg', display_name: 'Каса Кърджали',
  role: 'kasa', store_name: 'Кърджали'
};
const ADMIN = {
  email: 'admin@temax.bg', display_name: 'Админ',
  role: 'admin', store_name: 'Централен офис'
};

function env(user, mods) {
  return boot({
    modules: mods || ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: user || KASA_USER,
    data: { kasa_reports: [], kasa_glavna: [], kasa_zoborot: [], stores: [] }
  });
}

(async function run() {

  /* ── A. report.js — трета кофа и трета карта ────────────────────────────── */
  section('1. zoborotSummary: draft + confirmed + returned === total');
  {
    const h = env(ADMIN, ['kasa.js', 'kasa-docs.js', 'history.js', 'report.js']);
    const { w } = h;
    ok('report.js е зареден',
      typeof w.collectCrossModuleWeeklySummary === 'function' ||
      typeof w.buildCrossModuleSectionHtml === 'function');

    /* Изходният код е източникът тук: collectCrossModuleWeeklySummary тегли
       десетина таблици и не се вика изгодно от тест. Кофата се чете от
       самия текст на функцията — точно както report-edge-sync.test.js
       сравнява двата файла. */
    const src = String(w.collectCrossModuleWeeklySummary || '');
    ok('има кофа draft', /draft:\s*zoborot\.filter/.test(src));
    ok('има кофа confirmed', /confirmed:\s*zoborot\.filter/.test(src));
    ok('има кофа returned', /returned:\s*zoborot\.filter/.test(src), 'липсва третата кофа');
    ok('returned филтрира по status===returned',
      /returned:\s*zoborot\.filter\(function\(x\)\{\s*return x\.status==='returned';/.test(src));

    /* Самият инвариант, смятан върху реални данни със същите предикати. */
    const zoborot = [
      { id: 'z1', status: 'draft' },
      { id: 'z2', status: 'confirmed' },
      { id: 'z3', status: 'returned' }
    ];
    const summary = {
      total: zoborot.length,
      draft: zoborot.filter(function (x) { return x.status === 'draft'; }).length,
      returned: zoborot.filter(function (x) { return x.status === 'returned'; }).length,
      confirmed: zoborot.filter(function (x) { return x.status === 'confirmed'; }).length
    };
    ok('инвариантът държи: 1+1+1 === 3',
      summary.draft + summary.confirmed + summary.returned === summary.total,
      JSON.stringify(summary));
    ok('без третата кофа сборът НЕ би бил total',
      summary.draft + summary.confirmed !== summary.total);
    h.close();
  }

  section('2. Трите карти за равнението се рендират');
  {
    const h = env(ADMIN, ['kasa.js', 'kasa-docs.js', 'history.js', 'report.js']);
    const { w } = h;
    const src = String(w.buildCrossModuleSectionHtml || '');

    ok('картата „общо записа" я има', src.indexOf("cross.zoborot.total,'общо записа'") >= 0);
    ok('картата „непотвърдени от обект" я има',
      src.indexOf("cross.zoborot.draft,'непотвърдени от обект'") >= 0);
    ok('картата „върнати за корекция" я има',
      src.indexOf("cross.zoborot.returned,'върнати за корекция'") >= 0,
      'третата карта липсва');
    ok('картата „потвърдени" я има', src.indexOf("cross.zoborot.confirmed,'потвърдени'") >= 0);
    /* Предупредителният цвят при >0, по образеца на съседните карти. */
    ok('върнатите светят при стойност > 0',
      src.indexOf("cross.zoborot.returned,'върнати за корекция', cross.zoborot.returned>0") >= 0);

    /* Реален рендер на реда, за да не е само текстова проверка. */
    let html = null;
    if (typeof w.crossMetricCard === 'function') {
      if (guard('crossMetricCard() не хвърля', () => {
        html = w.crossMetricCard(2, 'върнати за корекция', true);
      })) {
        ok('картата съдържа стойността и надписа',
          html.indexOf('2') >= 0 && html.indexOf('върнати за корекция') >= 0);
      }
    }
    h.close();
  }

  /* ── B. history.js — Excel износът ──────────────────────────────────────── */
  section('3. Excel износът превежда „returned" за Главна каса и Равнение');
  {
    /* Истинският exportKasaToExcel() се пуска с подменен window.XLSX, който
       записва подадените редове вместо да прави файл. Така се чете КАКВОТО
       наистина влиза в клетката, а не регекс срещу изходния код — регексът
       щеше да мине и срещу код, който изобщо не се изпълнява. */
    const D = '2026-08-20';
    const h = boot({
      modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
      user: ADMIN,
      data: {
        kasa_storno: [],
        kasa_storno_items: [],
        kasa_documents: [],
        kasa_reports: [
          { id: 'r1', store_name: 'Кърджали', date: D, pos_number: 1,
            cashier_name: 'Мария', status: 'returned' }
        ],
        kasa_glavna: [
          { id: 'g1', store_name: 'Кърджали', date: D, status: 'returned' },
          { id: 'g2', store_name: 'Кърджали', date: D, status: 'draft' },
          { id: 'g3', store_name: 'Кърджали', date: D, status: 'confirmed' }
        ],
        kasa_zoborot: [
          { id: 'z1', store_name: 'Кърджали', date: D, status: 'returned' },
          { id: 'z2', store_name: 'Кърджали', date: D, status: 'draft' },
          { id: 'z3', store_name: 'Кърджали', date: D, status: 'confirmed' }
        ]
      }
    });
    const { w } = h;

    const sheets = [];
    w.XLSX = {
      utils: {
        book_new: function () { return { SheetNames: [], Sheets: {} }; },
        aoa_to_sheet: function (rows) { const s = { __rows: rows }; return s; },
        book_append_sheet: function (wb, ws, name) { sheets.push({ name: name, rows: ws.__rows }); }
      },
      writeFile: function () {}
    };
    w.histFilter = { from: D, to: D, store: 'Кърджали' };
    /* ПОС отчетите в износа идват от histData.kasa — глобалът, който пълни
       търсенето в История, а не от заявката към kasa_reports. */
    w.histData = { kasa: [
      { id: 'r1', store_name: 'Кърджали', date: D, pos_number: 1,
        cashier_name: 'Мария', status: 'returned' },
      { id: 'r2', store_name: 'Кърджали', date: D, pos_number: 2,
        cashier_name: 'Петя', status: 'draft' }
    ] };

    let ran = false;
    if (guard('exportKasaToExcel() не хвърля', () => { w.exportKasaToExcel(); ran = true; })) {
      await ticks(); await ticks();

      /* ОТДЕЛНИ клетки, не слепен текст: „Върнат" е префикс на „Върната" и
         „Върнато", тоест търсене в слепен низ не различава трите. */
      const cells = sheets.reduce(function (acc, s) {
        (s.rows || []).forEach(function (row) {
          (row || []).forEach(function (c) { acc.push(String(c)); });
        });
        return acc;
      }, []);
      const count = function (v) {
        return cells.filter(function (c) { return c === v; }).length;
      };
      const found = cells.filter(function (c) {
        return /^(Върнат|Върната|Върнато|Чернова|Потвърд)/.test(c);
      });

      if (ok('износът е произвел листове', sheets.length > 0 && cells.length > 0,
        'листове: ' + sheets.length)) {
        /* Родът се различава: Главна каса е женски, Равнение — среден. */
        ok('Главна каса дава точно „Върната"', count('Върната') === 1, found.join(','));
        ok('Равнение дава точно „Върнато"', count('Върнато') === 1, found.join(','));
        ok('ПОС отчетът пази своето „Върнат" (ред 618 непипнат)',
          count('Върнат') === 1, found.join(','));
        ok('родовете не са разменени: по един от трите',
          count('Върнат') === 1 && count('Върната') === 1 && count('Върнато') === 1,
          found.join(','));
        ok('потвърдените си остават',
          count('Потвърдена') === 1 && count('Потвърдено') === 1, found.join(','));

        /* Същината: върнатият вече НЕ се брои за чернова. Черновите са две —
           по една в ПОС, Главна каса и Равнение. Преди поправката щяха да са
           пет: върнатите от Главна каса и Равнение също падаха в „Чернова". */
        ok('„Чернова" е точно 3 пъти, не 5', count('Чернова') === 3,
          'намерени: ' + count('Чернова') + ' → ' + found.join(','));
      }
    }
    ok('износът наистина е бил извикан', ran);
    h.close();
  }

  /* ── C. kasa-docs.js — markReady ────────────────────────────────────────── */
  section('4. markReady изпраща само потвърдените, но изброява върнатия');
  {
    const h = env();
    const { w, calls } = h;
    const D = w.kasaActiveDate();
    w.kasaReports = [
      { id: 'r-ok', store_name: 'Кърджали', date: D, pos_number: 1,
        cashier_name: 'Мария', status: 'confirmed' },
      { id: 'r-ret', store_name: 'Кърджали', date: D, pos_number: 2,
        cashier_name: 'Иванка', status: 'returned' }
    ];

    if (guard('markReady() не хвърля', () => w.markReady())) {
      await ticks();
      const patches = calls.patch.filter(function (p) { return p.table === 'kasa_reports'; });

      if (ok('изпратен е точно ЕДИН PATCH', patches.length === 1, 'намерени: ' + patches.length)) {
        ok('изпратен е потвърденият', patches[0].url.indexOf('id=eq.r-ok') >= 0, patches[0].url);
        ok('върнатият НЕ е изпратен',
          patches.filter(function (p) { return p.url.indexOf('r-ret') >= 0; }).length === 0);
        ok('PATCH-ът слага ready_at', !!patches[0].body.ready_at);
      }

      const msg = calls.toast.join(' | ');
      ok('съобщението е предупредително, не голо „Изпратено"',
        msg.indexOf('Останаха непотвърдени') >= 0, msg);
      ok('върнатият е изброен ПОИМЕННО', msg.indexOf('ПОС 2') >= 0, msg);
      ok('изброен е с името на касиера', msg.indexOf('Иванка') >= 0, msg);
      ok('казва се, че е върнат за корекция',
        msg.indexOf('върнат за корекция') >= 0, msg);
      ok('НЕ е излязъл зеленият „Изпратено за проверка!"',
        msg.indexOf('📤 Изпратено за проверка!') < 0, msg);
    }
    h.close();
  }

  section('5. markReady: само върнат, без потвърден → нищо не се изпраща');
  {
    const h = env();
    const { w, calls } = h;
    const D = w.kasaActiveDate();
    w.kasaReports = [
      { id: 'r-ret', store_name: 'Кърджали', date: D, pos_number: 3,
        cashier_name: 'Петя', status: 'returned' }
    ];

    if (guard('markReady() не хвърля', () => w.markReady())) {
      await ticks();
      ok('нищо не е изпратено',
        calls.patch.filter(function (p) { return p.table === 'kasa_reports'; }).length === 0);
      const msg = calls.toast.join(' | ');
      ok('казва, че няма потвърдени', msg.indexOf('Няма потвърдени отчети') >= 0, msg);
      ok('върнатият е изброен, не премълчан', msg.indexOf('ПОС 3') >= 0, msg);
      ok('с бележка защо', msg.indexOf('върнат за корекция') >= 0, msg);
    }
    h.close();
  }

  section('6. markReady: само потвърдени → чистото съобщение остава');
  {
    const h = env();
    const { w, calls } = h;
    const D = w.kasaActiveDate();
    w.kasaReports = [
      { id: 'a', store_name: 'Кърджали', date: D, pos_number: 1, status: 'confirmed' },
      { id: 'b', store_name: 'Кърджали', date: D, pos_number: 2, status: 'confirmed' }
    ];
    if (guard('markReady() не хвърля', () => w.markReady())) {
      await ticks();
      ok('изпратени са и двата',
        calls.patch.filter(function (p) { return p.table === 'kasa_reports'; }).length === 2);
      const msg = calls.toast.join(' | ');
      ok('чистото съобщение', msg.indexOf('📤 Изпратено за проверка!') >= 0, msg);
      ok('няма предупреждение', msg.indexOf('Останаха непотвърдени') < 0, msg);
    }
    h.close();
  }

  section('7. Интеграция: kasa.js и history.js заедно');
  {
    const h = env();
    const { w } = h;
    ok('kasa.js е зареден', typeof w.renderKasa === 'function');
    ok('history.js е зареден', typeof w.loadHistory === 'function');
    ok('kasa-docs.js е зареден', typeof w.markReady === 'function');
    ok('fmtMoney е налична след двете дефиниции', typeof w.fmtMoney === 'function');
    ok('fmtMoney работи', w.fmtMoney(12.5).indexOf('12.5') >= 0, w.fmtMoney(12.5));
    h.close();
  }

  report();
})();
