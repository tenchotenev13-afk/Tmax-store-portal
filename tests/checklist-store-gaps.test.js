/* Чек лист — блок „Пропуски на <обект>" в писмото до обектите
   (checklist-store-gaps, етап А, 23.11.2026; решение на Тенчо по писмо на
   Миглена Павлова от 23.11).

   Какво заковава файлът:
   1. submitChecklistSend строи HTML ПО ПОЛУЧАТЕЛ: всеки обект получава най-горе
      (над таблицата) собствения си блок; таблицата е обща.
   2. Пропуск по ЕФЕКТИВНАТА стойност (контролингът бие портала, в двете посоки):
      „не"; N/M с N < M; сторна с първо число > 0. Не е пропуск: „да", „нямат",
      празно, N/N, 0/0, сторна 0/….
   3. Колона portal_mode 'count' със стойност от портала → дните без отметка
      („без отметка: вт 17.11, чт 19.11") от правилото на checklistPortalPlan;
      ръчна отметка → без дни; брой дни ≠ M − N → без дни.
   4. Провал при дните → писмата тръгват без дни, console.error, toast.
   5. Обект без пропуски → един зелен ред „Няма пропуски за седмицата".
   6. „Изпрати поправка" строи блока наново: портал „не" → изпращане →
      control_value „да" → поправка → клетката я няма в блока.
   7. Само inline стилове в блока.

   МУТАЦИОННА ПРОВЕРКА (23.11.2026, ръчно, върху временно променен checklist.js;
   всяка мутация събаря теста, после файлът е върнат):
     М1 portal бие control — checklistEmailCellValue чете portal_value първо;
     М2 N <= M вместо N < M в checklistStoreGaps;
     М3 един HTML за всички — gapStore: targets[0].store вместо r.store;
     М4 дните и при ръчна отметка — checklistEmailFromPortal винаги true;
     М5 сторна по второто число (sp[1]) вместо по първото.

   Седмицата е закована: С47/2026 (16.11 – 22.11).

   Пускане:  node tests/checklist-store-gaps.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const YEAR = 2026, WEEK = 47;
const MIN_ID = '03c44560-9572-4274-ad53-5228d61b4de7';
const RAZ_ID = '166a22f8-c884-4019-862d-4f20175baa12';

const METRICS = [
  { key: 'revizia_953', label: 'ревизия', sublabel: '', value_type: 'yes_no', sort_order: 1, active: true, source: 'manual', portal_mode: null },
  { key: 'spravka_minusi', label: 'справка минуси', sublabel: '', value_type: 'yes_no', sort_order: 2, active: true, source: 'recurring:' + MIN_ID, portal_mode: 'count' },
  { key: 'stoka_vrashtane', label: 'Стока за връщане', sublabel: '', value_type: 'yes_no', sort_order: 3, active: true, source: 'manual', portal_mode: null },
  { key: 'razliki_dostavka', label: 'Разлики от доставка', sublabel: '', value_type: 'yes_no', sort_order: 4, active: true, source: 'recurring:' + RAZ_ID, portal_mode: 'count' },
  { key: 'storna_priem', label: 'Сторна по грешни приеми', sublabel: '', value_type: 'number', sort_order: 5, active: true, source: 'module:wrong_receipt', portal_mode: null },
  { key: 'preocenka', label: 'преоценка', sublabel: '', value_type: 'yes_no_none', sort_order: 6, active: true, source: 'manual', portal_mode: null }
];
const TASKS = [
  { id: MIN_ID, due_weekdays: [0, 1, 2, 3, 4], active: true, task_type: 'check' },
  { id: RAZ_ID, due_weekdays: [0, 1, 2, 3, 4], active: true, task_type: 'check' }
];
const ADMIN = { id: 'u-1', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'admin', store_name: 'Централен офис' };
const USERS = [
  { store_name: 'Сливен', email: 'manager.sliven@temax.bg', role: 'manager', active: true },
  { store_name: 'Раднево', email: 'manager.radnevo@temax.bg', role: 'manager', active: true },
  { store_name: 'Добрич', email: 'manager.dobrich@temax.bg', role: 'manager', active: true },
  { store_name: 'Централен офис', email: 'co@temax.bg', role: 'admin', active: true }
];

function r(store, key, f) {
  return Object.assign({ year: YEAR, week_number: WEEK, store_name: store, metric_key: key,
    portal_value: null, control_value: null, control_num: null, comment: null }, f || {});
}
function rows() {
  return [
    /* Сливен: „не" от портала; 3/5 от портала (дни вт, чт); 5/5; 10/11 (брой,
       без дни — не е 'count'); сторна 2/5; „нямат". */
    r('Сливен', 'revizia_953', { portal_value: 'ne' }),
    r('Сливен', 'spravka_minusi', { portal_value: '3/5' }),
    r('Сливен', 'razliki_dostavka', { portal_value: '5/5' }),
    r('Сливен', 'stoka_vrashtane', { portal_value: '10/11' }),
    r('Сливен', 'storna_priem', { portal_value: '2/5' }),
    r('Сливен', 'preocenka', { control_value: 'nyamat' }),
    /* Раднево: портал „не", контролинг „да" → няма; портал 4/5, контролинг
       „да" → няма; 2/5 от портала (дни ср, чт, пт); 16/16; 0/0; портал „да",
       контролинг „не" → пропуск. */
    r('Раднево', 'revizia_953', { portal_value: 'ne', control_value: 'da' }),
    r('Раднево', 'spravka_minusi', { portal_value: '4/5', control_value: 'da' }),
    r('Раднево', 'razliki_dostavka', { portal_value: '2/5' }),
    r('Раднево', 'stoka_vrashtane', { portal_value: '16/16' }),
    r('Раднево', 'storna_priem', { portal_value: '0/0' }),
    r('Раднево', 'preocenka', { portal_value: 'da', control_value: 'ne' }),
    /* Добрич: нищо за казване. */
    r('Добрич', 'revizia_953', { portal_value: 'da' }),
    r('Добрич', 'spravka_minusi', { portal_value: '5/5' }),
    r('Добрич', 'storna_priem', { portal_value: '0/0' })
  ];
}
/* Отметките: Сливен минуси пн, ср, пт; Раднево разлики пн, вт (+ минуси 4 дни). */
function comp(id, store, iso, st) {
  return { id: id + store + iso, recurring_task_id: id, store_name: store, completion_date: iso, status: st || 'done', postponed_to: null, files: null };
}
const COMPS = [
  comp(MIN_ID, 'Сливен', '2026-11-16'), comp(MIN_ID, 'Сливен', '2026-11-18'), comp(MIN_ID, 'Сливен', '2026-11-20'),
  comp(RAZ_ID, 'Сливен', '2026-11-16'), comp(RAZ_ID, 'Сливен', '2026-11-17'), comp(RAZ_ID, 'Сливен', '2026-11-18'),
  comp(RAZ_ID, 'Сливен', '2026-11-19'), comp(RAZ_ID, 'Сливен', '2026-11-20'),
  comp(RAZ_ID, 'Раднево', '2026-11-16'), comp(RAZ_ID, 'Раднево', '2026-11-17'),
  comp(MIN_ID, 'Раднево', '2026-11-16'), comp(MIN_ID, 'Раднево', '2026-11-17'), comp(MIN_ID, 'Раднево', '2026-11-18'), comp(MIN_ID, 'Раднево', '2026-11-19')
];

function bootIt(opts) {
  opts = opts || {};
  const CUR = rows();
  const b = {
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: USERS, weekly_checklist_metrics: METRICS,
      weekly_checklist: function (url) { return url.indexOf('or=') >= 0 ? [] : CUR; },
      weekly_checklist_sends: [], weekly_checklist_responses: [],
      /* Затворена седмица → стойностите са записаните (без rpc). */
      weekly_checklist_freezes: [{ year: YEAR, week_number: WEEK }],
      recurring_tasks: TASKS, recurring_task_versions: [], recurring_task_periods: [],
      recurring_task_skips: [], task_completions: COMPS, differences_reports: [], stock_differences: []
    }
  };
  if (opts.fail) b.fail = opts.fail;
  return boot(b);
}

/* Блокът „Пропуски" от писмо — текстът между началото му и таблицата. */
function blockOf(html) {
  const a = html.indexOf('Пропуски на ');
  const g = html.indexOf('Няма пропуски за седмицата');
  const s = a >= 0 ? a : g;
  if (s < 0) return '';
  const t = html.indexOf('<table', s);
  return html.slice(s, t > 0 ? t : undefined);
}
function txt(h, html) {
  const d = new h.w.DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  return d.body.textContent;
}
async function openAndSend(h, mails) {
  h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
  h.w.loadChecklist(); for (let i = 0; i < 4; i++) await ticks();
  h.w.sendEmail = function (to, subject, html) { mails.push({ to: to[0], html: html }); return Promise.resolve({ ok: true }); };
  await send(h);
}
async function send(h) {
  h.doc.getElementById('cl-send-btn').click(); await ticks(); await ticks();
  h.doc.getElementById('cl-send-go').click();
  for (let i = 0; i < 12; i++) await ticks();
}
function mailTo(mails, email) { return mails.filter(function (m) { return m.to === email; })[0]; }

(async function () {

  section('1. По получател — всеки със собствения блок');
  const h1 = bootIt();
  const mails = [];
  await openAndSend(h1, mails);
  const sl = mailTo(mails, 'manager.sliven@temax.bg'), rd = mailTo(mails, 'manager.radnevo@temax.bg'), db = mailTo(mails, 'manager.dobrich@temax.bg');
  ok('три писма — по едно на обект', mails.length === 3 && !!sl && !!rd && !!db, String(mails.length));
  ok('писмата са РАЗЛИЧНИ (HTML по получател)', sl && rd && sl.html !== rd.html);
  const bs = sl ? txt(h1, blockOf(sl.html)) : '', br = rd ? txt(h1, blockOf(rd.html)) : '', bd = db ? txt(h1, blockOf(db.html)) : '';
  ok('Сливен: заглавие „Пропуски на Сливен за седмица 47"', bs.indexOf('Пропуски на Сливен за седмица 47') >= 0, bs);
  ok('Сливен НЕ вижда блока на Раднево', sl && sl.html.indexOf('Пропуски на Раднево') < 0);
  ok('Раднево: „Пропуски на Раднево за седмица 47"', br.indexOf('Пропуски на Раднево за седмица 47') >= 0, br);
  ok('блокът е над таблицата', sl && sl.html.indexOf('Пропуски на Сливен') < sl.html.indexOf('<thead>'));
  ok('таблицата с всички обекти остава (Раднево е в писмото на Сливен)', sl && /<td[^>]*>Раднево<\/td>/.test(sl.html));

  section('2. Видове пропуски и не-пропуски');
  ok('„не" от портала → „ревизия: не"', bs.indexOf('ревизия: не') >= 0, bs);
  ok('N<M от портала, count → дните „вт 17.11, чт 19.11"', bs.indexOf('справка минуси: 3/5 — без отметка: вт 17.11, чт 19.11') >= 0, bs);
  ok('N<M, не count → само стойността', bs.indexOf('Стока за връщане: 10/11') >= 0 && bs.indexOf('10/11 — без отметка') < 0, bs);
  ok('сторна 2/5 → „сторнирани: 2 поръчки / 5 позиции"', bs.indexOf('Сторна по грешни приеми: сторнирани: 2 поръчки / 5 позиции') >= 0, bs);
  ok('N/N (5/5) не е пропуск', bs.indexOf('Разлики от доставка') < 0, bs);
  ok('„нямат" не е пропуск', bs.indexOf('преоценка') < 0, bs);
  ok('Раднево: 16/16 и 0/0 сторна не са пропуск', br.indexOf('Стока за връщане') < 0 && br.indexOf('Сторна') < 0, br);
  ok('Раднево 2/5 count → дни „ср 18.11, чт 19.11, пт 20.11"', br.indexOf('Разлики от доставка: 2/5 — без отметка: ср 18.11, чт 19.11, пт 20.11') >= 0, br);

  section('3. Контролингът бие портала — в двете посоки');
  ok('портал „не", контролинг „да" → няма пропуск', br.indexOf('ревизия') < 0, br);
  ok('портал 4/5, контролинг „да" → няма пропуск (и без дни)', br.indexOf('справка минуси') < 0, br);
  ok('портал „да", контролинг „не" → пропуск „преоценка: не"', br.indexOf('преоценка: не') >= 0, br);

  section('4. Обект без пропуски, inline стилове');
  ok('Добрич: един зелен ред „Няма пропуски за седмицата"', bd.trim() === 'Няма пропуски за седмицата', bd);
  ok('… зелен фон', db && /background:#f0fdf4[^>]*>Няма пропуски за седмицата/.test(db.html));
  ok('нула class= и <style> в писмата', mails.every(function (m) { return !/\sclass=/.test(m.html) && !/<style/i.test(m.html); }));
  ok('toast е зелен успех без бележка за дни', /Изпратено до 3 обекта/.test(h1.doc.getElementById('toast').textContent) &&
     h1.doc.getElementById('toast').textContent.indexOf('дните') < 0, h1.doc.getElementById('toast').textContent);

  section('5. Поправка след корекция на контролинга');
  {
    const row = h1.w.checklistRows.filter(function (x) { return x.store_name === 'Сливен' && x.metric_key === 'revizia_953'; })[0];
    row.control_value = 'da';
    const minus = h1.w.checklistRows.filter(function (x) { return x.store_name === 'Сливен' && x.metric_key === 'spravka_minusi'; })[0];
    minus.control_value = 'ne';   /* ръчна отметка върху count колона → без дни */
    const m2 = [];
    h1.w.sendEmail = function (to, subject, html) { m2.push({ to: to[0], html: html }); return Promise.resolve({ ok: true }); };
    await send(h1);
    const s2 = mailTo(m2, 'manager.sliven@temax.bg');
    const b2 = s2 ? txt(h1, blockOf(s2.html)) : '';
    ok('поправката тръгна', m2.length === 3, String(m2.length));
    ok('control „да" → ревизията я няма в блока', b2.indexOf('ревизия') < 0, b2);
    ok('ръчно „не" на справка минуси → „справка минуси: не", без дни', b2.indexOf('справка минуси: не') >= 0 && b2.indexOf('без отметка') < 0, b2);
    ok('другите пропуски остават', b2.indexOf('Сторна по грешни приеми') >= 0, b2);
  }
  h1.close();

  section('6. Единични случаи — checklistStoreGaps');
  {
    const h = bootIt();
    const S = 'X';
    const one = function (key, f, days) {
      return h.w.checklistStoreGaps(S, [r(S, key, f)], METRICS, days || null);
    };
    ok('празна клетка → нищо', one('revizia_953', {}).length === 0);
    ok('0/0 (count) → нищо', one('spravka_minusi', { portal_value: '0/0' }).length === 0);
    ok('5/5 → нищо; 4/5 → пропуск', one('spravka_minusi', { portal_value: '5/5' }).length === 0 &&
       one('spravka_minusi', { portal_value: '4/5' }).length === 1);
    ok('сторна 0/3 → нищо', one('storna_priem', { portal_value: '0/3' }).length === 0);
    ok('сторна control_num 3 → „сторнирани: 3 поръчки"', (one('storna_priem', { control_num: 3 })[0] || {}).text === 'сторнирани: 3 поръчки');
    ok('сторна control_num 0 бие портала 2/5 → нищо', one('storna_priem', { portal_value: '2/5', control_num: 0 }).length === 0);
    const g = one('spravka_minusi', { portal_value: '3/5' }, { 'X|spravka_minusi': ['2026-11-17'] });
    ok('дни, които не съвпадат с M − N → без дни, daysLost', g[0] && g[0].days === null && g[0].daysLost === true, JSON.stringify(g));
    const g2 = one('spravka_minusi', { portal_value: '3/5' }, { 'X|spravka_minusi': ['2026-11-17', '2026-11-19'] });
    ok('съвпадащи дни → показват се', g2[0] && g2[0].days && g2[0].days.length === 2);
    const g3 = one('spravka_minusi', { portal_value: '3/5', control_value: '3/5' }, { 'X|spravka_minusi': ['2026-11-17', '2026-11-19'] });
    ok('ръчно въведен брой (control „3/5") → пропуск, но без дни', g3[0] && g3[0].text === '3/5' && g3[0].days === null && g3[0].daysLost === false, JSON.stringify(g3));
    ok('етикет на ден: 2026-11-22 → „нд 22.11"', h.w.checklistGapDayLabel('2026-11-22') === 'нд 22.11');
    h.close();
  }

  section('7. Дните от правилото — пренесено отмятане');
  {
    /* Сливен минуси: вторник пренесен в събота и отметнат там → дължи пн, ср,
       чт, пт + сб; има пн, ср, пт, сб → без отметка: чт. */
    const h = bootIt();
    h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK; h.w.checklistStores = ['Сливен'];
    h.w.checklistMetrics = METRICS;
    const comps = [
      comp(MIN_ID, 'Сливен', '2026-11-16'), comp(MIN_ID, 'Сливен', '2026-11-18'), comp(MIN_ID, 'Сливен', '2026-11-20'),
      Object.assign(comp(MIN_ID, 'Сливен', '2026-11-17'), { postponed_to: '2026-11-21' })
    ];
    const plan = h.w.checklistPortalPlan(METRICS[1], TASKS[0], comps, h.w.weekDays(WEEK, YEAR).map(h.w.toLocalISO));
    const miss = plan.missFor('Сливен');
    ok('без отметка: само четвъртък', JSON.stringify(miss) === '["2026-11-19"]', JSON.stringify(miss));
    ok('… и съвпада с M − N (4/5)', plan.denomFor('Сливен') - Object.keys(plan.hits['Сливен']).length === miss.length);
    h.close();
  }

  section('8. Провал при дните — писмата тръгват без дни');
  {
    const h = bootIt();
    const errs = [];
    const mails8 = [];
    h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
    h.w.loadChecklist(); for (let i = 0; i < 4; i++) await ticks();
    h.w.console.error = function () { errs.push(Array.prototype.join.call(arguments, ' ')); };
    h.w.checklistLoadGapDays = function () { return Promise.reject(new Error('мрежов срив')); };
    h.w.sendEmail = function (to, subject, html) { mails8.push({ to: to[0], html: html }); return Promise.resolve({ ok: true }); };
    await send(h);
    const s8 = mailTo(mails8, 'manager.sliven@temax.bg');
    const b8 = s8 ? txt(h, blockOf(s8.html)) : '';
    ok('писмата тръгнаха (3)', mails8.length === 3, String(mails8.length));
    ok('блокът е там, със стойността, без дни', b8.indexOf('справка минуси: 3/5') >= 0 && b8.indexOf('без отметка') < 0, b8);
    ok('console.error е извикан', errs.some(function (e) { return e.indexOf('дните без отметка не се заредиха') >= 0; }), JSON.stringify(errs));
    const t = h.doc.getElementById('toast').textContent;
    ok('toast след изпращането казва, че дните не са заредени', /Изпратено до 3 обекта/.test(t) && t.indexOf('дните без отметка не се заредиха') >= 0, t);
    h.close();
  }
  {
    /* Отметките не се заредиха (sbGet → []) → правилото дава 5 дни срещу 3/5 →
       не съвпадат → без дни + бележка. */
    const h = bootIt({ fail: { GET: /task_completions/ } });
    const errs = [];
    const mails9 = [];
    h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
    h.w.loadChecklist(); for (let i = 0; i < 4; i++) await ticks();
    h.w.console.error = function () { errs.push(Array.prototype.join.call(arguments, ' ')); };
    h.w.sendEmail = function (to, subject, html) { mails9.push({ to: to[0], html: html }); return Promise.resolve({ ok: true }); };
    await send(h);
    const s9 = mailTo(mails9, 'manager.sliven@temax.bg');
    ok('отметките паднаха → писмата пак тръгват (3)', mails9.length === 3, String(mails9.length));
    ok('… без дни', s9 && blockOf(s9.html).indexOf('без отметка') < 0);
    const t = h.doc.getElementById('toast').textContent;
    ok('… toast: „за 2 клетки писмата са без дни"', t.indexOf('за 2 клетки писмата са без дни') >= 0, t);
    ok('… console.error за разминаването', errs.some(function (e) { return e.indexOf('не съвпадат с броя') >= 0; }), JSON.stringify(errs));
    h.close();
  }

  section('9. Без gapStore (отчетът, старите извиквания) — без блок');
  {
    const h = bootIt();
    const html = h.w.checklistEmailHtml(YEAR, WEEK, 1, rows(), METRICS, ['Сливен', 'Раднево'], null);
    ok('няма „Пропуски на" и „Няма пропуски"', html.indexOf('Пропуски на ') < 0 && html.indexOf('Няма пропуски за седмицата') < 0);
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
