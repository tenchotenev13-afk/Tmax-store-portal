/* Откриване на заявките на всеки таб: node probe.js <repo> */
const path = require('path');
const repo = path.resolve(process.argv[2]);
const H = require(repo + '/.claude/skills/tmax-jsdom-test/harness');
const ALL = ['transport.js', 'pallets.js', 'supply.js', 'client-orders.js', 'docs.js', 'bulletin.js', 'today.js', 'checklist.js', 'kasa.js', 'kasa-docs.js', 'daily-turnover.js',
  'admin.js', 'history.js', 'contacts.js', 'transit.js', 'calendar.js', 'stock-returns.js', 'stock-differences.js', 'push.js', 'email.js', 'report.js', 'loading.js', 'transfers.js', 'notifications.js', 'reference.js', 'handbook.js'];
(async () => {
  const tabs = [['client', 'loadClientOrders'], ['transport', 'loadTransport'], ['transit', 'loadTransit'], ['returns', 'loadStockReturns'], ['history', 'loadHistory'], ['diff', 'loadStockDiff'], ['kasa', 'loadKasa']];
  for (const [name, fn] of tabs) {
    const h = H.boot({ repo, modules: ALL, user: { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] }, data: {} });
    try { h.w[fn](); } catch (e) { console.log(name, 'ERR', e.message); }
    for (let i = 0; i < 10; i++) await H.ticks();
    console.log('## ' + name + ' (' + fn + ')');
    Array.from(new Set(h.calls.get.map(u => u.replace(/^.*\/rest\/v1\//, '')))).forEach(u => console.log('  ' + u));
    h.close();
  }
  process.exit(0);
})();
