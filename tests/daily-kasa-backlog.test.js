/* ДНЕВЕН ОТЧЕТ, „КАСА" — върнатите подробно само за отчетния ден, старият
   дълг в един ред по обект, суми в €.

   На 13.09.2026 в базата стояха 10 върнати ПОС отчета от 03.07–10.08 и 18
   равнения от 26.08–10.09. Заявките в collectDailyKasaSection() са
   status=eq.returned без дата, така че всеки дневен носеше целия исторически
   дълг ред по ред. Теодор го четеше като „стари отчети в дневния".

   Сега:
     a) returned_at на D            → returned (подробно)
     b) returned_at преди D         → returnedBacklog, count/oldestDate
     c) два стари от един обект     → count 2, oldestDate = по-малката date
     d) стар извън scope            → никъде
     e) returned_at СЛЕД D          → никъде (ръчно изпращане за минал ден)
     f) рендер: € вместо лв, редът на дълга носи обекта и дд.мм

   АНТИ-ТАВТОЛОГИЯ: jsdom стъбът връща цялата таблица независимо от query
   низа, тоест решава само JS филтърът. (d) се проверява и в обратна посока —
   без scope Враца ТРЯБВА да се появи в дълга, иначе „никъде" нищо не доказва.
   Пуснат срещу report.js от 6b897a8 (преди промяната) тестът пада.

   Пускане:  node tests/daily-kasa-backlog.test.js .
*/
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };
const USERS = ['Силистра', 'Търговище', 'Шумен', 'Враца', 'Централен офис']
  .map(function (s) { return { store_name: s }; });
const SCOPE = ['Силистра', 'Търговище', 'Шумен'];

/* Отчетният ден се смята с истинската функция, не се заковава. */
function probeDay() {
  const h = boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: { users: USERS } });
  const d = h.w.reportDailyTargetDate(new Date());
  const shift = function (n) {
    const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return h.w.toLocalISO(x);
  };
  const out = { D: shift(0), plus1: shift(1), m1: shift(-1), m2: shift(-2),
                m5: shift(-5), m8: shift(-8), m10: shift(-10) };
  h.close();
  return out;
}
const DAY = probeDay();
/* дд.мм — сметнато тук, не през reportDM, за да не мери функцията сама себе си. */
const dm = function (iso) { return iso.slice(8, 10) + '.' + iso.slice(5, 7); };
const at = function (iso, hhmm) { return iso + 'T' + (hhmm || '10:00') + ':00+03:00'; };

const KASA_REPORTS = [
  /* a) върнат през D — отчетът е за D-1 */
  { store_name: 'Силистра', date: DAY.m1, pos_number: 1, razlika: 3,
    status: 'returned', return_reason: 'Днешна причина', returned_at: at(DAY.D) },
  /* b) върнат на D-1 */
  { store_name: 'Силистра', date: DAY.m2, pos_number: 2, razlika: 77.7,
    status: 'returned', return_reason: 'СТАРА ПРИЧИНА', returned_at: at(DAY.m1) },
  /* c) първият от двата стари на Търговище — по-старата date */
  { store_name: 'Търговище', date: DAY.m10, pos_number: 4, razlika: 88.8,
    status: 'returned', return_reason: 'СТАРА ПРИЧИНА', returned_at: at(DAY.m8) },
  /* d) стар, но извън обхвата */
  { store_name: 'Враца', date: DAY.m5, pos_number: 1, razlika: 1,
    status: 'returned', return_reason: '', returned_at: at(DAY.m2) },
  /* e) върнат СЛЕД отчетния ден — в обхвата */
  { store_name: 'Шумен', date: DAY.m1, pos_number: 1, razlika: 1,
    status: 'returned', return_reason: '', returned_at: at(DAY.plus1) },
  /* разминаване на D — за проверката на € в заглавието и сумата */
  { store_name: 'Търговище', date: DAY.D, pos_number: 1, razlika: 25,
    status: 'confirmed', return_reason: null, returned_at: null }
];
const KASA_ZOBOROT = [
  /* c) вторият стар на Търговище — от ДРУГАТА таблица, по-новата date */
  { store_name: 'Търговище', date: DAY.m5, razlika: 99.9,
    status: 'returned', return_reason: 'СТАРА ПРИЧИНА', returned_at: at(DAY.m1, '23:30') }
];

function env() {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: { users: USERS, kasa_reports: KASA_REPORTS, kasa_zoborot: KASA_ZOBOROT,
            app_settings: [] }
  });
}
function kasa(h, scope) {
  return new Promise(function (resolve) {
    h.w.collectDailyKasaSection(resolve, DAY.D, scope, 10);
  });
}
const names = function (arr) { return (arr || []).map(function (x) { return x.store; }); };

(async function () {

  section('a) върнат през отчетния ден → в returned, не в backlog');
  {
    const h = env();
    const k = await kasa(h, SCOPE);
    ok('колекторът връща returnedBacklog като масив', Array.isArray(k.returnedBacklog),
       typeof k.returnedBacklog);
    ok('точно един подробен върнат', k.returned.length === 1,
       'реално: ' + k.returned.length + ' → ' + names(k.returned).join('|'));
    const r = k.returned[0] || {};
    ok('това е днешният на Силистра', r.store === 'Силистра' && r.return_reason === 'Днешна причина',
       r.store + ' / ' + r.return_reason);
    ok('форматът на елемента е непроменен',
       r.type === 'ПОС № 1' && r.date === DAY.m1 && r.razlika === 3 && r.days === 0,
       JSON.stringify(r));
    h.close();
  }

  section('b) + c) по-старите → returnedBacklog по обект');
  {
    const h = env();
    const k = await kasa(h, SCOPE);
    const bl = k.returnedBacklog || [];
    ok('два обекта в дълга', bl.length === 2, JSON.stringify(bl));

    const sil = bl.filter(function (x) { return x.store === 'Силистра'; })[0];
    ok('b) Силистра: count 1', !!sil && sil.count === 1, JSON.stringify(sil));
    ok('b) Силистра: oldestDate = date на отчета, не returned_at',
       !!sil && sil.oldestDate === DAY.m2, JSON.stringify(sil));

    const tar = bl.filter(function (x) { return x.store === 'Търговище'; })[0];
    ok('c) Търговище: count 2 (двете таблици се сливат)', !!tar && tar.count === 2,
       JSON.stringify(tar));
    ok('c) Търговище: oldestDate = по-малката date', !!tar && tar.oldestDate === DAY.m10,
       JSON.stringify(tar));

    ok('сортиране: count desc → Търговище преди Силистра',
       names(bl).join('|') === 'Търговище|Силистра', names(bl).join('|'));
    ok('елементът носи точно store, count, oldestDate',
       !!tar && Object.keys(tar).sort().join(',') === 'count,oldestDate,store',
       tar ? Object.keys(tar).join(',') : 'няма');
    h.close();
  }

  section('d) стар извън обхвата → никъде (и се появява без обхват)');
  {
    const h = env();
    const k = await kasa(h, SCOPE);
    ok('Враца не е в returned', names(k.returned).indexOf('Враца') < 0);
    ok('Враца не е в returnedBacklog', names(k.returnedBacklog).indexOf('Враца') < 0,
       names(k.returnedBacklog).join('|'));

    const all = await kasa(h, null);
    const vr = (all.returnedBacklog || []).filter(function (x) { return x.store === 'Враца'; })[0];
    ok('без обхват Враца Е в дълга — филтърът по scope е решаващ',
       !!vr && vr.count === 1 && vr.oldestDate === DAY.m5, JSON.stringify(vr));
    h.close();
  }

  section('e) returned_at след отчетния ден → никъде');
  {
    const h = env();
    const k = await kasa(h, SCOPE);
    ok('Шумен не е в returned', names(k.returned).indexOf('Шумен') < 0,
       names(k.returned).join('|'));
    ok('Шумен не е в returnedBacklog', names(k.returnedBacklog).indexOf('Шумен') < 0,
       names(k.returnedBacklog).join('|'));
    ok('overThreshold не е пипан — едно разминаване на D',
       k.overThreshold.length === 1 && k.overThreshold[0].razlika === 25,
       JSON.stringify(k.overThreshold));
    h.close();
  }

  section('f) рендер');
  {
    const h = env();
    const k = await kasa(h, SCOPE);
    const html = h.w.reportKasaSectionHtml(k);

    ok('„€" присъства', html.indexOf('€') >= 0);
    ok('„лв" отсъства', html.indexOf('лв') < 0,
       html.slice(Math.max(0, html.indexOf('лв') - 60), html.indexOf('лв') + 10));
    ok('заглавието на прага е в €', html.indexOf('Разминаване над 10 € (1)') >= 0);
    ok('сумата е в €', html.indexOf('+25.00 €') >= 0);

    ok('подробният блок носи само днешния (1)',
       html.indexOf('Върнати от счетоводството (1)') >= 0);
    ok('блокът „Непоправени от по-рано" го има', html.indexOf('Непоправени от по-рано') >= 0);
    ok('редът на Търговище: обект, брой и най-старата дата в bg формат',
       html.indexOf('>Търговище</a> — 2, най-старият от ' + dm(DAY.m10)) >= 0,
       'търсено: ' + dm(DAY.m10));
    ok('редът на Силистра', html.indexOf('>Силистра</a> — 1, най-старият от ' + dm(DAY.m2)) >= 0);
    ok('дългът е под подробния блок',
       html.indexOf('Непоправени от по-рано') > html.indexOf('Върнати от счетоводството'));
    ok('в дълга няма razlika и причина',
       html.indexOf('СТАРА ПРИЧИНА') < 0 && html.indexOf('88.80') < 0 &&
       html.indexOf('99.90') < 0 && html.indexOf('77.70') < 0);

    ok('празни returned, backlog и over → празен низ',
       h.w.reportKasaSectionHtml({ returned: [], returnedBacklog: [], overThreshold: [], threshold: 10 }) === '');
    const onlyBacklog = h.w.reportKasaSectionHtml({ returned: [], overThreshold: [], threshold: 10,
      returnedBacklog: [{ store: 'Търговище', count: 9, oldestDate: '2026-07-03' }] });
    ok('само дълг → блокът се рендира без празно заглавие за върнатите',
       onlyBacklog.indexOf('>Търговище</a> — 9, най-старият от 03.07') >= 0 &&
       onlyBacklog.indexOf('Върнати от счетоводството') < 0 &&
       onlyBacklog.indexOf('Разминаване над') < 0, onlyBacklog);
    h.close();
  }

  report();
})();
