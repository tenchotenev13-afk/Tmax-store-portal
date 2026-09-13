/* Местна дата: today(), yesterday() и периодите не връщат вчерашния ден нощем.

   До 13.09.2026 today() в shared.js беше new Date().toISOString().slice(0,10),
   тоест UTC. България е UTC+2/+3, значи между 00:00 и 03:00 местно време
   (зимно до 02:00) порталът мислеше, че е вчера: датите по подразбиране в
   Каса, Палети и заявките, филтрите „днес", вчера/завчера в дневния преглед.

   Сега има localDateISO(d) в shared.js (без параметър = сега) и today(),
   yesterday() и засегнатите места минават през нея.

   Часовникът е ФИКСИРАН, не реален: тест, който разчита на текущия час, би бил
   зелен 21 часа в денонощието и червен три — тоест щеше да „минава" точно
   когато не трябва. Часовата зона се задава изрично, иначе на машина в UTC
   няма какво да се различи.

   Пускане:  node tests/local-date.test.js .
*/
'use strict';

/* ПРЕДИ всичко останало: часовата зона е на целия процес (V8 isolate), тоест
   важи и за прозореца на jsdom. */
process.env.TZ = 'Europe/Sofia';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

function env() {
  /* history.js ползва помощници от kasa.js; kasa-docs.js носи дневния преглед. */
  const h = boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: ADMIN,
    data: { kasa_reports: [], kasa_zoborot: [], kasa_documents: [], kasa_glavna: [], stores: [] }
  });
  return h;
}

/* Подменя Date в прозореца: new Date() без аргументи и Date.now() връщат
   фиксирания момент; всичко с аргументи е истински Date. Същият подход като
   в loading-lists-warehouse.test.js. */
function pinClock(w, iso) {
  const RealDate = w.Date;
  const FIXED = new RealDate(iso).getTime();
  w.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
    static now() { return FIXED; }
  };
  return function restore() { w.Date = RealDate; };
}

/* Периодът „текущ месец" в История — стойностите на двете полета. */
function historyPeriod(h) {
  if (!h.doc.getElementById('mod-history')) {
    const d = h.doc.createElement('div'); d.id = 'mod-history'; h.doc.body.appendChild(d);
  }
  h.w.renderHistoryShell();
  const f = h.doc.getElementById('h-from'), t = h.doc.getElementById('h-to');
  return { from: f ? f.value : null, to: t ? t.value : null };
}

/* Бутоните „Вчера / Завчера / По-завчера" в дневния преглед: текстът и датата,
   към която водят. */
function dailyButtons(h) {
  h.w.dailyOverviewDate = null;
  h.w.loadDailyOverview();
  const wrap = h.doc.getElementById('daily-overview') || h.doc.getElementById('h-results');
  if (!wrap) return null;
  return Array.prototype.filter.call(wrap.querySelectorAll('button'),
    b => /loadDailyOverview\('/.test(b.getAttribute('onclick') || ''))
    .map(b => ({ text: b.textContent.trim(),
                 date: (b.getAttribute('onclick').match(/'(\d{4}-\d{2}-\d{2})'/) || [])[1] }));
}

/* Една и съща проверка за всеки момент — различават се само очакванията. */
function checkMoment(label, iso, exp) {
  section(label);
  const h = env();
  const restore = pinClock(h.w, iso);
  try {
    const probe = new h.w.Date();
    ok('часът е ' + exp.localTime + ' местно, датата — ' + exp.today,
      String(probe.getHours()).padStart(2, '0') + ':' + String(probe.getMinutes()).padStart(2, '0') === exp.localTime,
      probe.toString() + '  TZ=' + process.env.TZ);
    const utcCut = probe.toISOString().slice(0, 10);
    ok('UTC срезът е ' + exp.utcCut + (exp.utcCut !== exp.today ? ' — прозорецът е реален' : ' — съвпада с местния'),
      utcCut === exp.utcCut, utcCut);

    ok('localDateISO() = ' + exp.today, h.w.localDateISO() === exp.today, h.w.localDateISO());
    ok('today() = ' + exp.today, h.w.today() === exp.today, h.w.today());
    ok('yesterday() = ' + exp.yesterday, h.w.yesterday() === exp.yesterday, h.w.yesterday());
    ok('kasaActiveDate() по подразбиране е вчера', h.w.kasaActiveDate() === exp.yesterday, h.w.kasaActiveDate());
    ok('dailyActiveDate() по подразбиране е вчера', h.w.dailyActiveDate() === exp.yesterday, h.w.dailyActiveDate());

    let per;
    if (guard('renderHistoryShell() не хвърля', () => { per = historyPeriod(h); })) {
      ok('История „текущ месец" от ' + exp.monthFrom, per.from === exp.monthFrom, per.from);
      ok('История „текущ месец" до ' + exp.monthTo, per.to === exp.monthTo, per.to);
    }

    let btns;
    if (guard('loadDailyOverview() не хвърля', () => { btns = dailyButtons(h); })) {
      if (ok('трите бутона са на екрана', !!btns && btns.length === 3, JSON.stringify(btns))) {
        ok('„Вчера" води към ' + exp.daily[0], btns[0].date === exp.daily[0] && /^Вчера\(/.test(btns[0].text), JSON.stringify(btns[0]));
        ok('„Завчера" води към ' + exp.daily[1], btns[1].date === exp.daily[1] && /^Завчера\(/.test(btns[1].text), JSON.stringify(btns[1]));
        ok('„По-завчера" води към ' + exp.daily[2], btns[2].date === exp.daily[2] && /^По-завчера\(/.test(btns[2].text), JSON.stringify(btns[2]));
      }
    }
  } finally {
    restore();
    h.close();
  }
}

(async function run() {

  section('0. Помощникът сам по себе си');
  {
    const h = env();
    ok('localDateISO е дефинирана', typeof h.w.localDateISO === 'function');
    ok('с параметър — местната дата на подадения момент, с водещи нули',
      h.w.localDateISO(new h.w.Date(2026, 0, 5, 23, 59)) === '2026-01-05',
      h.w.localDateISO(new h.w.Date(2026, 0, 5, 23, 59)));
    ok('местна полунощ НЕ пада в предния ден',
      h.w.localDateISO(new h.w.Date(2026, 8, 1, 0, 0, 0)) === '2026-09-01',
      h.w.localDateISO(new h.w.Date(2026, 8, 1, 0, 0, 0)));
    ok('последният ден на месеца (new Date(г, м+1, 0))',
      h.w.localDateISO(new h.w.Date(2026, 9, 0)) === '2026-09-30',
      h.w.localDateISO(new h.w.Date(2026, 9, 0)));
    h.close();
  }

  /* 14.09.2026 22:30 UTC = 15.09.2026 01:30 в София (UTC+3). */
  checkMoment('1. Нощ: 15.09.2026, 01:30 българско (UTC още е 14-и)', '2026-09-14T22:30:00Z', {
    localTime: '01:30', utcCut: '2026-09-14', today: '2026-09-15', yesterday: '2026-09-14',
    monthFrom: '2026-09-01', monthTo: '2026-09-30',
    daily: ['2026-09-14', '2026-09-13', '2026-09-12']
  });

  /* Нощ на границата на месеца: 30.09 22:30 UTC = 01.10 01:30 в София. UTC
     срезът е още в септември — месечният период и „вчера" трябва да са
     октомври / 30.09. */
  checkMoment('2. Нощ на смяна на месеца: 01.10.2026, 01:30 българско', '2026-09-30T22:30:00Z', {
    localTime: '01:30', utcCut: '2026-09-30', today: '2026-10-01', yesterday: '2026-09-30',
    monthFrom: '2026-10-01', monthTo: '2026-10-31',
    daily: ['2026-09-30', '2026-09-29', '2026-09-28']
  });

  /* Контрол по обяд: 15.09.2026 09:00 UTC = 12:00 в София. Тук UTC и местният
     ден съвпадат — поправката не бива да мести деня. */
  checkMoment('3. Контрол по обяд: 15.09.2026, 12:00 българско', '2026-09-15T09:00:00Z', {
    localTime: '12:00', utcCut: '2026-09-15', today: '2026-09-15', yesterday: '2026-09-14',
    monthFrom: '2026-09-01', monthTo: '2026-09-30',
    daily: ['2026-09-14', '2026-09-13', '2026-09-12']
  });

  report();
})();
