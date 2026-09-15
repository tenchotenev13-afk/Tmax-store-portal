/* ОТЧЕТ „ЛОГИСТИЧЕН СКЛАД — НЕОБРАБОТЕНИ ЗАЯВКИ" — неделя 21:00, до складовете.

   collectWarehouseReportData(fulfiller, cb) + reportWarehouseHtml(data) +
   reportWarehouseSubject(data) + reportWarehouseRecipients(users), дословно
   същите в send-scheduled-report (tests/report-edge-sync.test.js).

   Критерий: client_orders със status='pending' и fulfiller = store_name на
   склада. Просрочието — reportIsLate/reportLateDays (не втори критерий);
   „чака" — reportWaitDays, изнесено от кросмодулния колектор.

     a) заявка с fulfiller на другия склад → не влиза
     b) status ≠ pending → не влиза
     c) групиране по обект, ред по просрочени desc (после по брой)
     d) просрочена → червен маркер „+N просрочие"; непросрочена → само „чака N дни"
     e) 0 заявки → сивата линия, писмото се строи
     f) получатели: logistics с имейл → да; без имейл / неактивен → не;
        manager / регионален → не
     g) темата носи името на склада и датата
     h) истински клик по „Тест до мен" на реда „Склад" в Администрация →
        Известия → „📧 Общи отчети" (до 15.09.2026 — лента в таб „Днес")

   Стъбът връща ЦЯЛАТА таблица независимо от query низа — a) и b) доказват JS
   филтъра. Часовникът е замразен в неделя 13.09.2026 21:00.

   Пускане:  node tests/warehouse-report.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };
const TWH = 'Логистичен склад Търговище';
const DWH = 'Логистичен склад Добрич';

function co(id, store, inNum, customer, date, delivery, extra) {
  return Object.assign({ id: id, in_num: inNum, store_name: store, customer_name: customer,
    fulfiller: TWH, status: 'pending', delivery: delivery, co_eta: null, awaiting_stock: false,
    date: date, created_at: date + 'T08:00:00.000Z' }, extra || {});
}
/* Отчетен ден 13.09: „чака" = 13.09 − date; просрочие = 13.09 − delivery. */
const ORDERS = [
  co('o1', 'Шумен', 'К-101', 'Иван', '2026-09-01', '2026-09-10'),     /* чака 12, +3 */
  co('o2', 'Шумен', 'К-102', 'Мария', '2026-09-10', '2026-09-20'),    /* чака 3 */
  co('o3', 'Габрово', 'К-201', 'Петър', '2026-09-05', '2026-09-12'),  /* чака 8, +1 */
  co('o4', 'Габрово', 'К-202', 'Нина', '2026-09-12', '2026-09-11'),   /* чака 1, +2 */
  co('o5', 'Троян', 'К-301', 'Георги', '2026-09-08', null),           /* чака 5, без срок */
  co('o6', 'Троян', 'К-302', 'Елена', '2026-09-09', '2026-09-30'),    /* чака 4 */
  co('o7', 'Троян', 'К-303', 'Стоян', '2026-09-11', null),            /* чака 2 */
  co('o8', 'Шумен', 'Д-900', 'ДРУГ-СКЛАД', '2026-09-02', '2026-09-03', { fulfiller: DWH }),    /* a) */
  co('o9', 'Шумен', 'Т-DONE', 'ПРИКЛЮЧЕНА', '2026-09-02', '2026-09-03', { status: 'done' }),  /* b) */
  co('o10', 'Габрово', 'Т-PROC', 'ОБРАБОТЕНА', '2026-09-02', '2026-09-03', { status: 'processed' }) /* b) */
];

function env(orders, modules) {
  const h = boot({
    modules: modules || ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: { client_orders: orders || ORDERS, users: [], report_snapshots: [] }
  });
  const Real = h.w.Date, fixedMs = new Real('2026-09-13T21:00:00').getTime();
  h.w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  };
  return h;
}
const collect = (h, wh) => new Promise(res => { h.w.collectWarehouseReportData(wh, res); });
const allNums = d => (d.groups || []).reduce((a, g) => a.concat(g.items.map(x => x.in_num)), []);
/* Редът на заявка в HTML — от „№ X" до затварящия </div>. */
const rowOf = (html, num) => {
  const i = html.indexOf('№ ' + num);
  return i < 0 ? '' : html.slice(i, html.indexOf('</div>', i));
};

(async function () {

  section('a) + b) критерият');
  {
    const h = env();
    const d = await collect(h, TWH);
    if (ok('колекторът връща данни', !!d, String(d))) {
      ok('7 заявки за Търговище', d.total === 7, String(d.total));
      ok('a) заявката на Добрич не влиза', allNums(d).indexOf('Д-900') < 0, allNums(d).join('|'));
      ok('b) done не влиза', allNums(d).indexOf('Т-DONE') < 0);
      ok('b) processed не влиза', allNums(d).indexOf('Т-PROC') < 0);
      ok('отчетният ден е неделя 13.09', d.reportDate === '2026-09-13', d.reportDate);
    }
    const q = h.calls.get.filter(u => u.indexOf('/client_orders') >= 0);
    ok('заявката е pending и за fulfiller-а на склада',
      q.length === 1 && q[0].indexOf('status=eq.pending') >= 0 &&
      decodeURIComponent(q[0]).indexOf('fulfiller=eq.' + TWH) >= 0, q.join(' | '));

    const dd = await collect(h, DWH);
    ok('a) обратно: за Добрич е само Д-900', dd.total === 1 && allNums(dd).join('|') === 'Д-900', allNums(dd).join('|'));
    h.close();
  }

  section('c) групиране по обект, ред по просрочени desc');
  {
    const h = env();
    const d = await collect(h, TWH);
    ok('3 обекта', d.stores === 3, String(d.stores));
    ok('ред на групите: Габрово (2 просрочени), Шумен (1), Троян (0, но 3 заявки)',
      d.groups.map(g => g.store).join('|') === 'Габрово|Шумен|Троян', d.groups.map(g => g.store + ':' + g.late + '/' + g.count).join('|'));
    const tr = d.groups.find(g => g.store === 'Троян');
    ok('в групата — по дни чакане desc (Троян: К-301 5, К-302 4, К-303 2)',
      tr.items.map(x => x.in_num + ':' + x.waitDays).join('|') === 'К-301:5|К-302:4|К-303:2',
      tr.items.map(x => x.in_num + ':' + x.waitDays).join('|'));
    const gb = d.groups.find(g => g.store === 'Габрово');
    ok('Габрово: К-201 (8) преди К-202 (1)', gb.items.map(x => x.in_num).join('|') === 'К-201|К-202');

    const html = h.w.reportWarehouseHtml(d);
    ok('шапка „7 необработени заявки от 3 обекта · 3 просрочени · най-старата чака 12 дни"',
      html.indexOf('7 необработени заявки от 3 обекта · 3 просрочени · най-старата чака 12 дни') >= 0,
      (html.match(/\d+ необработен[^<]*/) || [''])[0]);
    ok('групите в HTML са в същия ред',
      html.indexOf('>Габрово</a>') < html.indexOf('>Шумен</a>') && html.indexOf('>Шумен</a>') < html.indexOf('>Троян</a>'));
    h.close();
  }

  section('d) просрочие и „чака"');
  {
    const h = env();
    const d = await collect(h, TWH);
    const html = h.w.reportWarehouseHtml(d);
    const r101 = rowOf(html, 'К-101');
    ok('просрочена: „№ К-101 · Иван · 01.09.2026 · чака 12 дни" + червено „+3 просрочие"',
      /^№ К-101 · Иван · 01\.09\.2026 · чака 12 дни · <b style="color:#C0392B;">\+3 просрочие<\/b>$/.test(r101), r101);
    const r102 = rowOf(html, 'К-102');
    ok('непросрочена: само „чака 3 дни"', r102 === '№ К-102 · Мария · 10.09.2026 · чака 3 дни', r102);
    const r202 = rowOf(html, 'К-202');
    ok('„чака 1 ден" (единствено число) и „+2 просрочие"',
      r202.indexOf('чака 1 ден ·') >= 0 && r202.indexOf('+2 просрочие') >= 0, r202);
    ok('заявка без срок не е просрочена (К-301)', rowOf(html, 'К-301').indexOf('просрочие') < 0);
    ok('lateDays идват от reportLateDays — К-101 = 3', d.groups[1].items[0].lateDays === 3,
      JSON.stringify(d.groups[1].items[0]));
    h.close();
  }

  section('e) 0 заявки → сивата линия, писмото се строи');
  {
    const h = env([]);
    const d = await collect(h, TWH);
    ok('колекторът връща данни и при 0', !!d && d.total === 0, JSON.stringify(d));
    const html = h.w.reportWarehouseHtml(d);
    ok('сивата линия „Няма необработени заявки"', /color:#94a3b8;">Няма необработени заявки<\/div>/.test(html));
    ok('без шапка с числа', html.indexOf('необработени заявки от') < 0);
    ok('писмото е цяло — с „Отвори в портала"', html.indexOf('<!DOCTYPE html>') === 0 && html.indexOf('Отвори в портала') >= 0);
    ok('и темата е построена', h.w.reportWarehouseSubject(d) === 'Необработени заявки — ' + TWH + ' — 13.09.2026');
    h.close();
  }

  section('f) получатели');
  {
    const h = env();
    const users = [
      { email: 'twh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: TWH, active: true },
      { email: 'dwh@temax.bg', display_name: 'Склад Добрич', role: 'logistics', store_name: DWH, active: true },
      { email: '', display_name: 'Без имейл', role: 'logistics', store_name: TWH, active: true },
      { email: 'off@temax.bg', display_name: 'Неактивен', role: 'logistics', store_name: DWH, active: false },
      { email: 'mgr@temax.bg', display_name: 'Управител', role: 'manager', store_name: 'Шумен', active: true },
      { email: 'reg@temax.bg', display_name: 'Регионален', role: 'accounting', is_regional: true,
        store_name: 'Централен офис', assigned_stores: ['Шумен'], active: true },
      { email: 'Twh@Temax.bg', display_name: 'Дубликат', role: 'logistics', store_name: TWH, active: true }
    ];
    const plan = h.w.reportWarehouseRecipients(users);
    const emails = plan.map(p => p.email.toLowerCase()).join('|');
    ok('logistics с имейл → двата склада', emails === 'twh@temax.bg|dwh@temax.bg', emails);
    ok('всеки носи СВОЯ склад', plan.map(p => p.warehouse).join('|') === TWH + '|' + DWH);
    ok('без имейл и неактивен → не', emails.indexOf('off@') < 0 && plan.length === 2);
    ok('manager и регионален → не', emails.indexOf('mgr@') < 0 && emails.indexOf('reg@') < 0);
    ok('дубликатът по имейл (главни букви) не дава второ писмо', plan.length === 2);
    h.close();
  }

  section('g) темата');
  {
    const h = env();
    const d = await collect(h, TWH);
    ok('„Необработени заявки — Логистичен склад Търговище — 13.09.2026"',
      h.w.reportWarehouseSubject(d) === 'Необработени заявки — Логистичен склад Търговище — 13.09.2026',
      h.w.reportWarehouseSubject(d));
    ok('без дата — без „NaN"', h.w.reportWarehouseSubject({ warehouse: TWH }) === 'Необработени заявки — ' + TWH);
    h.close();
  }

  section('Кросмодулният колектор ползва същото „чака" (reportWaitDays)');
  {
    const h = env();
    const cross = await new Promise(res => {
      h.w.collectCrossModuleWeeklySummary(res, { from: '2026-09-07', to: '2026-09-13' }, null);
    });
    const k101 = (cross.warehousePending || []).find(x => x.in_num === 'К-101');
    ok('седмичната секция дава за К-101 същите 12 дни и +3', !!k101 && k101.waitDays === 12 && k101.lateDays === 3,
      JSON.stringify(k101));
    h.close();
  }

  section('h) истински клик по „Тест до мен" на реда „Склад" в Администрация → Известия');
  {
    const h = env(ORDERS, ['bulletin.js', 'email.js', 'admin.js', 'report.js']);
    const sent = [];
    h.w.sendEmail = function (to, subject, html) {
      sent.push({ to: to, subject: subject, html: html });
      return Promise.resolve({ ok: true, status: 200 });
    };
    h.w.loadReportsAdmin();
    await ticks(); await ticks(); await ticks();
    const row = h.doc.getElementById('report-row-warehouse');
    const btn = row && Array.from(row.querySelectorAll('button')).find(b => b.textContent.trim() === 'Тест до мен');
    if (ok('редът „Склад" има бутон „Тест до мен"', !!btn)) {
      ok('разписанието е неделя 21:00', row.textContent.indexOf('неделя 21:00') >= 0, row.textContent);
      ok('без „Изпрати сега" (ръчен път до получателите няма)', row.textContent.indexOf('Изпрати сега') < 0);
      realClick(h.w, btn, 'Склад: Тест до мен');
      await ticks(); await ticks();
      ok('кликът праща точно едно писмо', sent.length === 1, String(sent.length));
      const m = sent[0] || {};
      ok('до имейла на натисналия', m.to === ADMIN.email, String(m.to));
      ok('за Търговище, с „(тест)"',
        m.subject === 'Необработени заявки — Логистичен склад Търговище — 13.09.2026 (тест)', String(m.subject));
      ok('и в писмото са заявките на Търговище, не на Добрич',
        !!m.html && m.html.indexOf('К-101') >= 0 && m.html.indexOf('Д-900') < 0);
    }
    h.close();
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
