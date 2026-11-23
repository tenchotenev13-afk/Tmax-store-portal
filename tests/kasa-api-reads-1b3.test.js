/* Каса през kasa-api — етап 1б-3 (23.11.2026, сесия kasa-api-etap1b3).

   Проектът: claude/kasa-api-dizajn.md (т.1, „Решено 19.11“ в т.7). При
   app_settings.kasa_api_stores четенията R18–R22 (history.js), R23–R25
   (daily-turnover.js) и R26–R27 (report.js) минават през kasa-api; иначе —
   непроменените стари заявки. Тук: ЕДНИ И СЪЩИ fixtures по двата пътя и
   сравнение на това, което човек вижда — екранът, листовете на Excel-а,
   обектът, от който се строи писмото.

   Фалшивият REST филтрира и подрежда като PostgREST (eq / gte / lte / lt /
   in, order по няколко колони, NULL последен при asc), а фалшивият
   kasa-api — като функцията: обхват по resolveScope, редът на KINDS (НЕ
   този на старите заявки — за да се види, че клиентът пренарежда), таван
   400 дни през повече от един обект.

   Покрива:
     1. История — търсене (R18–R20): същият екран; обект от менюто / целият
        обхват / ключ само за част от обектите → правилният път; accounting
        с assigned; периодът над 400 дни → видима грешка.
     2. История — „👁 Преглед“ (R22) през doc_url, без anon ключ.
     3. История — Excel (R21): същите листове по двата пътя; грешка → файл
        няма, toast с причината.
     4. Вечерен оборот (R23–R25): обектът — същият изглед, само днес
        (oborot-no-history), 30 дни за средното през kasa-api; ЦО — същата
        справка; accounting с assigned в ЦО → стария път (старото четене е
        по цялата верига); грешка → съобщение, не празна форма; корекция с
        нова дата → проверката през kasa-api, заета дата / грешка → без PATCH.
     5. Отчети (R26–R27): дневната касова секция и седмичната кросмодулна —
        същият резултат; controlling / регионален accounting / admin при
        частичен ключ; грешка → toast + „Непълни данни“ за сторното.
     6. Интеграция: kasa.js + kasa-docs.js + daily-turnover.js + history.js +
        report.js + notifications.js заедно, в реда от index.html — общите
        storno помощници (STORNO_SELECT, stornoIndexItems, stornoIndicator).

   Чакане: until(условие, срок) — никога по брой тикове (урокът от 20.11).
   Мутационна проверка: claude/log/2026-11-23-kasa-api-etap1b3.md.

   Пускане:  node tests/kasa-api-reads-1b3.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, dayOffset } = H;

const KR = 'Кърджали', RD = 'Раднево', TR = 'Троян';
const U = {
  admin: { id: 'u-ad', email: 'ad@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  acc: { id: 'u-ac', email: 'ac@temax.bg', display_name: 'Счетоводител', role: 'accounting', store_name: 'Централен офис' },
  accKR: { id: 'u-ak', email: 'ak@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', assigned_stores: [KR], is_regional: true },
  ctrl: { id: 'u-ct', email: 'ct@temax.bg', display_name: 'Контролинг', role: 'controlling', store_name: 'Централен офис' },
  mgrKR: { id: 'u-kr', email: 'kr@temax.bg', display_name: 'Мениджър КР', role: 'manager', store_name: KR }
};

const D1 = dayOffset(-1), D2 = dayOffset(-2), D5 = dayOffset(-5), D20 = dayOffset(-20);
const ID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
function rep(n, store, date, pos, status, extra) {
  return Object.assign({ id: ID(n), store_name: store, date: date, pos_number: pos, cashier_name: 'Касиер ' + n,
    status: status, cash_turnover: 100 + n, counted_cash: 100 + n, razlika: n % 3 === 0 ? -1.5 * n : 0,
    return_reason: null, returned_by: null, returned_at: null, ready_at: null,
    bills_100: n, bills_50: 2 * n, coins_1: 3, created_at: date + 'T08:0' + (n % 10) + ':00Z' }, extra || {});
}
/* ids нарочно в обратен ред на pos_number: старият ред (date.desc,id.desc)
   и този на kasa-api (date.desc,pos_number.asc,id.desc) се различават. */
const F = {
  kasa_reports: [
    rep(9, KR, D1, 1, 'confirmed'), rep(8, KR, D1, 2, 'draft'), rep(7, KR, D1, 3, 'confirmed', { razlika: -12 }),
    rep(6, RD, D1, 1, 'confirmed', { razlika: 7.5 }), rep(5, TR, D1, 1, 'confirmed'),
    rep(4, KR, D2, 1, 'returned', { return_reason: 'Липсва Z', returned_by: 'Счетоводство', returned_at: D1 + 'T09:00:00Z' }),
    rep(3, RD, D5, 1, 'confirmed'),
    rep(2, TR, D20, 1, 'returned', { return_reason: 'Стара', returned_by: 'Счетоводство', returned_at: D20 + 'T09:00:00Z' })
  ],
  kasa_glavna: [
    { id: ID(21), store_name: KR, date: D1, status: 'confirmed', counted_cash: 50, slujebno: 0, sap_balance: 50, created_at: D1 + 'T18:00:00Z' },
    { id: ID(22), store_name: RD, date: D1, status: 'draft', counted_cash: 70, slujebno: 5, sap_balance: 60, created_at: D1 + 'T18:00:00Z' }
  ],
  kasa_zoborot: [
    { id: ID(31), store_name: KR, date: D1, status: 'confirmed', razlika: -3, created_at: D1 + 'T19:00:00Z' },
    { id: ID(32), store_name: RD, date: D1, status: 'draft', razlika: 0, created_at: D1 + 'T19:30:00Z' },
    { id: ID(33), store_name: KR, date: D2, status: 'returned', razlika: 4, return_reason: 'Равнение', returned_at: D1 + 'T09:00:00Z', created_at: D2 + 'T19:00:00Z' },
    { id: ID(34), store_name: TR, date: D20, status: 'returned', razlika: 1, return_reason: 'Стара', returned_at: D20 + 'T10:00:00Z', created_at: D20 + 'T19:00:00Z' }
  ],
  kasa_documents: [
    { id: ID(41), store_name: KR, date: D1, report_type: 'pos', doc_type: 'z_report', file_name: 'z1.pdf', file_url: '_______/' + D1 + '/z1.pdf', uploaded_by: 'Касиер', created_at: D1 + 'T10:00:00Z' },
    { id: ID(42), store_name: RD, date: D1, report_type: 'glavna', doc_type: 'other', file_name: 'g.jpg', file_url: '_______/' + D1 + '/g.jpg', uploaded_by: 'Касиер', created_at: D1 + 'T11:00:00Z' },
    { id: ID(43), store_name: TR, date: D2, report_type: 'zoborot', doc_type: 'other', file_name: 't.pdf', file_url: '_____/' + D2 + '/t.pdf', uploaded_by: 'Касиер', created_at: D2 + 'T11:00:00Z' }
  ],
  kasa_storno: [
    { id: ID(51), store_name: KR, storno_date: D1, returned_sum: 100, new_sum: 80, articles: '123456', status: 'draft', reason: 'Замяна', store_comment: null, created_at: D1 + 'T12:00:00Z',
      kasa_storno_items: [{ kind: 'returned', sap_code: '123456', article_name: 'Лампа', line_no: 1 }, { kind: 'new', sap_code: '123456', article_name: 'Лампа', line_no: 1 }] },
    { id: ID(52), store_name: RD, storno_date: D1, returned_sum: 50, new_sum: 50, articles: '234567', status: 'confirmed', reason: 'Грешка', store_comment: null, created_at: D1 + 'T13:00:00Z',
      kasa_storno_items: [{ kind: 'returned', sap_code: '234567', article_name: 'Стол', line_no: 1 }] },
    { id: ID(53), store_name: TR, storno_date: D2, returned_sum: 70, new_sum: 10, articles: '345678', status: 'returned', reason: 'Друго', store_comment: 'обяснение', created_at: D2 + 'T12:00:00Z',
      kasa_storno_items: [] },
    { id: ID(54), store_name: KR, storno_date: D2, returned_sum: 30, new_sum: 0, articles: '456789', status: 'draft', reason: 'Връщане', store_comment: null, created_at: D1 + 'T08:00:00Z',
      kasa_storno_items: [] }
  ],
  daily_turnover: [
    { id: ID(61), store_name: KR, date: dayOffset(0), total_turnover: 4321.09, cash_turnover: 3000.09, card_turnover: 1321, bank_turnover: 0, customers: 77, note: 'днешна-бележка', created_by: 'Мениджър КР', created_at: dayOffset(0) + 'T17:00:00Z' },
    { id: ID(62), store_name: KR, date: D1, total_turnover: 101.11, cash_turnover: 61.17, card_turnover: 39.94, bank_turnover: 0, customers: 10, note: 'минала-бележка', created_by: 'Мениджър КР', created_at: D1 + 'T17:00:00Z' },
    { id: ID(63), store_name: KR, date: D5, total_turnover: 105.55, cash_turnover: 65.57, card_turnover: 39.98, bank_turnover: 0, customers: 11, note: null, created_by: 'Мениджър КР', created_at: D5 + 'T17:00:00Z' },
    { id: ID(64), store_name: RD, date: dayOffset(0), total_turnover: 777.77, cash_turnover: 500, card_turnover: 277.77, bank_turnover: 0, customers: 30, note: null, created_by: 'Мениджър РД', created_at: dayOffset(0) + 'T17:30:00Z' },
    { id: ID(65), store_name: TR, date: dayOffset(0), total_turnover: 333.33, cash_turnover: 300, card_turnover: 33.33, bank_turnover: 0, customers: 5, note: null, created_by: 'Мениджър ТР', created_at: dayOffset(0) + 'T18:00:00Z' },
    { id: ID(66), store_name: KR, date: dayOffset(-40), total_turnover: 999.99, cash_turnover: 999.99, card_turnover: 0, bank_turnover: 0, customers: 1, note: null, created_by: 'Мениджър КР', created_at: dayOffset(-40) + 'T17:00:00Z' }
  ]
};
const PAST_OBOROT = ['101.11', '105.55', '61.17', '65.57', 'минала-бележка', '999.99'];

/* ── Сравнение като PostgREST ── */
function cmpBy(spec) {
  const keys = spec.map(s => { const p = s.split('.'); return { col: p[0], desc: p[1] === 'desc' }; });
  return (a, b) => {
    for (const k of keys) {
      const va = a[k.col], vb = b[k.col];
      if (va == null || vb == null) { if (va == null && vb == null) continue; return (va == null ? 1 : -1) * (k.desc ? -1 : 1); }
      if (String(va) !== String(vb)) return (String(va) < String(vb) ? -1 : 1) * (k.desc ? -1 : 1);
    }
    return 0;
  };
}
function rest(rows) {
  return function (url) {
    const q = decodeURIComponent(String(url).split('?')[1] || '');
    let out = rows.slice();
    let order = null;
    q.split('&').forEach(p => {
      if (/^order=/.test(p)) { order = p.slice(6).split(','); return; }
      const m = /^([a-z_0-9]+)=(eq|gte|lte|lt|in)\.(.*)$/.exec(p);
      if (!m || m[1] === 'select' || m[1] === 'limit' || m[1] === 'offset') return;
      const k = m[1], op = m[2], v = m[3];
      out = out.filter(r => {
        const x = r[k] == null ? 'null' : String(r[k]);
        if (op === 'eq') return x === v;
        if (op === 'gte') return x >= v;
        if (op === 'lte') return x <= v;
        if (op === 'lt') return x < v;
        return v.replace(/^\(|\)$/g, '').split(',').indexOf(x) >= 0;
      });
    });
    if (/(?:^|&)offset=[1-9]/.test(q)) return [];
    if (order) out.sort(cmpBy(order));
    return out.map(r => JSON.parse(JSON.stringify(r)));
  };
}

/* ── Фалшив kasa-api — филтрира и подрежда като handler.ts ── */
const KINDS = {
  reports: { t: 'kasa_reports', d: 'date', o: ['date.desc', 'pos_number.asc', 'id.desc'] },
  glavna: { t: 'kasa_glavna', d: 'date', o: ['date.desc', 'id.desc'] },
  zoborot: { t: 'kasa_zoborot', d: 'date', o: ['date.desc', 'created_at.desc', 'id.desc'] },
  documents: { t: 'kasa_documents', d: 'date', o: ['date.desc', 'store_name.asc', 'created_at.desc', 'id.desc'] },
  storno: { t: 'kasa_storno', d: 'storno_date', o: ['storno_date.desc', 'created_at.desc', 'id.desc'] },
  oborot: { t: 'daily_turnover', d: 'date', o: ['date.desc', 'store_name.asc', 'id.desc'] }
};
function scopeOf(u) {
  const a = Array.isArray(u.assigned_stores) ? u.assigned_stores : [];
  if (u.role === 'admin') return { stores: 'all', report: 'all', acts: ['day', 'range', 'storno_items', 'banner', 'report_rows', 'doc_url'] };
  if (u.role === 'accounting') { const s = a.length ? a : 'all'; return { stores: s, report: s, acts: ['day', 'range', 'storno_items', 'banner', 'report_rows', 'doc_url'] }; }
  if (u.role === 'controlling') return { stores: [u.store_name], report: 'all', acts: ['report_rows', 'banner'] };
  if (u.role === 'kasa' || u.role === 'manager') return { stores: [u.store_name], report: [u.store_name], acts: ['day', 'range', 'storno_items', 'banner', 'doc_url'] };
  return { stores: [u.store_name], report: [u.store_name], acts: ['banner'] };
}
const inS = (s, v) => s === 'all' || s.indexOf(v) >= 0;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const err = (status, reason, message) => ({ status: status, body: { ok: false, reason: reason, message: message } });
function apiReply(body, user) {
  const sc = scopeOf(user);
  if (sc.acts.indexOf(body.action) < 0) return err(403, 'forbidden', 'Нямате достъп до касовите данни.');
  const copy = r => JSON.parse(JSON.stringify(r));
  if (body.action === 'range') {
    let st = sc.stores;
    if (body.store) { if (!inS(sc.stores, body.store)) return err(403, 'forbidden_store', 'Нямате достъп до касата на този обект.'); st = [body.store]; }
    if ((st === 'all' || st.length > 1) && days(body.from, body.to) > 400) return err(400, 'range_too_long', 'Периодът е над 400 дни — избери по-къс или един обект.');
    const out = {};
    for (const k of body.kinds) {
      const d = KINDS[k];
      if (body.cols && !(k === 'reports' && body.cols === 'denoms')) return err(400, 'bad_request', 'Невалиден избор на колони.');
      out[k] = { rows: F[d.t].filter(r => inS(st, r.store_name) && r[d.d] >= body.from && r[d.d] <= body.to).sort(cmpBy(d.o)).map(copy), partial: false };
    }
    return { status: 200, body: { ok: true, from: body.from, to: body.to, kinds: out } };
  }
  if (body.action === 'doc_url') {
    const r = F.kasa_documents.find(x => x.id === body.document_id && inS(sc.stores, x.store_name));
    if (!r) return err(404, 'not_found', 'Няма такъв документ във вашия обхват.');
    return { status: 200, body: { ok: true, url: 'https://signed.example/' + r.id, expires_in: 300, file_name: r.file_name } };
  }
  if (body.action === 'report_rows') {
    const st = sc.report;
    const pick = (t, f, cols) => F[t].filter(r => inS(st, r.store_name) && f(r)).map(r => { const o = {}; cols.forEach(c => { o[c] = r[c] === undefined ? null : r[c]; }); return o; });
    if (body.kind === 'daily_kasa') {
      const retZ = pick('kasa_zoborot', r => r.status === 'returned', ['store_name', 'date', 'razlika', 'status', 'return_reason', 'returned_at']);
      const dates = Array.from(new Set(retZ.map(r => r.date)));
      return { status: 200, body: { ok: true, kind: 'daily_kasa', day: body.day,
        returned_reports: pick('kasa_reports', r => r.status === 'returned', ['store_name', 'date', 'pos_number', 'razlika', 'status', 'return_reason', 'returned_at']),
        returned_zoborot: retZ,
        fix_reports: pick('kasa_reports', r => dates.indexOf(r.date) >= 0, ['store_name', 'date', 'status']),
        day_reports: pick('kasa_reports', r => r.date === body.day, ['store_name', 'date', 'pos_number', 'razlika', 'status']),
        day_zoborot: pick('kasa_zoborot', r => r.date === body.day, ['store_name', 'date', 'razlika', 'status']) } };
    }
    if (body.kind === 'cross_kasa') {
      return { status: 200, body: { ok: true, kind: 'cross_kasa',
        storno: pick('kasa_storno', r => r.created_at >= body.from_stamp && (!body.to_stamp || r.created_at < body.to_stamp), ['store_name', 'status']),
        zoborot: pick('kasa_zoborot', r => r.date >= body.from_iso && (!body.to_iso || r.date <= body.to_iso), ['store_name', 'status']),
        storno_week: body.to_iso ? pick('kasa_storno', r => r.storno_date >= body.from_iso && r.storno_date <= body.to_iso,
          ['store_name', 'storno_date', 'returned_sum', 'new_sum', 'articles', 'reason', 'store_comment', 'status']) : [] } };
    }
    return err(400, 'bad_request', 'Невалиден вид отчет (kind).');
  }
  return err(400, 'bad_action', 'Непознато действие.');
}

const MODULES = ['transport.js', 'client-orders.js', 'bulletin.js', 'today.js', 'kasa.js', 'kasa-docs.js', 'daily-turnover.js',
  'history.js', 'report.js', 'notifications.js'];
/* settings: undefined → няма ключ; иначе стойността на kasa_api_stores. */
function env(user, settings) {
  const data = { app_settings: settings === undefined ? [] : [{ key: 'kasa_api_stores', value: settings }],
    stores: [{ name: KR }, { name: RD }, { name: TR }, { name: 'Централен офис' }],
    users: [{ store_name: KR }, { store_name: RD }, { store_name: TR }, { store_name: 'Централен офис' }],
    transport_orders: [], client_orders: [], loading_lists: [], loading_list_items: [], transfers: [], transfer_cargo: [] };
  Object.keys(F).forEach(t => { data[t] = rest(F[t]); });
  const h = boot({ modules: MODULES, user: Object.assign({}, user), data: data, confirm: true });
  const w = h.w;
  w.currentSession = 'sess-ok';
  w.transportOrders = []; w.clientOrders = [];
  const api = { calls: [], fail: null, opened: [], files: [] };
  const orig = w.fetch;
  const res = o => ({ ok: o.status < 400, status: o.status, json: () => Promise.resolve(o.body), text: () => Promise.resolve(JSON.stringify(o.body)) });
  w.fetch = function (url, init) {
    if (String(url).indexOf('/functions/v1/kasa-api') >= 0) {
      const body = JSON.parse(init.body);
      api.calls.push(body);
      if (api.fail) return Promise.resolve(res(api.fail));
      return Promise.resolve(res(apiReply(body, w.currentUser)));
    }
    return orig.apply(this, arguments);
  };
  w.open = function () { const tab = { location: { href: '' }, closed: false, close() { this.closed = true; } }; api.opened.push({ args: [].slice.call(arguments), tab: tab }); return tab; };
  /* SheetJS: листовете се записват като масиви — сравнението е по съдържание. */
  w.XLSX = { utils: { book_new: () => ({ sheets: [] }), aoa_to_sheet: a => ({ aoa: JSON.parse(JSON.stringify(a)) }),
    book_append_sheet: (wb, ws, name) => { wb.sheets.push({ name: name, aoa: ws.aoa, cols: ws['!cols'] || null }); } },
    writeFile: (wb, f) => { api.files.push({ name: f, sheets: wb.sheets }); } };
  h.api = api;
  return h;
}
async function until(cond, ms) {
  const end = Date.now() + (ms || 5000);
  while (Date.now() < end) { try { if (cond()) return true; } catch (e) {} await new Promise(r => setTimeout(r, 20)); }
  try { return !!cond(); } catch (e) { return false; }
}
const restGets = (h, t) => h.calls.get.filter(u => u.indexOf('/rest/v1/' + t + '?') >= 0 || u.endsWith('/rest/v1/' + t));
const apiActs = (h, a) => h.api.calls.filter(c => c.action === a);
const normDocs = s => s.replace(/<button data-(?:id|path)="[^"]*" onclick="(?:histPreviewDocById\(this\.dataset\.id\)|previewKasaDoc\(this\.dataset\.path\))"/g, '<button DOC');
/* startApp не тече в harness-а — ключът се чете при първото kasaApiReady(), както в портала при вход. */
const ready = h => h.w.kasaApiReady();

/* История: отваря таба, попълва формата и търси; връща екрана, когато е готов. */
async function histSearch(user, settings, f, opts) {
  opts = opts || {};
  const h = env(user, settings);
  await ready(h);
  h.w.loadHistory();
  await until(() => !!h.doc.getElementById('h-from'));
  h.doc.getElementById('h-from').value = f.from;
  h.doc.getElementById('h-to').value = f.to;
  const sel = h.doc.getElementById('h-store');
  if (f.store) { await until(() => sel.options.length > 1); sel.value = f.store; }
  h.doc.getElementById('h-type').value = f.type || 'all';
  if (opts.fail) h.api.fail = opts.fail;
  const btnEl = Array.prototype.find.call(h.doc.querySelectorAll('button'), b => /runHistorySearch/.test(b.getAttribute('onclick') || ''));
  if (btnEl) realClick(h.w, btnEl); else h.w.runHistorySearch();
  const out = () => h.doc.getElementById('h-results');
  const want = opts.wait || (() => { const o = out(); return o && !/Зареждане/.test(o.textContent) && (/Прикачени документи/.test(o.innerHTML) || /Грешка|не се заредиха/.test(o.innerHTML) || opts.noDocs); });
  await until(want);
  await until(() => false, opts.extra || 80);  /* закъснели добавки (секцията с документите) — краен срок, не условие */
  h.out = out() ? out().innerHTML : '';
  return h;
}

(async function main() {
  /* ─────────────────────────────────────────────────────────── */
  section('1. История — търсене (R18–R20): същият екран по двата пътя');
  {
    const F1 = { from: D20, to: D1, type: 'all' };
    const a = await histSearch(U.admin, undefined, F1);
    const b = await histSearch(U.admin, 'all', F1);
    ok('стар път: kasa_reports, kasa_storno, kasa_documents по REST; 0 заявки към kasa-api за търсенето',
      restGets(a, 'kasa_reports').length >= 1 && restGets(a, 'kasa_storno').length >= 1 && restGets(a, 'kasa_documents').length >= 1 &&
      !a.api.calls.some(c => c.action === 'range' && c.from === D20));
    const rngB = apiActs(b, 'range').filter(c => c.from === D20 && c.to === D1);
    ok('нов път (ключ „all“): ЕДНА заявка range за reports+storno и една за documents, без store',
      rngB.filter(c => c.kinds.join() === 'reports,storno').length === 1 && rngB.filter(c => c.kinds.join() === 'documents').length === 1 &&
      rngB.every(c => c.store === undefined), JSON.stringify(rngB.map(c => c.kinds)));
    ok('нов път: 0 REST заявки към kasa_reports / kasa_storno / kasa_documents',
      restGets(b, 'kasa_reports').length === 0 && restGets(b, 'kasa_storno').length === 0 && restGets(b, 'kasa_documents').length === 0,
      String(restGets(b, 'kasa_reports').length + '/' + restGets(b, 'kasa_storno').length + '/' + restGets(b, 'kasa_documents').length));
    ok('екранът е изрисуван (ПОС, сторно, документи)', /Прикачени документи \(3\)/.test(b.out) && /Лампа|123456/.test(b.out), b.out.length + ' знака');
    ok('ЕКРАНЪТ Е СЪЩИЯТ по двата пътя (бутоните „Преглед“ — нормализирани)', normDocs(a.out) === normDocs(b.out) && a.out.length > 2000,
      a.out.length + ' срещу ' + b.out.length);
    ok('редът на ПОС отчетите в паметта е старият (date.desc,id.desc), не този на kasa-api',
      JSON.stringify(a.w.histData.kasa.map(r => r.id)) === JSON.stringify(b.w.histData.kasa.map(r => r.id)) &&
      b.w.histData.kasa[0].id === ID(9), b.w.histData.kasa.map(r => r.pos_number).join());
    ok('сторното — същите редове и ред, с вложените артикули (STORNO_SELECT)',
      JSON.stringify(a.w.histData.storno) === JSON.stringify(b.w.histData.storno) && b.w.histData.storno.length === 4 &&
      b.w.histData.storno.find(r => r.id === ID(51)).kasa_storno_items.length === 2, b.w.histData.storno.map(r => r.id.slice(-2)).join());
    const fa = normDocs(a.out).match(/⚠️|🔻|stornoFlag|по-малка/g), fb = normDocs(b.out).match(/⚠️|🔻|stornoFlag|по-малка/g);
    ok('индикаторът за сторно (stornoIndicator от kasa.js) е същият', JSON.stringify(fa) === JSON.stringify(fb));

    /* Един обект от падащото меню */
    const F2 = { from: D20, to: D1, type: 'kasa', store: KR };
    const c = await histSearch(U.admin, undefined, F2);
    const d = await histSearch(U.admin, 'Кърджали, Раднево', F2);
    ok('admin + обект Кърджали от менюто + ключ „Кърджали, Раднево“ → kasa-api със store=Кърджали',
      apiActs(d, 'range').some(x => x.store === KR && x.kinds.join() === 'reports') && restGets(d, 'kasa_reports').length === 0);
    ok('…и екранът е същият като по стария път', normDocs(c.out) === normDocs(d.out) && /Кърджали/.test(d.out) && !/Раднево/.test(d.w.histData.kasa.map(r => r.store_name).join()));
    const e = await histSearch(U.admin, 'Кърджали, Раднево', { from: D20, to: D1, type: 'kasa', store: TR });
    ok('admin + обект Троян (извън ключа) → стария път', restGets(e, 'kasa_reports').length >= 1 && !apiActs(e, 'range').some(x => x.from === D20));
    const g = await histSearch(U.admin, 'Кърджали, Раднево', { from: D20, to: D1, type: 'kasa' });
    ok('admin + „— Всички —“ при частичен ключ → стария път (обхватът „всички“ иска „all“)',
      restGets(g, 'kasa_reports').length >= 1 && !apiActs(g, 'range').some(x => x.from === D20));

    /* accounting с assigned = [Кърджали] — обхватът е своят обект */
    const p = await histSearch(U.accKR, undefined, { from: D20, to: D1, type: 'all' });
    const q = await histSearch(U.accKR, 'Кърджали', { from: D20, to: D1, type: 'all' });
    ok('accounting с assigned [Кърджали] + ключ „Кърджали“ → kasa-api за целия обхват (без store)',
      apiActs(q, 'range').some(x => x.from === D20 && x.store === undefined) && restGets(q, 'kasa_reports').length === 0);
    ok('…редовете са само на Кърджали и екранът е като по стария път (storeQ)',
      q.w.histData.kasa.length > 0 && q.w.histData.kasa.every(r => r.store_name === KR) && normDocs(p.out) === normDocs(q.out));

    /* Период над 400 дни през всички обекти → видима грешка, не празна таблица */
    const t = await histSearch(U.admin, 'all', { from: dayOffset(-500), to: D1, type: 'kasa' }, { noDocs: true });
    ok('над 400 дни (всички обекти) → „Грешка при зареждане.“ + причината, не „няма записи“',
      /Грешка при зареждане\. Периодът е над 400 дни/.test(t.out), t.out.slice(0, 200));
    /* Грешка от kasa-api при търсене */
    const x = await histSearch(U.admin, 'all', { from: D20, to: D1, type: 'all' }, { fail: { status: 500, body: { ok: false, reason: 'internal', message: 'Вътрешна грешка.' } }, noDocs: true });
    ok('грешка от kasa-api → съобщение с причината + червен toast; таблица с „0“ няма',
      /Грешка при зареждане\. Вътрешна грешка\./.test(x.out) && x.calls.toast.some(m => /не се заредиха: Вътрешна грешка/.test(m)) && !/<table/.test(x.out));
  }

  /* ─────────────────────────────────────────────────────────── */
  section('2. История — „👁 Преглед“ (R22)');
  {
    const b = await histSearch(U.admin, 'all', { from: D20, to: D1, type: 'kasa' });
    const btns = Array.prototype.filter.call(b.doc.querySelectorAll('#h-results button'), x => /Преглед/.test(x.textContent));
    ok('бутоните носят id на реда, не път', btns.length === 3 && btns.every(x => x.dataset.id && !x.dataset.path), String(btns.length));
    const before = b.calls.get.length;
    realClick(b.w, btns[0]);
    await until(() => b.api.opened.length > 0);
    const du = apiActs(b, 'doc_url');
    ok('клик → doc_url с document_id и нов раздел с подписания линк',
      du.length === 1 && du[0].document_id === btns[0].dataset.id && b.api.opened[0].args[0] === 'https://signed.example/' + btns[0].dataset.id);
    ok('нито заявка към /storage/v1/ (anon ключът не тръгва)', !b.calls.get.slice(before).some(u => /storage\/v1/.test(u)));
    const a = await histSearch(U.admin, undefined, { from: D20, to: D1, type: 'kasa' });
    const ab = Array.prototype.filter.call(a.doc.querySelectorAll('#h-results button'), x => /Преглед/.test(x.textContent));
    ok('стар път: бутоните — с пътя (previewKasaDoc), както досега', ab.length === 3 && ab.every(x => x.dataset.path && /previewKasaDoc/.test(x.getAttribute('onclick'))));
    /* Грешка в секцията с документите → видимо съобщение */
    const h = env(U.admin, 'all');
    await ready(h);
    h.w.loadHistory();
    await until(() => !!h.doc.getElementById('h-from'));
    h.doc.getElementById('h-from').value = D20; h.doc.getElementById('h-to').value = D1; h.doc.getElementById('h-type').value = 'kasa';
    h.w.runHistorySearch();
    await until(() => { const o = h.doc.getElementById('h-results'); return o && /<table/.test(o.innerHTML); });
    h.api.fail = { status: 500, body: { ok: false, reason: 'internal', message: 'Вътрешна грешка.' } };
    /* renderHistoryResults пуска документите наново — този път kasa-api пада */
    h.w.renderHistoryResults();
    await until(() => !!h.doc.getElementById('h-docs-err'));
    ok('грешка при документите → „⚠️ Документите не се заредиха“, не липсваща секция', !!h.doc.getElementById('h-docs-err') &&
      /Вътрешна грешка/.test(h.doc.getElementById('h-docs-err').textContent));
  }

  /* ─────────────────────────────────────────────────────────── */
  section('3. История — Excel (R21)');
  async function excel(user, settings, f, fail) {
    const h = await histSearch(user, settings, f);
    if (fail) h.api.fail = fail;
    const n0 = h.api.calls.length;
    h.w.exportKasaToExcel();
    await until(() => h.api.files.length > 0 || h.calls.toast.some(m => /Excel не е създаден|Грешка при генериране/.test(m)), 4000);
    h.newCalls = h.api.calls.slice(n0);
    return h;
  }
  {
    const F1 = { from: D20, to: D1, type: 'all' };
    const a = await excel(U.admin, undefined, F1);
    const b = await excel(U.admin, 'all', F1);
    ok('стар път: файлът е създаден', a.api.files.length === 1, a.calls.toast.join(' | '));
    ok('нов път: файлът е създаден', b.api.files.length === 1, b.calls.toast.join(' | '));
    ok('нов път: storno; zoborot+glavna+documents в една заявка; reports с cols=denoms',
      b.newCalls.some(c => c.action === 'range' && c.kinds.join() === 'storno') &&
      b.newCalls.some(c => c.action === 'range' && c.kinds.join() === 'zoborot,glavna,documents') &&
      b.newCalls.some(c => c.action === 'range' && c.kinds.join() === 'reports' && c.cols === 'denoms'),
      JSON.stringify(b.newCalls.map(c => [c.kinds, c.cols])));
    ok('нов път: 0 REST заявки към касовите таблици за Excel-а',
      ['kasa_reports', 'kasa_storno', 'kasa_zoborot', 'kasa_glavna', 'kasa_documents'].every(t => restGets(b, t).length === 0));
    if (a.api.files.length && b.api.files.length) {
      const sa = a.api.files[0], sb = b.api.files[0];
      ok('същите листове в същия ред', JSON.stringify(sa.sheets.map(s => s.name)) === JSON.stringify(sb.sheets.map(s => s.name)), sb.sheets.map(s => s.name).join(', '));
      ok('ВСЯКА клетка е същата (листовете по обекти, Сторно, Документи, Главна каса)', JSON.stringify(sa) === JSON.stringify(sb) && sa.sheets.length >= 3,
        sa.sheets.map(s => s.name + ':' + s.aoa.length).join(', ') + ' / ' + sb.sheets.map(s => s.name + ':' + s.aoa.length).join(', '));
    }
    const c = await excel(U.admin, 'all', F1, { status: 500, body: { ok: false, reason: 'internal', message: 'Вътрешна грешка.' } });
    ok('грешка от kasa-api → файл НЯМА, toast „… Excel не е създаден.“', c.api.files.length === 0 &&
      c.calls.toast.some(m => /Вътрешна грешка\. Excel не е създаден\./.test(m)), c.calls.toast.join(' | '));
  }

  /* ─────────────────────────────────────────────────────────── */
  section('4. Вечерен оборот (R23–R25)');
  async function oborot(user, settings, fail) {
    const h = env(user, settings);
    await ready(h);
    if (fail) h.api.fail = fail;
    h.w.kasaView = 'oborot';
    h.w.loadOborot();
    await until(() => { const m = h.doc.getElementById('mod-kasa'); return m && /Вечерен оборот|kasa-api-err/.test(m.innerHTML); });
    await until(() => false, 60);
    h.html = (h.doc.getElementById('mod-kasa') || {}).innerHTML || '';
    return h;
  }
  {
    const a = await oborot(U.mgrKR, undefined);
    const b = await oborot(U.mgrKR, 'Кърджали, Раднево');
    const rb = apiActs(b, 'range');
    ok('обект в ключа → kasa-api range oborot, store=Кърджали, от днес−29, без daily_turnover по REST',
      rb.length === 1 && rb[0].kinds.join() === 'oborot' && rb[0].store === KR && rb[0].from === dayOffset(-29) && restGets(b, 'daily_turnover').length === 0,
      JSON.stringify(rb));
    ok('стар път без ключ: daily_turnover по REST, 0 kasa-api', restGets(a, 'daily_turnover').length === 1 && apiActs(a, 'range').filter(c => c.kinds.join() === 'oborot').length === 0);
    ok('изгледът на обекта е СЪЩИЯТ по двата пътя', a.html === b.html && a.html.length > 300, a.html.length + ' / ' + b.html.length);
    ok('само днес: днешният запис е на екрана', /4[\s ]?321[,.]09|4321\.09/.test(b.w.document.getElementById('mod-kasa').textContent));
    const txt = b.w.document.getElementById('mod-kasa').textContent;
    ok('минали дни НЕ се показват (oborot-no-history) — нито едно минало число', PAST_OBOROT.every(m => txt.indexOf(m) < 0),
      PAST_OBOROT.filter(m => txt.indexOf(m) >= 0).join(', '));
    ok('30-те дни за средното са в паметта, със същите редове по двата пътя (без 40-дневния)',
      JSON.stringify(a.w.oborotRecent) === JSON.stringify(b.w.oborotRecent) && b.w.oborotRecent.length === 3 && b.w.dtAvg30() === a.w.dtAvg30(),
      b.w.oborotRecent.length + ' реда; средно ' + b.w.dtAvg30());
    const c = await oborot(U.mgrKR, 'Раднево');
    ok('обект извън ключа → стария път', restGets(c, 'daily_turnover').length === 1 && apiActs(c, 'range').length === 0);
    const e = await oborot(U.mgrKR, 'all', { status: 500, body: { ok: false, reason: 'internal', message: 'Вътрешна грешка.' } });
    ok('грешка → съобщение „Касовите данни не се заредиха“ в таба, НЕ празна форма за въвеждане',
      !!e.doc.getElementById('kasa-api-err') && !e.doc.getElementById('dt-total') && !/dt-total/.test(e.html), e.html.slice(0, 160));

    /* ЦО */
    const ca = await oborot(U.admin, undefined);
    const cb = await oborot(U.admin, 'all');
    ok('ЦО admin + „all“ → range oborot за днешния ден, без store',
      apiActs(cb, 'range').some(x => x.kinds.join() === 'oborot' && x.from === dayOffset(0) && x.to === dayOffset(0) && x.store === undefined) && restGets(cb, 'daily_turnover').length === 0);
    ok('ЦО: справката е СЪЩАТА по двата пътя (трите обекта)', ca.html === cb.html && /777[.,]77|777\.77/.test(cb.w.document.getElementById('mod-kasa').textContent) &&
      JSON.stringify(ca.w.oborotCORows) === JSON.stringify(cb.w.oborotCORows), ca.html.length + ' / ' + cb.html.length);
    const cc = await oborot(U.admin, 'Кърджали, Раднево');
    ok('ЦО admin при частичен ключ → стария път', restGets(cc, 'daily_turnover').length === 1 && apiActs(cc, 'range').length === 0);
    const cd = await oborot(U.accKR, 'Кърджали');
    ok('ЦО accounting с assigned [Кърджали] + ключ „Кърджали“ → СТАРИЯ път (старото четене е по цялата верига — kasa-api би дал само своите)',
      restGets(cd, 'daily_turnover').length === 1 && apiActs(cd, 'range').length === 0 && cd.w.oborotCORows.length === 3);

    /* R25 — корекция с нова дата */
    async function edit(settings, newDate, fail) {
      const h = await oborot(U.admin, settings);
      h.w.openOborotEdit(ID(64));
      await until(() => !!h.doc.getElementById('dt-ed-date'));
      h.doc.getElementById('dt-ed-date').value = newDate;
      if (fail) h.api.fail = fail;
      const n0 = h.api.calls.length, p0 = h.calls.patch.length;
      h.w.submitOborotEdit();
      await until(() => h.calls.patch.length > p0 || h.calls.toast.some(m => /вече има подаден|не се заредиха|Корекцията/.test(m)));
      await until(() => false, 40);
      h.newApi = h.api.calls.slice(n0); h.newPatch = h.calls.patch.slice(p0);
      return h;
    }
    const e1 = await edit('all', D1);
    /* след успешен PATCH справката се презарежда (втори range за деня) — броим само проверката */
    ok('свободна дата → проверката през kasa-api (store=Раднево, from=to=новата дата), после PATCH',
      e1.newApi.length >= 1 && e1.newApi[0].store === RD && e1.newApi[0].from === D1 && e1.newApi[0].to === D1 && e1.newPatch.length === 1 &&
      restGets(e1, 'daily_turnover').length === 0, JSON.stringify(e1.newApi) + ' patch=' + e1.newPatch.length);
    F.daily_turnover.push({ id: ID(67), store_name: RD, date: D2, total_turnover: 1, cash_turnover: 1, card_turnover: 0, bank_turnover: 0, customers: 1, created_at: D2 + 'T17:00:00Z' });
    const e2 = await edit('all', D2);
    const e2old = await edit(undefined, D2);
    ok('заета дата → „вече има подаден оборот“, PATCH НЯМА (и по двата пътя)',
      e2.newPatch.length === 0 && e2.calls.toast.some(m => /вече има подаден/.test(m)) && e2old.newPatch.length === 0 && e2old.calls.toast.some(m => /вече има подаден/.test(m)));
    F.daily_turnover.pop();
    const e3 = await edit('all', D1, { status: 500, body: { ok: false, reason: 'internal', message: 'Вътрешна грешка.' } });
    ok('грешка при проверката → PATCH НЯМА, toast с причината, формата остава, бутонът се отключва',
      e3.newPatch.length === 0 && e3.calls.toast.some(m => /не се заредиха: Вътрешна грешка/.test(m)) && !!e3.doc.getElementById('dt-ed-date') && e3.w.oborotSubmitting === false);
  }

  /* ─────────────────────────────────────────────────────────── */
  section('5. Отчети (R26–R27): същото съдържание по двата пътя');
  function daily(h, day, scope) {
    return new Promise(res => h.w.collectDailyKasaSection(res, day, scope, 5)).then(x => JSON.parse(JSON.stringify(x)));
  }
  function cross(h, win, scope) {
    return new Promise(res => h.w.collectCrossModuleWeeklySummary(res, win, scope)).then(x => JSON.parse(JSON.stringify(x)));
  }
  const WIN = { from: D5, to: D1 };
  {
    const a = env(U.admin, undefined); await ready(a);
    const b = env(U.admin, 'all'); await ready(b);
    const da = await daily(a, D1, null), db = await daily(b, D1, null);
    ok('дневна касова секция: стар път — REST kasa_reports/kasa_zoborot, 0 report_rows', restGets(a, 'kasa_reports').length >= 2 && apiActs(a, 'report_rows').length === 0);
    const rr = apiActs(b, 'report_rows');
    ok('нов път: ЕДНА заявка report_rows daily_kasa с day, 0 REST към касата', rr.length === 1 && rr[0].kind === 'daily_kasa' && rr[0].day === D1 &&
      restGets(b, 'kasa_reports').length === 0 && restGets(b, 'kasa_zoborot').length === 0, JSON.stringify(rr));
    ok('дневната секция е СЪЩАТА (върнати, натрупани, над прага)', JSON.stringify(da) === JSON.stringify(db) && da.returned.length + da.returnedBacklog.length + da.overThreshold.length >= 3,
      JSON.stringify(db).slice(0, 300));
    const ca = await cross(a, WIN, null), cb = await cross(b, WIN, null);
    const rc = apiActs(b, 'report_rows').filter(c => c.kind === 'cross_kasa');
    ok('кросмодулна: ЕДНА report_rows cross_kasa с прозореца (from/to stamp и iso)', rc.length === 1 && rc[0].from_iso === D5 && rc[0].to_iso === D1 &&
      /^\d{4}-\d{2}-\d{2}T/.test(rc[0].from_stamp) && /^\d{4}-\d{2}-\d{2}T/.test(rc[0].to_stamp));
    ok('кросмодулна: сторно / равнение / „по-малка нова сума“ — същите', JSON.stringify([ca.storno, ca.stornoShort, ca.zoborot, ca.partial]) ===
      JSON.stringify([cb.storno, cb.stornoShort, cb.zoborot, cb.partial]), JSON.stringify(cb.storno) + ' ' + JSON.stringify(cb.stornoShort));
    ok('кросмодулна: целият обект за писмото е същият', JSON.stringify(ca) === JSON.stringify(cb));
    const today1 = await cross(b, null, null);
    ok('„Днес“ (подвижен прозорец, без to) → cross_kasa без to_iso; същото като стария път',
      apiActs(b, 'report_rows').some(c => c.kind === 'cross_kasa' && c.to_iso === null && c.to_stamp === null) &&
      JSON.stringify(today1) === JSON.stringify(await cross(a, null, null)));

    /* Кой минава по новия път */
    const ct = env(U.ctrl, 'all'); await ready(ct);
    const cc = await cross(ct, null, null);
    ok('controlling + „all“ → report_rows (решение 4), същият резултат', apiActs(ct, 'report_rows').length === 1 && JSON.stringify(cc) === JSON.stringify(await cross(a, null, null)));
    const ct2 = env(U.ctrl, 'Кърджали, Раднево'); await ready(ct2);
    await cross(ct2, null, null);
    ok('controlling при частичен ключ → стария път (обхватът за отчети е „всички“)', apiActs(ct2, 'report_rows').length === 0 && restGets(ct2, 'kasa_storno').length >= 1);
    const ad2 = env(U.admin, 'Кърджали, Раднево'); await ready(ad2);
    await daily(ad2, D1, null);
    ok('admin („Тест до мен“) при частичен ключ → стария път', apiActs(ad2, 'report_rows').length === 0);
    const rg = env(U.accKR, 'Кърджали'); await ready(rg);
    const rgOld = env(U.accKR, undefined); await ready(rgOld);
    const x1 = await cross(rg, null, [KR]), x0 = await cross(rgOld, null, [KR]);
    /* rowsRead е брой ПРОЧЕТЕНИ редове преди среза по scope (диагностика, не
       се рисува): старият път чете цялата верига, kasa-api — само обхвата. */
    const noRead = x => { const c = JSON.parse(JSON.stringify(x)); delete c.rowsRead; return JSON.stringify(c); };
    ok('регионален accounting [Кърджали] + ключ „Кърджали“, scope [Кърджали] → report_rows; същото като стария път',
      apiActs(rg, 'report_rows').length === 1 && noRead(x1) === noRead(x0));
    ok('…разликата е само rowsRead (прочетени преди среза), и то само за сторното',
      x1.rowsRead.kasa_storno < x0.rowsRead.kasa_storno && JSON.stringify(Object.keys(x1.rowsRead)) === JSON.stringify(Object.keys(x0.rowsRead)),
      JSON.stringify(x1.rowsRead) + ' / ' + JSON.stringify(x0.rowsRead));
    ok('…и секцията в писмото (buildCrossModuleSectionHtml) е байт в байт същата',
      rg.w.buildCrossModuleSectionHtml(x1, true) === rgOld.w.buildCrossModuleSectionHtml(x0, true));
    const rg2 = env(U.accKR, 'Кърджали'); await ready(rg2);
    await daily(rg2, D1, null);
    ok('accounting с assigned, БЕЗ scope (цялата верига) → стария път — kasa-api би дал само своите',
      apiActs(rg2, 'report_rows').length === 0 && restGets(rg2, 'kasa_reports').length >= 1);
    const mg = env(U.mgrKR, 'all'); await ready(mg);
    await daily(mg, D1, null);
    ok('manager (без report_rows в kasa-api) → стария път дори при „all“', apiActs(mg, 'report_rows').length === 0);

    /* Грешка */
    const f = env(U.admin, 'all'); await ready(f);
    f.api.fail = { status: 500, body: { ok: false, reason: 'internal', message: 'Вътрешна грешка.' } };
    const cf = await cross(f, WIN, null);
    ok('грешка → „Непълни данни“ за сторното (cross.partial) + ЕДИН червен toast, а не тихи нули',
      cf.partial.some(p => p.table === 'kasa_storno') && cf.partial.some(p => p.table === 'kasa_storno_week') &&
      f.calls.toast.filter(m => /за отчета не се заредиха/.test(m)).length === 1, JSON.stringify(cf.partial) + ' ' + f.calls.toast.join(' | '));
    ok('грешка: една заявка report_rows за целия колектор (не по една на стара заявка)', apiActs(f, 'report_rows').length === 1);
    const df = await daily(f, D1, null);
    ok('дневна секция при грешка → празна, както при грешка на sbGet по стария път; toast', df.returned.length === 0 && df.overThreshold.length === 0 &&
      f.calls.toast.some(m => /за отчета не се заредиха/.test(m)));
    ok('непозната заявка в колектора → reportKasaPart = null (тестът я хваща, не тръгва тихо по стария път)',
      f.w.reportKasaPart('daily_kasa', 'kasa_glavna', 'x=1') === null && f.w.reportKasaPart('cross_kasa', 'kasa_storno', 'created_at=gte.x') === 'storno');
  }

  /* ─────────────────────────────────────────────────────────── */
  section('6. Интеграция: шестте файла заедно, в реда от index.html');
  {
    const h = env(U.admin, 'all');
    await ready(h);
    ['kasaApi', 'kasaApiOn', 'kasaRangeGet', 'kasaApiFailPanel', 'kasaApiCatch', 'kasaOpenDocById', 'stornoIndexItems', 'stornoIndicator',
      'runHistorySearch', 'exportKasaToExcel', 'histKasaSorter', 'histPreviewDocById', 'loadOborot', 'oborotRangeGet', 'submitOborotEdit',
      'collectDailyKasaSection', 'collectCrossModuleWeeklySummary', 'reportKasaReader', 'reportKasaApiOn', 'showLoginBanner']
      .forEach(f => ok('глобалната ' + f + ' е функция', typeof h.w[f] === 'function'));
    ok('STORNO_SELECT (kasa.js) е низ — history.js го ползва за стария път', typeof h.w.STORNO_SELECT === 'string' && /kasa_storno_items/.test(h.w.STORNO_SELECT));
    const s = h.w.histKasaSorter(['date.desc', 'id.desc'])([{ date: null, id: 'b' }, { date: '2026-01-01', id: 'a' }, { date: '2026-01-02', id: 'c' }, { date: '2026-01-01', id: 'd' }]);
    ok('сортирането е като PostgREST: desc — NULL първи, после по дата, после id', s.map(x => x.id).join() === 'b,c,d,a', s.map(x => x.id).join());
    const s2 = h.w.histKasaSorter(['store_name.asc'])([{ store_name: null, i: 1 }, { store_name: 'Б', i: 2 }, { store_name: 'А', i: 3 }, { store_name: 'Б', i: 4 }]);
    ok('asc — NULL последен, стабилно при равни', s2.map(x => x.i).join() === '3,2,4,1', s2.map(x => x.i).join());
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
