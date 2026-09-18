/* БЕЗ ИЗВЕСТИЯ ЗА НЕПУБЛИКУВАН БЮЛЕТИН / БЪДЕЩ ПЕРИОД.

   Push „✅ Нова задача" (pushNewBulletinTask) тръгва САМО ако показаният
   бюлетин е публикуван (curBul.status === 'published'). За постоянна задача
   — и ако периодът ѝ вече е започнал (from_monday <= текущия понеделник).
   В чернова магазините още не виждат задачата; при публикуване ръчният
   „📰 Бюлетин публикуван" покрива всичко.

   Ръчните известия, които зависят от бюлетина, остават, но питат
   „Бюлетинът не е публикуван — изпращам?" при чернова:
     · 🔔 по реда на задача / под-задача (насрочено напомняне);
     · „📰 Бюлетин публикуван" и „📅 Днешни срокове" в менюто.
   Постоянна задача и промоция не минават през публикуване — без въпрос.

   Часовникът: петък 18.09.2026 12:00 → текущата седмица е С38 (пн 14.09),
   следващата С39 (пн 21.09).

   Темите в bulletin-notify (чернова не влиза) са в
   tests/postpone-date-notify.test.js, секции 2в / 4в / 4г.

   Пускане:  node tests/bulletin-unpublished-push.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function freezeAt(w, ms) {
  const Real = w.Date;
  w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  };
}
const NOW = new Date(2026, 8, 18, 12, 0).getTime();

function bul(week, status) {
  return { id: 'b-' + week, week_number: week, year: 2026, status: status,
           created_at: '2026-09-10T08:00:00Z',
           content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } } };
}

/* Среда с показан бюлетин. pushNewBulletinTask и pushToAll се подменят —
   броим извикванията, не мрежата: целта е решението в bulletin.js. */
function env(week, status, opts) {
  opts = opts || {};
  const h = boot({ modules: ['bulletin.js', 'push.js'], user: ADMIN, data: {},
                   confirm: opts.confirm });
  const w = h.w;
  freezeAt(w, NOW);
  const b = bul(week, status);
  w.DKEYS.forEach(k => { b.content.calendar[k] = []; });
  h.setData('bulletins', [b]);
  ['bulletin_tasks', 'recurring_tasks', 'recurring_task_periods', 'recurring_task_skips',
   'task_completions', 'task_subtasks', 'subtask_completions', 'bulletin_promotions',
   'notification_schedules', 'users'].forEach(t => h.setData(t, []));
  w.curBul = b;
  w.bulTasks = [];
  const pushes = [], alls = [];
  w.pushNewBulletinTask = function (title, stores) { pushes.push({ title, stores }); return Promise.resolve({ ok: true }); };
  w.pushToAll = function (title, msg) { alls.push({ title, msg }); return Promise.resolve({ ok: true }); };
  w.pushBulletinPublished = function (wk) { alls.push({ title: 'published:' + wk }); return Promise.resolve({ ok: true }); };
  return { h, w, doc: h.doc, pushes, alls };
}

async function addTask(E, title) {
  const { w, doc } = E;
  guard('renderBulletin() не хвърля', () => w.renderBulletin());
  guard('openTaskModalForDept() не хвърля', () => w.openTaskModalForDept('trade'));
  const t = doc.getElementById('tk-title');
  if (!ok('модалът за задача е отворен', !!t)) return false;
  t.value = title;
  guard('submitTask() не хвърля', () => w.submitTask());
  await ticks(); await ticks();
  return true;
}

async function addRecurring(E, title) {
  const { w, doc } = E;
  guard('openRecurringModal() не хвърля', () => w.openRecurringModal('trade'));
  const t = doc.getElementById('rec-title');
  if (!ok('модалът за постоянна е отворен', !!t)) return false;
  t.value = title;
  const btn = Array.from(doc.querySelectorAll('#rec-modal-ov button')).find(b => b.textContent.trim() === 'Добави');
  if (!ok('бутонът „Добави" е налице', !!btn)) return false;
  realClick(w, btn, 'Добави постоянна');
  await ticks(); await ticks(); await ticks();
  return true;
}
const posted = (E, table) => E.h.calls.post.filter(p => p.table === table);

(async function () {

  section('1. Обикновена задача в НЕПУБЛИКУВАН С39 → 0 push');
  {
    const E = env(39, 'draft');
    if (await addTask(E, 'Задача-чернова')) {
      ok('задачата е записана', posted(E, 'bulletin_tasks').length === 1);
      ok('0 push', E.pushes.length === 0, JSON.stringify(E.pushes));
    }
    E.h.close();
  }

  section('1б. Обикновена задача в НЕПУБЛИКУВАН С38 (текущата) → 0 push');
  {
    const E = env(38, 'draft');
    if (await addTask(E, 'Задача-чернова-38')) {
      ok('0 push', E.pushes.length === 0, JSON.stringify(E.pushes));
    }
    E.h.close();
  }

  section('2. Обикновена задача в ПУБЛИКУВАН С38 → push');
  {
    const E = env(38, 'published');
    if (await addTask(E, 'Задача-публикувана')) {
      ok('точно 1 push', E.pushes.length === 1, JSON.stringify(E.pushes));
      ok('със заглавието на задачата', E.pushes[0] && E.pushes[0].title === 'Задача-публикувана');
    }
    E.h.close();
  }

  section('3. Постоянна с БЪДЕЩ период (от публикуван С39) → 0 push');
  {
    const E = env(39, 'published');
    if (await addRecurring(E, 'Постоянна-бъдеща')) {
      const r = posted(E, 'recurring_tasks');
      ok('задачата е записана', r.length === 1);
      ok('с active=false (периодът още не е започнал)', r[0] && r[0].body.active === false, JSON.stringify(r[0] && r[0].body.active));
      ok('0 push', E.pushes.length === 0, JSON.stringify(E.pushes));
    }
    E.h.close();
  }

  section('3б. Постоянна в НЕПУБЛИКУВАН С38 (периодът е започнал) → 0 push');
  {
    const E = env(38, 'draft');
    if (await addRecurring(E, 'Постоянна-чернова')) {
      ok('задачата е записана', posted(E, 'recurring_tasks').length === 1);
      ok('0 push', E.pushes.length === 0, JSON.stringify(E.pushes));
    }
    E.h.close();
  }

  section('3в. Постоянна в ПУБЛИКУВАН С38 (периодът е започнал) → push');
  {
    const E = env(38, 'published');
    if (await addRecurring(E, 'Постоянна-сега')) {
      ok('точно 1 push', E.pushes.length === 1, JSON.stringify(E.pushes));
      ok('със заглавието', E.pushes[0] && E.pushes[0].title === 'Постоянна-сега');
    }
    E.h.close();
  }

  section('4. 🔔 по реда на задача в НЕПУБЛИКУВАН → confirm; „Не" → нищо');
  {
    const E = env(39, 'draft', { confirm: () => false });
    guard('openNotifyScheduleModal() не хвърля', () => E.w.openNotifyScheduleModal('task', 't-1', 'Задача'));
    const btn = Array.from(E.doc.querySelectorAll('#notify-modal-ov button')).find(b => b.textContent.indexOf('Насрочи') >= 0);
    if (ok('бутонът „Насрочи" е налице', !!btn)) {
      realClick(E.w, btn, 'Насрочи');
      await ticks();
      ok('confirm „Бюлетинът не е публикуван — изпращам?"',
        E.h.calls.confirm.indexOf('Бюлетинът не е публикуван — изпращам?') >= 0, JSON.stringify(E.h.calls.confirm));
      ok('при „Не" — нищо не се насрочва', posted(E, 'notification_schedules').length === 0);
    }
    E.h.close();
  }
  {
    const E = env(39, 'draft', { confirm: () => true });
    E.w.openNotifyScheduleModal('subtask', 's-1', 'Под-задача');
    realClick(E.w, Array.from(E.doc.querySelectorAll('#notify-modal-ov button')).find(b => b.textContent.indexOf('Насрочи') >= 0), 'Насрочи');
    await ticks();
    ok('под-задача: confirm и при „Да" се насрочва',
      E.h.calls.confirm.length === 1 && posted(E, 'notification_schedules').length === 1);
    E.h.close();
  }
  {
    const E = env(38, 'published');
    E.w.openNotifyScheduleModal('task', 't-1', 'Задача');
    realClick(E.w, Array.from(E.doc.querySelectorAll('#notify-modal-ov button')).find(b => b.textContent.indexOf('Насрочи') >= 0), 'Насрочи');
    await ticks();
    ok('публикуван: без confirm, насрочва се', E.h.calls.confirm.length === 0 && posted(E, 'notification_schedules').length === 1,
      JSON.stringify(E.h.calls.confirm));
    E.h.close();
  }
  {
    const E = env(39, 'draft', { confirm: () => false });
    E.w.openNotifyScheduleModal('recurring_task', 'r-1', 'Постоянна');
    realClick(E.w, Array.from(E.doc.querySelectorAll('#notify-modal-ov button')).find(b => b.textContent.indexOf('Насрочи') >= 0), 'Насрочи');
    await ticks();
    ok('постоянна задача в чернова: без confirm, насрочва се',
      E.h.calls.confirm.length === 0 && posted(E, 'notification_schedules').length === 1);
    E.h.close();
  }

  section('5. Меню „🔔 Нотификации" при НЕПУБЛИКУВАН');
  {
    const E = env(39, 'draft', { confirm: () => false });
    E.w.renderBulletin();
    const html = E.w.pushMenuHtml();
    const holder = E.doc.createElement('div'); holder.innerHTML = html; E.doc.body.appendChild(holder);
    const pub = Array.from(holder.querySelectorAll('button')).find(b => b.textContent.indexOf('Изпрати до всички') >= 0);
    if (ok('бутонът „📰 … Изпрати до всички" е налице', !!pub)) {
      realClick(E.w, pub, '📰 Бюлетин публикуван');
      await ticks();
      ok('📰: confirm при чернова', E.h.calls.confirm.indexOf('Бюлетинът не е публикуван — изпращам?') >= 0);
      ok('📰: при „Не" — нищо не тръгва', E.alls.length === 0, JSON.stringify(E.alls));
    }
    E.h.calls.confirm.length = 0;
    guard('sendDailyDeadlinesNotification() не хвърля', () => E.w.sendDailyDeadlinesNotification());
    await ticks();
    ok('📅: confirm при чернова', E.h.calls.confirm.indexOf('Бюлетинът не е публикуван — изпращам?') >= 0);
    ok('📅: при „Не" — не се събират срокове (нула заявки към task_subtasks)',
      !E.h.calls.get.some(u => /task_subtasks\?due_date=/.test(u)));
    E.h.close();
  }
  {
    const E = env(39, 'draft', { confirm: () => true });
    const holder = E.doc.createElement('div'); holder.innerHTML = E.w.pushMenuHtml(); E.doc.body.appendChild(holder);
    realClick(E.w, Array.from(holder.querySelectorAll('button')).find(b => b.textContent.indexOf('Изпрати до всички') >= 0), '📰 (Да)');
    await ticks();
    ok('📰: при „Да" се праща', E.alls.length === 1 && E.alls[0].title === 'published:39', JSON.stringify(E.alls));
    E.h.close();
  }
  {
    const E = env(38, 'published');
    const holder = E.doc.createElement('div'); holder.innerHTML = E.w.pushMenuHtml(); E.doc.body.appendChild(holder);
    realClick(E.w, Array.from(holder.querySelectorAll('button')).find(b => b.textContent.indexOf('Изпрати до всички') >= 0), '📰 публикуван');
    await ticks();
    ok('📰 при публикуван: без confirm, праща се', E.h.calls.confirm.length === 0 && E.alls.length === 1);
    E.h.close();
  }

  section('6. Меню „Имейл" → „📤 Изпрати до всички магазини" (седмичен дайджест)');
  {
    const E = env(39, 'draft', { confirm: () => false });
    const digests = [];
    E.w.sendWeeklyDigest = function (b) { digests.push(b && b.week_number); };
    const holder = E.doc.createElement('div'); holder.innerHTML = E.w.emailMenuHtml(); E.doc.body.appendChild(holder);
    const btn = Array.from(holder.querySelectorAll('button')).find(b => b.textContent.indexOf('Изпрати до всички магазини') >= 0);
    if (ok('бутонът е налице', !!btn)) {
      realClick(E.w, btn, 'Дайджест (чернова, Не)');
      await ticks();
      ok('чернова: confirm', E.h.calls.confirm.indexOf('Бюлетинът не е публикуван — изпращам?') >= 0);
      ok('при „Не" — дайджестът не тръгва', digests.length === 0, JSON.stringify(digests));
    }
    E.h.close();
  }
  {
    const E = env(38, 'published');
    const digests = [];
    E.w.sendWeeklyDigest = function (b) { digests.push(b && b.week_number); };
    const holder = E.doc.createElement('div'); holder.innerHTML = E.w.emailMenuHtml(); E.doc.body.appendChild(holder);
    realClick(E.w, Array.from(holder.querySelectorAll('button')).find(b => b.textContent.indexOf('Изпрати до всички магазини') >= 0), 'Дайджест (публикуван)');
    await ticks();
    ok('публикуван: без confirm, дайджестът тръгва', E.h.calls.confirm.length === 0 && digests.length === 1 && digests[0] === 38,
      JSON.stringify({ c: E.h.calls.confirm, d: digests }));
    E.h.close();
  }

  report();
})();
