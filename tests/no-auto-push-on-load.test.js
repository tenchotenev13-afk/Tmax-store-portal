/* Зареждането на Бюлетина НЕ праща push известия.

   До 27.08.2026 autoCheckBulletinNotifications() тръгваше в края на
   loadBulletin() и пращаше две известия — за изтичащи промоции и за днешните
   срокове. Защитата срещу повторение беше localStorage на браузъра на админа,
   тоест двама админи в един ден = две известия, а нула админи = нула.

   На 27.08.2026 в 08:50 се получи на живо: „📅 3 срока днес — Осчетоводяване
   на минуси (08:30), СПРАВКА МИНУСИ (20:00), Вечерен оборот (20:00)" отиде до
   всички. Тръгна според това кой е отворил портала; отиде до всички, а не до
   обекта, чиито са задачите; и съобщи вечерни задачи сутринта.

   Заместникът е едж функцията bulletin-notify, тема today_deadlines (крон, два
   часа преди часа на задачата, само неотметнатото, само за съответния обект).
   Този тест пази клиентският механизъм да не се върне при merge.

   ⚠️ АНТИ-ТАВТОЛОГИЯ. Фикстурата е нарочно „гореща": секция 0 доказва, че при
   ТОЧНО тези данни има какво да се изпрати — изтичаща промоция И задача със
   срок днес. Без нея секция 1 щеше да минава и срещу стария код просто защото
   няма съдържание за известие. Контролът е пуснат: с върнато
   `renderBulletin();autoCheckBulletinNotifications();` секция 1 пада с
   2 извиквания на pushToAll (проверено на 27.08.2026).

   Пускане:  node tests/no-auto-push-on-load.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* today() в shared.js е UTC-базирано (`toISOString().slice(0,10)`), а точно то
   се ползва от collectTodayDeadlineItems. Затова датите се вадят от самия
   прозорец след boot, вместо да се смятат тук — иначе тестът гърми вечер. */
function fixture(w) {
  const t = w.today();
  const plus = n => {
    const d = new Date(t + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  };
  return {
    today: t,
    /* Задача със срок ДНЕС — това е, което правеше „📅 N срока днес". */
    tasks: [
      { id: 'bt-1', bulletin_id: 'b-1', title: 'Осчетоводяване на минуси',
        due_date: t, due_dates: null, department: 'admin', sort_order: 1,
        target_stores: null, type: 'info' },
      { id: 'bt-2', bulletin_id: 'b-1', title: 'Вечерен оборот',
        due_date: t, due_dates: null, department: 'admin', sort_order: 2,
        target_stores: null, type: 'info' }
    ],
    /* Промоция, изтичаща до 5 дни → promoStatus() === 'expiring'. */
    promos: [
      { id: 'p-1', bulletin_id: 'b-1', title: 'Лятна разпродажба',
        start_date: plus(-10), end_date: plus(2) }
    ]
  };
}

/* Вдига портала като АДМИН (canEdit() е истина — само тогава старият код
   изобщо тръгваше) и подменя pushToAll с шпионин. push.js се зарежда, за да е
   реалистично, но истинска заявка към OneSignal не бива да излиза. */
function env() {
  const h = boot({
    modules: ['bulletin.js', 'push.js'],
    user: ADMIN,
    data: {
      bulletins: [{ id: 'b-1', week_number: 1, year: 2026, status: 'published',
                    content: {}, created_at: '2026-01-01T00:00:00Z' }],
      bulletin_promotions: [],
      bulletin_tasks: [],
      recurring_tasks: [],
      task_completions: [],
      subtask_completions: [],
      task_subtasks: [],
      users: [{ store_name: 'Троян' }],
      stores: [{ name: 'Троян' }]
    }
  });
  const fx = fixture(h.w);
  h.setData('bulletin_tasks', fx.tasks);
  h.setData('bulletin_promotions', fx.promos);

  h.pushes = [];
  h.w.pushToAll = function (title, msg) {
    h.pushes.push({ title: title, msg: msg });
    return Promise.resolve({ ok: true, data: {} });
  };
  return { h, fx };
}

(function () {

  /* ── 0 ─────────────────────────────────────────────────────────────────── */
  section('0. Фикстурата Е гореща — има какво да се изпрати');
  {
    const { h, fx } = env();
    h.w.bulTasks = fx.tasks.slice();
    h.w.bulPromotions = fx.promos.slice();
    h.w.recurringTasks = [];

    ok('потребителят е с права да редактира (старият код тръгваше само тогава)',
      h.w.canEdit() === true);
    const promoMsg = h.w.composePromoExpiringMessage();
    ok('има изтичаща промоция', !!promoMsg, JSON.stringify(promoMsg));
    ok('и текстът ѝ е непразен', !!(promoMsg && promoMsg.title && promoMsg.msg));

    let items = null;
    h.w.collectTodayDeadlineItems(function (list) { items = list; });
    return ticks().then(function () {
      if (ok('има задачи със срок днес', !!items && items.length === 2,
        JSON.stringify(items))) {
        ok('и се форматират в съобщение',
          h.w.formatDeadlinesMessage(items).indexOf('Осчетоводяване на минуси') >= 0,
          h.w.formatDeadlinesMessage(items));
      }
      ok('дотук нищо не е изпратено', h.pushes.length === 0,
        JSON.stringify(h.pushes));
      h.close && h.close();
      return main();
    });
  }

  function main() {

    /* ── 1 ───────────────────────────────────────────────────────────────── */
    section('1. loadBulletin() от админ НЕ вика pushToAll нито веднъж');
    const one = env();
    return Promise.resolve()
      .then(() => {
        return guard('loadBulletin() не хвърля', () => one.h.w.loadBulletin());
      })
      .then(() => ticks())
      .then(() => ticks())
      .then(() => {
        /* Същината на теста. Върне ли някой авто-старта, тук стават 2. */
        ok('pushToAll НЕ е викан', one.h.pushes.length === 0,
          one.h.pushes.map(p => p.title).join(' | '));
        /* Данните наистина са се заредили — иначе „нула известия" би било
           заслуга на празен бюлетин, не на промяната. */
        ok('бюлетинът все пак се е заредил', !!one.h.w.curBul,
          String(one.h.w.curBul));
        ok('и задачите са дошли', (one.h.w.bulTasks || []).length === 2,
          String((one.h.w.bulTasks || []).length));
        ok('и промоциите са дошли', (one.h.w.bulPromotions || []).length === 1,
          String((one.h.w.bulPromotions || []).length));
        /* При заредени данни известието пак е било възможно — проверяваме го
           СЛЕД зареждането, върху реалното състояние на прозореца. */
        ok('и пак е имало какво да се изпрати',
          !!one.h.w.composePromoExpiringMessage());
        ok('нищо не е записано в localStorage за днешните известия',
          !one.h.w.localStorage.getItem('auto_deadlines_notif_' + one.fx.today) &&
          !one.h.w.localStorage.getItem('auto_promo_notif_' + one.fx.today));
        one.h.close && one.h.close();
      })

      /* ── 2 ─────────────────────────────────────────────────────────────── */
      .then(() => {
        section('2. Ръчният бутон за днешни срокове още работи');
        const two = env();
        two.h.w.bulTasks = two.fx.tasks.slice();
        two.h.w.bulPromotions = two.fx.promos.slice();
        two.h.w.recurringTasks = [];

        return Promise.resolve()
          .then(() => guard('sendDailyDeadlinesNotification() не хвърля',
            () => two.h.w.sendDailyDeadlinesNotification()))
          .then(() => ticks())
          .then(() => {
            if (ok('pushToAll е викан точно веднъж', two.h.pushes.length === 1,
              JSON.stringify(two.h.pushes))) {
              ok('със заглавието за днешните срокове',
                two.h.pushes[0].title === '📅 2 срока днес', two.h.pushes[0].title);
              ok('и с текста на задачите',
                two.h.pushes[0].msg.indexOf('Вечерен оборот') >= 0,
                two.h.pushes[0].msg);
            }
            /* Бутонът наистина е в менюто, не само функцията в кода. */
            const src = require('fs').readFileSync(
              require('path').join(process.argv[2] || '.', 'bulletin.js'), 'utf8');
            ok('бутонът „🔔 Изпрати нотификация" още е в менюто',
              src.indexOf('sendDailyDeadlinesNotification();closePushMenu();') >= 0);

            /* И ръчният бутон за промоции — той няма заместник в едж
               функцията, затова е единственият останал път за тях. */
            two.h.pushes.length = 0;
            two.h.w.sendPromoExpiringNotification();
            ok('ръчният бутон за промоции също праща',
              two.h.pushes.length === 1, JSON.stringify(two.h.pushes));
            two.h.close && two.h.close();
          });
      })

      /* ── 3 ─────────────────────────────────────────────────────────────── */
      .then(() => {
        section('3. Кодът вече не съдържа авто-функциите');
        const fs = require('fs');
        const path = require('path');
        const raw = fs.readFileSync(
          path.join(process.argv[2] || '.', 'bulletin.js'), 'utf8');

        /* Коментарите отпадат ПЪРВИ. Блокът на мястото на махнатия код нарочно
           изброява трите имена — историята на един премахнат механизъм е
           по-ценна от буквалното „низът да не се среща", а проверката върху
           ГОЛИЯ КОД е по-строга: тя пада и ако някой върне функциите, и ако
           някой само възстанови извикването. */
        const code = raw
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/\/\/[^\n]*/g, ' ');

        ['autoCheckDailyDeadlines', 'autoCheckPromoNotifications',
         'autoCheckBulletinNotifications'].forEach(function (name) {
          ok(name + ' я няма в кода', code.indexOf(name) < 0);
        });
        ok('няма нито една функция с име autoCheck*',
          !/function\s+autoCheck/.test(code));
        /* Точният низ, който стоеше на осемте места в loadBulletin(). */
        ok('извикването след renderBulletin() е махнато',
          code.indexOf('renderBulletin();autoCheck') < 0);
        /* Обратното: renderBulletin() ВСЕ ОЩЕ се вика на осемте места —
           махнато е известието, не рендерът. */
        const renders = (code.match(/renderBulletin\(\);/g) || []).length;
        ok('renderBulletin() е останал (8 места в loadBulletin + други)',
          renders >= 8, String(renders));

        /* Оцелелите функции са наистина в кода, не само в коментар. */
        ['sendDailyDeadlinesNotification', 'collectTodayDeadlineItems',
         'formatDeadlinesMessage', 'composePromoExpiringMessage'].forEach(function (n) {
          ok(n + ' е запазена', code.indexOf('function ' + n) >= 0);
        });

        report();
      });
  }
})();
