/* Дублирани отметки: клиентът поема 409 от уникалния индекс

   Дотук toggleTask()/toggleRecurringTask() избираха PATCH или POST според
   bulComps В ПАМЕТТА. Отворен отдавна таб, друго устройство или втори човек
   на същия обект значи стар bulComps: клиентът не вижда съществуващия ред и
   POST-ва втори. Към 10.09.2026 така се бяха натрупали 34 групи с 53 излишни
   реда — 19 групи с над ЧАС разлика, 7 от двама различни потребители. Тоест
   не е двойно натискане и не се лекува със заключване на бутона.
   submitPostpone() пък POST-ваше БЕЗУСЛОВНО, без изобщо да поглежда bulComps.

   Миграция 20260910231103 слага два ЧАСТИЧНИ уникални индекса (само когато
   completion_date НЕ е NULL). Тестът проверява, че клиентът живее с тях:
   POST, а при 409 → PATCH, без червен toast.

   ═══ ФАЛШИВИЯТ POSTGREST ═══
   fakeUnique() пази ключове и връща 409 при повторен POST — но САМО когато
   completion_date е непразна, точно както частичният индекс. Ако връщаше 409
   и за NULL дата, тестът щеше да заковава поведение, което базата никога
   няма да произведе.

   ⚠️ Никакви фиксирани календарни дати: котва + отместване.

   Пускане: node tests/task-completion-duplicates.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, fire, ok, guard, section, report, ticks } = H;

/* ── Дати ────────────────────────────────────────────────────────────────── */
function isoOffset(n) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
const TODAY = isoOffset(0);

/* ── Фалшив PostgREST с уникален индекс ──────────────────────────────────── */
function keyOf(b) {
  /* NULL дата → индексът НЕ важи (частичен), значи няма ключ и няма 409. */
  if (!b || !b.completion_date) return null;
  return (b.task_id || '-') + '|' + (b.recurring_task_id || '-') + '|' +
         (b.store_name || '-') + '|' + b.completion_date;
}
function res(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    json: () => Promise.resolve(body || {}),
    text: () => Promise.resolve(JSON.stringify(body || {})),
    headers: { get: () => null },
  });
}
function fakeUnique(h, opts) {
  opts = opts || {};
  const orig = h.w.fetch;
  const state = { keys: (opts.seed || []).slice(), post: [], patch: [], del: [] };
  h.w.fetch = function (url, init) {
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();
    if (String(url).indexOf('/task_completions') >= 0) {
      if (method === 'POST') {
        const body = JSON.parse(init.body);
        state.post.push(body);
        if (opts.postStatus) return res(opts.postStatus, { message: 'boom' });
        const k = keyOf(body);
        if (k && state.keys.indexOf(k) >= 0) {
          return res(409, {
            code: '23505',
            message: 'duplicate key value violates unique constraint "task_completions_uniq_task"',
          });
        }
        if (k) state.keys.push(k);
        return res(201);
      }
      if (method === 'PATCH') {
        state.patch.push({ url: String(url), body: JSON.parse(init.body) });
        return res(204);
      }
      if (method === 'DELETE') { state.del.push(String(url)); return res(204); }
    }
    return orig(url, init);
  };
  return state;
}

/* ── Среда ───────────────────────────────────────────────────────────────── */
const STORE = 'Троян';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: STORE };

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'daily-turnover.js'],
    user: opts.user || MANAGER, data: {},
  });
  const w = h.w;
  w.curBul = { id: 'b-1', week_number: 1, year: 2026, status: 'published',
    content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } } };
  w.DKEYS.forEach(k => { w.curBul.content.calendar[k] = []; });
  w.bulTasks = opts.bulTasks || [];
  w.recurringTasks = opts.recurring || [];
  w.bulComps = opts.bulComps || [];
  w.recurringComps = opts.recComps || [];
  w.subtaskComps = [];
  w.bulPromotions = [];
  w.allStoresCache = [STORE];
  w.renderBulletin = function () {};   /* рендерът не е предмет на този тест */
  h.setData('users', [{ store_name: STORE }]);
  h.setData('recurring_tasks', opts.recurring || []);
  return h;
}

const red = h => h.calls.toast.filter(t => /Грешка|⚠️|НЕ мина/.test(t));

(async function run() {

  /* ═══ 1. Стар bulComps: POST → 409 → PATCH ══════════════════════════ */
  section('1. Обикновена задача, редът вече е в базата, а bulComps не знае');
  {
    const h = env({ bulTasks: [{ id: 't-1', title: 'Опис', department: 'trade', task_type: 'info' }] });
    /* Ключът вече „съществува" — точно положението при отворен отдавна таб. */
    const st = fakeUnique(h, { seed: ['t-1|-|' + STORE + '|' + TODAY] });

    if (guard('toggleTask() не хвърля', () => h.w.toggleTask('t-1', true, null, TODAY))) {
      await ticks();
      ok('опитва се с ЕДИН POST', st.post.length === 1, String(st.post.length));
      ok('след 409 минава в PATCH', st.patch.length === 1, String(st.patch.length));
      if (st.patch.length) {
        const u = st.patch[0].url;
        ok('PATCH-ът е по правилния ред',
          u.indexOf('task_id=eq.t-1') >= 0 && u.indexOf('completion_date=eq.' + TODAY) >= 0, u);
        ok('и носи status=done', st.patch[0].body.status === 'done', String(st.patch[0].body.status));
      }
      ok('НЯМА червен toast', red(h).length === 0, JSON.stringify(h.calls.toast));
      ok('потребителят вижда успех',
        h.calls.toast.some(t => t.indexOf('отбелязана') >= 0), JSON.stringify(h.calls.toast));
    }
  }

  section('1б. Постоянна задача — същото');
  {
    const h = env({ recurring: [{ id: 'r-1', title: 'Вечерен оборот', department: 'trade', task_type: 'info', active: true }] });
    const st = fakeUnique(h, { seed: ['-|r-1|' + STORE + '|' + TODAY] });
    if (guard('toggleRecurringTask() не хвърля', () => h.w.toggleRecurringTask('r-1', true, null, TODAY))) {
      await ticks();
      ok('един POST', st.post.length === 1, String(st.post.length));
      ok('после PATCH', st.patch.length === 1, String(st.patch.length));
      ok('PATCH-ът е по recurring_task_id',
        st.patch.length && st.patch[0].url.indexOf('recurring_task_id=eq.r-1') >= 0,
        st.patch.length ? st.patch[0].url : '—');
      ok('НЯМА червен toast', red(h).length === 0, JSON.stringify(h.calls.toast));
    }
  }

  section('1в. Истински клик по чекбокса стига до същия път');
  {
    const h = env({ recurring: [{ id: 'r-1', title: 'Вечерен оборот', department: 'trade', task_type: 'info', active: true }] });
    const st = fakeUnique(h, { seed: ['-|r-1|' + STORE + '|' + TODAY] });
    const cb = h.doc.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.rtid = 'r-1';
    cb.dataset.cdate = TODAY;      /* днешна дата — иначе bulLockRejected() спира клика */
    cb.dataset.linked = '';
    cb.setAttribute('onchange', 'bulRecurringCheckboxChanged(this)');
    h.doc.body.appendChild(cb);
    cb.checked = true;
    if (guard('кликът не хвърля', () => fire(h.w, cb, 'change'))) {
      await ticks();
      ok('POST-ът тръгна от клика', st.post.length === 1, String(st.post.length));
      ok('и 409 се поема с PATCH', st.patch.length === 1, String(st.patch.length));
      ok('без червен toast', red(h).length === 0, JSON.stringify(h.calls.toast));
    }
  }

  /* ═══ 2. Първо отмятане — една заявка, без PATCH ═════════════════════ */
  section('2. Първо отмятане: ЕДИН POST и нищо повече');
  {
    const h = env({ bulTasks: [{ id: 't-1', title: 'Опис', department: 'trade', task_type: 'info' }] });
    const st = fakeUnique(h);   /* базата е празна */
    if (guard('toggleTask() не хвърля', () => h.w.toggleTask('t-1', true, null, TODAY))) {
      await ticks();
      ok('един POST', st.post.length === 1, String(st.post.length));
      ok('НУЛА PATCH', st.patch.length === 0, JSON.stringify(st.patch));
      ok('без червен toast', red(h).length === 0, JSON.stringify(h.calls.toast));
    }
  }

  section('2б. bulComps ЗНАЕ за реда → директен PATCH, без POST');
  {
    /* Старото поведение се пази: помнената подсказка спестява заявка. */
    const h = env({
      bulTasks: [{ id: 't-1', title: 'Опис', department: 'trade', task_type: 'info' }],
      bulComps: [{ task_id: 't-1', store_name: STORE, status: 'done', completion_date: TODAY }],
    });
    const st = fakeUnique(h, { seed: ['t-1|-|' + STORE + '|' + TODAY] });
    if (guard('toggleTask() не хвърля', () => h.w.toggleTask('t-1', true, null, TODAY))) {
      await ticks();
      ok('НУЛА POST', st.post.length === 0, JSON.stringify(st.post));
      ok('един PATCH', st.patch.length === 1, String(st.patch.length));
    }
  }

  /* ═══ 3. Грешка, различна от 409 ═════════════════════════════════════ */
  section('3. 401 си остава червен toast и НЕ се прикрива с PATCH');
  {
    const h = env({ bulTasks: [{ id: 't-1', title: 'Опис', department: 'trade', task_type: 'info' }] });
    const st = fakeUnique(h, { postStatus: 401 });
    if (guard('toggleTask() не хвърля', () => h.w.toggleTask('t-1', true, null, TODAY))) {
      await ticks();
      ok('POST-ът е направен', st.post.length === 1, String(st.post.length));
      ok('НЯМА PATCH — не се преструваме на успех', st.patch.length === 0, JSON.stringify(st.patch));
      ok('има червен toast', red(h).length === 1, JSON.stringify(h.calls.toast));
      ok('и той носи причината, не само думата „Грешка"',
        h.calls.toast.some(t => t.indexOf('boom') >= 0), JSON.stringify(h.calls.toast));
    }
  }

  section('3б. 500 — също червен toast');
  {
    const h = env({ recurring: [{ id: 'r-1', title: 'X', department: 'trade', task_type: 'info', active: true }] });
    const st = fakeUnique(h, { postStatus: 500 });
    if (guard('toggleRecurringTask() не хвърля', () => h.w.toggleRecurringTask('r-1', true, null, TODAY))) {
      await ticks();
      ok('няма PATCH', st.patch.length === 0);
      ok('има червен toast', red(h).length === 1, JSON.stringify(h.calls.toast));
    }
  }

  /* ═══ 4. Отлагане ════════════════════════════════════════════════════ */
  section('4. submitPostpone: 409 → PATCH със status=postponed');
  {
    const h = env({ bulTasks: [{ id: 't-1', title: 'Опис', department: 'trade', task_type: 'info' }] });
    const st = fakeUnique(h, { seed: ['t-1|-|' + STORE + '|' + TODAY] });
    const ov = h.doc.createElement('div');
    ov.id = 'pp-modal-ov';
    ov.innerHTML = '<textarea id="pp-comment">няма ток</textarea>';
    h.doc.body.appendChild(ov);
    if (guard('submitPostpone() не хвърля', () => h.w.submitPostpone('t-1', 'regular', TODAY))) {
      await ticks();
      ok('един POST', st.post.length === 1, String(st.post.length));
      ok('после PATCH', st.patch.length === 1, String(st.patch.length));
      if (st.patch.length) {
        ok('status е postponed', st.patch[0].body.status === 'postponed', String(st.patch[0].body.status));
        ok('причината влиза като коментар', st.patch[0].body.comment === 'няма ток',
          String(st.patch[0].body.comment));
        ok('PATCH-ът е по правилния ден',
          st.patch[0].url.indexOf('completion_date=eq.' + TODAY) >= 0, st.patch[0].url);
      }
      ok('без червен toast', red(h).length === 0, JSON.stringify(h.calls.toast));
    }
  }

  /* ═══ 5. NULL дата — индексът не важи ════════════════════════════════ */
  section('5. Задача БЕЗ дата: няма 409, значи и няма PATCH');
  {
    /* Частичните индекси покриват само completion_date IS NOT NULL. Тестът
       заковава, че поправката не се преструва на активна там, където базата
       не може да я задейства — иначе би обещавала защита, каквато няма. */
    const h = env({ bulTasks: [{ id: 't-1', title: 'Опис', department: 'trade', task_type: 'info' }] });
    const st = fakeUnique(h, { seed: ['t-1|-|' + STORE + '|' + TODAY] });
    if (guard('toggleTask(null дата) не хвърля', () => h.w.toggleTask('t-1', true, null, null))) {
      await ticks();
      ok('POST минава', st.post.length === 1, String(st.post.length));
      ok('няма PATCH', st.patch.length === 0, JSON.stringify(st.patch));
      ok('без червен toast', red(h).length === 0, JSON.stringify(h.calls.toast));
    }
  }

  /* ═══ 6. Оборотът ════════════════════════════════════════════════════ */
  section('6. dtMarkBulletinTask: 409 не вдига предупреждение');
  {
    const h = env({});
    h.setData('recurring_tasks', [{ id: 'r-ob', linked_module: 'oborot', task_type: 'info' }]);
    h.setData('task_completions', []);   /* SELECT-ът не намира нищо → стига до POST */
    const st = fakeUnique(h, { seed: ['-|r-ob|' + STORE + '|' + h.w.dtToday()] });
    h.w.oborotTaskWarn = false;
    if (guard('dtMarkBulletinTask() не хвърля', () => h.w.dtMarkBulletinTask())) {
      await ticks(); await ticks();
      ok('POST-ът е опитан', st.post.length === 1, String(st.post.length));
      ok('няма предупреждение', h.w.oborotTaskWarn === false, String(h.w.oborotTaskWarn));
      ok('няма жълт toast', !h.calls.toast.some(t => t.indexOf('не се отметна') >= 0),
        JSON.stringify(h.calls.toast));
    }
  }

  section('6б. КОНТРОЛА: 500 от оборота ВСЕ ОЩЕ предупреждава');
  {
    const h = env({});
    h.setData('recurring_tasks', [{ id: 'r-ob', linked_module: 'oborot', task_type: 'info' }]);
    h.setData('task_completions', []);
    fakeUnique(h, { postStatus: 500 });
    h.w.oborotTaskWarn = false;
    if (guard('dtMarkBulletinTask() не хвърля', () => h.w.dtMarkBulletinTask())) {
      await ticks(); await ticks();
      ok('предупреждението е вдигнато', h.w.oborotTaskWarn === true, String(h.w.oborotTaskWarn));
      ok('и има жълт toast', h.calls.toast.some(t => t.indexOf('не се отметна') >= 0),
        JSON.stringify(h.calls.toast));
    }
  }

  report();
})();
