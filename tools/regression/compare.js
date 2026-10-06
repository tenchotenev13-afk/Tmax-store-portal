/* node compare.js old.json new.json [--detail] [--table] */
'use strict';
const fs = require('fs');
const O = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), N = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const detail = process.argv.indexOf('--detail') >= 0;
function msDiff(a, b) {
  const m = new Map(); a.forEach(x => m.set(x, (m.get(x) || 0) + 1)); b.forEach(x => m.set(x, (m.get(x) || 0) - 1));
  const onlyA = [], onlyB = [];
  m.forEach((v, k) => { for (let i = 0; i < Math.abs(v); i++) (v > 0 ? onlyA : onlyB).push(k); });
  return { onlyA, onlyB };
}
const trunc = (s, n) => String(s).length > n ? String(s).slice(0, n) + '…' : String(s);
const J = x => JSON.stringify(x);
const out = { matrix: {}, findings: [] };
const CHK = ['1 конзола', '2 действия', '3 клик→заявки', '4 филтри', '5 Excel', '6 печат'];
const roles = Object.keys(N);
for (const role of roles) for (const tab of Object.keys(N[role])) {
  const o = (O[role] || {})[tab], n = N[role][tab];
  const cell = {};
  const note = (chk, msg) => { (cell[chk] = cell[chk] || []).push(msg); };
  if (!o || o.fatal || n.fatal) { note('1 конзола', 'fatal old=' + (o && o.fatal) + ' new=' + n.fatal); out.matrix[role + '|' + tab] = cell; continue; }
  /* 1 */
  const errKeys = k => Object.keys(k || {});
  Object.keys(o.errors || {}).forEach(k => note('1 конзола', 'OLD ' + k + ': ' + trunc(J(o.errors[k]), 160)));
  Object.keys(n.errors || {}).forEach(k => note('1 конзола', 'NEW ' + k + ': ' + trunc(J(n.errors[k]), 160)));
  /* 2 и 4 */
  const ok_ = Object.keys(o.states), nk = Object.keys(n.states);
  const onlyOldKeys = ok_.filter(k => nk.indexOf(k) < 0 && k !== 'default'), onlyNewKeys = nk.filter(k => ok_.indexOf(k) < 0 && k !== 'default');
  onlyOldKeys.forEach(k => note('4 филтри', 'само в СТАРАТА: ' + k));
  onlyNewKeys.forEach(k => note('4 филтри', 'само в НОВАТА: ' + k));
  ok_.filter(k => nk.indexOf(k) >= 0).forEach(k => {
    const a = o.states[k], b = n.states[k];
    if (a.missing || b.missing) { note('4 филтри', 'липсва контрол ' + k + ' old.missing=' + !!a.missing + ' new.missing=' + !!b.missing); return; }
    const d = msDiff(a.actions, b.actions);
    if ((d.onlyA.length || d.onlyB.length) && J(Array.from(new Set(a.actions)).sort()) === J(Array.from(new Set(b.actions)).sort())) { (out.mult = out.mult || []).push(role + '|' + tab + ' ' + k + ': същият набор, различна кратност (стара ' + a.actions.length + ', нова ' + b.actions.length + ')'); }
    else if (d.onlyA.length || d.onlyB.length) note('2 действия', k + ': само стара ' + d.onlyA.length + ', само нова ' + d.onlyB.length + (detail ? ' | старо: ' + trunc(J(d.onlyA.slice(0, 3)), 260) + ' | ново: ' + trunc(J(d.onlyB.slice(0, 3)), 260) : ''));
  });
  /* default: кое състояние е подразбиращият се екран във всяка версия */
  const defIs = (V) => { const d = V.states.default; if (!d || !d.actions) return null; const ks = Object.keys(V.states).filter(k => k !== 'default' && V.states[k].actions && J(V.states[k].actions) === J(d.actions)); return ks[0] || '(не съвпада с друго)'; };
  if (o.states.default && n.states.default) out.defaults = (out.defaults || {}); if (o.states.default && n.states.default) out.defaults[role + '|' + tab] = 'стара=' + defIs(o) + ' нова=' + defIs(n);
  /* 3 */
  const oc = o.clicks || {}, nc = n.clicks || {};
  Object.keys(oc).filter(k => !nc[k]).forEach(k => note('3 клик→заявки', 'функция само в старата: ' + k + (oc[k].notfound ? ' (не е намерена)' : '')));
  Object.keys(nc).filter(k => !oc[k]).forEach(k => note('3 клик→заявки', 'функция само в новата: ' + k));
  Object.keys(oc).filter(k => nc[k]).forEach(k => {
    const a = oc[k], b = nc[k];
    if (a.notfound || b.notfound) { if (!!a.notfound !== !!b.notfound) note('3 клик→заявки', k + ': не е намерена old=' + !!a.notfound + ' new=' + !!b.notfound); return; }
    for (const f of ['post', 'patch', 'del', 'net', 'toast', 'confirm', 'errs']) if (J(a[f]) !== J(b[f])) note('3 клик→заявки', k + '.' + f + ': старо ' + trunc(J(a[f]), 200) + ' | ново ' + trunc(J(b[f]), 200));
    if (J(a.newIds) !== J(b.newIds)) (out.info = out.info || []).push(role + '|' + tab + ' [инфо] ' + k + ' нови id: старо ' + a.newIds.length + ' ново ' + b.newIds.length + (detail ? ' ' + trunc(J(a.newIds.filter(x => b.newIds.indexOf(x) < 0)), 120) + ' / ' + trunc(J(b.newIds.filter(x => a.newIds.indexOf(x) < 0)), 120) : ''));
  });
  /* 5 */
  const oe = o.excel || {}, ne = n.excel || {};
  Object.keys(oe).forEach(k => { if (!ne[k]) { if (k !== 'default') note('5 Excel', 'само в стария: ' + k); } else if (J(oe[k]) !== J(ne[k])) note('5 Excel', k + ': различен (' + J(oe[k]).length + ' срещу ' + J(ne[k]).length + ' знака)'); });
  Object.keys(ne).forEach(k => { if (!oe[k] && k !== 'default') note('5 Excel', 'само в новия: ' + k); });
  if (oe.default && ne.default && J(oe.default) !== J(ne.default)) note('5 Excel', 'default: различен');
  /* 6 */
  const op = o.prints || {}, np = n.prints || {};
  Object.keys(op).forEach(k => { if (!op[k] && !np[k]) return; if (!np[k]) note('6 печат', 'само в стария: ' + k); else if (op[k] !== np[k]) note('6 печат', k + ': HTML различен (' + op[k].length + ' срещу ' + np[k].length + ')'); });
  Object.keys(np).forEach(k => { if (!op[k] && np[k]) note('6 печат', 'само в новия: ' + k); });
  out.matrix[role + '|' + tab] = cell;
}
console.log(J(out.matrix)); console.log(J(out.defaults||{})); console.log(J(out.info||[])); console.log(J(out.mult||[]));
if (process.argv.indexOf('--table') >= 0) {
  const tabs = Array.from(new Set(Object.keys(out.matrix).map(k => k.split('|')[1])));
  for (const tab of tabs) {
    console.log('\n## ' + tab);
    for (const role of roles) {
      const c = out.matrix[role + '|' + tab] || {};
      console.log(role.padEnd(11), CHK.map(k => (c[k] ? 'ДИФ(' + c[k].length + ')' : 'OK').padEnd(10)).join(' '));
    }
  }
}
