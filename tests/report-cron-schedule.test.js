/* „Разписание" в Администрация → Известия → „📧 Общи отчети" — от cron.job.

   Колоната се чете от rpc/report_cron_schedule (миграция 20260918120256,
   само четене): ден (петото поле на cron) + час по София (условието в
   командата). Смяна от браузъра НЯМА — виж claude/open-tasks.md
   „Сървърна проверка на самоличност".

     · данни от сървъра → „петък 18:00", data-src="cron";
     · '*' → „всеки ден"; спряно задание → „(спряно)"; непознат ден (1-5) —
       сурово, не гадаене;
     · провал / празен отговор / липсващ вид → резервният текст от
       ADMIN_REPORTS, сив, data-src="static", без червен toast.

   Правата и структурата на самата функция — tests/sql/report-cron-schedule.test.sql.

   Пускане:  node tests/report-cron-schedule.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ADMIN = { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const LIVE = [
  { kind: 'daily', dow: '*', minute: 0, hour_sofia: 21, active: true },
  { kind: 'weekly', dow: '0', minute: 0, hour_sofia: 21, active: true },
  { kind: 'pallets', dow: '4', minute: 30, hour_sofia: 17, active: true },   /* НЕ е резервата „петък 18:00" */
  { kind: 'warehouse', dow: '1-5', minute: 5, hour_sofia: 9, active: false }
];

const wait = ms => new Promise(r => setTimeout(r, ms));
async function settle() { await wait(60); for (let i = 0; i < 4; i++) await ticks(); }
async function env(rpc, fail) {
  const h = boot({
    modules: ['bulletin.js', 'email.js', 'admin.js', 'report.js'],
    user: ADMIN,
    data: { report_recipients: [], users: [], notification_topics: [], notification_matrix: [],
            notification_overrides: [], notification_schedules: [], stores: [], rpc: rpc },
    fail: fail
  });
  h.w.loadNotificationsAdmin(); await settle();
  return h;
}
const cell = (h, kind) => { const r = h.doc.getElementById('report-row-' + kind); return r ? r.querySelector('td.report-schedule') : null; };
const txt = (h, kind) => { const c = cell(h, kind); return c ? c.textContent : null; };
const src = (h, kind) => { const c = cell(h, kind); return c ? c.getAttribute('data-src') : null; };

(async function () {

  section('1. Разписанието идва от сървъра');
  {
    const h = await env(url => /rpc\/report_cron_schedule/.test(url) ? LIVE : []);
    ok('Дневен: „всеки ден 21:00"', txt(h, 'daily') === 'всеки ден 21:00', txt(h, 'daily'));
    ok('Седмичен: „неделя 21:00"', txt(h, 'weekly') === 'неделя 21:00', txt(h, 'weekly'));
    ok('Палети: „четвъртък 17:30" — от сървъра, не резервата', txt(h, 'pallets') === 'четвъртък 17:30', txt(h, 'pallets'));
    ok('Склад: непознат ден сурово + „(спряно)"', txt(h, 'warehouse') === 'cron „1-5" 09:05 (спряно)', txt(h, 'warehouse'));
    ok('и четирите са data-src="cron"', ['daily', 'weekly', 'pallets', 'warehouse'].every(k => src(h, k) === 'cron'));
    const q = h.calls.get.filter(u => /report_cron_schedule/.test(u));
    ok('една GET заявка към rest/v1/rpc/report_cron_schedule', q.length === 1 && /\/rest\/v1\/rpc\/report_cron_schedule$/.test(q[0]), q.join('\n'));
    ok('без POST към rpc (нищо не се пише)', !h.calls.post.some(p => /rpc\//.test(p.url)));
    ok('сивият текст казва, че смяната е през Claude Code',
      h.doc.getElementById('notif-reports-body').textContent.indexOf('Смяна — само през Claude Code') >= 0);
    h.close();
  }

  section('2. Резервата при провал / празно / липсващ вид');
  {
    const h = await env(url => [], { GET: /rpc\/report_cron_schedule/ });
    ok('провал: Палети показва резервата „петък 18:00"', txt(h, 'pallets') === 'петък 18:00', txt(h, 'pallets'));
    ok('провал: и четирите са data-src="static"', ['daily', 'weekly', 'pallets', 'warehouse'].every(k => src(h, k) === 'static'));
    ok('провал: без червен toast „Грешка при зареждане"', !h.calls.toast.some(m => /Грешка при зареждане/.test(m)), h.calls.toast.join(' | '));
    h.close();
  }
  {
    const h = await env(url => /rpc\//.test(url) ? [] : []);
    ok('празен отговор → резервата', src(h, 'daily') === 'static' && txt(h, 'daily') === 'всеки ден 21:00');
    h.close();
  }
  {
    const h = await env(url => /rpc\//.test(url) ? [LIVE[2]] : []);
    ok('само Палети от сървъра → Палети „cron", останалите „static"',
      src(h, 'pallets') === 'cron' && txt(h, 'pallets') === 'четвъртък 17:30' && src(h, 'daily') === 'static' && src(h, 'warehouse') === 'static');
    h.close();
  }
  {
    const h = await env(url => /rpc\//.test(url) ? [{ kind: 'daily', dow: '*', minute: 0, hour_sofia: null, active: true }] : []);
    ok('без час по София (условието липсва) → резервата, не „null:00"', src(h, 'daily') === 'static', txt(h, 'daily'));
    h.close();
  }

  report();
})();
