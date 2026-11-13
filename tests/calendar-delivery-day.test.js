/* Календар и конфликт по деня на ДОСТАВКАТА (13.11.2026, сесия kalendar-data-dostavka).

   transport_orders: date = денят на заявката, delivery = денят на доставката,
   hour = часът на доставката. Към 12.11 при 893 от 1262 заявки за 60 дни
   date < delivery — календарът и проверката за конфликт гледаха грешния ден.

   1. Календар: заявка date=пон, delivery=чет → в четвъртък, не в понеделник;
      без delivery → в деня на date; отказана → никъде; заявката към базата е
      ЕДНА (or=), без дублиране.
   2. Календар: един обект, delivery в един ден, 14:00 / 14:20, подадени в
      различни дни → „⚠️ Конфликт"; 14:00 / 14:40 → не.
   3. Формата: реален клик „✓ Подай заявката" с delivery=чет, date=вт срещу
      съществуваща (date=пон, delivery=чет, 14:20) → „⚠️ Възможен конфликт в
      графика"; срещу 14:40 → няма модал, записва; без delivery — по date.

   Fake базата е мини-PostgREST само за формите на заявките в calendar.js и
   checkTransportConflict — така тестът проверява и самата заявка, не само JS.

   Пускане: node tests/calendar-delivery-day.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btnExact, ok, section, report, ticks } = H;

/* ── Дни от текущата седмица (местно време, като getWeekDates в calendar.js) ── */
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const now = new Date(); now.setHours(0, 0, 0, 0);
const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
const day = i => { const d = new Date(mon); d.setDate(mon.getDate() + i); return iso(d); };
const MON = day(0), TUE = day(1), WED = day(2), THU = day(3), FRI = day(4);
const PREV_FRI = day(-3);

/* ── Мини-PostgREST за transport_orders ─────────────────────────────────── */
function cond(row, c) {
  /* c: "поле.оп.стойност" */
  const m = c.match(/^(\w+)\.(eq|gte|lte|neq|is)\.(.*)$/);
  if (!m) throw new Error('непознато условие: ' + c);
  const [, f, op, val] = m;
  const x = row[f] === undefined ? null : row[f];
  if (op === 'is') return val === 'null' ? x === null || x === '' : false;
  if (x === null || x === '') return false;
  if (op === 'eq') return String(x) === val;
  if (op === 'neq') return String(x) !== val;
  if (op === 'gte') return String(x) >= val;
  if (op === 'lte') return String(x) <= val;
}
/* Разделя "a,and(b,c),d" по запетаи на най-горното ниво. */
function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function logic(row, expr) {
  const m = expr.match(/^(and|or)\((.*)\)$/);
  if (m) {
    const parts = splitTop(m[2]).map(p => logic(row, p));
    return m[1] === 'and' ? parts.every(Boolean) : parts.some(Boolean);
  }
  return cond(row, expr);
}
function pgFilter(rows, url) {
  const qs = decodeURIComponent(String(url).split('?')[1] || '');
  const params = qs.split('&').filter(Boolean);
  return rows.filter(r => params.every(p => {
    const i = p.indexOf('=');
    const k = p.slice(0, i), v = p.slice(i + 1);
    if (k === 'order' || k === 'select' || k === 'limit' || k === 'offset') return true;
    if (k === 'or') return logic(r, 'or' + v);
    if (k === 'and') return logic(r, 'and' + v);
    return cond(r, k + '.' + v);
  }));
}

const STORE = 'Кърджали';
function tr(id, o) {
  return Object.assign({ id, store_name: STORE, status: 'new', customer_name: 'Клиент ' + id, address: 'адрес ' + id,
    hour: '10:00', date: MON, delivery: null, notes: 'TAG-' + id }, o);
}

function env(user, rows) {
  const urls = [];
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js', 'calendar.js'],
    user,
    data: {
      transport_orders: url => { urls.push(url); return pgFilter(rows, url); },
      bus_routes: [], client_orders: [], route_templates: [], stores: []
    }
  });
  h.urls = urls;
  return h;
}
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const MGR = { email: 'k@temax.bg', display_name: 'Управител', role: 'manager', store_name: STORE, assigned_stores: [STORE] };

/* Колоната на i-тия ден в решетката на календара. */
function col(h, i) {
  const grid = h.doc.querySelector('#mod-calendar div[style*="grid-template-columns:repeat(7"]');
  return grid ? grid.children[i] : null;
}
const has = (h, i, tag) => { const c = col(h, i); return !!c && c.textContent.indexOf(tag) >= 0; };
function card(h, i, tag) {
  const c = col(h, i); if (!c) return null;
  return Array.from(c.children).find(x => x.textContent.indexOf(tag) >= 0) || null;
}

(async function run() {
  section('1. Календар — денят е delivery, без него date; отказаните — никъде');
  {
    const rows = [
      tr('A', { date: MON, delivery: THU }),                         /* пон → чет */
      tr('B', { date: WED, delivery: null }),                        /* без delivery → ср */
      tr('C', { date: TUE, delivery: FRI, status: 'refused' }),      /* отказана */
      tr('D', { date: PREV_FRI, delivery: TUE }),                    /* подадена миналата седмица, доставка вт */
      tr('E', { date: MON, delivery: day(10) }),                     /* подадена в седмицата, доставка след нея */
      tr('F', { date: TUE, delivery: null, status: 'refused' })      /* отказана, без delivery */
    ];
    const h = env(ADMIN, rows);
    h.w.calWeekOffset = 0;
    h.w.loadCalendar();
    await ticks(10);
    ok('решетката е рендирана', !!col(h, 0));
    ok('A (date=пон, delivery=чет) — в четвъртък', has(h, 3, 'TAG-A'));
    ok('A — НЕ в понеделник', !has(h, 0, 'TAG-A'));
    ok('B (без delivery) — в деня на date (сряда)', has(h, 2, 'TAG-B'));
    ok('D (подадена миналия петък, доставка вт) — във вторник', has(h, 1, 'TAG-D'));
    ok('E (подадена пон, доставка след седмицата) — никъде в седмицата', ![0, 1, 2, 3, 4, 5, 6].some(i => has(h, i, 'TAG-E')));
    ok('C (отказана, delivery=пт) — никъде', ![0, 1, 2, 3, 4, 5, 6].some(i => has(h, i, 'TAG-C')));
    ok('F (отказана, без delivery) — никъде', ![0, 1, 2, 3, 4, 5, 6].some(i => has(h, i, 'TAG-F')));
    const tq = h.urls.filter(u => /transport_orders/.test(u));
    ok('една заявка към transport_orders', tq.length === 1, tq.length);
    ok('заявката изключва отказаните', /status=neq\.refused/.test(tq[0] || ''), tq[0]);
    ok('редът не се дублира (A е в точно една колона, веднъж)',
      [0, 1, 2, 3, 4, 5, 6].filter(i => has(h, i, 'TAG-A')).length === 1 &&
      (col(h, 3).textContent.match(/TAG-A/g) || []).length === 1);
  }

  section('2. Календар — конфликт по деня на доставката');
  {
    const rows = [
      tr('P1', { date: MON, delivery: THU, hour: '14:00' }),
      tr('P2', { date: TUE, delivery: THU, hour: '14:20' }),
      tr('Q1', { store_name: 'Троян', date: MON, delivery: THU, hour: '14:00' }),
      tr('Q2', { store_name: 'Троян', date: WED, delivery: THU, hour: '14:40' })
    ];
    const h = env(ADMIN, rows);
    h.w.calWeekOffset = 0;
    h.w.loadCalendar();
    await ticks(10);
    const p1 = card(h, 3, 'TAG-P1'), p2 = card(h, 3, 'TAG-P2'), q1 = card(h, 3, 'TAG-Q1'), q2 = card(h, 3, 'TAG-Q2');
    ok('и четирите са в четвъртък', !!(p1 && p2 && q1 && q2));
    ok('14:00 / 14:20, подадени пон и вт → „⚠️ Конфликт" и при двете',
      !!p1 && !!p2 && /⚠️ Конфликт/.test(p1.textContent) && /⚠️ Конфликт/.test(p2.textContent));
    ok('14:00 / 14:40 → без конфликт', !!q1 && !!q2 && !/Конфликт/.test(q1.textContent) && !/Конфликт/.test(q2.textContent));
  }

  section('3. Формата — реален клик „✓ Подай заявката"');
  async function submit(rows, delivery, date) {
    const h = env(MGR, rows);
    h.w.openTransportModal();
    await ticks(2);
    const set = (id, val) => { h.doc.getElementById(id).value = val; };
    set('o-name', 'Нов Клиент'); set('o-phone', '0888000000'); set('o-addr', 'ул. Нова 1');
    set('o-date', date); set('o-hour', '14:00'); set('o-delivery', delivery);
    h.doc.querySelector('#o-items .item-product').value = 'ПЛОЧКИ';
    const b = btnExact(h.doc.getElementById('transport-modal'), '✓ Подай заявката');
    realClick(h.w, b, '✓ Подай заявката');
    await ticks(10);
    return h;
  }
  const conflictModal = h => { const ov = h.doc.getElementById('transport-conflict-ov'); return ov && /⚠️ Възможен конфликт в графика/.test(ov.textContent) ? ov : null; };
  {
    const h = await submit([tr('X', { date: MON, delivery: THU, hour: '14:20' })], THU, TUE);
    const ov = conflictModal(h);
    ok('delivery=чет, date=вт срещу (date=пон, delivery=чет, 14:20) → „⚠️ Възможен конфликт"', !!ov);
    ok('модалът показва съществуващата заявка', !!ov && /14:20/.test(ov.textContent) && /Клиент X/.test(ov.textContent));
    ok('не е записано без потвърждение', h.calls.post.filter(p => p.table === 'transport_orders').length === 0);
    const q = h.urls.filter(u => /transport_orders/.test(u)).pop() || '';
    ok('проверката е по store_name и деня на доставка', /store_name=eq\./.test(q) && decodeURIComponent(q).indexOf('delivery.eq.' + THU) >= 0, q);
  }
  {
    const h = await submit([tr('Y', { date: MON, delivery: THU, hour: '14:40' })], THU, TUE);
    ok('срещу 14:40 → няма модал', !conflictModal(h));
    ok('срещу 14:40 → записва', h.calls.post.filter(p => p.table === 'transport_orders').length === 1);
  }
  {
    /* Съществуваща без delivery, date = чет → броим я за четвъртък. */
    const h = await submit([tr('Z', { date: THU, delivery: null, hour: '14:20' })], THU, TUE);
    ok('съществуваща без delivery с date=чет → конфликт с доставка в чет', !!conflictModal(h));
  }
  {
    /* Отказана/изпълнена/отложена в същия ден — без конфликт (изключенията остават). */
    const h = await submit([tr('R1', { delivery: THU, hour: '14:10', status: 'refused' }),
      tr('R2', { delivery: THU, hour: '14:10', status: 'done' }), tr('R3', { delivery: THU, hour: '14:10', status: 'postponed' })], THU, TUE);
    ok('refused/done/postponed → без конфликт', !conflictModal(h));
  }
  {
    /* Нова БЕЗ delivery — както преди, по date. */
    const h = await submit([tr('W', { date: TUE, delivery: FRI, hour: '14:20' })], '', TUE);
    ok('нова без delivery: по date (същия date=вт, 14:20) → конфликт', !!conflictModal(h));
    const q = h.urls.filter(u => /transport_orders/.test(u)).pop() || '';
    ok('нова без delivery: заявката е date=eq.', /date=eq\./.test(q) && !/or=/.test(q), q);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
