/* Банерът при вход: три карти вместо едно „N просрочени заявки!".

   Сигнал от Добрич (29.09.2026): банерът казваше „4 просрочени заявки!", а
   чипът „Просрочени" в Клиентски беше празен. Едното число смесваше три неща:
     A — клиентски с изтекла дата на доставка (isLate — СЪЩИЯТ предикат като чипа);
     B — транспортни с _status 'overdue';
     C — заявки ≥7 дни от подаването без приключване, при _isFulfiller,
         без вече преброените в A/B.
   Проверките гледат текста на .notif-title, не целия банер — спокойната
   карта („Няма просрочени или спешни заявки.") съдържа същия корен.

   Мутации (15.10.2026, notifications.js подменен ръчно, тестът пуснат срещу него):
     (а) A с o._status==='overdue' вместо isLate(o) → 2 ❌, exit 1
         (sent + доставка вчера изчезва от A — сценарий 1б);
     (б) C без изключването на A/B → 2 ❌, exit 1 (сценарий 4 брои двойно);
     (в) карта C с клас urgent вместо warning → 1 ❌, exit 1 (сценарий 2).
   Чистият код: exit 0.

   Пускане: node tests/banner-split.test.js .
*/
'use strict';

/* ── ЗАКОВАН ЧАСОВНИК (18.10.2026) ────────────────────────────────────────
   От 18.10.2026 calcElapsed() (а с него и карта C, праг ≥7) брои РАБОТНИ дни
   — резултатът зависи от деня от седмицата. Затова датите са спрямо ОПОРЕН
   ДЕН вторник 20.10.2026 и след всеки boot w.Date и TODAY се заковават на
   него. Сметнато НА РЪКА — работни дни в (опорен+n, 20.10]:
     -8 пон 12.10 → 6 (13–16, 19, 20)       -9 нд 11.10 → 7 (12–16, 19, 20)
     -12 чт 08.10 → 8 (09, 12–16, 19, 20)   -13 ср 07.10 → 9 (08, 09, 12–16, 19, 20) */
process.env.TZ = 'Europe/Sofia';
const REF = [2026, 9, 20]; /* вторник 20.10.2026 */
const isoOf = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
const dayOffset = n => isoOf(new Date(REF[0], REF[1], REF[2] + (n || 0), 12));
const tsOffset = n => new Date(REF[0], REF[1], REF[2] + (n || 0), 10).toISOString();
function pinClock(h) {
  const Real = h.w.Date, ms = new Real(REF[0], REF[1], REF[2], 10).getTime();
  h.w.Date = class extends Real { constructor(...a) { if (!a.length) super(ms); else super(...a); } static now() { return ms; } };
  h.w.TODAY = new h.w.Date(REF[0], REF[1], REF[2]);
  return h;
}

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;
const boot = o => pinClock(H.boot(o));

const STORE = { email: 'dobrich@temax.bg', display_name: 'Управител Добрич', role: 'manager', store_name: 'Добрич' };

function co(over) {
  return Object.assign({
    id: 'c', in_num: 'Добрич-0001', store_name: 'Варна', fulfiller: 'Добрич',
    status: 'pending', date: dayOffset(-1), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(5), note: '', created_at: tsOffset(-1),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null
  }, over);
}

/* fulfiller по подразбиране: true — „вие сте изпълнител" е условието на C. */
function env(clientRows, transportRows) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: STORE,
    data: { client_orders: [], transport_orders: [], stores: [], kasa_reports: [] }
  });
  const w = h.w;
  w.clientOrders = JSON.parse(JSON.stringify(clientRows || []));
  w.clientOrders.forEach(o => {
    o._status = w.calcStatus(o.delivery, o.status);
    o._days = w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = o.__fulfiller !== false;
  });
  w.transportOrders = JSON.parse(JSON.stringify(transportRows || []));
  return h;
}

function cards(h) {
  guard('showLoginBanner() не хвърля', () => h.w.showLoginBanner());
  const b = h.doc.getElementById('notif-banner');
  return Array.from(b ? b.querySelectorAll('.notif-card') : []).map(c => ({
    cls: c.className,
    title: ((c.querySelector('.notif-title') || {}).textContent || '').trim()
  }));
}
const find = (cs, re) => cs.find(c => re.test(c.title));
const A_RE = /клиентск\S* заявк\S* с изтекла дата на доставка/;
const B_RE = /транспортн\S* заявк\S* с изтекла дата/;
const C_RE = /над 7 дни без приключване/;
const dump = cs => cs.map(c => c.title).join(' | ');

(async function run() {

  section('1. pending + доставка вчера → карта A, без C');
  {
    const cs = cards(env([co({ id: 'c1', status: 'pending', delivery: dayOffset(-1) })]));
    ok('A: „1 клиентска заявка с изтекла дата на доставка"',
      !!find(cs, /^1 клиентска заявка с изтекла дата на доставка$/), dump(cs));
    ok('A е urgent', (find(cs, A_RE) || {}).cls === 'notif-card urgent');
    ok('няма карта C', !find(cs, C_RE), dump(cs));
    ok('няма карта B', !find(cs, B_RE), dump(cs));
  }

  section('1б. sent + доставка вчера → пак A (isLate, не _status)');
  {
    const h = env([co({ id: 'c1b', status: 'sent', delivery: dayOffset(-1) })]);
    ok('предпоставка: _status НЕ е overdue', h.w.clientOrders[0]._status !== 'overdue', h.w.clientOrders[0]._status);
    const cs = cards(h);
    ok('A: 1 клиентска заявка с изтекла дата', !!find(cs, /^1 клиентска заявка/), dump(cs));
    ok('няма C', !find(cs, C_RE), dump(cs));
  }

  section('2. sent на 9 раб. дни, доставка утре, изпълнител → C, без A');
  {
    /* ср 07.10 → вт 20.10 = 9 раб. дни */
    const cs = cards(env([co({ id: 'c2', status: 'sent', delivery: dayOffset(1),
      date: dayOffset(-13), created_at: tsOffset(-13) })]));
    ok('няма A', !find(cs, A_RE), dump(cs));
    ok('C: „1 заявка над 7 дни без приключване"',
      !!find(cs, /^1 заявка над 7 дни без приключване$/), dump(cs));
    ok('C е warning, не urgent', (find(cs, C_RE) || {}).cls === 'notif-card warning',
      (find(cs, C_RE) || {}).cls);
  }
  {
    const cs = cards(env([co({ id: 'c2n', status: 'sent', delivery: dayOffset(1),
      date: dayOffset(-13), created_at: tsOffset(-13), __fulfiller: false })]));
    ok('същата, но НЕ изпълнител → няма C', !find(cs, C_RE), dump(cs));
  }
  {
    /* Границата на прага в РАБОТНИ дни: нд 11.10 → 20.10 = точно 7 → C. */
    const cs = cards(env([co({ id: 'c2b', status: 'sent', delivery: dayOffset(1),
      date: dayOffset(-9), created_at: tsOffset(-9) })]));
    ok('точно 7 раб. дни (9 календарни) → C', !!find(cs, /^1 заявка над 7 дни без приключване$/), dump(cs));
  }
  {
    /* пон 12.10 → 20.10 = 6 раб. дни при 8 календарни → под прага, без C
       (по календарни дни щеше да е C). */
    const cs = cards(env([co({ id: 'c2c', status: 'sent', delivery: dayOffset(1),
      date: dayOffset(-8), created_at: tsOffset(-8) })]));
    ok('6 раб. дни (8 календарни) → няма C', !find(cs, C_RE), dump(cs));
  }

  section('3. транспортна с _status overdue → B, не A');
  {
    const tr = { id: 't1', store_name: 'Добрич', status: 'pending', delivery: dayOffset(-2),
      date: dayOffset(-3), created_at: tsOffset(-3), _status: 'overdue', _isFulfiller: false };
    const cs = cards(env([], [tr]));
    ok('B: „1 транспортна заявка с изтекла дата"',
      !!find(cs, /^1 транспортна заявка с изтекла дата$/), dump(cs));
    ok('B е urgent', (find(cs, B_RE) || {}).cls === 'notif-card urgent');
    ok('няма A', !find(cs, A_RE), dump(cs));
  }

  section('4. isLate И ≥7 раб. дни → само A, без дублиране в C');
  {
    /* ср 07.10 → 20.10 = 9 раб. дни */
    const cs = cards(env([co({ id: 'c4', status: 'pending', delivery: dayOffset(-1),
      date: dayOffset(-13), created_at: tsOffset(-13) })]));
    ok('A: 1', !!find(cs, /^1 клиентска заявка/), dump(cs));
    ok('няма C', !find(cs, C_RE), dump(cs));
  }
  {
    /* Множествено число и смесен набор: 2 A + 1 C.
       m1: ср 07.10 → 9 раб. дни; m3: чт 08.10 → 8 раб. дни (≥7 → C). */
    const cs = cards(env([
      co({ id: 'm1', status: 'pending', delivery: dayOffset(-1), date: dayOffset(-13), created_at: tsOffset(-13) }),
      co({ id: 'm2', status: 'sent', delivery: dayOffset(-3) }),
      co({ id: 'm3', status: 'sent', delivery: dayOffset(2), date: dayOffset(-12), created_at: tsOffset(-12) })
    ]));
    ok('A: „2 клиентски заявки с изтекла дата на доставка"',
      !!find(cs, /^2 клиентски заявки с изтекла дата на доставка$/), dump(cs));
    ok('C: „1 заявка над 7 дни без приключване"', !!find(cs, /^1 заявка над 7 дни/), dump(cs));
  }

  section('5. processed, co_eta в бъдещето, 9 раб. дни → никаква карта');
  {
    /* ср 07.10 → 20.10 = 9 раб. дни */
    const cs = cards(env([co({ id: 'c5', status: 'processed', fulfiller: 'Централен офис',
      delivery: dayOffset(-1), co_eta: dayOffset(4),
      date: dayOffset(-13), created_at: tsOffset(-13) })]));
    ok('няма A', !find(cs, A_RE), dump(cs));
    ok('няма C', !find(cs, C_RE), dump(cs));
    ok('„Всичко е наред!"', !!find(cs, /^Всичко е наред!$/), dump(cs));
  }

  section('6. нищо → „Всичко е наред!"');
  {
    const cs = cards(env([], []));
    ok('спокойната карта', !!find(cs, /^Всичко е наред!$/), dump(cs));
    ok('нито A, B или C', !find(cs, A_RE) && !find(cs, B_RE) && !find(cs, C_RE), dump(cs));
  }
  {
    const cs = cards(env([co({ id: 'c6', status: 'pending', delivery: dayOffset(-1) })]));
    ok('при карта A спокойната я няма', !find(cs, /Всичко е наред/), dump(cs));
  }

  report();
})();
