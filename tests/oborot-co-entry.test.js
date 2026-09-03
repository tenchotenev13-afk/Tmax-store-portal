/* Вечерен оборот — въвеждане и корекция от Централен офис.

   Поводът са два реални случая от 25.08.2026: Дупница пропуснаха оборота за
   24.08 и го въведоха на следващата сутрин — формата приема само днешния ден,
   затова вчерашните числа влязоха с ДНЕШНА дата. Поправката изискваше ръчен
   SQL, което не е процедура.

   СЪЩИНАТА на теста е една: записът от магазин отмята задачата „Вечерен
   оборот" в Бюлетина, а записът и корекцията от ЦО — НЕ. Затова навсякъде
   долу в данните СТОИ активна recurring_tasks задача с linked_module=oborot и
   ПРАЗЕН task_completions: ако кодът реши да отмята, POST-ът ще тръгне и
   проверката ще падне. Тест, който подава данни без какво да се отметне, не
   доказва нищо.

   Контролът срещу тавтологичност: махни реда `if(byCO)` в dtAfterSave()
   (daily-turnover.js) и секция 2 пада на „POST към task_completions НЕ тръгва".

   bulletin.js е в списъка заради toLocalISO(); kasa.js — заради kasaTabBar(),
   който daily-turnover.js вика при всеки рендер (правило 8).

   Пускане:  node tests/oborot-co-entry.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ── Потребители ────────────────────────────────────────────────────────── */
const CO_USER = {
  email: 'ivo@temax.bg', display_name: 'Иво Петров',
  role: 'accounting', store_name: 'Централен офис'
};
const STORE_USER = {
  email: 'dupnica@temax.bg', display_name: 'Мария Иванова',
  role: 'manager', store_name: 'Дупница'
};

const STORE_18 = ['Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово',
  'Козлодуй', 'Кърджали', 'Монтана', 'Петрич', 'Пирдоп', 'Раднево', 'Севлиево',
  'Силистра', 'Сливен', 'Троян', 'Търговище', 'Шумен'];
const USERS_ROWS = STORE_18
  .concat(['Централен офис', 'Логистичен склад Добрич'])
  .map(n => ({ store_name: n }));

/* Задачата в Бюлетина СЪЩЕСТВУВА и е активна, а отметки няма — тоест има
   какво да се отметне. Това е предпоставката, без която секция 2 е празна. */
const TASK_ROWS = [{ id: 'rt-oborot' }];

function rec(over) {
  return Object.assign({
    id: 'dt-1', store_name: 'Дупница', date: dayOffset(-1),
    total_turnover: 1000, cash_turnover: 600, card_turnover: 400,
    bank_turnover: 0, customers: 50, note: null,
    created_by: 'Мария Иванова', created_at: tsOffset(-1)
  }, over || {});
}

/* ── Рутер за daily_turnover ────────────────────────────────────────────────
   harness-ът връща целия масив за всяка GET заявка, независимо от филтрите.
   За Част 3 това е фатално: предварителната проверка „свободна ли е целевата
   дата" винаги би намирала редове и нито едно преместване не би минало —
   тоест тестът щеше да „минава" по грешна причина. Затова филтрите се
   изпълняват наистина. */
function dtRoute(rows) {
  return function (url) {
    const q = decodeURIComponent(url);
    let out = rows.slice();
    let m;
    if ((m = /[?&]date=eq\.([^&]+)/.exec(q))) out = out.filter(r => r.date === m[1]);
    if ((m = /[?&]store_name=eq\.([^&]+)/.exec(q))) out = out.filter(r => r.store_name === m[1]);
    if ((m = /[?&]date=gte\.([^&]+)/.exec(q))) out = out.filter(r => r.date >= m[1]);
    return out;
  };
}

function env(over) {
  over = over || {};
  const rows = over.rows || [];
  const data = Object.assign({
    daily_turnover: dtRoute(rows),
    users: USERS_ROWS,
    recurring_tasks: TASK_ROWS,
    task_completions: []
  }, over.data || {});
  delete over.rows; delete over.data;
  return boot(Object.assign({
    modules: ['bulletin.js', 'kasa.js', 'daily-turnover.js'],
    user: CO_USER,
    data: data
  }, over));
}

/* Зарежда изгледа и по избор превключва датата и обекта — точно както
   човекът пред екрана би направил. */
async function coView(opts) {
  opts = opts || {};
  const h = env(opts);
  h.w.loadOborot();
  await ticks();
  if (opts.date) { h.w.oborotSetDate(opts.date); await ticks(); }
  if (opts.store) { h.w.oborotSetCOStore(opts.store); await ticks(); }
  return h;
}

function fillCO(doc, total, cash, card, cust, note, bank) {
  const set = (id, val) => {
    const el = doc.getElementById(id);
    if (el) el.value = (val === undefined || val === null) ? '' : String(val);
  };
  set('dtco-total', total); set('dtco-cash', cash); set('dtco-card', card);
  set('dtco-customers', cust); set('dtco-note', note); set('dtco-bank', bank);
}

function fillEdit(doc, over) {
  Object.keys(over).forEach(k => {
    const el = doc.getElementById(k);
    if (el) el.value = String(over[k]);
  });
}

const dtPosts = h => h.calls.post.filter(p => p.table === 'daily_turnover');
const tcPosts = h => h.calls.post.filter(p => p.table === 'task_completions');
const dtPatches = h => h.calls.patch.filter(p => p.table === 'daily_turnover');
const tcPatches = h => h.calls.patch.filter(p => p.table === 'task_completions');
/* Всяко докосване на task_completions, независимо от метода. */
const tcTouched = h =>
  tcPosts(h).length + tcPatches(h).length +
  h.calls.del.filter(u => u.indexOf('task_completions') >= 0).length;

const AMBER = /#d97706|rgb\(217,\s*119,\s*6\)/;
const RED = /#dc2626|rgb\(220,\s*38,\s*38\)/;
function toastColor(h) {
  const el = h.doc.getElementById('toast');
  return el ? (el.style.background || '') : '';
}

(async function () {

  section('1. ЦО въвежда за МИНАЛ ден — формата се показва и записът минава');
  {
    const past = dayOffset(-1);
    const h = await coView({ rows: [], date: past, store: 'Дупница' });

    ok('има падащо меню за обект', !!h.doc.getElementById('dtco-store'));
    ok('има поле „Общ оборот" за ЦО', !!h.doc.getElementById('dtco-total'));
    ok('има поле „В брой"', !!h.doc.getElementById('dtco-cash'));
    ok('има поле „С карта"', !!h.doc.getElementById('dtco-card'));
    ok('има поле „По банка"', !!h.doc.getElementById('dtco-bank'));
    ok('има поле „Брой клиенти"', !!h.doc.getElementById('dtco-customers'));
    ok('има поле „Забележка"', !!h.doc.getElementById('dtco-note'));

    /* Магазинската форма НЕ се появява при ЦО — това са различни полета. */
    ok('магазинското поле dt-total го няма', !h.doc.getElementById('dt-total'));

    const b = btn(h.doc, 'Запиши оборота');
    if (ok('има бутон за запис', !!b)) {
      ok('бутонът НЕ е disabled за минал ден', !b.hasAttribute('disabled'));
      fillCO(h.doc, '6732.08', '6732.08', '0', '335');
      realClick(h.w, b, 'Запиши оборота');
      await ticks();

      const p = dtPosts(h);
      if (ok('тръгва POST към daily_turnover', p.length === 1, 'POST-ове: ' + p.length)) {
        ok('датата е ИЗБРАНАТА, не днешната', p[0].body.date === past, p[0].body.date);
        ok('и не е днес', p[0].body.date !== h.w.dtToday());
        ok('обектът е избраният от менюто', p[0].body.store_name === 'Дупница');
        ok('total_turnover = 6732.08', p[0].body.total_turnover === 6732.08);
        ok('customers = 335 (число)', p[0].body.customers === 335);
        ok('created_by е човекът от ЦО', p[0].body.created_by === 'Иво Петров');
      }
    }
  }
  {
    /* Обектът се избира, а не се подразбира: без избор няма форма. */
    const h = await coView({ rows: [], date: dayOffset(-1) });
    ok('без избран обект няма поле за въвеждане', !h.doc.getElementById('dtco-total'));
    ok('без избран обект няма бутон за запис', !btn(h.doc, 'Запиши оборота'));
    ok('но менюто за избор го има', !!h.doc.getElementById('dtco-store'));
    ok('и се обяснява какво се чака',
      !!h.doc.getElementById('dtco-hint'));
  }

  section('2. СЪЩИНАТА — запис от ЦО НЕ отмята задачата в Бюлетина');
  {
    const h = await coView({ rows: [], date: dayOffset(-1), store: 'Дупница' });
    fillCO(h.doc, '1000', '600', '400', '50');
    realClick(h.w, btn(h.doc, 'Запиши оборота'), 'Запиши оборота');
    await ticks(); await ticks();

    ok('POST към daily_turnover ТРЪГВА', dtPosts(h).length === 1);
    ok('POST към task_completions НЕ тръгва', tcPosts(h).length === 0,
      JSON.stringify(tcPosts(h).map(p => p.body)));
    ok('task_completions не е докосната по никакъв начин', tcTouched(h) === 0);
    /* Ако кодът изобщо не беше поглеждал задачата, горното щеше да мине и
       без разделянето. Затова се проверява и че данните ГО ПОЗВОЛЯВАХА. */
    ok('данните съдържаха активна задача, тоест имаше какво да се отметне',
      TASK_ROWS.length === 1);
  }
  {
    /* ⚠️ Критерият е КОЙ въвежда, не ЗА КОГА. ЦО не отмята и за днешния ден. */
    const h = await coView({ rows: [], date: dayOffset(0), store: 'Дупница' });
    fillCO(h.doc, '1000', '600', '400', '50');
    realClick(h.w, btn(h.doc, 'Запиши оборота'), 'Запиши оборота');
    await ticks(); await ticks();

    ok('запис от ЦО за ДНЕШНА дата пак минава', dtPosts(h).length === 1);
    ok('датата е днешната', dtPosts(h)[0].body.date === h.w.dtToday());
    ok('и пак НЯМА отметка — критерият не е датата', tcTouched(h) === 0,
      'докосвания: ' + tcTouched(h));
  }

  section('3. Бъдещ ден — бутонът е disabled и заявка не тръгва');
  {
    const h = await coView({ rows: [], date: dayOffset(1), store: 'Дупница' });
    const b = btn(h.doc, 'Запиши оборота');
    if (ok('бутонът СЪЩЕСТВУВА (не се крие)', !!b)) {
      ok('бутонът е <button>', b.tagName === 'BUTTON');
      ok('бутонът е disabled', b.hasAttribute('disabled'));
      ok('и казва защо', (b.getAttribute('title') || '') === 'Денят още не е настъпил',
        b.getAttribute('title'));

      /* jsdom изпълнява onclick и на disabled бутон — точно затова
         проверката е и в самия обработчик, а не само в markup-а. */
      fillCO(h.doc, '1000', '600', '400', '50');
      realClick(h.w, b, 'Запиши оборота');
      await ticks();
      ok('кликът НЕ праща POST', dtPosts(h).length === 0);
      ok('и казва причината', h.calls.toast.some(t => /Денят още не е настъпил/.test(t)),
        JSON.stringify(h.calls.toast));
      ok('toast-ът е ЧЕРВЕН', RED.test(toastColor(h)), toastColor(h));
    }
  }

  section('4. Модалът за корекция се отваря с ТЕКУЩИТЕ стойности');
  {
    const day = dayOffset(-1);
    const row = rec({
      id: 'dt-fix', date: day, total_turnover: 1000, cash_turnover: 600,
      card_turnover: 400, bank_turnover: 25, customers: 50, note: 'вечерна смяна'
    });
    const h = await coView({ rows: [row], date: day });

    const pencil = h.doc.querySelector('#dt-co-table button.dt-edit');
    if (ok('всеки ред в справката има бутон ✏️', !!pencil)) {
      ok('и е <button>', pencil.tagName === 'BUTTON');
      realClick(h.w, pencil, '✏️');
      await ticks();
    }

    const ov = h.doc.getElementById('dt-edit-ov');
    if (ok('модалът се отваря', !!ov)) {
      const val = id => (h.doc.getElementById(id) || {}).value;
      ok('общ оборот е зареден, не празен', val('dt-ed-total') === '1000', val('dt-ed-total'));
      ok('в брой е зареден', val('dt-ed-cash') === '600', val('dt-ed-cash'));
      ok('с карта е зареден', val('dt-ed-card') === '400', val('dt-ed-card'));
      ok('по банка е зареден', val('dt-ed-bank') === '25', val('dt-ed-bank'));
      ok('брой клиенти е зареден', val('dt-ed-customers') === '50', val('dt-ed-customers'));
      ok('забележката е заредена', val('dt-ed-note') === 'вечерна смяна', val('dt-ed-note'));
      ok('датата е заредена', val('dt-ed-date') === day, val('dt-ed-date'));
      ok('датата не приема бъдещ ден (max)',
        (h.doc.getElementById('dt-ed-date') || {}).getAttribute('max') === h.w.dtToday());
      ok('обектът се вижда, но не се сменя от модала',
        ov.textContent.indexOf('Дупница') >= 0 && !h.doc.getElementById('dt-ed-store'));
      ok('има бутон „Запиши корекцията"', !!btn(h.doc, 'Запиши корекцията'));
      ok('има бутон „Откажи"', !!btn(h.doc, 'Откажи'));
    }
  }

  section('5. Корекцията е sbPatch, не нов ред — и не пипа Бюлетина');
  {
    const day = dayOffset(-1);
    const row = rec({ id: 'dt-fix', date: day, note: 'вечерна смяна' });
    const h = await coView({ rows: [row], date: day });
    realClick(h.w, h.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();

    fillEdit(h.doc, { 'dt-ed-total': '1200', 'dt-ed-cash': '800' });
    realClick(h.w, btn(h.doc, 'Запиши корекцията'), 'Запиши корекцията');
    await ticks(); await ticks();

    const pt = dtPatches(h);
    if (ok('тръгва PATCH към daily_turnover', pt.length === 1, 'PATCH-ове: ' + pt.length)) {
      ok('НЕ тръгва нов POST (уникално store_name+date)', dtPosts(h).length === 0);
      ok('филтърът е по id на записа', /id=eq\.dt-fix/.test(pt[0].url), pt[0].url);
      ok('новите числа са в тялото',
        pt[0].body.total_turnover === 1200 && pt[0].body.cash_turnover === 800);
      ok('датата НЕ влиза в тялото, щом не е сменяна', !('date' in pt[0].body),
        JSON.stringify(pt[0].body.date));
      ok('обектът не се променя от модала', !('store_name' in pt[0].body));
    }
    ok('task_completions не е докосната при корекция', tcTouched(h) === 0);
    ok('казва, че корекцията е записана',
      h.calls.toast.some(t => /Корекцията е записана/.test(t)), JSON.stringify(h.calls.toast));
    ok('модалът се затваря след успех', !h.doc.getElementById('dt-edit-ov'));
  }

  section('6. Следата от корекцията — задължителна и с граница');
  {
    const day = dayOffset(-1);
    const row = rec({ id: 'dt-fix', date: day, note: 'вечерна смяна' });
    const h = await coView({ rows: [row], date: day });
    realClick(h.w, h.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();
    fillEdit(h.doc, { 'dt-ed-total': '1200', 'dt-ed-cash': '800' });
    realClick(h.w, btn(h.doc, 'Запиши корекцията'), 'Запиши корекцията');
    await ticks(); await ticks();

    const note = (dtPatches(h)[0] || { body: {} }).body.note || '';
    ok('старата забележка е ЗАПАЗЕНА', note.indexOf('вечерна смяна') >= 0, note);
    ok('носи следа „Коригирано <дата> от <име>: <какво>"',
      /^Коригирано \d{2}\.\d{2}\.\d{4} от Иво Петров: /m.test(note), note);
    ok('следата казва КАКВО е променено',
      /общ 1000\.00 EUR → 1200\.00 EUR/.test(note), note);
    ok('и не приписва промяна на непипнатите полета',
      note.indexOf('клиенти') < 0 && note.indexOf('дата ') < 0, note);
  }
  {
    /* Няколко корекции подред не бива да раздуват note безкрайно. */
    const day = dayOffset(-1);
    const old = ['основна забележка',
      'Коригирано 01.01.2026 от А: общ 1.00 EUR → 2.00 EUR',
      'Коригирано 02.01.2026 от Б: общ 2.00 EUR → 3.00 EUR',
      'Коригирано 03.01.2026 от В: общ 3.00 EUR → 4.00 EUR'].join('\n');
    const h = await coView({ rows: [rec({ id: 'dt-fix', date: day, note: old })], date: day });
    realClick(h.w, h.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();
    ok('в полето стои САМО собствената забележка, без следите',
      (h.doc.getElementById('dt-ed-note') || {}).value === 'основна забележка',
      (h.doc.getElementById('dt-ed-note') || {}).value);

    fillEdit(h.doc, { 'dt-ed-total': '1200', 'dt-ed-cash': '800' });
    realClick(h.w, btn(h.doc, 'Запиши корекцията'), 'Запиши корекцията');
    await ticks(); await ticks();

    const note = (dtPatches(h)[0] || { body: {} }).body.note || '';
    const trail = note.split('\n').filter(l => /^Коригирано /.test(l));
    ok('следите са ограничени до 3', trail.length === 3, 'редове: ' + trail.length);
    ok('най-старата отпада', note.indexOf('01.01.2026') < 0, note);
    ok('предпоследните се пазят',
      note.indexOf('02.01.2026') >= 0 && note.indexOf('03.01.2026') >= 0, note);
    ok('основната забележка пак е там', note.indexOf('основна забележка') >= 0);
    ok('и е ПРЕДИ следите',
      note.indexOf('основна забележка') < note.indexOf('Коригирано'), note);
  }

  section('7. Валидацията при корекция е СЪЩАТА, не втора');
  {
    /* Прагът е този от 26.08.2026: блокира се над greatest(1, total*0.1).
       ⚠️ Заданието описва стария праг от 50% и очаква 29,7% да МИНАВА —
       това е остаряло. Изричното изискване „преизползвай съществуващата
       проверка" е по-силно, затова тук се закова ПАРИТЕТ с въвеждането:
       и двата пътя блокират 29,7%. Разминат ли се двата, тази секция пада. */
    const day = dayOffset(-1);
    const row = rec({ id: 'dt-fix', date: day, note: 'x' });

    const h1 = await coView({ rows: [row], date: day });
    realClick(h1.w, h1.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();
    fillEdit(h1.doc, { 'dt-ed-total': '6732', 'dt-ed-cash': '6232', 'dt-ed-card': '0', 'dt-ed-bank': '0' });
    realClick(h1.w, btn(h1.doc, 'Запиши корекцията'), 'Запиши');
    await ticks(); await ticks();
    ok('разминаване 500 при 6732 (7,4%) → МИНАВА', dtPatches(h1).length === 1);
    ok('но не мълчаливо — жълто предупреждение',
      h1.calls.toast.some(t => /Сумите не се връзват с 500\.00 EUR/.test(t)),
      JSON.stringify(h1.calls.toast));

    const h2 = await coView({ rows: [row], date: day });
    realClick(h2.w, h2.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();
    fillEdit(h2.doc, { 'dt-ed-total': '6732', 'dt-ed-cash': '4732', 'dt-ed-card': '0', 'dt-ed-bank': '0' });
    realClick(h2.w, btn(h2.doc, 'Запиши корекцията'), 'Запиши');
    await ticks(); await ticks();
    ok('разминаване 2000 при 6732 (29,7%) → БЛОКИРА, както при въвеждане',
      dtPatches(h2).length === 0);
    ok('toast-ът е ЧЕРВЕН', RED.test(toastColor(h2)), toastColor(h2));

    const h3 = await coView({ rows: [row], date: day });
    realClick(h3.w, h3.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();
    fillEdit(h3.doc, { 'dt-ed-total': '768125', 'dt-ed-cash': '7681.25', 'dt-ed-card': '0', 'dt-ed-bank': '0' });
    realClick(h3.w, btn(h3.doc, 'Запиши корекцията'), 'Запиши');
    await ticks(); await ticks();
    ok('99% разминаване → БЛОКИРА', dtPatches(h3).length === 0);
    ok('съобщението казва и размера, и допустимото',
      h3.calls.toast.some(t => /допустимо е до .* \(10% от оборота\)/.test(t)),
      JSON.stringify(h3.calls.toast));

    const h4 = await coView({ rows: [row], date: day });
    realClick(h4.w, h4.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();
    fillEdit(h4.doc, { 'dt-ed-customers': '-5' });
    realClick(h4.w, btn(h4.doc, 'Запиши корекцията'), 'Запиши');
    await ticks(); await ticks();
    ok('отрицателен брой клиенти → блокира и при корекция', dtPatches(h4).length === 0);
  }
  {
    /* Едно и също правило, дословно: dtValidate() е ЕДНА функция. */
    const h = await coView({ rows: [], date: dayOffset(-1) });
    const a = h.w.dtValidate(6732, 4732, 0, 0, 250);
    ok('dtValidate блокира 29,7%', a.ok === false);
    const b = h.w.dtValidate(1000, 900, 0, 0, 10);
    ok('точно на прага (100 при 1000) минава', b.ok === true);
    const c = h.w.dtValidate(1000, 899, 0, 0, 10);
    ok('един лев над прага блокира', c.ok === false);
    const d = h.w.dtValidate(100.05, 50, 50, 0, 25);
    ok('0,05 минава без предупреждение', d.ok === true && d.soft === false);
    const e = h.w.dtValidate(102, 40, 35, 25, 25);
    ok('банката влиза в сбора', e.ok === true && Math.abs(e.diff) === 2);
  }

  section('8. ЧАСТ 3 — смяна на датата');
  {
    /* Случаят с Дупница: числата са верни, датата е грешна. */
    const wrong = dayOffset(0), right = dayOffset(-1);
    const row = rec({ id: 'dt-fix', date: wrong, note: null });
    const h = await coView({ rows: [row], date: wrong });
    realClick(h.w, h.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();
    fillEdit(h.doc, { 'dt-ed-date': right });
    realClick(h.w, btn(h.doc, 'Запиши корекцията'), 'Запиши корекцията');
    await ticks(); await ticks();

    const pt = dtPatches(h);
    if (ok('свободна целева дата → PATCH тръгва', pt.length === 1, 'PATCH-ове: ' + pt.length)) {
      ok('новата дата е в тялото', pt[0].body.date === right, pt[0].body.date);
      ok('следата отбелязва и преместването',
        /дата \d{2}\.\d{2}\.\d{4} → \d{2}\.\d{2}\.\d{4}/.test(pt[0].body.note || ''),
        pt[0].body.note);
    }
    ok('task_completions пак не се пипа — отметката не следва датата',
      tcTouched(h) === 0);
  }
  {
    /* Заета целева дата: разбираемо съобщение, не сурова грешка от базата. */
    const wrong = dayOffset(0), taken = dayOffset(-1);
    const rows = [
      rec({ id: 'dt-fix', store_name: 'Дупница', date: wrong }),
      rec({ id: 'dt-old', store_name: 'Дупница', date: taken })
    ];
    const h = await coView({ rows: rows, date: wrong });
    realClick(h.w, h.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();
    fillEdit(h.doc, { 'dt-ed-date': taken });
    realClick(h.w, btn(h.doc, 'Запиши корекцията'), 'Запиши корекцията');
    await ticks(); await ticks();

    ok('заявка за запис НЕ тръгва', dtPatches(h).length === 0);
    ok('съобщението е разбираемо, а не от базата',
      h.calls.toast.some(t => t === 'За тази дата вече има подаден оборот от този обект.'),
      JSON.stringify(h.calls.toast));
    ok('никъде не изтича „duplicate key" / „unique constraint"',
      !h.calls.toast.some(t => /duplicate key|unique constraint/i.test(t)));
    ok('toast-ът е ЧЕРВЕН', RED.test(toastColor(h)), toastColor(h));
    ok('модалът остава отворен, за да се поправи датата',
      !!h.doc.getElementById('dt-edit-ov'));
  }
  {
    /* Зает е ДРУГ обект на същата дата — това НЕ пречи. */
    const wrong = dayOffset(0), target = dayOffset(-1);
    const rows = [
      rec({ id: 'dt-fix', store_name: 'Дупница', date: wrong }),
      rec({ id: 'dt-oth', store_name: 'Враца', date: target })
    ];
    const h = await coView({ rows: rows, date: wrong });
    realClick(h.w, h.doc.querySelector('#dt-co-table button.dt-edit[onclick*="dt-fix"]'), '✏️');
    await ticks();
    fillEdit(h.doc, { 'dt-ed-date': target });
    realClick(h.w, btn(h.doc, 'Запиши корекцията'), 'Запиши корекцията');
    await ticks(); await ticks();
    ok('чужд запис на целевата дата не блокира преместването',
      dtPatches(h).length === 1, JSON.stringify(h.calls.toast));
  }
  {
    /* Бъдеща дата от модала също не се приема. */
    const day = dayOffset(-1);
    const h = await coView({ rows: [rec({ id: 'dt-fix', date: day })], date: day });
    realClick(h.w, h.doc.querySelector('#dt-co-table button.dt-edit'), '✏️');
    await ticks();
    fillEdit(h.doc, { 'dt-ed-date': dayOffset(1) });
    realClick(h.w, btn(h.doc, 'Запиши корекцията'), 'Запиши корекцията');
    await ticks(); await ticks();
    ok('преместване в бъдещето → PATCH не тръгва', dtPatches(h).length === 0);
    ok('и казва защо', h.calls.toast.some(t => /Денят още не е настъпил/.test(t)));
  }

  section('9. ЧАСТ 4 — знак „ЦО" в справката, без втора заявка');
  {
    const day = dayOffset(-1);
    const rows = [
      rec({ id: 'a', store_name: 'Дупница', date: day, note: 'Въведено от ЦО на 26.08.2026 от Иво Петров' }),
      rec({ id: 'b', store_name: 'Враца', date: day, note: 'обичайна вечер' }),
      rec({ id: 'c', store_name: 'Троян', date: day, note: 'смяна\nКоригирано 26.08.2026 от Иво Петров: общ 1.00 EUR → 2.00 EUR' })
    ];
    const h = await coView({ rows: rows, date: day });
    const tbl = h.doc.getElementById('dt-co-table');
    const trs = Array.prototype.slice.call(tbl.querySelectorAll('tr'));
    const rowOf = n => trs.find(t => {
      const c = t.querySelector('td');
      return c && c.textContent.trim().indexOf(n) === 0;
    });
    const badged = n => { const r = rowOf(n); return !!(r && r.querySelector('span.dt-co-badge')); };

    ok('въведеното от ЦО носи бадж', badged('Дупница'));
    ok('коригираното от ЦО носи бадж', badged('Троян'));
    ok('подаденото от магазина НЕ носи бадж', !badged('Враца'));
    ok('баджовете са точно два', tbl.querySelectorAll('span.dt-co-badge').length === 2,
      'намерени: ' + tbl.querySelectorAll('span.dt-co-badge').length);
    ok('баджът пише „ЦО"',
      rowOf('Дупница').querySelector('span.dt-co-badge').textContent.trim() === 'ЦО');
    ok('името на обекта остава в НАЧАЛОТО на клетката',
      rowOf('Дупница').querySelector('td').textContent.trim().indexOf('Дупница') === 0);

    /* Без втора заявка: единствените GET-ове са тези от зареждането. */
    const gets = h.calls.get;
    ok('няма заявка към users заради баджа',
      gets.filter(u => /\/users\?/.test(u)).length <= 1,
      gets.filter(u => /\/users\?/.test(u)).join(' | '));
    ok('няма нова таблица в заявките',
      !gets.some(u => /user_roles|profiles/.test(u)));

    /* Забележка на магазин с думата „Коригирано" вътре в текста не лъже. */
    ok('думата „Коригирано" в средата на ред НЕ прави бадж',
      h.w.dtByCO({ note: 'после Коригирано 26.08.2026 от някой: нещо' }) === false);
    ok('ред без дата във формата на следата НЕ прави бадж',
      h.w.dtByCO({ note: 'Коригирано вчера от мен' }) === false);
    ok('празна забележка → без бадж', h.w.dtByCO({ note: null }) === false);
  }
  {
    /* Записът от ЦО реално получава следа — оттам идва баджът след
       презареждане. Проверява се тялото на POST-а. */
    const h = await coView({ rows: [], date: dayOffset(-1), store: 'Дупница' });
    fillCO(h.doc, '1000', '600', '400', '50', 'по телефон от магазина');
    realClick(h.w, btn(h.doc, 'Запиши оборота'), 'Запиши оборота');
    await ticks();
    const note = (dtPosts(h)[0] || { body: {} }).body.note || '';
    ok('забележката на оператора се запазва',
      note.indexOf('по телефон от магазина') >= 0, note);
    ok('и носи следа „Въведено от ЦО"',
      /^Въведено от ЦО на \d{2}\.\d{2}\.\d{4} от Иво Петров$/m.test(note), note);
    ok('следата прави записа разпознаваем', h.w.dtByCO({ note: note }) === true);
  }

  section('10. Обект с вече подаден оборот → записът, не форма');
  {
    const day = dayOffset(-1);
    const h = await coView({
      rows: [rec({ id: 'dt-1', store_name: 'Дупница', date: day, total_turnover: 4321.5 })],
      date: day, store: 'Дупница'
    });
    ok('няма поле за въвеждане', !h.doc.getElementById('dtco-total'));
    ok('вместо това се показва записът', !!h.doc.getElementById('dtco-existing'));
    ok('с числата', h.doc.getElementById('dtco-existing').textContent.indexOf('4321.50') >= 0);
    const b = btn(h.doc.getElementById('dtco-existing'), 'Коригирай записа');
    if (ok('и с бутон за корекция', !!b)) {
      realClick(h.w, b, 'Коригирай записа');
      await ticks();
      ok('бутонът отваря модала', !!h.doc.getElementById('dt-edit-ov'));
    }
  }

  section('11. РЕГРЕСИЯ — магазинът остава както е бил');
  {
    const h = env({ user: STORE_USER, rows: [] });
    h.w.loadOborot();
    await ticks();

    ok('магазинът вижда своята форма', !!h.doc.getElementById('dt-total'));
    ok('магазинът НЯМА избор на дата', !h.doc.getElementById('dt-co-date'));
    ok('магазинът НЯМА избор на обект', !h.doc.getElementById('dtco-store'));
    ok('магазинът НЯМА форма на ЦО', !h.doc.getElementById('dtco-form'));
    ok('магазинът НЯМА бутон ✏️', !h.doc.querySelector('button.dt-edit'));

    const b = btn(h.doc, 'Запиши оборота');
    if (ok('бутонът за запис е налице', !!b)) {
      h.doc.getElementById('dt-total').value = '1000';
      h.doc.getElementById('dt-cash').value = '600';
      h.doc.getElementById('dt-card').value = '400';
      h.doc.getElementById('dt-customers').value = '50';
      realClick(h.w, b, 'Запиши оборота');
      await ticks(); await ticks(); await ticks();

      ok('оборотът се записва', dtPosts(h).length === 1);
      ok('датата е ДНЕШНАТА, без избор', dtPosts(h)[0].body.date === h.w.dtToday());
      ok('и задачата в Бюлетина СЕ отмята', tcPosts(h).length === 1,
        'task_completions POST-ове: ' + tcPosts(h).length);
      if (tcPosts(h).length === 1) {
        const tc = tcPosts(h)[0].body;
        ok('отметката е за неговия обект', tc.store_name === 'Дупница');
        ok('и за днешния ден', tc.completion_date === h.w.dtToday());
        ok('със статус done', tc.status === 'done');
      }
      ok('записът от магазина НЕ носи следа „ЦО"',
        !h.w.dtByCO({ note: dtPosts(h)[0].body.note }));
    }
  }
  {
    /* Подаден запис за днес: само за четене, без редакция — правилото за
       магазина не се променя. */
    const h = env({
      user: STORE_USER,
      rows: [rec({ id: 'dt-t', store_name: 'Дупница', date: dayOffset(0), note: 'вечерна смяна' })]
    });
    h.w.loadOborot();
    await ticks();
    ok('няма поле за въвеждане', !h.doc.getElementById('dt-total'));
    ok('няма бутон „Редактирай"', !btn(h.doc, 'Редактирай'));
    ok('няма бутон „Коригирай"', !btn(h.doc, 'Коригирай'));
    ok('няма бутон ✏️', !h.doc.querySelector('button.dt-edit'));
    ok('няма модал за корекция', !h.doc.getElementById('dt-edit-ov'));
    ok('записът се вижда', h.doc.getElementById('mod-kasa').textContent.indexOf('вечерна смяна') >= 0);
  }
  {
    /* Дори при пряко извикване — глобалните функции не са защита сами по
       себе си, затова проверката е в обработчика. */
    const h = env({ user: STORE_USER, rows: [rec({ id: 'dt-t', date: dayOffset(0) })] });
    h.w.loadOborot();
    await ticks();
    h.w.oborotCORows = [rec({ id: 'dt-t', date: dayOffset(0) })];
    guard('openOborotEdit() от магазин не хвърля', () => h.w.openOborotEdit('dt-t'));
    ok('модал не се отваря за магазин', !h.doc.getElementById('dt-edit-ov'));
    guard('submitOborotCO() от магазин не хвърля', () => h.w.submitOborotCO());
    ok('и POST не тръгва', dtPosts(h).length === 0);
    ok('казва, че няма право',
      h.calls.toast.some(t => /Нямаш право/.test(t)), JSON.stringify(h.calls.toast));
  }

  section('12. Регресионни закотвяния в изходния код');
  {
    const src = fs.readFileSync(path.join(ROOT, 'daily-turnover.js'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    /* Едно ЕДИНСТВЕНО извикване извън дефиницията — иначе разделянето
       „кой въвежда" може да бъде заобиколено от втори път. Двете срещания
       са `function dtMarkBulletinTask(){` и самото извикване. */
    ok('dtMarkBulletinTask() се среща точно два пъти: дефиниция + едно извикване',
      (code.match(/dtMarkBulletinTask\(\)/g) || []).length === 2,
      'срещания: ' + (code.match(/dtMarkBulletinTask\(\)/g) || []).length);
    ok('и единственото извикване е вътре в dtAfterSave()',
      /function dtAfterSave\(byCO\)\{[^]*?dtMarkBulletinTask\(\)[^]*?\n\}/.test(code));
    ok('пътят на ЦО подава true на dtAfterSave', /dtAfterSave\(true\)/.test(code));
    ok('пътят на магазина подава false', /dtAfterSave\(false\)/.test(code));
    ok('в task_completions се пише на ЕДНО място',
      (code.match(/sbPost\('task_completions'/g) || []).length === 1,
      'записи: ' + (code.match(/sbPost\('task_completions'/g) || []).length);
    ok('и няма PATCH/DELETE по нея',
      !/sbPatch\('task_completions'|sbDelete\('task_completions'/.test(code));
    ok('корекцията минава през sbPatch, не през sbPost',
      /sbPatch\('daily_turnover'/.test(code));
    ok('проверката за числата е ЕДНА функция',
      (code.match(/function dtValidate/g) || []).length === 1);
    ok('и се ползва от трите пътя',
      (code.match(/dtValidate\(/g) || []).length === 4,
      'извиквания+дефиниция: ' + (code.match(/dtValidate\(/g) || []).length);
    ok('не ползва today() от shared.js', !/[^A-Za-z]today\(\)/.test(code));
    ok('не предефинира toLocalISO()', !/function\s+toLocalISO/.test(src));
    ok('емоджитата са HTML entity-та', !/[\uD800-\uDBFF]/.test(src));
    ok('index.html не е нужен за модала (строи се в JS)',
      /createElement\('div'\)/.test(code) && /dt-edit-ov/.test(code));
  }

  report();
})();
