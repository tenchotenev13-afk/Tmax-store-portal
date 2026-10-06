/* Планировчик: по 4 наведнъж, резултат на файл за всяка (версия, роля, таб), таймаут 10 мин.
   REG_OLD и REG_NEW — папките (worktree) на старата и новата версия; REG_OUT — къде да пише (по подразбиране <tmpdir>/reg2);
   CONC — колко наведнъж (по подразбиране 4). Приключилите задачи се прескачат — пускането може да се подновява. */
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs'), path = require('path');
if (!process.env.REG_OLD || !process.env.REG_NEW) { console.error('Задай REG_OLD и REG_NEW (папките на двете версии)'); process.exit(2); }
const OUT = process.env.REG_OUT || path.join(require('os').tmpdir(), 'reg2'); fs.mkdirSync(OUT, { recursive: true });
const STATUS = path.join(OUT, 'STATUS.log');
const CONC = parseInt(process.env.CONC || '4', 10), LIMIT_MS = 10 * 60 * 1000;
const roles = ['admin', 'accounting', 'logistics', 'warehouse', 'manager', 'kasa', 'supply', 'info'];
/* REG_TABS=pallets,checklist,admin ограничава табовете */
const tabs = process.env.REG_TABS ? process.env.REG_TABS.split(',') : ['client', 'diff', 'transport', 'kasa', 'returns', 'history', 'transit', 'pallets', 'checklist', 'admin'];
const jobs = [];
for (const tab of tabs) for (const role of roles) for (const v of ['old', 'new']) jobs.push({ v, role, tab, file: path.join(OUT, v + '-' + role + '-' + tab + '.json') });
const log = s => { const line = new Date().toTimeString().slice(0, 8) + ' ' + s; fs.appendFileSync(STATUS, line + '\n'); console.log(line); };
let idx = 0, running = 0, done = 0, skipped = 0, failed = [];
function next() {
  while (running < CONC && idx < jobs.length) {
    const j = jobs[idx++];
    if (fs.existsSync(j.file)) { skipped++; continue; }
    running++;
    const t0 = Date.now();
    const p = spawn('node', [path.join(__dirname, 'run.js'), '.', j.file, j.role, j.tab], { cwd: j.v === 'old' ? process.env.REG_OLD : process.env.REG_NEW, stdio: 'ignore' });
    log('СТАРТ ' + j.v + ' ' + j.role + ' ' + j.tab);
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      log('ТАЙМАУТ(>10 мин) ' + j.v + ' ' + j.role + ' ' + j.tab + ' — спрян');
      failed.push(j.v + ' ' + j.role + ' ' + j.tab);
      try { execSync('taskkill /F /T /PID ' + p.pid, { stdio: 'ignore' }); } catch (e) {}
    }, LIMIT_MS);
    p.on('exit', code => {
      finished = true; clearTimeout(timer); running--; done++;
      const ok = fs.existsSync(j.file);
      if (!ok && failed.indexOf(j.v + ' ' + j.role + ' ' + j.tab) < 0) failed.push(j.v + ' ' + j.role + ' ' + j.tab + ' (код ' + code + ')');
      log((ok ? 'ГОТОВ ' : 'БЕЗ РЕЗУЛТАТ ') + j.v + ' ' + j.role + ' ' + j.tab + ' ' + Math.round((Date.now() - t0) / 1000) + 'с  [' + (done + skipped) + '/' + jobs.length + ']');
      next();
    });
  }
  if (running === 0 && idx >= jobs.length) { log('КРАЙ: ' + (done + skipped) + '/' + jobs.length + ', неуспешни: ' + JSON.stringify(failed)); process.exit(0); }
}
log('=== старт: ' + jobs.length + ' задачи, паралелно ' + CONC);
next();
