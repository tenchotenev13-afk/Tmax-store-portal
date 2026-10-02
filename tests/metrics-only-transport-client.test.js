/* Броячите (#tr-metrics: Просрочени / Доставки днес / За утре / Изпълнени)
   са видими само в Транспорт и Клиентски и само за глобални роли. Над всички
   останали табове и подтабове на Транспорт — скрити.

   Пускане: node tests/metrics-only-transport-client.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

function env(role) {
  return boot({
    modules: ['transport.js', 'client-orders.js', 'pallets.js', 'transfers.js', 'kasa.js', 'kasa-docs.js', 'history.js',
      'bulletin.js', 'today.js', 'admin.js', 'stock-returns.js', 'stock-differences.js', 'transit.js', 'calendar.js', 'notifications.js'],
    user: { email: role + '@temax.bg', display_name: role, role, store_name: role === 'manager' ? 'Троян' : 'Централен офис', assigned_stores: role === 'manager' ? ['Троян'] : [] },
    data: {}
  });
}
async function go(h, mod) {
  try { h.w.showModule(mod); } catch (e) { /* зареждането на модула не ни интересува, а дисплеят се слага преди него */ }
  await ticks();
  return h.doc.getElementById('tr-metrics').style.display;
}

(async function run() {
  section('admin');
  {
    const h = env('admin');
    ok('transport → grid', await go(h, 'transport') === 'grid');
    ok('client → grid', await go(h, 'client') === 'grid');
    for (const m of ['kasa', 'stock-diff', 'admin', 'bulletin', 'pallets', 'loading', 'supply', 'transfers', 'today']) {
      const d = await go(h, m);
      ok(m + ' → none', d === 'none', d);
    }
    ok('обратно към transport → grid', await go(h, 'transport') === 'grid');
  }
  for (const role of ['accounting', 'logistics']) {
    section(role);
    const h = env(role);
    ok('transport → grid', await go(h, 'transport') === 'grid');
    ok('kasa → none', await go(h, 'kasa') === 'none');
  }
  section('manager (не е глобален)');
  {
    const h = env('manager');
    for (const m of ['transport', 'client', 'kasa']) {
      const d = await go(h, m);
      ok(m + ' → не е видим', d !== 'grid', d);
    }
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
