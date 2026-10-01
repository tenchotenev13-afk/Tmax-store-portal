/* Еднократна задача с ПРОЗОРЕЦ — как се ПОКАЗВА (т.3 от 01.10.2026).
   Помощниците и формата са в task-window.test.js; тук е другото: календар,
   „План за деня", блок по отдел, панел на обекта и печат.

   ТВЪРДЕНИЯТА, които тестът пази:
   · задачата е ЕДНА единица работа — показва се всеки ден от прозореца, но с
     един чекбокс и без брояч „X/4 дни отметнати";
   · отметка на КОЙ ДА Е ден я затваря: на останалите дни чекбоксът е отметнат
     и заключен, с датата на реалното изпълнение (не се крие — правило 11);
   · в „План за деня" остава до отмятането, после само в деня на ИЗПЪЛНЕНИЕТО;
   · офисът вижда ЕДНО И СЪЩО число във всеки ден от прозореца, не по едно на
     ден;
   · обикновената многодневна задача (без прозорец) НЕ се променя — четирите
     отметки си остават четири. Това е контролата: ако прозорецът „поправи" и
     нея, миналото се пренаписва (решение Б на Тенчо — миналото не се пипа).

   Пускане: node tests/task-window-view.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, ticks } = H;

/* ── котва: сряда 12:00 от текущата реална седмица ───────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const shifted = n => { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + n); return d; };
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const D = n => isoOf(shifted(-2 + n));          /* D(0)=пон … D(6)=нед; D(2)=днес */
const MON = D(0), TUE = D(1), WED = D(2), THU = D(3);
/* Три формата на дата живеят в портала и тестът ги пази РАЗДЕЛНО, вместо да
   приеме, че са един:
   · dlab()  — както пише taskDueLabel() на ЕКРАНА (locale bg-BG: ден без
     водеща нула, месец с нея);
   · dm()    — както пише bulDM() в ПЕЧАТА (и двете части с водеща нула);
   · fdate() — както пише fmtDate() в title на заключения чекбокс.
   Самото форматиране е на платформата/низа, не логика на фийчъра: твърдението
   тук е КОЯ дата и в каква КОМПОЗИЦИЯ, не как се изписва числото. */
const dlab = iso => new Date(iso + 'T00:00:00').toLocaleDateString('bg-BG', { day: 'numeric', month: 'numeric' });
const dm = iso => { const q = iso.split('-'); return q[2] + '.' + q[1]; };
const fdate = iso => { const q = iso.split('-'); return q[2] + '.' + q[1] + '.' + q[0]; };

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 't@temax.bg', display_name: 'Троян', role: 'store', store_name: 'Троян' };
const STORES = ['Троян', 'Ловеч'];

/* Прозоречната: четири дни, точно като С39 „Излагане палето зони". */
const WIN_DATES = [MON, TUE, WED, THU];
/* Контролата: три дни БЕЗ прозорец — трите отметки остават три. */
const MULTI_DATES = [MON, TUE, WED];

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-1', week_number: 0, year: 2026, department: 'trade',
    title: 'Задача ' + id, description: null, due_date: MON, due_dates: [MON],
    due_window: false, spans_from: null, starts_on: null, target_stores: null,
    task_type: 'info', report_groups: ['controlling'], linked_module: null,
    auto_complete: false, attachments: null, sort_order: 1,
    created_by: 'Админ', created_at: MON
  }, over || {});
}
const WIN = () => task('t-win', { title: 'Излагане палето зони', due_dates: WIN_DATES, due_window: true, sort_order: 1 });
const MULTI = () => task('t-mul', { title: 'Многодневна контрола', due_dates: MULTI_DATES, due_window: false, sort_order: 2 });
function comp(id, store, date, over) {
  return Object.assign({
    id: id, task_id: 't-win', recurring_task_id: null, store_name: store,
    completion_date: date, status: 'done', completed_by: 'Иван Петров',
    completed_at: date + 'T09:30:00', comment: null, photos: null, postponed_to: null
  }, over || {});
}

function bulRow(w, id) {
  const cal = {};
  w.DKEYS.forEach(x => { cal[x] = []; });
  return { id: id, week_number: w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
           created_at: MON, content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}
function env(tasks, comps, user) {
  const posted = [];
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: user || STORE,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      recurring_task_versions: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: url => {
        if (url.indexOf('spans_from=not.is.null') >= 0) return [];
        const m = /[?&]bulletin_id=eq\.([^&]+)/.exec(url);
        return m ? tasks.filter(t => t.bulletin_id === m[1]) : tasks;
      },
      task_completions: () => comps,
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: []
    }
  });
  h.buls = [bulRow(h.w, 'b-1')];
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  h.posted = posted;
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    if (m === 'POST' && url.indexOf('/task_completions') >= 0) {
      const body = JSON.parse(init.body);
      posted.push(body);
      comps.push(Object.assign({ id: 'c-new' + posted.length }, body));
    }
    return orig.call(this, url, init);
  };
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function view(tasks, comps, user) {
  const h = env(tasks, comps, user);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle(() => !!h.doc.getElementById('sec-calendar'));
  return h;
}
/* Видимият текст на парче HTML — не източникът. Твърдението е какво ЧЕТЕ
   човекът, а не какви атрибути има. */
function textOf(h, html) {
  const d = h.doc.createElement('div');
  d.innerHTML = String(html);
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}
/* Клетките на календара по ден — за всяка: самата клетка и редът на задачата. */
function calCell(h, dateISO) {
  const cal = h.doc.getElementById('sec-calendar');
  if (!cal) return null;
  const cells = Array.prototype.slice.call(cal.querySelectorAll('div'))
    .filter(el => el.querySelector('input[type=checkbox], span'));
  /* Клетката се познава по чекбокса/броя с нейната дата в data-cdate. */
  const byCdate = Array.prototype.slice.call(cal.querySelectorAll('input[data-cdate="' + dateISO + '"]'));
  return { boxes: byCdate, cal: cal };
}
const winBoxFor = (h, dateISO) =>
  h.doc.querySelector('#sec-calendar input[data-tid="t-win"][data-cdate="' + dateISO + '"]');
const mulBoxFor = (h, dateISO) =>
  h.doc.querySelector('#sec-calendar input[data-tid="t-mul"][data-cdate="' + dateISO + '"]');

(async function () {

  section('1. КАЛЕНДАР, обект, НЕотметната: всеки ден от прозореца, отключен само днешният');
  {
    const h = await view([WIN(), MULTI()], []);
    if (!h) return report();
    const present = WIN_DATES.filter(d => !!winBoxFor(h, d));
    ok('редът е в четирите дни на прозореца', present.length === 4, present.length + ' от 4');
    const todayBox = winBoxFor(h, WED);
    if (ok('днешната клетка има чекбокс', !!todayBox)) {
      ok('и той е ОТКЛЮЧЕН', !todayBox.disabled);
      ok('и не е отметнат', todayBox.checked === false);
    }
    const others = [MON, TUE, THU].map(d => winBoxFor(h, d)).filter(Boolean);
    ok('останалите три дни са заключени', others.length === 3 && others.every(b => b.disabled),
      others.map(b => String(b.disabled)).join(','));
    ok('и нито един от тях не е отметнат', others.every(b => !b.checked));
    /* Прозорецът се ИЗПИСВА — иначе заключеният чекбокс изглежда счупен. */
    const row = todayBox && todayBox.parentElement;
    const rowTxt = row ? (row.textContent || '').replace(/\s+/g, ' ') : '';
    ok('редът казва прозореца „' + dlab(MON) + '–' + dlab(THU) + '"',
      rowTxt.indexOf('(' + dlab(MON) + '–' + dlab(THU) + ')') >= 0, rowTxt);
    ok('и НЕ го изписва като четири отделни дни',
      rowTxt.indexOf(dlab(MON) + ', ' + dlab(TUE)) < 0, rowTxt);
  }

  section('2. КАЛЕНДАР, обект: отметка в ПОНЕДЕЛНИК затваря целия прозорец');
  {
    const h = await view([WIN(), MULTI()], [comp('c-1', 'Троян', MON)]);
    if (!h) return report();
    const boxes = WIN_DATES.map(d => winBoxFor(h, d));
    ok('редът е още в четирите дни (не се крие)', boxes.filter(Boolean).length === 4);
    ok('и във ВСИЧКИТЕ е отметнат', boxes.filter(Boolean).every(b => b.checked),
      boxes.map(b => b && String(b.checked)).join(','));
    ok('и заключен', boxes.filter(Boolean).every(b => b.disabled));
    const t = boxes.filter(Boolean).map(b => b.getAttribute('title') || '');
    ok('title казва КОГА е изпълнена, на всеки ден',
      t.length === 4 && t.every(x => /Изпълнена на /.test(x)), t.join(' | '));
    ok('и датата е на РЕАЛНОТО изпълнение (понеделник), не на срока',
      t.every(x => x.indexOf(fdate(MON)) >= 0 && x.indexOf(fdate(THU)) < 0), t[0]);
  }

  section('3. КАЛЕНДАР, офис: ЕДНО число за целия прозорец, не по едно на ден');
  {
    const h = await view([WIN(), MULTI()], [comp('c-1', 'Троян', MON)], ADMIN);
    if (!h) return report();
    /* Броячът е последният <span> в реда на задачата; вземаме го по текста на
       реда, защото офисът няма чекбокси. */
    const rows = Array.prototype.slice.call(h.doc.querySelectorAll('#sec-calendar div'))
      .filter(el => (el.textContent || '').indexOf('Излагане палето зони') >= 0 &&
                    /\d+\/\d+/.test(el.textContent || '') &&
                    el.querySelectorAll('div').length === 0);
    const nums = rows.map(el => ((el.textContent || '').match(/(\d+)\/(\d+)/) || [])[0]);
    ok('прозоречната задача има ред с брояч във всеки от четирите дни',
      nums.length === 4, nums.length + ': ' + nums.join(','));
    ok('и числото е ЕДНО И СЪЩО — 1/2 навсякъде',
      nums.length === 4 && nums.every(n => n === '1/2'), nums.join(','));
    /* Контролата: многодневната БЕЗ прозорец пази старото поведение — отметка
       в понеделник не брои за вторник. */
    const mrows = Array.prototype.slice.call(h.doc.querySelectorAll('#sec-calendar div'))
      .filter(el => (el.textContent || '').indexOf('Многодневна контрола') >= 0 &&
                    /\d+\/\d+/.test(el.textContent || '') &&
                    el.querySelectorAll('div').length === 0);
    const mnums = mrows.map(el => ((el.textContent || '').match(/(\d+)\/(\d+)/) || [])[0]);
    ok('контролата е в трите си дни', mnums.length === 3, mnums.join(','));
    ok('и числата ѝ СЕ РАЗЛИЧАВАТ по ден (0/2 без отметка)',
      mnums.filter(n => n === '0/2').length === 3, mnums.join(','));
  }

  section('4. ПЛАН ЗА ДЕНЯ: всеки ден до отмятането, после само в деня на изпълнението');
  {
    const h = await view([WIN(), MULTI()], []);
    if (!h) return report();
    const inPlan = (dateISO) => {
      const g = h.w.bulPlanGroups(dateISO, 'Троян');
      return [].concat(g.timed || [], g.untimed || [], g.later || [])
               .some(r => r.t && r.t.id === 't-win');
    };
    const days = WIN_DATES.filter(inPlan);
    ok('неотметната: в плана на четирите дни', days.length === 4, days.length + ' от 4');

    const h2 = await view([WIN(), MULTI()], [comp('c-1', 'Троян', MON)]);
    if (!h2) return report();
    const inPlan2 = (dateISO) => {
      const g = h2.w.bulPlanGroups(dateISO, 'Троян');
      return [].concat(g.timed || [], g.untimed || [], g.later || [])
               .some(r => r.t && r.t.id === 't-win');
    };
    ok('отметната в понеделник: ОСТАВА в плана на понеделник', inPlan2(MON) === true);
    ok('и изчезва от вторник', inPlan2(TUE) === false);
    ok('и от сряда', inPlan2(WED) === false);
    ok('и от четвъртък (денят на срока)', inPlan2(THU) === false);
    /* Редът в понеделник носи отметката на реалния ден, а не на срока. */
    const g = h2.w.bulPlanGroups(MON, 'Троян');
    const row = [].concat(g.timed || [], g.untimed || []).find(r => r.t && r.t.id === 't-win');
    ok('и cdate на реда е понеделник', !!row && row.cdate === MON, row && row.cdate);
    ok('и редът знае, че е затворен прозорец (winComp)', !!(row && row.winComp));
  }

  section('5. БЛОК ПО ОТДЕЛ: един чекбокс и надпис за прозореца, без брояч по дни');
  {
    const h = await view([WIN(), MULTI()], []);
    if (!h) return report();
    const panel = h.doc.getElementById('dept-panel-trade');
    if (!ok('панелът на отдела е рендиран', !!panel)) return report();
    const txt = (panel.textContent || '').replace(/\s+/g, ' ');
    const box = panel.querySelector('input[data-tid="t-win"]');
    ok('прозоречната има ИСТИНСКИ чекбокс (не 📅)', !!box);
    ok('и датата за отмятане е ДНЕС (сряда е в прозореца)',
      !!box && box.getAttribute('data-cdate') === WED, box && box.getAttribute('data-cdate'));
    ok('и е отключен', !!box && !box.disabled);
    ok('надписът казва прозореца и една отметка',
      txt.indexOf('⏳ Прозорец ' + dlab(MON) + '–' + dlab(THU) + ' — една отметка за целия период') >= 0, txt);
    ok('редът „Срок" сочи ПОСЛЕДНИЯ ден, не днешния',
      txt.indexOf('📅 Срок: ' + new Date(THU + 'T00:00:00').toLocaleDateString('bg-BG')) >= 0, txt);
    /* Контролата: многодневната без прозорец пази 📅 и брояча по дни. */
    ok('контролата НЕ получи чекбокс', !panel.querySelector('input[data-tid="t-mul"]'));
    ok('и пази брояча си по дни', /0\/3 дни отметнати/.test(txt), txt);
    ok('а прозоречната НЕ показва брояч „дни отметнати" за себе си',
      (txt.match(/дни отметнати/g) || []).length === 1, String((txt.match(/дни отметнати/g) || []).length));
  }

  section('5б. БЛОК ПО ОТДЕЛ, вече отметната: заключена, с деня на изпълнението');
  {
    const h = await view([WIN(), MULTI()], [comp('c-1', 'Троян', MON)]);
    if (!h) return report();
    const panel = h.doc.getElementById('dept-panel-trade');
    if (!ok('панелът на отдела е рендиран', !!panel)) return report();
    const box = panel.querySelector('input[data-tid="t-win"]');
    if (ok('чекбоксът е там', !!box)) {
      ok('отметнат е', box.checked === true);
      ok('и заключен', box.disabled === true);
      ok('title казва деня на изпълнението',
        (box.getAttribute('title') || '').indexOf('Изпълнена на ' + fdate(MON)) >= 0,
        box.getAttribute('title'));
    }
    const txt = (panel.textContent || '').replace(/\s+/g, ' ');
    ok('надписът добавя кога е изпълнена',
      txt.indexOf('· изпълнена на ' + dm(MON)) >= 0, txt);
  }

  section('5в. ПАНЕЛЪТ НА ОБЕКТА (мобилният изглед) казва същото');
  {
    const h = await view([WIN(), MULTI()], []);
    if (!h) return report();
    const div = h.doc.createElement('div');
    if (!guard('renderTasksPanel() не хвърля', () => { div.innerHTML = h.w.renderTasksPanel(); })) return report();
    const box = div.querySelector('input[data-tid="t-win"]');
    ok('прозоречната има чекбокс и в панела', !!box);
    ok('с ДНЕШНАТА дата за отмятане',
      !!box && box.getAttribute('data-cdate') === WED, box && box.getAttribute('data-cdate'));
    const txt = (div.textContent || '').replace(/\s+/g, ' ');
    ok('и панелът изписва прозореца',
      txt.indexOf('⏳ Прозорец ' + dlab(MON) + '–' + dlab(THU)) >= 0, txt);
    ok('редът „Срок" сочи последния ден',
      txt.indexOf('📅 Срок: ' + new Date(THU + 'T00:00:00').toLocaleDateString('bg-BG')) >= 0, txt);

    /* И отметнатото състояние — панелът е паралелен изглед на същите задачи и
       двата трябва да казват едно и също, иначе обектът вижда две истини. */
    const h2 = await view([WIN(), MULTI()], [comp('c-1', 'Троян', TUE)]);
    if (!h2) return report();
    const div2 = h2.doc.createElement('div');
    if (guard('renderTasksPanel() не хвърля (отметната)', () => { div2.innerHTML = h2.w.renderTasksPanel(); })) {
      const b2 = div2.querySelector('input[data-tid="t-win"]');
      ok('отметната: чекбоксът е отметнат', !!b2 && b2.checked === true);
      ok('и заключен', !!b2 && b2.disabled === true);
      ok('title сочи вторник — реалния ден',
        !!b2 && (b2.getAttribute('title') || '').indexOf('Изпълнена на ' + fdate(TUE)) >= 0,
        b2 && b2.getAttribute('title'));
    }
  }

  section('6. РЕАЛЕН КЛИК в блока по отдел: записва се ДНЕШНИЯТ ден, не срокът');
  {
    const comps = [];
    const h = await view([WIN()], comps);
    if (!h) return report();
    const box = h.doc.querySelector('#dept-panel-trade input[data-tid="t-win"]');
    if (!ok('чекбоксът е там', !!box)) return report();
    box.checked = true;
    fire(h.w, box, 'change');
    await settle(() => h.posted.length > 0, 60);
    const body = h.posted[0] || {};
    ok('изпратен е запис за изпълнение', !!body.task_id, JSON.stringify(body));
    ok('completion_date е ДНЕШНИЯТ ден (сряда)', body.completion_date === WED, String(body.completion_date));
    ok('а НЕ срокът (четвъртък)', body.completion_date !== THU);
    ok('статусът е done', body.status === 'done', String(body.status));
  }

  section('7. ПЕЧАТ: едно квадратче, срок последния ден, „може от" първия');
  {
    const h = await view([WIN(), MULTI()], []);
    if (!h) return report();
    let printed = '';
    h.w.open = () => ({ document: { write(x) { printed += String(x); }, close() {} },
                        focus() {}, print() {}, close() {} });
    if (guard('printSection(trade) не хвърля', () => h.w.printSection('trade'))) {
      const txt = textOf(h, printed);
      ok('прозоречната е на листа', txt.indexOf('Излагане палето зони') >= 0);
      ok('срокът е ПОСЛЕДНИЯТ ден',
        txt.indexOf('📅 Срок: ' + new Date(THU + 'T00:00:00').toLocaleDateString('bg-BG')) >= 0, txt);
      ok('и пише от кога е разрешено',
        txt.indexOf('⏳ може от ' + dm(MON) + ' (една отметка)') >= 0, txt);
      /* 📅 вместо квадратче значи „отмятай в календара" — точно обратното на
         това, което прозорецът обещава. */
      const winRow = (printed.split('Излагане палето зони')[0] || '').slice(-400);
      ok('редът ѝ НЕ носи иконата „отмятай в календара"',
        winRow.indexOf('📅</div>') < 0, winRow.slice(-120));
      ok('контролата пази своята', printed.indexOf('📅</div>') >= 0);
      ok('и своя надпис за дните',
        txt.indexOf('📅 Дни: ' + dlab(MON) + ', ' + dlab(TUE) + ', ' + dlab(WED)) >= 0, txt);
    }

    printed = '';
    if (guard('printSection(cal) не хвърля', () => h.w.printSection('cal'))) {
      const times = printed.split('Излагане палето зони').length - 1;
      ok('в печатния календар е в четирите дни на прозореца', times === 4, String(times));
      const marks = printed.match(/\(срок \d+\.\d+, може от \d+\.\d+\)/g) || [];
      ok('и всяко появяване носи срока и началото на прозореца',
        marks.length === 4, marks.length + ': ' + marks.join(' | '));
      ok('и текстът е точно „(срок ' + dm(THU) + ', може от ' + dm(MON) + ')"',
        marks.every(m => m === '(срок ' + dm(THU) + ', може от ' + dm(MON) + ')'), marks.join(' | '));
    }
  }

  section('8. ОБИКНОВЕНАТА еднодневна задача не е пипната');
  {
    const one = task('t-one', { title: 'Еднодневна', due_dates: [WED], due_window: false });
    const h = await view([one], []);
    if (!h) return report();
    const panel = h.doc.getElementById('dept-panel-trade');
    const txt = (panel.textContent || '').replace(/\s+/g, ' ');
    const box = panel.querySelector('input[data-tid="t-one"]');
    ok('има чекбокс с днешната дата', !!box && box.getAttribute('data-cdate') === WED);
    ok('редът „Срок" е нормалният',
      txt.indexOf('📅 Срок: ' + new Date(WED + 'T00:00:00').toLocaleDateString('bg-BG')) >= 0, txt);
    ok('и никъде не пише за прозорец', txt.indexOf('⏳ Прозорец') < 0, txt);
  }

  report();
})();
