/* „Днес" показва бюлетина на ТЕКУЩАТА седмица, не последният създаден.
   Бюлетинът за следващата седмица се публикува в петък; до неделя таблото (и
   снимката в report_snapshots) трябва да са по текущата. Изборът е на
   reportPickWeeklyBulletin() от report.js — същият като в отчета.
   Опашката за снимки (todayLoadPhotoQueue) ползва същия бюлетин.

   Часовникът е замразен на конкретни дни (Пет 02.10.2026 = седмица 40).

   Пускане: node tests/today-current-week-bulletin.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const B40 = { id: 'b-40', week_number: 40, year: 2026, status: 'published', created_at: '2026-09-24T10:00:00Z' };
const B41 = { id: 'b-41', week_number: 41, year: 2026, status: 'published', created_at: '2026-10-01T10:00:00Z' };
const mkContent = w => { const c = { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } }; w.DKEYS.forEach(k => { c.calendar[k] = []; }); return c; };

function env(day, bulletins) {
  const h = boot({ modules: ['bulletin.js', 'today.js', 'report.js'], user: ADMIN, data: {} });
  const w = h.w;
  const Real = w.Date, fixed = new Real(day + 'T12:00:00').getTime();
  w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  };
  const all = bulletins.map(b => Object.assign({ content: mkContent(w) }, b));
  /* Мокът отговаря според заявката: стара (limit=1 по created_at) или списък. */
  h.setData('bulletins', url => {
    if (/order=created_at\.desc&limit=1/.test(url)) {
      return all.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 1);
    }
    return all.slice().sort((a, b) => b.year - a.year || b.week_number - a.week_number).slice(0, 20);
  });
  h.setData('recurring_tasks', []); h.setData('bulletin_tasks', []); h.setData('task_completions', []);
  h.setData('users', [{ store_name: 'Троян' }]); h.setData('report_snapshots', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot', 'goods_transit', 'transport_pallets',
    'stock_differences', 'client_orders', 'transport_orders', 'daily_turnover', 'report_recipients', 'recurring_task_skips',
    'recurring_task_versions'].forEach(t => h.setData(t, []));
  return h;
}
const taskUrls = h => h.calls.get.filter(u => /\/bulletin_tasks\?.*bulletin_id=eq\./.test(u));
const usedIds = h => taskUrls(h).map(u => /bulletin_id=eq\.([\w-]+)/.exec(u)[1]);

async function dash(h) { h.w.loadTodayDashboard(); await ticks(); await ticks(); await ticks(); }
async function photos(h) { h.w.todayLoadPhotoQueue(function () {}); await ticks(); await ticks(); await ticks(); }

(async function run() {
  const cases = [
    ['петък 02.10 (седмица 40, С41 вече публикуван)', '2026-10-02', [B40, B41], 'b-40'],
    ['събота 03.10', '2026-10-03', [B40, B41], 'b-40'],
    ['понеделник 05.10 (седмица 41)', '2026-10-05', [B40, B41], 'b-41'],
    ['само С40 публикуван, днес е седмица 41', '2026-10-05', [B40], 'b-40']
  ];
  for (const [name, day, list, want] of cases) {
    section(name + ' → ' + want);
    const h = env(day, list);
    await dash(h);
    ok('таблото ползва ' + want, usedIds(h).indexOf(want) >= 0 && usedIds(h).every(i => i === want), usedIds(h).join(','));
    const h2 = env(day, list);
    await photos(h2);
    ok('опашката за снимки ползва ' + want, usedIds(h2).length > 0 && usedIds(h2).every(i => i === want), usedIds(h2).join(','));
  }

  section('fallback без report.js функциите → старото поведение');
  {
    const h = env('2026-10-02', [B40, B41]);
    h.w.reportPickWeeklyBulletin = undefined;
    await dash(h);
    ok('последният създаден (b-41)', usedIds(h).indexOf('b-41') >= 0, usedIds(h).join(','));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
