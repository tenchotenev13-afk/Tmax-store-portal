/* „Незавършено за обекта" — тема store_open_items в bulletin-notify (v19,
   15.11.2026, етап 1 от 2).

   Зарежда РЕАЛНИЯ supabase/functions/bulletin-notify/index.ts (типовете махнати
   с node:module.stripTypeScriptTypes) във vm с фалшив supabase клиент, фалшив
   часовник и стъб на fetch към resend-email, и вика истинския Deno.serve
   handler — {topic_key:'store_open_items', dry_run?}, {recipients_only}.

   Покрива:
     1. получателите — kasa, неактивен, без имейл, обект от EXCLUDED_STORES —
        извън; два управителя на един обект — и двамата; info акаунт — вътре;
        override 'exclude' — вън; матрица без имейл → skipped;
     2. секция А — само задачите на обекта; отметнатата не излиза; {skip} →
        писмото продължава със секция Б;
     3. секция Б — срок вчера / днес / втори работен ден / трети; през уикенд и
        през официален празник (24–28.12.2026); processed с co_eta (v20 — по
        ефективния срок, виж долу); postponed и arrived; заявител = изпълнител (веднъж); изпълнител с
        различен регистър и интервали; done / refused / без срок;
     4. обект без редове — без писмо; тема и съдържание (esc, без телефон, без
        клиент при изпълнителя);
     5. test_email — по едно писмо на обект до тестовия адрес, лента с
        получателите, без запис в notification_log;
     6. на живо — по писмо на адрес, лог „<дата>|<обект>"; второ пускане
        прескача; паднало пращане маха реда и last_status е „ГРЕШКА:";
     7. неработен ден (неделя, 24.12) → skipped, нищо не се праща;
     8. recipients_only — правилото по обект.

   Мутационна проверка (15.11.2026) — всяка СЪБАРЯ теста (exit 1), пусната със
   SOI_SRC=<мутирало копие>:
     М1 махнат филтър по роля (и .in('role') в заявката, и проверката в JS):
        пада 1 „kasa — извън", „override exclude" и 5 „по писмо на адрес";
     М2 „<" вместо „<=" на границата от 2 работни дни (soiIsSoon): пада 2
        ({skip} → 6 реда вместо 7) и 3 (A3, петък → вторник, 30.12);
     М3 махнато прескачането по лога (ins.error не спира): пада 5 „второ
        пускане — нула писма";
     М4 изпълнителят без trim/lower (=== вместо soiNorm): пада 2, 3 „ ТРОЯН "
        и 4 (подгрупите, броят 3 / 1 / 2 / 1).

   v20 (16.11.2026) — ЕФЕКТИВЕН СРОК: co_eta при processed с co_eta, иначе
   delivery (решение на Тенчо 16.11). Случаите: A5 (срок днес, co_eta 20.11
   след лимита → не е в писмото), A6 (минала co_eta → закъсняла, +2 от co_eta
   = lateDays на реалния reportCoOverdueSections), A15 (co_eta в лимита,
   delivery далеч → до 2 дни, двете дати; доказва и че заявката не реже по
   delivery), A16 (processed без co_eta → по delivery), A17 (очаква се от ЦО
   днес), A2 („срок днес" веднъж, без датата), подредба A17 → A10 → A15 → A18.
   Мутации (16.11.2026, М1–М4 пуснати отново — пак падат):
     М5 ефективният срок винаги delivery: пада 2, 3 (14 проверки, вкл. A5, A6);
     М6 просрочието от delivery вместо от ефективния срок: пада 3 (A6 = 7,
        разминаване с co_overdue 2 vs 7) и 4 („+2 работни дни");
     М7 върната крайна бележка „срок днес": пада 4 (A2 — два пъти, A17).

   v21 (16.11.2026) — само текст: co_eta = delivery → една дата (A19 — 17.11,
   A20 — днес); различни дати — двете (A6, A15, A17); „+1 работен ден"
   (A1, A16), „+2 работни дни" (A6).
   Мутации (16.11.2026):
     М8 винаги двете дати (без проверката за съвпадение): пада 4 (A19, A20);
     М9 винаги „работни дни": пада 4 (A1, A16 „+1 работен ден").

   v22 (17.11.2026) — 5б: fetch хвърля за един адрес (като Търговище 17.11) →
   200, останалите обекти пратени, редът в лога за обекта без писмо махнат,
   „ГРЕШКА:", last_run_at записан, console.error с текста; хвърляне при
   вписването в лога за един обект → цикълът продължава, текстът в
   last_status; общият catch на Deno.serve вика console.error.
   Мутации (17.11.2026):
     М10 sendEmail без try/catch (хвърлящ fetch изскача): пада 5б „console.error
         с текста" — try/catch на обекта поема хвърлянето (втората защита),
         затова пускането пак е 200;
     М11 без try/catch на обект: пада 5б (второто — 500, Троян без писмо,
         6 проверки);
     М12 общият catch без console.error: пада 5б („bulletin-notify 500").

   v23 (18.11.2026) — ТАВАН (~30 обаждания към resend-email на пускане):
   5 — ЕДНО писмо на обект, to = масив с адресите; обект без писмо → last_run_at
   НЕ се записва; 5в — RateLimitError при първия опит → изчакване по „Retry
   after" и успех; и при втория → обектът без писмо, редът в лога махнат,
   last_run_at не е записан, а 08:00 праща само на него (останалите — „вече
   пратени"), трето събуждане — нищо; таван 45 с; бюджет 100 с от началото на
   пускането; мрежова грешка — без повторен опит; тестов режим — непроменен
   (низ в to, last_run_at винаги); push хвърля / таван → false, не изключение.
   Фалшивият setTimeout записва ms и продължава веднага. (М10 вече е за
   try/catch в postSendFn — sendEmail няма собствен.)
   Мутации (18.11.2026; М1–М12 не са пускани отново) — всяка СЪБАРЯ теста:
     М17 по писмо на адрес (цикъл по p.to): пада 5 и 5б (8 проверки);
     М18 без повторен опит при таван: пада 5в (10);
     М19 last_run_at винаги: пада 5, 5б, 5в (6);
     М20 без горната граница 45 с: пада 5в („90000 → 45000");
     М21 повторният опит без catch: пада 5в (console.error, push таван ×2);
     М22 тестов режим без last_run_at при неуспех: пада 5в;
     М23 без бюджета на пускането: пада 5в („80 с + 39,7 с > 100 с").

   Пускане:  node tests/store-open-items.test.js .
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

/* ── Фалшив supabase клиент ─────────────────────────────────────────── */
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
              /* v22: db.__throw(table, q) → true = клиентът хвърля (не връща error). */
              if (db.__throw && db.__throw(table, q)) return Promise.reject(new Error('boom ' + table)).then(res, rej);
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

/* ── vm с часовник; sendFail(to) → true = resend-email връща 500;
   sendThrow(to) → true = fetch ХВЪРЛЯ (мрежова грешка, 17.11) ──────────── */
function load(db, clock, sendFail, sendThrow) {
  const posts = [], log = [], errors = [], waits = [];
  let handler = null;
  const Real = Date, fixed = new Real(clock).getTime();
  class FakeDate extends Real {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  const ctx = {
    Date: FakeDate, Response, Intl, JSON, Math, Object, Array, String, Number, Promise, Error, RegExp, Set, Map, encodeURIComponent,
    /* v23: изчакването при таван — записва ms и продължава веднага. */
    setTimeout: (fn, ms) => { waits.push(ms); fn(); return 0; },
    console: { log() {}, warn() {}, error: (...a) => { errors.push(a.join(' ')); } },
    Deno: { env: { get: k => (k === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'KEY') }, serve: fn => { handler = fn; } },
    createClient: () => fakeSb(db, log),
    fetch: (url, init) => {
      const body = JSON.parse((init && init.body) || '{}');
      /* v23: to е масив (едно писмо на обект) — sendFail / sendThrow получават адресите, слепени със запетая.
         sendThrow може да върне Error → хвърля се ТОЙ (RateLimitError); true → мрежова грешка. */
      const toS = [].concat(body.to).join(',');
      const th = sendThrow && (body.type === 'email' || body.type === 'push') && sendThrow(body.type === 'email' ? toS : 'push', body);
      if (th) return Promise.reject(th instanceof Error ? th : new TypeError('error sending request: connection closed before message completed'));
      posts.push({ url, body });
      const bad = sendFail && body.type === 'email' && sendFail(toS);
      return Promise.resolve({ ok: !bad, status: bad ? 500 : 200, json: () => Promise.resolve({}), text: () => Promise.resolve('x') });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(JS, ctx, { filename: 'bulletin-notify.js' });
  const call = async body => (await handler({ method: 'POST', json: () => Promise.resolve(body) })).json();
  const callRaw = async body => handler({ method: 'POST', json: () => Promise.resolve(body) });
  return { ctx, call, callRaw, posts, log, db, errors, waits, mails: () => posts.filter(p => p.body.type === 'email') };
}

/* v23: адресите на всяко писмо, слепени със запетая; писмата — по азбука, с „ | ". */
const TOS = L => L.mails().map(m => [].concat(m.body.to).join(',')).sort().join(' | ');

/* ── Данни ──────────────────────────────────────────────────────────── */
const TR = 'Троян', LV = 'Ловеч', KJ = 'Кърджали', SL = 'Сливен', CO = 'Централен офис';
const U = (email, display_name, role, store_name, over) => Object.assign({ email, display_name, role, store_name, active: true, notify_groups: [], assigned_stores: [] }, over || {});
const USERS = [
  U('troyan@temax.bg', 'Управител Троян', 'manager', TR),
  U('sklad.troyan@temax.bg', 'Склад Троян', 'sklad', TR),
  U('kasa.troyan@temax.bg', 'Каса Троян', 'kasa', TR),
  U('lovech@temax.bg', 'Управител Ловеч', 'manager', LV),
  U('old.lovech@temax.bg', 'Неактивен Ловеч', 'manager', LV, { active: false }),
  U(null, 'Склад Ловеч без имейл', 'sklad', LV),
  U('kardzhali@temax.bg', 'Управител Кърджали', 'manager', KJ),
  U('test.kardzhali@gmail.com', 'Тест', 'manager', KJ),
  U('sliven@temax.bg', 'Инфо Сливен', 'info', SL),
  U('co.manager@temax.bg', 'ЦО управител', 'manager', CO),
];
const TOPIC = { key: 'store_open_items', label: 'Незавършено за обекта', schedule_type: 'daily', weekdays: [1, 2, 3, 4, 5],
  scheduled_time: '07:45:00', active: false, test_email: null, sort_order: 12 };
const MATRIX = [{ topic_key: 'store_open_items', group_key: 'store', channel: 'email', scope: 'own_stores' }];

/* Понеделник 16.11.2026, 07:45 София (05:45 UTC). ISO седмица 47.
   Работни дни напред: 17 (вт), 18 (ср) → границата „до 2 работни дни" е 18.11. */
const MON = '2026-11-16T05:45:00Z';
const BULLETIN = { id: 'b47', week_number: 47, year: 2026, status: 'published' };
const TASKS = [
  { id: 't1', bulletin_id: 'b47', title: 'Ревизия <група А>', due_date: '2026-11-13', target_stores: [TR, LV, KJ], created_by: 'Миглена' },
  { id: 't2', bulletin_id: 'b47', title: 'Снимки на витрината', due_date: '2026-11-14', target_stores: [TR], created_by: 'Миглена' },
];
const COMPS = [{ task_id: 't1', store_name: TR, status: 'done', completion_date: '2026-11-13', postponed_to: null }];
const O = (id, over) => Object.assign({ id, in_num: id, store_name: TR, fulfiller: null, customer_name: 'Клиент ' + id, phone: '0888 123 456',
  delivery: '2026-11-16', status: 'pending', co_eta: null, product: 'Стока ' + id, items: null, date: '2026-11-01' }, over || {});
const ORDERS = [
  O('A1', { fulfiller: LV, delivery: '2026-11-15', items: [{ product: 'Диван „Лале"' }, { product: 'Табуретка' }, { product: 'Възглавница' }] }), // вчера (неделя) → закъсняла, 1
  O('A2', { delivery: '2026-11-16' }),                                         // днес → до 2 дни
  O('A3', { status: 'sent', delivery: '2026-11-18' }),                         // втори работен ден → до 2 дни
  O('A4', { delivery: '2026-11-19' }),                                         // трети → нищо
  /* v20 — ефективният срок е co_eta при processed (решение 16.11.2026). */
  O('A5', { status: 'processed', co_eta: '2026-11-20', delivery: '2026-11-16' }), // срок днес, ЦО обещава 20.11 (след лимита) → нищо (Силистра-0107)
  O('A6', { status: 'processed', co_eta: '2026-11-12', delivery: '2026-11-05' }), // co_eta чт 12.11 → закъсняла, 2 от co_eta (от delivery биха били 7)
  O('A7', { status: 'postponed', delivery: '2026-11-10' }),
  O('A8', { status: 'arrived', delivery: '2026-11-10' }),
  O('A9', { store_name: LV, fulfiller: ' ТРОЯН ', customer_name: 'Тайна Клиентка', delivery: '2026-11-13' }), // изпълнител, регистър
  O('A10', { store_name: LV, fulfiller: TR, status: 'processed', delivery: '2026-11-17' }),                   // изпълнител, до 2 дни
  O('A11', { fulfiller: TR, delivery: '2026-11-12', customer_name: 'Иван <b>И</b>' }),                       // заявител = изпълнител
  O('A12', { status: 'done', delivery: '2026-11-10' }),
  O('A13', { status: 'refused', delivery: '2026-11-10' }),
  O('A14', { delivery: null }),
  /* Ловеч (заявител) — ефективният срок: */
  O('A15', { store_name: LV, status: 'processed', co_eta: '2026-11-17', delivery: '2026-11-30' }), // co_eta в лимита, delivery далеч → до 2 дни, двете дати
  O('A16', { store_name: LV, status: 'processed', delivery: '2026-11-13' }),                       // processed без co_eta → по delivery, закъсняла 1
  O('A17', { store_name: LV, status: 'processed', co_eta: '2026-11-16', delivery: '2026-11-10' }), // очаква се от ЦО днес
  O('A18', { store_name: LV, delivery: '2026-11-18' }),                                            // pending, втори работен ден
  /* v21 — co_eta = delivery → една дата: */
  O('A19', { store_name: LV, status: 'processed', co_eta: '2026-11-17', delivery: '2026-11-17' }), // Петрич-0364
  O('A20', { store_name: LV, status: 'processed', co_eta: '2026-11-16', delivery: '2026-11-16' }), // и двете днес
];
function db(over) {
  return Object.assign({
    users: clone(USERS), notification_topics: [clone(TOPIC)], notification_matrix: clone(MATRIX), notification_overrides: [],
    notification_log: [], bulletins: [clone(BULLETIN)], bulletin_tasks: clone(TASKS), task_completions: clone(COMPS),
    recurring_tasks: [], recurring_task_periods: [], recurring_task_versions: [], recurring_task_skips: [],
    client_orders: clone(ORDERS),
  }, over || {});
}
const ids = arr => (arr || []).map(o => o.in_num).join(',');

(async function () {
  section('1. Получатели (dry_run, понеделник 16.11.2026)');
  let dry;
  {
    const L = load(db(), MON);
    const r = await L.call({ topic_key: 'store_open_items', dry_run: true });
    dry = r.result || {};
    const by = {}; (dry.planned || []).forEach(p => { by[p.obekt] = p; });
    const emails = s => ((by[s] || {}).poluchateli || []).map(p => p.email).sort().join(',');
    ok('dry_run минава', r.ok === true && dry.dry_run === true, JSON.stringify(r).slice(0, 300));
    ok('Троян: управител + склад, kasa — извън', emails(TR) === 'sklad.troyan@temax.bg,troyan@temax.bg', emails(TR));
    ok('Ловеч: неактивният и този без имейл — извън', emails(LV) === 'lovech@temax.bg', emails(LV));
    ok('Кърджали: и двата управителя', emails(KJ) === 'kardzhali@temax.bg,test.kardzhali@gmail.com', emails(KJ));
    ok('ЦО (EXCLUDED_STORES) — няма ред', !by[CO] && (dry.bez_redove || []).indexOf(CO) < 0, JSON.stringify(Object.keys(by)));
    ok('ролята се връща в dry_run', ((by[TR] || {}).poluchateli || []).some(p => p.role === 'sklad'));
    ok('нищо не е пратено, нищо не е писано', L.posts.length === 0 && L.log.every(q => q.op === 'select'), JSON.stringify(L.log.filter(q => q.op !== 'select')));
  }
  {
    const L = load(db({ notification_overrides: [{ topic_key: 'store_open_items', user_email: 'Sklad.Troyan@temax.bg', mode: 'exclude' }] }), MON);
    const r = (await L.call({ topic_key: 'store_open_items', dry_run: true })).result;
    const tr = r.planned.filter(p => p.obekt === TR)[0];
    ok('override exclude (друг регистър на имейла) — складът излиза', tr && tr.poluchateli.map(p => p.email).join(',') === 'troyan@temax.bg', JSON.stringify(tr));
  }
  {
    const L = load(db({ notification_matrix: [{ topic_key: 'store_open_items', group_key: 'store', channel: 'push', scope: 'own_stores' }] }), MON);
    const r = (await L.call({ topic_key: 'store_open_items' })).result;
    ok('матрица без имейл за store → skipped, нищо не тръгва', !!r.skipped && /Матрицата/.test(r.skipped) && L.mails().length === 0, JSON.stringify(r));
  }

  section('2. Секция А — задачите на обекта');
  {
    const by = {}; (dry.planned || []).forEach(p => { by[p.obekt] = p; });
    ok('Троян: 1 задача (t2; t1 е отметната)', by[TR] && by[TR].zadachi.zadachi === 1, JSON.stringify(by[TR] && by[TR].zadachi));
    ok('Ловеч: 1 (t1)', by[LV] && by[LV].zadachi.zadachi === 1);
    ok('Кърджали: 1 (t1), без заявки', by[KJ] && by[KJ].zadachi.zadachi === 1 && by[KJ].redove === 1, JSON.stringify(by[KJ]));
  }
  {
    const L = load(db({ bulletins: [] }), MON);
    const r = (await L.call({ topic_key: 'store_open_items', dry_run: true })).result;
    const by = {}; r.planned.forEach(p => { by[p.obekt] = p; });
    ok('{skip} от buildOverdueTasks → zadachi_skip е попълнен', !!r.zadachi_skip, JSON.stringify(r.zadachi_skip));
    ok('{skip} → Троян пак има писмо (само заявки)', by[TR] && by[TR].zadachi.zadachi === 0 && by[TR].redove === 7, JSON.stringify(by[TR]));
    ok('{skip} → Кърджали (без заявки) няма писмо', !by[KJ] && r.bez_redove.indexOf(KJ) >= 0, JSON.stringify(r.bez_redove));
  }

  section('3. Секция Б — границите');
  {
    const L = load(db(), MON);
    const C = L.ctx;
    const c = C.soiClassify(ORDERS, TR, '2026-11-16', C.soiAddWorkdays('2026-11-16', 2));
    ok('границата в понеделник е сряда 18.11', C.soiAddWorkdays('2026-11-16', 2) === '2026-11-18');
    /* По ефективния срок, после по № като низ: 12.11 → A11, A6 (co_eta); 15.11 → A1. */
    ok('закъснели като заявител: A11, A6 (минала co_eta), A1 (срок вчера)', ids(c.late_req) === 'A11,A6,A1', ids(c.late_req));
    ok('закъснели като изпълнител: A9 („ ТРОЯН ")', ids(c.late_ful) === 'A9', ids(c.late_ful));
    ok('до 2 дни като заявител: A2 (днес), A3 (втори работен ден)', ids(c.soon_req) === 'A2,A3', ids(c.soon_req));
    ok('до 2 дни като изпълнител: A10', ids(c.soon_ful) === 'A10', ids(c.soon_ful));
    const all = [].concat(c.late_req, c.late_ful, c.soon_req, c.soon_ful).map(o => o.in_num);
    ok('трети работен ден (A4) — няма', all.indexOf('A4') < 0);
    ok('processed, срок днес, co_eta след лимита (A5) — няма', all.indexOf('A5') < 0);
    ok('postponed (A7) и arrived (A8) — няма', all.indexOf('A7') < 0 && all.indexOf('A8') < 0);
    ok('done / refused / без срок — няма', ['A12', 'A13', 'A14'].every(x => all.indexOf(x) < 0));
    ok('заявител = изпълнител (A11) — веднъж', all.filter(x => x === 'A11').length === 1);
    ok('просрочие: A1 (нд → пн) = 1, A6 (от co_eta чт 12 → пн) = 2', C.soiLateDays(ORDERS[0], '2026-11-16') === 1 && C.soiLateDays(ORDERS[5], '2026-11-16') === 2,
      C.soiLateDays(ORDERS[5], '2026-11-16'));
    ok('стока: първият артикул + „и още 2"', C.soiItemText(ORDERS[0]) === 'Диван „Лале" и още 2' && C.soiItemText(ORDERS[1]) === 'Стока A2');
    const lv = C.soiClassify(ORDERS, LV, '2026-11-16', '2026-11-18');
    ok('Ловеч: закъснели като заявител A16 (processed без co_eta → по delivery), A9; изпълнител A1',
      ids(lv.late_req) === 'A16,A9' && ids(lv.late_ful) === 'A1', JSON.stringify([ids(lv.late_req), ids(lv.late_ful)]));
    /* A10 (Ловеч заявява, Троян изпълнява, delivery 17) и A15 (co_eta 17) — един ден, по № като низ. */
    ok('Ловеч: до 2 дни по ЕФЕКТИВНИЯ срок — A17 (co_eta днес), A10 (17), A15 (co_eta 17, delivery 30), A18 (18)',
      ids(lv.soon_req) === 'A17,A20,A10,A15,A19,A18', ids(lv.soon_req));
    ok('A16 (без co_eta): просрочие по delivery = 1', C.soiLateDays(ORDERS[15], '2026-11-16') === 1);
    /* Сверка с co_overdue: същата заявка, изпълнител ЦО, през РЕАЛНИЯ
       reportCoOverdueSections на send-scheduled-report. */
    const ssr = (() => {
      const w = process.emitWarning; process.emitWarning = function () {};
      const js = nodeModule.stripTypeScriptTypes(fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8'));
      process.emitWarning = w;
      const c = { console: { log() {}, warn() {}, error() {} }, Intl, JSON, Math, Object, Array, String, Number, Promise, Date, Response, setTimeout,
        Deno: { env: { get: () => 'https://x.supabase.co' }, serve: () => {} }, fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }) };
      vm.createContext(c); vm.runInContext(js, c, { filename: 'send-scheduled-report.js' });
      return c;
    })();
    const co = ssr.reportCoOverdueSections([Object.assign({}, ORDERS[5], { fulfiller: 'Централен офис', created_at: '2026-11-01T08:00:00Z' })], new Date(2026, 10, 16));
    const coDays = co.processed[0] && co.processed[0].lateDays;
    ok('просрочието на A6 = lateDays в co_overdue (reportLateDays върху co_eta)', coDays === C.soiLateDays(ORDERS[5], '2026-11-16'), coDays + ' vs ' + C.soiLateDays(ORDERS[5], '2026-11-16'));
  }
  {
    const L = load(db(), MON);
    const C = L.ctx;
    /* Петък 20.11.2026 — през уикенда: пн 23, вт 24. */
    const lim = C.soiAddWorkdays('2026-11-20', 2);
    const rows = [O('W1', { delivery: '2026-11-21' }), O('W2', { delivery: '2026-11-24' }), O('W3', { delivery: '2026-11-25' }), O('W4', { delivery: '2026-11-19' })];
    const c = C.soiClassify(rows, TR, '2026-11-20', lim);
    ok('петък → границата е вторник 24.11', lim === '2026-11-24', lim);
    ok('уикенд: събота и вторник — до 2 дни; сряда — не', ids(c.soon_req) === 'W1,W2', ids(c.soon_req));
    ok('четвъртък в петък → закъсняла, 1 работен ден', ids(c.late_req) === 'W4' && C.soiLateDays(rows[3], '2026-11-20') === 1);
    /* Сряда 23.12.2026 — 24, 25 празник, 26–27 уикенд, 28 пренесен празник (26.12 е събота). */
    const limH = C.soiAddWorkdays('2026-12-23', 2);
    const h = C.soiClassify([O('H1', { delivery: '2026-12-30' }), O('H2', { delivery: '2026-12-31' }), O('H3', { delivery: '2026-12-28' })], TR, '2026-12-23', limH);
    ok('празник: от 23.12 границата е 30.12', limH === '2026-12-30', limH);
    ok('празник: 28.12 и 30.12 — до 2 дни; 31.12 — не', ids(h.soon_req) === 'H3,H1', ids(h.soon_req));
    ok('просрочие през празниците: срок 23.12, днес 29.12 = 1 работен ден', C.soiLateDays(O('H4', { delivery: '2026-12-23' }), '2026-12-29') === 1);
  }

  section('4. Съдържание на писмото (test_email) и обект без редове');
  {
    const d = db(); d.notification_topics[0].test_email = 'ten.tenev@temax.bg';
    const L = load(d, MON);
    const r = (await L.call({ topic_key: 'store_open_items' })).result;
    const mails = L.mails();
    const subj = mails.map(m => m.body.subject).sort();
    ok('по ЕДНО писмо на обект: Кърджали, Ловеч, Троян', subj.join('|') === 'ТеМАХ — Незавършено за Кърджали (16.11)|ТеМАХ — Незавършено за Ловеч (16.11)|ТеМАХ — Незавършено за Троян (16.11)', subj.join('|'));
    ok('всички до test_email', mails.every(m => m.body.to === 'ten.tenev@temax.bg'));
    ok('Сливен (info, без редове) — без писмо', !mails.some(m => /Сливен/.test(m.body.subject)) && r.bez_redove >= 1, JSON.stringify(r));
    const kj = mails.filter(m => /Кърджали/.test(m.body.subject))[0].body.html;
    ok('лентата ТЕСТОВ РЕЖИМ изброява двата адреса на Кърджали', /ТЕСТОВ РЕЖИМ — предназначено за Кърджали: /.test(kj) && kj.indexOf('kardzhali@temax.bg') >= 0 && kj.indexOf('test.kardzhali@gmail.com') >= 0);
    ok('notification_log НЕ е писан', d.notification_log.length === 0 && !L.log.some(q => q.table === 'notification_log'), JSON.stringify(d.notification_log));
    ok('без push', !L.posts.some(p => p.body.type === 'push'));
    const tr = mails.filter(m => /Троян/.test(m.body.subject))[0].body.html;
    const pos = s => tr.indexOf(s);
    ok('подгрупите са в реда: закъснели заявител → изпълнител → до 2 дни заявител → изпълнител',
      pos('Закъснели — като заявител (3)') > 0 && pos('Закъснели — като заявител') < pos('Закъснели — като изпълнител (1)') &&
      pos('Закъснели — като изпълнител') < pos('Срок до 2 работни дни — като заявител (2)') &&
      pos('Срок до 2 работни дни — като заявител') < pos('Срок до 2 работни дни — като изпълнител (1)'));
    ok('задачата на Троян е вътре, отметнатата t1 — не', tr.indexOf('Снимки на витрината') > 0 && tr.indexOf('Ревизия') < 0);
    ok('ред на заявител: №, стока, „+1 работен ден", клиент, кой изпълнява', tr.indexOf('№ A1 · Диван „Лале&quot; и още 2') > 0 && tr.indexOf('+1 работен ден') > 0 && tr.indexOf('+1 работни дни') < 0 &&
      tr.indexOf('Клиент: Клиент A1 · Изпълнява: Ловеч') > 0 && tr.indexOf('Изпълнява: вашият обект') > 0);
    ok('ред на изпълнител: „Заявил: Ловеч", БЕЗ име на клиента', tr.indexOf('Заявил: Ловеч') > 0 && tr.indexOf('Тайна Клиентка') < 0);
    ok('статус на български', tr.indexOf('Изчаква') > 0 && tr.indexOf('Обработена от ЦО') > 0 && tr.indexOf('Изпратена') > 0);
    ok('без телефон', tr.indexOf('0888') < 0);
    /* v20 — редовете с ефективния срок. row() връща текста от „№ X ·" до
       следващия ред (без таговете). */
    const lvh = mails.filter(m => /Ловеч/.test(m.body.subject))[0].body.html;
    const row = (html, id) => {
      const plain = html.replace(/<[^>]+>/g, ' ').replace(/ +/g, ' ');
      const a = plain.indexOf('№ ' + id + ' ·'); if (a < 0) return '';
      const b = plain.indexOf('№ ', a + 3);
      return plain.slice(a, b < 0 ? plain.length : b);
    };
    const cnt = (s, sub) => s.split(sub).length - 1;
    const a2 = row(tr, 'A2');
    ok('срок днес (A2): „срок днес · Изчаква", веднъж, без датата', a2.indexOf('срок днес · Изчаква') >= 0 && cnt(a2, 'срок днес') === 1 && a2.indexOf('16.11.2026') < 0, a2);
    ok('processed, co_eta след лимита (A5) — не е в писмото', tr.indexOf('№ A5') < 0);
    const a6 = row(tr, 'A6');
    ok('закъсняла по co_eta (A6): двете дати и „+2 работни дни"', a6.indexOf('срок към клиента 05.11.2026 · очаква се от ЦО 12.11.2026 · Обработена от ЦО') >= 0 && a6.indexOf('+2 работни дни') >= 0, a6);
    const a15 = row(lvh, 'A15');
    ok('до 2 дни по co_eta (A15): двете дати, „остава 1 работен ден"', a15.indexOf('срок към клиента 30.11.2026 · очаква се от ЦО 17.11.2026 · Обработена от ЦО · остава 1 работен ден') >= 0, a15);
    const a17 = row(lvh, 'A17');
    ok('очаква се от ЦО днес (A17): „днес" вместо датата, без крайна бележка', a17.indexOf('срок към клиента 10.11.2026 · очаква се от ЦО днес · Обработена от ЦО') >= 0 &&
      a17.indexOf('срок днес') < 0 && a17.indexOf('остава') < 0 && a17.indexOf('16.11.2026') < 0, a17);
    const a16 = row(lvh, 'A16');
    ok('processed без co_eta (A16): една дата, по delivery, „+1 работен ден"', a16.indexOf('срок 13.11.2026 · Обработена от ЦО · +1 работен ден') >= 0 && a16.indexOf('очаква се') < 0, a16);
    const a19 = row(lvh, 'A19'), a20 = row(lvh, 'A20');
    ok('co_eta = delivery (A19, 17.11): една дата — „срок 17.11.2026 · Обработена от ЦО · остава 1 работен ден"', a19.indexOf('срок 17.11.2026 · Обработена от ЦО · остава 1 работен ден') >= 0 && a19.indexOf('очаква се') < 0 && a19.indexOf('към клиента') < 0, a19);
    ok('co_eta = delivery = днес (A20): „срок днес · Обработена от ЦО", без втора дата и без бележка', a20.indexOf('срок днес · Обработена от ЦО') >= 0 && a20.indexOf('очаква се') < 0 && a20.indexOf('16.11.2026') < 0 && a20.indexOf('остава') < 0, a20);
    ok('подредба в писмото по ефективния срок: A17 → A15 → A18', lvh.indexOf('№ A17') > 0 && lvh.indexOf('№ A17') < lvh.indexOf('№ A15') && lvh.indexOf('№ A15') < lvh.indexOf('№ A18'));
    ok('esc: името на клиента и заглавието на задачата', tr.indexOf('Иван &lt;b&gt;И&lt;/b&gt;') > 0 && tr.indexOf('<b>И</b>') < 0 &&
      mails.filter(m => /Ловеч/.test(m.body.subject))[0].body.html.indexOf('Ревизия &lt;група А&gt;') > 0);
    ok('бутон „Отвори портала"', tr.indexOf('Отвори портала') > 0);
    ok('last_status е обновен (тестът също)', /^ok: 3 обекта, 3 писма/.test(d.notification_topics[0].last_status || ''), d.notification_topics[0].last_status);
    const by = {}; (dry.planned || []).forEach(p => { by[p.obekt] = p; });
    ok('dry_run броя на Троян: 3 / 1 / 2 / 1', JSON.stringify(by[TR].zayavki) === JSON.stringify({ late_req: 3, late_ful: 1, soon_req: 2, soon_ful: 1 }), JSON.stringify(by[TR].zayavki));
  }

  section('5. На живо — лог, повторно пускане, паднало пращане');
  {
    const d = db();
    const L = load(d, MON);
    const r1 = (await L.call({ topic_key: 'store_open_items' })).result;
    const to = TOS(L);
    ok('v23: ЕДНО писмо на обект, to = масив с всички адреси на обекта (3 писма за 3 обекта)', L.mails().length === 3 && L.mails().every(m => Array.isArray(m.body.to)) &&
      to === 'kardzhali@temax.bg,test.kardzhali@gmail.com | lovech@temax.bg | troyan@temax.bg,sklad.troyan@temax.bg', to);
    ok('лог: „2026-11-16|<обект>" ×3', d.notification_log.map(x => x.ref_key).sort().join(',') === '2026-11-16|Кърджали,2026-11-16|Ловеч,2026-11-16|Троян', JSON.stringify(d.notification_log));
    ok('резултат: 3 обекта, 3 писма', r1.obekti === 3 && r1.sent_emails === 3 && r1.already_sent === 0, JSON.stringify(r1));
    const before = L.mails().length;
    const r2 = (await L.call({ topic_key: 'store_open_items' })).result;
    ok('второ пускане — нула писма, трите обекта прескочени', L.mails().length === before && r2.already_sent === 3 && r2.sent_emails === 0, JSON.stringify(r2));
  }
  {
    const d = db();
    const L = load(d, MON, to => to === 'lovech@temax.bg');
    const r = (await L.call({ topic_key: 'store_open_items' })).result;
    ok('паднало пращане за Ловеч → редът в лога е махнат', d.notification_log.map(x => x.ref_key).sort().join(',') === '2026-11-16|Кърджали,2026-11-16|Троян', JSON.stringify(d.notification_log));
    ok('last_status започва с „ГРЕШКА:"', /^ГРЕШКА: /.test(d.notification_topics[0].last_status || ''), d.notification_topics[0].last_status);
    ok('резултатът брои неуспешното', r.failed_emails === 1 && r.obekti === 2, JSON.stringify(r));
    ok('v23: обект без писмо → last_run_at НЕ е записан, „без писмо: Ловеч"', !d.notification_topics[0].last_run_at && /без писмо: Ловеч/.test(d.notification_topics[0].last_status || ''), d.notification_topics[0].last_status);
  }

  section('5б. v22 — грешка при един обект не спира пускането (17.11)');
  {
    /* fetch ХВЪРЛЯ за единствения адрес на Ловеч (като второто писмо на Търговище 17.11). */
    const d = db();
    const L = load(d, MON, null, to => to === 'lovech@temax.bg');
    const raw = await L.callRaw({ topic_key: 'store_open_items' });
    const r = (await raw.json()).result || {};
    ok('отговорът е 200, не 500', raw.status === 200, raw.status + ' ' + JSON.stringify(r));
    ok('останалите обекти получават писмо (Кърджали ×2, Троян ×2)', TOS(L) === 'kardzhali@temax.bg,test.kardzhali@gmail.com | troyan@temax.bg,sklad.troyan@temax.bg', TOS(L));
    ok('Ловеч: редът в лога е махнат (нищо не излезе) — следващото събуждане опитва пак', d.notification_log.map(x => x.ref_key).sort().join(',') === '2026-11-16|Кърджали,2026-11-16|Троян', JSON.stringify(d.notification_log));
    ok('last_status започва с „ГРЕШКА:"', /^ГРЕШКА: 2 обекта, 2 писма, 1 неуспешни/.test(d.notification_topics[0].last_status || ''), d.notification_topics[0].last_status);
    ok('v23: last_run_at НЕ е записан (Ловеч без писмо → кронът опитва пак в прозореца)', !d.notification_topics[0].last_run_at, String(d.notification_topics[0].last_run_at));
    ok('console.error е извикан с текста', L.errors.some(e => e.indexOf('resend-email fetch (lovech@temax.bg): error sending request') === 0), JSON.stringify(L.errors));
  }
  {
    /* Хвърля самото вписване в лога за Ловеч — грешка ВЪТРЕ в обекта, извън sendEmail. */
    const d = db();
    d.__throw = (table, q) => table === 'notification_log' && q.op === 'insert' && /Ловеч/.test(q.row.ref_key);
    const L = load(d, MON);
    const raw = await L.callRaw({ topic_key: 'store_open_items' });
    const r = (await raw.json()).result || {};
    ok('хвърляне при Ловеч → 200, цикълът продължава', raw.status === 200 && r.obekti === 2, raw.status + ' ' + JSON.stringify(r));
    ok('Троян и Кърджали — пратени (Троян е СЛЕД Ловеч по азбука)', TOS(L) === 'kardzhali@temax.bg,test.kardzhali@gmail.com | troyan@temax.bg,sklad.troyan@temax.bg', TOS(L));
    ok('last_status: „ГРЕШКА:" и текстът с обекта', /^ГРЕШКА: /.test(d.notification_topics[0].last_status || '') && /Ловеч: boom notification_log/.test(d.notification_topics[0].last_status || ''), d.notification_topics[0].last_status);
    ok('v23: last_run_at НЕ е записан (Ловеч без писмо)', !d.notification_topics[0].last_run_at);
    ok('console.error: „store_open_items Ловеч: …"', L.errors.some(e => /store_open_items Ловеч: boom notification_log/.test(e)), JSON.stringify(L.errors));
    ok('резултатът носи грешката', Array.isArray(r.errors) && r.errors.length === 1 && /Ловеч/.test(r.errors[0]), JSON.stringify(r.errors));
  }
  {
    /* catch-ът в Deno.serve оставя следа. */
    const d = db();
    d.__throw = (table) => table === 'notification_topics';
    const L = load(d, MON);
    const raw = await L.callRaw({ topic_key: 'store_open_items' });
    ok('500 от общия catch', raw.status === 500, String(raw.status));
    ok('console.error: „bulletin-notify 500: …"', L.errors.some(e => /^bulletin-notify 500: boom notification_topics/.test(e)), JSON.stringify(L.errors));
  }

  section('5в. v23 — таван на обажданията (18.11): повторен опит веднъж');
  const RLE = ms => { const e = new Error('Rate limit exceeded for trace 01a1ed2f. Retry after ' + ms + 'ms.'); e.name = 'RateLimitError'; return e; };
  {
    /* Таван при първия опит за Ловеч → изчакване по „Retry after" и успех при втория. */
    const d = db();
    let n = 0;
    const L = load(d, MON, null, to => (to === 'lovech@temax.bg' && ++n === 1 ? RLE(39698) : false));
    const r = (await L.call({ topic_key: 'store_open_items' })).result;
    ok('изчакано точно колкото казва грешката (39698 ms), веднъж', JSON.stringify(L.waits) === '[39698]', JSON.stringify(L.waits));
    ok('Ловеч получава писмото при втория опит; и трите обекта — пратени', n === 2 && TOS(L) === 'kardzhali@temax.bg,test.kardzhali@gmail.com | lovech@temax.bg | troyan@temax.bg,sklad.troyan@temax.bg', n + ' ' + TOS(L));
    ok('лог ×3, „ok: 3 обекта, 3 писма", last_run_at записан', d.notification_log.length === 3 && /^ok: 3 обекта, 3 писма, 0 неуспешни/.test(d.notification_topics[0].last_status || '') && !!d.notification_topics[0].last_run_at, d.notification_topics[0].last_status);
    ok('резултат без неуспешни', r.failed_emails === 0 && r.obekti === 3 && r.bez_pismo.length === 0, JSON.stringify(r));
  }
  {
    /* Таван и при втория опит → Ловеч неуспешен; после ново събуждане (08:00) без таван. */
    const d = db();
    let n = 0, blocked = true;
    const L = load(d, MON, null, to => (blocked && to === 'lovech@temax.bg' ? (n++, RLE(39614)) : false));
    const raw = await L.callRaw({ topic_key: 'store_open_items' });
    const r = (await raw.json()).result || {};
    ok('200; Ловеч опитан точно ДВА пъти (без цикъл), едно изчакване', raw.status === 200 && n === 2 && JSON.stringify(L.waits) === '[39614]', raw.status + ' n=' + n + ' ' + JSON.stringify(L.waits));
    ok('Ловеч: редът в лога е махнат', d.notification_log.map(x => x.ref_key).sort().join(',') === '2026-11-16|Кърджали,2026-11-16|Троян', JSON.stringify(d.notification_log));
    ok('last_run_at НЕ е записан; last_status „ГРЕШКА: … без писмо: Ловеч"', !d.notification_topics[0].last_run_at && /^ГРЕШКА: 2 обекта, 2 писма, 1 неуспешни/.test(d.notification_topics[0].last_status || '') && /без писмо: Ловеч/.test(d.notification_topics[0].last_status || ''), d.notification_topics[0].last_status);
    ok('резултатът: bez_pismo = [Ловеч]', JSON.stringify(r.bez_pismo) === JSON.stringify([LV]), JSON.stringify(r));
    ok('console.error за повторния опит', L.errors.some(e => /resend-email fetch \(lovech@temax\.bg\) \(повторен опит\): Rate limit exceeded/.test(e)), JSON.stringify(L.errors));
    /* Кронът в 08:00: темата пак е due (last_run_at не е днешен), таванът е минал. */
    blocked = false;
    d.notification_topics[0].active = true;
    const L2 = load(d, '2026-11-16T06:00:00Z');
    const r2 = ((await L2.call({})).results || []).filter(x => x.topic === 'store_open_items')[0] || {};
    ok('08:00: само Ловеч получава писмо, Кърджали и Троян — „вече пратени"', TOS(L2) === 'lovech@temax.bg' && r2.already_sent === 2 && r2.sent_emails === 1, TOS(L2) + ' ' + JSON.stringify(r2));
    ok('08:00: last_run_at вече е записан, „ok:"', !!d.notification_topics[0].last_run_at && /^ok: 1 обекта, 1 писма, 0 неуспешни, 2 вече пратени/.test(d.notification_topics[0].last_status || ''), d.notification_topics[0].last_status);
    const L3 = load(d, '2026-11-16T06:00:00Z');
    const r3 = await L3.call({});
    ok('третото събуждане същия ден — темата не е due, нищо не тръгва', L3.mails().length === 0 && !(r3.results || []).some(x => x.topic === 'store_open_items'), JSON.stringify(r3.results));
  }
  {
    /* Горна граница на изчакването — 45 с, колкото и да казва грешката. */
    let k = 0;
    const L = load(db(), MON, null, t => (t === 'lovech@temax.bg' && ++k === 1 ? RLE(90000) : false));
    await L.call({ topic_key: 'store_open_items' });
    ok('„Retry after 90000ms" → изчакване 45000 ms', JSON.stringify(L.waits) === '[45000]', JSON.stringify(L.waits));
  }
  {
    /* Бюджетът на пускането: изчакване, което минава 100 с от началото, не се прави. */
    const L = load(db(), MON, null, () => RLE(39698));
    vm.runInContext('RUN_T0 = Date.now() - 80000', L.ctx);
    const res = await L.ctx.sendEmail(['a@temax.bg'], 'т', 'х');
    ok('80 с изминали + 39,7 с изчакване > 100 с → без изчакване, false', res === false && L.waits.length === 0 && L.errors.some(e => /таван, без повторен опит/.test(e)), JSON.stringify(L.waits) + ' ' + JSON.stringify(L.errors));
  }
  {
    /* Друга грешка (не таван) → без повторен опит. */
    let n = 0;
    const L = load(db(), MON, null, to => (to === 'lovech@temax.bg' ? (n++, true) : false));
    await L.call({ topic_key: 'store_open_items' });
    ok('мрежова грешка (не таван) → един опит, без изчакване', n === 1 && L.waits.length === 0, 'n=' + n + ' ' + JSON.stringify(L.waits));
  }
  {
    /* Тестов режим — както досега: по едно писмо на обект до test_email (низ), лента, без лог;
       last_run_at се записва и при неуспех (иначе 08:00 повтаря всички тестови писма). */
    const d = db();
    d.notification_topics[0].test_email = 'tester@temax.bg';
    const L = load(d, MON);
    await L.call({ topic_key: 'store_open_items' });
    ok('тестов режим: 3 писма, to = „tester@temax.bg" (низ, не масив), лента', L.mails().length === 3 && L.mails().every(m => m.body.to === 'tester@temax.bg' && /ТЕСТОВ РЕЖИМ/.test(m.body.html)), JSON.stringify(L.mails().map(m => m.body.to)));
    ok('тестов режим: без лог, last_run_at записан', (d.notification_log || []).length === 0 && !!d.notification_topics[0].last_run_at);
    const d2 = db();
    d2.notification_topics[0].test_email = 'tester@temax.bg';
    let k = 0;
    const L2 = load(d2, MON, to => to === 'tester@temax.bg' && ++k === 2);
    await L2.call({ topic_key: 'store_open_items' });
    ok('тестов режим с неуспех: last_run_at пак записан, „ГРЕШКА:"', !!d2.notification_topics[0].last_run_at && /^ГРЕШКА: 2 обекта, 2 писма, 1 неуспешни/.test(d2.notification_topics[0].last_status || ''), d2.notification_topics[0].last_status);
  }
  {
    /* Push хвърля — sendPushFilters / sendPushToPeople връщат false, не хвърлят. */
    const L = load(db(), MON, null, kind => kind === 'push');
    let threw = null, res;
    try { res = await L.ctx.sendPushToPeople(['Управител Троян'], 'т', 'с'); } catch (e) { threw = e; }
    ok('push: мрежова грешка → false, без изключение, console.error', threw === null && res === false && L.errors.some(e => /^push fetch: error sending request/.test(e)), String(threw) + ' ' + JSON.stringify(L.errors));
    let m = 0;
    const L2 = load(db(), MON, null, kind => (kind === 'push' ? (++m <= 2 ? RLE(30000) : false) : false));
    let threw2 = null, res2;
    try { res2 = await L2.ctx.sendPushFilters([{ field: 'tag' }], 'т', 'с'); } catch (e) { threw2 = e; }
    ok('push: таван и при втория опит → false, без изключение (като 500 на overdue_tasks 18.11)', threw2 === null && res2 === false && m === 2 && JSON.stringify(L2.waits) === '[30000]', String(threw2) + ' m=' + m);
    let q = 0;
    const L3 = load(db(), MON, null, kind => (kind === 'push' && ++q === 1 ? RLE(5000) : false));
    const res3 = await L3.ctx.sendPushToPeople(['А', 'Б'], 'т', 'с');
    ok('push: таван при първия → успех при втория', res3 === true && q === 2 && L3.posts.filter(p => p.body.type === 'push').length === 1, 'q=' + q);
  }

  section('6. Неработен ден');
  for (const [clock, why] of [['2026-11-15T05:45:00Z', 'неделя 15.11'], ['2026-12-24T05:45:00Z', 'Бъдни вечер 24.12 (четвъртък)']]) {
    const d = db();
    const L = load(d, clock);
    const r = (await L.call({ topic_key: 'store_open_items' })).result;
    ok(why + ' → skipped, нищо не тръгва и не се пише', /Неработен ден/.test(r.skipped || '') && L.posts.length === 0 && L.log.every(q => q.op === 'select'), JSON.stringify(r));
  }

  section('6б. as_of — само с dry_run');
  {
    const L = load(db(), '2026-11-15T09:00:00Z');   /* неделя */
    const r = await L.call({ topic_key: 'store_open_items', dry_run: true, as_of: '2026-11-16' });
    ok('неделя + dry_run + as_of понеделник → сметката е за 16.11', r.bg_date === '2026-11-16' && r.result.dry_run === true && r.result.obekti === 3, JSON.stringify(r).slice(0, 200));
    const r2 = await L.call({ topic_key: 'store_open_items', as_of: '2026-11-16' });
    ok('без dry_run as_of се пренебрегва → неработен ден, нищо не тръгва', /Неработен ден/.test(r2.result.skipped || '') && L.posts.length === 0, JSON.stringify(r2));
  }

  section('7. recipients_only — правилото по обект');
  {
    const L = load(db(), MON);
    const r = await L.call({ recipients_only: true, topic_key: 'store_open_items' });
    const t = r.topics && r.topics.store_open_items;
    ok('темата е в RO_TOPIC_KEYS', !!t && !t.error, JSON.stringify(r).slice(0, 200));
    if (t) {
      const em = t.personal.map(p => p.email).sort().join(',');
      ok('управители / склад / инфо по обект, без kasa и ЦО', em === 'kardzhali@temax.bg,lovech@temax.bg,sklad.troyan@temax.bg,sliven@temax.bg,test.kardzhali@gmail.com,troyan@temax.bg', em);
      ok('всеки с обхват своя обект', t.personal.every(p => p.scope === 'own_stores' && p.stores.length === 1 && p.channel === 'email'));
      ok('by_store по обект', Object.keys(t.by_store).sort().join(',') === [KJ, LV, SL, TR].sort().join(','), JSON.stringify(Object.keys(t.by_store)));
      ok('нищо не е писано', L.log.every(q => q.op === 'select') && L.posts.length === 0);
    }
    const L2 = load(db({ notification_matrix: [] }), MON);
    const t2 = (await L2.call({ recipients_only: true, topic_key: 'store_open_items' })).topics.store_open_items;
    ok('без ред в матрицата → празно правило', t2.personal.length === 0 && t2.matrix_channel === null, JSON.stringify(t2));
  }

  section('8. Темата е регистрирана');
  {
    const src = fs.readFileSync(SRC_PATH, 'utf8');
    ok('IMPLEMENTED_TOPICS → runStoreOpenItems', /\{ key: 'store_open_items', run: runStoreOpenItems \}/.test(src));
    ok('SOI_ROLES = manager, sklad, info', /const SOI_ROLES = \['manager', 'sklad', 'info'\];/.test(src));
  }

  report();
})();
