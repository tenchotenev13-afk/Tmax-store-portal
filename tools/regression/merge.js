/* Слива резултатите на sched.js (<out>/<версия>-<роля>-<таб>.json) в по един файл на версия.
   node merge.js <папка с резултати> <къде да пише старата.json> <къде да пише новата.json> */
'use strict';
const fs = require('fs'), path = require('path');
const [dir, outOld, outNew] = process.argv.slice(2);
if (!dir || !outOld || !outNew) { console.error('node merge.js <папка> <old.json> <new.json>'); process.exit(2); }
for (const [v, out] of [['old', outOld], ['new', outNew]]) {
  const all = {};
  fs.readdirSync(dir).filter(f => f.indexOf(v + '-') === 0 && /\.json$/.test(f)).forEach(f => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    Object.keys(j).forEach(r => { all[r] = all[r] || {}; Object.assign(all[r], j[r]); });
  });
  fs.writeFileSync(out, JSON.stringify(all));
  console.log(v, Object.keys(all).length, 'роли →', out);
}
