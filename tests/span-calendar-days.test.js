/* Многоседмичната задача в КОЛОНИТЕ на календара, всеки ден от прозореца си
   (01.10.2026).

   ПОВОД. Дотук многоседмичната имаше клетка САМО в деня на срока си и иначе
   стоеше единствено в лентата „🗓 Със срок в следваща седмица" над календара.
   Магазините гледат колоните по дни и я подминаваха, а бутонът към свързания
   таб (🚚 Стока на път) го нямаше никъде. На 01.10.2026 „Стока на път" (в сила
   от 01.10) и „Надстройка в буса" (срок 15.10) не се виждаха в колоната на 1.10.

   ПРАВИЛОТО е същото като при прозоречните постоянни задачи в „План за деня"
   (решение б, 27.09.2026): всеки ден от прозореца, докато НЕ е изпълнена; след
   изпълнение — само в деня на изпълнението. Денят идва от completed_at, защото
   completion_date при многоседмичната е ВИНАГИ срокът (решение D1).

   Какво заковава тестът:
     1. магазин, собствената седмица: в клетките от „в сила от" до неделя,
        но НЕ преди „в сила от";
     2. магазин, следващата седмица: от понеделник до СРОКА, не след него;
     3. истински клик по чекбокса → записва completion_date = СРОКА (не деня на
        клетката), и оттам нататък редът е само в деня на изпълнението;
     4. офис: всеки ден от обхвата, с брояча X/18 — едно и също число;
     5. автоматичната „Стока на път": бутонът към таба е в клетката, чекбоксът е
        заключен и носи надписа си;
     6. лентата над календара я няма;
     7. задача БЕЗ spans_from се вижда само в своя ден (регресия).

   Пускане: node tests/span-calendar-days.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

/* ── дати: котвата е СРЯДА от текущата реална седмица ─────────────────────── */
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
/* W0 = понеделникът на котвата. Котвата е сряда, тоест W0+2 е „днес". */
const D = n => isoOf(shifted(-2 + n));          /* D(0)=понеделник … D(6)=неделя */
const W0 = D(0), TUE = D(1), WED = D(2), THU = D(3), SUN = D(6);
const W1 = D(7), DUE = D(10);                   /* срокът — четвъртък на W1 */
const AFTER_DUE = D(11);

const STORE = { email: 't@temax.bg', display_name: 'Троян', role: 'store', store_name: 'Троян' };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORES = ['Троян', 'Ловеч'];

function bulRow(w, id, k) {
  const d = shifted(7 * k), cal = {};
  w.DKEYS.forEach(x => { cal[x] = []; });
  return { id: id, week_number: w.weekNum(d), year: isoWeekYear(d), status: 'published',
           created_at: isoOf(d), content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}
/* Многоседмичната: поставена в W0, в сила от сряда, срок четвъртък на W1. */
function spanTask(over) {
  return Object.assign({
    id: 't-span', bulletin_id: 'b-1', department: 'warehouse', title: 'Надстройка в буса',
    description: null, due_date: DUE, due_dates: [DUE], spans_from: W0, starts_on: WED,
    target_stores: null, task_type: 'info', report_groups: ['controlling'],
    linked_module: 'transit', auto_complete: false, attachments: null, sort_order: 1,
    created_by: 'Админ', created_at: W0,
    bulletins: { id: 'b-1', status: 'published', week_number: 0, year: 2026 }
  }, over || {});
}
/* Еднодневна в сряда — регресията: тя си остава само в своя ден. */
const PLAIN = { id: 't-plain', bulletin_id: 'b-1', department: 'trade', title: 'Еднодневна',
  description: null, due_date: WED, due_dates: [WED], spans_from: null, starts_on: null,
  target_stores: null, task_type: 'info', report_groups: null, linked_module: null,
  auto_complete: false, attachments: null, sort_order: 2, created_by: 'Админ', created_at: W0 };

function env(bulId, db, user) {
  const h = boot({
    modules: ['bulletin.js'],
    user: user || STORE,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      recurring_task_versions: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: url => {
        /* loadSpanningTasks(): spans_from=not.is.null + прозорец. */
        if (url.indexOf('spans_from=not.is.null') >= 0) {
          const mo = /[?&]due_date=gte\.([0-9-]+)/.exec(url);
          const su = /[?&]spans_from=lte\.([0-9-]+)/.exec(url);
          return db.tasks.filter(t => t.spans_from &&
            (!mo || (t.due_dates[0] || t.due_date) >= mo[1]) &&
            (!su || t.spans_from <= su[1]));
        }
        const byBul = /[?&]bulletin_id=eq\.([^&]+)/.exec(url);
        if (byBul) return db.tasks.filter(t => t.bulletin_id === byBul[1]);
        const byIds = /[?&]id=in\.\(([^)]*)\)/.exec(url);
        if (byIds) { const ids = byIds[1].split(','); return db.tasks.filter(t => ids.indexOf(t.id) >= 0); }
        return db.tasks;
      },
      task_completions: () => db.comps,
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: []
    }
  });
  h.buls = [bulRow(h.w, 'b-1', 0), bulRow(h.w, 'b-2', 1)];
  freezeDate(h.w);
  h.w.bulSelectedId = bulId;
  h.w.bulActiveDept = 'warehouse';
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  /* Пишещите заявки влизат в „базата", за да се види какво е записал кликът. */
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    if (m === 'GET' || url.indexOf('/task_completions') < 0) return orig.call(this, url, init);
    return orig.call(this, url, init).then(function (r) {
      const body = init.body ? JSON.parse(init.body) : null;
      if (m === 'POST') {
        const row = Object.assign({ id: 'c-n' + (++db.seq) }, body);
        db.comps.push(row);
        return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve('') };
      }
      if (m === 'PATCH') {
        const idm = /[?&]id=eq\.([^&]+)/.exec(url);
        db.comps.forEach(c => { if (idm && c.id === idm[1]) Object.assign(c, body); });
      }
      return r;
    });
  };
  return h;
}
function freshDb(over) {
  return Object.assign({ seq: 0, tasks: [spanTask(), PLAIN], comps: [] }, over || {});
}
async function settle(cond, max) { for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function view(bulId, db, user) {
  const h = env(bulId, db, user);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle(() => !!h.doc.getElementById('sec-calendar'));
  return h;
}
/* Клетката на даден ден: колоните са в реда на DKEYS, тоест по индекс. */
function cellOf(h, dayIdx) {
  const cal = h.doc.getElementById('sec-calendar');
  if (!cal) return null;
  const grid = cal.querySelector('div[style*="grid-template-columns"]');
  return grid ? grid.children[dayIdx] : null;
}
const txtOf = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const hasTask = (h, dayIdx, title) => txtOf(cellOf(h, dayIdx)).indexOf(title) >= 0;
/* Чекбоксът на задачата в клетката на деня. */
function cbOf(h, dayIdx, taskId) {
  const c = cellOf(h, dayIdx);
  return c ? c.querySelector('input[type=checkbox][data-tid="' + taskId + '"]') : null;
}

(async function () {

  section('1. Магазин, собствената седмица: от „в сила от" до неделя');
  {
    const h = await view('b-1', freshDb());
    if (!h) return report();
    ok('понеделник — НЕ (преди „в сила от")', !hasTask(h, 0, 'Надстройка в буса'), txtOf(cellOf(h, 0)));
    ok('вторник — НЕ', !hasTask(h, 1, 'Надстройка в буса'), txtOf(cellOf(h, 1)));
    ok('СРЯДА (в сила от) — ДА', hasTask(h, 2, 'Надстройка в буса'), txtOf(cellOf(h, 2)));
    ok('четвъртък — ДА', hasTask(h, 3, 'Надстройка в буса'));
    ok('неделя — ДА', hasTask(h, 6, 'Надстройка в буса'));
    /* Изискване 2: бележката със срока и бутонът към свързания таб. */
    const wed = txtOf(cellOf(h, 2));
    ok('редът носи „Срок ДД.ММ"', /Срок \d\d\.\d\d/.test(wed), wed);
    ok('и бутонът към „Стока на път"', wed.indexOf('Стока на път') >= 0, wed);
    /* Без дереференциране на null: липсва ли чекбоксът (точно това става при
       стария код), тестът трябва да ДОКЛАДВА, а не да хвърли преди report() —
       иначе остава стек вместо диагноза (CLAUDE.md, Тестване). */
    const cb1 = cbOf(h, 2, 't-span');
    ok('чекбоксът е в клетката', !!cb1, txtOf(cellOf(h, 2)));
    ok('и носи СРОКА като completion_date, не деня на клетката',
      !!cb1 && cb1.getAttribute('data-cdate') === DUE,
      cb1 ? cb1.getAttribute('data-cdate') : '(няма чекбокс)');
  }

  section('2. Магазин, СЛЕДВАЩАТА седмица: до срока, не след него');
  {
    const h = await view('b-2', freshDb());
    if (!h) return report();
    ok('понеделник на W1 — ДА', hasTask(h, 0, 'Надстройка в буса'), txtOf(cellOf(h, 0)));
    ok('денят на СРОКА (четвъртък) — ДА', hasTask(h, 3, 'Надстройка в буса'));
    ok('петък (след срока) — НЕ', !hasTask(h, 4, 'Надстройка в буса'), txtOf(cellOf(h, 4)));
    ok('и не се удвоява в деня на срока',
      txtOf(cellOf(h, 3)).split('Надстройка в буса').length - 1 === 1, txtOf(cellOf(h, 3)));
  }

  section('3. Истински клик: пише СРОКА и оттам нататък е само в деня на изпълнението');
  {
    const db = freshDb();
    const h = await view('b-1', db);
    if (!h) return report();
    /* Кликът е в клетката на ЧЕТВЪРТЪК, а часовникът е замразен на сряда —
       тоест „денят на изпълнението" е сряда, какъвто и да е денят на клетката. */
    const cb = cbOf(h, 3, 't-span');
    if (ok('чекбоксът в четвъртък съществува', !!cb)) {
      /* Контролата е onchange, не onclick: истинското действие е превключване
         плюс change, точно както го прави човек. */
      ok('не е заключен', cb.disabled === false, String(cb.disabled));
      cb.checked = true;
      H.fire(h.w, cb, 'change');
      await settle(() => db.comps.length > 0);
      ok('записан е ЕДИН ред', db.comps.length === 1, JSON.stringify(db.comps));
      const c = db.comps[0] || {};
      ok('completion_date = СРОКА', c.completion_date === DUE, String(c.completion_date));
      ok('status = done', c.status === 'done', String(c.status));
      ok('completed_at е записан', !!c.completed_at, String(c.completed_at));
    }
    /* Пререндер с вече записаната отметка. */
    const h2 = await view('b-1', db);
    ok('сряда (денят на изпълнението) — ДА', hasTask(h2, 2, 'Надстройка в буса'), txtOf(cellOf(h2, 2)));
    ok('четвъртък — вече НЕ', !hasTask(h2, 3, 'Надстройка в буса'), txtOf(cellOf(h2, 3)));
    ok('неделя — вече НЕ', !hasTask(h2, 6, 'Надстройка в буса'), txtOf(cellOf(h2, 6)));
    ok('и редът в сряда е отметнат', cbOf(h2, 2, 't-span') && cbOf(h2, 2, 't-span').checked === true);
  }

  section('4. Офис: всеки ден от обхвата, с едно и също X/18');
  {
    const h = await view('b-1', freshDb(), ADMIN);
    if (!h) return report();
    /* Прозорецът на офиса започва от spans_from (понеделник): той я е написал
       предварително и трябва да я вижда в седмицата, в която е поставена. */
    for (const [i, name] of [[0, 'понеделник'], [2, 'сряда'], [6, 'неделя']]) {
      ok('офисът я вижда в ' + name, hasTask(h, i, 'Надстройка в буса'), txtOf(cellOf(h, i)));
    }
    const nums = [0, 2, 6].map(i => (txtOf(cellOf(h, i)).match(/(\d+)\/(\d+)/) || [])[0] || '—');
    ok('броячът е един и същ във всички дни', nums[0] === nums[1] && nums[1] === nums[2],
      nums.join(' | '));
    ok('и е „0/2" при два отчетни обекта и нула отметки', nums[0] === '0/2', nums.join(' | '));
    ok('офисът НЕ вижда чекбокс', !cbOf(h, 2, 't-span'));
  }

  section('5. Автоматичната „Стока на път": бутон + заключен чекбокс с надпис');
  {
    const db = freshDb({ tasks: [spanTask({ id: 't-auto', title: 'Стока на път', auto_complete: true }), PLAIN] });
    const h = await view('b-1', db);
    if (!h) return report();
    const wed = cellOf(h, 2);
    ok('задачата е в клетката', txtOf(wed).indexOf('Стока на път') >= 0, txtOf(wed));
    const cb = cbOf(h, 2, 't-auto');
    if (ok('чекбоксът съществува', !!cb)) {
      ok('и е ЗАКЛЮЧЕН', cb.disabled === true, String(cb.disabled));
      ok('data-linked е transit-auto', cb.getAttribute('data-linked') === 'transit-auto',
        cb.getAttribute('data-linked'));
    }
    ok('бутонът към таба е в клетката',
      !!Array.prototype.find.call(wed.querySelectorAll('button'),
        b => (b.textContent || '').indexOf('Стока на път') >= 0), txtOf(wed));
    /* Надписът на автоматичната е „⏳ отмята се от Стока на път" (или броят
       необработени редове, когато има такива) — bulAutoTransitNoteHtml(). */
    ok('и носи надписа на автоматичната',
      txtOf(wed).indexOf('отмята се от') >= 0 || txtOf(wed).indexOf('необработени') >= 0, txtOf(wed));
  }

  section('6. Лентата над календара вече я няма');
  {
    const h = await view('b-1', freshDb());
    if (!h) return report();
    ok('#sec-span-strip не съществува', !h.doc.getElementById('sec-span-strip'));
    ok('и надписът „Със срок в следваща седмица" го няма',
      h.doc.body.textContent.indexOf('Със срок в следваща седмица') < 0);
    ok('bulSpanStripHtml е махната от кода', typeof h.w.bulSpanStripHtml === 'undefined',
      typeof h.w.bulSpanStripHtml);
  }

  section('6б. ХАРТИЯТА: многоседмичната е в печата всеки ден от прозореца');
  {
    const h = await view('b-1', freshDb());
    if (!h) return report();
    let printed = '';
    h.w.open = () => ({ document: { write(x) { printed += String(x); }, close() {} },
                        focus() {}, print() {}, close() {} });
    if (guard('printSection(cal) не хвърля', () => h.w.printSection('cal'))) {
      /* Броят на дните се мери по ПОЯВЯВАНИЯТА в целия печат: решетката на
         хартията е същата, но без data- атрибути, по които да се хване клетка. */
      const times = printed.split('Надстройка в буса').length - 1;
      ok('задачата е на листа', times > 0, 'появявания: ' + times);
      /* Прозорецът покрива сряда–неделя от показаната седмица, тоест пет дни. */
      ok('и то в ПЕТ дни (сряда–неделя), не в един', times === 5, 'появявания: ' + times);
      ok('всяко появяване носи срока', (printed.match(/срок \d\d\.\d\d/g) || []).length === times,
        JSON.stringify((printed.match(/срок \d\d\.\d\d/g) || []).length));
      /* Еднодневната си остава един път — регресия и на хартия. */
      ok('еднодневната е само един път', printed.split('Еднодневна').length - 1 === 1,
        'появявания: ' + (printed.split('Еднодневна').length - 1));
    }
  }

  section('6в. ХАРТИЯТА без многоседмични: печатът е същият като досегашния');
  {
    /* Еталонът е в самия тест, не в git историята: в CI няма пълна история и
       `git cat-file` там пада (виж tests-no-git-history в паметта). Проверката
       е, че БЕЗ многоседмична задача печатът не съдържа нито следа от новия
       път — нито повторения, нито надписа „(срок …)". */
    const db = freshDb({ tasks: [PLAIN] });
    const h = await view('b-1', db);
    if (!h) return report();
    let printed = '';
    h.w.open = () => ({ document: { write(x) { printed += String(x); }, close() {} },
                        focus() {}, print() {}, close() {} });
    if (guard('printSection(cal) не хвърля', () => h.w.printSection('cal'))) {
      ok('еднодневната е на листа точно един път',
        printed.split('Еднодневна').length - 1 === 1, 'появявания: ' + (printed.split('Еднодневна').length - 1));
      ok('и НИКЪДЕ не се появява надписът „(срок …)"',
        !/\(срок \d\d\.\d\d\)/.test(printed), (printed.match(/\(срок[^)]*\)/g) || []).join(' | '));
    }
  }

  section('7. РЕГРЕСИЯ: задача без spans_from си остава само в своя ден');
  {
    const h = await view('b-1', freshDb());
    if (!h) return report();
    ok('сряда — ДА', hasTask(h, 2, 'Еднодневна'), txtOf(cellOf(h, 2)));
    for (const i of [0, 1, 3, 4, 5, 6]) {
      ok('ден ' + i + ' — НЕ', !hasTask(h, i, 'Еднодневна'), txtOf(cellOf(h, i)));
    }
    ok('и нейният data-cdate е ДЕНЯТ, не срок',
      cbOf(h, 2, 't-plain') && cbOf(h, 2, 't-plain').getAttribute('data-cdate') === WED,
      cbOf(h, 2, 't-plain') && cbOf(h, 2, 't-plain').getAttribute('data-cdate'));
  }

  section('8. „В сила от" в БЪДЕЩЕТО: магазинът не я вижда никъде');
  {
    /* starts_on след неделя на показаната седмица — за магазина задачата още не
       съществува (изискване 6). */
    const db = freshDb({ tasks: [spanTask({ starts_on: AFTER_DUE, due_date: D(20), due_dates: [D(20)] }), PLAIN] });
    const h = await view('b-1', db);
    if (!h) return report();
    for (const i of [0, 1, 2, 3, 4, 5, 6]) {
      ok('ден ' + i + ' — НЕ', !hasTask(h, i, 'Надстройка в буса'), txtOf(cellOf(h, i)));
    }
    /* КОНТРОЛ: офисът я вижда — иначе проверката горе минава и при счупен рендер. */
    const ho = await view('b-1', db, ADMIN);
    ok('КОНТРОЛ: офисът я вижда в понеделник', hasTask(ho, 0, 'Надстройка в буса'), txtOf(cellOf(ho, 0)));
    ok('и то с бадж „в сила от"', txtOf(cellOf(ho, 0)).indexOf('в сила от') >= 0, txtOf(cellOf(ho, 0)));
  }

  report();
})();
