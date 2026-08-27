/* Ръчното пускане на тема от bulletin-notify — клиентската страна.
 *
 * НАСЛЕДЯВА tests/overdue-recipients.test.js, който беше изтрит заедно с
 * логиката, която проверяваше. Дотук порталът смяташе САМ кой е просрочен:
 * sendPushOverdueNow() (bulletin.js), sendOverdueAlerts() (email.js) и
 * pushOverdue() (push.js) четяха users.is_regional, пресичаха assigned_stores
 * с target_stores, дедуплицираха по имейл и решаваха дали последната дата от
 * прозореца е преди днес. Старият тест заковаваше точно това — 152 проверки
 * за получатели, знаменател, дедупликация и правило за дата.
 *
 * От 26.08.2026 всичко това е в едж функцията bulletin-notify (тема
 * overdue_tasks, версия 7, ACTIVE), която крон 15 вика на всеки 15 минути.
 * Тя чете получателите от notification_matrix и notification_overrides и
 * има собствен overdueHtmlFor(). Проверява се ТАМ, не тук — две реализации
 * на един и същи въпрос се разминават тихо, а точно това беше причината
 * клиентската да отпадне.
 *
 * Тук остава само онова, което наистина е клиентско: че бутонът вика темата,
 * и че резултатът се ОТЧИТА честно — грешката е червена и не се твърди
 * успех, „няма просрочени" не се представя за изпратено.
 *
 * ⚠️ АНТИ-ТАВТОЛОГИЯ. Проверките за цвят гледат ВТОРИЯ toast, не първия:
 * runNotifyTopic() показва „⏳ Изпращане..." веднага, тоест проверка от рода
 * на „има ли toast" минава винаги, независимо какво е върнала функцията.
 *
 * Пускане:  node tests/notify-topic-button.test.js .
 */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

const FN_URL = '/functions/v1/bulletin-notify';

/* Вдига портала и подменя fetch САМО за едж функцията. `reply` описва какво
   връща тя; `netFail: true` симулира срив преди отговор (fetch отхвърля —
   харнесът не го покрива през `fail`). */
function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'push.js', 'email.js'],
    user: ADMIN,
    data: { users: [], stores: [], bulletins: [], bulletin_tasks: [], task_completions: [] }
  });

  h.edge = [];
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    if (String(url).indexOf(FN_URL) >= 0) {
      h.edge.push({ url: String(url), init: init || {} });
      if (opts.netFail) return Promise.reject(new Error('Failed to fetch'));
      const body = JSON.stringify(opts.reply === undefined
        ? { ok: true, mode: 'manual', bg_date: '2026-08-27', result: { topic: 'overdue_tasks', recipients: 4, sent_emails: 4, failed_emails: 0, items: 11 } }
        : opts.reply);
      return Promise.resolve({
        ok: opts.status === undefined ? true : opts.status < 400,
        status: opts.status === undefined ? 200 : opts.status,
        text: () => Promise.resolve(opts.rawBody !== undefined ? opts.rawBody : body),
        json: () => Promise.resolve(JSON.parse(body))
      });
    }
    return orig(url, init);
  };

  /* Собствен шпионин за toast: харнесът пази само текста, а тук цветът е
     половината от твърдението („червен, а не зелен"). */
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: String(m), color: c || null }); return origToast(m, c); };

  h.errors = [];
  h.w.console.error = function () {
    h.errors.push(Array.prototype.slice.call(arguments).map(String).join(' '));
  };

  h.last = function () { return h.toasts[h.toasts.length - 1] || { msg: '', color: null }; };
  return h;
}

const RED = '#dc2626';

(function () {

  /* ── 1 ─────────────────────────────────────────────────────────────────── */
  section('1. Бутонът „🔔 Изпрати за просрочени" вика темата');
  {
    const h = env();
    h.doc.body.innerHTML = h.w.pushMenuHtml();
    const b = btn(h.doc.body, 'Изпрати за просрочени');
    if (ok('бутонът съществува', !!b)) {
      ok('текстът е новият', b.textContent.trim() === '🔔 Изпрати за просрочени', b.textContent.trim());
      guard('истински клик не хвърля', () => realClick(h.w, b));
      ok('едж функцията е извикана точно веднъж', h.edge.length === 1, String(h.edge.length));
    }
    /* Старият бутон и старата функция ги няма. */
    ok('менюто вече не вика sendPushOverdueNow',
      !/sendPushOverdueNow/.test(h.w.pushMenuHtml()));
    ok('sendPushOverdueNow вече не съществува като функция',
      typeof h.w.sendPushOverdueNow === 'undefined');
    h.close && h.close();
  }

  /* ── 2 ─────────────────────────────────────────────────────────────────── */
  section('2. Заявката е по договора на функцията');
  {
    const h = env();
    h.w.runNotifyTopic('overdue_tasks', null);
    if (ok('има точно една заявка', h.edge.length === 1)) {
      const e = h.edge[0];
      ok('URL е bulletin-notify', e.url.indexOf(FN_URL) >= 0, e.url);
      ok('и е абсолютен към Supabase', e.url.indexOf('https://') === 0, e.url);
      ok('методът е POST', (e.init.method || '').toUpperCase() === 'POST', e.init.method);
      const hd = e.init.headers || {};
      /* verify_jwt е включен — без Authorization функцията връща 401. */
      ok('носи Authorization с анонимния ключ',
        String(hd['Authorization'] || '').indexOf('Bearer ') === 0);
      ok('носи и apikey', !!hd['apikey']);
      ok('ключът е този от shared.js', hd['apikey'] === h.w.SB_KEY);
      ok('Content-Type е JSON', hd['Content-Type'] === 'application/json');
      let body = null;
      try { body = JSON.parse(e.init.body); } catch (err) { body = null; }
      if (ok('тялото е валиден JSON', !!body, String(e.init.body))) {
        ok('тялото носи topic_key', body.topic_key === 'overdue_tasks', JSON.stringify(body));
        /* dry_run НЕ се праща — иначе бутонът нищо не изпраща. */
        ok('dry_run НЕ се праща', body.dry_run === undefined, JSON.stringify(body));
      }
    }
    h.close && h.close();
  }

  /* ── 3 ─────────────────────────────────────────────────────────────────── */
  section('3. Успех — зелен toast с броя, onDone се вика');
  {
    const h = env();
    let done = 0;
    h.w.runNotifyTopic('overdue_tasks', function () { done++; });
    return ticks().then(function () {
      const t = h.last();
      ok('toast-ът НЕ е червен', t.color !== RED, JSON.stringify(t));
      ok('съобщава колко получатели', t.msg.indexOf('4') >= 0, t.msg);
      ok('и колко писма', t.msg.indexOf('писма') >= 0, t.msg);
      ok('onDone е извикан веднъж', done === 1, String(done));
      ok('нищо не е писано в console.error', h.errors.length === 0, h.errors.join(' | '));
      h.close && h.close();
      return skipped();
    });
  }

  /* ── 4 ─────────────────────────────────────────────────────────────────── */
  function skipped() {
    section('4. „Няма просрочени задачи" не се представя за изпратено');
    const h = env({ reply: { ok: true, mode: 'manual', bg_date: '2026-08-27',
      result: { topic: 'overdue_tasks', skipped: 'Няма просрочени задачи', recipients: 0 } } });
    let done = 0;
    h.w.runNotifyTopic('overdue_tasks', function () { done++; });
    return ticks().then(function () {
      const t = h.last();
      ok('показва самия текст от функцията',
        t.msg.indexOf('Няма просрочени задачи') >= 0, t.msg);
      /* Същината: нито „изпратено", нито грешка. */
      ok('НЕ се твърди, че е изпратено',
        t.msg.indexOf('Изпратено') < 0 && t.msg.indexOf('получател') < 0, t.msg);
      ok('toast-ът НЕ е червен — това не е грешка', t.color !== RED, JSON.stringify(t));
      ok('onDone НЕ се вика — нищо не е тръгнало', done === 0, String(done));
      h.close && h.close();
      return httpError();
    });
  }

  /* ── 5 ─────────────────────────────────────────────────────────────────── */
  function httpError() {
    section('5. Грешка от функцията — ЧЕРВЕН toast, без твърдение за успех');
    const h = env({ status: 404, reply: { ok: false, error: 'Няма такава тема: overdue_tasks' } });
    let done = 0;
    h.w.runNotifyTopic('overdue_tasks', function () { done++; });
    return ticks().then(function () {
      const t = h.last();
      ok('toast-ът е ЧЕРВЕН', t.color === RED, JSON.stringify(t));
      ok('казва, че НЕ е тръгнало', t.msg.indexOf('НЕ тръгна') >= 0, t.msg);
      ok('носи текста на грешката', t.msg.indexOf('Няма такава тема') >= 0, t.msg);
      ok('не се твърди успех',
        t.msg.indexOf('Изпратено до') < 0, t.msg);
      ok('onDone НЕ се вика', done === 0, String(done));
      ok('грешката влиза и в console.error', h.errors.length === 1, h.errors.join(' | '));
      h.close && h.close();
      return okFalse();
    });
  }

  /* ── 5б ────────────────────────────────────────────────────────────────── */
  function okFalse() {
    section('5б. HTTP 200, но ok:false — пак е грешка');
    /* Тихият капан: gateway-ят връща 200, а функцията е гръмнала вътре.
       Проверка само по r.ok би отчела успех върху празен result. */
    const h = env({ status: 200, reply: { ok: false, error: 'boom' } });
    h.w.runNotifyTopic('overdue_tasks', null);
    return ticks().then(function () {
      const t = h.last();
      ok('toast-ът е ЧЕРВЕН', t.color === RED, JSON.stringify(t));
      ok('носи текста на грешката', t.msg.indexOf('boom') >= 0, t.msg);
      h.close && h.close();
      return badJson();
    });
  }

  /* ── 5в ────────────────────────────────────────────────────────────────── */
  function badJson() {
    section('5в. 401 с тяло, което НЕ е JSON');
    /* Точно това връща gateway-ят при липсващ Authorization. .json() би
       хвърлил и промяната би изглеждала като мълчалив провал. */
    const h = env({ status: 401, rawBody: 'Missing authorization header' });
    let threw = false;
    try { h.w.runNotifyTopic('overdue_tasks', null); } catch (e) { threw = true; }
    return ticks().then(function () {
      ok('runNotifyTopic не хвърля', !threw);
      const t = h.last();
      ok('toast-ът е ЧЕРВЕН', t.color === RED, JSON.stringify(t));
      ok('показва суровото тяло, не „undefined"',
        t.msg.indexOf('Missing authorization') >= 0, t.msg);
      h.close && h.close();
      return netFail();
    });
  }

  /* ── 6 ─────────────────────────────────────────────────────────────────── */
  function netFail() {
    section('6. Мрежов срив — червен toast, не мълчание');
    const h = env({ netFail: true });
    let done = 0;
    h.w.runNotifyTopic('overdue_tasks', function () { done++; });
    return ticks().then(function () {
      const t = h.last();
      ok('toast-ът е ЧЕРВЕН', t.color === RED, JSON.stringify(t));
      ok('казва, че е мрежова грешка', t.msg.indexOf('Мрежова') >= 0, t.msg);
      ok('onDone НЕ се вика', done === 0, String(done));
      ok('и влиза в console.error', h.errors.length === 1, h.errors.join(' | '));
      h.close && h.close();
      return menus();
    });
  }

  /* ── 7 ─────────────────────────────────────────────────────────────────── */
  function menus() {
    section('7. Един бутон, не два — и банерът в петък');
    const h = env();

    const em = h.w.emailMenuHtml();
    ok('имейл менюто вече НЯМА бутон за просрочени',
      em.indexOf('sendOverdueAlerts') < 0 && em.indexOf('Просрочени задачи') < 0);
    /* Останалите две неща в менюто не са пипани. */
    ok('седмичният дайджест си стои', em.indexOf('sendWeeklyDigest') >= 0);
    ok('тестовият имейл си стои', em.indexOf('bulSendTest') >= 0);

    const pm = h.w.pushMenuHtml();
    ok('push менюто вика runNotifyTopic', pm.indexOf("runNotifyTopic('overdue_tasks'") >= 0);
    ok('и е ЕДИН такъв бутон в целия портал',
      (pm.match(/runNotifyTopic\('overdue_tasks'/g) || []).length === 1);
    /* Ръчният резерв за днешните срокове е запазен нарочно на 27.08. */
    ok('бутонът за днешни срокове не е пипнат',
      pm.indexOf('sendDailyDeadlinesNotification') >= 0);

    h.close && h.close();
    return fridayBanner();
  }

  /* ── 7б ────────────────────────────────────────────────────────────────── */
  function fridayBanner() {
    section('7б. В петък НЯМА банер за просрочени');
    /* Банерът се пазеше от повторение чрез bulletin.overdue_sent_at, а редът,
       който пишеше полето, си отиде със sendOverdueAlerts(). Полето остава
       вечно старо → банерът щеше да излиза всеки петък, включително секунди
       след като е бил натиснат. Отделно темата overdue_tasks и без това
       тръгва сама всеки делник в 08:15. */
    const h = env();
    const holder = h.doc.createElement('div');
    holder.id = 'bul-body';
    h.doc.body.appendChild(holder);
    h.w.curBul = { id: 'b-1', week_number: 35, year: 2026, status: 'published' };
    h.w.bulTasks = []; h.w.bulComps = [];

    /* Истински ПЕТЪК, не проверка на низ: Date се подменя за прозореца, за да
       не зависи тестът от деня, в който е пуснат. */
    const RealDate = h.w.Date;
    const fri = new RealDate();
    while (fri.getDay() !== 5) fri.setDate(fri.getDate() + 1);
    function FakeDate() { return new RealDate(fri.getTime()); }
    FakeDate.now = RealDate.now;
    h.w.Date = FakeDate;
    ok('подмененият Date наистина е петък', new h.w.Date().getDay() === 5,
      String(new h.w.Date().getDay()));

    /* ⚠️ Шпионин върху showEmailPrompt, не само поглед към DOM-а. Само по
       DOM проверката е ТАВТОЛОГИЧНА: showEmailPrompt вече връща веднага при
       type!=='monday', тоест „няма банер" минава и ако петъчният клон още
       вика функцията. Проверено на 27.08.2026 — с върнат клон DOM частта
       минаваше и падаше само секция 8. Тук се брои самото ИЗВИКВАНЕ. */
    const prompts = [];
    const realPrompt = h.w.showEmailPrompt;
    h.w.showEmailPrompt = function (type) {
      prompts.push(type);
      return realPrompt.apply(this, arguments);
    };

    /* Бюлетинът НИКОГА не е имал изпратени просрочени — точно случаят, в
       който старият код показваше банера. */
    guard('checkBulletinEmailTriggers() не хвърля в петък',
      () => h.w.checkBulletinEmailTriggers(h.w.curBul, [], []));
    ok('showEmailPrompt изобщо НЕ е викан в петък', prompts.length === 0,
      prompts.join(','));
    ok('банер НЕ се появява', !h.doc.getElementById('email-prompt-banner'),
      (h.doc.getElementById('email-prompt-banner') || {}).textContent);

    /* И със стара дата в overdue_sent_at — старият код пак показваше банер. */
    h.w.curBul.overdue_sent_at = '2026-01-01T00:00:00Z';
    guard('и при стар overdue_sent_at не хвърля',
      () => h.w.checkBulletinEmailTriggers(h.w.curBul, [], []));
    ok('пак не е викан', prompts.length === 0, prompts.join(','));
    ok('пак няма банер', !h.doc.getElementById('email-prompt-banner'));

    /* Директното повикване също не рисува нищо — иначе „friday" щеше да
       падне в else-а и да нарисува понеделнишкия банер. */
    guard('showEmailPrompt(\'friday\') не хвърля',
      () => h.w.showEmailPrompt('friday', h.w.curBul, [], []));
    ok('showEmailPrompt(\'friday\') не рисува нищо',
      !h.doc.getElementById('email-prompt-banner'));

    /* ⚠️ АНТИ-ТАВТОЛОГИЯ: без това „няма банер" би минавало и защото
       #bul-body липсва, или защото canEdit() е лъжа. Понеделнишкият банер В
       СЪЩАТА среда доказва, че механизмът работи и мълчи само за петък. */
    const mon = new RealDate();
    while (mon.getDay() !== 1) mon.setDate(mon.getDate() + 1);
    h.w.Date = function () { return new RealDate(mon.getTime()); };
    prompts.length = 0; /* горното директно повикване с 'friday' също е записано */
    guard('checkBulletinEmailTriggers() не хвърля в понеделник',
      () => h.w.checkBulletinEmailTriggers(h.w.curBul, [], []));
    ok('в понеделник showEmailPrompt Е викан, и то с \'monday\'',
      prompts.length === 1 && prompts[0] === 'monday', prompts.join(','));
    const mb = h.doc.getElementById('email-prompt-banner');
    if (ok('понеделнишкият банер СЕ появява', !!mb)) {
      ok('и е за дайджеста', mb.textContent.indexOf('Понеделник') >= 0, mb.textContent);
      ok('бутонът му вика sendWeeklyDigest',
        mb.innerHTML.indexOf('sendWeeklyDigest') >= 0);
      ok('и НЕ вика runNotifyTopic', mb.innerHTML.indexOf('runNotifyTopic') < 0);
    }

    h.w.Date = RealDate;
    h.close && h.close();
    return source();
  }

  /* ── 8 ─────────────────────────────────────────────────────────────────── */
  function source() {
    section('8. Клиентската логика я няма в кода');
    const fs = require('fs');
    const path = require('path');
    const root = process.argv[2] || '.';
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

    const bul = strip(fs.readFileSync(path.join(root, 'bulletin.js'), 'utf8'));
    const eml = strip(fs.readFileSync(path.join(root, 'email.js'), 'utf8'));
    const psh = strip(fs.readFileSync(path.join(root, 'push.js'), 'utf8'));

    /* Коментарите отпадат първи: на мястото на всяка махната функция стои
       бележка, която нарочно я СПОМЕНАВА по име. Проверката върху голия код
       е и по-строга — пада и при върната функция, и при върнато извикване. */
    ok('sendPushOverdueNow я няма в bulletin.js', bul.indexOf('sendPushOverdueNow') < 0);
    ok('sendOverdueAlerts я няма в email.js', eml.indexOf('sendOverdueAlerts') < 0);
    ok('buildOverdueHtml я няма в email.js', eml.indexOf('buildOverdueHtml') < 0);
    ok('overdueLastDate я няма в email.js', eml.indexOf('overdueLastDate') < 0);
    ok('pushOverdue я няма в push.js', psh.indexOf('pushOverdue') < 0);
    ok('checkPushTriggers я няма в push.js', psh.indexOf('checkPushTriggers') < 0);
    ok('showPushPrompt я няма в push.js', psh.indexOf('showPushPrompt') < 0);

    /* Обратното: помощниците, които НЕ се пипат, са още там. */
    ok('pushToPeople е запазена', psh.indexOf('function pushToPeople') >= 0);
    ok('pushToRole е запазена (kasa.js я ползва)', psh.indexOf('function pushToRole') >= 0);
    ok('pushToAll е запазена', psh.indexOf('function pushToAll') >= 0);
    ok('sendDailyDeadlinesNotification е запазена',
      bul.indexOf('function sendDailyDeadlinesNotification') >= 0);
    ok('collectTodayDeadlineItems е запазена',
      bul.indexOf('function collectTodayDeadlineItems') >= 0);
    ok('formatDeadlinesMessage е запазена',
      bul.indexOf('function formatDeadlinesMessage') >= 0);
    ok('sendWeeklyDigest е запазена', eml.indexOf('function sendWeeklyDigest') >= 0);
    ok('runNotifyTopic живее в push.js', psh.indexOf('function runNotifyTopic') >= 0);

    /* overdue_sent_at вече не се чете и не се пише от нито един JS файл.
       Колоната в базата не е пипана — това е отделно решение. */
    ['bulletin.js', 'email.js', 'push.js', 'today.js', 'report.js'].forEach(function (f) {
      const src = strip(fs.readFileSync(path.join(root, f), 'utf8'));
      ok(f + ' не докосва overdue_sent_at', src.indexOf('overdue_sent_at') < 0);
    });
    /* Обратното: reminder_sent_at ОЩЕ се пише — понеделнишкият банер помни,
       че е бил натиснат, и точно затова остава. */
    ok('reminder_sent_at още се записва от sendWeeklyDigest',
      eml.indexOf('reminder_sent_at') >= 0);
    ok('петъчният клон го няма в checkBulletinEmailTriggers',
      eml.indexOf('dow === 5') < 0);
    ok('никой не вика showEmailPrompt с \'friday\'',
      eml.indexOf("showEmailPrompt('friday'") < 0);

    /* Никой друг файл да не е останал да вика махнатите неща. */
    const others = ['today.js', 'calendar.js', 'report.js', 'notifications.js', 'kasa.js'];
    others.forEach(function (f) {
      const src = strip(fs.readFileSync(path.join(root, f), 'utf8'));
      ok(f + ' не вика нищо махнато',
        ['sendPushOverdueNow', 'sendOverdueAlerts', 'pushOverdue', 'buildOverdueHtml']
          .every(n => src.indexOf(n) < 0));
    });

    report();
  }
})();
