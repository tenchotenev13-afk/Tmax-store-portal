/* Чек лист — получатели извън обектите (решение на Тенчо 26.11.2026).

   Писмото „Изпрати" / „Изпрати поправка" отива до:
     · обекта — свой блок „Пропуски на <обект>" + таблицата, бутон
       „Напиши становище в портала →";
     · регионалния (users.is_regional, активен, с имейл) — ЕДНО писмо,
       блоковете само за неговите обекти ∩ отчетните (обект без пропуски →
       зелен ред), бутон „Отвори Чек листа →"; без отчетен обект → не влиза;
     · общата група (контролингът + app_settings.checklist_email_extra) —
       блоковете на всички обекти С пропуски; нито един → „Няма пропуски за
       седмицата".
   Един адрес → едно писмо: обща група > регионален > обект.

   Всички кликове са ИСТИНСКИ (element.click()).
   Пускане:  node tests/checklist-email-recipients.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const YEAR = 2026, WEEK = 47;
const METRICS = [
  { key: 'revizia_953', label: 'ревизия', sublabel: '', value_type: 'yes_no', sort_order: 1, active: true, source: 'manual', portal_mode: null }
];
const ADMIN = { id: 'u-1', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'admin', store_name: 'Централен офис' };

const USERS = [
  { store_name: 'Сливен',  email: 'manager.sliven@temax.bg',  role: 'manager', active: true },
  { store_name: 'Раднево', email: 'manager.radnevo@temax.bg', role: 'manager', active: true },
  { store_name: 'Добрич',  email: 'manager.dobrich@temax.bg', role: 'manager', active: true },
  /* Регионален с два отчетни обекта (Сливен — пропуск, Раднево — без) + склад. */
  { store_name: 'Централен офис', email: 'reg1@temax.bg', display_name: 'Р. Първа', role: 'accounting', active: true,
    is_regional: true, assigned_stores: ['Раднево', 'Сливен', 'Логистичен склад Добрич'], notify_groups: ['regional'] },
  /* Регионален без нито един отчетен обект → не влиза. */
  { store_name: 'Централен офис', email: 'reg2@temax.bg', display_name: 'Р. Втора', role: 'accounting', active: true,
    is_regional: true, assigned_stores: ['Пловдив'], notify_groups: ['regional'] },
  /* Неактивен регионален → не влиза. */
  { store_name: 'Централен офис', email: 'reg3@temax.bg', display_name: 'Р. Трета', role: 'accounting', active: false,
    is_regional: true, assigned_stores: ['Добрич'], notify_groups: ['regional'] },
  /* Контролинг — активен и неактивен. */
  { store_name: 'Централен офис', email: 'ctrl@temax.bg', display_name: 'К. Контрол', role: 'admin', active: true,
    is_regional: false, assigned_stores: [], notify_groups: ['controlling', 'razliki_co'] },
  { store_name: 'Централен офис', email: 'oldctrl@temax.bg', display_name: 'Стар Контрол', role: 'admin', active: false,
    is_regional: false, assigned_stores: [], notify_groups: ['controlling'] },
  { store_name: 'Централен офис', email: 'boss@temax.bg', display_name: 'Шеф Шефов', role: 'admin', active: true,
    is_regional: false, assigned_stores: [], notify_groups: ['owner'] }
];

function r(store, key, f) {
  return Object.assign({ year: YEAR, week_number: WEEK, store_name: store, metric_key: key,
    portal_value: null, control_value: null, control_num: null, comment: null }, f || {});
}
/* Сливен и Добрич — „не" (пропуск), Раднево — „да". */
function gapRows() {
  return [
    r('Сливен', 'revizia_953', { portal_value: 'ne' }),
    r('Раднево', 'revizia_953', { portal_value: 'da' }),
    r('Добрич', 'revizia_953', { portal_value: 'ne' })
  ];
}
function cleanRows() {
  return ['Сливен', 'Раднево', 'Добрич'].map(function (s) { return r(s, 'revizia_953', { portal_value: 'da' }); });
}

function bootIt(opts) {
  opts = opts || {};
  const CUR = opts.rows || gapRows();
  const data = {
    users: USERS, weekly_checklist_metrics: METRICS,
    weekly_checklist: function (url) { return url.indexOf('or=') >= 0 ? [] : CUR; },
    weekly_checklist_sends: opts.sends || [], weekly_checklist_responses: [],
    weekly_checklist_freezes: [{ year: YEAR, week_number: WEEK }],
    recurring_tasks: [], recurring_task_versions: [], recurring_task_periods: [],
    recurring_task_skips: [], task_completions: [], differences_reports: [], stock_differences: []
  };
  if (opts.settings !== undefined) data.app_settings = opts.settings;
  else data.app_settings = [{ key: 'checklist_email_extra', value: JSON.stringify(opts.extra || ['boss@temax.bg']) }];
  const b = { modules: ['bulletin.js', 'checklist.js'], user: ADMIN, data: data };
  if (opts.fail) b.fail = opts.fail;
  return boot(b);
}

async function load(h, mails, failFor) {
  h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
  h.w.loadChecklist(); for (let i = 0; i < 4; i++) await ticks();
  h.errors = [];
  const origErr = h.w.console.error;
  h.w.console.error = function () { h.errors.push(Array.prototype.join.call(arguments, ' ')); };
  h.w.sendEmail = function (to, subject, html) {
    mails.push({ to: to, subject: subject, html: html });
    const bad = !!(failFor && failFor.indexOf(to[0]) >= 0);
    return Promise.resolve({ ok: !bad });
  };
}
async function openModal(h) {
  h.doc.getElementById('cl-send-btn').click(); for (let i = 0; i < 3; i++) await ticks();
}
async function go(h) {
  h.doc.getElementById('cl-send-go').click(); for (let i = 0; i < 12; i++) await ticks();
}
function mailTo(mails, email) { return mails.filter(function (m) { return m.to[0] === email; })[0]; }
function sendRows(h) { return h.calls.post.filter(function (p) { return (p.url || '').indexOf('/weekly_checklist_sends') >= 0; }); }
function txt(h, html) {
  const d = new h.w.DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  return d.body.textContent;
}
/* Частта над таблицата — блоковете „Пропуски". */
function top(h, html) { return txt(h, html.slice(0, html.indexOf('<thead>'))); }
function grpHeads(h) {
  return Array.prototype.map.call(h.doc.querySelectorAll('.cl-send-grp'), function (e) { return e.textContent.trim(); });
}

(async function () {

  section('1. Прозорецът: три групи с брой, всички отметнати');
  const h1 = bootIt();
  const m1 = [];
  await load(h1, m1);
  await openModal(h1);
  const heads = grpHeads(h1);
  ok('групите: Обекти (3) / Регионални (1) / Контролинг и ръководство (2)',
     JSON.stringify(heads) === JSON.stringify(['Обекти (3)', 'Регионални (1)', 'Контролинг и ръководство (2)']), JSON.stringify(heads));
  const cbs = Array.prototype.slice.call(h1.doc.querySelectorAll('.cl-send-cb'));
  ok('6 отметки, всички отметнати', cbs.length === 6 && cbs.every(function (c) { return c.checked; }), String(cbs.length));
  const modalTxt = h1.doc.getElementById('cl-send-ov').textContent;
  ok('регионалният без отчетен обект и неактивните ги няма',
     modalTxt.indexOf('reg2@') < 0 && modalTxt.indexOf('reg3@') < 0 && modalTxt.indexOf('oldctrl@') < 0, modalTxt);
  ok('при регионалния се виждат обектите му (в реда на мрежата)',
     modalTxt.indexOf('Р. Първа') >= 0 && /Раднево, Сливен|Сливен, Раднево/.test(modalTxt), modalTxt);
  ok('общата група носи имената (контролинг + от ключа)',
     modalTxt.indexOf('К. Контрол') >= 0 && modalTxt.indexOf('Шеф Шефов') >= 0, modalTxt);
  await go(h1);

  section('2. Писмата: по едно на човек, правилното съдържание');
  ok('6 писма, всяко с един адрес', m1.length === 6 && m1.every(function (m) { return m.to.length === 1; }), String(m1.length));
  const sl = mailTo(m1, 'manager.sliven@temax.bg'), rg = mailTo(m1, 'reg1@temax.bg'),
        ct = mailTo(m1, 'ctrl@temax.bg'), bs = mailTo(m1, 'boss@temax.bg');
  ok('обект: свой блок, не чужд', sl && top(h1, sl.html).indexOf('Пропуски на Сливен') >= 0 &&
     top(h1, sl.html).indexOf('Добрич') < 0, sl && top(h1, sl.html));
  ok('обект: „Напиши становище в портала →", без „Отвори Чек листа"',
     sl && sl.html.indexOf('Напиши становище в портала →') >= 0 && sl.html.indexOf('Отвори Чек листа') < 0);
  const rt = rg ? top(h1, rg.html) : '';
  ok('регионален: „Пропуски на Сливен" (пропуск)', rt.indexOf('Пропуски на Сливен за седмица 47') >= 0, rt);
  ok('регионален: зелен ред „Няма пропуски на Раднево"', rt.indexOf('Няма пропуски на Раднево за седмица 47') >= 0, rt);
  ok('регионален: зеленият ред е със зелен фон', rg && /background:#f0fdf4[^>]*>Няма пропуски на Раднево/.test(rg.html));
  ok('регионален: Добрич (не е негов) го няма горе', rt.indexOf('Добрич') < 0, rt);
  const order = h1.w.checklistStores.filter(function (s) { return s === 'Сливен' || s === 'Раднево'; });
  ok('регионален: блоковете в реда на мрежата', rt.indexOf(order[0]) < rt.indexOf(order[1]), order.join(',') + ' | ' + rt);
  ok('регионален: цялата таблица отдолу (и Добрич)', rg && /<td[^>]*>Добрич<\/td>/.test(rg.html));
  ok('регионален: „Отвори Чек листа →", без „Напиши становище"',
     rg && rg.html.indexOf('Отвори Чек листа →') >= 0 && rg.html.indexOf('Напиши становище в портала') < 0);
  ok('регионален: същият линк като в писмото на обекта',
     rg && sl && rg.html.indexOf(h1.w.escAttr(h1.w.checklistDeepLinkUrl(YEAR, WEEK))) >= 0 && sl.html.indexOf(h1.w.escAttr(h1.w.checklistDeepLinkUrl(YEAR, WEEK))) >= 0);
  const ctt = ct ? top(h1, ct.html) : '';
  ok('обща група: Сливен и Добрич (с пропуски)', ctt.indexOf('Пропуски на Сливен') >= 0 && ctt.indexOf('Пропуски на Добрич') >= 0, ctt);
  ok('обща група: Раднево (без пропуски) не се изрежда', ctt.indexOf('Раднево') < 0 && ctt.indexOf('Няма пропуски') < 0, ctt);
  ok('обща група: „Отвори Чек листа →"', ct && ct.html.indexOf('Отвори Чек листа →') >= 0 && ct.html.indexOf('Напиши становище в портала') < 0);
  ok('адресът от ключа получава същото писмо като контролинга', bs && ct && bs.html === ct.html);
  ok('нула class= и <style>', m1.every(function (m) { return !/\sclass=/.test(m.html) && !/<style/i.test(m.html); }));
  const rows1 = sendRows(h1);
  ok('recipients = всичките 6 адреса', rows1.length === 1 && (rows1[0].body.recipients || []).slice().sort().join(',') ===
     ['boss@temax.bg', 'ctrl@temax.bg', 'manager.dobrich@temax.bg', 'manager.radnevo@temax.bg', 'manager.sliven@temax.bg', 'reg1@temax.bg'].join(','),
     JSON.stringify(rows1[0] && rows1[0].body.recipients));
  const t1 = h1.doc.getElementById('toast').textContent;
  ok('toast по групи', t1.indexOf('3 обекта · 1 регионални · 2 от ръководството') >= 0, t1);
  ok('няма console.error при здрав ключ', h1.errors.length === 0, JSON.stringify(h1.errors));
  h1.close();

  section('3. Дубликати между групите → едно писмо, обща група печели');
  const h2 = bootIt({ extra: ['CTRL@temax.bg', 'reg1@temax.bg', 'manager.dobrich@temax.bg', 'boss@temax.bg', 'boss@temax.bg'] });
  const m2 = [];
  await load(h2, m2);
  await openModal(h2);
  ok('групите: Обекти (2) / Контролинг и ръководство (4)',
     JSON.stringify(grpHeads(h2)) === JSON.stringify(['Обекти (2)', 'Контролинг и ръководство (4)']), JSON.stringify(grpHeads(h2)));
  await go(h2);
  const addrs = m2.map(function (m) { return m.to[0].toLowerCase(); });
  const uniq = addrs.filter(function (a, i) { return addrs.indexOf(a) === i; });
  ok('всеки адрес — точно едно писмо (без значение на главни/малки)', addrs.length === uniq.length && addrs.length === 6, addrs.join(','));
  const r2 = mailTo(m2, 'reg1@temax.bg'), d2 = mailTo(m2, 'manager.dobrich@temax.bg');
  ok('регионалният в ключа получава ОБЩОТО писмо (Добрич горе)', r2 && top(h2, r2.html).indexOf('Пропуски на Добрич') >= 0, r2 && top(h2, r2.html));
  ok('обектът в ключа получава ОБЩОТО писмо (Сливен горе, „Отвори Чек листа")',
     d2 && top(h2, d2.html).indexOf('Пропуски на Сливен') >= 0 && d2.html.indexOf('Отвори Чек листа →') >= 0);
  h2.close();

  section('4. Липсващ и повреден ключ → само контролингът + console.error');
  for (const kase of [{ name: 'липсващ', settings: [] }, { name: 'повреден', settings: [{ key: 'checklist_email_extra', value: 'не е json' }] },
                      { name: 'обект вместо масив', settings: [{ key: 'checklist_email_extra', value: '{"a":1}' }] }]) {
    const h = bootIt({ settings: kase.settings });
    const m = [];
    await load(h, m);
    await openModal(h);
    ok(kase.name + ': „Контролинг и ръководство (1)"', grpHeads(h).indexOf('Контролинг и ръководство (1)') >= 0, JSON.stringify(grpHeads(h)));
    await go(h);
    ok(kase.name + ': писмата тръгват (5), boss — не', m.length === 5 && !mailTo(m, 'boss@temax.bg'), String(m.length));
    ok(kase.name + ': console.error за ключа', h.errors.some(function (e) { return e.indexOf('checklist_email_extra') >= 0; }), JSON.stringify(h.errors));
    h.close();
  }

  section('5. Махната отметка → няма писмо');
  const h5 = bootIt();
  const m5 = [];
  await load(h5, m5);
  await openModal(h5);
  ['regional', 'general'].forEach(function (k) {
    const cb = h5.doc.querySelector('.cl-send-cb[data-kind="' + k + '"]');
    cb.click();
  });
  ok('кликът маха отметката', !h5.doc.querySelector('.cl-send-cb[data-kind="regional"]').checked);
  await go(h5);
  ok('регионалният не получава', !mailTo(m5, 'reg1@temax.bg'));
  ok('първият от общата група (контролингът) не получава', !mailTo(m5, 'ctrl@temax.bg'));
  ok('останалите 4 получават', m5.length === 4 && !!mailTo(m5, 'boss@temax.bg'), String(m5.length));
  ok('recipients без махнатите', sendRows(h5)[0] && sendRows(h5)[0].body.recipients.indexOf('reg1@temax.bg') < 0 &&
     sendRows(h5)[0].body.recipients.indexOf('ctrl@temax.bg') < 0);
  h5.close();

  section('6. Поправка → същите групи, бележката е в писмата');
  const h6 = bootIt({ sends: [{ id: 's-1', year: YEAR, week_number: WEEK, version: 1, sent_at: '2026-11-23T09:00:00Z',
    sent_by: 'М. Павлова', recipients: ['x@temax.bg'], note: null }] });
  const m6 = [];
  await load(h6, m6);
  ok('бутонът е „Изпрати поправка"', h6.doc.getElementById('cl-send-btn').textContent.indexOf('Изпрати поправка') >= 0);
  await openModal(h6);
  ok('същите три групи', JSON.stringify(grpHeads(h6)) === JSON.stringify(['Обекти (3)', 'Регионални (1)', 'Контролинг и ръководство (2)']), JSON.stringify(grpHeads(h6)));
  h6.doc.getElementById('cl-send-note').value = 'поправен Сливен';
  await go(h6);
  ok('6 писма с „(поправка 2)"', m6.length === 6 && m6.every(function (m) { return m.subject.indexOf('(поправка 2)') >= 0; }), String(m6.length));
  ok('бележката е и в регионалното, и в общото', ['reg1@temax.bg', 'ctrl@temax.bg'].every(function (e) {
    const m = mailTo(m6, e); return m && m.html.indexOf('поправен Сливен') >= 0; }));
  ok('версия 2 в записа', sendRows(h6)[0] && sendRows(h6)[0].body.version === 2);
  h6.close();

  section('7. Провалено писмо → recipients само успелите');
  const h7 = bootIt();
  const m7 = [];
  await load(h7, m7, ['reg1@temax.bg', 'boss@temax.bg']);
  await openModal(h7);
  await go(h7);
  const rec7 = (sendRows(h7)[0] || { body: {} }).body.recipients || [];
  ok('опитани са 6', m7.length === 6, String(m7.length));
  ok('записани 4, без провалените', rec7.length === 4 && rec7.indexOf('reg1@temax.bg') < 0 && rec7.indexOf('boss@temax.bg') < 0 &&
     rec7.indexOf('ctrl@temax.bg') >= 0 && rec7.indexOf('manager.sliven@temax.bg') >= 0, JSON.stringify(rec7));
  h7.close();

  section('8. Седмица без пропуски');
  const h8 = bootIt({ rows: cleanRows() });
  const m8 = [];
  await load(h8, m8);
  await openModal(h8);
  await go(h8);
  const c8 = mailTo(m8, 'ctrl@temax.bg'), r8 = mailTo(m8, 'reg1@temax.bg');
  const c8t = c8 ? top(h8, c8.html) : '';
  ok('обща група: един зелен ред „Няма пропуски за седмицата"', c8t.trim().endsWith('Няма пропуски за седмицата') &&
     c8t.split('Няма пропуски').length === 2, c8t);
  const r8t = r8 ? top(h8, r8.html) : '';
  ok('регионален: зелен ред за всеки свой обект', r8t.indexOf('Няма пропуски на Сливен') >= 0 && r8t.indexOf('Няма пропуски на Раднево') >= 0, r8t);
  h8.close();

  report();
})();
