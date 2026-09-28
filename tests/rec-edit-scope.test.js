/* Модалът за ПОСТОЯННА задача: избор на обхват + прозорецът да казва последицата
   (28.09.2026).

   ПОВОД. РЕВИЗИЯ ГРУПИ отчиташе 2/3 при свършена работа, защото беше с три дни
   и ИЗКЛЮЧЕН прозорец — тоест три отделни отметки на седмица, а не една. През
   21–27.09 нито един от 18 обекта не е отметнал и трите дни. Поправката извади
   наяве две неща:

   ЧАСТ А — обхватът се извеждаше от това КОЯ седмица е отворена (W срещу
   текущата C), а не от избор на човека. Следствие: постоянна поправка от
   ТЕКУЩАТА седмица беше невъзможна — записваше се версия само за нея И опашка
   със СТАРОТО съдържание, тоест поправката се самоизтриваше след седем дни.
   Заковава се по ЗАЯВКИТЕ, не по екрана: кой POST/PATCH/DELETE тръгва.

   ЧАСТ Б — етикетът на прозореца описваше само ЧЕКНАТОТО състояние. Сега под
   него стои ред с реалната последица, с БРОЯ и ИМЕНАТА на избраните дни.

   Пускане: node tests/rec-edit-scope.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btnExact, fire, ok, guard, section, report, ticks } = H;

/* ── дати: котвата е сряда от текущата реална седмица ─────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
function shifted(days) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); return d; }
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = Frozen;
}
/* Понеделниците се смятат НЕЗАВИСИМО от кода под тест. */
const MON = k => isoOf(shifted(-2 + 7 * k));
const W0 = MON(0), W1 = MON(1), W_1 = MON(-1), W_OLD = MON(-6);
const dm = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7);

const ADMIN = { id: 'u-a', email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rec(over) {
  return Object.assign({
    id: 'r-1', title: 'РЕВИЗИЯ ГРУПИ', department: 'admin', task_type: 'info', description: 'база',
    target_stores: null, due_weekday: 0, due_weekdays: [0, 1, 2], due_time: '16:00', due_window: false,
    linked_module: null, report_groups: ['controlling'], attachments: null, active: true, sort_order: 3,
    created_at: shifted(-60).toISOString()
  }, over || {});
}
function ver(id, from, to, over) {
  return Object.assign({
    id: id, recurring_task_id: 'r-1', from_monday: from, to_monday: to,
    title: 'Версия ' + id, description: 'опис ' + id, due_weekday: 0, due_weekdays: [0, 1, 2],
    due_window: false, due_time: '16:00', task_type: 'info', department: 'admin',
    target_stores: null, report_groups: ['controlling'], linked_module: null
  }, over || {});
}
function freshDb(over) {
  return Object.assign({
    seq: 0, tasks: [rec()],
    periods: [{ id: 'p-1', recurring_task_id: 'r-1', from_monday: W_OLD, to_monday: null }],
    versions: []
  }, over || {});
}
function wireDb(h, db) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    const onVer = url.indexOf('/recurring_task_versions') >= 0;
    const onTasks = url.indexOf('/recurring_tasks') >= 0;
    if (m === 'GET' || (!onVer && !onTasks)) return orig.call(this, url, init);
    return orig.call(this, url, init).then(function (r) {
      if (!r.ok) return r;
      const body = init.body ? JSON.parse(init.body) : null;
      const idm = /[?&]id=eq\.([^&]+)/.exec(url);
      const list = onVer ? db.versions : db.tasks;
      if (m === 'POST') {
        const row = Object.assign({ id: (onVer ? 'v-n' : 'r-n') + (++db.seq) }, body);
        list.push(row);
        return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve('') };
      }
      if (m === 'PATCH') { list.forEach(x => { if (idm && x.id === idm[1]) Object.assign(x, body); }); return r; }
      if (m === 'DELETE') {
        const keep = list.filter(x => !(idm && x.id === idm[1]));
        if (onVer) db.versions = keep; else db.tasks = keep;
        return { ok: true, status: 204, headers: { get: () => '*/1' }, json: () => Promise.resolve(null), text: () => Promise.resolve('') };
      }
      return r;
    });
  };
}
function bulOf(w, id, k) {
  const d = shifted(7 * k), cal = {};
  w.DKEYS.forEach(x => { cal[x] = []; });
  return { id: id, week_number: w.weekNum(d), year: isoWeekYear(d), status: 'published', created_at: isoOf(d),
           content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}
function env(bulId, db) {
  const h = boot({
    modules: ['bulletin.js'],
    user: ADMIN,
    data: {
      users: [{ store_name: 'Троян' }],
      recurring_tasks: () => db.tasks,
      recurring_task_periods: () => db.periods,
      recurring_task_versions: () => db.versions,
      recurring_task_skips: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: [], task_completions: [], subtask_completions: [], task_subtasks: [],
      notification_schedules: []
    }
  });
  freezeDate(h.w);
  h.buls = [bulOf(h.w, 'b-prev', -1), bulOf(h.w, 'b-cur', 0), bulOf(h.w, 'b-next', 1)];
  h.w.bulSelectedId = bulId || 'b-cur';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = ['Троян'];
  h.w.allStoresCache = ['Троян'];
  h.w.recurringVersions = db.versions;     /* bulTaskVersions() чете това */
  h.w.recurringAll = db.tasks;
  h.w.recurringTasks = db.tasks;
  wireDb(h, db);
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 60); i++) { if (cond()) return true; await ticks(); } return cond(); }

/* ── четене на ЗАЯВКИТЕ ───────────────────────────────────────────────────── */
const verPosts = h => h.calls.post.filter(c => /recurring_task_versions/.test(c.url)).map(c => c.body);
const verPatch = h => h.calls.patch.filter(c => /recurring_task_versions/.test(c.url))
  .map(c => ({ id: (/[?&]id=eq\.([^&]+)/.exec(c.url) || [])[1], body: c.body }));
const verDel = h => h.calls.del.filter(u => /recurring_task_versions/.test(u))
  .map(u => (/[?&]id=eq\.([^&]+)/.exec(u) || [])[1]);
const postWith = (h, from, to) => verPosts(h).filter(b => b.from_monday === from &&
  (to === null ? b.to_monday === null : b.to_monday === to));

const PAY = { title: 'ПОПРАВЕНО', department: 'admin', due_weekdays: [0, 1, 2], due_window: true,
              due_time: '16:00', task_type: 'info', target_stores: null, report_groups: ['controlling'],
              linked_module: null, description: 'нов текст', due_weekday: 0 };

(async function () {

  /* ═══ ЧАСТ А ═══ */

  section('A1. scope="one", W = текущата — затваря покриващата, пише W..W и опашка');
  {
    /* Покриваща ОТВОРЕНА версия отпреди седмица: точно случаят, при който
       „само тази седмица" трябва да върне старото съдържание от W+7. */
    const db = freshDb({ versions: [ver('v-old', W_1, null)] });
    const h = env('b-cur', db);
    let r = null;
    await h.w.bulSaveRecurringContent('r-1', PAY, W0, 'one').then(x => { r = x; });
    await ticks();
    ok('записът минава', !!r && r.ok !== false, JSON.stringify(r));
    ok('покриващата се ЗАТВАРЯ на W−7',
      verPatch(h).some(p => p.id === 'v-old' && p.body.to_monday === MON(-1)),
      JSON.stringify(verPatch(h)));
    ok('пише се версия САМО за W', postWith(h, W0, W0).length === 1, JSON.stringify(verPosts(h)));
    ok('и новото съдържание е в нея', (postWith(h, W0, W0)[0] || {}).title === 'ПОПРАВЕНО');
    ok('пише се ОПАШКА от W+7 с предишното съдържание',
      postWith(h, W1, null).length === 1 && postWith(h, W1, null)[0].title === 'Версия v-old',
      JSON.stringify(postWith(h, W1, null)));
    ok('нищо не се трие', verDel(h).length === 0, JSON.stringify(verDel(h)));
  }

  section('A2. scope="forward", W = текущата — W..∞ и БЕЗ опашка (днес невъзможно)');
  {
    const db = freshDb({ versions: [ver('v-old', W_1, null)] });
    const h = env('b-cur', db);
    let r = null;
    await h.w.bulSaveRecurringContent('r-1', PAY, W0, 'forward').then(x => { r = x; });
    await ticks();
    ok('записът минава', !!r && r.ok !== false, JSON.stringify(r));
    ok('пише се ОТВОРЕНА версия от W', postWith(h, W0, null).length === 1, JSON.stringify(verPosts(h)));
    ok('покриващата се затваря на W−7',
      verPatch(h).some(p => p.id === 'v-old' && p.body.to_monday === MON(-1)));
    /* Ето това беше невъзможно: поправка от текущата седмица без опашка, която
       я изтрива след седем дни. */
    ok('НЯМА опашка от W+7', postWith(h, W1, null).filter(b => b.title === 'Версия v-old').length === 0,
      JSON.stringify(verPosts(h)));
    ok('точно ЕДИН POST', verPosts(h).length === 1, JSON.stringify(verPosts(h)));
  }

  section('A3. scope="one", W = БЪДЕЩА — еднократно изключение (днес невъзможно)');
  {
    const db = freshDb({ versions: [ver('v-old', W_1, null)] });
    const h = env('b-next', db);
    let r = null;
    await h.w.bulSaveRecurringContent('r-1', PAY, W1, 'one').then(x => { r = x; });
    await ticks();
    ok('записът минава', !!r && r.ok !== false, JSON.stringify(r));
    ok('версия САМО за W1', postWith(h, W1, W1).length === 1, JSON.stringify(verPosts(h)));
    ok('и опашка от W2 с предишното', postWith(h, MON(2), null).length === 1 &&
      postWith(h, MON(2), null)[0].title === 'Версия v-old', JSON.stringify(verPosts(h)));
    ok('покриващата се затваря на W1−7 = W0',
      verPatch(h).some(p => p.id === 'v-old' && p.body.to_monday === W0), JSON.stringify(verPatch(h)));
  }

  section('A4. scope="forward", W = БЪДЕЩА — W1..∞');
  {
    const db = freshDb({ versions: [ver('v-old', W_1, null)] });
    const h = env('b-next', db);
    await h.w.bulSaveRecurringContent('r-1', PAY, W1, 'forward');
    await ticks();
    ok('отворена версия от W1', postWith(h, W1, null).length === 1, JSON.stringify(verPosts(h)));
    ok('точно един POST', verPosts(h).length === 1, JSON.stringify(verPosts(h)));
  }

  section('A5. МИНАЛА седмица се отказва при ВСЕКИ обхват');
  {
    for (const sc of ['one', 'forward', undefined]) {
      const db = freshDb();
      const h = env('b-prev', db);
      let r = null;
      await h.w.bulSaveRecurringContent('r-1', PAY, W_1, sc).then(x => { r = x; });
      await ticks();
      ok('scope=' + String(sc) + ' → отказ', !!r && r.ok === false, JSON.stringify(r));
      ok('scope=' + String(sc) + ' → нула заявки',
        verPosts(h).length === 0 && verPatch(h).length === 0 && verDel(h).length === 0);
    }
  }

  section('A6. ЛИПСВАЩ scope пази старото поведение');
  {
    /* W === C → както преди: „само тази седмица", с опашка. */
    const db1 = freshDb({ versions: [ver('v-old', W_1, null)] });
    const h1 = env('b-cur', db1);
    await h1.w.bulSaveRecurringContent('r-1', PAY, W0);
    await ticks();
    ok('без scope при W=C → версия W..W', postWith(h1, W0, W0).length === 1, JSON.stringify(verPosts(h1)));
    ok('без scope при W=C → и опашка', postWith(h1, W1, null).length === 1);

    /* W > C → както преди: „от W нататък", без опашка. */
    const db2 = freshDb({ versions: [ver('v-old', W_1, null)] });
    const h2 = env('b-next', db2);
    await h2.w.bulSaveRecurringContent('r-1', PAY, W1);
    await ticks();
    ok('без scope при W>C → отворена версия', postWith(h2, W1, null).length === 1, JSON.stringify(verPosts(h2)));
    ok('без scope при W>C → един POST', verPosts(h2).length === 1);
  }

  section('A7. Радио бутоните в модала — по подразбиране „нататък", с ДАТИ');
  {
    const db = freshDb();
    const h = env('b-cur', db);
    if (!guard('loadBulletin()', () => h.w.loadBulletin())) return report();
    await settle(() => !!h.doc.getElementById('dept-panel-admin'));
    if (guard('openEditRecurringModal()', () => h.w.openEditRecurringModal('r-1'))) {
      const radios = Array.prototype.slice.call(h.doc.querySelectorAll('input[name="rec-scope"]'));
      ok('два радио бутона', radios.length === 2, String(radios.length));
      ok('стойностите са one и forward',
        radios.map(r => r.value).sort().join(',') === 'forward,one', radios.map(r => r.value).join(','));
      const checked = radios.filter(r => r.checked);
      ok('по подразбиране е отметнат ЕДИН', checked.length === 1);
      ok('и той е „forward"', checked.length === 1 && checked[0].value === 'forward',
        checked.map(r => r.value).join(','));
      ok('recReadScope() го чете', h.w.recReadScope() === 'forward', h.w.recReadScope());

      const note = () => (h.doc.getElementById('rec-scope-note') || {}).textContent || '';
      ok('изречението носи датата на W0 и думата „нататък"',
        note().indexOf(dm(W0)) >= 0 && note().indexOf('нататък') >= 0, note());

      /* Смяна на избора мени изречението — с ДАТИ, не общо. */
      const one = radios.find(r => r.value === 'one');
      one.checked = true; radios.find(r => r.value === 'forward').checked = false;
      fire(h.w, one, 'change');
      ok('recReadScope() вече дава „one"', h.w.recReadScope() === 'one', h.w.recReadScope());
      ok('изречението носи W0 и неделята', note().indexOf(dm(W0)) >= 0 &&
        note().indexOf(dm(isoOf(shifted(4)))) >= 0, note());
      ok('и датата, от която се ВРЪЩА старото', note().indexOf(dm(W1)) >= 0, note());
      ok('и думата „връща"', note().indexOf('връща') >= 0, note());
    }
  }

  section('A8. „Запази" подава ИЗБРАНИЯ обхват (не W срещу C)');
  {
    const db = freshDb({ versions: [ver('v-old', W_1, null)] });
    const h = env('b-cur', db);
    if (guard('loadBulletin()', () => h.w.loadBulletin())) {
      await settle(() => !!h.doc.getElementById('dept-panel-admin'));
      h.w.openEditRecurringModal('r-1');
      /* Изборът е „нататък" по подразбиране — точно поправката, която дотук
         беше невъзможна от текущата седмица. */
      const save = btnExact(h.doc, '💾 Запази');
      if (ok('бутонът „Запази" съществува', !!save)) {
        realClick(h.w, save, 'Запази');
        await ticks(); await ticks(); await ticks();
        ok('тръгва ОТВОРЕНА версия от W0', postWith(h, W0, null).length === 1, JSON.stringify(verPosts(h)));
        ok('и НЯМА опашка, която да я изтрие след седмица',
          postWith(h, W1, null).filter(b => b.title === 'Версия v-old').length === 0,
          JSON.stringify(verPosts(h)));
      }
    }
  }

  /* ═══ ЧАСТ Б ═══ */

  section('Б1. Редът под прозореца казва БРОЯ и ИМЕНАТА на дните');
  {
    const h = env('b-cur', freshDb());
    const noteOf = (days, checked) => h.w.recWindowNoteText(days, checked);

    ok('3 дни, НЕчекнато → 3 отметки с имената',
      noteOf([0, 1, 2], false) === 'Сега: 3 отметки — по една за пон, вто, сря.',
      noteOf([0, 1, 2], false));
    ok('3 дни, ЧЕКНАТО → 1 отметка със срок последния ден',
      noteOf([0, 1, 2], true) === 'Сега: 1 отметка — срок сряда, може от пон.',
      noteOf([0, 1, 2], true));
    ok('други дни → други имена',
      noteOf([3, 4], false) === 'Сега: 2 отметки — по една за чет, пет.',
      noteOf([3, 4], false));
    ok('редът НЕ зависи от подредбата на масива',
      noteOf([2, 0, 1], false) === noteOf([0, 1, 2], false), noteOf([2, 0, 1], false));

    /* Чекбоксът е disabled при <2 и >6 дни — редът пак казва какво е положението,
       вместо да изчезне (CLAUDE.md т.11). */
    ok('1 ден → назовава деня и казва защо прозорец няма смисъл',
      noteOf([1], false) === 'Сега: 1 отметка — само вторник. Прозорец няма смисъл при един ден.',
      noteOf([1], false));
    ok('7 дни → казва, че прозорец не важи',
      noteOf([0, 1, 2, 3, 4, 5, 6], false).indexOf('7 отметки') >= 0 &&
      noteOf([0, 1, 2, 3, 4, 5, 6], false).indexOf('не важи') >= 0,
      noteOf([0, 1, 2, 3, 4, 5, 6], false));
    ok('0 дни → казва „всеки ден"',
      noteOf([], false).indexOf('без избрани дни') >= 0 &&
      noteOf([], false).indexOf('ВСЕКИ ден') >= 0, noteOf([], false));
    ok('редът никога не е празен', [[], [1], [0, 1], [0, 1, 2, 3, 4, 5, 6]]
      .every(d => noteOf(d, false).length > 10 && noteOf(d, true).length > 10));

    /* Редът е верен ОТ МАРКИРОВКАТА, не чак след recWindowBindDays(). Днес двата
       модала викат bind веднага, тоест разликата не се вижда на екрана — но
       функцията е глобална и следващият викащ може да не я извика. Проверява се
       върнатият низ, а не DOM след bind. */
    const raw = (days, checked) => h.w.recWindowToggleHtml('x-win', 'x-days', checked, days);
    ok('маркировката носи реда за 3 дни, нечекнато',
      raw([0, 1, 2], false).indexOf('Сега: 3 отметки — по една за пон, вто, сря.') >= 0,
      raw([0, 1, 2], false).slice(-160));
    ok('и за 3 дни, чекнато',
      raw([0, 1, 2], true).indexOf('срок сряда, може от пон') >= 0, raw([0, 1, 2], true).slice(-160));
    ok('при 7 дни чекнатото се пренебрегва и в маркировката',
      raw([0, 1, 2, 3, 4, 5, 6], true).indexOf('не важи при цялата седмица') >= 0,
      raw([0, 1, 2, 3, 4, 5, 6], true).slice(-160));
    ok('редът е в свой контейнер с id по полето',
      raw([0, 1], false).indexOf('id="x-win-note"') >= 0, raw([0, 1], false).slice(-200));
  }

  section('Б2. Редът се преизчислява при промяна по дните И по чекбокса');
  {
    const h = env('b-cur', freshDb());
    if (guard('loadBulletin()', () => h.w.loadBulletin())) {
      await settle(() => !!h.doc.getElementById('dept-panel-admin'));
      h.w.openEditRecurringModal('r-1');
      const note = () => (h.doc.getElementById('erec-window-note') || {}).textContent || '';
      ok('при отваряне: трите дни на задачата, НЕчекнато',
        note() === 'Сега: 3 отметки — по една за пон, вто, сря.', note());

      /* Махаме вторник — през истинско събитие, което стига до контейнера. */
      const days = h.doc.getElementById('erec-weekdays');
      const cbFor = i => Array.prototype.find.call(days.querySelectorAll('input[type=checkbox]'),
        c => c.value === String(i));
      cbFor(1).checked = false;
      cbFor(1).dispatchEvent(new h.w.Event('change', { bubbles: true }));
      ok('след махането на вторник: 2 отметки, пон и сря',
        note() === 'Сега: 2 отметки — по една за пон, сря.', note());

      /* Включваме прозореца — със същия избор смисълът е съвсем друг. */
      const win = h.doc.getElementById('erec-window');
      ok('прозорецът е достъпен при 2 дни', win.disabled === false, String(win.disabled));
      win.checked = true;
      fire(h.w, win, 'change');
      ok('чекнато: 1 отметка, срок сряда, може от пон',
        note() === 'Сега: 1 отметка — срок сряда, може от пон.', note());

      /* Слизане до един ден: прозорецът се размаркира сам, редът го казва. */
      cbFor(2).checked = false;
      cbFor(2).dispatchEvent(new h.w.Event('change', { bubbles: true }));
      ok('прозорецът стана недостъпен', win.disabled === true);
      ok('и се размаркира', win.checked === false);
      ok('редът казва, че е един ден',
        note() === 'Сега: 1 отметка — само понеделник. Прозорец няма смисъл при един ден.', note());
    }
  }

  section('Б3. Същият ред и в модала за СЪЗДАВАНЕ');
  {
    const h = env('b-cur', freshDb());
    if (guard('loadBulletin()', () => h.w.loadBulletin())) {
      await settle(() => !!h.doc.getElementById('dept-panel-admin'));
      if (guard('openRecurringModal()', () => h.w.openRecurringModal('admin'))) {
        const note = () => (h.doc.getElementById('rec-window-note') || {}).textContent || '';
        ok('редът го има и при създаване', note().length > 10, note());
        ok('без избрани дни казва „всеки ден"', note().indexOf('без избрани дни') >= 0, note());
        ok('обхват НЯМА при създаване (базов ред, версия няма)',
          h.doc.querySelectorAll('input[name="rec-scope"]').length === 0);

        const days = h.doc.getElementById('rec-weekdays');
        const cbFor = i => Array.prototype.find.call(days.querySelectorAll('input[type=checkbox]'),
          c => c.value === String(i));
        [0, 1, 2].forEach(i => { cbFor(i).checked = true; });
        cbFor(2).dispatchEvent(new h.w.Event('change', { bubbles: true }));
        ok('след избор на три дни редът ги назовава',
          note() === 'Сега: 3 отметки — по една за пон, вто, сря.', note());
      }
    }
  }

  report();
})();
