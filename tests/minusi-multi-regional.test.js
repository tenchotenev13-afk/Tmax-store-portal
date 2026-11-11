/* Минуси — писмото „повтарящи се артикули" (minus_multi): регионалните са
   получатели сами (06.11.2026, сесия minusi-multi-regional, решение на Тенчо:
   включването на обект в Минуси е само app_settings.minus_stores).

   Правилото (report.js и send-scheduled-report v66, еднакво — report-edge-sync):
   получатели = ръчният списък (report_recipients, active, minus_multi) както
   досега + всеки users.is_regional, активен, с имейл, чийто
   assigned_stores ∩ minus_stores не е празно (обхват = сечението). Същият
   имейл → един получател: ръчен без обхват остава без обхват; с обхват —
   обединение, в реда на minus_stores. Правилото за пращане при обхват
   (reportMinusMultiShouldSend) — непроменено.

   Мутационна проверка (06.11.2026) — всеки вариант пуснат и паднал:
     R1 reportMinusMultiPlan без цикъла за регионалните       → пада
     R2 обхват = целият assigned_stores (без ∩ minus_stores)   → пада
     R3 дубликат по имейл — без обединяване на обхвата        → пада
     R4 без проверката за active                              → пада
     R5 едж функцията не подава users на плана                → пада
     R6 Админ брои по стария reportMinusMultiRecipients       → пада
   Пускане:  node tests/minusi-multi-regional.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const MINUS = ['Гоце Делчев', 'Монтана', 'Шумен', 'Троян', 'Петрич', 'Пирдоп', 'Добрич', 'Търговище', 'Габрово'];

/* Ръчният списък — както е на живо на 06.11.2026. */
const RC = [
  { id: 'r1', email: 'm.pavlova@temax.bg', name: 'Миглена Павлова', active: true, minus_multi: true, scope_stores: null },
  { id: 'r2', email: 'n.koleva@temax.bg', name: 'Надя Колева', active: true, minus_multi: true, scope_stores: ['Гоце Делчев', 'Дупница', 'Петрич'] },
  { id: 'r3', email: 's.stefanova@temax.bg', name: 'Станислава Стефанова', active: true, minus_multi: true, scope_stores: ['Враца', 'Козлодуй', 'Монтана', 'Троян'] },
  { id: 'r4', email: 't.tenev@temax.bg', name: 'Теодор Тенев', active: true, minus_multi: true, scope_stores: null }
];
/* Регионалните — като на живо, плюс граничните случаи. */
const USERS = [
  { email: 'v.filev@temax.bg', display_name: 'В. Филев', is_regional: true, active: true,
    assigned_stores: ['Добрич', 'Логистичен склад Добрич', 'Логистичен склад Търговище', 'Силистра', 'Сливен', 'Търговище', 'Шумен'] },
  { email: 'N.Koleva@temax.bg ', display_name: 'Н. Колева', is_regional: true, active: true, assigned_stores: ['Гоце Делчев', 'Дупница', 'Петрич', 'Шумен'] },
  { email: 'p.georgieva@temax.bg', display_name: 'П. Георгиева', is_regional: true, active: true, assigned_stores: ['Карлово', 'Пирдоп'] },
  { email: 's.stefanova@temax.bg', display_name: 'С. Стефанова', is_regional: true, active: true, assigned_stores: ['Враца', 'Козлодуй', 'Монтана', 'Троян'] },
  { email: 't.ivanova@temax.bg', display_name: 'Т. Иванова', is_regional: true, active: true, assigned_stores: ['Добрич', 'Силистра', 'Търговище', 'Шумен'] },
  { email: 't.taleva@temax.bg', display_name: 'Т. Талева', is_regional: true, active: true, assigned_stores: ['Габрово', 'Севлиево'] },
  /* Гранични: */
  { email: 'no.minus@temax.bg', display_name: 'Без обект в Минуси', is_regional: true, active: true, assigned_stores: ['Карлово', 'Севлиево'] },
  { email: 'off@temax.bg', display_name: 'Неактивен', is_regional: true, active: false, assigned_stores: ['Шумен'] },
  { email: '', display_name: 'Без имейл', is_regional: true, active: true, assigned_stores: ['Шумен'] },
  { email: '   ', display_name: 'Празен имейл', is_regional: true, active: true, assigned_stores: ['Шумен'] },
  { email: 'notreg@temax.bg', display_name: 'Не е регионален', is_regional: false, active: true, assigned_stores: ['Шумен'] },
  { email: 't.tenev@temax.bg', display_name: 'Т. Тенев', is_regional: true, active: true, assigned_stores: ['Шумен'] },
  { email: 'no.list@temax.bg', display_name: 'Без списък', is_regional: true, active: true, assigned_stores: null }
];
const ADMIN = { id: 'u-1', email: 'ten.tenev@temax.bg', display_name: 'Тен', role: 'admin', store_name: 'Централен офис' };
const lc = e => String(e).trim().toLowerCase();
const clone = x => JSON.parse(JSON.stringify(x));

/* Еднакви проверки за двата източника — report.js и истинския .ts. */
function checkPlan(label, plan, planFn) {
  const by = e => plan.filter(p => lc(p.email) === e);
  const one = e => by(e)[0];
  const st = e => (one(e) ? one(e).stores.join(',') : '∅');

  ok(label + ': ръчните — първи, в същия ред', plan.slice(0, 4).map(p => lc(p.email)).join(',') ===
    'm.pavlova@temax.bg,n.koleva@temax.bg,s.stefanova@temax.bg,t.tenev@temax.bg', plan.map(p => p.email).join(','));
  ok(label + ': Миглена — без обхват, всички 9, не е регионален', one('m.pavlova@temax.bg') && one('m.pavlova@temax.bg').scoped === false &&
    st('m.pavlova@temax.bg') === MINUS.join(',') && one('m.pavlova@temax.bg').regional === false);
  ok(label + ': Филев — нов, Шумен+Добрич+Търговище (без складовете, Силистра, Сливен)',
    st('v.filev@temax.bg') === 'Шумен,Добрич,Търговище' && one('v.filev@temax.bg').scoped === true && one('v.filev@temax.bg').regional === true, st('v.filev@temax.bg'));
  ok(label + ': Иванова — Шумен+Добрич+Търговище', st('t.ivanova@temax.bg') === 'Шумен,Добрич,Търговище', st('t.ivanova@temax.bg'));
  ok(label + ': Георгиева — само Пирдоп', st('p.georgieva@temax.bg') === 'Пирдоп', st('p.georgieva@temax.bg'));
  ok(label + ': Талева — само Габрово', st('t.taleva@temax.bg') === 'Габрово', st('t.taleva@temax.bg'));
  ok(label + ': името — от display_name', one('t.taleva@temax.bg') && one('t.taleva@temax.bg').name === 'Т. Талева');
  ok(label + ': Колева — ЕДИН получател (имейл с главни/интервал), обединен обхват ГД+Шумен+Петрич',
    by('n.koleva@temax.bg').length === 1 && st('n.koleva@temax.bg') === 'Гоце Делчев,Шумен,Петрич' && one('n.koleva@temax.bg').regional === true &&
    one('n.koleva@temax.bg').name === 'Надя Колева', JSON.stringify(by('n.koleva@temax.bg')));
  ok(label + ': Стефанова — един получател, Монтана+Троян', by('s.stefanova@temax.bg').length === 1 && st('s.stefanova@temax.bg') === 'Монтана,Троян');
  ok(label + ': Теодор — ръчен без обхват остава без обхват (регионалният с Шумен не го стеснява)',
    by('t.tenev@temax.bg').length === 1 && one('t.tenev@temax.bg').scoped === false && st('t.tenev@temax.bg') === MINUS.join(','));
  ok(label + ': без обект в Минуси → няма го', by('no.minus@temax.bg').length === 0);
  ok(label + ': неактивен → няма го', by('off@temax.bg').length === 0);
  ok(label + ': без имейл / празен имейл → няма ги', !plan.some(p => !String(p.email).trim()));
  ok(label + ': не е регионален → няма го', by('notreg@temax.bg').length === 0);
  ok(label + ': assigned_stores null → няма го, без грешка', by('no.list@temax.bg').length === 0);
  ok(label + ': общо 8 получателя', plan.length === 8, plan.length);

  const manualOnly = planFn(clone(RC), MINUS);
  ok(label + ': без users — ръчният списък непроменен (4, обхватът както досега)',
    manualOnly.length === 4 && manualOnly.every(p => p.regional === false) &&
    manualOnly.map(p => p.stores.join('+')).join('|') === [MINUS.join('+'), 'Гоце Делчев+Петрич', 'Монтана+Троян', MINUS.join('+')].join('|'),
    JSON.stringify(manualOnly));
  const empty = planFn(clone(RC), [], clone(USERS));
  ok(label + ': празен minus_stores → нито един регионален', empty.every(p => p.regional === false) && empty.length === 4);
  ok(label + ': входът не е пипнат', JSON.stringify(USERS[0].assigned_stores) === JSON.stringify(['Добрич', 'Логистичен склад Добрич', 'Логистичен склад Търговище', 'Силистра', 'Сливен', 'Търговище', 'Шумен']));
}

(async function () {
  section('1. report.js — reportMinusMultiPlan с регионалните');
  {
    const h = boot({ modules: ['minusi.js', 'report.js'], user: ADMIN, data: {} });
    const w = h.w;
    checkPlan('report.js', w.reportMinusMultiPlan(clone(RC), MINUS, clone(USERS)), w.reportMinusMultiPlan);

    /* Правилото за пращане при обхват — непроменено; регионалният с празна седмица не получава. */
    let seq = 0;
    const mv = (store, mat, date) => ({ id: 'm' + (++seq), store_name: store, material: mat, material_desc: 'О ' + mat, mvt_type: '955',
      posting_date: date, mat_doc: 'D' + seq, doc_item: '1', action: null });
    const rows = [mv('Шумен', '1', '2026-11-05'), mv('Шумен', '1', '2026-11-06'), mv('Шумен', '1', '2026-11-07')];
    const data = Object.assign(w.reportMinusMultiGroup(clone(rows), MINUS, 3, 30, '2026-11-08'),
      { week: w.reportMinusMultiWeek(clone(rows), MINUS, '2026-11-08') });
    const plan = w.reportMinusMultiPlan(clone(RC), data.allStores, clone(USERS));
    const send = e => { const p = plan.filter(x => lc(x.email) === e)[0]; return w.reportMinusMultiShouldSend(p, w.reportMinusMultiForStores(data, p.stores, p.scoped)); };
    ok('Иванова (Шумен с повтарящ се) → праща', send('t.ivanova@temax.bg') === true);
    ok('Талева (Габрово, 0 минуса) → не праща', send('t.taleva@temax.bg') === false);
    ok('Георгиева (Пирдоп, 0 минуса) → не праща', send('p.georgieva@temax.bg') === false);
    ok('Миглена (без обхват) → праща', send('m.pavlova@temax.bg') === true);
    const fi = plan.filter(x => x.email === 'v.filev@temax.bg')[0];
    const html = w.reportMinusMultiHtml(w.reportMinusMultiForStores(data, fi.stores, fi.scoped));
    ok('писмото на Филев — само неговите обекти, без „Общи проблеми"', html.indexOf('Шумен (1)') >= 0 && html.indexOf('Общи проблеми') < 0);
    h.close();
  }

  section('2. Истинският .ts — същата функция и обработчикът');
  {
    const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
    const grab = name => {
      const i = src.indexOf('\nfunction ' + name + '(');
      if (i < 0) return '';
      const j = src.indexOf('\n}\n', i);
      return src.slice(i, j + 3);
    };
    const code = grab('reportMinusMultiScopeOf') + grab('reportMinusMultiPlan');
    ok('reportMinusMultiPlan и ScopeOf са извадени от .ts', code.indexOf('function reportMinusMultiPlan(rows, minusStores, userRows)') >= 0);
    const ctx = {};
    vm.createContext(ctx);
    let ran = true;
    try { vm.runInContext(code, ctx); } catch (e) { ran = false; console.log(e.message); }
    ok('.ts частта се изпълнява като JS', ran && typeof ctx.reportMinusMultiPlan === 'function');
    if (ran) checkPlan('.ts', JSON.parse(JSON.stringify(ctx.reportMinusMultiPlan(clone(RC), MINUS, clone(USERS)))),
      (a, b, c) => JSON.parse(JSON.stringify(ctx.reportMinusMultiPlan(a, b, c))));

    const m = src.match(/if \(type === 'minus_multi'\) \{[\s\S]*?\n    \}\n/);
    const br = m ? m[0] : '';
    ok('клонът minus_multi е намерен', !!br);
    ok('регионалните се четат с изричен select= (без хеш)',
      /sbGet\('users', 'is_regional=eq\.true&select=email,display_name,assigned_stores,active,is_regional'\)/.test(br) && !/hash|select=\*/.test(br));
    ok('и се подават на плана: reportMinusMultiPlan(mmRecRes, mmData.allStores || [], mmRegRes)',
      /reportMinusMultiPlan\(mmRecRes, mmData\.allStores \|\| \[\], mmRegRes\)/.test(br));
    ok('ръчният списък — същата заявка като досега', /sbGet\('report_recipients', 'active=eq\.true&minus_multi=eq\.true&select=email,name,active,minus_multi,scope_stores'\)/.test(br));
    ok('dry_run носи regional и regional_read', /regional:!!j\.plan\.regional/.test(br) && /regional_read:Array\.isArray\(mmRegRes\)/.test(br));
    /* От 11.11.2026 най-отгоре е v67 — v66 е в същия хедър, по-долу. */
    ok('v66 бележка в хедъра на файла', /^\/\*[\s\S]{0,3000}v66 \(06\.11\.2026\)/.test(src) && src.indexOf('v66 (06.11.2026)') < src.indexOf('*/'));
  }

  section('3. Администрация → Известия → Общи отчети');
  {
    const data = {
      report_recipients: clone(RC), notification_topics: [], notification_matrix: [], notification_overrides: [],
      notification_schedules: [], stores: [],
      users: url => url.indexOf('is_regional') >= 0 ? clone(USERS).filter(u => u.is_regional) : [],
      app_settings: url => url.indexOf('minus_stores') >= 0 ? [{ key: 'minus_stores', value: ' ' + MINUS.join(' , ') + ' ' }] : []
    };
    const h = boot({ modules: ['bulletin.js', 'email.js', 'admin.js', 'report.js'], user: ADMIN, data: data, confirm: false });
    const w = h.w;
    w.loadNotificationsAdmin();
    await new Promise(r => setTimeout(r, 150)); for (let i = 0; i < 4; i++) await ticks();
    const row = h.doc.getElementById('report-row-minus_multi');
    const cnt = row ? row.querySelector('.report-count').textContent : '';
    ok('броят на „Минуси — повтарящи се" е 8 (ръчни 4 + нови регионални 4)', cnt === '8', cnt);
    const box = h.doc.getElementById('report-minus-auto');
    ok('блокът „🔁 Минуси — автоматични получатели" е нарисуван', !!box && box.textContent.indexOf('🔁 Минуси — автоматични получатели') >= 0);
    const items = box ? Array.prototype.map.call(box.querySelectorAll('.report-minus-auto'), x => x.getAttribute('data-email')) : [];
    ok('в него — регионалните от плана (вкл. Колева, Стефанова и Теодор)',
      items.join(',') === 'n.koleva@temax.bg,s.stefanova@temax.bg,t.tenev@temax.bg,v.filev@temax.bg,p.georgieva@temax.bg,t.ivanova@temax.bg,t.taleva@temax.bg', items.join(','));
    const fil = box && box.querySelector('.report-minus-auto[data-email="v.filev@temax.bg"]');
    ok('Филев: обекти Шумен, Добрич, Търговище', !!fil && fil.textContent.indexOf('обекти: Шумен, Добрич, Търговище') >= 0, fil && fil.textContent);
    const ten = box && box.querySelector('.report-minus-auto[data-email="t.tenev@temax.bg"]');
    ok('Теодор (ръчен без обхват): „обекти: всички"', !!ten && ten.textContent.indexOf('обекти: всички') >= 0);
    ok('всеки ред носи бележката „регионален — по обектите в профила"',
      items.length === 7 && box.querySelectorAll('.report-minus-auto-note').length === 7 &&
      Array.prototype.every.call(box.querySelectorAll('.report-minus-auto-note'), n => n.textContent === 'регионален — по обектите в профила'));
    ok('само за четене — без бутони и полета в блока', box && box.querySelectorAll('button,input,select').length === 0);
    ok('ръчният списък отдолу — непроменен (4 реда с иконите)', h.doc.querySelectorAll('.report-recipient').length === 4);
    ok('бележката под таблицата казва и за регионалните', h.doc.getElementById('notif-reports-body').textContent.indexOf('отметнатите 🔁 + регионалните') >= 0);
    const g = h.calls.get.filter(u => u.indexOf('app_settings') >= 0 && u.indexOf('minus_stores') >= 0);
    ok('minus_stores се чете от app_settings', g.length > 0, h.calls.get.join('\n'));
    ok('users — само с изричен select=', h.calls.get.filter(u => u.indexOf('/users') >= 0).every(u => u.indexOf('select=') >= 0 && u.indexOf('select=*') < 0 && u.indexOf('hash') < 0));
    /* „📤 Изпрати сега" — истински клик; confirm отказва (по подразбиране в harness-а). */
    const sendBtn = row && Array.prototype.find.call(row.querySelectorAll('button'), b => b.textContent.trim() === '📤 Изпрати сега');
    if (ok('„📤 Изпрати сега" на реда за Минуси', !!sendBtn)) {
      realClick(h.w, sendBtn, 'Минуси: Изпрати сега');
      await new Promise(r => setTimeout(r, 50));
      ok('confirm казва „най-много 8" и че без минуси се пропуска',
        h.calls.confirm[0] === 'Ще се изпрати до най-много 8 получатели (без минуси в обектите — пропуска се) — сигурен ли си?', JSON.stringify(h.calls.confirm));
      ok('отказ → нито една заявка към едж функцията', !h.calls.post.some(p => /send-scheduled-report/.test(p.url)));
    }
    h.close();

    const h2 = boot({ modules: ['bulletin.js', 'email.js', 'admin.js', 'report.js'], user: ADMIN,
      data: Object.assign({}, data, { app_settings: [] }) });
    h2.w.loadNotificationsAdmin();
    await new Promise(r => setTimeout(r, 150)); for (let i = 0; i < 4; i++) await ticks();
    const c2 = h2.doc.getElementById('report-row-minus_multi');
    ok('без minus_stores: броят е 4 (само ръчните)', c2 && c2.querySelector('.report-count').textContent === '4', c2 && c2.querySelector('.report-count').textContent);
    const b2 = h2.doc.getElementById('report-minus-auto');
    ok('… и блокът казва „Няма регионален с обект в Минуси."', !!b2 && b2.textContent.indexOf('Няма регионален с обект в Минуси.') >= 0);
    h2.close();
  }

  report();
})();
