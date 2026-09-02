/* Таб „Чек лист" — редакцията от контролинга.

   ВСИЧКИ кликове тук са ИСТИНСКИ: element.click(), не harness.realClick() и
   не проверка на markup. Разликата не е формална — клетките нарочно се
   закачат с addEventListener, защото inline onclick НЕ се изпълнява при
   element.click() под jsdom с runScripts:'outside-only'. realClick()
   заобикаля това с eval на атрибута, тоест би тествал АТРИБУТА, не кликването.

   Какво пази този файл:
   1. КРЪГЪТ. null → da → ne → (nyamat) → null. „Нямат" съществува само за
      yes_no_none; изтече ли в yes_no, контролингът получава стойност, която
      бланката не признава за този показател.
   2. ЕДИН РЕД, НЕ ВТОРИ. Записът е upsert по (year, week_number, store_name,
      metric_key). Втори клик трябва да обнови същия ред.
   3. ВРЪЩАНЕ НАЗАД ПРИ ГРЕШКА. Поуката от autoCreateReturnFromDiff():
      неуспешен запис, чийто резултат остава на екрана, е по-лош от липсваща
      функция — човекът вижда отметка, базата не я знае, и никой не разбира.
   4. ДОСТЪПЪТ СЕ ПРОВЕРЯВА И ПРИ КЛИКА, не само при закачането.

   Пускане:  node tests/checklist-edit.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const USERS = [
  'Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово',
  'Козлодуй', 'Кърджали', 'Логистичен склад Добрич', 'Логистичен склад Търговище',
  'Монтана', 'Петрич', 'Пирдоп', 'Раднево', 'Севлиево', 'Силистра',
  'Сливен', 'Троян', 'Търговище', 'Централен офис', 'Шумен', 'Шумен'
].map(function (s) { return { store_name: s }; });

const METRICS = [
  { key: 'revizia_953',     label: 'ревизия',                 sublabel: '953',              value_type: 'yes_no',      sort_order: 1, active: true },
  { key: 'storna_priem',    label: 'Сторна по грешни приеми', sublabel: 'брой',             value_type: 'number',      sort_order: 2, active: true },
  { key: 'preocenka',       label: 'преоценка',               sublabel: 'подадено в срок',  value_type: 'yes_no_none', sort_order: 3, active: true }
];

const ADMIN   = { id: 'u-1', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'admin',   store_name: 'Централен офис' };
const MANAGER = { id: 'u-2', email: 'shumen@temax.bg',   display_name: 'Шумен',     role: 'manager', store_name: 'Шумен' };

function env(rows, user, fail) {
  const opts = {
    modules: ['bulletin.js', 'checklist.js'],
    user: user || ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: rows || []
    }
  };
  if (fail) opts.fail = fail;
  return boot(opts);
}

function bodyRows(doc) {
  const t = doc.getElementById('checklist-table');
  return t ? Array.prototype.slice.call(t.querySelectorAll('tbody tr')) : [];
}
function rowOf(doc, store) {
  return bodyRows(doc).filter(function (tr) {
    const first = tr.querySelector('td');
    return first && first.textContent.trim() === store;
  })[0] || null;
}
function cellOf(doc, store, metricKey) {
  const tr = rowOf(doc, store);
  if (!tr) return null;
  const i = METRICS.map(function (m) { return m.key; }).indexOf(metricKey);
  if (i < 0) return null;
  return tr.querySelectorAll('td')[i + 1] || null;
}
function valOf(doc, store, metricKey) {
  const c = cellOf(doc, store, metricKey);
  if (!c) return null;
  const v = c.querySelector('.cl-val');
  return v ? v.textContent.trim() : '';
}
/* ИСТИНСКИ клик. Връща false, ако клетката липсва — за да не изглежда
   „нищо не се случи" като успешна проверка за роля без права. */
function clickCell(doc, store, metricKey) {
  const c = cellOf(doc, store, metricKey);
  if (!c) return false;
  c.click();
  return true;
}
function postsTo(h, table) {
  return h.calls.post.filter(function (p) { return (p.url || '').indexOf('/' + table) >= 0; });
}

(async function () {

  /* ── 1. Кръгът на yes_no ─────────────────────────────────────────────── */
  section('1. yes_no: null → да → не → празно');
  {
    const h = env([]);
    h.w.loadChecklist();
    await ticks();

    ok('старт: празна клетка', valOf(h.doc, 'Враца', 'revizia_953') === '',
       JSON.stringify(valOf(h.doc, 'Враца', 'revizia_953')));

    if (ok('клетката се кликва', clickCell(h.doc, 'Враца', 'revizia_953'))) {
      await ticks();
      ok('1-ви клик → „да"', valOf(h.doc, 'Враца', 'revizia_953') === 'да',
         JSON.stringify(valOf(h.doc, 'Враца', 'revizia_953')));

      clickCell(h.doc, 'Враца', 'revizia_953'); await ticks();
      ok('2-ри клик → „не"', valOf(h.doc, 'Враца', 'revizia_953') === 'не',
         JSON.stringify(valOf(h.doc, 'Враца', 'revizia_953')));

      clickCell(h.doc, 'Враца', 'revizia_953'); await ticks();
      ok('3-ти клик → пак празно (кръгът се затваря)',
         valOf(h.doc, 'Враца', 'revizia_953') === '',
         JSON.stringify(valOf(h.doc, 'Враца', 'revizia_953')));

      clickCell(h.doc, 'Враца', 'revizia_953'); await ticks();
      ok('4-ти клик → пак „да" (кръгът се върти)',
         valOf(h.doc, 'Враца', 'revizia_953') === 'да');
    }
    h.close();
  }

  /* ── 2. „Нямат" не изтича в yes_no ───────────────────────────────────── */
  section('2. yes_no НИКОГА не показва „нямат"');
  {
    const h = env([]);
    h.w.loadChecklist();
    await ticks();

    const seen = [];
    for (let i = 0; i < 8; i++) {                 /* два пълни оборота */
      clickCell(h.doc, 'Габрово', 'revizia_953');
      await ticks();
      seen.push(valOf(h.doc, 'Габрово', 'revizia_953'));
    }
    ok('нито веднъж „нямат" при yes_no', seen.indexOf('нямат') < 0, seen.join(' → '));
    ok('минава само през да/не/празно',
       seen.every(function (v) { return v === 'да' || v === 'не' || v === ''; }),
       seen.join(' → '));

    /* Обратната страна: при yes_no_none „нямат" трябва ДА се появи, иначе
       горната проверка минава и при счупен кръг за двата типа. */
    const seen2 = [];
    for (let i = 0; i < 4; i++) {
      clickCell(h.doc, 'Габрово', 'preocenka');
      await ticks();
      seen2.push(valOf(h.doc, 'Габрово', 'preocenka'));
    }
    ok('при yes_no_none „нямат" СЕ появява', seen2.indexOf('нямат') >= 0, seen2.join(' → '));
    ok('yes_no_none се затваря на празно след 4 клика',
       seen2[3] === '', seen2.join(' → '));
    h.close();
  }

  /* ── 3. Upsert: един ред, не два ─────────────────────────────────────── */
  section('3. Първи клик създава, вторият обновява СЪЩИЯ ред');
  {
    const h = env([]);
    h.w.loadChecklist();
    await ticks();
    h.calls.post.length = 0;

    clickCell(h.doc, 'Добрич', 'revizia_953'); await ticks();
    clickCell(h.doc, 'Добрич', 'revizia_953'); await ticks();

    const ps = postsTo(h, 'weekly_checklist');
    if (ok('два записа са изпратени', ps.length === 2, 'реално: ' + ps.length)) {
      const b0 = Array.isArray(ps[0].body) ? ps[0].body[0] : ps[0].body;
      const b1 = Array.isArray(ps[1].body) ? ps[1].body[0] : ps[1].body;

      ok('и двата носят един и същ ключ',
         b0.store_name === b1.store_name && b0.metric_key === b1.metric_key &&
         b0.year === b1.year && b0.week_number === b1.week_number,
         JSON.stringify([b0.store_name, b0.metric_key, b1.store_name, b1.metric_key]));

      /* Без on_conflict PostgREST търси конфликт по ПЪРВИЧНИЯ ключ (id) и
         вторият запис би създал втори ред вместо да обнови първия. */
      ok('URL-ът носи on_conflict по уникалното ограничение',
         (ps[0].url || '').indexOf('on_conflict=year,week_number,store_name,metric_key') >= 0,
         ps[0].url);

      ok('стойността се е сменила при втория (da → ne)',
         b0.control_value === 'da' && b1.control_value === 'ne',
         b0.control_value + ' → ' + b1.control_value);

      ok('updated_by е името на потребителя', b1.updated_by === 'Ц. Тенева', b1.updated_by);
      ok('updated_at се подава от клиента (таблицата няма тригер)',
         typeof b1.updated_at === 'string' && b1.updated_at.length > 10, b1.updated_at);

      /* portal_value НЕ бива да е в тялото: merge-duplicates обновява само
         подадените колони, тоест присъствието ѝ би презаписало твърдението
         на портала с отметката на контролинга. */
      ok('portal_value НЕ е в тялото на записа',
         !Object.prototype.hasOwnProperty.call(b1, 'portal_value'),
         JSON.stringify(Object.keys(b1)));
    }

    /* И местно: един ред за този ключ, не два. */
    const mine = h.w.checklistRows.filter(function (r) {
      return r.store_name === 'Добрич' && r.metric_key === 'revizia_953';
    });
    ok('местно има ТОЧНО един ред за ключа', mine.length === 1, 'реално: ' + mine.length);
    h.close();
  }

  /* ── 4. Провален запис: връщане назад + toast ────────────────────────── */
  section('4. Провал при запис → клетката се връща и излиза toast');
  {
    /* 4а. Ред, който вече съществува — трябва да се върне СТАРАТА стойност. */
    const h = env([
      { id: 'r-1', store_name: 'Сливен', metric_key: 'revizia_953',
        portal_value: null, control_value: 'da', control_num: null, comment: null }
    ], ADMIN, { POST: { status: 400, body: { message: 'нарушено ограничение' } } });
    h.w.loadChecklist();
    await ticks();

    ok('старт: „да"', valOf(h.doc, 'Сливен', 'revizia_953') === 'да',
       JSON.stringify(valOf(h.doc, 'Сливен', 'revizia_953')));

    h.calls.toast.length = 0;
    clickCell(h.doc, 'Сливен', 'revizia_953');
    await ticks();

    ok('клетката е ВЪРНАТА на „да", не остава „не"',
       valOf(h.doc, 'Сливен', 'revizia_953') === 'да',
       'реално: ' + JSON.stringify(valOf(h.doc, 'Сливен', 'revizia_953')));
    ok('излязъл е toast', h.calls.toast.length > 0, JSON.stringify(h.calls.toast));
    ok('toast-ът носи причината от базата',
       h.calls.toast.join(' ').indexOf('нарушено ограничение') >= 0,
       JSON.stringify(h.calls.toast));
    ok('местният ред пак е „da"',
       (h.w.checklistRows.filter(function (r) {
         return r.store_name === 'Сливен' && r.metric_key === 'revizia_953';
       })[0] || {}).control_value === 'da');
    h.close();

    /* 4б. Ред, който НЕ е съществувал — новосъздаденият трябва да ИЗЧЕЗНЕ,
       а не да остане празен. Празен ред местно значи ред в базата, какъвто
       там няма. */
    const h2 = env([], ADMIN, { POST: { status: 500, body: { message: 'boom' } } });
    h2.w.loadChecklist();
    await ticks();
    clickCell(h2.doc, 'Троян', 'revizia_953');
    await ticks();

    ok('клетката пак е празна', valOf(h2.doc, 'Троян', 'revizia_953') === '',
       JSON.stringify(valOf(h2.doc, 'Троян', 'revizia_953')));
    ok('новосъздаденият ред е МАХНАТ, не оставен празен',
       h2.w.checklistRows.filter(function (r) {
         return r.store_name === 'Троян' && r.metric_key === 'revizia_953';
       }).length === 0,
       'реално: ' + h2.w.checklistRows.length + ' реда общо');
    ok('и тук има toast', h2.calls.toast.length > 0, JSON.stringify(h2.calls.toast));
    h2.close();
  }

  /* ── 5. Коментар ─────────────────────────────────────────────────────── */
  section('5. Коментарът се записва и балончето става плътно');
  {
    const h = env([]);
    h.w.loadChecklist();
    await ticks();

    const c = cellOf(h.doc, 'Петрич', 'revizia_953');
    const ic = c ? c.querySelector('.cl-cmt') : null;
    if (ok('балончето съществува и при празен коментар', !!ic)) {
      ok('бледо е, но е ТУК', (ic.getAttribute('style') || '').indexOf('opacity:.25') >= 0,
         ic.getAttribute('style'));

      ic.click();                                  /* истински клик по иконката */
      await ticks();
      const ta = h.doc.getElementById('cl-cmt-text');
      if (ok('прозорчето се отвори', !!ta)) {
        ta.value = 'магазинът каза, че няма';
        h.calls.post.length = 0;
        h.doc.getElementById('cl-cmt-save').click();
        await ticks();

        const ps = postsTo(h, 'weekly_checklist');
        if (ok('коментарът е изпратен', ps.length === 1, 'реално: ' + ps.length)) {
          const b = Array.isArray(ps[0].body) ? ps[0].body[0] : ps[0].body;
          ok('текстът е в comment', b.comment === 'магазинът каза, че няма', b.comment);
          ok('стойността НЕ е пипана от коментара',
             !Object.prototype.hasOwnProperty.call(b, 'control_value'),
             JSON.stringify(Object.keys(b)));
        }
        const ic2 = (cellOf(h.doc, 'Петрич', 'revizia_953') || {}).querySelector
          ? cellOf(h.doc, 'Петрич', 'revizia_953').querySelector('.cl-cmt') : null;
        ok('балончето стана плътно',
           !!ic2 && (ic2.getAttribute('style') || '').indexOf('opacity:1') >= 0,
           ic2 ? ic2.getAttribute('style') : 'няма');
        ok('коментарът е в tooltip-а',
           !!ic2 && (ic2.getAttribute('title') || '').indexOf('магазинът каза') >= 0,
           ic2 ? ic2.getAttribute('title') : 'няма');
      }
    }

    /* Кликът по балончето НЕ бива да завърти и стойността. */
    ok('стойността си остава празна след коментар',
       valOf(h.doc, 'Петрич', 'revizia_953') === '',
       JSON.stringify(valOf(h.doc, 'Петрич', 'revizia_953')));
    h.close();
  }

  /* ── 6. Роля без права ───────────────────────────────────────────────── */
  section('6. manager: кликът не прави нищо и не праща заявка');
  {
    /* Мрежата се рендира като admin, после потребителят се сменя. Иначе
       loadChecklist() показва „Нямаш достъп" и няма по какво да се кликне —
       проверката щеше да минава заради липсваща таблица, не заради пазача. */
    const h = env([]);
    h.w.loadChecklist();
    await ticks();
    ok('като admin мрежата е тук', !!cellOf(h.doc, 'Монтана', 'revizia_953'));

    h.w.currentUser = MANAGER;
    h.calls.post.length = 0;
    h.calls.toast.length = 0;

    const clicked = clickCell(h.doc, 'Монтана', 'revizia_953');
    await ticks();

    ok('клетката още съществува (кликът е реален, не празен ход)', clicked);
    ok('стойността не се е променила', valOf(h.doc, 'Монтана', 'revizia_953') === '',
       JSON.stringify(valOf(h.doc, 'Монтана', 'revizia_953')));
    ok('нула POST', postsTo(h, 'weekly_checklist').length === 0,
       JSON.stringify(h.calls.post.map(function (p) { return p.url; })));
    ok('нула PATCH', h.calls.patch.length === 0);
    ok('нула toast', h.calls.toast.length === 0, JSON.stringify(h.calls.toast));
    ok('canEditChecklist() = false за manager', h.w.canEditChecklist() === false);

    /* И балончето мълчи. */
    const ic = cellOf(h.doc, 'Монтана', 'revizia_953').querySelector('.cl-cmt');
    if (ic) { ic.click(); await ticks(); }
    ok('прозорчето за коментар не се отваря', !h.doc.getElementById('cl-cmt-text'));
    ok('пак нула POST', postsTo(h, 'weekly_checklist').length === 0);
    h.close();
  }

  /* ── 7. Двоен клик не трупа заявки ───────────────────────────────────── */
  section('7. Докато тече запис, клетката мълчи');
  {
    const h = env([]);
    h.w.loadChecklist();
    await ticks();
    h.calls.post.length = 0;

    /* Три клика ПОДРЯД, без await между тях — точно бързото кликване. */
    const c = cellOf(h.doc, 'Кърджали', 'revizia_953');
    c.click(); c.click(); c.click();
    await ticks();

    ok('само ЕДНА заявка, не три', postsTo(h, 'weekly_checklist').length === 1,
       'реално: ' + postsTo(h, 'weekly_checklist').length);
    ok('стойността е една стъпка напред, не три',
       valOf(h.doc, 'Кърджали', 'revizia_953') === 'да',
       JSON.stringify(valOf(h.doc, 'Кърджали', 'revizia_953')));

    /* След края на записа клетката пак приема клик. */
    clickCell(h.doc, 'Кърджали', 'revizia_953');
    await ticks();
    ok('след записа клетката пак работи',
       valOf(h.doc, 'Кърджали', 'revizia_953') === 'не',
       JSON.stringify(valOf(h.doc, 'Кърджали', 'revizia_953')));
    h.close();
  }

  /* ── 8. Числовият показател ──────────────────────────────────────────── */
  section('8. number отваря поле, не върти кръг');
  {
    const h = env([]);
    h.w.loadChecklist();
    await ticks();

    clickCell(h.doc, 'Севлиево', 'storna_priem');
    await ticks();

    const cell = cellOf(h.doc, 'Севлиево', 'storna_priem');
    const inp = cell ? cell.querySelector('input') : null;
    if (ok('отвори се поле за число', !!inp, cell ? cell.innerHTML : 'няма клетка')) {
      ok('полето е числово', inp.getAttribute('type') === 'number');
      ok('нула заявки само от отварянето',
         postsTo(h, 'weekly_checklist').length === 0,
         'реално: ' + postsTo(h, 'weekly_checklist').length);

      inp.value = '4';
      inp.dispatchEvent(new h.w.Event('blur'));
      await ticks();

      const ps = postsTo(h, 'weekly_checklist');
      if (ok('записът тръгна при напускане на полето', ps.length === 1, 'реално: ' + ps.length)) {
        const b = Array.isArray(ps[0].body) ? ps[0].body[0] : ps[0].body;
        ok('control_num е числото 4', b.control_num === 4, JSON.stringify(b.control_num));
        ok('control_value НЕ е пипано при числов показател',
           !Object.prototype.hasOwnProperty.call(b, 'control_value'),
           JSON.stringify(Object.keys(b)));
      }
      ok('клетката показва 4', valOf(h.doc, 'Севлиево', 'storna_priem') === '4',
         JSON.stringify(valOf(h.doc, 'Севлиево', 'storna_priem')));
    }
    h.close();
  }

  report();
})();
