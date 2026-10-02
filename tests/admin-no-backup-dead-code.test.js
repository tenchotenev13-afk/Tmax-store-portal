/* Администрация: екранът за резервни копия е махнат (контейнерът
   #backup-admin-section липсва от index.html от 04.07.2026). loadAdmin() не
   вика loadBackupAdmin и не пуска заявка към backup_snapshots; четирите
   функции вече не съществуват. Нощните копия в базата не се пипат.

   Пускане: node tests/admin-no-backup-dead-code.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const user = role => ({ id: 'u-' + role, email: role + '@temax.bg', display_name: role, role, store_name: 'Централен офис' });

function env(role) {
  const h = boot({
    modules: ['bulletin.js', 'email.js', 'admin.js', 'report.js'],
    user: user(role),
    data: {
      notification_topics: [], notification_matrix: [], notification_overrides: [], notification_schedules: [],
      users: [], stores: [], order_restrictions: [], backup_snapshots: [{ id: 'b1', created_at: '2026-09-01T00:00:00Z' }]
    }
  });
  h.errors = [];
  h.w.addEventListener('error', e => h.errors.push(String(e.message)));
  h.w.addEventListener('unhandledrejection', e => h.errors.push(String(e.reason)));
  return h;
}

(async function run() {
  for (const role of ['admin', 'accounting']) {
    section('loadAdmin() като ' + role);
    const h = env(role);
    guard('loadAdmin()', () => h.w.loadAdmin());
    await ticks(); await ticks();
    await new Promise(r => setTimeout(r, 700)); /* старият setTimeout беше 500 мс */
    ok('няма заявка към backup_snapshots', !h.calls.get.some(u => /backup_snapshots/.test(u)), h.calls.get.join(' | '));
    ok('няма грешки в конзолата', h.errors.length === 0, h.errors.join(' | '));
  }

  section('функциите ги няма');
  {
    const h = env('admin');
    ['loadBackupAdmin', 'triggerManualBackup', 'downloadBackup', 'renderBackupSection'].forEach(n =>
      ok(n + ' не съществува', typeof h.w[n] === 'undefined', typeof h.w[n]));
    ok('loadRestrictionsAdmin си е там', typeof h.w.loadRestrictionsAdmin === 'function');
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
