/* Известията за просрочени задачи — правилните получатели.

   Проверено в базата на 25.08.2026, не по спомен: старата заявка
   `role=in.(logistics,accounting)&active=eq.true` връщаше 22 акаунта — два
   склада (`Логистика 1`, `Логистика 2`; общи акаунти, не хора) и 20
   счетоводителки. Наистина регионални сред тях бяха 6. Отделно:

     · Миглена Павлова и Цветелина Тенева (контролингът, заради който изобщо
       е писана функцията) са с роля admin — филтърът не ги хващаше и те не
       бяха виждали нито едно такова известие;
     · В. Филев е регионален с три обекта, но също е admin → пак нищо.

   Правилният състав е седмината с `users.is_regional = true` плюс двамата
   фиксирани в `REPORT_GROUPS.controlling`. Източникът е СЪЩИЯТ, който
   бюлетинът вече ползва (report.js) — тук не се въвежда ново определение за
   „регионален".

   ⚠️ АНТИ-ТАВТОЛОГИЯ. Фикстурата е мини-PostgREST, който уважава `eq` и
   `in.(…)` филтрите, и таблицата `stores` нарочно съдържа редове, каквито
   `loadReportableStores()` НЕ връща (Централен офис, Сервиз Троян). Затова
   старият и новият източник дават различни списъци в двете посоки:

     стар (role in logistics,accounting) : acc-only, sklad     — новият ги няма
     нов  (is_regional + контролинг)     : reg-admin, Меги, Цвети — старият ги няма

   Секция 7 заковава това несъвпадение отделно, за да не изгние фикстурата
   тихо до съвпадащи списъци.

   Пускане:  node tests/overdue-recipients.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, dayOffset } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* Обектите, които реално могат да отметнат — това връща loadReportableStores(). */
const STORE_ROWS = ['Габрово', 'Раднево', 'Троян'].map(s => ({ store_name: s }))
  .concat([{ store_name: 'Централен офис' }]);   /* изключен от отчетните */

/* Таблицата `stores` нарочно е ПО-ГОЛЯМА: точно това беше грешният
   знаменател в email.js — обекти, които нямат как да изпълнят задача. */
const STORES_TABLE = ['Габрово', 'Раднево', 'Троян', 'Централен офис', 'Сервиз Троян']
  .map(n => ({ name: n }));

const USERS = [
  /* Регионален със стандартната роля — получава. */
  { id: 'u-1', email: 'reg-acc@temax.bg', display_name: 'Регионален/Счет.',
    store_name: 'Централен офис', role: 'accounting', active: true,
    assigned_stores: ['Троян', 'Габрово'], is_regional: true },

  /* Счетоводителка със зачислен обект, но БЕЗ признака. Точно тя получаваше
     известията по старата заявка. */
  { id: 'u-2', email: 'acc-only@temax.bg', display_name: 'Счетоводство',
    store_name: 'Централен офис', role: 'accounting', active: true,
    assigned_stores: ['Раднево'], is_regional: false },

  /* Случаят „В. Филев": регионален с роля admin. По старата заявка — никога. */
  { id: 'u-3', email: 'reg-admin@temax.bg', display_name: 'Регионален/Админ',
    store_name: 'Централен офис', role: 'admin', active: true,
    assigned_stores: ['Раднево'], is_regional: true },

  /* Регионален без зачисления — признакът сам по себе си не стига. */
  { id: 'u-4', email: 'reg-noobj@temax.bg', display_name: 'Регионален без обекти',
    store_name: 'Централен офис', role: 'accounting', active: true,
    assigned_stores: [], is_regional: true },

  /* Общият акаунт на склада — по старата заявка беше получател. */
  { id: 'u-5', email: 'sklad1@temax.bg', display_name: 'Логистика 1',
    store_name: 'Логистичен склад Търговище', role: 'logistics', active: true,
    assigned_stores: null, is_regional: false },

  /* Деактивиран регионален — не получава. */
  { id: 'u-6', email: 'reg-off@temax.bg', display_name: 'Регионален напуснал',
    store_name: 'Централен офис', role: 'accounting', active: false,
    assigned_stores: ['Троян'], is_regional: true },

  /* Контрола: нито едното, нито другото. */
  { id: 'u-7', email: 'kasier@temax.bg', display_name: 'Касиер',
    store_name: 'Троян', role: 'kasa', active: true,
    assigned_stores: null, is_regional: false }
];

/* Двамата от REPORT_GROUPS.controlling — четат се от bulletin.js, не се
   дублират тук като литерали, за да не се разминат тихо. */
const CTL_NAMES  = ['Миглена Павлова', 'Цветелина Тенева'];
const CTL_EMAILS = ['m.pavlova@temax.bg', 'c.teneva@temax.bg'];

/* ── Мини-PostgREST за users ──
   Уважава `<колона>=eq.<стойност>` и `role=in.(a,b)`. Точно това прави теста
   функционален, а не тавтологичен: съставът се ЧЕТЕ от URL-а. */
function usersFixture(list) {
  return function (url) {
    const u = String(url);
    /* Заявката на loadReportableStores(). */
    if (/select=store_name/.test(u)) return STORE_ROWS;

    let rows = list.slice();
    const eq = (col) => {
      const m = u.match(new RegExp(col + '=eq\\.([^&]+)'));
      return m ? decodeURIComponent(m[1]) : null;
    };
    const isReg = eq('is_regional');
    if (isReg !== null) rows = rows.filter(r => !!r.is_regional === (isReg === 'true'));
    const act = eq('active');
    if (act !== null) rows = rows.filter(r => !!r.active === (act === 'true'));
    const role = eq('role');
    if (role) rows = rows.filter(r => r.role === role);
    const inm = u.match(/role=in\.\(([^)]+)\)/);
    if (inm) {
      const set = decodeURIComponent(inm[1]).split(',');
      rows = rows.filter(r => set.indexOf(r.role) >= 0);
    }
    return rows;
  };
}

/* Задача, просрочена с 5 дни. */
function overdueTask(id, title, targetStores) {
  return { id: id, bulletin_id: 'b-1', title: title, department: 'Обект',
           target_stores: targetStores || null, due_date: dayOffset(-5) };
}

const BULLETIN = { id: 'b-1', week_number: 34, year: 2026, status: 'published' };

/* Стъбове за СРИВ. Нито sbGet, нито loadReportableStores отхвърлят при
   грешка — и двете връщат [] (shared.js редове 23 и 453). Затова сривът се
   симулира с валиден 200 и празно тяло, точно както го вижда извикващият. */
function noRegionalsFixture() {
  return function (url) {
    if (/select=store_name/.test(String(url))) return STORE_ROWS;
    return [];                       /* заявката за регионалните — празно */
  };
}
function noStoresFixture(list) {
  const base = usersFixture(list || USERS);
  return function (url) {
    if (/select=store_name/.test(String(url))) return [];   /* обектите — празно */
    return base(url);
  };
}

/* boot + шпиони. osSend и sendEmail са глобални ES5 функции — викат се по име
   от window в момента на извикването, затова подмяната СЛЕД boot() работи. */
function env(users, fixture) {
  const h = boot({
    modules: ['bulletin.js', 'push.js', 'email.js'],
    user: ADMIN,
    data: {
      users: fixture || usersFixture(users || USERS),
      stores: STORES_TABLE,
      bulletins: [BULLETIN], bulletin_tasks: [], task_completions: [],
      recurring_tasks: []
    }
  });
  const pushes = [], mails = [];
  h.w.osSend = function (payload) {
    pushes.push(payload);
    return Promise.resolve({ ok: true, status: 200, data: { id: 'os-1' } });
  };
  h.w.sendEmail = function (to, subject, html) {
    mails.push({ to: to, subject: subject, html: html });
    return Promise.resolve({ ok: true, status: 200, data: {} });
  };
  /* Харнесът записва само текста на toast-а; тук трябва и ЦВЕТЪТ, защото
     „червен" е част от очакването. Обвивка, не подмяна — оригиналът пипа DOM. */
  const toastCalls = [];
  const prevToast = h.w.toast;
  h.w.toast = function (m, c) { toastCalls.push({ msg: String(m), color: c }); return prevToast(m, c); };
  return { h, pushes, mails, toastCalls };
}

/* Кои имена стоят в OneSignal филтъра. */
function namesOf(payload) {
  return ((payload && payload.filters) || [])
    .filter(f => f.field === 'tag' && f.key === 'display_name')
    .map(f => f.value).sort();
}
function msgOf(payload) {
  return (payload && payload.contents && payload.contents.bg) || '';
}

/* ── Push пътят: bulletin.js → push.js ── */
async function runPush(tasks, comps, users, fixture) {
  const e = env(users, fixture);
  e.h.w.bulTasks = tasks;
  e.h.w.bulComps = comps || [];
  const before = e.h.calls.get.length;
  const threw = !guard('sendPushOverdueNow() не хвърля', () => e.h.w.sendPushOverdueNow());
  await ticks(); await ticks();
  const urls = e.h.calls.get.slice(before);
  const out = { pushes: e.pushes, urls: urls, toastCalls: e.toastCalls,
                toasts: e.toastCalls.map(t => t.msg), threw: threw };
  e.h.close();
  return out;
}

/* ── Имейл пътят: email.js ── */
async function runMail(tasks, comps, users, fixture) {
  const e = env(users, fixture);
  const before = e.h.calls.get.length;
  guard('sendOverdueAlerts() не хвърля',
    () => e.h.w.sendOverdueAlerts(BULLETIN, tasks, comps || [], null));
  await ticks(); await ticks();
  const urls = e.h.calls.get.slice(before);
  const out = { mails: e.mails, urls: urls, toastCalls: e.toastCalls,
                toasts: e.toastCalls.map(t => t.msg) };
  e.h.close();
  return out;
}

/* Червеният toast, съдържащ даден откъс. */
function redToast(res, fragment) {
  return res.toastCalls.filter(t => t.msg.indexOf(fragment) >= 0)[0] || null;
}

(async function () {

  section('1. Източникът на получателите — колоната, не ролята');
  {
    const p = await runPush([overdueTask('t-1', 'Инвентаризация')]);
    const pu = p.urls.join(' ');
    ok('push: заявката пита is_regional=eq.true',
      pu.indexOf('is_regional=eq.true') >= 0, pu);
    ok('push: и вече НЕ пита role=in.(…)', pu.indexOf('role=in.') < 0, pu);
    ok('push: иска email, display_name и assigned_stores',
      pu.indexOf('select=email,display_name,assigned_stores') >= 0, pu);

    const m = await runMail([overdueTask('t-1', 'Инвентаризация')]);
    const mu = m.urls.join(' ');
    ok('имейл: заявката пита is_regional=eq.true',
      mu.indexOf('is_regional=eq.true') >= 0, mu);
    ok('имейл: и вече НЕ пита role=in.(…)', mu.indexOf('role=in.') < 0, mu);
  }

  section('2. Кой получава push известието');
  {
    const p = await runPush([overdueTask('t-1', 'Инвентаризация')]);
    if (ok('изпратено е точно едно известие', p.pushes.length === 1,
           String(p.pushes.length))) {
      const names = namesOf(p.pushes[0]);
      const j = names.join(', ');

      ok('регионален с роля accounting → получава',
        names.indexOf('Регионален/Счет.') >= 0, j);
      /* СЪЩИНАТА. */
      ok('счетоводителка с обект, но БЕЗ признака → НЕ получава',
        names.indexOf('Счетоводство') < 0, j);
      ok('регионален с роля admin → получава (случаят В. Филев)',
        names.indexOf('Регионален/Админ') >= 0, j);
      ok('общият акаунт на склада → НЕ получава',
        names.indexOf('Логистика 1') < 0, j);
      ok('регионален БЕЗ зачисления → не получава',
        names.indexOf('Регионален без обекти') < 0, j);
      ok('деактивиран регионален → не получава',
        names.indexOf('Регионален напуснал') < 0, j);
      ok('страничен човек не получава', names.indexOf('Касиер') < 0, j);

      /* Контролингът — заради него е писана функцията. */
      ok('Миглена Павлова е в списъка', names.indexOf(CTL_NAMES[0]) >= 0, j);
      ok('Цветелина Тенева е в списъка', names.indexOf(CTL_NAMES[1]) >= 0, j);

      ok('точно четирима получатели', names.length === 4, j);
      ok('таргетира се по таг display_name',
        (p.pushes[0].filters || []).every(f => f.operator === 'OR' ||
          f.key === 'display_name'), JSON.stringify(p.pushes[0].filters));
      ok('OR-верига между имената',
        (p.pushes[0].filters || []).filter(f => f.operator === 'OR').length === 3,
        JSON.stringify(p.pushes[0].filters));
    }
    const t = p.toasts.join(' | ');
    ok('toast-ът казва реалния брой получатели', t.indexOf('4') >= 0, t);
  }

  section('3. Кой получава имейла');
  {
    const m = await runMail([overdueTask('t-1', 'Инвентаризация')]);
    const to = m.mails.map(x => x.to).sort();
    const j = to.join(', ');

    ok('регионалният с роля accounting получава',
      to.indexOf('reg-acc@temax.bg') >= 0, j);
    ok('счетоводителката БЕЗ признака НЕ получава',
      to.indexOf('acc-only@temax.bg') < 0, j);
    ok('регионалният с роля admin получава',
      to.indexOf('reg-admin@temax.bg') >= 0, j);
    ok('общият акаунт на склада НЕ получава',
      to.indexOf('sklad1@temax.bg') < 0, j);
    /* Празното поле значи различни неща за двата произхода и затова
       получателят се маркира откъде идва: за КОНТРОЛИНГА „няма зачислени
       обекти" значи „целият списък", за РЕГИОНАЛНИЯ значи „не му е зададено
       нищо" — и той се пропуска, точно както pushOverdue() го пропуска.
       Състоянието е достижимо, не теоретично: отметката „регионален" в
       Администрация (admin.js) е независима от зачислените обекти, тоест
       човек може да я получи, без да му бъдат зададени магазини. */
    ok('регионален без зачисления НЕ получава — както и в push-а',
      to.indexOf('reg-noobj@temax.bg') < 0, j);
    ok('Миглена Павлова получава', to.indexOf(CTL_EMAILS[0]) >= 0, j);
    ok('Цветелина Тенева получава', to.indexOf(CTL_EMAILS[1]) >= 0, j);
    ok('точно четирима получатели', to.length === 4, j);

    /* Симетрията между двата пътя — заковано изрично, за да не се разминат
       пак: същият човек отсъства и в двата списъка. */
    const sym = await runPush([overdueTask('t-1', 'Инвентаризация')]);
    const symNames = namesOf(sym.pushes[0]);
    ok('един и същи човек липсва и в push-а, и в имейла',
      symNames.indexOf('Регионален без обекти') < 0 &&
      to.indexOf('reg-noobj@temax.bg') < 0, symNames.join(', ') + '  |  ' + j);

    /* Обхватът надолу остава непроменен: регионалният вижда само своите
       обекти, контролингът — целия списък. */
    const acc = m.mails.filter(x => x.to === 'reg-acc@temax.bg')[0];
    if (ok('писмото до регионалния съществува', !!acc)) {
      ok('носи неговите обекти', acc.html.indexOf('Троян') >= 0 &&
        acc.html.indexOf('Габрово') >= 0, 'Троян/Габрово');
      ok('и НЕ носи чужд обект', acc.html.indexOf('Раднево') < 0, 'Раднево');
    }
    const ctl = m.mails.filter(x => x.to === CTL_EMAILS[0])[0];
    if (ok('писмото до контролинга съществува', !!ctl)) {
      ok('контролингът вижда всичките три обекта',
        ctl.html.indexOf('Троян') >= 0 && ctl.html.indexOf('Габрово') >= 0 &&
        ctl.html.indexOf('Раднево') >= 0, 'три обекта');
    }
  }

  section('4. Празен списък НЕ се превръща в „до всички"');
  {
    const e = env();
    let res = null;
    if (guard('pushToPeople([]) не хвърля',
              () => { res = e.h.w.pushToPeople([], 'Заглавие', 'Текст'); })) {
      await ticks();
      ok('osSend изобщо не е викан', e.pushes.length === 0, String(e.pushes.length));
      let out = null;
      if (res && res.then) { res.then(function (r) { out = r; }); await ticks(); }
      ok('връща ok:false', !!out && out.ok === false, JSON.stringify(out));
      ok('и обяснява защо', !!out && out.data &&
        String(out.data.message).indexOf('получатели') >= 0, JSON.stringify(out));

      /* Същото и за невалиден вход — pushToStores() тук би паднал към всички. */
      e.h.w.pushToPeople(null, 'Заглавие', 'Текст');
      e.h.w.pushToPeople(['', null], 'Заглавие', 'Текст');
      await ticks();
      ok('нито null, нито списък от празни имена стигат до osSend',
        e.pushes.length === 0, String(e.pushes.length));
    }
    e.h.close();
  }

  section('5. Пет просрочени задачи → ЕДНО известие');
  {
    const tasks = [];
    for (let i = 1; i <= 5; i++) tasks.push(overdueTask('t-' + i, 'Задача ' + i));
    const p = await runPush(tasks);
    ok('точно едно извикване на osSend', p.pushes.length === 1,
      String(p.pushes.length));
    ok('и то съдържа всички засегнати обекти',
      msgOf(p.pushes[0]).indexOf('Троян') >= 0 &&
      msgOf(p.pushes[0]).indexOf('Габрово') >= 0, msgOf(p.pushes[0]));
  }

  section('6. target_stores се зачита');
  {
    const p = await runPush([overdueTask('t-1', 'Само за Троян', ['Троян'])]);
    if (ok('едно известие', p.pushes.length === 1, String(p.pushes.length))) {
      const msg = msgOf(p.pushes[0]);
      ok('в известието влиза Троян', msg.indexOf('Троян') >= 0, msg);
      ok('Габрово НЕ влиза', msg.indexOf('Габрово') < 0, msg);
      ok('Раднево НЕ влиза', msg.indexOf('Раднево') < 0, msg);

      /* Следствие: регионалният за Раднево няма пресичане и не получава. */
      const names = namesOf(p.pushes[0]);
      ok('регионалният за Троян получава',
        names.indexOf('Регионален/Счет.') >= 0, names.join(', '));
      ok('регионалният за Раднево НЕ получава — няма пресичане',
        names.indexOf('Регионален/Админ') < 0, names.join(', '));
      ok('контролингът получава и при таргетирана задача',
        names.indexOf(CTL_NAMES[0]) >= 0 && names.indexOf(CTL_NAMES[1]) >= 0,
        names.join(', '));
    }

    /* Задача за обект, който никой регионален не покрива — само контролингът. */
    const only = await runPush([overdueTask('t-2', 'Само Раднево', ['Раднево'])]);
    if (ok('едно известие (Раднево)', only.pushes.length === 1)) {
      const n = namesOf(only.pushes[0]);
      ok('регионалният за Раднево получава', n.indexOf('Регионален/Админ') >= 0,
        n.join(', '));
      ok('регионалният за Троян/Габрово не получава',
        n.indexOf('Регионален/Счет.') < 0, n.join(', '));
    }

    /* Отметнатата задача не вдига известие. */
    const done = await runPush(
      [overdueTask('t-3', 'Отметната', ['Троян'])],
      [{ task_id: 't-3', store_name: 'Троян' }]);
    ok('изпълнената задача не праща нищо', done.pushes.length === 0,
      String(done.pushes.length));
    ok('и казва, че всичко е изпълнено',
      done.toasts.join(' | ').indexOf('Всички задачи са изпълнени') >= 0,
      done.toasts.join(' | '));
  }

  section('7. Анти-тавтология: старият и новият състав са РАЗЛИЧНИ');
  {
    /* Ако фикстурата изгние така, че двата източника да съвпаднат, секции
       2 и 3 биха минали и с върнатия стар код. Тук се доказва, че не
       съвпадат — и то в двете посоки. */
    const oldWay = USERS.filter(u => u.active &&
      ['logistics', 'accounting'].indexOf(u.role) >= 0).map(u => u.email).sort();
    const newWay = USERS.filter(u => u.active && u.is_regional)
      .map(u => u.email).concat(CTL_EMAILS).sort();

    ok('двата списъка се различават', oldWay.join(',') !== newWay.join(','),
      oldWay.join(',') + '  ≠  ' + newWay.join(','));
    ok('старият включва хора, които новият изключва',
      oldWay.indexOf('acc-only@temax.bg') >= 0 &&
      newWay.indexOf('acc-only@temax.bg') < 0 &&
      oldWay.indexOf('sklad1@temax.bg') >= 0 &&
      newWay.indexOf('sklad1@temax.bg') < 0, oldWay.join(','));
    ok('новият включва хора, които старият изключва',
      newWay.indexOf('reg-admin@temax.bg') >= 0 &&
      oldWay.indexOf('reg-admin@temax.bg') < 0 &&
      newWay.indexOf(CTL_EMAILS[0]) >= 0 &&
      oldWay.indexOf(CTL_EMAILS[0]) < 0, newWay.join(','));

    /* Контролингът се чете от REPORT_GROUPS, а не от литерал в теста. */
    const e = env();
    const people = e.h.w.REPORT_GROUPS.controlling.people.map(p => p.email).sort();
    ok('REPORT_GROUPS.controlling още сочи същите двама',
      people.join(',') === CTL_EMAILS.slice().sort().join(','), people.join(','));
    e.h.close();
  }

  section('8. Знаменателят на имейла — отчетните обекти, не таблицата stores');
  {
    const m = await runMail([overdueTask('t-1', 'Инвентаризация')]);
    const u = m.urls.join(' ');
    ok('sendOverdueAlerts() НЕ пита таблицата stores',
      !/\/stores\?/.test(u), u);
    ok('вместо това чете отчетните обекти от users',
      u.indexOf('select=store_name') >= 0, u);

    const ctl = m.mails.filter(x => x.to === CTL_EMAILS[0])[0];
    if (ok('писмото до контролинга съществува', !!ctl)) {
      ok('Централен офис не е сред неизпълнилите',
        ctl.html.indexOf('Централен офис') < 0, 'Централен офис');
      ok('Сервиз Троян също не е', ctl.html.indexOf('Сервиз Троян') < 0,
        'Сервиз Троян');
    }
  }

  section('9. Дедупликация — човек в двата списъка получава веднъж');
  {
    /* Регионален, който същевременно е в контролинга. В базата днес такъв
       няма, но съставът се редактира от Администрация и утре може да има. */
    const dual = USERS.concat([{
      id: 'u-8', email: CTL_EMAILS[0], display_name: CTL_NAMES[0],
      store_name: 'Централен офис', role: 'admin', active: true,
      assigned_stores: ['Троян'], is_regional: true
    }]);

    const p = await runPush([overdueTask('t-1', 'Инвентаризация')], [], dual);
    if (ok('едно известие', p.pushes.length === 1, String(p.pushes.length))) {
      const names = namesOf(p.pushes[0]);
      ok('името на Миглена стои само веднъж',
        names.filter(n => n === CTL_NAMES[0]).length === 1, names.join(', '));
    }

    const m = await runMail([overdueTask('t-1', 'Инвентаризация')], [], dual);
    const to = m.mails.map(x => x.to);
    ok('имейлът ѝ е изпратен само веднъж',
      to.filter(x => x === CTL_EMAILS[0]).length === 1, to.join(', '));
  }

  section('10. Празен отговор от базата е СРИВ, не валидно състояние');
  {
    /* Нито sbGet, нито loadReportableStores отхвърлят при грешка — връщат
       [] (shared.js 23 и 453). Без изрична защита празнотата минава за
       валидна: известието тръгва само до контролинга, а писмото отчита
       „Всички задачи са изпълнени" върху нула обекта. Седем регионални и
       осемнайсет обекта, върнати като нула, са срив. */
    const TASK = [overdueTask('t-1', 'Инвентаризация')];

    /* (1) push.js — списъкът с регионални не се зареди */
    const a = await runPush(TASK, [], null, noRegionalsFixture());
    ok('push: osSend изобщо не е викан', a.pushes.length === 0,
      String(a.pushes.length));
    const at = redToast(a, 'Списъкът с регионални');
    if (ok('push: има toast за незаредения списък', !!at, a.toasts.join(' | '))) {
      ok('push: toast-ът е ЧЕРВЕН', at.color === '#dc2626', String(at.color));
      ok('push: казва изрично, че НЕ е изпратено',
        at.msg.indexOf('НЕ е изпратено') >= 0, at.msg);
    }
    ok('push: няма съобщение за успех',
      a.toasts.every(m => m.indexOf('🔔 Изпратено') < 0), a.toasts.join(' | '));
    ok('push: не праща само до контролинга', a.pushes.length === 0,
      JSON.stringify(a.pushes));

    /* (2) email.js — същото за регионалните */
    const b = await runMail(TASK, [], null, noRegionalsFixture());
    ok('имейл: sendEmail изобщо не е викан', b.mails.length === 0,
      String(b.mails.length));
    const bt = redToast(b, 'Списъкът с регионални');
    if (ok('имейл: има toast за незаредения списък', !!bt, b.toasts.join(' | '))) {
      ok('имейл: toast-ът е ЧЕРВЕН', bt.color === '#dc2626', String(bt.color));
    }
    ok('имейл: няма съобщение за изпратени писма',
      b.toasts.every(m => m.indexOf('📧') < 0), b.toasts.join(' | '));

    /* (3) email.js — списъкът с обекти не се зареди */
    const c = await runMail(TASK, [], null, noStoresFixture());
    ok('имейл: при нула обекта sendEmail не е викан', c.mails.length === 0,
      String(c.mails.length));
    const ct = redToast(c, 'Списъкът с обекти');
    if (ok('имейл: има toast за незаредените обекти', !!ct, c.toasts.join(' | '))) {
      ok('имейл: toast-ът е ЧЕРВЕН', ct.color === '#dc2626', String(ct.color));
    }
    ok('имейл: НЕ отчита „Всички задачи са изпълнени" върху празнота',
      c.toasts.every(m => m.indexOf('Всички задачи са изпълнени') < 0),
      c.toasts.join(' | '));

    /* (4) bulletin.js — същото; тук проверката беше мъртва и мълчеше */
    const d = await runPush(TASK, [], null, noStoresFixture());
    ok('bulletin: osSend не е викан', d.pushes.length === 0,
      String(d.pushes.length));
    const dt = redToast(d, 'Списъкът с обекти');
    if (ok('bulletin: сривът вече не минава мълчаливо', !!dt, d.toasts.join(' | '))) {
      ok('bulletin: toast-ът е ЧЕРВЕН', dt.color === '#dc2626', String(dt.color));
    }
    ok('bulletin: НЕ отчита „Всички задачи са изпълнени" върху празнота',
      d.toasts.every(m => m.indexOf('Всички задачи са изпълнени') < 0),
      d.toasts.join(' | '));

    /* Контрола: при здрави данни нито един от двата червени toast-а не се
       появява — иначе защитите биха гърмели върху нормалната работа. */
    const okRun = await runPush(TASK);
    ok('при здрави данни няма нито един toast за срив',
      !redToast(okRun, 'не се зареди'), okRun.toasts.join(' | '));
  }

  report();
})();
