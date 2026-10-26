/* Бюлетин: дни до срок през смяната на часа.

   Три места в bulletin.js броят дни между две ЛОКАЛНИ полунощи:
     · promoStatus()    — daysToEnd, „изтичаща" промоция (≤5 дни);
     · bulDueLineHtml() — „(Днес!)" / „(N дни)" / просрочено, цвят;
     · renderSubtasks() — цвят на срока на подзадача.
   До 26.10.2026 това беше Math.ceil((due - t0)/86400000). През есенната
   смяна денят е 25 часа и ceil дава с 1 повече: събота 24.10.2026, срок
   понеделник 26.10 → 49 ч → „3" вместо 2 и без оранжевото. Срокът неделя
   25.10 от събота НЕ е засегнат — полунощта на 25.10 е още лятно време,
   разликата е точно 24 ч; грешката е при срок СЛЕД смяната. Сега е
   Math.round — разликата между две локални полунощи е цял брой дни ± 1 час.
   Пролетната смяна (23-часов ден) не греши и с ceil, но се проверява, че
   round не я е развалил.

   Поясът е Europe/Sofia, зададен ВЪТРЕ в процеса (Git Bash не подава TZ към
   Node). Часовникът се замразява на w.Date за всяка котва поотделно.

   Мутационна проверка (26.10.2026): върнат Math.ceil поотделно на всяко
   от трите места → тестът пада (exit 1) и при трите:
     1) promoStatus    → 1 ❌: „край 26.10 (5 дни през смяната) → expiring"
        (става active);
     2) bulDueLineHtml → 3 ❌: 24.10 → 26.10 „(2 дни)" (става без суфикс,
        сиво), 25.10 → 26.10 „(1 дни)" (става „(2 дни)"), 25.10 → 27.10
        „(2 дни)" (става без суфикс, сиво);
     3) renderSubtasks → 1 ❌: „неделя 25.10, срок 26.10 → оранжево".

   Пускане: node tests/bulletin-dst-days.test.js . */
'use strict';

process.env.TZ = 'Europe/Sofia';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const TR = 'Троян';
const SUBS = [{ id: 's-1', task_id: 't-1', recurring_task_id: null, title: 'Под през смяната', sort_order: 0,
  due_date: '2026-10-26', description: null, attachments: null }];

const h = boot({
  modules: ['bulletin.js'],
  user: { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: TR },
  data: {
    users: [{ store_name: TR }],
    subtask_completions: [],
    task_subtasks: url => (/task_id=eq\.t-1/.test(url) ? SUBS : [])
  }
});
const w = h.w, doc = h.doc;
const RealDate = w.Date;
function setNow(iso) {
  const ms = new RealDate(iso + 'T12:00:00').getTime();
  class Frozen extends RealDate {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = Frozen;
}
function due(iso) {
  const html = w.bulDueLineHtml(iso, null, ' ⚠️');
  const m = /color:(#[0-9a-f]{6})/i.exec(html);
  const s = /📅 Срок: [^<(⚠]*(.*)<\/div>$/.exec(html);
  return { color: m ? m[1] : null, suffix: s ? s[1].trim() : null, html: html };
}
function expectDue(anchor, iso, suffix, color) {
  setNow(anchor);
  const r = due(iso);
  ok(anchor + ' → ' + iso + ': „' + suffix + '", ' + color, r.suffix === suffix && r.color === color,
    JSON.stringify({ suffix: r.suffix, color: r.color }));
}
const ORANGE = '#d97706', RED = '#dc2626', GRAY = '#94a3b8';

(async function () {
  section('0. Поясът наистина е Europe/Sofia');
  ok('25.10.2026 00:00 е +03 (лятно)', new RealDate('2026-10-25T00:00:00').getTimezoneOffset() === -180);
  ok('26.10.2026 00:00 е +02 (зимно)', new RealDate('2026-10-26T00:00:00').getTimezoneOffset() === -120);
  ok('29.03.2027 00:00 е +03 (лятно)', new RealDate('2027-03-29T00:00:00').getTimezoneOffset() === -180);

  section('1. bulDueLineHtml — есенна смяна (котва събота 24.10.2026)');
  expectDue('2026-10-24', '2026-10-24', '(Днес!)', ORANGE);
  expectDue('2026-10-24', '2026-10-25', '(1 дни)', ORANGE);
  expectDue('2026-10-24', '2026-10-26', '(2 дни)', ORANGE);
  expectDue('2026-10-24', '2026-10-27', '', GRAY);
  expectDue('2026-10-24', '2026-10-23', '⚠️', RED);
  section('1б. bulDueLineHtml — котва неделя 25.10 (денят на смяната) и понеделник 26.10');
  expectDue('2026-10-25', '2026-10-26', '(1 дни)', ORANGE);
  expectDue('2026-10-25', '2026-10-27', '(2 дни)', ORANGE);
  expectDue('2026-10-26', '2026-10-25', '⚠️', RED);
  expectDue('2026-10-26', '2026-10-24', '⚠️', RED);

  section('2. bulDueLineHtml — пролетна смяна (котва събота 27.03.2027)');
  expectDue('2027-03-27', '2027-03-28', '(1 дни)', ORANGE);
  expectDue('2027-03-27', '2027-03-29', '(2 дни)', ORANGE);
  expectDue('2027-03-27', '2027-03-30', '', GRAY);
  expectDue('2027-03-27', '2027-03-26', '⚠️', RED);

  section('3. bulDueLineHtml — обикновена седмица (котва 14.10.2026), както преди');
  expectDue('2026-10-14', '2026-10-14', '(Днес!)', ORANGE);
  expectDue('2026-10-14', '2026-10-15', '(1 дни)', ORANGE);
  expectDue('2026-10-14', '2026-10-16', '(2 дни)', ORANGE);
  expectDue('2026-10-14', '2026-10-17', '', GRAY);
  expectDue('2026-10-14', '2026-10-13', '⚠️', RED);

  section('4. promoStatus — край през смяната (котва 21.10.2026)');
  setNow('2026-10-21');
  const promo = end => ({ start_date: '2026-10-01', end_date: end });
  ok('край 26.10 (5 дни през смяната) → expiring', w.promoStatus(promo('2026-10-26')) === 'expiring', w.promoStatus(promo('2026-10-26')));
  ok('край 27.10 (6 дни) → active, не expiring', w.promoStatus(promo('2026-10-27')) === 'active', w.promoStatus(promo('2026-10-27')));
  ok('край 25.10 (4 дни) → expiring', w.promoStatus(promo('2026-10-25')) === 'expiring');
  setNow('2026-10-14');
  ok('обикновена седмица: край 19.10 (5 дни) → expiring', w.promoStatus(promo('2026-10-19')) === 'expiring');
  ok('обикновена седмица: край 20.10 (6 дни) → active', w.promoStatus(promo('2026-10-20')) === 'active');

  section('5. renderSubtasks — срок 26.10, цветът през смяната');
  async function subColor(anchor) {
    setNow(anchor);
    if (!doc.querySelector('[data-sub-task="t-1"]')) doc.body.insertAdjacentHTML('beforeend', '<div data-sub-task="t-1"></div>');
    const box = doc.querySelector('[data-sub-task="t-1"]');
    box.innerHTML = '';
    guard('renderSubtasks() не хвърля (' + anchor + ')', () => w.renderSubtasks('t-1', 'trade'));
    for (let i = 0; i < 60 && !box.querySelector('input[data-stid]'); i++) { await new Promise(r => setTimeout(r, 10)); await ticks(); }
    const sp = Array.prototype.find.call(box.querySelectorAll('span'), s => s.textContent.indexOf('📅') === 0);
    const m = sp && /color:(#[0-9a-f]{6})/i.exec(sp.getAttribute('style') || '');
    return m ? m[1] : null;
  }
  ok('неделя 25.10, срок 26.10 (1 ден, 25 часа) → оранжево', (await subColor('2026-10-25')) === ORANGE);
  ok('събота 24.10, срок 26.10 (2 дни) → сиво', (await subColor('2026-10-24')) === GRAY);
  ok('понеделник 26.10, срок 26.10 → оранжево', (await subColor('2026-10-26')) === ORANGE);
  ok('вторник 27.10, срок 26.10 → червено', (await subColor('2026-10-27')) === RED);

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
