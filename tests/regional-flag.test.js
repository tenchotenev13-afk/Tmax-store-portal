/* Явният признак „регионален мениджър" — users.is_regional.

   Групата „Регионален (по магазин)" в Бюлетина се извеждаше от РОЛЯТА:
   `sbGet('users','role=eq.accounting&…')`, тоест „регионален" значеше
   „активен accounting с непразни assigned_stores". Грешно в двете посоки
   (проверено в базата на 24.08.2026):

     · 9 счетоводителки получаваха задачите като регионални, без да са;
     · В. Филев Е регионален, но е с роля admin и никога не ги получаваше.

   Ролята не може да се смени — 'accounting' е ключ за достъп на 43 места в
   17 файла (каса, главна каса, сторно, разлики, връщания, История, Днес,
   isGlobal()). Затова признакът е ОТДЕЛНА колона. Тя е независима и от
   oborot_report: онова поле значи „какъв вечерен оборот получава", не
   „каква длъжност заема" (Теодор е 'all', без да е регионален).

   ⚠️ АНТИ-ТАВТОЛОГИЯ. Фикстурата е мини-PostgREST, който УВАЖАВА eq
   филтрите. Ако кодът се върне към `role=eq.accounting`, тя ще му върне
   счетоводителките и секция 2 ще падне. Двата списъка нарочно се
   различават В ДВЕТЕ ПОСОКИ (acc-only е accounting без признака; reg-admin
   е admin с признака), затова тестът не може да мине с двата източника.
   Секция 3 заковава точно това несъвпадение като отделна проверка, за да
   не изгние фикстурата тихо до съвпадащи списъци.

   Пускане:  node tests/regional-flag.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, guard, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* Петимата са подбрани така, че „accounting с обекти" и „is_regional" да са
   РАЗЛИЧНИ множества, и то в двете посоки:
     accounting с обекти : reg-acc, acc-only, reg-noobj(празен масив → не)
     is_regional         : reg-acc, reg-admin, reg-noobj
   Съвпадат само по reg-acc. */
const USERS = [
  /* Регионален със стандартната роля — получава. */
  { id: 'u-1', email: 'reg-acc@temax.bg', display_name: 'Регионален/Счет.',
    store_name: 'Централен офис', role: 'accounting', active: true,
    assigned_stores: ['Троян', 'Габрово'], oborot_report: 'assigned', is_regional: true },

  /* СЪЩИНАТА: счетоводителка с назначени обекти, но НЕ е регионална.
     Точно тя получаваше задачите по старата логика. */
  { id: 'u-2', email: 'acc-only@temax.bg', display_name: 'Счетоводство',
    store_name: 'Централен офис', role: 'accounting', active: true,
    assigned_stores: ['Раднево'], oborot_report: null, is_regional: false },

  /* Случаят „В. Филев": регионален, но с роля admin. По старата логика
     не го получаваше НИКОГА. */
  { id: 'u-3', email: 'reg-admin@temax.bg', display_name: 'Регионален/Админ',
    store_name: 'Централен офис', role: 'admin', active: true,
    assigned_stores: ['Раднево'], oborot_report: 'assigned', is_regional: true },

  /* Регионален БЕЗ зачисления — признакът сам по себе си не стига. */
  { id: 'u-4', email: 'reg-noobj@temax.bg', display_name: 'Регионален без обекти',
    store_name: 'Централен офис', role: 'accounting', active: true,
    assigned_stores: [], oborot_report: null, is_regional: true },

  /* Контрола: нито едното, нито другото. */
  { id: 'u-5', email: 'kasier@temax.bg', display_name: 'Касиер',
    store_name: 'Троян', role: 'kasa', active: true,
    assigned_stores: null, oborot_report: null, is_regional: false }
];

/* Обектите за знаменателя идват от СЪЩАТА таблица (select=store_name). */
const STORE_ROWS = ['Раднево', 'Габрово', 'Троян'].map(s => ({ store_name: s }))
  .concat([{ store_name: 'Централен офис' }]);

/* ── Мини-PostgREST за users ──
   Уважава `<колона>=eq.<стойност>` за id, role и is_regional. Точно това
   прави теста функционален, а не тавтологичен: източникът на списъка се
   ЧЕТЕ от URL-а, вместо да се подава наготово. */
function usersFixture(list) {
  return function (url) {
    const u = String(url);
    let rows = list.concat(STORE_ROWS.filter(r => false));  /* само users */
    const eq = (col) => {
      const m = u.match(new RegExp(col + '=eq\\.([^&]+)'));
      return m ? decodeURIComponent(m[1]) : null;
    };
    const id = eq('id');
    if (id) rows = rows.filter(r => r.id === id);
    const role = eq('role');
    if (role) rows = rows.filter(r => r.role === role);
    const isReg = eq('is_regional');
    if (isReg !== null) rows = rows.filter(r => !!r.is_regional === (isReg === 'true'));
    /* Заявката за знаменателя иска само обектите — тя няма филтър и
       трябва да върне редовете с store_name на реалните магазини. */
    if (!id && !role && isReg === null && /select=store_name/.test(u)) {
      return STORE_ROWS;
    }
    return rows;
  };
}

function weekUnderTest(w) {
  const target = w.reportWeekOfMonday(w.reportPrevWeekMonday(new Date()));
  return { target, dates: w.weekDays(target.week, target.year).map(w.toLocalISO) };
}

function reportEnv(over) {
  return boot(Object.assign({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], users: usersFixture(USERS), report_snapshots: []
    }
  }, over || {}));
}

/* Един бюлетин с една маршрутизирана задача за групата 'regional'.
   targetStores=null значи „всички обекти". */
function routingEnv(targetStores) {
  const probe = reportEnv();
  const wk = weekUnderTest(probe.w);
  probe.close();

  const h = reportEnv({
    data: {
      bulletins: [{ id: 'b-1', week_number: wk.target.week, year: wk.target.year,
                    status: 'published' }],
      bulletin_tasks: [
        { id: 't-1', bulletin_id: 'b-1', title: 'Инвентаризация',
          report_groups: ['regional'], target_stores: targetStores,
          due_date: wk.dates[2] }
      ],
      recurring_tasks: [], task_completions: [],
      users: usersFixture(USERS), report_snapshots: []
    }
  });
  return { h, wk };
}

async function recipients(targetStores) {
  const { h } = routingEnv(targetStores);
  let data = null;
  h.w.collectWeeklyRoutingData(function (d) { data = d; });
  await ticks();
  if (!data) { h.close(); return null; }
  const map = h.w.buildRecipientMap(data.tasks, data.regionalUsers, data.creatorMap);
  const emails = Object.keys(map).sort();
  const urls = h.calls.get.filter(u => u.indexOf('/users?') >= 0);
  h.close();
  return { emails, urls, data };
}

/* ── Администрация ── */
function adminEnv() {
  return boot({
    modules: ['admin.js'],
    user: ADMIN,
    data: { users: usersFixture(USERS), stores: [] }
  });
}

(async function () {

  section('1. Източникът на списъка е колоната, не ролята');
  {
    const r = await recipients(null);
    if (ok('маршрутизацията връща данни', !!r)) {
      const joined = r.urls.join(' ');
      ok('заявката за получатели пита is_regional=eq.true',
        joined.indexOf('is_regional=eq.true') >= 0, joined);
      ok('и вече НЕ пита role=eq.accounting',
        joined.indexOf('role=eq.accounting') < 0, joined);
      /* Колоните остават същите — резолвърът ползва и трите. */
      ok('иска email, display_name и assigned_stores',
        joined.indexOf('select=email,display_name,assigned_stores') >= 0, joined);
    }
  }

  section('2. ЯДРОТО: кой получава задача за ВСИЧКИ обекти');
  {
    const r = await recipients(null);
    if (ok('маршрутизацията връща данни', !!r)) {
      ok('регионален с роля accounting → получава',
        r.emails.indexOf('reg-acc@temax.bg') >= 0, r.emails.join(', '));

      /* Същината на цялата промяна. */
      ok('accounting с обекти, но БЕЗ признака → НЕ получава',
        r.emails.indexOf('acc-only@temax.bg') < 0, r.emails.join(', '));

      ok('регионален с роля admin → получава (случаят В. Филев)',
        r.emails.indexOf('reg-admin@temax.bg') >= 0, r.emails.join(', '));

      ok('регионален БЕЗ зачисления → не получава',
        r.emails.indexOf('reg-noobj@temax.bg') < 0, r.emails.join(', '));

      ok('страничен човек не получава',
        r.emails.indexOf('kasier@temax.bg') < 0, r.emails.join(', '));

      ok('точно двама получатели', r.emails.length === 2, r.emails.join(', '));
    }
  }

  section('3. Анти-тавтология: двата източника дават РАЗЛИЧНИ хора');
  {
    /* Ако фикстурата някога изгние така, че accounting и is_regional да
       съвпаднат, секция 2 би минала и с върнатия стар код. Тук се доказва,
       че не съвпадат — и то в двете посоки. */
    const { h } = routingEnv(null);
    await ticks();

    const oldWay = USERS.filter(u => u.role === 'accounting');
    const newWay = USERS.filter(u => u.is_regional);

    const resolve = (list) => h.w.resolveRecipientsForTask(
      { report_groups: ['regional'], target_stores: null }, list, {}
    ).map(x => x.email).sort().join(',');

    const oldEmails = resolve(oldWay);
    const newEmails = resolve(newWay);

    ok('старият източник (role=accounting) би дал ДРУГ списък',
      oldEmails !== newEmails, oldEmails + '  ≠  ' + newEmails);
    ok('старият включва човек, който новият изключва',
      oldEmails.indexOf('acc-only@temax.bg') >= 0 &&
      newEmails.indexOf('acc-only@temax.bg') < 0, oldEmails);
    ok('новият включва човек, който старият изключва',
      newEmails.indexOf('reg-admin@temax.bg') >= 0 &&
      oldEmails.indexOf('reg-admin@temax.bg') < 0, newEmails);
    h.close();
  }

  section('4. Пресичането с target_stores остава непроменено');
  {
    /* Задача само за Троян: там е зачислен единствено reg-acc. */
    const only = await recipients(['Троян']);
    if (ok('маршрутизацията връща данни (Троян)', !!only)) {
      ok('регионалният за Троян получава',
        only.emails.indexOf('reg-acc@temax.bg') >= 0, only.emails.join(', '));
      ok('регионалният за Раднево НЕ получава — няма пресичане',
        only.emails.indexOf('reg-admin@temax.bg') < 0, only.emails.join(', '));
      ok('точно един получател', only.emails.length === 1, only.emails.join(', '));
    }

    /* Обект, на който никой регионален не е зачислен. */
    const none = await recipients(['Габрово', 'Пирдоп']);
    if (ok('маршрутизацията връща данни (Габрово)', !!none)) {
      ok('само зачисленият за Габрово получава',
        none.emails.join(',') === 'reg-acc@temax.bg', none.emails.join(', '));
    }
  }

  section('5. Администрация — бадж „РЕГ." до ролята');
  {
    const h = adminEnv();
    if (guard('loadUsersAdmin() не хвърля', () => h.w.loadUsersAdmin())) {
      await ticks();
      const body = h.doc.getElementById('users-body');
      const trs = Array.prototype.slice.call(body.querySelectorAll('tr'));
      const rowFor = (mail) => trs.filter(t => t.textContent.indexOf(mail) >= 0)[0];

      const r1 = rowFor('reg-acc@temax.bg');
      const r2 = rowFor('acc-only@temax.bg');
      const r3 = rowFor('reg-admin@temax.bg');

      if (ok('редовете се рендират', !!r1 && !!r2 && !!r3)) {
        ok('регионалният носи бадж РЕГ.', r1.textContent.indexOf('РЕГ.') >= 0,
          r1.textContent);
        ok('счетоводителката НЕ носи бадж', r2.textContent.indexOf('РЕГ.') < 0,
          r2.textContent);
        ok('регионалният админ носи бадж', r3.textContent.indexOf('РЕГ.') >= 0,
          r3.textContent);
        /* Баджът стои до ролята, а колоната за оборота е отделна — двете
           полета трябва да се четат едно до друго, без да се сливат. */
        ok('баджът е в клетката на ролята, не в тази за оборота',
          r1.cells[3].textContent.indexOf('РЕГ.') >= 0,
          r1.cells[3].textContent);
      }
      ok('заявката иска и is_regional',
        h.calls.get.join(' ').indexOf('is_regional') >= 0,
        h.calls.get.join(' '));
    }
    h.close();
  }

  section('6. Администрация — отметката в модала');
  {
    /* Отваря се с ТЕКУЩАТА стойност, не с false по подразбиране. */
    const h1 = adminEnv();
    h1.w.openUserModal('u-1');
    await ticks();
    let cb = h1.doc.getElementById('um-regional');
    if (ok('отметката я има при редакция', !!cb)) {
      ok('регионален → отметката е вдигната', cb.checked === true);
    }
    h1.close();

    const h2 = adminEnv();
    h2.w.openUserModal('u-2');
    await ticks();
    cb = h2.doc.getElementById('um-regional');
    if (ok('отметката я има и за нерегионален', !!cb)) {
      ok('нерегионален → отметката е свалена', cb.checked === false);
    }

    /* Вдигаме я и записваме → is_regional влиза в PATCH. */
    cb.checked = true;
    if (guard('submitUserModal() не хвърля', () => h2.w.submitUserModal())) {
      await ticks();
      const patches = h2.calls.patch.filter(p => p.table === 'users');
      if (ok('има PATCH към users', patches.length === 1, String(patches.length))) {
        ok('is_regional влиза в тялото', patches[0].body.is_regional === true,
          JSON.stringify(patches[0].body));
        ok('и попада върху ВЕРНИЯ ред', patches[0].url.indexOf('id=eq.u-2') >= 0,
          patches[0].url);
        /* Останалите полета не бива да се губят при добавянето. */
        ok('ролята продължава да се записва', patches[0].body.role === 'accounting',
          JSON.stringify(patches[0].body));
      }
    }
    h2.close();

    /* Свалянето също трябва да минава — false, не пропуснато поле. */
    const h3 = adminEnv();
    h3.w.openUserModal('u-1');
    await ticks();
    h3.doc.getElementById('um-regional').checked = false;
    if (guard('submitUserModal() при сваляне не хвърля', () => h3.w.submitUserModal())) {
      await ticks();
      const p = h3.calls.patch.filter(x => x.table === 'users')[0];
      if (ok('има PATCH при сваляне', !!p)) {
        ok('изпраща се false, а не липсващо поле', p.body.is_regional === false,
          JSON.stringify(p.body));
      }
    }
    h3.close();
  }

  section('7. Създаване на нов колега — колоната НЕ се подава');
  {
    /* anon няма INSERT грант върху is_regional (users-is-regional-schema.sql).
       Подаде ли се, POST-ът пада с 403 и създаването на потребител спира. */
    const h = adminEnv();
    h.w.openUserModal(null);
    await ticks();

    ok('отметката липсва в модала за НОВ колега',
      !h.doc.getElementById('um-regional'));

    h.doc.getElementById('um-email').value = 'nov@temax.bg';
    h.doc.getElementById('um-name').value = 'Нов Колега';
    h.doc.getElementById('um-role').value = 'accounting';
    h.doc.getElementById('um-pass').value = '1234';
    if (guard('submitUserModal() за нов не хвърля', () => h.w.submitUserModal())) {
      await ticks();
      const posts = h.calls.post.filter(p => p.table === 'users');
      if (ok('има POST към users', posts.length === 1, String(posts.length))) {
        ok('is_regional НЕ е в тялото',
          !('is_regional' in posts[0].body), JSON.stringify(posts[0].body));
        ok('имейлът и ролята са там', posts[0].body.email === 'nov@temax.bg' &&
          posts[0].body.role === 'accounting', JSON.stringify(posts[0].body));
      }
    }
    h.close();
  }

  report();
})();
