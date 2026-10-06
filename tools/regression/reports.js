/* Проверка 7: генераторите в report.js с реални данни. node reports.js <repo> <out.json> */
'use strict';
const path = require('path'), fs = require('fs');
const repo = path.resolve(process.argv[2]);
const H = require(repo + '/.claude/skills/tmax-jsdom-test/harness');
const L = require('./lib');
const res = {};
(async () => {
  for (const role of ['admin', 'accounting']) {
    const h = L.mkEnv(repo, role, H);
    const w = h.w;
    const run = (name, fn) => new Promise(resolve => {
      let done = false;
      const fin = v => { if (done) return; done = true; res[role + '|' + name] = v; resolve(); };
      setTimeout(() => fin('TIMEOUT'), 8000);
      try { fn(fin); } catch (e) { fin('ERR ' + e.message); }
    });
    for (const scope of [null, ['Троян', 'Севлиево']]) {
      const sk = scope ? 'scoped' : 'all';
      await run('kasaSection:' + sk, fin => w.collectDailyKasaSection(k => fin(k ? JSON.stringify(k) + '\n' + w.reportKasaSectionHtml(k) : null), L.isoShift(-1), scope, 0));
      await run('dailyData:' + sk, fin => w.collectDailyReportData(d => fin(d ? JSON.stringify(d) + '\n' + w.buildDailyReportHtml(d) : null), scope, 0));
      await run('weeklyData:' + sk, fin => w.collectWeeklyReportData(d => fin(d ? JSON.stringify(d) + '\n' + w.buildWeeklyReportHtml(d) : null), scope));
      await run('cross:' + sk, fin => w.collectCrossModuleWeeklySummary(c => {
        if (!c) return fin(null);
        const parts = ['reportReturnsListHtml', 'reportLateSectionHtml', 'reportTransitListHtml', 'reportWarehousePendingHtml'].map(f => { try { return f + ': ' + w[f](c, !!scope); } catch (e) { return f + ' ERR ' + e.message; } });
        ['reportStornoShortHtml', 'reportDiffStaleHtml'].forEach(f => { try { parts.push(f + ': ' + w[f](c)); } catch (e) { parts.push(f + ' ERR ' + e.message); } });
        fin(JSON.stringify(c) + '\n' + parts.join('\n'));
      }, null, scope));
    }
    res[role + '|errs'] = h.errs.slice();
    h.close();
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(res));
  console.log('ok', Object.keys(res).length);
  process.exit(0);
})();
