/* Администрация → „🔔 Известия" — теми, матрица тема×група, изключения.

   Екранът само ЗАПИСВА в notification_topics / notification_matrix /
   notification_overrides. Нищо не се праща от браузъра — кронът чете тези
   таблици и вика bulletin-notify (CLAUDE.md т.14).

   Тежестта на теста пада върху три неща, които мълчат, ако са сгрешени:
     · „последно тръгнало" при NULL — спряна тема изглежда като работеща;
     · канал „—" трябва да ТРИЕ реда, не да пише channel:'none';
     · клетка без ред в базата трябва да СЪЗДАВА (POST), не да пача.
   За трите има изричен анти-тавтологичен контрол: доказва се, че същата
   проверка пада срещу обратното поведение.

   Пускане: node tests/admin-notifications.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, guard, section, report, ticks } = H;

const ADMIN   = { id: 'u-adm', email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const NOT_ADMIN = { id: 'u-acc', email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: 'Централен офис' };

/* Локален ISO стамп — България е UTC+2/+3, затова НЕ toISOString(). */
function localStamp(dayShift, hh, mm) {
  const d = new Date();
  d.setDate(d.getDate() + dayShift);
  const p = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(hh) + ':' + p(mm) + ':00';
}

const TOPICS = [
  /* делници + час, тръгвала е днес, чист статус */
  { key: 'overdue_tasks', label: 'Просрочени задачи', description: 'Неотметнатите след срока.',
    schedule_type: 'daily', weekdays: [1, 2, 3, 4, 5], day_of_week: null, scheduled_time: '08:15:00',
    active: true, test_email: null, last_run_at: localStamp(0, 8, 15), last_recipients: 7,
    last_status: 'ok: 7 писма, 0 неуспешни, 1 реда', sort_order: 10 },
  /* конкретен ден, НИКОГА не е тръгвала — това е случаят, който мълчи */
  { key: 'weekly_digest', label: 'Задачите за седмицата', description: null,
    schedule_type: 'weekly', weekdays: null, day_of_week: 'mon', scheduled_time: '07:00:00',
    active: false, test_email: null, last_run_at: null, last_recipients: null,
    last_status: null, sort_order: 20 },
  /* всеки ден, тестов режим, паднала със ГРЕШКА */
  { key: 'promo_expiring', label: 'Изтичащи промоции', description: 'Промоции, които свършват.',
    schedule_type: 'daily', weekdays: [1, 2, 3, 4, 5, 6, 7], day_of_week: null, scheduled_time: '08:30:00',
    active: true, test_email: 'ten.tenev@temax.bg', last_run_at: localStamp(-1, 8, 30), last_recipients: 0,
    last_status: 'ГРЕШКА: resend върна 401', sort_order: 25 },
  { key: 'today_deadlines', label: 'Напомняне до обекта', description: null,
    schedule_type: 'daily', weekdays: [1, 2, 3, 4, 5, 6, 7], day_of_week: null, scheduled_time: '08:00:00',
    active: true, test_email: null, last_run_at: null, last_recipients: null,
    last_status: null, sort_order: 30 }
];

/* Клетките нарочно НЕ покриват всички групи: overdue_tasks/co и
   overdue_tasks/owner остават празни — тях ги проверява точка 7. */
const MATRIX = [
  { topic_key: 'overdue_tasks', group_key: 'controlling', channel: 'both',  scope: 'all' },
  { topic_key: 'overdue_tasks', group_key: 'regional',    channel: 'email', scope: 'own_stores' },
  { topic_key: 'promo_expiring', group_key: 'store',      channel: 'push',  scope: 'all' }
];

const OVERRIDES = [
  { id: 'ovr-1', user_email: 'ten.tenev@temax.bg', topic_key: 'overdue_tasks',
    mode: 'include', channel: 'both', scope: 'all', note: 'Наблюдава всичко.' }
];

const USERS = [
  { id: 'u-adm', email: 'admin@temax.bg', display_name: 'Админ', store_name: 'Централен офис',
    role: 'admin', active: true, assigned_stores: null, oborot_report: null,
    is_regional: false, notify_groups: ['co'] },
  { id: 'u-ten', email: 'ten.tenev@temax.bg', display_name: 'Тенчо Тенев', store_name: 'Централен офис',
    role: 'admin', active: true, assigned_stores: null, oborot_report: 'all',
    is_regional: true, notify_groups: ['controlling', 'regional'] },
  /* is_regional=true, но БЕЗ 'regional' в notify_groups → ⚠️ на реда */
  { id: 'u-mis', email: 'razminat@temax.bg', display_name: 'Разминат', store_name: 'Централен офис',
    role: 'accounting', active: true, assigned_stores: ['Троян'], oborot_report: null,
    is_regional: true, notify_groups: ['co'] }
];

function usersFixture(list) {
  return function (url) {
    const m = String(url).match(/id=eq\.([^&]+)/);
    if (!m) return list;
    const id = decodeURIComponent(m[1]);
    return list.filter(u => u.id === id);
  };
}

function env(over) {
  over = over || {};
  return boot({
    modules: ['admin.js'],
    user: over.user || ADMIN,
    data: Object.assign({
      notification_topics:    over.topics    !== undefined ? over.topics    : TOPICS,
      notification_matrix:    over.matrix    !== undefined ? over.matrix    : MATRIX,
      notification_overrides: over.overrides !== undefined ? over.overrides : OVERRIDES,
      users: usersFixture(over.users !== undefined ? over.users : USERS),
      stores: []
    }, over.data || {}),
    fail: over.fail,
    confirm: over.confirm
  });
}

async function loaded(over) {
  const h = env(over);
  h.w.loadNotificationsAdmin();
  await ticks();
  return h;
}

/* Ред от таблицата с темите, намерен по ЕТИКЕТА на темата. */
function topicRow(doc, label) {
  const trs = Array.prototype.slice.call(doc.querySelectorAll('#notif-topics-body tbody tr'));
  return trs.find(tr => (tr.cells[0].textContent || '').indexOf(label) >= 0) || null;
}
const TOPIC_COL = { name: 0, schedule: 1, active: 2, lastRun: 3, recipients: 4, status: 5 };

/* Клетка от матрицата. Колоните са в реда на NOTIF_GROUPS:
   0=ЦО, 1=Контролинг, 2=Регионален, 3=Собственик, 4=Магазин. */
const GROUP_COL = { co: 0, controlling: 1, regional: 2, owner: 3, store: 4 };
function matrixCell(doc, label, group) {
  const trs = Array.prototype.slice.call(doc.querySelectorAll('#notif-matrix-body tbody tr'));
  const tr = trs.find(t => (t.cells[0].textContent || '').trim() === label);
  return tr ? tr.cells[1 + GROUP_COL[group]] : null;
}
const selectsIn = td => Array.prototype.slice.call(td.querySelectorAll('select'));

const matrixPosts   = h => h.calls.post.filter(p => p.table === 'notification_matrix');
const matrixPatches = h => h.calls.patch.filter(p => p.table === 'notification_matrix');
const matrixDels    = h => h.calls.del.filter(u => u.indexOf('notification_matrix') >= 0);
const ovrPosts      = h => h.calls.post.filter(p => p.table === 'notification_overrides');

(async function run() {

  /* ═══ 1. Права ═══════════════════════════════════════════════════════ */
  section('1. Секцията е само за admin');
  {
    const h = env({ user: NOT_ADMIN });
    if (guard('loadNotificationsAdmin() не хвърля при друга роля', () => h.w.loadNotificationsAdmin())) {
      await ticks();
      const card = h.doc.getElementById('notif-admin-card');
      ok('картата съществува в index.html', !!card);
      ok('картата е скрита', !!card && card.style.display === 'none', card ? card.style.display : '—');
      ok('базата НЕ е питана за темите',
        !h.calls.get.some(u => u.indexOf('notification_topics') >= 0),
        h.calls.get.join('\n'));
      ok('базата НЕ е питана за матрицата',
        !h.calls.get.some(u => u.indexOf('notification_matrix') >= 0));
      ok('базата НЕ е питана за изключенията',
        !h.calls.get.some(u => u.indexOf('notification_overrides') >= 0));
      ok('нищо не е рендирано — индикаторът стои',
        h.doc.getElementById('notif-topics-body').textContent.indexOf('Зареждане') >= 0);
      ok('няма редове с теми',
        h.doc.querySelectorAll('#notif-topics-body tbody tr').length === 0);
    }
    h.close();

    /* Контрол: същите проверки срещу admin трябва да дадат обратното —
       иначе „не се рендира" би минавало и защото кодът изобщо не работи. */
    const a = await loaded();
    const card = a.doc.getElementById('notif-admin-card');
    ok('КОНТРОЛ: при admin картата НЕ е скрита', card.style.display !== 'none', card.style.display);
    ok('КОНТРОЛ: при admin темите се четат',
      a.calls.get.some(u => u.indexOf('notification_topics') >= 0));
    ok('КОНТРОЛ: при admin има редове',
      a.doc.querySelectorAll('#notif-topics-body tbody tr').length === TOPICS.length);
    ok('users се чете с изричен select=, не select=*',
      a.calls.get.some(u => u.indexOf('/users') >= 0 && u.indexOf('select=') >= 0 && u.indexOf('select=*') < 0));
    a.close();
  }

  /* ═══ 2. last_run_at = NULL ═════════════════════════════════════════ */
  section('2. „Последно тръгнало" — NULL е „никога", не празно');
  {
    const h = await loaded();
    const never = topicRow(h.doc, 'Задачите за седмицата');
    const ran   = topicRow(h.doc, 'Просрочени задачи');
    if (ok('двата реда се рендират', !!never && !!ran)) {
      const cellNever = never.cells[TOPIC_COL.lastRun];
      const cellRan   = ran.cells[TOPIC_COL.lastRun];
      ok('NULL показва „никога"', cellNever.textContent.trim() === 'никога', cellNever.textContent);
      ok('клетката НЕ е празна', cellNever.textContent.trim().length > 0);
      ok('и е приглушена', (cellNever.getAttribute('style') || '').indexOf('#94a3b8') >= 0,
        cellNever.getAttribute('style'));
      ok('днешното тръгване се чете като „днес HH:MM"',
        cellRan.textContent.trim() === 'днес 08:15', cellRan.textContent);
      ok('вчерашното — като „вчера HH:MM"',
        topicRow(h.doc, 'Изтичащи промоции').cells[TOPIC_COL.lastRun].textContent.trim() === 'вчера 08:30',
        topicRow(h.doc, 'Изтичащи промоции').cells[TOPIC_COL.lastRun].textContent);
      /* „До колко души" при NULL също не бива да е празно. */
      ok('броят получатели при NULL е тире',
        never.cells[TOPIC_COL.recipients].textContent.trim() === '—',
        never.cells[TOPIC_COL.recipients].textContent);
      ok('а при тръгнала тема е числото',
        ran.cells[TOPIC_COL.recipients].textContent.trim() === '7',
        ran.cells[TOPIC_COL.recipients].textContent);
    }

    /* Анти-тавтология: „никога" не е дума, която стои навсякъде в таблицата.
       Появява се точно веднъж — за единствената тема с last_run_at = NULL,
       която присъства във фикстурата. */
    const tbl = h.doc.getElementById('notif-topics-body').textContent;
    const hits = tbl.split('никога').length - 1;
    const nulls = TOPICS.filter(t => t.last_run_at === null).length;
    ok('КОНТРОЛ: „никога" се среща точно толкова пъти, колкото са NULL-ите',
      hits === nulls, 'намерени ' + hits + ', NULL-и ' + nulls);
    ok('КОНТРОЛ: редът с реална дата НЕ съдържа „никога"',
      ran.cells[TOPIC_COL.lastRun].textContent.indexOf('никога') < 0);
    ok('КОНТРОЛ: самата функция различава двата случая',
      h.w.notifLastRunText(null) === 'никога' &&
      h.w.notifLastRunText(localStamp(0, 8, 15)) !== 'никога',
      h.w.notifLastRunText(localStamp(0, 8, 15)));
    h.close();
  }

  /* ═══ 3. Тестов режим ═══════════════════════════════════════════════ */
  section('3. Бадж „ТЕСТОВ РЕЖИМ" при попълнен test_email');
  {
    const h = await loaded();
    const promo = topicRow(h.doc, 'Изтичащи промоции');
    const plain = topicRow(h.doc, 'Просрочени задачи');
    if (ok('редовете се рендират', !!promo && !!plain)) {
      const nameCell = promo.cells[TOPIC_COL.name];
      ok('баджът е до името', nameCell.textContent.indexOf('ТЕСТОВ РЕЖИМ') >= 0, nameCell.textContent);
      ok('баджът носи и адреса', nameCell.textContent.indexOf('ten.tenev@temax.bg') >= 0);
      ok('тема без test_email НЯМА бадж',
        plain.cells[TOPIC_COL.name].textContent.indexOf('ТЕСТОВ РЕЖИМ') < 0,
        plain.cells[TOPIC_COL.name].textContent);
      ok('баджът се вижда и в модала като попълнено поле',
        (function () {
          h.w.openNotifTopicModal('promo_expiring');
          const el = h.doc.getElementById('ntf-test-email');
          const val = el ? el.value : null;
          h.w.closeNotifTopicModal();
          return val === 'ten.tenev@temax.bg';
        })());
    }
    h.close();
  }

  /* ═══ 4. ГРЕШКА оцветява реда ═══════════════════════════════════════ */
  section('4. last_status „ГРЕШКА…" оцветява реда');
  {
    const h = await loaded();
    const bad  = topicRow(h.doc, 'Изтичащи промоции');
    const good = topicRow(h.doc, 'Просрочени задачи');
    if (ok('редовете се рендират', !!bad && !!good)) {
      ok('редът с ГРЕШКА има фон', (bad.getAttribute('style') || '').indexOf('#fef2f2') >= 0,
        bad.getAttribute('style'));
      ok('редът с чист статус НЯМА фон', !(good.getAttribute('style') || '').match(/#fef2f2/),
        good.getAttribute('style'));
      ok('статусът се показва както е в базата',
        bad.cells[TOPIC_COL.status].textContent.indexOf('ГРЕШКА: resend върна 401') >= 0,
        bad.cells[TOPIC_COL.status].textContent);
      ok('и чистият статус се показва както е в базата',
        good.cells[TOPIC_COL.status].textContent.indexOf('ok: 7 писма') >= 0);
      ok('липсващ статус е тире, не празно',
        topicRow(h.doc, 'Задачите за седмицата').cells[TOPIC_COL.status].textContent.trim() === '—');
      /* „ГРЕШКА" се разпознава само в НАЧАЛОТО — статус, който само споменава
         думата, не бива да боядисва реда. */
      ok('разпознава се само префиксът',
        h.w.notifStatusIsError('ГРЕШКА: нещо') === true &&
        h.w.notifStatusIsError('ok: 0 ГРЕШКА не е тук') === false);
    }
    h.close();
  }

  /* ═══ 5. Четимо разписание ══════════════════════════════════════════ */
  section('5. Разписанието се изписва четимо');
  {
    const h = await loaded();
    const txt = (label) => topicRow(h.doc, label).cells[TOPIC_COL.schedule].textContent.trim();
    ok('делници → „всеки делник 08:15"', txt('Просрочени задачи') === 'всеки делник 08:15', txt('Просрочени задачи'));
    ok('конкретен ден → „понеделник 07:00"', txt('Задачите за седмицата') === 'понеделник 07:00', txt('Задачите за седмицата'));
    ok('всеки ден → „всеки ден 08:30"', txt('Изтичащи промоции') === 'всеки ден 08:30', txt('Изтичащи промоции'));
    /* Суровият масив не бива да изтича в интерфейса. */
    const all = h.doc.getElementById('notif-topics-body').textContent;
    ok('никъде не се вижда суровият масив', all.indexOf('[1,2,3,4,5]') < 0 && all.indexOf('{1,2') < 0);
    ok('нито суровият ключ на деня', all.indexOf('mon') < 0);
    /* Останалите случаи — през самата функция. */
    ok('произволен набор дни се изброява',
      h.w.notifScheduleText({ schedule_type: 'daily', weekdays: [1, 3, 5], scheduled_time: '09:00:00' }) === 'пон, ср, пет 09:00',
      h.w.notifScheduleText({ schedule_type: 'daily', weekdays: [1, 3, 5], scheduled_time: '09:00:00' }));
    ok('ръчната тема го казва', h.w.notifScheduleText({ schedule_type: 'manual' }) === 'само ръчно');
    ok('текстовият литерал от огледалото също се разчита',
      h.w.notifScheduleText({ schedule_type: 'daily', weekdays: '{1,2,3,4,5}', scheduled_time: '08:15:00' }) === 'всеки делник 08:15');
    h.close();
  }

  /* ═══ 6. Канал „—" трие реда ════════════════════════════════════════ */
  section('6. Избор на канал „—" ТРИЕ реда, не пише channel:none');
  {
    const h = await loaded();
    const td = matrixCell(h.doc, 'Просрочени задачи', 'controlling');
    if (ok('клетката с ред в базата съществува', !!td)) {
      const chan = selectsIn(td)[0];
      ok('каналът е зареден от базата', chan.value === 'both', chan.value);
      chan.value = 'none';
      fire(h.w, chan, 'change');
      await ticks();

      const dels = matrixDels(h);
      ok('тръгнал е DELETE', dels.length === 1, dels.join('\n'));
      ok('DELETE-ът сочи точно тази клетка',
        dels[0].indexOf('topic_key=eq.overdue_tasks') >= 0 &&
        dels[0].indexOf('group_key=eq.controlling') >= 0, dels[0]);
      ok('НЕ е тръгнал PATCH', matrixPatches(h).length === 0,
        JSON.stringify(matrixPatches(h).map(p => p.body)));
      ok('НЕ е тръгнал POST', matrixPosts(h).length === 0);
      ok('никъде не е записано channel:none',
        !h.calls.post.concat(h.calls.patch).some(r => r.body && r.body.channel === 'none'),
        JSON.stringify(h.calls.post.concat(h.calls.patch).map(r => r.body)));
      ok('клетката се пречертава като празна',
        selectsIn(matrixCell(h.doc, 'Просрочени задачи', 'controlling')).length === 1,
        'селекти: ' + selectsIn(matrixCell(h.doc, 'Просрочени задачи', 'controlling')).length);
      ok('и показва „—" за обхвата',
        matrixCell(h.doc, 'Просрочени задачи', 'controlling').textContent.indexOf('—') >= 0);
    }
    h.close();
  }
  {
    /* Анти-тавтология: „няма PATCH" е безсмислено, ако този път изобщо не
       може да произведе PATCH. Същата клетка, същият клик — но с реален
       канал — трябва да даде PATCH и НУЛА DELETE-ове. */
    const h = await loaded();
    const chan = selectsIn(matrixCell(h.doc, 'Просрочени задачи', 'controlling'))[0];
    chan.value = 'email';
    fire(h.w, chan, 'change');
    await ticks();
    ok('КОНТРОЛ: реален канал дава PATCH', matrixPatches(h).length === 1,
      JSON.stringify(matrixPatches(h).map(p => p.body)));
    ok('КОНТРОЛ: с новата стойност', matrixPatches(h)[0].body.channel === 'email');
    ok('КОНТРОЛ: и НУЛА DELETE-ове', matrixDels(h).length === 0, matrixDels(h).join('\n'));
    h.close();
  }

  /* ═══ 7. Празна клетка ══════════════════════════════════════════════ */
  section('7. Клетка без ред показва „—" и първият избор я СЪЗДАВА');
  {
    const h = await loaded();
    const td = matrixCell(h.doc, 'Просрочени задачи', 'co');
    if (ok('празната клетка съществува', !!td)) {
      ok('показва „—"', td.textContent.indexOf('—') >= 0, td.textContent);
      ok('няма избор за обхват, докато няма ред', selectsIn(td).length === 1,
        'селекти: ' + selectsIn(td).length);
      ok('каналът стои на „—"', selectsIn(td)[0].value === 'none', selectsIn(td)[0].value);

      const chan = selectsIn(td)[0];
      chan.value = 'email';
      fire(h.w, chan, 'change');
      await ticks();

      const posts = matrixPosts(h);
      ok('тръгнал е POST', posts.length === 1, JSON.stringify(posts.map(p => p.body)));
      ok('НЕ е тръгнал PATCH', matrixPatches(h).length === 0,
        JSON.stringify(matrixPatches(h).map(p => p.body)));
      ok('НЕ е тръгнал DELETE', matrixDels(h).length === 0);
      if (posts.length) {
        const b = posts[0].body;
        ok('POST-ът носи двата ключа', b.topic_key === 'overdue_tasks' && b.group_key === 'co',
          JSON.stringify(b));
        ok('и канала', b.channel === 'email', JSON.stringify(b));
        ok('обхватът по подразбиране е „all", не празно', b.scope === 'all', JSON.stringify(b));
      }
      const after = matrixCell(h.doc, 'Просрочени задачи', 'co');
      ok('след записа се появява и изборът за обхват', selectsIn(after).length === 2,
        'селекти: ' + selectsIn(after).length);
    }
    h.close();
  }
  {
    /* Анти-тавтология: клетка, която ВЕЧЕ има ред, не бива да дава POST —
       иначе „POST при първи избор" минава и срещу код, който винаги пости
       и трупа дубликати. */
    const h = await loaded();
    const td = matrixCell(h.doc, 'Просрочени задачи', 'regional');
    ok('КОНТРОЛ: пълната клетка НЕ показва „—" за обхвата', selectsIn(td).length === 2,
      'селекти: ' + selectsIn(td).length);
    const chan = selectsIn(td)[0];
    chan.value = 'both';
    fire(h.w, chan, 'change');
    await ticks();
    ok('КОНТРОЛ: съществуващата клетка дава PATCH, не POST',
      matrixPatches(h).length === 1 && matrixPosts(h).length === 0,
      'patch=' + matrixPatches(h).length + ' post=' + matrixPosts(h).length);

    /* И обхватът се пише отделно, на същия ред. */
    const scope = selectsIn(matrixCell(h.doc, 'Просрочени задачи', 'regional'))[1];
    scope.value = 'all';
    fire(h.w, scope, 'change');
    await ticks();
    ok('КОНТРОЛ: смяната на обхват също е PATCH', matrixPatches(h).length === 2);
    ok('КОНТРОЛ: с новата стойност', matrixPatches(h)[1].body.scope === 'all',
      JSON.stringify(matrixPatches(h)[1].body));

    /* own_tasks няма смисъл за група „Магазин" — не се предлага изобщо. */
    const storeTd = matrixCell(h.doc, 'Изтичащи промоции', 'store');
    const opts = Array.prototype.slice.call(selectsIn(storeTd)[1].querySelectorAll('option')).map(o => o.value);
    ok('за група „Магазин" няма обхват „своите задачи"', opts.indexOf('own_tasks') < 0, opts.join(','));
    const coTd = matrixCell(h.doc, 'Просрочени задачи', 'controlling');
    const coOpts = Array.prototype.slice.call(selectsIn(coTd)[1].querySelectorAll('option')).map(o => o.value);
    ok('КОНТРОЛ: за другите групи го има', coOpts.indexOf('own_tasks') >= 0, coOpts.join(','));
    h.close();
  }

  /* ═══ 8. Дублирано изключение ═══════════════════════════════════════ */
  section('8. Второ изключение за същия човек и тема не се праща');
  {
    const h = await loaded();
    ok('съществуващото изключение се вижда',
      h.doc.getElementById('notif-overrides-body').textContent.indexOf('ten.tenev@temax.bg') >= 0);
    if (guard('модалът се отваря', () => h.w.openNotifOverrideModal())) {
      h.doc.getElementById('ntf-ovr-user').value = 'ten.tenev@temax.bg';
      h.doc.getElementById('ntf-ovr-topic').value = 'overdue_tasks';
      const save = btn(h.doc.getElementById('notif-ovr-modal-ov'), 'Запази');
      if (ok('бутонът „Запази" съществува', !!save)) {
        realClick(h.w, save);
        await ticks();
        ok('НЕ е тръгнал POST', ovrPosts(h).length === 0,
          JSON.stringify(ovrPosts(h).map(p => p.body)));
        const last = h.calls.toast[h.calls.toast.length - 1] || '';
        ok('казано е на човека ПРЕДИ заявката', last.indexOf('вече има изключение') >= 0, last);
        ok('съобщението назовава човека', last.indexOf('ten.tenev@temax.bg') >= 0, last);
        ok('модалът остава отворен, за да се поправи изборът',
          !!h.doc.getElementById('notif-ovr-modal-ov'));
      }
    }
    h.close();
  }
  {
    /* Анти-тавтология: същият модал, същият клик, но СВОБОДНА комбинация —
       трябва да произведе POST. Иначе „няма POST" би минавало и защото
       бутонът изобщо не работи. */
    const h = await loaded();
    h.w.openNotifOverrideModal();
    h.doc.getElementById('ntf-ovr-user').value = 'ten.tenev@temax.bg';
    h.doc.getElementById('ntf-ovr-topic').value = 'promo_expiring';
    h.doc.getElementById('ntf-ovr-note').value = 'по изключение';
    realClick(h.w, btn(h.doc.getElementById('notif-ovr-modal-ov'), 'Запази'));
    await ticks();
    ok('КОНТРОЛ: свободната комбинация дава POST', ovrPosts(h).length === 1,
      JSON.stringify(ovrPosts(h).map(p => p.body)));
    if (ovrPosts(h).length) {
      const b = ovrPosts(h)[0].body;
      ok('КОНТРОЛ: с верните ключове',
        b.user_email === 'ten.tenev@temax.bg' && b.topic_key === 'promo_expiring', JSON.stringify(b));
      ok('КОНТРОЛ: режимът по подразбиране е include', b.mode === 'include', JSON.stringify(b));
      ok('КОНТРОЛ: бележката влиза', b.note === 'по изключение', JSON.stringify(b));
    }
    ok('КОНТРОЛ: модалът се затваря при успех', !h.doc.getElementById('notif-ovr-modal-ov'));
    h.close();
  }
  {
    /* „изключва" не носи канал и обхват — пишат се NULL, не празен низ:
       колоните са nullable, а '' не значи нищо за edge функцията. */
    const h = await loaded();
    h.w.openNotifOverrideModal();
    h.doc.getElementById('ntf-ovr-user').value = 'admin@temax.bg';
    h.doc.getElementById('ntf-ovr-topic').value = 'overdue_tasks';
    const mode = h.doc.getElementById('ntf-ovr-mode');
    mode.value = 'exclude';
    fire(h.w, mode, 'change');
    realClick(h.w, btn(h.doc.getElementById('notif-ovr-modal-ov'), 'Запази'));
    await ticks();
    if (ok('POST-ът тръгва', ovrPosts(h).length === 1)) {
      const b = ovrPosts(h)[0].body;
      ok('mode=exclude', b.mode === 'exclude', JSON.stringify(b));
      ok('канал = NULL, не празен низ', b.channel === null, JSON.stringify(b));
      ok('обхват = NULL, не празен низ', b.scope === null, JSON.stringify(b));
    }
    h.close();
  }

  /* ═══ 9. Превключвателят записва веднага ════════════════════════════ */
  section('9. „Включена" записва веднага');
  {
    const h = await loaded();
    const row = topicRow(h.doc, 'Задачите за седмицата');
    const cb = row.cells[TOPIC_COL.active].querySelector('input[type="checkbox"]');
    if (ok('превключвателят съществува', !!cb)) {
      ok('спряната тема е с празна отметка', cb.checked === false);
      cb.checked = true;
      fire(h.w, cb, 'change');
      await ticks();
      const p = h.calls.patch.filter(x => x.table === 'notification_topics');
      ok('тръгнал е PATCH веднага', p.length === 1, JSON.stringify(p.map(x => x.body)));
      ok('пише се само active', p.length === 1 && Object.keys(p[0].body).join(',') === 'active',
        p.length ? Object.keys(p[0].body).join(',') : '—');
      ok('със стойност true', p.length === 1 && p[0].body.active === true);
      ok('филтърът сочи темата', p.length === 1 && p[0].url.indexOf('key=eq.weekly_digest') >= 0, p[0].url);
      ok('редът се пречертава като включен',
        topicRow(h.doc, 'Задачите за седмицата').cells[TOPIC_COL.active].textContent.indexOf('вкл.') >= 0);
      ok('и е записан одит',
        h.calls.post.some(x => x.table === 'audit_log' && x.body.event === 'notif_topic_active_changed'));
      /* Включването НЕ пита — то връща нормалното състояние и не крие нищо. */
      ok('включването минава без потвърждение', h.calls.confirm.length === 0,
        h.calls.confirm.join(' | '));
    }
    h.close();
  }
  {
    /* Спирането пита, защото е тихо: известията просто спират и това се
       забелязва чак когато нещо не е дошло. Отказът не бива да остави
       екрана да показва спряно, докато базата е включено. */
    const h = await loaded({ confirm: false });
    const cb = topicRow(h.doc, 'Просрочени задачи').cells[TOPIC_COL.active].querySelector('input');
    ok('темата е включена в базата', cb.checked === true);
    cb.checked = false;
    fire(h.w, cb, 'change');
    await ticks();
    ok('питано е', h.calls.confirm.length === 1, h.calls.confirm.join(' | '));
    ok('въпросът назовава темата',
      (h.calls.confirm[0] || '').indexOf('Просрочени задачи') >= 0, h.calls.confirm[0]);
    ok('и казва последицата',
      (h.calls.confirm[0] || '').indexOf('няма да тръгват') >= 0, h.calls.confirm[0]);
    ok('при отказ НЕ тръгва PATCH',
      h.calls.patch.filter(x => x.table === 'notification_topics').length === 0,
      JSON.stringify(h.calls.patch.map(x => x.body)));
    ok('при отказ НЕ се пише одит',
      !h.calls.post.some(x => x.table === 'audit_log' && x.body.event === 'notif_topic_active_changed'));
    const back = topicRow(h.doc, 'Просрочени задачи').cells[TOPIC_COL.active].querySelector('input');
    ok('отметката се връща сложена', back.checked === true, 'checked=' + back.checked);
    ok('и редът пак се чете като включен',
      topicRow(h.doc, 'Просрочени задачи').cells[TOPIC_COL.active].textContent.indexOf('вкл.') >= 0);
    h.close();
  }
  {
    /* Анти-тавтология: „няма PATCH" е безсмислено, ако този път изобщо не
       може да произведе PATCH. Същият клик, но с потвърждение — трябва да
       спре темата наистина. */
    const h = await loaded({ confirm: true });
    const cb = topicRow(h.doc, 'Просрочени задачи').cells[TOPIC_COL.active].querySelector('input');
    cb.checked = false;
    fire(h.w, cb, 'change');
    await ticks();
    const p = h.calls.patch.filter(x => x.table === 'notification_topics');
    ok('КОНТРОЛ: при потвърждение тръгва PATCH', p.length === 1, JSON.stringify(p.map(x => x.body)));
    ok('КОНТРОЛ: със стойност false', p.length === 1 && p[0].body.active === false, JSON.stringify(p[0].body));
    ok('КОНТРОЛ: филтърът сочи темата',
      p.length === 1 && p[0].url.indexOf('key=eq.overdue_tasks') >= 0, p[0].url);
    ok('КОНТРОЛ: редът се пречертава като спрян',
      topicRow(h.doc, 'Просрочени задачи').cells[TOPIC_COL.active].textContent.indexOf('спряна') >= 0);
    h.close();
  }
  {
    /* Провалът не бива да мълчи: редът не трябва да остане „включен". */
    const h = await loaded({ fail: { PATCH: /notification_topics/ } });
    const cb = topicRow(h.doc, 'Задачите за седмицата').cells[TOPIC_COL.active].querySelector('input');
    cb.checked = true;
    fire(h.w, cb, 'change');
    await ticks();
    const last = h.calls.toast[h.calls.toast.length - 1] || '';
    ok('провалът се казва на човека', last.indexOf('Грешка') >= 0, last);
    ok('и носи причината, не само „Грешка"', last.length > 'Грешка при запис: '.length, last);
    ok('при провал НЕ се пише одит',
      !h.calls.post.some(x => x.table === 'audit_log' && x.body.event === 'notif_topic_active_changed'));
    h.close();
  }

  /* ═══ 10. Редакция на тема ══════════════════════════════════════════ */
  section('10. Модалът за тема — час, дни, тестов адрес');
  {
    const h = await loaded();
    if (guard('модалът се отваря', () => h.w.openNotifTopicModal('overdue_tasks'))) {
      const ov = h.doc.getElementById('notif-topic-modal-ov');
      ok('вижда се', !!ov);
      ok('видът е зареден', h.doc.getElementById('ntf-type').value === 'daily');
      ok('часът е зареден', h.doc.getElementById('ntf-time').value === '08:15');
      const checked = Array.prototype.slice.call(h.doc.querySelectorAll('.ntf-wd'))
        .filter(c => c.checked).map(c => c.value).join(',');
      ok('делниците са отметнати', checked === '1,2,3,4,5', checked);
      ok('ключът се показва, но НЕ се редактира',
        ov.textContent.indexOf('overdue_tasks') >= 0 && !h.doc.getElementById('ntf-key'));
      ok('името също не се редактира', !h.doc.getElementById('ntf-label'));
      ok('няма бутон „нова тема" в целия екран',
        !btn(h.doc.getElementById('notif-topics-body'), 'Нова тема') &&
        !btn(h.doc.getElementById('notif-topics-body'), 'нова тема'));

      /* Смяна: час, махане на петък, тестов адрес. */
      h.doc.getElementById('ntf-time').value = '09:45';
      Array.prototype.slice.call(h.doc.querySelectorAll('.ntf-wd'))
        .filter(c => c.value === '5').forEach(c => { c.checked = false; });
      h.doc.getElementById('ntf-test-email').value = 'proba@temax.bg';
      realClick(h.w, btn(ov, 'Запази'));
      await ticks();

      const p = h.calls.patch.filter(x => x.table === 'notification_topics');
      if (ok('тръгнал е PATCH', p.length === 1, JSON.stringify(p.map(x => x.body)))) {
        const b = p[0].body;
        ok('новият час', b.scheduled_time === '09:45', JSON.stringify(b));
        ok('новите дни', b.weekdays.join(',') === '1,2,3,4', JSON.stringify(b));
        ok('day_of_week се нулира при daily', b.day_of_week === null, JSON.stringify(b));
        ok('тестовият адрес влиза', b.test_email === 'proba@temax.bg', JSON.stringify(b));
        ok('ключът НЕ е в тялото', !('key' in b), JSON.stringify(b));
        ok('името НЕ е в тялото', !('label' in b), JSON.stringify(b));
        ok('описанието НЕ е в тялото', !('description' in b), JSON.stringify(b));
      }
      ok('модалът се затваря', !h.doc.getElementById('notif-topic-modal-ov'));
    }
    h.close();
  }
  {
    /* Гранични случаи: нула дни и празен тестов адрес. */
    const h = await loaded();
    h.w.openNotifTopicModal('overdue_tasks');
    Array.prototype.slice.call(h.doc.querySelectorAll('.ntf-wd')).forEach(c => { c.checked = false; });
    realClick(h.w, btn(h.doc.getElementById('notif-topic-modal-ov'), 'Запази'));
    await ticks();
    ok('нула дни се отказва', h.calls.patch.filter(x => x.table === 'notification_topics').length === 0);
    ok('и се казва защо',
      (h.calls.toast[h.calls.toast.length - 1] || '').indexOf('поне един ден') >= 0,
      h.calls.toast.join(' | '));
    ok('модалът остава отворен', !!h.doc.getElementById('notif-topic-modal-ov'));

    /* Изчистване на тестовия адрес → NULL, не празен низ. */
    Array.prototype.slice.call(h.doc.querySelectorAll('.ntf-wd')).forEach(c => { c.checked = true; });
    h.doc.getElementById('ntf-test-email').value = '';
    realClick(h.w, btn(h.doc.getElementById('notif-topic-modal-ov'), 'Запази'));
    await ticks();
    const p = h.calls.patch.filter(x => x.table === 'notification_topics');
    if (ok('вторият опит минава', p.length === 1)) {
      ok('празният тестов адрес става NULL, не ""', p[0].body.test_email === null, JSON.stringify(p[0].body));
      ok('всичките седем дни влизат', p[0].body.weekdays.join(',') === '1,2,3,4,5,6,7', JSON.stringify(p[0].body));
    }
    h.close();
  }
  {
    /* Седмична тема: пише day_of_week и нулира weekdays. */
    const h = await loaded();
    h.w.openNotifTopicModal('weekly_digest');
    ok('видът е weekly', h.doc.getElementById('ntf-type').value === 'weekly');
    ok('денят е зареден', h.doc.getElementById('ntf-dow').value === 'mon');
    h.doc.getElementById('ntf-dow').value = 'fri';
    realClick(h.w, btn(h.doc.getElementById('notif-topic-modal-ov'), 'Запази'));
    await ticks();
    const b = h.calls.patch.filter(x => x.table === 'notification_topics')[0].body;
    ok('day_of_week се записва', b.day_of_week === 'fri', JSON.stringify(b));
    ok('weekdays се нулира', b.weekdays === null, JSON.stringify(b));
    ok('часът остава', b.scheduled_time === '07:00', JSON.stringify(b));
    h.close();
  }

  /* ═══ 11. Изтриване на изключение ═══════════════════════════════════ */
  section('11. Изключението се трие с потвърждение');
  {
    const h = await loaded({ confirm: false });
    const del = btn(h.doc.getElementById('notif-overrides-body'), '✕');
    if (ok('бутонът за триене съществува', !!del)) {
      realClick(h.w, del);
      await ticks();
      ok('при отказ нищо не се трие',
        h.calls.del.filter(u => u.indexOf('notification_overrides') >= 0).length === 0);
      ok('питано е', h.calls.confirm.length === 1, h.calls.confirm.join(' | '));
      ok('въпросът назовава човека',
        (h.calls.confirm[0] || '').indexOf('ten.tenev@temax.bg') >= 0, h.calls.confirm[0]);
    }
    h.close();

    const y = await loaded({ confirm: true });
    realClick(y.w, btn(y.doc.getElementById('notif-overrides-body'), '✕'));
    await ticks();
    const dels = y.calls.del.filter(u => u.indexOf('notification_overrides') >= 0);
    ok('КОНТРОЛ: при потвърждение се трие', dels.length === 1, dels.join('\n'));
    ok('КОНТРОЛ: по id', dels.length === 1 && dels[0].indexOf('id=eq.ovr-1') >= 0, dels[0]);
    y.close();
  }

  /* ═══ 12. Групите на човека ═════════════════════════════════════════ */
  section('12. Колона „Групи" в „Потребители"');
  {
    const h = env();
    h.w.loadUsersAdmin();
    await ticks();
    const trs = Array.prototype.slice.call(h.doc.querySelectorAll('#users-body tr'));
    const rowOf = mail => trs.find(t => (t.textContent || '').indexOf(mail) >= 0);
    const grpCell = tr => Array.prototype.slice.call(tr.querySelectorAll('td'))
      .find(td => td.querySelector('button[onclick*="editNotifyGroups"]'));

    const ten = rowOf('ten.tenev@temax.bg');
    const mis = rowOf('razminat@temax.bg');
    const adm = rowOf('admin@temax.bg');
    if (ok('редовете се рендират', !!ten && !!mis && !!adm)) {
      ok('групите се показват като баджове',
        grpCell(ten).textContent.indexOf('Контролинг') >= 0 &&
        grpCell(ten).textContent.indexOf('Регионален') >= 0, grpCell(ten).textContent);
      ok('суровият ключ не изтича', grpCell(ten).textContent.indexOf('controlling') < 0);
      ok('всеки ред има молив за групите', trs.every(tr => !!grpCell(tr)));
      /* is_regional=true без 'regional' в notify_groups → предупреждение. */
      ok('разминаването носи ⚠️', grpCell(mis).textContent.indexOf('⚠️') >= 0, grpCell(mis).textContent);
      ok('КОНТРОЛ: съвпадащият ред НЯМА ⚠️', grpCell(ten).textContent.indexOf('⚠️') < 0, grpCell(ten).textContent);
      ok('КОНТРОЛ: и нерегионалният НЯМА ⚠️', grpCell(adm).textContent.indexOf('⚠️') < 0, grpCell(adm).textContent);
      ok('is_regional НЕ е пипана — баджът „РЕГ." си стои',
        mis.cells[3].textContent.indexOf('РЕГ.') >= 0, mis.cells[3].textContent);

      /* Редакция през модала. */
      realClick(h.w, grpCell(mis).querySelector('button[onclick*="editNotifyGroups"]'));
      await ticks();
      const ov = h.doc.getElementById('notify-groups-modal-ov');
      if (ok('модалът се отваря', !!ov)) {
        ok('текущата група е отметната',
          h.doc.querySelector('.ntf-grp-cb[value="co"]').checked === true);
        ok('липсващата не е',
          h.doc.querySelector('.ntf-grp-cb[value="regional"]').checked === false);
        ok('разминаването се обяснява в модала', ov.textContent.indexOf('is_regional') >= 0);
        h.doc.querySelector('.ntf-grp-cb[value="regional"]').checked = true;
        realClick(h.w, btn(ov, 'Запази'));
        await ticks();
        const p = h.calls.patch.filter(x => x.table === 'users');
        if (ok('тръгнал е PATCH', p.length === 1, JSON.stringify(p.map(x => x.body)))) {
          ok('пише се само notify_groups', Object.keys(p[0].body).join(',') === 'notify_groups',
            Object.keys(p[0].body).join(','));
          ok('с двете групи', p[0].body.notify_groups.join(',') === 'co,regional',
            JSON.stringify(p[0].body));
          ok('is_regional НЕ влиза в тялото', !('is_regional' in p[0].body), JSON.stringify(p[0].body));
        }
      }
    }
    h.close();
  }
  {
    /* Нула отметки → празен масив, НЕ null: колоната е NOT NULL. */
    const h = env();
    h.w.editNotifyGroups('u-ten', 'Тенчо Тенев');
    await ticks();
    Array.prototype.slice.call(h.doc.querySelectorAll('.ntf-grp-cb')).forEach(c => { c.checked = false; });
    realClick(h.w, btn(h.doc.getElementById('notify-groups-modal-ov'), 'Запази'));
    await ticks();
    const b = h.calls.patch.filter(x => x.table === 'users')[0].body;
    ok('нула отметки дава празен масив', Array.isArray(b.notify_groups) && b.notify_groups.length === 0,
      JSON.stringify(b));
    ok('а НЕ null', b.notify_groups !== null, JSON.stringify(b));
    h.close();
  }

  /* ═══ 13. Празни данни ══════════════════════════════════════════════ */
  section('13. Празни таблици — fallback, не счупен екран');
  {
    const h = await loaded({ topics: [], matrix: [], overrides: [] });
    ok('темите казват, че няма',
      h.doc.getElementById('notif-topics-body').textContent.indexOf('Няма теми') >= 0);
    ok('матрицата не гърми без теми',
      h.doc.getElementById('notif-matrix-body').textContent.indexOf('Няма теми') >= 0);
    ok('изключенията казват, че няма',
      h.doc.getElementById('notif-overrides-body').textContent.indexOf('Няма изключения') >= 0);
    ok('индикаторът „Зареждане" е изчистен и от трите',
      h.doc.getElementById('notif-topics-body').textContent.indexOf('Зареждане') < 0 &&
      h.doc.getElementById('notif-matrix-body').textContent.indexOf('Зареждане') < 0 &&
      h.doc.getElementById('notif-overrides-body').textContent.indexOf('Зареждане') < 0);
    ok('бутонът за ново изключение си стои',
      !!btn(h.doc.getElementById('notif-overrides-body'), 'Ново изключение'));
    h.close();
  }

  /* ═══ 14. Закотвяния ════════════════════════════════════════════════ */
  section('14. Закотвяния');
  {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const adm = fs.readFileSync(path.join(root, 'admin.js'), 'utf8');

    const modAdmin = html.slice(html.indexOf('id="mod-admin"'), html.indexOf('id="mod-history"'));
    ok('картата е в #mod-admin', modAdmin.indexOf('id="notif-admin-card"') >= 0);
    ok('и е СЛЕД „Потребители"',
      modAdmin.indexOf('id="users-body"') < modAdmin.indexOf('id="notif-admin-card"'));
    ok('и ПРЕДИ „Магазини"',
      modAdmin.indexOf('id="notif-admin-card"') < modAdmin.indexOf('id="stores-body"'));
    ok('трите контейнера са там',
      modAdmin.indexOf('id="notif-topics-body"') >= 0 &&
      modAdmin.indexOf('id="notif-matrix-body"') >= 0 &&
      modAdmin.indexOf('id="notif-overrides-body"') >= 0);
    ok('подзаглавието обяснява крона', modAdmin.indexOf('15 минути') >= 0);
    ok('заглавният ред на „Потребители" има „Групи"',
      modAdmin.indexOf('<th>Оборот имейл</th><th>Групи</th>') >= 0);

    ok('loadAdmin() вика новия екран', /loadAdmin\(\)\{[\s\S]{0,400}loadNotificationsAdmin\(\);/.test(adm));
    ok('заявката за users пак е с изричен select=',
      /sbGet\('users','order=role,email&select=id,/.test(adm));
    ok('notify_groups е в списъка', /select=id,[^']*notify_groups/.test(adm));
    ok('is_regional остава в списъка — не е махната', /select=id,[^']*is_regional/.test(adm));
    ok('editAssigned() не е пипана', /function editAssigned\(userId, userName\)/.test(adm));
    ok('editOborotReport() не е пипана', /function editOborotReport\(userId, userName\)/.test(adm));

    /* Екранът не праща известия — CLAUDE.md т.14. Единственият изход навън
       е през крона, който чете тези таблици. */
    const block = adm.slice(adm.indexOf('function loadNotificationsAdmin'));
    ok('новият код не вика pushToAll', block.indexOf('pushToAll') < 0);
    ok('нито runNotifyTopic', block.indexOf('runNotifyTopic') < 0);
    /* Името се СПОМЕНАВА в коментарите — търси се самото извикване. */
    ok('нито едж функцията директно',
      block.indexOf('functions/v1/') < 0 && block.indexOf('fetch(') < 0);
    ok('и не пипа users.is_regional при запис', !/notify_groups: sel[\s\S]{0,200}is_regional/.test(block));
  }

  report();
})();
