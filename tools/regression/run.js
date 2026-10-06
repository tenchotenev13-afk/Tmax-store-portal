/* node run.js <repo> <out.json> [роли|all] [табове|all] — една версия, резултатът е JSON */
'use strict';
const path = require('path'), fs = require('fs');
const repo = path.resolve(process.argv[2]);
const outFile = process.argv[3];
const rolesArg = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : null;
const tabsArg = process.argv[5] && process.argv[5] !== 'all' ? process.argv[5].split(',') : null;
const H = require(repo + '/.claude/skills/tmax-jsdom-test/harness');
const L = require('./lib');
const DATA = L.loadData();
const TODAY = L.NOW_ISO.slice(0, 10);

const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* Описание на табовете */
const TABS = {
  client: { cont: ['mod-client'], open: h => h.w.loadClientOrders(), sub: null, wait: 0 },
  transport: { cont: ['mod-transport'], open: h => h.w.loadTransport(), sub: null, wait: 0 },
  transit: { cont: ['mod-transit'], open: h => h.w.loadTransit(), sub: 'transitDir', excel: h => h.w.exportTransitExcel(), wait: 0 },
  returns: { cont: ['mod-stock-returns'], open: h => h.w.loadStockReturns(), sub: 'setSRTab', excel: h => h.w.exportSRExcel(), wait: 0 },
  history: { cont: ['mod-history'], open: h => h.w.loadHistory(), sub: null, wait: 320 },
  diff: { cont: ['mod-stock-diff'], open: h => h.w.loadStockDiff(), sub: 'setSDDirTab', excel: h => h.w.exportSDExcel(), wait: 0, views: true },
  kasa: { cont: ['mod-kasa'], open: h => h.w.loadKasa(), sub: null, wait: 0, kasa: true },
  pallets: { cont: ['mod-pallets'], open: h => h.w.loadPallets(), sub: null, excel: h => h.w.exportPalletsExcel(), wait: 0 },
  checklist: { cont: ['mod-checklist'], open: h => h.w.loadChecklist(), sub: null, wait: 0, cells: true },
  admin: { cont: ['mod-admin'], open: h => h.w.loadAdmin(), sub: null, wait: 400 }
};
const REP_STATES = {
  client: ['-|filterOrders:all'], transport: ['-|filterTransport:all'], transit: ['transitDir:all|transitFilter:all'],
  returns: ['setSRTab:diff|setSRFilter:all', 'setSRTab:complaint|setSRFilter:all'], pallets: ['-|-'], admin: ['-|-'], checklist: ['-|-'],
  diff: ['setSDDirTab:supplier|setSDFilter:all', 'setSDDirTab:interstore|setSDFilter:all', 'setSDDirTab:wrong_receipt|setSDFilter:all']
};
const LIMIT_VALUES = { setTStore: 2, setSRStoreFilter: 2, setSRSupplierFilter: 2, setSDStoreFilter: 2 };

async function openTab(h, tab) {
  const T = TABS[tab];
  try { T.open(h); } catch (e) { h.errs.push('open: ' + e.message); }
  await L.settle(h, 8);
  if (T.wait) await L.sleep(T.wait);
  await L.settle(h, 3);
}
function union(a, b) {
  const cnt = (arr) => { const m = new Map(); arr.forEach(x => m.set(x, (m.get(x) || 0) + 1)); return m; };
  const ma = cnt(a.actions), mb = cnt(b.actions), out = [];
  new Set([...ma.keys(), ...mb.keys()]).forEach(k => { const n = Math.max(ma.get(k) || 0, mb.get(k) || 0); for (let i = 0; i < n; i++) out.push(k); });
  return { actions: out.sort(), ctl: Array.from(new Set(a.ctl.concat(b.ctl))).sort(), rows: Object.assign({}, a.rows, b.rows) };
}
/* снимка; за Разлики в новата версия — обединение на „Бланки“ и „Редове“ */
async function snapTab(h, tab) {
  const T = TABS[tab];
  let s = L.snap(h, T.cont);
  if (T.views && typeof h.w.setSDView === 'function') {
    const cur = h.w.sdView;
    const other = cur === 'rows' ? 'reports' : 'rows';
    try { h.w.setSDView(other); await L.settle(h, 3); } catch (e) { h.errs.push('setSDView: ' + e.message); }
    s = union(s, L.snap(h, T.cont));
    try { h.w.setSDView(cur); await L.settle(h, 2); } catch (e) {}
  }
  if (T.cells) s = addCells(h, s);
  return s;
}
/* Чек лист: клетките нямат inline onclick (слушатели) — снимаме ги като „действия“: обект, показател, стойност, коментар */
function addCells(h, s) {
  const cells = Array.from(h.doc.querySelectorAll('#checklist-table td[data-si]')).map(td => {
    const ic = td.querySelector('.cl-cmt'), v = td.querySelector('.cl-val');
    return 'cell|' + td.getAttribute('data-si') + '|' + td.getAttribute('data-mi') + '|' + norm(v ? v.textContent : '') + '|' + (ic ? ic.getAttribute('title') : '-');
  });
  const heads = Array.from(h.doc.querySelectorAll('#checklist-table thead th')).map(th => 'head|' + norm(th.textContent));
  return { actions: s.actions.concat(cells, heads).sort(), ctl: s.ctl, rows: s.rows };
}
function clickCtl(h, tab, key) {
  const el = L.findCtl(h, TABS[tab].cont, key);
  if (!el) return false;
  try { H.realClick(h.w, el); } catch (e) { h.errs.push('click ' + key + ': ' + e.message); }
  return true;
}
function excelOf(h) { const x = h.xl.map(f => ({ fname: f.fname.replace(/\d{4}-\d{2}-\d{2}/g, 'D'), sheets: f.sheets })); h.xl.length = 0; return x; }

/* ═══ Каса ═══ */
const KASA_STATES = ['pos', 'pos@today', 'glavna', 'zoborot', 'storno', 'oborot'];
async function kasaState(role, st) {
  const h = L.mkEnv(repo, role, H);
  try {
    h.w.loadKasa(); await L.settle(h, 8);
    const tabName = st.split('@')[0];
    if (st.indexOf('@today') > 0) h.w.kasaSetDate(h.w.today());
    h.w.kasaTab(tabName); await L.settle(h, 8);
  } catch (e) { h.errs.push('kasa ' + st + ': ' + e.message); }
  const s = L.snap(h, ['mod-kasa']);
  return { h, s };
}

/* ═══ История ═══ */
async function historyState(role, type) {
  const h = L.mkEnv(repo, role, H);
  try {
    h.w.loadHistory(); await L.sleep(320); await L.settle(h, 4);
    h.doc.getElementById('h-from').value = L.isoShift(-30); h.doc.getElementById('h-to').value = L.isoShift(0);
    const st = h.doc.getElementById('h-store'); if (st) st.value = '';
    h.doc.getElementById('h-type').value = type;
    h.w.runHistorySearch(); await L.settle(h, 10); await L.sleep(100);
  } catch (e) { h.errs.push('hist ' + type + ': ' + e.message); }
  return h;
}

async function buildState(role, tab, stKey) {
  const h = L.mkEnv(repo, role, H);
  await openTab(h, tab);
  if (TABS[tab].views && typeof h.w.setSDView === 'function') { try { h.w.setSDView('rows'); await L.settle(h, 3); } catch (e) {} }
  const parts = stKey.split('|'), sub = parts[0] === '-' ? null : parts[0], key = parts[1] === '-' ? null : parts.slice(1).join('|');
  let okc = true;
  if (sub) { clickCtl(h, tab, sub); await L.settle(h, 5); }
  if (key) { okc = clickCtl(h, tab, key); await L.settle(h, 5); }
  h._missing = !okc;
  return h;
}
async function runTab(role, tab) {
  const T = TABS[tab];
  const res = { states: {}, errors: {}, clicks: {}, prints: {}, excel: {} };
  const addErr = (k, h) => { if (h.errs.length) res.errors[k] = h.errs.slice(); };

  if (tab === 'kasa') {
    for (const st of KASA_STATES) {
      const { h, s } = await kasaState(role, st);
      res.states[st] = s; addErr(st, h);
      if (st === 'pos' || st === 'pos@today' || st === 'glavna' || st === 'zoborot') {
        /* печат */
        try {
          h.opened.length = 0;
          if (st === 'zoborot') { h.w.saveZoborot = function () {}; h.w.printZoborot(); await L.sleep(700); }
          else if (st.indexOf('pos') === 0) { h.w.printKasaReport(); await L.settle(h, 8); }
          const html = h.opened.map(o => o.html).join('\n====\n').replace(/Изготвен: [^<]*/g, 'Изготвен: T');
          if (html) res.prints[st] = html;
        } catch (e) { h.errs.push('print ' + st + ': ' + e.message); }
      }
      h.close();
    }
    /* клик на представителите */
    for (const st of ['pos@today', 'glavna', 'zoborot', 'storno']) await clickReps(role, tab, st, res, async () => {
      const x = await kasaState(role, st); return x.h;
    });
    return res;
  }
  if (tab === 'history') {
    for (const type of ['all', 'transport', 'client', 'kasa', 'storno']) {
      const h = await historyState(role, type);
      res.states['type:' + type] = L.snap(h, T.cont); addErr('type:' + type, h);
      try {
        h.opened.length = 0; h.w.document.getElementById('mod-print') && (h.w.document.getElementById('mod-print').innerHTML = '');
        h.w.printHistoryReport(); await L.settle(h, 3);
        const pe = h.w.document.getElementById('mod-print');
        const html = (h.opened.map(o => o.html).join('\n') + (pe ? pe.innerHTML : '')).replace(/\d{1,2}[.:]\d{2}[.:]\d{2}/g, 'T');
        if (html) res.prints['type:' + type] = html;
      } catch (e) { h.errs.push('print: ' + e.message); }
      try { h.xl.length = 0; h.w.exportKasaToExcel(); await L.settle(h, 12); const x = excelOf(h); if (x.length) res.excel['type:' + type] = x; } catch (e) { h.errs.push('excel: ' + e.message); }
      addErr('type:' + type, h);
      h.close();
    }
    await clickReps(role, tab, 'type:all', res, async () => historyState(role, 'all'));
    return res;
  }

  /* общ случай: sweep по контролите */
  const base = L.mkEnv(repo, role, H);
  await openTab(base, tab);
  const baseSnap = await snapTab(base, tab);
  res.states['default'] = baseSnap; addErr('default', base);
  if (T.excel) { try { T.excel(base); await L.settle(base, 4); const x = excelOf(base); if (x.length) res.excel['default'] = x; } catch (e) { res.errors['excel-default'] = [e.message]; } }
  const ctlKeys = baseSnap.ctl.filter(k => k !== ':' && k.indexOf(':undefined') < 0);
  base.close();

  /* подтабове */
  const subKeys = T.sub ? ctlKeys.filter(k => k.indexOf(T.sub + ':') === 0) : [];
  const subs = subKeys.length ? subKeys : [null];
  const others = ctlKeys.filter(k => k.indexOf((T.sub || '\u0000') + ':') !== 0);
  const taken = {};
  const sweepKeys = others.filter(k => { const fn = k.split(':')[0]; if (LIMIT_VALUES[fn]) { taken[fn] = (taken[fn] || 0) + 1; return taken[fn] <= LIMIT_VALUES[fn]; } return true; });

  for (const sub of subs) {
    for (const key of [null].concat(sweepKeys)) {
      const stKey = (sub || '-') + '|' + (key || '-');
      if (stKey === '-|-') continue;
      const h = await buildState(role, tab, stKey);
      if (h._missing) { res.states[stKey] = { missing: true }; addErr(stKey, h); h.close(); continue; }
      res.states[stKey] = await snapTab(h, tab);
      if (T.excel) { try { h.xl.length = 0; T.excel(h); await L.settle(h, 4); const x = excelOf(h); if (x.length) res.excel[stKey] = x; } catch (e) { h.errs.push('excel: ' + e.message); } }
      addErr(stKey, h);
      h.close();
    }
  }
  /* печат */
  await printsFor(role, tab, res);
  if (T.cells) await cellClicks(role, tab, res);
  /* клик на представителите (от default) */
  for (const best of (REP_STATES[tab] || [])) {
    /* '-|-' е подразбиращото се състояние (в резултата то се казва 'default') */
    const sk = best === '-|-' ? 'default' : best;
    if (!res.states[sk] || !res.states[sk].actions) continue;
    await clickReps(role, tab, sk, res, async () => buildState(role, tab, best));
  }
  return res;
}

/* Чек лист: клик по първата клетка на всеки показател (въртене на стойността / число) и по 💬 → заявките и новите елементи */
async function cellClicks(role, tab, res) {
  const probe = await buildState(role, tab, '-|-');
  const mis = Array.from(new Set(Array.from(probe.doc.querySelectorAll('#checklist-table td[data-si]')).map(td => td.getAttribute('data-mi')))).sort();
  probe.close();
  for (const kind of ['cell', 'icon']) for (const mi of mis) {
    const h = await buildState(role, tab, '-|-');
    const td = h.doc.querySelector('#checklist-table td[data-si="0"][data-mi="' + mi + '"]');
    const key = 'cells::' + kind + ':' + mi;
    if (!td) { res.clicks[key] = { notfound: true }; h.close(); continue; }
    const before = new Set(Array.from(h.doc.querySelectorAll('[id]')).map(e => e.id));
    h.calls.adminUsers.length = 0; h.errs.length = 0; h.calls.post.length = 0; h.calls.patch.length = 0; h.calls.del.length = 0; h.net.length = 0; h.calls.toast.length = 0; h.calls.confirm.length = 0;
    try { const tgt = kind === 'icon' ? td.querySelector('.cl-cmt') : td; tgt.dispatchEvent(new h.w.MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) { h.errs.push('click: ' + e.message); }
    await L.settle(h, 8);
    res.clicks[key] = {
      sig: key, state: '-|-', post: h.calls.post.map(r => ({ t: r.table, u: r.url.replace(/^.*\/rest\/v1\//, ''), b: r.body })),
      patch: h.calls.patch.map(r => ({ t: r.table, u: r.url.replace(/^.*\/rest\/v1\//, ''), b: r.body })),
      del: h.calls.del.map(u => u.replace(/^.*\/rest\/v1\//, '')), adm: [], net: h.net.slice(), toast: h.calls.toast.map(norm), confirm: h.calls.confirm.map(norm),
      newIds: Array.from(h.doc.querySelectorAll('[id]')).map(e => e.id).filter(i => !before.has(i)).sort(), errs: h.errs.slice()
    };
    h.close();
  }
}

async function printsFor(role, tab, res) {
  const h = L.mkEnv(repo, role, H);
  await openTab(h, tab);
  const take = (arr, n) => (arr || []).map(x => String(x.id)).sort().slice(0, n);
  const clear = () => { const p = h.doc.getElementById('mod-print'); if (p) p.innerHTML = ''; };
  const mp = () => (h.doc.getElementById('mod-print') || {}).innerHTML || '';
  try {
    if (tab === 'client') for (const id of take(h.w.clientOrders, 6)) { clear(); h.w.loadPrint(id); res.prints['client:' + id] = mp(); }
    if (tab === 'transport') for (const id of take(h.w.transportOrders, 6)) { clear(); h.w.loadTransportPrint(id); res.prints['transport:' + id] = mp(); }
    if (tab === 'diff') for (const id of take(h.w.diffReports, 6)) { clear(); h.w.loadDiffPrint(id); res.prints['diff:' + id] = mp(); }
  } catch (e) { h.errs.push('print: ' + e.message); }
  if (h.errs.length) res.errors['prints'] = h.errs.slice();
  h.close();
}

/* представители на действията (по функция) — клик, записват се заявките към базата */
async function clickReps(role, tab, stateKey, res, mk) {
  const st = res.states[stateKey]; if (!st || !st.actions) return;
  const byFn = {};
  st.actions.forEach(a => { const fn = L.fnOf(a); if (!byFn[fn]) byFn[fn] = a; });
  const fns = Object.keys(byFn).sort().slice(0, 60);
  for (const fn of fns) {
    const sig = byFn[fn];
    const h = await mk();
    const before = new Set(Array.from(h.doc.querySelectorAll('[id]')).map(e => e.id));
    let el = null;
    const find = () => { for (const id of TABS[tab].cont) { const root = h.doc.getElementById(id); if (!root) continue; for (const e of Array.from(root.querySelectorAll('[onclick],[onchange],[oninput]'))) { const on = ((e.getAttribute('onclick') || e.getAttribute('onchange') || e.getAttribute('oninput')) + '').replace(/\s+/g, ' ').trim(); if (on + ' |' + L.dsig(e) === sig) return e; } } return null; };
    el = find();
    if (!el && TABS[tab].views && typeof h.w.setSDView === 'function') { h.w.setSDView(h.w.sdView === 'rows' ? 'reports' : 'rows'); await L.settle(h, 3); el = find(); }
    const key = stateKey + '::' + fn;
    if (!el) { res.clicks[key] = { notfound: true }; h.close(); continue; }
    h.calls.adminUsers.length = 0; h.errs.length = 0; h.calls.post.length = 0; h.calls.patch.length = 0; h.calls.del.length = 0; h.net.length = 0; h.calls.toast.length = 0; h.calls.confirm.length = 0;
    try {
      const attr = el.getAttribute('onclick') ? 'onclick' : el.getAttribute('onchange') ? 'onchange' : 'oninput';
      if (attr === 'onclick') H.realClick(h.w, el); else H.fire(h.w, el, attr.slice(2));
    } catch (e) { h.errs.push('click: ' + e.message); }
    await L.settle(h, 8); await L.sleep(30);
    const after = Array.from(h.doc.querySelectorAll('[id]')).map(e => e.id).filter(i => !before.has(i)).sort();
    res.clicks[key] = {
      sig, state: stateKey,
      post: h.calls.post.map(r => ({ t: r.table, u: r.url.replace(/^.*\/rest\/v1\//, ''), b: r.body })),
      patch: h.calls.patch.map(r => ({ t: r.table, u: r.url.replace(/^.*\/rest\/v1\//, ''), b: r.body })),
      del: h.calls.del.map(u => u.replace(/^.*\/rest\/v1\//, '')),
      adm: h.calls.adminUsers.slice(), net: h.net.slice(), toast: h.calls.toast.map(norm), confirm: h.calls.confirm.map(norm), newIds: after, errs: h.errs.slice()
    };
    h.close();
  }
}

(async () => {
  const out = {};
  const roles = rolesArg || Object.keys(L.ROLES);
  const tabs = tabsArg || Object.keys(TABS);
  for (const role of roles) {
    out[role] = {};
    for (const tab of tabs) {
      const t0 = Date.now();
      try { out[role][tab] = await runTab(role, tab); }
      catch (e) { out[role][tab] = { fatal: e.message + ' | ' + String(e.stack).split('\n')[1] }; }
      console.log(role, tab, Object.keys((out[role][tab] || {}).states || {}).length, 'състояния', Date.now() - t0, 'ms');
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log('записано', outFile);
  process.exit(0);
})();
