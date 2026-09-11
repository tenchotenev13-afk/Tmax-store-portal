/* „📅 Срок" на изпълнена еднодневна задача — без „Просрочено".

   До 11.09.2026 баджът със срока не гледаше дали задачата е отметната:
   свършена в понеделник, гледана в сряда → червено „⚠️ Просрочено". Сега
   (bulDueLineHtml() в bulletin.js):
     · изпълнена → сиво, без „Просрочено"/„(Днес!)"/„(N дни)";
     · отметната СЛЕД срока → „✓ със закъснение", сиво. Денят е
       completed_at по ЛОКАЛНО време — completion_date е ключът по деня на
       срока и е равен на него винаги;
     · неизпълнена и отложена → както досега;
     · отложена и после изпълнена (два реда за деня) → часът е от
       изпълнената, не от първия намерен ред.

   Баджът се рисува на ДВЕ места и тестът проверява и двете:
     · блокът по отдел (#dept-panel-trade)        — просрочена: „ ⚠️";
     · панелът „Задачи за седмицата" на обекта    — „ ⚠️ Просрочено".
   Печатът и „Днес" нямат такъв бадж.

   ⚠️ Дати: котвата е сряда от текущата реална седмица, замразена на w.Date.
   completed_at се строи от ЛОКАЛНИ часове — като реалното отмятане.

   Пускане: node tests/bulletin-due-done.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* ── Котва: сряда 12:00 ─────────────────────────────────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
function at(days, h, m) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); d.setHours(h, m || 0, 0, 0); return d; }
function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function isoWeekYear(d) {
  const t = new Date(d.getTime());
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function freezeDate(w) {
  const Real = w.Date, fixedMs = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}

const MON = isoOf(at(-2, 12)), WED = isoOf(ANCHOR), FRI = isoOf(at(2, 12));
const TR = 'Троян';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: TR };

/* Заглавията не са подниз едно на друго — редът се намира по тях. */
const T = {
  early:    { id: 't-early',   title: 'Опис ранен',          due: MON },
  late:     { id: 't-late',    title: 'Опис късен',          due: MON },
  midnight: { id: 't-mid',     title: 'Опис след полунощ',   due: MON },
  evening:  { id: 't-eve',     title: 'Опис вечерен',        due: MON },
  over:     { id: 't-over',    title: 'Опис неизпълнен',     due: MON },
  post:     { id: 't-post',    title: 'Опис отложен',        due: MON },
  todayDone:{ id: 't-tdone',   title: 'Опис днес свършен',   due: WED },
  todayOpen:{ id: 't-topen',   title: 'Опис днес чакащ',     due: WED },
  postDone: { id: 't-pdone',   title: 'Опис отложен и свършен', due: MON },
  soonDone: { id: 't-sdone',   title: 'Опис петък свършен',  due: FRI }
};
function task(k, i) {
  return { id: T[k].id, bulletin_id: 'b-1', title: T[k].title, department: 'trade',
    due_date: T[k].due, due_dates: null, task_type: 'info', target_stores: null,
    sort_order: i + 1, report_groups: null, linked_module: null, description: null, created_by: 'Админ' };
}
function comp(k, status, completedAt) {
  return { id: 'c-' + k, task_id: T[k].id, recurring_task_id: null, store_name: TR, status: status,
    completion_date: T[k].due, completed_at: completedAt.toISOString(), completed_by: TR,
    comment: null, photos: null, files: null, bulletin_id: 'b-1' };
}
const COMPS = [
  comp('early', 'done', at(-2, 10)),        /* понеделник 10:00 — в срок */
  comp('late', 'done', at(-1, 9)),          /* вторник 09:00 — ден по-късно */
  comp('midnight', 'done', at(-1, 0, 30)),  /* вторник 00:30 местно = понеделник в UTC */
  comp('evening', 'done', at(-2, 23, 50)),  /* понеделник 23:50 — още в срок */
  comp('post', 'postponed', at(-2, 11)),
  comp('todayDone', 'done', at(0, 9)),
  comp('soonDone', 'done', at(0, 9)),       /* преди срока (стари данни от преди заключването) */
  /* Два реда за един ден: отложената ПЪРВА (с по-късен час), после
     изпълнената в срок. Часът се взима от изпълнената, не от първия ред. */
  Object.assign(comp('postDone', 'postponed', at(-1, 9)), { id: 'c-postDone-p' }),
  comp('postDone', 'done', at(-2, 10))
];

function env() {
  const h = boot({
    modules: ['bulletin.js'],
    user: MANAGER,
    data: {
      users: [{ store_name: TR }],
      recurring_tasks: [],
      recurring_task_skips: [],
      bulletins: () => [h.bul],
      bulletin_tasks: Object.keys(T).map(task),
      task_completions: COMPS,
      subtask_completions: [],
      task_subtasks: []
    }
  });
  freezeDate(h.w);
  const cal = {};
  h.w.DKEYS.forEach(k => { cal[k] = []; });
  h.bul = { id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
            content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = [TR];
  return h;
}

async function settle(cond, max) {
  for (let i = 0; i < (max || 40); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const DATE_BG = iso => new Date(iso + 'T00:00:00').toLocaleDateString('bg-BG');

/* Редът „📅 Срок: …" на задачата — по един на изглед. */
function dueLines(doc, k) {
  const all = Array.prototype.filter.call(doc.querySelectorAll('#mod-bulletin div'),
    d => d.children.length === 0 && d.textContent.indexOf('📅 Срок:') === 0 &&
      d.parentElement && d.parentElement.textContent.indexOf(T[k].title) >= 0);
  return {
    dept: all.find(d => d.closest('#dept-panel-trade')) || null,
    panel: all.find(d => !d.closest('[id^="dept-panel-"]')) || null
  };
}
const colorOf = el => ((el && el.getAttribute('style')) || '').replace(/.*color:(#[0-9a-f]{6}).*/i, '$1');

(async function () {
  const h = env();
  section('0. Зареждане');
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) { report(); return; }
  const loaded = await settle(() => !!h.doc.getElementById('dept-panel-trade') && txt(h.doc.getElementById('mod-bulletin')).indexOf(T.early.title) >= 0);
  ok('Бюлетинът е нарисуван', loaded);
  const doc = h.doc;

  /* Проверка на двата изгледа наведнъж. */
  function both(k, name, fn) {
    const L = dueLines(doc, k);
    ['dept', 'panel'].forEach(v => {
      const label = (v === 'dept' ? '[блок по отдел] ' : '[панел на обекта] ') + name;
      if (ok(label + ' — редът „📅 Срок" съществува', !!L[v])) fn(L[v], v, label);
    });
  }

  section('1. Изпълнена ПРЕДИ/В срока → само дата, сиво');
  both('early', T.early.title, (el, v, label) => {
    ok(label + ': точно „📅 Срок: <дата>"', txt(el) === '📅 Срок: ' + DATE_BG(MON), txt(el));
    ok(label + ': сиво', colorOf(el) === '#94a3b8', colorOf(el));
  });
  both('evening', T.evening.title + ' (23:50 в деня на срока)', (el, v, label) => {
    ok(label + ': без „закъснение"', txt(el) === '📅 Срок: ' + DATE_BG(MON), txt(el));
  });

  section('2. Изпълнена СЛЕД срока → „✓ със закъснение", сиво');
  both('late', T.late.title, (el, v, label) => {
    ok(label + ': „✓ със закъснение"', txt(el) === '📅 Срок: ' + DATE_BG(MON) + ' ✓ със закъснение', txt(el));
    ok(label + ': без „Просрочено"/⚠️', txt(el).indexOf('Просрочено') < 0 && txt(el).indexOf('⚠️') < 0, txt(el));
    ok(label + ': сиво', colorOf(el) === '#94a3b8', colorOf(el));
  });
  /* 00:30 местно на следващия ден е все още денят на срока в UTC. Смята ли
     се по UTC (toISOString), отметката би минала за навременна. */
  if (new Date().getTimezoneOffset() < 0) {
    both('midnight', T.midnight.title + ' (00:30 на следващия ден)', (el, v, label) => {
      ok(label + ': по ЛОКАЛНА дата → „със закъснение"', txt(el).indexOf('✓ със закъснение') >= 0, txt(el));
    });
  } else {
    console.log('  (пропуснато: часовата зона на машината не е източно от UTC — граничният случай е неразличим)');
  }

  section('3. Неизпълнена след срока → „Просрочено" както досега');
  both('over', T.over.title, (el, v, label) => {
    const exp = '📅 Срок: ' + DATE_BG(MON) + (v === 'dept' ? ' ⚠️' : ' ⚠️ Просрочено');
    ok(label + (v === 'dept' ? ': дата + „ ⚠️"' : ': дата + „ ⚠️ Просрочено"'), txt(el) === exp, txt(el));
    ok(label + ': червено', colorOf(el) === '#dc2626', colorOf(el));
  });

  section('4. Отложена — не се пипа (пак като просрочена)');
  both('post', T.post.title, (el, v, label) => {
    ok(label + ': ⚠️ остава', txt(el).indexOf('⚠️') >= 0, txt(el));
    ok(label + ': червено', colorOf(el) === '#dc2626', colorOf(el));
    ok(label + ': без „закъснение"', txt(el).indexOf('закъснение') < 0, txt(el));
  });

  section('4б. Отложена, после изпълнена в срок → часът е от изпълнената');
  both('postDone', T.postDone.title, (el, v, label) => {
    ok(label + ': само дата (без „закъснение")', txt(el) === '📅 Срок: ' + DATE_BG(MON), txt(el));
  });

  section('5. Днешна и предстояща: изпълнена → без „(Днес!)"/„(N дни)"');
  both('todayDone', T.todayDone.title, (el, v, label) => {
    ok(label + ': без „(Днес!)"', txt(el) === '📅 Срок: ' + DATE_BG(WED), txt(el));
    ok(label + ': сиво', colorOf(el) === '#94a3b8', colorOf(el));
  });
  both('soonDone', T.soonDone.title, (el, v, label) => {
    ok(label + ': без „(2 дни)"', txt(el) === '📅 Срок: ' + DATE_BG(FRI), txt(el));
    ok(label + ': сиво', colorOf(el) === '#94a3b8', colorOf(el));
  });
  both('todayOpen', T.todayOpen.title + ' (контрола: неизпълнена)', (el, v, label) => {
    ok(label + ': „(Днес!)" остава', txt(el) === '📅 Срок: ' + DATE_BG(WED) + ' (Днес!)', txt(el));
    ok(label + ': оранжево', colorOf(el) === '#d97706', colorOf(el));
  });

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
