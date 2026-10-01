/* „Не се отнася за нас" и АВТОМАТИЧНОТО отмятане (01.10.2026).

   markLinkedRecurringTask() отмята постоянната задача вместо обекта, когато той
   свърши работата в свързания модул (Вечерен оборот, Разлики, Стока на път).
   Заварено поведение: ред, различен от 'done', се ДОПИСВА на 'done' — писано
   за отложените, защото двата частични уникални индекса не гледат статус и нов
   ред би дал 409.

   След 01.10.2026 обаче 'not_applicable' е трето състояние: обектът изрично е
   заявил, че задачата не важи за него, и е написал ЗАЩО. PATCH на 'done' би
   изтрил причината мълчаливо и би записал като свършена работа, за която
   обектът е казал обратното — а редът трябва да остане ИЗВЪН знаменателя.

   Тестът пази и трите пътя: няма ред → пише; 'postponed' → дописва (заварено);
   'not_applicable' → НЕ ПИПА.

   Пускане: node tests/na-auto-complete-guard.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const STORE = 'Троян';
const USER = { email: 't@temax.bg', display_name: 'Троян', role: 'store', store_name: STORE };

/* Днешният ден по местно време — същото, което ползва today() в shared.js. */
function todayISO() {
  const d = new Date(), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
const TODAY = todayISO();
const TODAY_IDX = (new Date().getDay() + 6) % 7;

/* Постоянна задача, вързана към модул, дължима ВСЕКИ ден (due_time без избрани
   дни) — така тестът не зависи от това кой ден се пуска. */
function linkedTask() {
  return {
    id: 'r-link', title: 'Вечерен оборот', task_type: 'info',
    linked_module: 'oborot', due_weekday: null, due_weekdays: null,
    due_time: '20:00', due_window: false, target_stores: null, active: true
  };
}
function row(status, over) {
  return Object.assign({
    id: 'c-1', task_id: null, recurring_task_id: 'r-link', store_name: STORE,
    status: status, completion_date: TODAY, comment: null,
    completed_by: 'Иван', completed_at: TODAY + 'T09:00:00', postponed_to: null
  }, over || {});
}

function env(existing) {
  const calls = { post: [], patch: [] };
  const h = boot({
    modules: ['bulletin.js', 'report.js'],
    user: USER,
    data: {
      recurring_tasks: [linkedTask()],
      recurring_task_versions: [],
      recurring_task_skips: [],
      task_completions: () => (existing ? [existing] : []),
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      bulletins: [], bulletin_tasks: []
    }
  });
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    if (url.indexOf('/task_completions') >= 0) {
      if (m === 'POST') calls.post.push(JSON.parse(init.body || '{}'));
      if (m === 'PATCH') calls.patch.push({ url: url, body: JSON.parse(init.body || '{}') });
    }
    return orig.call(this, url, init);
  };
  h.calls2 = calls;
  /* Паметта „вече отметнато в тази сесия" е глобална — нулира се, иначе
     вторият случай в същия процес би върнал 'already' без да пита базата. */
  h.w.linkedTaskMarked = {};
  return h;
}
async function run(h) {
  let res = null;
  h.w.markLinkedRecurringTask('oborot').then(r => { res = r; });
  for (let i = 0; i < 60 && !res; i++) await ticks();
  return res;
}

(async function () {

  section('0. Задачата наистина се хваща (иначе всичко долу е вакуум)');
  {
    const h = env(null);
    const res = await run(h);
    if (ok('извикването връща резултат', !!res, JSON.stringify(res))) {
      ok('без съществуващ ред: отмята се', res.status === 'done', JSON.stringify(res));
      ok('и записът е POST, не PATCH',
        h.calls2.post.length === 1 && h.calls2.patch.length === 0,
        'post=' + h.calls2.post.length + ' patch=' + h.calls2.patch.length);
      ok('status в записа е done', (h.calls2.post[0] || {}).status === 'done',
        JSON.stringify(h.calls2.post[0]));
    }
  }

  section('1. ЗАВАРЕНО: отложен ред се ДОПИСВА на done');
  {
    const h = env(row('postponed', { postponed_to: TODAY, comment: 'ще го подам утре' }));
    const res = await run(h);
    if (ok('извикването връща резултат', !!res, JSON.stringify(res))) {
      ok('резултатът е done', res.status === 'done', JSON.stringify(res));
      ok('и то чрез дописване', res.patched === true, JSON.stringify(res));
      ok('има точно един PATCH', h.calls2.patch.length === 1,
        JSON.stringify(h.calls2.patch));
      ok('PATCH-ът слага done', ((h.calls2.patch[0] || {}).body || {}).status === 'done',
        JSON.stringify(h.calls2.patch[0]));
    }
  }

  section('2. НОВО: ред „не се отнася за нас" НЕ се пипа');
  {
    const h = env(row('not_applicable', { comment: 'обектът няма каса за оборот' }));
    const res = await run(h);
    if (ok('извикването връща резултат', !!res, JSON.stringify(res))) {
      ok('резултатът е already — пропуска се', res.status === 'already', JSON.stringify(res));
      ok('НУЛА PATCH заявки', h.calls2.patch.length === 0, JSON.stringify(h.calls2.patch));
      ok('НУЛА POST заявки', h.calls2.post.length === 0, JSON.stringify(h.calls2.post));
    }
  }

  section('3. Вече отметнатото пак се пропуска (регресия)');
  {
    const h = env(row('done'));
    const res = await run(h);
    ok('резултатът е already', !!res && res.status === 'already', JSON.stringify(res));
    ok('и нищо не се записва',
      h.calls2.patch.length === 0 && h.calls2.post.length === 0,
      'post=' + h.calls2.post.length + ' patch=' + h.calls2.patch.length);
  }

  report();
})();
