/* ПРОСРОЧИЕ И „ЧАКА" ПО РАБОТНИ ДНИ — reportWorkdaysBetween (15.10.2026).

   Повод: писмо на Теодор от 14.10.2026 — „минали са 4 работни дни, днес е
   5-ият — системата брои събота и неделя". От v54 reportLateDays и
   reportWaitDays броят само работните дни по isBgWorkday() (без събота,
   неделя и официалните празници от bgHolidaysForYear).

   Семантика: броят се дните d с from < d <= refD, които са работни.
   Срок петък → понеделник = 1; срок вчера (работен) = 1; срок днес = 0;
   срок събота, опорен ден понеделник = 1. Обратен интервал → 0.
   reportLateDays има под 1 при изтекъл срок: опорен ден в почивен ден иначе
   дава 0 и заявката изпада от „просрочени" (навсякъде lateDays > 0).

   Проверява ДВЕТЕ копия: report.js (през harness-а, заедно с shared.js) и
   supabase/functions/send-scheduled-report/index.ts (типовете махнати,
   във vm) — и че дават едно и също за всяка двойка дати в 2026–2027.

   Пускане:  node tests/report-workdays.test.js .
*/
'use strict';
/* Git Bash не подава TZ към Node — задава се тук, преди jsdom и преди Date. */
process.env.TZ = 'Europe/Sofia';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const EDGE = path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts');
const _w = process.emitWarning; process.emitWarning = function () {};
const JS = nodeModule.stripTypeScriptTypes(fs.readFileSync(EDGE, 'utf8'));
process.emitWarning = _w;

function loadEdge() {
  const ctx = {
    Date, Response, console, Intl, JSON, Math, Object, Array, String, Number, Promise, encodeURIComponent, setTimeout,
    Deno: { env: { get: () => 'X' }, serve: () => {} },
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
  };
  vm.createContext(ctx);
  vm.runInContext(JS, ctx, { filename: 'send-scheduled-report.js' });
  return ctx;
}

(async function () {
  const h = boot({ modules: ['report.js'],
    user: { email: 'a@temax.bg', display_name: 'А', role: 'admin', store_name: 'Централен офис' }, data: {} });
  const E = loadEdge();
  const COPIES = [['report.js', h.w], ['index.ts', E]];

  for (const [name, w] of COPIES) {
    const D = iso => new w.Date(iso + 'T00:00:00');
    const WB = (a, b) => w.reportWorkdaysBetween(D(a), D(b));

    section(name + ': семантиката');
    ok('срок пт 09.10 → пн 12.10 = 1 (само понеделникът)', WB('2026-10-09', '2026-10-12') === 1, WB('2026-10-09', '2026-10-12'));
    ok('срок вчера (вт 13.10) → ср 14.10 = 1', WB('2026-10-13', '2026-10-14') === 1);
    ok('срок днес = 0', WB('2026-10-14', '2026-10-14') === 0);
    ok('срок сб 10.10 → пн 12.10 = 1', WB('2026-10-10', '2026-10-12') === 1);
    ok('срок нд 11.10 → пн 12.10 = 1', WB('2026-10-11', '2026-10-12') === 1);
    ok('Търговище-0202: от вт 06.10 до ср 14.10 „чака" 6 (календарно 8)', WB('2026-10-06', '2026-10-14') === 6, WB('2026-10-06', '2026-10-14'));
    ok('дата от ЦО 13.10, опорен ден 14.10 → просрочие 1', WB('2026-10-13', '2026-10-14') === 1);

    section(name + ': празници, часово време, обратен интервал');
    ok('22.09.2026 (вт, Независимостта): 21.09 → 22.09 = 0', WB('2026-09-21', '2026-09-22') === 0);
    ok('21.09 → 23.09 = 1 (само срядата)', WB('2026-09-21', '2026-09-23') === 1);
    ok('смяна на часовото време (25.10.2026): пт 23.10 → пн 26.10 = 1', WB('2026-10-23', '2026-10-26') === 1, WB('2026-10-23', '2026-10-26'));
    ok('Великден 2027 (02.05): 29.04 → 04.05 = 0 (Разпети петък, уикенд, Великден пн, 01.05 пренесен на 04.05)',
      WB('2027-04-29', '2027-05-04') === 0, WB('2027-04-29', '2027-05-04'));
    ok('29.04.2027 → 05.05.2027 = 1', WB('2027-04-29', '2027-05-05') === 1, WB('2027-04-29', '2027-05-05'));
    ok('refD преди from → 0', WB('2026-10-14', '2026-10-05') === 0);

    section(name + ': reportLateDays / reportWaitDays');
    const ref = D('2026-10-14');
    ok('reportLateDays: срок 09.10 → 3 (пн, вт, ср)', w.reportLateDays({ delivery: '2026-10-09' }, ref) === 3, w.reportLateDays({ delivery: '2026-10-09' }, ref));
    ok('reportLateDays: срок днес → 0', w.reportLateDays({ delivery: '2026-10-14' }, ref) === 0);
    ok('reportLateDays: срок в бъдеще → 0 (не отрицателно)', w.reportLateDays({ delivery: '2026-10-20' }, ref) === 0);
    /* Подът: опорен ден неделя 13.09.2026, срок пт 11.09 — 0 работни дни, но е просрочена */
    ok('reportLateDays: срок пт 11.09, опорен ден нд 13.09 → под 1',
      w.reportLateDays({ delivery: '2026-09-11' }, D('2026-09-13')) === 1);
    ok('reportWaitDays: от по-ранната от created_at и date (06.10) → 6',
      w.reportWaitDays({ created_at: '2026-10-08T08:00:00.000Z', date: '2026-10-06' }, ref) === 6);
    ok('reportWaitDays: чака от петък, опорен ден събота → 0 (без под)',
      w.reportWaitDays({ created_at: '2026-10-09T08:00:00.000Z' }, D('2026-10-10')) === 0);
    ok('reportWaitDays: без created_at → 0', w.reportWaitDays({}, ref) === 0);
  }

  section('Двете копия дават еднакво за 2026–2027');
  {
    let n = 0; const diffs = [];
    for (let t = new Date(2026, 0, 1); t.getFullYear() < 2028; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) {
      for (let k = -1; k <= 16; k++) {
        const r = new Date(t.getFullYear(), t.getMonth(), t.getDate() + k);
        const a = h.w.reportWorkdaysBetween(new h.w.Date(t.getTime()), new h.w.Date(r.getTime()));
        const b = E.reportWorkdaysBetween(new E.Date(t.getTime()), new E.Date(r.getTime()));
        n++;
        if (a !== b) diffs.push(t.toDateString() + '+' + k + ': ' + a + '≠' + b);
      }
    }
    ok('reportWorkdaysBetween — същото в ' + n + ' двойки дати', !diffs.length, diffs.slice(0, 3).join(' | '));
  }

  h.close();
  report();
})();
