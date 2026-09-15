/* Администрация → Известия → „📧 Общи отчети".

   От 15.09.2026 тук е управлението на общите отчети, преместено от таб
   „Днес": там стояха лентата „✉️ Тест на автоматичния репорт" (поле за имейл
   + 4 бутона) и панелът „📧 Получатели на общия репорт". Същия ден в 08:33 на
   Тенчо дойдоха два писма с „(тест)" — полето беше с фиксиран адрес, а
   бутонът не се заключваше.

   Какво заковава тестът (с истински клик по onclick):
     1. admin: 4 реда (Дневен/Седмичен/Палети/Склад) с разписание и брой
        получатели; „📤 Изпрати сега" само на Дневен и Седмичен; сивият текст;
        users се чете с изричен select=;
     2. accounting вижда секцията БЕЗ „Изпрати сега", матрицата — да, темите —
        не; manager не вижда нищо и базата не се пита;
     3. „Тест до мен" праща на currentUser.email (не на написаното в
        полетата), двоен клик = една заявка, заключено до края; без имейл в
        профила → нула заявки; заключването е по вид отчет;
     4. „Изпрати сега": confirm с броя; „Откажи" → нищо; двоен клик = един
        confirm и една заявка до списъка, без „(тест)";
     5. CRUD на получател от новото място: + Добави → POST, ✕ → DELETE;
     6. в таб „Днес" няма нито един от махнатите елементи.

   Събирачите на данни са подменени с бавни фалшиви (имат свои тестове);
   изпращането минава през истинския sendEmail (email.js), тоест се броят
   реалните POST-ове към resend-email.

   Пускане: node tests/admin-reports.test.js . */
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const ADMIN = { id: 'u-adm', email: 'm.ivanova@temax.bg', display_name: 'Мария Иванова', role: 'admin', store_name: 'Централен офис' };
const ACC = { id: 'u-acc', email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: 'Централен офис' };
const ACC_NOMAIL = { id: 'u-nm', email: '', display_name: 'Без имейл', role: 'accounting', store_name: 'Централен офис' };
const MANAGER = { id: 'u-mgr', email: 's@temax.bg', display_name: 'Управител', role: 'manager', store_name: 'Троян' };

const RECIPIENTS = [
  { id: 'r1', name: 'Тенчо', email: 't@temax.bg', daily: true, weekly: true, active: true, scope_stores: null },
  { id: 'r2', name: 'Юлиана', email: 'j@temax.bg', daily: true, weekly: false, active: true, scope_stores: null },
  { id: 'r3', name: '', email: 'w@temax.bg', daily: false, weekly: true, active: true, scope_stores: null }
];
function usersFor(url) {
  if (url.indexOf('is_regional') >= 0) return [
    { email: 'reg@temax.bg', display_name: 'Регионален', assigned_stores: ['Троян'], active: true, is_regional: true }];
  if (url.indexOf('role=eq.logistics') >= 0) return [
    { email: 'lt@temax.bg', display_name: 'Търговище', store_name: 'Логистичен склад Търговище', role: 'logistics', active: true },
    { email: 'ld@temax.bg', display_name: 'Добрич', store_name: 'Логистичен склад Добрич', role: 'logistics', active: true }];
  return [];
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function settle(ms) { await wait(ms || 120); for (let i = 0; i < 4; i++) await ticks(); }

async function env(user, over) {
  over = over || {};
  const h = boot({
    modules: over.modules || ['bulletin.js', 'email.js', 'admin.js', 'report.js'],
    user: user,
    data: { report_recipients: RECIPIENTS, users: usersFor, notification_topics: [], notification_matrix: [],
            notification_overrides: [], notification_schedules: [], stores: [] },
    confirm: over.confirm
  });
  const w = h.w;
  h.collected = { daily: 0, weekly: 0 };
  /* Бавни събирачи: реалните траят секунди — точно в този прозорец беше
     вторият клик на 15.09. */
  w.collectDailyReportData = function (cb) { h.collected.daily++; w.setTimeout(function () { cb({ reportDate: '2026-09-15' }); }, 40); };
  w.buildDailyReportHtml = function () { return '<p>дневен</p>'; };
  w.collectWeeklyReportData = function (cb) { h.collected.weekly++; w.setTimeout(function () { cb({ weekDates: [] }); }, 40); };
  w.buildWeeklyReportHtml = function () { return '<p>седмичен</p>'; };
  if (!over.noLoad) { w.loadNotificationsAdmin(); await settle(); }
  return h;
}
const body = h => h.doc.getElementById('notif-reports-body');
const mails = h => h.calls.post.filter(p => /\/functions\/v1\/resend-email/.test(p.url));
const rowBtn = (h, kind, text) => {
  const row = h.doc.getElementById('report-row-' + kind);
  return row ? (Array.prototype.find.call(row.querySelectorAll('button'), b => b.textContent.trim() === text) || null) : null;
};
const sendBtns = h => Array.prototype.filter.call(h.doc.querySelectorAll('#notif-reports-body button'),
  b => b.textContent.indexOf('Изпрати сега') >= 0);

(async function () {

  section('1. admin: редовете, разписанието, броят, бутоните');
  {
    const h = await env(ADMIN);
    const b = body(h);
    ok('секцията е под матрицата в index.html',
      !!b && b.previousElementSibling && b.previousElementSibling.id === 'notif-matrix-body');
    ok('секцията е видима', !!b && b.style.display !== 'none');
    ok('заглавие „📧 Общи отчети"', b.textContent.indexOf('📧 Общи отчети') >= 0);
    const note = h.doc.getElementById('notif-reports-note');
    ok('сивият текст', !!note && note.textContent ===
      'Кой получава известията за задачи — матрицата по-горе. Кой получава общите отчети — този списък.',
      note && note.textContent);
    const expect = { daily: ['Дневен', 'всеки ден 21:00', '2'], weekly: ['Седмичен', 'неделя 21:00', '2'],
                     pallets: ['Палети', 'петък 21:00', '3'], warehouse: ['Склад', 'неделя 21:00', '2'] };
    Object.keys(expect).forEach(function (k) {
      const row = h.doc.getElementById('report-row-' + k);
      if (ok('ред „' + expect[k][0] + '"', !!row)) {
        const cells = row.querySelectorAll('td');
        ok(expect[k][0] + ': разписание „' + expect[k][1] + '"', cells[1].textContent === expect[k][1], cells[1].textContent);
        ok(expect[k][0] + ': ' + expect[k][2] + ' получатели', cells[2].textContent === expect[k][2], cells[2].textContent);
        ok(expect[k][0] + ': „Тест до мен"', !!rowBtn(h, k, 'Тест до мен'));
      }
    });
    ok('„📤 Изпрати сега" на Дневен и Седмичен', !!rowBtn(h, 'daily', '📤 Изпрати сега') && !!rowBtn(h, 'weekly', '📤 Изпрати сега'));
    ok('и никъде другаде (2 общо)', sendBtns(h).length === 2, sendBtns(h).length);
    ok('списъкът получатели е тук (3 реда)', b.querySelectorAll('.report-recipient').length === 3);
    ok('няма поле за адрес на теста', !h.doc.getElementById('today-report-email') &&
      b.querySelectorAll('input').length === 4 /* само формата за добавяне */, b.querySelectorAll('input').length);
    const userGets = h.calls.get.filter(u => u.indexOf('/users') >= 0);
    ok('users с изричен select=, никога select=* или хеш',
      userGets.length > 0 && userGets.every(u => u.indexOf('select=') >= 0 && u.indexOf('select=*') < 0 && u.indexOf('hash') < 0),
      userGets.join('\n'));
    h.close();
  }

  section('2. Видимост по роля');
  {
    const h = await env(ACC);
    const card = h.doc.getElementById('notif-admin-card');
    ok('accounting: картата е видима', card.style.display !== 'none', card.style.display);
    ok('accounting: секцията е нарисувана (4 реда)', h.doc.querySelectorAll('#notif-reports-body tr[id^="report-row-"]').length === 4);
    ok('accounting: 4 × „Тест до мен"', ['daily', 'weekly', 'pallets', 'warehouse'].every(k => !!rowBtn(h, k, 'Тест до мен')));
    ok('accounting: НЯМА „Изпрати сега"', sendBtns(h).length === 0, sendBtns(h).length);
    ok('accounting: темите са скрити, матрицата — не',
      h.doc.getElementById('notif-topics-body').style.display === 'none' &&
      h.doc.getElementById('notif-matrix-body').style.display !== 'none');
    ok('accounting: базата не е питана за изключенията и насрочените',
      !h.calls.get.some(u => u.indexOf('notification_overrides') >= 0 || u.indexOf('notification_schedules') >= 0));
    const before = h.calls.confirm.length;
    guard('accounting: пряко извикване на adminReportSendClick', () => h.w.adminReportSendClick(null, 'daily'));
    await settle();
    ok('accounting: пряко извикване → нито confirm, нито заявка',
      h.calls.confirm.length === before && mails(h).length === 0 && h.collected.daily === 0);
    h.close();
  }
  {
    const h = await env(MANAGER);
    ok('manager: картата е скрита', h.doc.getElementById('notif-admin-card').style.display === 'none');
    ok('manager: секцията е празна', body(h).innerHTML === '');
    ok('manager: report_recipients не е питана', !h.calls.get.some(u => u.indexOf('report_recipients') >= 0));
    h.close();
  }

  section('3. „Тест до мен"');
  {
    const h = await env(ADMIN);
    /* Написаното във формата за получател не бива да влиза в теста. */
    h.doc.getElementById('admin-rcpt-email').value = 'drug@temax.bg';
    const b = rowBtn(h, 'daily', 'Тест до мен');
    guard('първи клик', () => realClick(h.w, b, 'Дневен: Тест до мен'));
    ok('заключен веднага след клика', b.disabled === true);
    guard('втори клик в същата секунда', () => realClick(h.w, b, 'Дневен: Тест до мен'));
    await settle();
    const m = mails(h);
    ok('ЕДНА заявка към resend-email', m.length === 1, m.length);
    ok('данните са събрани веднъж', h.collected.daily === 1, h.collected.daily);
    if (m[0]) {
      ok('до currentUser.email', JSON.stringify(m[0].body.to) === JSON.stringify([ADMIN.email]), JSON.stringify(m[0].body.to));
      ok('темата носи „(тест)"', /\(тест\)$/.test(m[0].body.subject), m[0].body.subject);
    }
    ok('отключен след края', b.disabled === false);
    realClick(h.w, b, 'Дневен: Тест до мен');
    await settle();
    ok('КОНТРОЛА: след отключване пак праща (2 общо)', mails(h).length === 2, mails(h).length);
    h.close();
  }
  {
    const h = await env(ADMIN);
    realClick(h.w, rowBtn(h, 'weekly', 'Тест до мен'), 'Седмичен');
    realClick(h.w, rowBtn(h, 'weekly', 'Тест до мен'), 'Седмичен');
    await settle();
    ok('седмичен: двоен клик → една заявка', mails(h).length === 1 && h.collected.weekly === 1, mails(h).length + '/' + h.collected.weekly);
    h.close();
  }
  {
    const h = await env(ADMIN);
    realClick(h.w, rowBtn(h, 'daily', 'Тест до мен'), 'Дневен');
    realClick(h.w, rowBtn(h, 'weekly', 'Тест до мен'), 'Седмичен');
    await settle();
    ok('заключването е по вид: зает дневен не спира седмичния (2 писма)', mails(h).length === 2, mails(h).length);
    h.close();
  }
  {
    const h = await env(ACC_NOMAIL);
    const b = rowBtn(h, 'daily', 'Тест до мен');
    guard('клик без имейл в профила', () => realClick(h.w, b, 'Дневен'));
    await settle();
    ok('toast „Профилът ти няма имейл"', h.calls.toast.indexOf('Профилът ти няма имейл') >= 0, JSON.stringify(h.calls.toast));
    ok('нула заявки, данни не се събират', mails(h).length === 0 && h.collected.daily === 0);
    ok('бутонът не остава заключен', b.disabled === false);
    h.close();
  }

  section('4. „📤 Изпрати сега"');
  {
    const h = await env(ADMIN, { confirm: false });
    const b = rowBtn(h, 'daily', '📤 Изпрати сега');
    guard('клик → „Откажи"', () => realClick(h.w, b, 'Изпрати сега'));
    await settle();
    ok('confirm с броя', h.calls.confirm.length === 1 &&
      h.calls.confirm[0] === 'Ще се изпрати до 2 получатели — сигурен ли си?', JSON.stringify(h.calls.confirm));
    ok('„Откажи" → нула заявки към resend-email', mails(h).length === 0, mails(h).length);
    ok('„Откажи" → данни не се събират', h.collected.daily === 0);
    ok('„Откажи" → бутонът не е заключен', b.disabled === false);
    h.close();
  }
  {
    const h = await env(ADMIN, { confirm: true });
    const b = rowBtn(h, 'daily', '📤 Изпрати сега');
    realClick(h.w, b, 'Изпрати сега');
    ok('заключен след потвърждението', b.disabled === true);
    realClick(h.w, b, 'Изпрати сега');
    await settle();
    ok('двоен клик → един confirm', h.calls.confirm.length === 1, h.calls.confirm.length);
    const m = mails(h);
    ok('двоен клик → ЕДНА заявка', m.length === 1, m.length);
    if (m[0]) {
      ok('до дневния списък', JSON.stringify(m[0].body.to) === JSON.stringify(['t@temax.bg', 'j@temax.bg']), JSON.stringify(m[0].body.to));
      ok('без „(тест)" в темата', m[0].body.subject.indexOf('(тест)') < 0, m[0].body.subject);
    }
    ok('toast с резултата', h.calls.toast.some(t => String(t).indexOf('✅ Дневен репорт изпратен на 2 получатели') >= 0), JSON.stringify(h.calls.toast));
    ok('отключен след края', b.disabled === false);
    h.close();
  }
  {
    const h = await env(ADMIN, { confirm: true });
    realClick(h.w, rowBtn(h, 'weekly', '📤 Изпрати сега'), 'Седмичен: Изпрати сега');
    await settle();
    const m = mails(h);
    ok('седмичен: confirm с 2', h.calls.confirm[0] === 'Ще се изпрати до 2 получатели — сигурен ли си?', h.calls.confirm[0]);
    ok('седмичен: до седмичния списък', m.length === 1 && JSON.stringify(m[0].body.to) === JSON.stringify(['t@temax.bg', 'w@temax.bg']),
      m[0] && JSON.stringify(m[0].body.to));
    h.close();
  }

  section('5. Получатели: добавяне и триене от новото място');
  {
    const h = await env(ADMIN);
    const getsBefore = h.calls.get.filter(u => u.indexOf('report_recipients') >= 0).length;
    const add = Array.prototype.find.call(body(h).querySelectorAll('button'), x => x.textContent.trim() === '+ Добави');
    realClick(h.w, add, '+ Добави без имейл');
    await settle();
    ok('без имейл → toast, нула POST', h.calls.toast.indexOf('Въведи имейл') >= 0 &&
      !h.calls.post.some(p => p.table === 'report_recipients'));
    h.doc.getElementById('admin-rcpt-name').value = 'Нов';
    h.doc.getElementById('admin-rcpt-email').value = 'nov@temax.bg';
    h.doc.getElementById('admin-rcpt-weekly').checked = false;
    realClick(h.w, Array.prototype.find.call(body(h).querySelectorAll('button'), x => x.textContent.trim() === '+ Добави'), '+ Добави');
    await settle();
    const posts = h.calls.post.filter(p => p.table === 'report_recipients');
    ok('POST към report_recipients', posts.length === 1, posts.length);
    ok('с име, имейл и флаговете', !!posts[0] && JSON.stringify(posts[0].body) ===
      JSON.stringify({ name: 'Нов', email: 'nov@temax.bg', daily: true, weekly: false }), posts[0] && JSON.stringify(posts[0].body));
    ok('toast „✅ Добавен получател"', h.calls.toast.indexOf('✅ Добавен получател') >= 0);
    ok('списъкът се презарежда', h.calls.get.filter(u => u.indexOf('report_recipients') >= 0).length > getsBefore);

    const r2 = Array.prototype.find.call(body(h).querySelectorAll('.report-recipient'), x => x.textContent.indexOf('j@temax.bg') >= 0);
    const del = r2 && Array.prototype.find.call(r2.querySelectorAll('button'), x => x.textContent.trim() === '✕');
    if (ok('✕ на реда на Юлиана', !!del)) {
      realClick(h.w, del, '✕');
      await settle();
      ok('DELETE report_recipients id=eq.r2',
        h.calls.del.some(u => u.indexOf('report_recipients') >= 0 && u.indexOf('id=eq.r2') >= 0), h.calls.del.join('\n'));
      ok('toast „Изтрит получател"', h.calls.toast.indexOf('Изтрит получател') >= 0);
    }
    h.close();
  }

  section('6. В таб „Днес" няма нищо от махнатото');
  {
    const h = await env(ADMIN, { modules: ['bulletin.js', 'email.js', 'today.js', 'report.js'], noLoad: true });
    ['todayReportTestBarHtml', 'todayReportTestClick', 'todayReportRecipientsHtml', 'todayLoadRecipients',
     'todayAddRecipient', 'todayDeleteRecipient'].forEach(function (n) {
      ok('няма ' + n, typeof h.w[n] === 'undefined');
    });
    const wrap = h.doc.getElementById('mod-today');
    if (guard('renderTodayDashboard се рисува', () => h.w.renderTodayDashboard(wrap, [], [], [], ['Троян']))) {
      await settle();
      const html = wrap.innerHTML;
      ok('КОНТРОЛА: таблото е нарисувано', html.indexOf('📊 Днес') >= 0);
      ['today-report-email', 'today-report-test-note', 'today-rcpt', 'Тест на автоматичния репорт',
       'Получатели на общия репорт', 'Изпрати сега', 'тест до мен', 'Тест до мен'].forEach(function (s) {
        ok('няма „' + s + '"', html.indexOf(s) < 0);
      });
    }
    const src = fs.readFileSync(path.join(process.argv[2] || '.', 'today.js'), 'utf8');
    ok('today.js не вика изпращане на отчети',
      !/send\w*Report(Test|ToRecipients)|loadReportRecipients|addReportRecipient|deleteReportRecipient/.test(src));
    h.close();
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
