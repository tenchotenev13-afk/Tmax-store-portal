/* Каса през kasa-api — етап 1б-2 (20.11.2026, сесия kasa-api-etap1b2).

   Проектът: claude/kasa-api-dizajn.md. Превключвателят е
   app_settings.kasa_api_stores („all“ или имена със запетая); при него
   четенията R1–R17 (kasa.js, kasa-docs.js) и R28–R29 (notifications.js)
   минават през kasa-api, иначе — непроменените стари заявки. history.js
   минава през kasa-api от 1б-3 (23.11.2026) — подробно в kasa-api-reads-1b3.test.js.

   Покрива:
     1. Превключвател: ключ липсва / „Кърджали“ / „all“ / паднала заявка за
        ключа → правилният път за manager Кърджали, manager Троян, admin;
        accounting с assigned; без пропуск; граница 400 дни за admin.
     2. Модал за повторен вход: 401 → модал (имейлът заключен); грешна парола
        → остава; правилна → заявката се повтаря с НОВИЯ пропуск, въведеното
        във формата на Каса остава, startApp НЕ се вика; отказ → грешка, не
        празен списък; два едновременни 401 → един модал; друг потребител →
        изход.
     3. R1, R12, R28, R29: при kasaApiOn данните идват от kasa-api и екранът
        е същият като по стария път (същите fixtures).
     4. Грешка от kasa-api → червен toast + видимо съобщение (Каса, сторно
        формата не се отваря, дневният преглед, банерът).
     5. Генерираните прозорци (печат R8, детайл R16): при kasa-api без anon
        ключ, „Виж“ минава през основната страница (kasaOpenDocById).
     6. Интеграция: kasa.js + kasa-docs.js + history.js + notifications.js
        заредени заедно в реда от index.html; история — стария път.

   Мутационна проверка: виж claude/log/2026-11-20-kasa-api-etap1b2.md.

   Пускане:  node tests/kasa-api-reads.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, dayOffset } = H;

const KR = 'Кърджали';
const U = {
  kardzhali: { id: 'u-kr', email: 'kr@temax.bg', display_name: 'Мениджър КР', role: 'manager', store_name: KR },
  troyan: { id: 'u-tr', email: 'tr@temax.bg', display_name: 'Мениджър ТР', role: 'manager', store_name: 'Троян' },
  admin: { id: 'u-ad', email: 'ad@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' }
};

const Y = dayOffset(-1);   /* kasaActiveDate() = вчера */
function rep(id, date, pos, status, extra) {
  return Object.assign({ id: id, store_name: KR, date: date, pos_number: pos, cashier_name: 'Касиер ' + pos,
    status: status, cash_turnover: 100 * pos, counted_cash: 100 * pos, razlika: 0, return_reason: null, returned_by: null }, extra || {});
}
const F = {
  kasa_reports: [
    rep('r1', Y, 1, 'draft'), rep('r2', Y, 2, 'confirmed'),
    rep('r3', dayOffset(-3), 1, 'confirmed'),
    rep('r4', dayOffset(-20), 3, 'returned', { return_reason: 'Липсва Z', returned_by: 'Счетоводство' })
  ],
  kasa_glavna: [{ id: 'g1', store_name: KR, date: Y, status: 'draft', counted_cash: 50, slujebno: 0, sap_balance: 50 }],
  kasa_zoborot: [{ id: 'z1', store_name: KR, date: Y, status: 'draft', razlika: 0, created_at: Y + 'T18:00:00Z' }],
  kasa_documents: [
    { id: 'doc-1', store_name: KR, date: Y, report_type: 'pos', doc_type: 'z_report', file_name: 'z1.pdf', file_url: '_______/' + Y + '/pos_z_report_1.pdf', uploaded_by: 'Касиер', created_at: Y + 'T10:00:00Z' },
    { id: 'doc-2', store_name: KR, date: Y, report_type: 'pos', doc_type: 'other', file_name: 'b.jpg', file_url: '_______/' + Y + '/pos_other_2.jpg', uploaded_by: 'Касиер', created_at: Y + 'T11:00:00Z' }
  ],
  kasa_storno: [
    { id: '11111111-1111-4111-8111-111111111111', store_name: KR, storno_date: Y, returned_sum: 100, new_sum: 80, articles: '123456', status: 'draft', reason: 'Замяна', created_at: Y + 'T12:00:00Z',
      kasa_storno_items: [{ kind: 'returned', sap_code: '123456', article_name: 'Лампа', line_no: 1 }] }
  ],
  kasa_storno_items: [{ id: 'i1', storno_id: '11111111-1111-4111-8111-111111111111', kind: 'returned', sap_code: '123456', article_name: 'Лампа', line_no: 1 }]
};
/* Сторна за банера на admin (R29) — две маркирани, една не. */
const STORNO_ALL = [
  { id: 's1', store_name: 'Шумен', storno_date: Y, returned_sum: 100, new_sum: 80, articles: '123456' },
  { id: 's2', store_name: KR, storno_date: Y, returned_sum: 50, new_sum: 10, articles: '234567' },
  { id: 's3', store_name: 'Троян', storno_date: Y, returned_sum: 70, new_sum: 70, articles: '345678' }
];

/* ── Фалшив kasa-api: филтрира по обект/дата като функцията ── */
function apiReply(w, body, user) {
  const own = user.store_name;
  const scope = user.role === 'admin' ? null : [own];
  const inScope = s => !scope || scope.indexOf(s) >= 0;
  const T = { reports: 'kasa_reports', glavna: 'kasa_glavna', zoborot: 'kasa_zoborot', documents: 'kasa_documents', storno: 'kasa_storno' };
  const DC = { storno: 'storno_date' };
  if (body.action === 'day') {
    if (!inScope(body.store)) return { status: 403, body: { ok: false, reason: 'forbidden_store', message: 'Нямате достъп до касата на този обект.' } };
    const pick = t => F[t].filter(r => r.store_name === body.store && r.date === body.date);
    return { status: 200, body: { ok: true, store: body.store, date: body.date, reports: pick('kasa_reports'), glavna: pick('kasa_glavna'), zoborot: pick('kasa_zoborot'), documents: pick('kasa_documents') } };
  }
  if (body.action === 'range') {
    const out = {};
    body.kinds.forEach(k => {
      const col = DC[k] || 'date';
      const src = (k === 'storno' && user.role === 'admin') ? F.kasa_storno.concat(STORNO_ALL) : F[T[k]];
      out[k] = { rows: src.filter(r => inScope(r.store_name) && (!body.store || r.store_name === body.store) &&
        r[col] <= body.to && (r[col] >= body.from || (body.include_returned && r.status === 'returned'))), partial: false };
    });
    return { status: 200, body: { ok: true, from: body.from, to: body.to, kinds: out } };
  }
  if (body.action === 'storno_items') return { status: 200, body: { ok: true, storno_id: body.storno_id, items: F.kasa_storno_items.filter(i => i.storno_id === body.storno_id) } };
  if (body.action === 'banner') {
    const res = { ok: true, returned_reports: F.kasa_reports.filter(r => r.store_name === own && r.status === 'returned') };
    if (user.role === 'admin' || user.role === 'accounting') {
      const by = {}; let count = 0;
      STORNO_ALL.forEach(r => { if (w.stornoIndicator(r.returned_sum, r.new_sum, r.articles).flagged) { count++; by[r.store_name] = (by[r.store_name] || 0) + 1; } });
      res.storno_flagged = { count: count, by_store: by, read: STORNO_ALL.length, partial: false };
    }
    return { status: 200, body: res };
  }
  if (body.action === 'doc_url') return { status: 200, body: { ok: true, url: 'https://signed.example/' + body.document_id, expires_in: 300 } };
  return { status: 400, body: { ok: false, reason: 'bad_action', message: 'Непознато действие.' } };
}

/* Старият път: мокът филтрира като PostgREST (eq / gte / lte / in и
   order=created_at), иначе сравнението „същият екран“ би сравнявало чужди
   редове по стария път с правилните по новия. */
function rest(rows) {
  return function (url) {
    const q = decodeURIComponent(String(url).split('?')[1] || '');
    let out = rows.slice();
    q.split('&').forEach(p => {
      const m = /^([a-z_]+)=(eq|gte|lte|in)\.(.*)$/.exec(p);
      if (!m || m[1] === 'select' || m[1] === 'order') return;
      const k = m[1], op = m[2], v = m[3];
      out = out.filter(r => {
        const x = r[k] == null ? 'null' : String(r[k]);
        if (op === 'eq') return x === v;
        if (op === 'gte') return x >= v;
        if (op === 'lte') return x <= v;
        return v.replace(/^\(|\)$/g, '').split(',').indexOf(x) >= 0;
      });
    });
    const o = /(?:^|&)order=created_at\.(asc|desc)/.exec(q);
    if (o) out.sort((a, b) => (a.created_at < b.created_at ? -1 : 1) * (o[1] === 'desc' ? -1 : 1));
    return out;
  };
}
/* settings: undefined → няма ключ; 'FAIL' → заявката за ключа пада; иначе стойността. */
function env(user, settings, extra) {
  extra = extra || {};
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js', 'daily-turnover.js', 'history.js', 'notifications.js'],
    user: Object.assign({}, user),
    fail: settings === 'FAIL' ? { GET: /app_settings/ } : undefined,
    data: {
      app_settings: settings === undefined || settings === 'FAIL' ? [] : [{ key: 'kasa_api_stores', value: settings }],
      kasa_reports: rest(F.kasa_reports), kasa_glavna: rest(F.kasa_glavna), kasa_zoborot: rest(F.kasa_zoborot),
      kasa_documents: rest(F.kasa_documents), kasa_storno: rest(extra.stornoAll ? STORNO_ALL : F.kasa_storno),
      kasa_storno_items: rest(F.kasa_storno_items), daily_turnover: [], stores: [{ name: KR }],
      transport_orders: [], client_orders: [], loading_lists: [], loading_list_items: [], transfers: [], transfer_cargo: []
    }
  });
  const w = h.w;
  w.currentSession = extra.noSession ? null : (extra.session || 'sess-ok');
  w.transportOrders = []; w.clientOrders = [];
  const api = { calls: [], auth: [], fail: null, expire: false, authReply: null, opened: [], startApp: 0, logout: 0 };
  const orig = w.fetch;
  const res = o => ({ ok: o.status < 400, status: o.status, json: () => Promise.resolve(o.body), text: () => Promise.resolve(JSON.stringify(o.body)) });
  w.fetch = function (url, init) {
    const u = String(url);
    if (u.indexOf('/functions/v1/kasa-api') >= 0) {
      const body = JSON.parse(init.body);
      api.calls.push(body);
      if (api.expire && body.session !== 'sess-new') return Promise.resolve(res({ status: 401, body: { ok: false, reason: 'session_expired', message: 'Сесията е изтекла — влез отново.' } }));
      if (api.fail) return Promise.resolve(res(api.fail));
      return Promise.resolve(res(apiReply(w, body, w.currentUser)));
    }
    if (u.indexOf('/functions/v1/auth-login') >= 0) {
      const body = JSON.parse(init.body);
      api.auth.push(body);
      const r = api.authReply ? api.authReply(body) : (body.password === 'вярна'
        ? { ok: true, session: 'sess-new', user: { id: w.currentUser.id, email: body.email, role: w.currentUser.role } }
        : { ok: false, reason: 'bad_password', message: 'Грешен имейл или парола.' });
      return Promise.resolve(res({ status: r.ok ? 200 : 401, body: r }));
    }
    return orig.apply(this, arguments);
  };
  w.open = function () { const tab = { location: { href: '' }, closed: false, close() { this.closed = true; } }; api.opened.push({ args: [].slice.call(arguments), tab: tab }); return tab; };
  w.startApp = function () { api.startApp++; };
  const origLogout = w.doLogout;
  w.doLogout = function () { api.logout++; try { origLogout(); } catch (e) {} };
  h.api = api;
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 12); i++) await ticks(); }
/* Чакане по УСЛОВИЕ с краен срок, не по брой тикове. loadHistory() пуска
   дневния преглед със setTimeout(…, 200), а един тик (setTimeout 0) на Windows
   е 1–16 ms според резолюцията на таймера: settle(20) понякога минаваше 200 ms,
   понякога не — оттам двете „необясними“ червени (20.11.2026). */
async function until(cond, ms) {
  const end = Date.now() + (ms || 5000);
  while (Date.now() < end) { if (cond()) return true; await new Promise(r => setTimeout(r, 20)); }
  return !!cond();
}
const restGets = (h, t) => h.calls.get.filter(u => u.indexOf('/rest/v1/' + t) >= 0);
const apiActs = (h, a) => h.api.calls.filter(c => c.action === a);
const normDocs = s => s.replace(/onclick="(kasaOpenDocById|openKasaDoc)\([^"]*\)"/g, 'onclick="DOC"');

(async function main() {
  /* ─────────────────────────────────────────────────────────── */
  section('1. Превключвател');
  async function pathFor(user, settings, extra) {
    const h = env(user, settings, extra);
    h.w.loadKasa();
    await settle();
    const r = { api: apiActs(h, 'range').length > 0, rest: restGets(h, 'kasa_reports').length > 0, h: h };
    return r;
  }
  const CASES = [
    ['ключ липсва', undefined, { kardzhali: 'rest', troyan: 'rest', admin: 'rest' }],
    ['„Кърджали“', 'Кърджали', { kardzhali: 'api', troyan: 'rest', admin: 'rest' }],
    ['„all“', 'all', { kardzhali: 'api', troyan: 'api', admin: 'api' }],
    ['заявката за ключа пада', 'FAIL', { kardzhali: 'rest', troyan: 'rest', admin: 'rest' }],
    ['празна стойност', '  ', { kardzhali: 'rest', troyan: 'rest', admin: 'rest' }]
  ];
  for (const [label, val, exp] of CASES) {
    for (const who of ['kardzhali', 'troyan', 'admin']) {
      const r = await pathFor(U[who], val);
      const got = r.api && !r.rest ? 'api' : (!r.api && r.rest ? 'rest' : 'двата/нито един');
      ok(label + ': ' + who + ' → ' + exp[who], got === exp[who], got);
    }
  }
  {
    const r = await pathFor(U.admin, 'Кърджали, Раднево');
    ok('admin при „Кърджали, Раднево“: един обект (детайл) — да, списъкът (целият обхват) — не',
      r.h.w.kasaApiOn(KR) === true && r.h.w.kasaApiOn('Раднево') === true && r.h.w.kasaApiOn('Троян') === false && r.h.w.kasaApiOn() === false);
    const acc = Object.assign({}, U.admin, { role: 'accounting', assigned_stores: [KR, 'Раднево'] });
    const a = await pathFor(acc, 'Кърджали,Раднево');
    ok('accounting с assigned [Кърджали, Раднево] → целият обхват е в списъка → kasa-api', a.h.w.kasaApiOn() === true);
    const acc2 = Object.assign({}, acc, { assigned_stores: [KR, 'Троян'] });
    const a2 = await pathFor(acc2, 'Кърджали,Раднево');
    ok('accounting с assigned [Кърджали, Троян] → Троян не е в списъка → стария път', a2.h.w.kasaApiOn() === false);
    const acc3 = Object.assign({}, acc, { assigned_stores: null });
    const a3 = await pathFor(acc3, 'Кърджали,Раднево');
    ok('accounting без assigned (обхват „всички“) → само при „all“', a3.h.w.kasaApiOn() === false);
    const ns = await pathFor(U.kardzhali, 'all', { noSession: true });
    ok('без пропуск (currentSession=null) → стария път', !ns.api && ns.rest);
    const up = await pathFor(U.kardzhali, 'ALL');
    ok('„ALL“ с главни букви = all', up.api && !up.rest);
  }
  {
    const r = await pathFor(U.admin, 'all');
    const b = apiActs(r.h, 'range')[0] || {};
    const days = Math.round((Date.parse(b.to + 'T00:00:00Z') - Date.parse(b.from + 'T00:00:00Z')) / 86400000);
    ok('admin, списъкът в Каса: последните 60 дни + върнатите (решение 6)', b.from === dayOffset(-60) && b.include_returned === true && !b.store, b);
    ok('admin: периодът е ТОЧНО 400 дни — на тавана на kasa-api (> 400 → отказ), не над него', days === 400, days);
    const k = await pathFor(U.kardzhali, 'all');
    const kb = apiActs(k.h, 'range')[0] || {};
    ok('обект: цялата история (както стария път), без include_returned', kb.from === '2000-01-01' && kb.to === '2099-12-31' && !kb.include_returned, kb);
    ok('обект: върнатият отчет отпреди 20 дни е в списъка', k.h.w.kasaReports.some(x => x.id === 'r4'));
  }

  /* ─────────────────────────────────────────────────────────── */
  section('2. Модал за повторен вход');
  {
    const h = env(U.kardzhali, KR, { session: 'sess-old' });
    const w = h.w, doc = h.doc;
    await settle(); /* ключът */
    w.openKasaForm(null);
    const inp = doc.getElementById('kf-bills_100');
    if (inp) inp.value = '7';
    const before = doc.getElementById('mod-kasa').innerHTML.length;
    h.api.expire = true;
    let res = null;
    w.kasaOpenDocById('doc-1').then(() => { res = 'готово'; });
    await settle();
    const modal = doc.getElementById('kasa-reauth');
    ok('401 → модалът е отворен', !!modal);
    const em = doc.getElementById('kasa-reauth-email');
    ok('имейлът е на текущия потребител и е заключен', em && em.value === 'kr@temax.bg' && em.hasAttribute('readonly'));
    doc.getElementById('kasa-reauth-pass').value = 'грешна';
    realClick(w, doc.getElementById('kasa-reauth-ok'));
    await settle();
    ok('грешна парола → модалът остава, с грешката', !!doc.getElementById('kasa-reauth') && /Грешен/.test(doc.getElementById('kasa-reauth-err').textContent));
    ok('грешна парола → нищо не е повторено', h.api.calls.filter(c => c.session === 'sess-new').length === 0);
    doc.getElementById('kasa-reauth-pass').value = 'вярна';
    realClick(w, doc.getElementById('kasa-reauth-ok'));
    await settle();
    ok('правилна парола → модалът е затворен', !doc.getElementById('kasa-reauth'));
    ok('сменен е само currentSession', w.currentSession === 'sess-new' && w.currentUser.email === 'kr@temax.bg');
    const last = h.api.calls[h.api.calls.length - 1];
    ok('заявката е повторена с новия пропуск', last.action === 'doc_url' && last.document_id === 'doc-1' && last.session === 'sess-new');
    ok('… и стигна до края (линкът е отворен)', res === 'готово' && h.api.opened.some(o => o.args[0] === 'https://signed.example/doc-1'));
    ok('auth-login получи имейла на текущия потребител', h.api.auth.every(a => a.email === 'kr@temax.bg'));
    const inp2 = doc.getElementById('kf-bills_100');
    ok('въведеното във формата на Каса остава (купюри 100 = 7)', !!inp2 && inp2.value === '7');
    ok('формата не е пререндерирана', doc.getElementById('mod-kasa').innerHTML.length === before);
    ok('startApp() НЕ е викан', h.api.startApp === 0);
  }
  {
    const h = env(U.kardzhali, KR, { session: 'sess-old' });
    const w = h.w, doc = h.doc;
    await settle();
    h.api.expire = true;
    w.loadKasa();
    await settle();
    ok('отказ: модалът е отворен', !!doc.getElementById('kasa-reauth'));
    realClick(w, doc.getElementById('kasa-reauth-cancel'));
    await settle();
    const mk = doc.getElementById('mod-kasa');
    ok('отказ → видимо съобщение в таба, не празен списък', !!doc.getElementById('kasa-api-err') && /отказан/.test(mk.textContent) && !/Няма записи/.test(mk.textContent));
    ok('отказ → червен toast', h.calls.toast.some(t => /не се заредиха/.test(t)));
    h.api.calls.length = 0;
    let reason = null;
    w.kasaApi('day', { store: KR, date: Y }).then(() => { reason = 'resolve'; }, e => { reason = e.reason; });
    await settle();
    realClick(w, doc.getElementById('kasa-reauth-cancel'));
    await settle();
    ok('kasaApi при отказ → отхвърля с reauth_cancelled (грешка към извикващия)', reason === 'reauth_cancelled', reason);
    ok('startApp() НЕ е викан и при отказ', h.api.startApp === 0);
  }
  {
    const h = env(U.kardzhali, KR, { session: 'sess-old' });
    const w = h.w, doc = h.doc;
    await settle();
    h.api.expire = true;
    let n = 0;
    w.kasaApi('day', { store: KR, date: Y }).then(() => n++);
    w.kasaApi('doc_url', { document_id: 'doc-2' }).then(() => n++);
    await settle();
    ok('два едновременни 401 → ЕДИН модал', doc.querySelectorAll('#kasa-reauth').length === 1);
    doc.getElementById('kasa-reauth-pass').value = 'вярна';
    realClick(w, doc.getElementById('kasa-reauth-ok'));
    await settle();
    ok('… и двете заявки се повтарят и минават', n === 2);
  }
  {
    const h = env(U.kardzhali, KR, { session: 'sess-old' });
    const w = h.w, doc = h.doc;
    await settle();
    h.api.expire = true;
    h.api.authReply = b => ({ ok: true, session: 'sess-new', user: { id: 'u-other', email: 'drug@temax.bg' } });
    let reason = null;
    w.kasaApi('day', { store: KR, date: Y }).then(() => { reason = 'resolve'; }, e => { reason = e.reason; });
    await settle();
    doc.getElementById('kasa-reauth-pass').value = 'x';
    realClick(w, doc.getElementById('kasa-reauth-ok'));
    await settle();
    ok('друг потребител → изход и грешка, пропускът не е подменен', h.api.logout === 1 && reason === 'reauth_other_user' && w.currentSession !== 'sess-new', [h.api.logout, reason]);
  }

  section('2б. Паролата от модала — само в POST към auth-login');
  {
    /* Шпиони върху ВСИЧКО, през което паролата би могла да изтече: всяка
       мрежова заявка (тяло и адрес), localStorage/sessionStorage, console,
       logAudit (и POST към audit_log), DOM-ът след затваряне. Двете пароли
       са уникални низове, за да не съвпаднат случайно с друг текст. */
    const BAD = 'Грешна-Парола-551', GOOD = 'Вярна-Парола-987';
    const h = env(U.kardzhali, KR, { session: 'sess-old' });
    const w = h.w, doc = h.doc;
    await settle();
    h.api.authReply = b => b.password === GOOD
      ? { ok: true, session: 'sess-new', user: { id: w.currentUser.id, email: b.email } }
      : { ok: false, reason: 'bad_password', message: 'Грешен имейл или парола.' };
    const net = [], store = [], cons = [], audits = [];
    const f0 = w.fetch;
    w.fetch = function (url, init) { net.push({ url: String(url), body: init && init.body ? String(init.body) : '' }); return f0.apply(this, arguments); };
    ['setItem'].forEach(m => {
      const o = w.Storage.prototype[m];
      w.Storage.prototype[m] = function (k, v) { store.push(String(k) + '=' + String(v)); return o.apply(this, arguments); };
    });
    ['log', 'error', 'warn', 'info', 'debug'].forEach(m => {
      const o = w.console[m];
      w.console[m] = function () { cons.push([].slice.call(arguments).map(x => { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); } }).join(' ')); return o && o.apply(this, arguments); };
    });
    const la = w.logAudit;
    w.logAudit = function (ev, extra) { audits.push(JSON.stringify([ev, extra || null])); return la.apply(this, arguments); };
    const leaks = (arr, s) => arr.filter(x => x.indexOf(s) >= 0);

    h.api.expire = true;
    w.kasaApi('day', { store: KR, date: Y }).then(() => {}, () => {});
    await settle();
    let pass = doc.getElementById('kasa-reauth-pass');
    pass.value = BAD;
    realClick(w, doc.getElementById('kasa-reauth-ok'));
    await settle();
    ok('грешна парола → полето е изчистено, модалът остава', pass.value === '' && !!doc.getElementById('kasa-reauth'));
    pass = doc.getElementById('kasa-reauth-pass');
    pass.value = GOOD;
    realClick(w, doc.getElementById('kasa-reauth-ok'));
    await settle();
    ok('успех → полето е изчистено (и самият елемент, преди да се махне)', pass.value === '' && !doc.getElementById('kasa-reauth'));

    /* Отказ: нов 401, паролата е въведена, но не е пратена. */
    h.api.expire = true; w.currentSession = 'sess-old2';
    h.api.authReply = null;
    let rej = null;
    w.kasaApi('day', { store: KR, date: Y }).then(() => {}, e => { rej = e.reason; });
    await settle();
    const pass2 = doc.getElementById('kasa-reauth-pass');
    pass2.value = GOOD;
    realClick(w, doc.getElementById('kasa-reauth-cancel'));
    await settle();
    ok('отказ → полето е изчистено, грешка към извикващия', pass2.value === '' && rej === 'reauth_cancelled');

    const authCalls = net.filter(n => n.url.indexOf('/functions/v1/auth-login') >= 0);
    ok('паролите са пратени точно 2 пъти — и двата пъти POST към auth-login', authCalls.length === 2 &&
      authCalls[0].body.indexOf(BAD) >= 0 && authCalls[1].body.indexOf(GOOD) >= 0);
    const other = net.filter(n => n.url.indexOf('/functions/v1/auth-login') < 0);
    ok('в никоя друга заявка (адрес или тяло) — вкл. kasa-api и audit_log', leaks(other.map(n => n.url + ' ' + n.body), BAD).length === 0 &&
      leaks(other.map(n => n.url + ' ' + n.body), GOOD).length === 0, other.length);
    ok('отказаната парола не е пратена никъде', authCalls.length === 2);
    ok('нищо в localStorage / sessionStorage', leaks(store, BAD).length === 0 && leaks(store, GOOD).length === 0, store);
    ok('нищо в console', leaks(cons, BAD).length === 0 && leaks(cons, GOOD).length === 0);
    ok('нищо в logAudit (вход и неуспешен вход са записани, без паролата)', audits.length === 2 && leaks(audits, BAD).length === 0 && leaks(audits, GOOD).length === 0, audits);
    ok('нищо в DOM-а след затваряне', doc.documentElement.outerHTML.indexOf(GOOD) < 0 && doc.documentElement.outerHTML.indexOf(BAD) < 0);
    let ls = '';
    try { for (let i = 0; i < w.localStorage.length; i++) ls += w.localStorage.getItem(w.localStorage.key(i)); for (let i = 0; i < w.sessionStorage.length; i++) ls += w.sessionStorage.getItem(w.sessionStorage.key(i)); } catch (e) {}
    ok('съдържанието на двете хранилища — без паролата', ls.indexOf(GOOD) < 0 && ls.indexOf(BAD) < 0);
  }

  /* ─────────────────────────────────────────────────────────── */
  section('3. Същият екран по двата пътя (R1, R12, R13, R28, R29)');
  async function kasaScreen(settings) {
    const h = env(U.kardzhali, settings);
    h.w.kasaView = 'pos';
    h.w.loadKasa();
    /* документите идват след setTimeout(initKasaDocsView, 50) в renderKasa */
    await until(() => h.doc.querySelectorAll('#docs-section-pos button').length === 2);
    await settle();
    return h;
  }
  const oldK = await kasaScreen(undefined);
  const newK = await kasaScreen(KR);
  ok('стар път: kasa-api не е викан', oldK.api.calls.length === 0);
  ok('нов път: нито една заявка към /rest/v1/kasa_*', newK.calls.get.filter(u => /\/rest\/v1\/kasa_/.test(u)).length === 0, newK.calls.get.filter(u => /kasa_/.test(u)));
  ok('нов път: kasa-api range (R1) + day (R2, R13 — една заявка за деня)', apiActs(newK, 'range').length === 1 && apiActs(newK, 'day').length >= 1);
  const oh = normDocs(oldK.doc.getElementById('mod-kasa').innerHTML), nh = normDocs(newK.doc.getElementById('mod-kasa').innerHTML);
  ok('R1: Каса (ПОС) — екранът е същият (HTML, без onclick на „Виж“)', oh === nh && oh.length > 1000, [oh.length, nh.length]);
  ok('R1: върнатият отчет се вижда и по новия път', /Върнат/.test(newK.doc.getElementById('mod-kasa').textContent));
  const viewOld = oldK.doc.querySelectorAll('#docs-section-pos button'), viewNew = newK.doc.querySelectorAll('#docs-section-pos button');
  ok('R13: документите — същите два, в същия ред (най-новият първи)', viewNew.length === 2 && viewOld.length === 2 &&
    /doc-2/.test(viewNew[0].getAttribute('onclick')) && /pos_other_2/.test(viewOld[0].getAttribute('onclick')));
  ok('R12: „Виж“ по новия път носи id, не пътя', /kasaOpenDocById\('doc-2'\)/.test(viewNew[0].getAttribute('onclick')));
  realClick(newK.w, viewNew[0]);
  await settle();
  ok('R12: клик → doc_url с id → нов раздел с подписания линк', apiActs(newK, 'doc_url').some(c => c.document_id === 'doc-2') &&
    newK.api.opened.some(o => o.args[0] === 'https://signed.example/doc-2'));
  ok('R12: по новия път няма заявка към /storage/v1/', !newK.calls.post.some(p => /storage\/v1/.test(p.url)));

  /* Глaвна каса, Равнение, Сторно по двата пътя */
  for (const view of ['glavna', 'zoborot', 'storno']) {
    oldK.w.kasaTab(view); newK.w.kasaTab(view);
    await settle(20);
    const a = normDocs(oldK.doc.getElementById('mod-kasa').innerHTML), b = normDocs(newK.doc.getElementById('mod-kasa').innerHTML);
    ok(view + ': екранът е същият по двата пътя', a === b && a.length > 500, [a.length, b.length]);
  }
  ok('нов път след табовете: пак нула заявки към /rest/v1/kasa_*', newK.calls.get.filter(u => /\/rest\/v1\/kasa_/.test(u)).length === 0);
  /* R11 — редовете на сторно във формата */
  newK.w.openStornoForm('11111111-1111-4111-8111-111111111111');
  oldK.w.openStornoForm('11111111-1111-4111-8111-111111111111');
  await settle();
  ok('R11: storno_items през kasa-api', apiActs(newK, 'storno_items').length === 1 && JSON.stringify(newK.w.stornoFormReturned) === JSON.stringify(oldK.w.stornoFormReturned),
    newK.w.stornoFormReturned);

  async function bannerText(user, settings) {
    const h = env(user, settings, { stornoAll: true });
    await settle();
    h.w.showLoginBanner();
    await settle(20);
    return { h: h, t: h.doc.getElementById('notif-banner').textContent };
  }
  const bo = await bannerText(U.kardzhali, undefined), bn = await bannerText(U.kardzhali, KR);
  ok('R28: банерът „върнат за корекция“ е същият по двата пътя', bo.t === bn.t && /върнат за корекция/.test(bn.t), bn.t.slice(0, 120));
  ok('R28: по новия път — banner, без /rest/v1/kasa_reports', apiActs(bn.h, 'banner').length === 1 && restGets(bn.h, 'kasa_reports').length === 0);
  const ao = await bannerText(U.admin, undefined), an = await bannerText(U.admin, 'all');
  ok('R29: банерът за сторно (admin) е същият по двата пътя', ao.t === an.t && /2 сторно бележки/.test(an.t), an.t.slice(0, 160));
  ok('R29: по новия път — ЕДНА заявка banner за двете карти, без /rest/v1/kasa_storno', apiActs(an.h, 'banner').length === 1 && restGets(an.h, 'kasa_storno').length === 0);
  const ap = await bannerText(U.admin, KR);
  ok('R29: admin при „Кърджали“ — сторно банерът е по стария път (обхватът е „всички“)', restGets(ap.h, 'kasa_storno').length === 1 && /2 сторно бележки/.test(ap.t));

  /* ─────────────────────────────────────────────────────────── */
  section('4. Грешка от kasa-api → видимо, никога празен списък');
  {
    const h = env(U.kardzhali, KR);
    await settle();
    h.api.fail = { status: 500, body: { ok: false, reason: 'internal', message: 'Вътрешна грешка.' } };
    h.w.loadKasa();
    await settle(20);
    const mk = h.doc.getElementById('mod-kasa');
    ok('Каса: съобщение в таба с причината', !!h.doc.getElementById('kasa-api-err') && /Вътрешна грешка/.test(mk.textContent));
    ok('Каса: НЕ „Няма записи“ / празна таблица', !/Няма записи/.test(mk.textContent));
    ok('Каса: червен toast', h.calls.toast.some(t => /Касовите данни не се заредиха: Вътрешна грешка/.test(t)));
    ok('Каса: бутон „Опитай пак“', !!H.btn(mk, 'Опитай пак'));
    mk.innerHTML = '<div id="marker">ФОРМА</div>';
    h.w.kasaStorno = F.kasa_storno.slice();
    h.w.openStornoForm('11111111-1111-4111-8111-111111111111');
    await settle();
    ok('R11: грешка → сторно формата НЕ се отваря с празни редове', !!h.doc.getElementById('marker') && h.w.kasaStornoEditId === null);
    h.w.kasaView = 'storno'; h.w.loadStorno();
    await settle();
    ok('R10: сторно списъкът → съобщение, не празен списък', !!h.doc.getElementById('kasa-api-err'));
  }
  {
    const h = env(U.admin, 'all');
    await settle();
    h.api.fail = { status: 500, body: { ok: false, reason: 'internal', message: 'Вътрешна грешка.' } };
    const hw = h.doc.getElementById('mod-history');
    hw.innerHTML = '<div id="daily-overview"></div>';
    h.w.loadDailyOverview(Y);
    await settle(20);
    const t = h.doc.getElementById('daily-overview') ? h.doc.getElementById('daily-overview').textContent : '';
    ok('R14: дневният преглед → „Грешка при зареждане. Вътрешна грешка.“', /Грешка при зареждане\. Вътрешна грешка/.test(t), t.slice(0, 120));
    h.w.showLoginBanner();
    await settle(20);
    const bt = h.doc.getElementById('notif-banner').textContent;
    ok('R28/R29: банерът → карта „Касовите известия не се заредиха“ (веднъж)', (bt.match(/Касовите известия не се заредиха/g) || []).length === 1, bt.slice(0, 200));
  }

  /* ─────────────────────────────────────────────────────────── */
  section('5. Генерирани прозорци — печат (R7/R8) и детайл (R15/R16)');
  function fakeWin() {
    const fw = { html: '', closed: false, focus() {}, close() {},
      document: { head: { innerHTML: '' }, body: { innerHTML: '' }, write(s) { fw.html += s; }, open() { fw.html = ''; }, close() {} } };
    return fw;
  }
  async function detail(settings) {
    const h = env(U.admin, settings);
    await settle();
    const fw = fakeWin();
    h.w.open = () => fw;
    h.w.openKasaDetail(KR, Y);
    await settle(20);
    return { h: h, html: fw.html };
  }
  const dOld = await detail(undefined), dNew = await detail(KR);
  ok('детайл, стар път: прозорецът подписва сам с anon ключа (документирано, етап 2 го спира)', /eyJhbGci/.test(dOld.html) && /storage\/v1\/object\/sign/.test(dOld.html));
  ok('детайл, kasa-api: без anon ключ и без заявка към storage в прозореца', !/eyJhbGci/.test(dNew.html) && !/storage\/v1/.test(dNew.html) && /kasaOpenDocById/.test(dNew.html));
  ok('детайл, kasa-api: данните са от day (нула /rest/v1/kasa_*)', apiActs(dNew.h, 'day').length === 1 && dNew.h.calls.get.filter(u => /\/rest\/v1\/kasa_/.test(u)).length === 0);
  ok('детайл: „Виж“ носи id', /openKasaDocFromDetail\('doc-1'\)/.test(dNew.html));
  ok('детайл: съдържанието (без скрипта и „Виж“) е същото по двата пътя',
    normDocs(dOld.html.split('<script>')[0]).replace(/openKasaDocFromDetail\('[^']*'\)/g, 'X') === normDocs(dNew.html.split('<script>')[0]).replace(/openKasaDocFromDetail\('[^']*'\)/g, 'X'));
  {
    /* Функцията в прозореца, изпълнена срещу основната страница като opener. */
    const src = dNew.h.w.kasaDocOpenerFn('openKasaDocFromDetail');
    const tab = { location: { href: '' }, closed: false, close() { this.closed = true; } };
    const child = { opener: dNew.h.w, open: () => tab };
    const fn = new Function('window', 'alert', src + '; return openKasaDocFromDetail;')(child, () => {});
    fn('doc-1');
    await settle();
    ok('детайл: „Виж“ → празен раздел веднага, основната страница го насочва', tab.location.href === 'https://signed.example/doc-1' &&
      apiActs(dNew.h, 'doc_url').some(c => c.document_id === 'doc-1'));
    const tab2 = { location: { href: '' }, closed: false, close() { this.closed = true; } };
    const alerts = [];
    const orphan = new Function('window', 'alert', src + '; return openKasaDocFromDetail;')({ opener: null, open: () => tab2 }, m => alerts.push(m));
    orphan('doc-1');
    ok('детайл: затворен портал → разделът се затваря и има съобщение', tab2.closed && alerts.length === 1);
  }
  {
    const h = env(U.kardzhali, KR);
    await settle();
    h.w.kasaReports = F.kasa_reports.slice();
    const fw = fakeWin();
    h.w.open = () => fw;
    h.w.printKasaReport();
    await settle(20);
    ok('печат, kasa-api: данните от day, без anon ключ, „Виж“ с id', apiActs(h, 'day').length === 1 && !/eyJhbGci/.test(fw.html) &&
      /openDocFromPrint\('doc-1'\)/.test(fw.html) && /kasaOpenDocById/.test(fw.html), fw.html.length);
    h.api.fail = { status: 500, body: { ok: false, reason: 'internal', message: 'Вътрешна грешка.' } };
    const fw2 = fakeWin(); let opened = 0;
    h.w.open = () => { opened++; return fw2; };
    h.w.printKasaReport();
    await settle(20);
    ok('печат: грешка → няма непълен печат, има toast', opened === 0 && h.calls.toast.some(t => /не се заредиха/.test(t)));
  }

  /* ─────────────────────────────────────────────────────────── */
  section('6. Интеграция: kasa + kasa-docs + history + notifications заедно');
  {
    const h = env(U.admin, 'all');
    await settle();
    ['kasaApi', 'kasaApiOn', 'kasaDayGet', 'kasaRangeGet', 'kasaOpenDocById', 'showLoginBanner', 'runHistorySearch', 'stornoIndicator', 'loadDailyOverview']
      .forEach(f => ok('глобалната ' + f + ' е функция', typeof h.w[f] === 'function'));
    h.w.loadHistory();
    await until(() => { const c = h.doc.getElementById('daily-overview-content'); return !!c && /Кърджали/.test(c.textContent); });
    await settle();
    ok('История → дневният преглед (kasa-docs) минава през kasa-api range', apiActs(h, 'range').some(c => c.kinds.join() === 'reports,zoborot,documents' && c.from === c.to));
    const ow = h.doc.getElementById('daily-overview-content');
    ok('дневният преглед е изрисуван (Кърджали в таблицата)', !!ow && /Кърджали/.test(ow.textContent));
    const f = h.doc.getElementById('h-from'), t = h.doc.getElementById('h-to'), ty = h.doc.getElementById('h-type');
    if (ok('формата за търсене в История съществува', !!(f && t && ty))) {
      f.value = dayOffset(-30); t.value = Y; ty.value = 'kasa';
      const before = apiActs(h, 'range').length, restBefore = restGets(h, 'kasa_reports').length;
      h.w.runHistorySearch();
      await settle(20);
      ok('История (history.js, 1б-3) минава през kasa-api: range с kinds [reports], 0 заявки към /rest/v1/kasa_reports', restGets(h, 'kasa_reports').length === restBefore && apiActs(h, 'range').slice(before).some(c => c.kinds.join() === 'reports'));
    }
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
