/* Таб „Днес" — лентата „✉️ Тест на автоматичния репорт".

   Случаят от 15.09.2026, 08:33: на Тенчо дойдоха дневен и седмичен с
   „(тест)" и изглеждаха като счупен крон. Всъщност някой admin натисна
   бутоните в „Днес": полето беше с фиксиран ten.tenev@temax.bg, а бутонът не
   се заключваше — дневният тръгна два пъти за секунда.

   Какво заковава тестът (с истински клик по onclick):
     1. полето е с имейла на НАТИСНАЛИЯ, не с фиксиран адрес; сивият текст
        казва, че тестът не е редовният отчет;
     2. двоен клик по „📋 Дневен" (и по „📊 Седмичен") докато данните се
        събират → ЕДНА заявка към resend-email; бутонът е заключен и се
        отключва след края; следващ клик пак праща (контрола);
     3. без имейл у потребителя полето е празно; клик → toast, нула заявки,
        данни не се събират; въведен на ръка адрес → праща (контрола);
     4. заключването е по вид: зает дневен не спира седмичния.

   Събирачите на данни са подменени с бавни фалшиви — те имат свои тестове;
   тук се мери лентата, а изпращането минава през истинския sendEmail
   (email.js), тоест броят се реалните POST-ове към resend-email.

   Пускане: node tests/today-report-test-bar.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const ADMIN = { email: 'm.ivanova@temax.bg', display_name: 'Мария Иванова', role: 'admin', store_name: 'Централен офис' };
const NOMAIL = { email: '', display_name: 'Без имейл', role: 'accounting', store_name: 'Централен офис' };

function env(user) {
  const h = boot({ modules: ['bulletin.js', 'email.js', 'today.js', 'report.js'], user: user, data: {} });
  const w = h.w;
  h.collected = { daily: 0, weekly: 0 };
  /* Бавни събирачи: данните идват след 40 ms, както реалните идват след
     секунди. Точно в този прозорец беше вторият клик на 15.09. */
  w.collectDailyReportData = function (cb) { h.collected.daily++; w.setTimeout(function () { cb({ reportDate: '2026-09-15' }); }, 40); };
  w.buildDailyReportHtml = function () { return '<p>дневен</p>'; };
  w.collectWeeklyReportData = function (cb) { h.collected.weekly++; w.setTimeout(function () { cb({ weekDates: [] }); }, 40); };
  w.buildWeeklyReportHtml = function () { return '<p>седмичен</p>'; };
  h.doc.body.insertAdjacentHTML('beforeend', w.todayReportTestBarHtml());
  return h;
}
const mails = h => h.calls.post.filter(p => /\/functions\/v1\/resend-email/.test(p.url));
const btnOf = (h, text) => Array.prototype.find.call(h.doc.querySelectorAll('button'), b => b.textContent.trim() === text) || null;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function settle(ms) { await wait(ms || 120); for (let i = 0; i < 4; i++) await ticks(); }

(async function () {

  section('1. Адресът е на натисналия; текстът казва какво е');
  {
    const h = env(ADMIN);
    const inp = h.doc.getElementById('today-report-email');
    if (ok('полето съществува', !!inp)) {
      ok('стойност = имейлът на потребителя', inp.value === ADMIN.email, inp.value);
      ok('фиксираният адрес го няма', h.doc.body.innerHTML.indexOf('ten.tenev@temax.bg') < 0);
    }
    const note = h.doc.getElementById('today-report-test-note');
    ok('сивият текст е там', !!note && note.textContent ===
      'Тестът праща днешния дневен / текущата седмица с данните към момента — не е редовният отчет (21:00)',
      note && note.textContent);
    ok('КОНТРОЛА: потребител без права не вижда лентата',
      (function () { const h2 = boot({ modules: ['bulletin.js', 'email.js', 'today.js', 'report.js'],
        user: { email: 's@temax.bg', role: 'manager', store_name: 'Троян' }, data: {} });
        return h2.w.todayReportTestBarHtml() === ''; })());
  }

  section('2. Двоен клик → едно писмо; бутонът се заключва и отключва');
  {
    const h = env(ADMIN);
    const b = btnOf(h, '📋 Дневен');
    if (ok('бутонът „📋 Дневен" е в лентата', !!b)) {
      guard('първи клик', () => realClick(h.w, b, 'Дневен'));
      ok('заключен веднага след клика', b.disabled === true);
      guard('втори клик в същата секунда', () => realClick(h.w, b, 'Дневен'));
      await settle();
      const m = mails(h);
      ok('ЕДНА заявка към resend-email', m.length === 1, m.length);
      ok('данните са събрани веднъж', h.collected.daily === 1, h.collected.daily);
      if (m[0]) {
        ok('до имейла на потребителя', JSON.stringify(m[0].body.to) === JSON.stringify([ADMIN.email]), JSON.stringify(m[0].body.to));
        ok('темата носи „(тест)"', /\(тест\)$/.test(m[0].body.subject), m[0].body.subject);
      }
      ok('отключен след края', b.disabled === false);
      guard('трети клик след края', () => realClick(h.w, b, 'Дневен'));
      await settle();
      ok('КОНТРОЛА: след отключване пак праща (2 общо)', mails(h).length === 2, mails(h).length);
    }
  }
  {
    const h = env(ADMIN);
    const b = btnOf(h, '📊 Седмичен');
    if (ok('бутонът „📊 Седмичен" е в лентата', !!b)) {
      realClick(h.w, b, 'Седмичен'); realClick(h.w, b, 'Седмичен');
      await settle();
      ok('седмичен: двоен клик → една заявка', mails(h).length === 1 && h.collected.weekly === 1, mails(h).length + '/' + h.collected.weekly);
    }
  }

  section('3. Без имейл → не праща');
  {
    const h = env(NOMAIL);
    const inp = h.doc.getElementById('today-report-email');
    ok('полето е празно', !!inp && inp.value === '', inp && inp.value);
    const b = btnOf(h, '📋 Дневен');
    guard('клик без адрес', () => realClick(h.w, b, 'Дневен'));
    await settle();
    ok('toast „Въведи имейл"', h.calls.toast.indexOf('Въведи имейл') >= 0, JSON.stringify(h.calls.toast));
    ok('нула заявки', mails(h).length === 0);
    ok('данни не се събират', h.collected.daily === 0);
    ok('бутонът не остава заключен', b.disabled === false);
    inp.value = 'rachno@temax.bg';
    realClick(h.w, b, 'Дневен');
    await settle();
    ok('КОНТРОЛА: въведен на ръка адрес → праща', mails(h).length === 1 &&
      JSON.stringify(mails(h)[0].body.to) === JSON.stringify(['rachno@temax.bg']), JSON.stringify(mails(h).map(x => x.body.to)));
  }

  section('4. Заключването е по вид отчет');
  {
    const h = env(ADMIN);
    realClick(h.w, btnOf(h, '📋 Дневен'), 'Дневен');
    realClick(h.w, btnOf(h, '📊 Седмичен'), 'Седмичен');
    await settle();
    ok('зает дневен не спира седмичния: 2 писма', mails(h).length === 2, mails(h).length);
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
