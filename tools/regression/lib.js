/* Регресионна проверка стара/нова версия — ядро. Не се комитва. */
'use strict';
const fs = require('fs'), path = require('path');
/* Снимката на данните е ИЗВЪН репото (има имена и телефони на клиенти) — REG_DATA или <tmpdir>/regdata */
const DATA_DIR = process.env.REG_DATA || path.join(require('os').tmpdir(), 'regdata');

const ALL_MODULES = ['transport.js', 'pallets.js', 'supply.js', 'client-orders.js', 'docs.js', 'bulletin.js', 'today.js', 'checklist.js', 'kasa.js', 'kasa-docs.js',
  'daily-turnover.js', 'admin.js', 'history.js', 'contacts.js', 'transit.js', 'calendar.js', 'stock-returns.js', 'stock-differences.js', 'push.js', 'email.js',
  'report.js', 'loading.js', 'transfers.js', 'notifications.js', 'reference.js', 'handbook.js'];

const ROLES = {
  admin: { role: 'admin', store_name: 'Централен офис', display_name: 'Админ', email: 'a@temax.bg', assigned_stores: [] },
  accounting: { role: 'accounting', store_name: 'Централен офис', display_name: 'Цветелина Тенева', email: 'c.teneva@temax.bg', assigned_stores: [] },
  logistics: { role: 'logistics', store_name: 'Централен офис', display_name: 'Логистика', email: 'l@temax.bg', assigned_stores: [] },
  warehouse: { role: 'logistics', store_name: 'Логистичен склад Добрич', display_name: 'Склад Добрич', email: 'w@temax.bg', assigned_stores: [] },
  manager: { role: 'manager', store_name: 'Троян', display_name: 'Управител Троян', email: 'm@temax.bg', assigned_stores: [] },
  kasa: { role: 'kasa', store_name: 'Троян', display_name: 'Каса Троян', email: 'k@temax.bg', assigned_stores: [] },
  supply: { role: 'supply', store_name: 'Централен офис', display_name: 'Доставки', email: 's@temax.bg', assigned_stores: [] },
  info: { role: 'info', store_name: 'Централен офис', display_name: 'Инфо', email: 'i@temax.bg', assigned_stores: [] }
};

/* Замразеният „сега“. Сложи деня на снимката на данните (REG_NOW=ГГГГ-ММ-ДДT10:00:00), иначе „днес/вчера“ не съвпада с данните. */
const NOW_ISO = process.env.REG_NOW || '2026-10-06T10:00:00';
function isoShift(days) { const d = new Date(NOW_ISO); d.setDate(d.getDate() + days); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
let _data = null;
function loadData() {
  if (_data) return _data;
  _data = {};
  fs.readdirSync(DATA_DIR).forEach(f => { if (/\.json$/.test(f)) _data[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); });
  return _data;
}

/* Малък PostgREST емулатор: eq/neq/gt/gte/lt/lte/in/is/ilike; select/order/or/and се игнорират; limit се спазва. */
function applyQuery(rows, url) {
  const qi = url.indexOf('?');
  if (qi < 0) return rows;
  const params = qi >= 0 ? url.slice(qi + 1).split('&') : [];
  let out = rows, limit = null;
  params.forEach(p => {
    const eq = p.indexOf('=');
    if (eq < 0) return;
    const k = decodeURIComponent(p.slice(0, eq)), v = decodeURIComponent(p.slice(eq + 1));
    if (['select', 'order', 'or', 'and', 'offset'].indexOf(k) >= 0) return;
    if (k === 'limit') { limit = parseInt(v, 10); return; }
    const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|in|is|ilike|like)\.(.*)$/.exec(v);
    if (!m) return;
    const neg = !!m[1], op = m[2], val = m[3];
    out = out.filter(r => {
      const x = r[k];
      let res;
      if (op === 'eq') res = String(x) === val;
      else if (op === 'neq') res = String(x) !== val;
      else if (op === 'gt') res = String(x) > val;
      else if (op === 'gte') res = String(x) >= val;
      else if (op === 'lt') res = String(x) < val;
      else if (op === 'lte') res = String(x) <= val;
      else if (op === 'in') res = val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).indexOf(String(x)) >= 0;
      else if (op === 'is') res = val === 'null' ? (x === null || x === undefined) : String(x) === val;
      else { const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'); res = re.test(String(x == null ? '' : x)); }
      return neg ? !res : res;
    });
  });
  if (limit != null) out = out.slice(0, limit);
  return out;
}
function dataFor() {
  const d = loadData(), out = {};
  Object.keys(d).forEach(t => { out[t] = url => applyQuery(d[t], url); });
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let CUR_ERRS = null;
process.on('unhandledRejection', e => { if (CUR_ERRS) CUR_ERRS.push('unhandledRejection: ' + String(e && e.message || e).slice(0, 200)); });
process.on('uncaughtException', e => { if (CUR_ERRS) CUR_ERRS.push('uncaught: ' + String(e && e.message || e).slice(0, 200)); });

function freeze(w) {
  const Real = w.Date, ms = new Real(NOW_ISO).getTime();
  w.Date = class extends Real { constructor(...a) { if (!a.length) super(ms); else super(...a); } static now() { return ms; } };
}

function mkEnv(repo, role, H) {
  const errs = [];
  CUR_ERRS = errs;
  const h = H.boot({ repo, modules: ALL_MODULES, user: JSON.parse(JSON.stringify(ROLES[role])), data: dataFor(), confirm: true });
  freeze(h.w);
  h.errs = errs; h._H = H;
  h.w.console.error = function () { errs.push('console.error: ' + Array.prototype.map.call(arguments, a => (a && a.message) || String(a)).join(' ').slice(0, 200)); };
  h.w.addEventListener('error', e => errs.push('window.error: ' + String(e.message).slice(0, 200)));
  /* Excel */
  h.xl = [];
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: aoa => ({ __aoa: aoa }),
      json_to_sheet: j => ({ __json: j }),
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); wb.Sheets[n] = ws; },
      encode_cell: c => 'R' + c.r + 'C' + c.c, encode_range: r => 'range', decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } })
    },
    writeFile: (wb, fname) => { h.xl.push({ fname, sheets: wb.SheetNames.map(n => ({ n, d: wb.Sheets[n].__aoa || wb.Sheets[n].__json || null })) }); }
  };
  /* Печат в нов прозорец */
  h.w.requestAnimationFrame = cb => setTimeout(() => cb(0), 0); h.w.cancelAnimationFrame = id => clearTimeout(id);
  h.opened = [];
  h.w.open = function () { const rec = { html: '' }; h.opened.push(rec); return { document: { write: s => { rec.html += s; }, close() {} }, focus() {}, print() {} }; };
  /* Мрежа към едж функции и друго извън /rest/v1 */
  h.net = [];
  const f1 = h.w.fetch;
  /* Част от модулите (Стока на път) четат r.headers.get('content-range') — harness-ът няма headers */
  h.w.fetch = function (url, init) {
    return f1.apply(this, arguments).then(r => r.json().then(b => { const n = Array.isArray(b) ? b.length : 0; r.headers = { get: nm => /content-range/i.test(nm) ? ('0-' + Math.max(0, n - 1) + '/' + n) : null }; return r; }, () => { r.headers = { get: () => null }; return r; }));
  };
  const f0 = h.w.fetch;
  h.w.fetch = function (url, init) {
    if (String(url).indexOf('/rest/v1/') < 0 && ((init && init.method) || 'GET').toUpperCase() !== 'GET') {
      let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = init && init.body; }
      h.net.push({ url: String(url).replace(/^.*\/functions\/v1\//, 'fn:'), body: b });
    }
    return f0.apply(this, arguments);
  };
  return h;
}
async function settle(h, n) { for (let i = 0; i < (n || 6); i++) { await h._H.ticks(); await sleep(8); } }

/* ── Снимка на действията ── */
const CONTROL_FN = /^(transitDir|transitFilter|filterOrders|filterTransport|setTFilter|setTStore|setTSearch|setTDir|setSRFilter|setSRTab|setSRStoreFilter|setSRSupplierFilter|setSRSearch|setSDFilter|setSDTypeFilter|setSDDirTab|setSDStoreFilter|setSDView|setSDSearch|setHistSubtab|kasaTab|kasaShiftDay|kasaPickDay|toggleSapBanner|coToggleSap\w*)$/;
function fnOf(on) { const a = /^\s*(transitDir|transitFilter)\s*=/.exec(on); if (a) return a[1]; const m = /^\s*(?:event\.stopPropagation\(\);\s*)?(?:if\([^)]*\)\s*)?([A-Za-z_$][\w$.]*)\(/.exec(on); return m ? m[1] : on.slice(0, 24); }
function dsig(el) {
  const parts = [];
  for (const a of Array.from(el.attributes)) if (/^data-/.test(a.name) && !/^data-(co-f|tr-f|sr-f|sd-view|f|store)$/.test(a.name)) parts.push(a.name + '=' + a.value);
  return parts.sort().join(';');
}
function ctlKey(el) {
  const on = (el.getAttribute('onclick') || '').replace(/\s+/g, ' ');
  const fn = fnOf(on);
  let v;
  const asg = /^\s*(?:transitDir|transitFilter)\s*=\s*'([^']*)'/.exec(on);
  if (asg) v = asg[1];
  else if (/this\.dataset\.(\w+)/.test(on)) { const k = /this\.dataset\.(\w+)/.exec(on)[1]; v = el.dataset[k]; }
  else { const m = /\(\s*'([^']*)'/.exec(on) || /\(\s*"([^"]*)"/.exec(on); v = m ? m[1] : on; }
  return fn + ':' + v;
}
function snap(h, containerIds) {
  const actions = [], ctl = [], rows = {};
  containerIds.forEach(id => {
    const root = h.doc.getElementById(id);
    if (!root) return;
    root.querySelectorAll('[onclick],[onchange],[oninput]').forEach(el => {
      const on = ((el.getAttribute('onclick') || el.getAttribute('onchange') || el.getAttribute('oninput')) + '').replace(/\s+/g, ' ').trim();
      const fn = fnOf(on);
      if (CONTROL_FN.test(fn)) { ctl.push(ctlKey(el)); return; }
      actions.push(on + ' |' + dsig(el));
    });
    rows[id] = root.querySelectorAll('tbody tr').length;
  });
  actions.sort();
  return { actions, ctl: Array.from(new Set(ctl)).sort(), rows };
}
/* Намира контрол по ключ и го кликва с realClick */
function findCtl(h, containerIds, key) {
  for (const id of containerIds) {
    const root = h.doc.getElementById(id); if (!root) continue;
    for (const el of Array.from(root.querySelectorAll('[onclick]'))) {
      const on = (el.getAttribute('onclick') || '');
      if (CONTROL_FN.test(fnOf(on)) && ctlKey(el) === key) return el;
    }
  }
  return null;
}
module.exports = { isoShift, ROLES, mkEnv, settle, snap, findCtl, ctlKey, fnOf, CONTROL_FN, dsig, sleep, loadData, NOW_ISO, ALL_MODULES };
