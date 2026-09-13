/* Календар: местни дати вместо UTC (calendar.js).

   getWeekDates() строи дните на МЕСТНА полунощ. До 13.09.2026 пет места ги
   режеха с toISOString().slice(0,10) — в България (UTC+2/+3) местната полунощ в
   UTC е предният ден, и то ПО ЦЯЛ ДЕН, не само нощем:
     · седмицата се питаше неделя–събота вместо понеделник–неделя;
     · маршрут, избран за вторник, се записваше с датата на понеделник;
     · транспортните и клиентските заявки (с истински дати) излизаха в
       колоната на СЛЕДВАЩИЯ ден.
   Сега и петте места минават през localDateISO(d) от shared.js, а
   bus_routes.route_date се измества с +1 ден (bus-routes-date-shift-schema.sql).

   Часовникът е фиксиран, а часовата зона се задава ВЪТРЕ в процеса — Git Bash
   не подава TZ към Windows процес. Същият механизъм като
   tests/local-date.test.js. Проверява се и по обяд: дефектът не е нощен.

   Колоната на деня се разпознава по ПОЗИЦИЯТА ѝ в грида и по деня от месеца
   в заглавието (day.getDate() — местен, независим от поправката), НЕ по
   data-date: той идва от същия dateStr, който се проверява, тоест проверка по
   него би минала и срещу счупения код.

   Пускане:  node tests/calendar-local-dates.test.js .
*/
'use strict';

process.env.TZ = 'Europe/Sofia';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const MANAGER = { email: 'troyan@temax.bg', display_name: 'Управител Троян',
                  role: 'manager', store_name: 'Троян' };

/* Сряда 16.09.2026 — транспорт; вторник 15.09.2026 — маршрут с вече
   изместената (вярна) дата. */
const TRANSPORT = [{ id: 't-1', date: '2026-09-16', hour: '10:00', store_name: 'Троян',
                     destination: 'СРЯДА-ТРАНСПОРТ', status: 'pending' }];
const ROUTES = [{ id: 'r-1', route_date: '2026-09-15', store_name: 'Троян',
                  destination: 'ВТОРНИК-МАРШРУТ', purpose: 'goods_exchange', departure_time: '08:00' }];

function pinClock(w, iso) {
  const RealDate = w.Date;
  const FIXED = new RealDate(iso).getTime();
  w.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
    static now() { return FIXED; }
  };
  return function restore() { w.Date = RealDate; };
}

function env() {
  /* transport.js — заради hourToMinutes(), която calendar.js преизползва. */
  return boot({
    modules: ['transport.js', 'calendar.js'],
    user: MANAGER,
    data: { bus_routes: ROUTES, transport_orders: TRANSPORT, client_orders: [],
            route_templates: [], users: [] }
  });
}

/* Седемте клетки на грида, в реда на показване. */
function cells(doc) {
  const grid = Array.prototype.find.call(doc.getElementById('mod-calendar').querySelectorAll('div'),
    d => /grid-template-columns:\s*repeat\(7,\s*1fr\)/.test(d.getAttribute('style') || ''));
  return grid ? Array.prototype.slice.call(grid.children) : [];
}
/* Денят от месеца в заглавието на клетката — day.getDate(), местен. */
function cellDay(cell) {
  const big = Array.prototype.find.call(cell.querySelectorAll('div'),
    d => /font-size:20px/.test(d.getAttribute('style') || ''));
  return big ? parseInt(big.firstChild.textContent, 10) : null;
}

function checkMoment(label, iso, localTime) {
  return (async function () {
    section(label);
    const h = env();
    const restore = pinClock(h.w, iso);
    try {
      const probe = new h.w.Date();
      ok('часът е ' + localTime + ' местно на ' + probe.getDate() + '.09 (TZ=' + process.env.TZ + ')',
        String(probe.getHours()).padStart(2, '0') + ':' + String(probe.getMinutes()).padStart(2, '0') === localTime
          && probe.getDate() === 15,
        probe.toString());

      h.w.calWeekOffset = 0;
      if (!guard('loadCalendar() не хвърля', () => h.w.loadCalendar())) return;
      await ticks(); await ticks();

      /* ── а) седмицата започва в понеделник 14.09 ── */
      const routesUrl = h.calls.get.filter(u => /\/bus_routes\?/.test(u))[0] || '';
      const trUrl = h.calls.get.filter(u => /\/transport_orders\?/.test(u))[0] || '';
      ok('а) маршрутите се питат от понеделник 14.09', routesUrl.indexOf('route_date=gte.2026-09-14') >= 0, routesUrl);
      ok('а) … до неделя 20.09', routesUrl.indexOf('route_date=lte.2026-09-20') >= 0, routesUrl);
      ok('а) транспортът се пита от 14.09 до 20.09',
        trUrl.indexOf('date=gte.2026-09-14') >= 0 && trUrl.indexOf('date=lte.2026-09-20') >= 0, trUrl);

      const cs = cells(h.doc);
      if (ok('а) гридът има 7 клетки', cs.length === 7, 'клетки: ' + cs.length)) {
        ok('а) първата клетка е ден 14 (понеделник)', cellDay(cs[0]) === 14, String(cellDay(cs[0])));
        const plusDates = cs.map(c => { const b = c.querySelector('button[data-date]'); return b ? b.getAttribute('data-date') : null; });
        ok('а) „+ Добави" в клетките води към 14..20.09 поред',
          plusDates.join(',') === '2026-09-14,2026-09-15,2026-09-16,2026-09-17,2026-09-18,2026-09-19,2026-09-20',
          plusDates.join(','));

        /* ── в) транспорт от 16.09 е в сряда, не в четвъртък ── */
        const wed = cs[2], thu = cs[3];
        ok('в) третата клетка е ден 16 (сряда)', cellDay(wed) === 16, String(cellDay(wed)));
        ok('в) транспортът от 16.09 е в колоната на сряда', wed.textContent.indexOf('СРЯДА-ТРАНСПОРТ') >= 0, wed.textContent.slice(0, 120));
        ok('в) … и НЕ в колоната на четвъртък', thu.textContent.indexOf('СРЯДА-ТРАНСПОРТ') < 0, thu.textContent.slice(0, 120));
        ok('в) маршрут с дата 15.09 е в колоната на вторник',
          cs[1].textContent.indexOf('ВТОРНИК-МАРШРУТ') >= 0 && cs[2].textContent.indexOf('ВТОРНИК-МАРШРУТ') < 0,
          cs[1].textContent.slice(0, 120));
      }

      /* ── б) маршрут, избран във вторник → POST с route_date 2026-09-15 ── */
      if (guard('openCalRouteModal() не хвърля', () => h.w.openCalRouteModal(null, null))) {
        const sel = h.doc.getElementById('cr-date');
        const tueName = (h.w.DAY_NAMES || [])[1];
        const opt = sel && tueName
          ? Array.prototype.find.call(sel.options, o => o.textContent.indexOf(tueName) === 0) : null;
        if (ok('б) в модала има опция „' + tueName + '"', !!opt, sel ? Array.prototype.map.call(sel.options, o => o.textContent).join(' | ') : 'няма select')) {
          ok('б) опциите са понеделник–петък 14..18.09',
            Array.prototype.map.call(sel.options, o => o.value).join(',') === '2026-09-14,2026-09-15,2026-09-16,2026-09-17,2026-09-18',
            Array.prototype.map.call(sel.options, o => o.value).join(','));
          sel.value = opt.value;
          realClick(h.w, btn(h.doc.getElementById('calr-ov'), 'Добави'));
          await ticks();
          const post = h.calls.post.filter(p => p.table === 'bus_routes')[0];
          if (ok('б) има POST към bus_routes', !!post, h.calls.toast.join(' | '))) {
            ok('б) route_date е 2026-09-15 (вторник)', post.body.route_date === '2026-09-15', JSON.stringify(post.body.route_date));
            ok('б) магазинът е Троян', post.body.store_name === 'Троян', JSON.stringify(post.body.store_name));
          }
        }
      }
    } finally {
      restore();
      h.close();
    }
  })();
}

(async function run() {
  /* 14.09.2026 22:30 UTC = вторник 15.09.2026 01:30 в София. */
  await checkMoment('1. Нощ: вторник 15.09.2026, 01:30 българско', '2026-09-14T22:30:00Z', '01:30');
  /* 15.09.2026 09:00 UTC = вторник 15.09.2026 12:00 в София. */
  await checkMoment('2. Контрол по обяд: вторник 15.09.2026, 12:00 българско', '2026-09-15T09:00:00Z', '12:00');
  report();
})();
