/* Чек лист — повтарящи се пропуски в колоните с брой и становищата за
   седмица M в писмото до регионалните и общата група (checklist-streaks-
   responses, решение на Тенчо 27.11.2026; Теодор, отговор 27.11).

   Какво заковава файлът (истински клик по „Изпрати" в таба):
   1. checklistGapStreak — поредни седмици с пропуск в брой (N/M с N < M;
      сторна — първо число > 0) в същата клетка, по ефективната стойност:
      1 → без надпис; 2 → „· 2-ра поредна седмица"; 3 → тъмночервен ред
      (CHECKLIST_EMAIL_HOT); 9 подред → „· 8+ поредни седмици".
      Ръчно „да" прекъсва; липсваща седмица прекъсва; сторна с control_num.
      Надписът е и в писмото на обекта, и при регионалния, и при общата група.
   2. „Чек лист — становища за седмица 47" (reportChecklistResponsesHtml от
      report.js): текст / „няма становище" / „след срока" (запис след петък
      27.11 18:00 Europe/Sofia); регионалният вижда само своите обекти,
      общата група — всички; писмото на ОБЕКТА — без блока.
   3. Седмица 47 не е изпратена → сив ред „Седмица 47 не е изпратена до
      обектите"; провалена заявка за становищата → без блока, писмото тръгва.
   4. Само inline стилове (нула class= и <style>).

   МУТАЦИОННА ПРОВЕРКА — tests/ не я пуска; прави се ръчно (27.11.2026):
     М1 N <= M вместо N < M в checklistIsCountGap;
     М2 тъмночервено от 2-ра седмица (streak >= 2) в checklistEmailGapsHtml;
     М3 checklistGapStreak с условие „не" вместо checklistIsCountGap;
     М4 блокът становища без проверката за audience 'office';
     М5 обхват checklistStores вместо extra.gapStores в блока становища.

   Седмицата е закована: С48/2026 (23.11 – 29.11), M = С47 (16.11 – 22.11).

   Пускане:  node tests/checklist-gap-streak.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const YEAR = 2026, WEEK = 48;
const MIN_ID = '03c44560-9572-4274-ad53-5228d61b4de7';

const METRICS = [
  { key: 'revizia_953', label: 'ревизия', sublabel: '', value_type: 'yes_no', sort_order: 1, active: true, source: 'manual', portal_mode: null },
  { key: 'spravka_minusi', label: 'справка минуси', sublabel: '', value_type: 'yes_no', sort_order: 2, active: true, source: 'recurring:' + MIN_ID, portal_mode: 'count' },
  { key: 'storna_priem', label: 'Сторна по грешни приеми', sublabel: '', value_type: 'number', sort_order: 3, active: true, source: 'module:wrong_receipt', portal_mode: null }
];
const ADMIN = { id: 'u-1', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'admin', store_name: 'Централен офис' };
const USERS = [
  { store_name: 'Сливен', email: 'manager.sliven@temax.bg', role: 'manager', active: true },
  { store_name: 'Раднево', email: 'manager.radnevo@temax.bg', role: 'manager', active: true },
  { store_name: 'Добрич', email: 'manager.dobrich@temax.bg', role: 'manager', active: true },
  { store_name: 'Пловдив', email: 'manager.plovdiv@temax.bg', role: 'manager', active: true },
  { store_name: 'Централен офис', email: 'reg@temax.bg', display_name: 'Регионален', role: 'manager', active: true,
    is_regional: true, assigned_stores: ['Сливен', 'Раднево'], notify_groups: ['regional'] },
  { store_name: 'Централен офис', email: 'ctrl@temax.bg', display_name: 'Контролинг', role: 'admin', active: true,
    is_regional: false, assigned_stores: [], notify_groups: ['controlling'] }
];

function r(store, key, week, f) {
  return Object.assign({ year: YEAR, week_number: week, store_name: store, metric_key: key,
    portal_value: null, control_value: null, control_num: null, comment: null }, f || {});
}
const minus = function (store, week, f) { return r(store, 'spravka_minusi', week, f); };
const storna = function (store, week, f) { return r(store, 'storna_priem', week, f); };

/* Седмица 48 (изпращаната). Ревизията — „да" навсякъде, за да няма „Изисква
   становище" за 48 и блокът за 47 да е единственото място със „становище". */
function curRows() {
  return [
    r('Сливен', 'revizia_953', 48, { portal_value: 'da' }), r('Раднево', 'revizia_953', 48, { portal_value: 'da' }),
    r('Добрич', 'revizia_953', 48, { portal_value: 'da' }), r('Пловдив', 'revizia_953', 48, { portal_value: 'da' }),
    minus('Сливен', 48, { portal_value: '3/5' }),
    minus('Раднево', 48, { portal_value: '4/5' }),
    minus('Добрич', 48, { portal_value: '1/5' }),
    minus('Пловдив', 48, { portal_value: '2/5' }),
    storna('Сливен', 48, { portal_value: '2/5' }),
    storna('Раднево', 48, { portal_value: '1/1' }),
    storna('Добрич', 48, { portal_value: '1/2' })
  ];
}
/* Историята 47..40 (8 седмици преди 48). */
function histRows() {
  const out = [
    /* Сливен минуси: 47, 46 пропуск, 45 5/5 → поредица 3. */
    minus('Сливен', 47, { portal_value: '2/5' }), minus('Сливен', 46, { portal_value: '4/5' }), minus('Сливен', 45, { portal_value: '5/5' }),
    /* Раднево минуси: 47 пропуск, 46 портал 2/5 но контролинг „да" → 2. */
    minus('Раднево', 47, { portal_value: '0/5' }), minus('Раднево', 46, { portal_value: '2/5', control_value: 'da' }),
    minus('Раднево', 45, { portal_value: '1/5' }),
    /* Добрич минуси: 47 липсва, 46 пропуск → 1. */
    minus('Добрич', 46, { portal_value: '2/5' }),
    /* Сторна: Сливен 47 1/3 → 2; Раднево 47 0/0 → 1 (и 48 1/1 е пропуск);
       Добрич 47 3/4, 46 control_num 2 → 3. */
    storna('Сливен', 47, { portal_value: '1/3' }), storna('Сливен', 46, { portal_value: '0/2' }),
    storna('Раднево', 47, { portal_value: '0/0' }),
    storna('Добрич', 47, { portal_value: '3/4' }), storna('Добрич', 46, { portal_value: '0/4', control_num: 2 }),
    /* Седмица 47 — ревизия за блока „Становища". */
    r('Сливен', 'revizia_953', 47, { portal_value: 'ne' }),
    r('Раднево', 'revizia_953', 47, { control_value: 'ne' }),
    r('Добрич', 'revizia_953', 47, { portal_value: 'ne' }),
    r('Пловдив', 'revizia_953', 47, { portal_value: 'da' })
  ];
  /* Пловдив минуси: пропуск в 47..40 (+48) → 9 подред → 8+. */
  for (let w = 40; w <= 47; w++) out.push(minus('Пловдив', w, { portal_value: '3/5' }));
  return out;
}
/* Становищата за 47: срокът е петък 27.11 18:00 по София (= 16:00 UTC). */
const RESP47 = [
  { year: YEAR, week_number: 47, store_name: 'Сливен', metric_key: 'revizia_953', text: 'Счупен скенер, оправен',
    created_at: '2026-11-25T08:00:00Z', updated_at: '2026-11-27T10:00:00Z' },
  { year: YEAR, week_number: 47, store_name: 'Раднево', metric_key: 'revizia_953', text: 'Болничен на управителя',
    created_at: '2026-11-27T17:30:00Z', updated_at: '2026-11-27T17:30:00Z' }
];

function bootIt(opts) {
  opts = opts || {};
  const CUR = curRows(), HIST = histRows();
  const b = {
    modules: ['bulletin.js', 'checklist.js', 'report.js'],
    user: ADMIN,
    data: {
      users: USERS, weekly_checklist_metrics: METRICS,
      weekly_checklist: function (url) { return url.indexOf('or=') >= 0 ? HIST : CUR; },
      weekly_checklist_sends: function (url) {
        return (url.indexOf('week_number=eq.47') >= 0 && opts.sent47 !== false) ? [{ version: 1 }] : [];
      },
      weekly_checklist_responses: function (url) { return url.indexOf('week_number=eq.47') >= 0 ? RESP47 : []; },
      weekly_checklist_freezes: [{ year: YEAR, week_number: WEEK }],
      recurring_tasks: [{ id: MIN_ID, due_weekdays: [0, 1, 2, 3, 4], active: true, task_type: 'check' }],
      recurring_task_versions: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: [], differences_reports: [], stock_differences: []
    }
  };
  if (opts.fail) b.fail = opts.fail;
  return boot(b);
}

function txt(h, html) {
  const d = new h.w.DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  return d.body.textContent;
}
/* Редът от блока „Пропуски" за обект + колона (div-ът с <b>колона</b>). */
function gapLine(html, store, label) {
  const a = html.indexOf('Пропуски на ' + store + ' за седмица');
  if (a < 0) return null;
  const end = html.indexOf('<table', a);
  const parts = html.slice(a, end > 0 ? end : undefined).split('<div style="');
  const hit = parts.filter(function (p) { return p.indexOf('"><b>' + label + '</b>:') >= 0; })[0];
  if (!hit) return null;
  const q = hit.indexOf('"><b>');
  return { style: hit.slice(0, q), text: hit.slice(q + 5 + label.length + 5).split('</div>').join('') };
}
const BLOCK = 'Чек лист — становища за седмица 47';
function respBlock(h, html) {
  const a = html.indexOf(BLOCK);
  if (a < 0) return '';
  const e = html.indexOf('</table>', a);
  return txt(h, html.slice(a, e));
}
async function openAndSend(h, mails) {
  h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
  h.w.loadChecklist(); for (let i = 0; i < 4; i++) await ticks();
  h.w.sendEmail = function (to, subject, html) { mails.push({ to: to[0], html: html }); return Promise.resolve({ ok: true }); };
  h.doc.getElementById('cl-send-btn').click(); await ticks(); await ticks();
  h.doc.getElementById('cl-send-go').click();
  for (let i = 0; i < 14; i++) await ticks();
}
function mailTo(mails, email) { return mails.filter(function (m) { return m.to === email; })[0]; }
const HOT = 'background:#dc2626';

(async function () {
  const h = bootIt();
  const mails = [];
  await openAndSend(h, mails);
  const sl = mailTo(mails, 'manager.sliven@temax.bg'), rd = mailTo(mails, 'manager.radnevo@temax.bg');
  const db = mailTo(mails, 'manager.dobrich@temax.bg'), pv = mailTo(mails, 'manager.plovdiv@temax.bg');
  const reg = mailTo(mails, 'reg@temax.bg'), gen = mailTo(mails, 'ctrl@temax.bg');
  ok('шест писма — 4 обекта, регионален, контролинг', mails.length === 6 && sl && rd && db && pv && reg && gen, String(mails.length));

  section('1. Поредица в брой (справка минуси) — писмото на обекта');
  {
    const s = gapLine(sl.html, 'Сливен', 'справка минуси');
    ok('Сливен 3 подред → „· 3-та поредна седмица"', s && s.text.indexOf('· 3-та поредна седмица') >= 0, s && s.text);
    ok('… тъмночервен ред (CHECKLIST_EMAIL_HOT)', s && s.style.indexOf(HOT) >= 0 && s.style.indexOf('color:#fff') >= 0, s && s.style);
    const r2 = gapLine(rd.html, 'Раднево', 'справка минуси');
    ok('Раднево: ръчно „да" в 46 прекъсва → „· 2-ра поредна седмица"', r2 && r2.text.indexOf('· 2-ра поредна седмица') >= 0, r2 && r2.text);
    ok('… 2-ра седмица НЕ е тъмночервена', r2 && r2.style.indexOf(HOT) < 0, r2 && r2.style);
    const d1 = gapLine(db.html, 'Добрич', 'справка минуси');
    ok('Добрич: липсваща 47 прекъсва → 1-ва, без надпис', d1 && d1.text.indexOf('поредн') < 0 && d1.style.indexOf(HOT) < 0, d1 && d1.text);
    const p8 = gapLine(pv.html, 'Пловдив', 'справка минуси');
    ok('Пловдив 9 подред → „· 8+ поредни седмици"', p8 && p8.text.indexOf('· 8+ поредни седмици') >= 0, p8 && p8.text);
  }

  section('2. Поредица в сторната (първото число > 0)');
  {
    const s = gapLine(sl.html, 'Сливен', 'Сторна по грешни приеми');
    ok('Сливен 2/5, 1/3, 0/2 → „· 2-ра поредна седмица"', s && s.text.indexOf('· 2-ра поредна седмица') >= 0, s && s.text);
    const r1 = gapLine(rd.html, 'Раднево', 'Сторна по грешни приеми');
    ok('Раднево 1/1, после 0/0 → 1-ва, без надпис', r1 && r1.text.indexOf('поредн') < 0, r1 && r1.text);
    const d3 = gapLine(db.html, 'Добрич', 'Сторна по грешни приеми');
    ok('Добрич 1/2, 3/4, control_num 2 → „· 3-та" и тъмночервен', d3 && d3.text.indexOf('· 3-та поредна седмица') >= 0 && d3.style.indexOf(HOT) >= 0, d3 && d3.text);
  }

  section('3. Регионалният и общата група — същите надписи');
  {
    const a = gapLine(reg.html, 'Сливен', 'справка минуси'), b = gapLine(reg.html, 'Раднево', 'справка минуси');
    ok('регионален: Сливен „3-та" (тъмночервен), Раднево „2-ра"',
       a && a.text.indexOf('3-та поредна') >= 0 && a.style.indexOf(HOT) >= 0 && b && b.text.indexOf('2-ра поредна') >= 0, (a && a.text) + ' | ' + (b && b.text));
    const p = gapLine(gen.html, 'Пловдив', 'справка минуси'), d = gapLine(gen.html, 'Добрич', 'Сторна по грешни приеми');
    ok('обща група: Пловдив „8+", Добрич сторна „3-та"',
       p && p.text.indexOf('8+ поредни') >= 0 && d && d.text.indexOf('3-та поредна') >= 0, (p && p.text) + ' | ' + (d && d.text));
  }

  section('4. Блок „Становища за седмица 47"');
  {
    ok('писмата на обектите — БЕЗ блока', [sl, rd, db, pv].every(function (m) { return m.html.indexOf(BLOCK) < 0; }));
    const g = respBlock(h, gen.html), rg = respBlock(h, reg.html);
    ok('обща група: блокът е там', g.length > 0, g);
    ok('текст на становището (Сливен)', g.indexOf('Счупен скенер, оправен') >= 0, g);
    ok('Сливен в срок → без „след срока" на неговия ред',
       /Счупен скенер, оправен(?!\s*след срока)/.test(g), g);
    ok('Раднево 19:30 в петък → „след срока"', /Болничен на управителя\s*след срока/.test(g), g);
    ok('Добрич без становище → „няма становище"', /Добрич[\s\S]*няма становище/.test(g), g);
    ok('Пловдив („да" в 47) не е в блока', g.indexOf('Пловдив') < 0, g);
    ok('регионален: Сливен и Раднево', rg.indexOf('Сливен') >= 0 && rg.indexOf('Раднево') >= 0, rg);
    ok('регионален: БЕЗ Добрич', rg.indexOf('Добрич') < 0, rg);
    ok('нула class= и <style> в писмата', mails.every(function (m) { return !/\sclass=/.test(m.html) && !/<style/i.test(m.html); }));
  }

  section('5. Седмица 47 не е изпратена → сив ред');
  {
    const h2 = bootIt({ sent47: false });
    const m2 = [];
    await openAndSend(h2, m2);
    const g2 = mailTo(m2, 'ctrl@temax.bg');
    const t = g2 ? respBlock(h2, g2.html) : '';
    ok('„Седмица 47 не е изпратена до обектите"', t.indexOf('Седмица 47 не е изпратена до обектите') >= 0, t);
    ok('… без „няма становище" за отделни обекти', t.indexOf('няма становище') < 0, t);
  }

  section('6. Провалена заявка за становищата → без блока, писмото тръгва');
  {
    const h3 = bootIt({ fail: { GET: /weekly_checklist_responses\?year=eq\.2026&week_number=eq\.47/ } });
    const m3 = [];
    await openAndSend(h3, m3);
    const g3 = mailTo(m3, 'ctrl@temax.bg');
    ok('писмата тръгнаха (6)', m3.length === 6, String(m3.length));
    ok('без блока становища', g3 && g3.html.indexOf(BLOCK) < 0);
    ok('поредиците в брой остават', g3 && (gapLine(g3.html, 'Сливен', 'справка минуси') || {}).text.indexOf('3-та поредна') >= 0);
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
