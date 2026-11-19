/* store-open-items-regional.test.js — bulletin-notify, тема
   store_open_items_regional „Незавършено за вашите обекти" (v26, 19.11.2026).

   Решения на Тенчо (19.11.2026): ЕДНО писмо на регионален, с част за всеки
   негов обект — същото съдържание като писмото на обекта (една функция:
   soiPartsFor → soiStoreBody); отделна тема, делник 08:00; регионален без
   нищо — без писмо. Получатели — users.is_regional + assigned_stores (БЕЗ
   notify_groups 'regional') + app_settings.soi_regional_extra (същият имейл →
   обектите се сливат; акаунтът на Тенчо не се пипа).

   Проверява:
     1 — получателите (dry_run): двама регионални със застъпващи се обекти —
         всеки своите, по азбучен ред; складовете (EXCLUDED_STORES) — вън;
         неактивен / без обекти / само notify_groups 'regional' — вън;
         допълнителният от soi_regional_extra; сливане с регионален; обект без
         редове — пропуснат; регионален без нищо — без писмо.
     2 — истинско пращане: едно писмо на регионален, to = [имейл], тема, лог
         „<дата>|regional|<имейл>"; второ пускане — нищо.
     3 — съдържанието на частта = съдържанието на писмото на обекта (същата
         функция, сравнено буква по буква с писмото на store_open_items).
     4 — таван: повторен опит и успех; и при втория → без писмо, last_run_at
         не е записан, следващото събуждане праща само на него.
     5 — test_email; recipients_only; невалиден soi_regional_extra; exclude;
         неработен ден; as_of; isDue в 08:00.

   Мутации (19.11.2026) — всяка СЪБАРЯ теста (exit 1):
     Р1 получатели по notify_groups 'regional' вместо is_regional: пада 1, 2, 5;
     Р2 без сливане (вторият източник за същия имейл се пренебрегва): пада 1;
     Р3 обект без редове не се пропуска: пада 1 и 3;
     Р4 обектите не се сортират: пада 1 и 3;
     Р5 частта е само първата секция (не soiStoreBody): пада 3;
     Р6 без филтъра EXCLUDED_STORES: пада 1;
     Р7 по писмо на обект вместо на регионален: пада 2;
     Р8 (v28) без reqScope — заявка между два обекта на регионален и при
         изпълнителя: пада 3б.

   Пускане:  node tests/store-open-items-regional.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { ok, section, report } = require('../.claude/skills/tmax-jsdom-test/harness');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const SRC_PATH = process.env.SOI_SRC || path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts');
const _w = process.emitWarning; process.emitWarning = function () {};
const JS = nodeModule.stripTypeScriptTypes(fs.readFileSync(SRC_PATH, 'utf8').replace(/^import\s.*$/mg, ''));
process.emitWarning = _w;
const clone = x => JSON.parse(JSON.stringify(x));

/* ── Фалшив supabase клиент (същият като в store-open-items.test.js) ── */
function fakeSb(db, log) {
  const has = v => v !== null && v !== undefined;
  const pass = (row, f) => {
    const v = row[f[1]];
    switch (f[0]) {
      case 'eq': return v === f[2];
      case 'in': return f[2].indexOf(v) >= 0;
      case 'gte': return has(v) && String(v) >= String(f[2]);
      case 'lte': return has(v) && String(v) <= String(f[2]);
      case 'not':
        if (f[2] === 'is') return has(v);
        if (f[2] === 'in') return String(f[3]).replace(/[()]/g, '').split(',').indexOf(v) < 0;
        return true;
      default: return true;
    }
  };
  return {
    from(table) {
      const q = { table, filters: [], op: 'select', range: null, lim: null };
      const self = new Proxy({}, {
        get(_t, k) {
          if (k === 'then') {
            return (res, rej) => {
              log.push(q);
              const arr = db[table] || (db[table] = []);
              let out;
              if (q.op === 'insert') {
                if (table === 'notification_log' && arr.some(r => r.topic_key === q.row.topic_key && r.ref_key === q.row.ref_key)) {
                  out = { data: null, error: { code: '23505', message: 'duplicate key' } };
                } else { arr.push(Object.assign({}, q.row)); out = { data: null, error: null }; }
              } else if (q.op === 'delete') {
                db[table] = arr.filter(r => !q.filters.every(f => pass(r, f))); out = { error: null };
              } else if (q.op === 'update') {
                arr.filter(r => q.filters.every(f => pass(r, f))).forEach(r => Object.assign(r, q.row)); out = { error: null };
              } else {
                let rows = arr.filter(r => q.filters.every(f => pass(r, f)));
                if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
                if (q.lim) rows = rows.slice(0, q.lim);
                /* select с изброени колони — само тях (както PostgREST): мутация, която
                   чете колона извън select-а, я вижда undefined. */
                if (q.select && q.select !== '*') {
                  const cols = String(q.select).split(',').map(c => c.trim());
                  rows = rows.map(r => { const o = {}; cols.forEach(c => { if (c in r) o[c] = r[c]; }); return o; });
                }
                out = { data: clone(rows), error: null };
              }
              return Promise.resolve(out).then(res, rej);
            };
          }
          return (...a) => {
            if (k === 'select') q.select = a[0];
            else if (['eq', 'in', 'gte', 'lte'].indexOf(k) >= 0) q.filters.push([k, a[0], a[1]]);
            else if (k === 'not') q.filters.push(['not', a[0], a[1], a[2]]);
            else if (k === 'range') q.range = [a[0], a[1]];
            else if (k === 'limit') q.lim = a[0];
            else if (k === 'insert') { q.op = 'insert'; q.row = a[0]; }
            else if (k === 'delete') q.op = 'delete';
            else if (k === 'update') { q.op = 'update'; q.row = a[0]; }
            return self;
          };
        },
      });
      return self;
    },
  };
}

/* sendThrow(toJoined) → Error (хвърля се ТОЙ — RateLimitError) или true (мрежова грешка). */
function load(db, clock, sendThrow) {
  const posts = [], log = [], errors = [], waits = [];
  let handler = null;
  const Real = Date, fixed = new Real(clock).getTime();
  class FakeDate extends Real {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  const ctx = {
    Date: FakeDate, Response, Intl, JSON, Math, Object, Array, String, Number, Promise, Error, RegExp, Set, Map, encodeURIComponent,
    setTimeout: (fn, ms) => { waits.push(ms); fn(); return 0; },
    console: { log() {}, warn() {}, error: (...a) => { errors.push(a.join(' ')); } },
    Deno: { env: { get: k => (k === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'KEY') }, serve: fn => { handler = fn; } },
    createClient: () => fakeSb(db, log),
    fetch: (url, init) => {
      const body = JSON.parse((init && init.body) || '{}');
      const toS = [].concat(body.to).join(',');
      const th = sendThrow && body.type === 'email' && sendThrow(toS, body);
      if (th) return Promise.reject(th instanceof Error ? th : new TypeError('error sending request'));
      posts.push({ url, body });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('x') });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(JS, ctx, { filename: 'bulletin-notify.js' });
  const call = async body => (await handler({ method: 'POST', json: () => Promise.resolve(body) })).json();
  return { ctx, call, posts, log, db, errors, waits, mails: () => posts.filter(p => p.body.type === 'email') };
}

/* ── Данни ──────────────────────────────────────────────────────────── */
const TR = 'Троян', LV = 'Ловеч', KJ = 'Кърджали', SL = 'Сливен', MO = 'Монтана', RA = 'Раднево', WH = 'Логистичен склад Добрич';
const U = (email, display_name, role, store_name, over) => Object.assign({ email, display_name, role, store_name, active: true, notify_groups: [], assigned_stores: [], is_regional: false }, over || {});
const USERS = [
  U('troyan@temax.bg', 'Управител Троян', 'manager', TR),
  U('lovech@temax.bg', 'Управител Ловеч', 'manager', LV),
  U('kardzhali@temax.bg', 'Управител Кърджали', 'manager', KJ),
  U('sliven@temax.bg', 'Инфо Сливен', 'info', SL),
  U('montana@temax.bg', 'Управител Монтана', 'manager', MO),
  /* Регионалните — застъпват се в Ловеч. */
  U('reg.a@temax.bg', 'А. Регионална', 'accounting', 'Централен офис', { is_regional: true, notify_groups: ['regional'], assigned_stores: [TR, LV, WH] }),
  U('reg.b@temax.bg', 'Б. Регионален', 'admin', 'Централен офис', { is_regional: true, notify_groups: ['regional'], assigned_stores: [LV, KJ] }),
  U('reg.c@temax.bg', 'В. Без редове', 'accounting', 'Централен офис', { is_regional: true, assigned_stores: [MO] }),
  U('reg.off@temax.bg', 'Г. Неактивна', 'accounting', 'Централен офис', { is_regional: true, active: false, assigned_stores: [TR] }),
  U('reg.empty@temax.bg', 'Д. Без обекти', 'accounting', 'Централен офис', { is_regional: true, assigned_stores: [] }),
  U('grp.only@temax.bg', 'Е. Само група', 'accounting', 'Централен офис', { is_regional: false, notify_groups: ['regional'], assigned_stores: [SL] }),
  U('ten.tenev@temax.bg', 'Тен Тенев', 'admin', 'Централен офис'),
];
const TOPIC = { key: 'store_open_items_regional', label: 'Незавършено — регионални', schedule_type: 'daily', weekdays: [1, 2, 3, 4, 5],
  scheduled_time: '08:00:00', active: false, test_email: null, sort_order: 13 };
const STORE_TOPIC = { key: 'store_open_items', label: 'Незавършено за обекта', schedule_type: 'daily', weekdays: [1, 2, 3, 4, 5],
  scheduled_time: '07:45:00', active: false, test_email: null, sort_order: 12 };
const EXTRA = JSON.stringify([{ email: 'ten.tenev@temax.bg', stores: [KJ, RA] }, { email: 'REG.A@temax.bg', stores: [SL] }]);

/* Понеделник 16.11.2026, 08:00 София (06:00 UTC). */
const MON = '2026-11-16T06:00:00Z';
const BULLETIN = { id: 'b47', week_number: 47, year: 2026, status: 'published' };
const TASKS = [
  { id: 't1', bulletin_id: 'b47', title: 'Ревизия <група А>', due_date: '2026-11-13', target_stores: [TR, LV, KJ], created_by: 'Миглена' },
  { id: 't2', bulletin_id: 'b47', title: 'Снимки на витрината', due_date: '2026-11-14', target_stores: [TR], created_by: 'Миглена' },
];
const O = (id, over) => Object.assign({ id, in_num: id, store_name: TR, fulfiller: null, customer_name: 'Клиент ' + id,
  delivery: '2026-11-16', status: 'pending', co_eta: null, product: 'Стока ' + id, items: null, date: '2026-11-01' }, over || {});
const ORDERS = [
  O('A1', { delivery: '2026-11-13' }),
  O('A2', { store_name: LV, delivery: '2026-11-17' }),
  O('A3', { store_name: WH, delivery: '2026-11-10' }),   // складът — не влиза никъде
];
const SD_ROWS = [
  { id: 'S1', store_name: SL, supplier: 'Доставчик', material_code: '1001', material_name: 'Артикул S1', quantity: 1, unit: 'бр',
    order_number: 'PO-1', type: 'writein', status: 'pending', resolved_at: '2026-11-12T08:00:00Z', created_at: '2026-11-01T08:00:00Z' },
];
function db(over) {
  return Object.assign({
    users: clone(USERS), notification_topics: [clone(TOPIC), clone(STORE_TOPIC)],
    notification_matrix: [{ topic_key: 'store_open_items', group_key: 'store', channel: 'email', scope: 'own_stores' }],
    notification_overrides: [], notification_log: [], app_settings: [{ key: 'soi_regional_extra', value: EXTRA }],
    bulletins: [clone(BULLETIN)], bulletin_tasks: clone(TASKS), task_completions: [],
    recurring_tasks: [], recurring_task_periods: [], recurring_task_versions: [], recurring_task_skips: [],
    client_orders: clone(ORDERS), stock_differences: clone(SD_ROWS),
  }, over || {});
}
const RLE = ms => { const e = new Error('Rate limit exceeded for trace 01a1ed2f. Retry after ' + ms + 'ms.'); e.name = 'RateLimitError'; return e; };
const mailTo = (L, em) => L.mails().filter(m => [].concat(m.body.to).join(',') === em)[0];

(async function () {
  section('1. Получатели и обекти (dry_run, понеделник 16.11.2026)');
  {
    const L = load(db(), MON);
    const r = await L.call({ topic_key: 'store_open_items_regional', dry_run: true });
    const d = r.result || {};
    const by = {}; (d.planned || []).forEach(p => { by[p.email.toLowerCase()] = p; });
    const st = em => ((by[em] || {}).obekti || []).map(o => o.obekt).join(',');
    ok('dry_run минава, нищо не е пратено и писано', r.ok === true && d.dry_run === true && L.posts.length === 0 && L.log.every(q => q.op === 'select'), JSON.stringify(r).slice(0, 300));
    ok('А: Ловеч, Сливен (от soi_regional_extra — сливане), Троян — азбучен ред; складът — вън', st('reg.a@temax.bg') === [LV, SL, TR].join(','), st('reg.a@temax.bg'));
    ok('А: източникът е regional+extra, обектите — Ловеч, Сливен, Троян (без склада)', (by['reg.a@temax.bg'] || {}).source === 'regional+extra' &&
      JSON.stringify((by['reg.a@temax.bg'] || {}).obekti_vsichki) === JSON.stringify([LV, SL, TR]), JSON.stringify(by['reg.a@temax.bg']));
    ok('Б: Кърджали, Ловеч — застъпването в Ловеч е и при двамата', st('reg.b@temax.bg') === [KJ, LV].join(','), st('reg.b@temax.bg'));
    ok('Тенчо (soi_regional_extra): Кърджали; Раднево без редове — пропуснат', st('ten.tenev@temax.bg') === KJ &&
      JSON.stringify((by['ten.tenev@temax.bg'] || {}).obekti_vsichki) === JSON.stringify([KJ, RA]), JSON.stringify(by['ten.tenev@temax.bg']));
    ok('В (само Монтана, без редове) — без писмо, в bez_nishto', !by['reg.c@temax.bg'] && (d.bez_nishto || []).indexOf('reg.c@temax.bg') >= 0, JSON.stringify(d.bez_nishto));
    ok('неактивна / без обекти / само notify_groups „regional" — вън', !by['reg.off@temax.bg'] && !by['reg.empty@temax.bg'] && !by['grp.only@temax.bg'] &&
      (d.bez_nishto || []).every(e => ['reg.off@temax.bg', 'reg.empty@temax.bg', 'grp.only@temax.bg'].indexOf(e) < 0), JSON.stringify(Object.keys(by)));
    ok('3 регионални с писмо', d.regionalni === 3, String(d.regionalni));
    const la = ((by['reg.a@temax.bg'] || {}).obekti || []).filter(o => o.obekt === LV)[0] || {};
    ok('редове по обект и по секция (А / Ловеч: задачи 1, заявки 1)', la.redove === 2 && la.zadachi && la.zayavki, JSON.stringify(la));
    ok('без предупреждения при валиден soi_regional_extra', Array.isArray(d.warnings) && d.warnings.length === 0, JSON.stringify(d.warnings));
  }

  section('2. Истинско пращане — едно писмо на регионален');
  {
    const d = db();
    const L = load(d, MON);
    const r = (await L.call({ topic_key: 'store_open_items_regional' })).result || {};
    const tos = L.mails().map(m => JSON.stringify(m.body.to)).sort();
    ok('3 писма, to = [имейла] (масив с един адрес)', L.mails().length === 3 && L.mails().every(m => Array.isArray(m.body.to) && m.body.to.length === 1) &&
      tos.join(' ') === '["reg.a@temax.bg"] ["reg.b@temax.bg"] ["ten.tenev@temax.bg"]', tos.join(' '));
    ok('темата: „ТеМАХ — Незавършено за вашите обекти (16.11)"', L.mails().every(m => m.body.subject === 'ТеМАХ — Незавършено за вашите обекти (16.11)'), L.mails()[0] && L.mails()[0].body.subject);
    ok('лог „2026-11-16|regional|<имейл>" ×3', d.notification_log.map(x => x.ref_key).sort().join(',') ===
      '2026-11-16|regional|reg.a@temax.bg,2026-11-16|regional|reg.b@temax.bg,2026-11-16|regional|ten.tenev@temax.bg', JSON.stringify(d.notification_log));
    ok('резултат и last_status „ok: 3 регионални, 3 писма", last_run_at', r.regionalni === 3 && r.sent_emails === 3 && r.bez_nishto === 1 &&
      /^ok: 3 регионални, 3 писма, 0 неуспешни, 0 вече пратени/.test(d.notification_topics[0].last_status || '') && !!d.notification_topics[0].last_run_at, d.notification_topics[0].last_status);
    ok('писмото на обекта не е пипнато (store_open_items без last_run_at)', !d.notification_topics[1].last_run_at);
    const before = L.mails().length;
    const L2 = load(d, MON);
    const r2 = (await L2.call({ topic_key: 'store_open_items_regional' })).result || {};
    ok('второ пускане — нула писма, трима „вече пратени"', L2.mails().length === 0 && r2.already_sent === 3 && before === 3, JSON.stringify(r2));
  }

  section('3. Частта на обекта = писмото на обекта (същата функция)');
  {
    const d = db();
    const L = load(d, MON);
    await L.call({ topic_key: 'store_open_items_regional' });
    const regA = (mailTo(L, 'reg.a@temax.bg') || { body: { html: '' } }).body.html;
    const regB = (mailTo(L, 'reg.b@temax.bg') || { body: { html: '' } }).body.html;
    /* Писмата на обектите — от store_open_items, в същия ден. */
    const Ls = load(db(), MON);
    await Ls.call({ topic_key: 'store_open_items' });
    const storeMail = s => ((Ls.mails().filter(m => m.body.subject.indexOf('за ' + s + ' ') >= 0)[0]) || { body: { html: '' } }).body.html;
    /* Тялото на писмото на обекта — между подзаглавието и бутона. */
    /* v28: секциите на обекта стоят между маркерите на soiStoreBody. */
    const bodyOf = h => { const a = h.indexOf('<!--soi-body-->'); const b = h.indexOf('<!--/soi-body-->'); return a > 0 && b > a ? h.slice(a, b + '<!--/soi-body-->'.length) : null; };
    for (const s of [TR, LV, SL]) {
      const body = bodyOf(storeMail(s));
      ok('А / ' + s + ': частта съвпада буква по буква с писмото на обекта', !!body && body.length > 50 && regA.indexOf(body) > 0, body ? body.slice(0, 80) : 'няма писмо на обекта');
    }
    const bodyKJ = bodyOf(storeMail(KJ));
    ok('Б / Кърджали: съвпада', !!bodyKJ && regB.indexOf(bodyKJ) > 0);
    ok('А: обектите по ред — Ловеч, Сливен, Троян', regA.indexOf('>' + LV + '</div>') > 0 && regA.indexOf('>' + LV + '</div>') < regA.indexOf('>' + SL + '</div>') &&
      regA.indexOf('>' + SL + '</div>') < regA.indexOf('>' + TR + '</div>'));
    ok('А: глава „📋 Незавършено за вашите обекти" / „16.11.2026 · Ловеч, Сливен, Троян", без склада', regA.indexOf('>📋 Незавършено за вашите обекти</h1>') > 0 && regA.indexOf('>16.11.2026 · Ловеч, Сливен, Троян</p>') > 0 && regA.indexOf('Логистичен склад') < 0);
    /* v28: всяка част започва с тъмна лента с името на обекта, точно пред секциите ѝ. */
    const band = st => '<div style="margin:22px 0 2px;background:#1E2761;color:#ffffff;font-size:15px;font-weight:700;padding:9px 12px;border-radius:7px;">' + st + '</div><!--soi-body-->';
    ok('v28: лента на обекта пред всяка част (А: 3, Б: 2)', [LV, SL, TR].every(st => regA.indexOf(band(st)) > 0) && [KJ, LV].every(st => regB.indexOf(band(st)) > 0) &&
      regA.split('<!--soi-body-->').length - 1 === 3 && regB.split('<!--soi-body-->').length - 1 === 2);
    ok('v28: обвивката на отчетите (сив фон, бутон, долен ред)', regA.indexOf('<!DOCTYPE html>') === 0 && regA.indexOf('background:#e8ecf3') > 0 && regA.indexOf('Отвори в портала →') > 0 && regA.indexOf('Автоматичен репорт · ТеМАХ Портал') > 0);
    /* v28: обобщението — по ред на обект, числата = бройките на dry_run. */
    const Ld = load(db(), MON);
    const dd = (await Ld.call({ topic_key: 'store_open_items_regional', dry_run: true })).result;
    const pa = dd.planned.filter(p => p.email === 'reg.a@temax.bg')[0];
    const cnt = (o, k) => k === 'zadachi' ? (o.zadachi || {}).zadachi : Object.values(o[k] || {}).reduce((a, x) => a + x, 0);
    const rowOk = pa.obekti.every(o => regA.indexOf('>' + o.obekt + '</td>' + ['zadachi', 'zayavki', 'razliki'].map(k => { const n = cnt(o, k); return '<td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #F3F4F6;text-align:center;color:' + (n ? '#1f2937' : '#9CA3AF') + ';">' + n + '</td>'; }).join('') + '</tr>') > 0);
    ok('v28: таблицата — по ред на обект (Ловеч / Сливен / Троян), числата = секциите', rowOk && regA.indexOf('>Обект</th>') > 0 && regA.indexOf('>Обект</th>') < regA.indexOf('<!--soi-body-->'), JSON.stringify(pa.obekti));
    const tenev = (mailTo(L, 'ten.tenev@temax.bg') || { body: { html: '' } }).body.html;
    ok('Тенчо: само Кърджали, Раднево (без редове) го няма', tenev.indexOf('>' + KJ + '</div>') > 0 && tenev.indexOf(RA) < 0);
    /* Пряко: soiPartsFor е единственият път (същият обект → същото тяло). */
    const loaded = await L.ctx.soiLoadAll(L.ctx.createClient(), L.ctx.bgNow(new L.ctx.Date()));
    const own = L.ctx.soiStoreBody(L.ctx.soiPartsFor(loaded, TR).parts);
    ok('soiStoreBody(soiPartsFor(Троян)) е вътре в писмото на А и на обекта', regA.indexOf(own) > 0 && storeMail(TR).indexOf(own) > 0);
  }

  section('3б. v28 — заявка между два обекта на един регионален: веднъж, при заявителя');
  {
    /* Решение на Тенчо 19.11. A4: заявител Ловеч, изпълнител Троян — и двата са на А
       → само в частта на Ловеч; при Б (Ловеч, Кърджали) — пак при Ловеч (заявител).
       A5: заявител Троян, изпълнител Кърджали — Троян НЕ е на Б → при Б остава в
       частта на Кърджали (изпълнител). Писмата на обектите — непроменени. */
    const orders = clone(ORDERS).concat([
      O('A4', { store_name: LV, fulfiller: TR, delivery: '2026-11-13' }),
      O('A5', { store_name: TR, fulfiller: KJ, delivery: '2026-11-12' }),
    ]);
    const L = load(db({ client_orders: clone(orders) }), MON);
    await L.call({ topic_key: 'store_open_items_regional' });
    const html = em => (mailTo(L, em) || { body: { html: '' } }).body.html;
    const band = st => '<div style="margin:22px 0 2px;background:#1E2761;color:#ffffff;font-size:15px;font-weight:700;padding:9px 12px;border-radius:7px;">' + st + '</div><!--soi-body-->';
    const partOf = (h, st) => { const a = h.indexOf(band(st)); if (a < 0) return ''; const b = h.indexOf('<!--/soi-body-->', a); return h.slice(a, b); };
    const hA = html('reg.a@temax.bg'), hB = html('reg.b@temax.bg');
    const times = (h, x) => h.split(x).length - 1;
    ok('А: № A4 — веднъж в писмото, в частта на Ловеч (заявител)', times(hA, '№ A4 ') === 1 && partOf(hA, LV).indexOf('№ A4 ') > 0 && partOf(hA, TR).indexOf('№ A4 ') < 0,
      'пъти=' + times(hA, '№ A4 ') + ' ЛВ=' + (partOf(hA, LV).indexOf('№ A4 ') > 0) + ' ТР=' + (partOf(hA, TR).indexOf('№ A4 ') > 0));
    ok('Б: № A4 — веднъж, при Ловеч', times(hB, '№ A4 ') === 1 && partOf(hB, LV).indexOf('№ A4 ') > 0);
    ok('Б: № A5 (заявител Троян — не е на Б) — остава при изпълнителя Кърджали', times(hB, '№ A5 ') === 1 && partOf(hB, KJ).indexOf('№ A5 ') > 0 && partOf(hB, KJ).indexOf('Заявил: Троян') > 0);
    ok('А: № A5 — веднъж, при Троян (заявител; Кърджали не е на А)', times(hA, '№ A5 ') === 1 && partOf(hA, TR).indexOf('№ A5 ') > 0);
    /* Бройките в dry_run и в таблицата следват същото. */
    const Ld = load(db({ client_orders: clone(orders) }), MON);
    const dd = (await Ld.call({ topic_key: 'store_open_items_regional', dry_run: true })).result;
    const ob = (em, st) => ((dd.planned.filter(p => p.email === em)[0] || { obekti: [] }).obekti.filter(o => o.obekt === st)[0] || {});
    ok('dry_run А / Троян: late_ful = 0 (A4 е при Ловеч)', (ob('reg.a@temax.bg', TR).zayavki || {}).late_ful === 0, JSON.stringify(ob('reg.a@temax.bg', TR).zayavki));
    ok('dry_run А / Ловеч: late_req = 1 (A4)', (ob('reg.a@temax.bg', LV).zayavki || {}).late_req === 1, JSON.stringify(ob('reg.a@temax.bg', LV).zayavki));
    ok('dry_run Б / Кърджали: late_ful = 1 (A5)', (ob('reg.b@temax.bg', KJ).zayavki || {}).late_ful === 1, JSON.stringify(ob('reg.b@temax.bg', KJ).zayavki));
    /* Писмото на обекта — непроменено: Троян вижда A4 като изпълнител. */
    const Ls = load(db({ client_orders: clone(orders) }), MON);
    await Ls.call({ topic_key: 'store_open_items' });
    const trMail = ((Ls.mails().filter(m => m.body.subject.indexOf('за ' + TR + ' ') >= 0)[0]) || { body: { html: '' } }).body.html;
    ok('писмото на Троян (обекта) — A4 при изпълнителя, както досега', trMail.indexOf('№ A4 ') > 0 && trMail.indexOf('Заявил: Ловеч') > 0);
  }

  section('4. Таван — повторен опит (общият soiSendAll / postSendFn)');
  {
    const d = db();
    let n = 0;
    const L = load(d, MON, to => (to === 'reg.b@temax.bg' && ++n === 1 ? RLE(39698) : false));
    await L.call({ topic_key: 'store_open_items_regional' });
    ok('таван при първия опит → изчакване 39698 ms и успех', JSON.stringify(L.waits) === '[39698]' && n === 2 && L.mails().length === 3, JSON.stringify(L.waits) + ' n=' + n);
    const d2 = db();
    let m = 0, blocked = true;
    const L2 = load(d2, MON, to => (blocked && to === 'reg.b@temax.bg' ? (m++, RLE(30000)) : false));
    const r2 = (await L2.call({ topic_key: 'store_open_items_regional' })).result || {};
    ok('таван и при втория → Б без писмо, два опита, редът в лога махнат', m === 2 && JSON.stringify(r2.bez_pismo) === JSON.stringify(['Б. Регионален']) &&
      d2.notification_log.every(x => x.ref_key.indexOf('reg.b@') < 0), JSON.stringify(r2) + ' ' + JSON.stringify(d2.notification_log));
    ok('last_run_at НЕ е записан, „ГРЕШКА: … без писмо: Б. Регионален"', !d2.notification_topics[0].last_run_at &&
      /^ГРЕШКА: 2 регионални, 2 писма, 1 неуспешни/.test(d2.notification_topics[0].last_status || '') && /без писмо: Б\. Регионален/.test(d2.notification_topics[0].last_status || ''), d2.notification_topics[0].last_status);
    /* Кронът в 08:15: темата пак е due (прозорец [08:00; 08:15]), праща само Б. */
    blocked = false;
    d2.notification_topics[0].active = true;
    const L3 = load(d2, '2026-11-16T06:15:00Z');
    const r3 = ((await L3.call({})).results || []).filter(x => x.topic === 'store_open_items_regional')[0] || {};
    ok('08:15: само Б получава писмо, другите — „вече пратени"', L3.mails().length === 1 && [].concat(L3.mails()[0].body.to).join() === 'reg.b@temax.bg' && r3.already_sent === 2, JSON.stringify(r3));
    ok('08:15: last_run_at записан', !!d2.notification_topics[0].last_run_at);
  }

  section('5. Тестов режим, recipients_only, настройката, exclude, дни');
  {
    const d = db();
    d.notification_topics[0].test_email = 'tester@temax.bg';
    const L = load(d, MON);
    await L.call({ topic_key: 'store_open_items_regional' });
    ok('test_email: 3 писма до тестовия адрес, лента с името и обектите, без лог', L.mails().length === 3 &&
      L.mails().every(m => m.body.to === 'tester@temax.bg' && /ТЕСТОВ РЕЖИМ — предназначено за /.test(m.body.html)) &&
      L.mails().some(m => m.body.html.indexOf('А. Регионална &lt;reg.a@temax.bg&gt; — обекти: Ловеч, Сливен, Троян') > 0) && d.notification_log.length === 0,
      JSON.stringify(L.mails().map(m => m.body.to)));
    ok('test_email: last_run_at записан', !!d.notification_topics[0].last_run_at);
  }
  {
    const L = load(db(), MON);
    const r = await L.call({ recipients_only: true, topic_key: 'store_open_items_regional' });
    const t = (r.topics || {}).store_open_items_regional || {};
    const p = (t.personal || []).map(x => x.email.toLowerCase() + ':' + x.stores.join('/')).sort();
    ok('recipients_only: регионалните + допълнителните, обектите слети и сортирани (вкл. без редове)', p.join(' ') ===
      'reg.a@temax.bg:Ловеч/Сливен/Троян reg.b@temax.bg:Кърджали/Ловеч reg.c@temax.bg:Монтана ten.tenev@temax.bg:Кърджали/Раднево', p.join(' '));
    ok('recipients_only: own_stores, email, нищо не е писано', (t.personal || []).every(x => x.scope === 'own_stores' && x.channel === 'email') && L.posts.length === 0 && L.log.every(q => q.op === 'select'));
  }
  {
    const L = load(db({ app_settings: [{ key: 'soi_regional_extra', value: '{не е json' }] }), MON);
    const d = (await L.call({ topic_key: 'store_open_items_regional', dry_run: true })).result || {};
    ok('невалиден soi_regional_extra → предупреждение, регионалните остават, Тенчо — не', (d.warnings || []).some(w => /не е JSON масив/.test(w)) &&
      d.regionalni === 2 && !(d.planned || []).some(p => p.email === 'ten.tenev@temax.bg'), JSON.stringify(d.warnings) + ' ' + d.regionalni);
    const L2 = load(db({ app_settings: [] }), MON);
    const d2 = (await L2.call({ topic_key: 'store_open_items_regional', dry_run: true })).result || {};
    ok('без ключа → само регионалните, без предупреждение; А без Сливен', d2.regionalni === 2 && (d2.warnings || []).length === 0 &&
      ((d2.planned || []).filter(p => p.email === 'reg.a@temax.bg')[0] || { obekti: [] }).obekti.map(o => o.obekt).join(',') === [LV, TR].join(','), JSON.stringify(d2.planned && d2.planned.map(p => p.email)));
  }
  {
    const L = load(db({ notification_overrides: [{ topic_key: 'store_open_items_regional', user_email: 'Reg.B@temax.bg', mode: 'exclude' }] }), MON);
    const d = (await L.call({ topic_key: 'store_open_items_regional', dry_run: true })).result || {};
    ok('override exclude (регистър без значение) → Б вън', d.regionalni === 2 && !(d.planned || []).some(p => p.email === 'reg.b@temax.bg'), String(d.regionalni));
  }
  {
    const L = load(db(), '2026-11-21T06:00:00Z');   // събота
    const r = (await L.call({ topic_key: 'store_open_items_regional' })).result || {};
    ok('неработен ден → skipped, нищо не тръгва', /Неработен ден/.test(r.skipped || '') && L.posts.length === 0, JSON.stringify(r));
    const r2 = await L.call({ topic_key: 'store_open_items_regional', dry_run: true, as_of: '2026-11-16' });
    ok('as_of (с dry_run) важи и за тази тема', r2.bg_date === '2026-11-16' && (r2.result || {}).regionalni === 3, JSON.stringify(r2).slice(0, 200));
  }
  {
    const d = db(); d.notification_topics[0].active = true;
    const L = load(d, '2026-11-16T05:45:00Z');   // 07:45 — не е due
    const r = await L.call({});
    ok('07:45: темата не е due (часът ѝ е 08:00)', !(r.results || []).some(x => x.topic === 'store_open_items_regional') && L.mails().length === 0, JSON.stringify(r.results));
    const L2 = load(d, MON);
    const r2 = await L2.call({});
    ok('08:00: темата е due, тръгва', (r2.results || []).some(x => x.topic === 'store_open_items_regional' && x.sent_emails === 3), JSON.stringify(r2.results));
  }
  {
    const L = load(db({ users: clone(USERS).filter(u => !u.is_regional), app_settings: [] }), MON);
    const r = (await L.call({ topic_key: 'store_open_items_regional' })).result || {};
    ok('без регионални и без допълнителни → skipped, нищо не тръгва', /Няма регионални/.test(r.skipped || '') && L.posts.length === 0, JSON.stringify(r));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
