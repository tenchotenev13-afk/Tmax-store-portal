/* Чек лист — показателят „Стока за връщане" (module:returns).

   Записът в stock_returns се създава при РАЗЛИКА, не по график. Обектът го
   поема по един от два начина:
     · взет от куриер            → status = 'taken'
     · проверен и още невзет     → confirmed_date се попълва, статусът
                                   остава 'pending'
   Затова обработен значи `status='taken' ИЛИ confirmed_date is not null`.

   ВТОРОТО УСЛОВИЕ НЕ Е ИЗЛИШНО. Към 02.09.2026 65 pending записа носят
   confirmed_date; без него Раднево излиза 22/40 вместо 29/40 — обектът е
   наказан за работа, която е свършил. Това е и контролната мутация.

   Показателят НЯМА deadline_day: записите се появяват при разлика и нямат
   фиксирана дата в месеца, тоест „още рано" не важи никога.

   Числата тук са РЕАЛНИТЕ от базата (сверени на 02.09.2026):
     Раднево 29/40 · Петрич 4/28 · Шумен 26/26

   Пускане:  node tests/checklist-returns.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

/* Редът, както е в базата от 02.09.2026: source вече е module:returns, не
   постоянна задача — показателят не е задача от бюлетина. */
const METRICS = [
  { key:'stoka_vrashtane', label:'Стока за връщане- ТАБЛИЦИ', sublabel:'актуализирано от обекта',
    value_type:'yes_no', sort_order:1, active:true, source:'module:returns', deadline_day:null },
  { key:'stoka_na_pat', label:'стока на път', sublabel:'', value_type:'yes_no',
    sort_order:2, active:true, source:'module:transit', deadline_day:10 },
  { key:'storna_priem', label:'сторна', sublabel:'', value_type:'number',
    sort_order:3, active:true, source:'module:kasa', deadline_day:null }
];

const USERS = ['Раднево', 'Петрич', 'Шумен', 'Враца', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

const ADMIN = { id:'u-1', email:'c.teneva@temax.bg', display_name:'Ц. Тенева',
                role:'admin', store_name:'Централен офис' };

function ret(store, status, confirmed) {
  return { store_name: store, status: status, confirmed_date: confirmed || null };
}
function many(store, status, confirmed, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ret(store, status, confirmed));
  return out;
}

function env(opts) {
  opts = opts || {};
  const b = {
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: opts.metrics || METRICS,
      weekly_checklist: opts.rows || [],
      recurring_tasks: [],
      task_completions: [],
      stock_returns: opts.returns || [],
      goods_transit: opts.transit || []
    }
  };
  if (opts.fail) b.fail = opts.fail;
  return boot(b);
}

function bodyOf(p) { return Array.isArray(p.body) ? p.body : [p.body]; }
function writes(h) {
  return h.calls.post.filter(function (p) { return (p.url || '').indexOf('/weekly_checklist') >= 0; });
}
function written(h, store, key) {
  let out = null;
  writes(h).forEach(function (p) {
    bodyOf(p).forEach(function (r) {
      if (r.store_name === store && r.metric_key === key) out = r;
    });
  });
  return out;
}
function cellOf(h, store, key) {
  const t = h.doc.getElementById('checklist-table');
  if (!t) return null;
  const tr = Array.prototype.slice.call(t.querySelectorAll('tbody tr')).filter(function (x) {
    const f = x.querySelector('td');
    return f && f.textContent.trim() === store;
  })[0];
  if (!tr) return null;
  const i = METRICS.map(function (m) { return m.key; }).indexOf(key);
  return tr.querySelectorAll('td')[i + 1] || null;
}
function valSpan(h, store, key) {
  const c = cellOf(h, store, key);
  return c ? c.querySelector('.cl-val') : null;
}
function valText(h, store, key) {
  const v = valSpan(h, store, key);
  return v ? v.textContent.trim() : '';
}
function freezeDay(h, day) {
  const RealDate = h.w.Date;
  const fixed = new RealDate(2026, 8, day, 12, 0, 0);
  function FakeDate() {
    if (arguments.length === 0) return new RealDate(fixed.getTime());
    return new RealDate(...arguments);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return fixed.getTime(); };
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  h.w.Date = FakeDate;
}

(async function () {

  /* ── 1. Двата начина за обработване ──────────────────────────────────── */
  section('1. Раднево: 22 taken + 7 проверени = 29/40');
  {
    const h = env({ returns: []
      .concat(many('Раднево', 'taken', null, 22))               /* взети от куриер */
      .concat(many('Раднево', 'pending', '2026-08-28', 7))      /* проверени, невзети */
      .concat(many('Раднево', 'pending', null, 11))             /* нищо не е станало */
    });
    h.w.loadChecklist();
    await ticks();

    const w = written(h, 'Раднево', 'stoka_vrashtane');
    ok('записано е 29/40', !!w && w.portal_value === '29/40', JSON.stringify(w));
    ok('клетката показва 29/40', valText(h, 'Раднево', 'stoka_vrashtane') === '29/40',
       JSON.stringify(valText(h, 'Раднево', 'stoka_vrashtane')));

    /* Точно това, което пада без второто условие. */
    ok('НЕ е 22/40 — проверените се броят',
       !!w && w.portal_value !== '22/40', JSON.stringify(w));
    /* И не всичко подред. */
    ok('НЕ е 40/40 — нищонеправещите не се броят',
       !!w && w.portal_value !== '40/40', JSON.stringify(w));
    h.close();
  }

  /* ── 2. Всяко условие поотделно ──────────────────────────────────────── */
  section('2. pending без дата не се брои; taken без дата се брои');
  {
    const h = env({ returns: [
      ret('Раднево', 'pending', null),          /* не се брои */
      ret('Раднево', 'taken', null),            /* СЕ брои — taken без дата */
      ret('Раднево', 'pending', '2026-08-20'),  /* СЕ брои — дата без taken */
      ret('Раднево', 'taken', '2026-08-21')     /* се брои (и двете) */
    ]});
    h.w.loadChecklist();
    await ticks();
    ok('3 от 4', (written(h, 'Раднево', 'stoka_vrashtane') || {}).portal_value === '3/4',
       JSON.stringify(written(h, 'Раднево', 'stoka_vrashtane')));

    /* Поотделно, за да не се крие едното зад другото. */
    const only = env({ returns: many('Петрич', 'taken', null, 3) });
    only.w.loadChecklist(); await ticks();
    ok('само taken, без нито една дата → 3/3',
       (written(only, 'Петрич', 'stoka_vrashtane') || {}).portal_value === '3/3',
       JSON.stringify(written(only, 'Петрич', 'stoka_vrashtane')));
    only.close();

    const dates = env({ returns: many('Петрич', 'pending', '2026-08-19', 3) });
    dates.w.loadChecklist(); await ticks();
    ok('само pending с дати → 3/3',
       (written(dates, 'Петрич', 'stoka_vrashtane') || {}).portal_value === '3/3',
       JSON.stringify(written(dates, 'Петрич', 'stoka_vrashtane')));
    dates.close();

    const none = env({ returns: many('Петрич', 'pending', null, 3) });
    none.w.loadChecklist(); await ticks();
    ok('само pending без дати → 0/3',
       (written(none, 'Петрич', 'stoka_vrashtane') || {}).portal_value === '0/3',
       JSON.stringify(written(none, 'Петрич', 'stoka_vrashtane')));
    none.close();
    h.close();
  }

  /* ── 3. Реалните три числа ───────────────────────────────────────────── */
  section('3. Раднево 29/40, Петрич 4/28, Шумен 26/26');
  {
    const h = env({ returns: []
      .concat(many('Раднево', 'taken', null, 22))
      .concat(many('Раднево', 'pending', '2026-08-28', 7))
      .concat(many('Раднево', 'pending', null, 11))
      .concat(many('Петрич', 'taken', null, 4))
      .concat(many('Петрич', 'pending', null, 24))
      .concat(many('Шумен', 'taken', null, 12))
      .concat(many('Шумен', 'pending', '2026-08-25', 14))
    });
    h.w.loadChecklist();
    await ticks();

    ok('Раднево 29/40', (written(h, 'Раднево', 'stoka_vrashtane') || {}).portal_value === '29/40',
       JSON.stringify(written(h, 'Раднево', 'stoka_vrashtane')));
    ok('Петрич 4/28', (written(h, 'Петрич', 'stoka_vrashtane') || {}).portal_value === '4/28',
       JSON.stringify(written(h, 'Петрич', 'stoka_vrashtane')));
    ok('Шумен 26/26 (всичко обработено)',
       (written(h, 'Шумен', 'stoka_vrashtane') || {}).portal_value === '26/26',
       JSON.stringify(written(h, 'Шумен', 'stoka_vrashtane')));
    h.close();
  }

  /* ── 4. Обект без записи ─────────────────────────────────────────────── */
  section('4. Без записи: празна клетка, не „0/0"');
  {
    const h = env({ returns: many('Раднево', 'taken', null, 3) });
    h.w.loadChecklist();
    await ticks();

    ok('за Враца НЕ е записано нищо', written(h, 'Враца', 'stoka_vrashtane') === null,
       JSON.stringify(written(h, 'Враца', 'stoka_vrashtane')));
    ok('клетката на Враца е празна', valText(h, 'Враца', 'stoka_vrashtane') === '',
       JSON.stringify(valText(h, 'Враца', 'stoka_vrashtane')));
    ok('няма „0/0" никъде в таблицата',
       h.doc.getElementById('mod-checklist').textContent.indexOf('0/0') < 0);
    /* Контрол: обектът със записи все пак е записан. */
    ok('Раднево пак е записано', (written(h, 'Раднево', 'stoka_vrashtane') || {}).portal_value === '3/3',
       JSON.stringify(written(h, 'Раднево', 'stoka_vrashtane')));
    h.close();
  }

  /* ── 5. Никога „още рано" ────────────────────────────────────────────── */
  section('5. Без deadline_day показателят никога не е „още рано"');
  {
    const h = env({
      returns: many('Раднево', 'pending', null, 10),
      transit: [{ store_name:'Раднево', direction:'incoming', status:'pending' }]
    });
    freezeDay(h, 5);            /* ден, в който „стока на път" Е рано */
    h.w.loadChecklist();
    await ticks();

    const v = valSpan(h, 'Раднево', 'stoka_vrashtane');
    if (ok('стойността е рендирана', !!v, (cellOf(h,'Раднево','stoka_vrashtane')||{}).innerHTML)) {
      ok('НЯМА клас cl-early', (v.getAttribute('class') || '').indexOf('cl-early') < 0,
         v.getAttribute('class'));
      ok('няма подсказка за срок',
         (v.getAttribute('title') || '').indexOf('Срокът изтича') < 0, v.getAttribute('title'));
    }
    /* Контрол в СЪЩАТА таблица и на СЪЩИЯ ден: „стока на път" Е рано,
       тоест разликата идва от deadline_day, не от деня. */
    const vt = valSpan(h, 'Раднево', 'stoka_na_pat');
    ok('„стока на път" на същия ден Е „още рано"',
       !!vt && (vt.getAttribute('class') || '').indexOf('cl-early') >= 0,
       vt ? vt.getAttribute('class') : 'няма span');
    h.close();
  }

  /* ── 6. Двата модулни показателя през ЕДИН път ───────────────────────── */
  section('6. Вторият модулен източник минава по същия път');
  {
    /* ВНИМАНИЕ: транзитният ред е с ДРУГА форма от този за връщанията —
       {direction, status}, не {status, confirmed_date}. Пръв опит тук
       ползваше помощника many() и за двете; редовете излизаха без direction,
       транзитът връщаше null и проверката падаше. Затова са изписани явно. */
    const transitRows = [];
    for (let i = 0; i < 8; i++) transitRows.push({ store_name:'Раднево', direction:'incoming', status:'pending' });
    for (let i = 0; i < 2; i++) transitRows.push({ store_name:'Раднево', direction:'incoming', status:'received' });

    const h = env({
      returns: many('Раднево', 'taken', null, 5),
      transit: transitRows
    });
    h.w.loadChecklist();
    await ticks();

    ok('връщанията са попълнени',
       (written(h, 'Раднево', 'stoka_vrashtane') || {}).portal_value === '5/5',
       JSON.stringify(written(h, 'Раднево', 'stoka_vrashtane')));
    ok('стоката на път — също',
       (written(h, 'Раднево', 'stoka_na_pat') || {}).portal_value === '2/10',
       JSON.stringify(written(h, 'Раднево', 'stoka_na_pat')));
    ok('module:kasa НЕ се пълни (няма правило)',
       written(h, 'Раднево', 'storna_priem') === null,
       JSON.stringify(written(h, 'Раднево', 'storna_priem')));

    /* ЕДНА заявка за двата източника — общ път за грешките.
       Броят заявки сам по себе си НЕ стига: една заявка само с връщанията
       също би дала 1. Затова се проверява и че тялото носи ДВАТА ключа —
       точно случаят, който пропуснах при първия опит. */
    ok('една заявка за двата източника', writes(h).length === 1,
       'реално заявки: ' + writes(h).length);
    const keys = {};
    writes(h).forEach(function (p) { bodyOf(p).forEach(function (r) { keys[r.metric_key] = 1; }); });
    ok('и тя носи ДВАТА показателя',
       !!keys.stoka_vrashtane && !!keys.stoka_na_pat, Object.keys(keys).join(','));
    ok('Централен офис не влиза',
       written(h, 'Централен офис', 'stoka_vrashtane') === null);
    h.close();
  }

  /* ── 7. Ръчното и провалът ───────────────────────────────────────────── */
  section('7. control_value не се пипа; провалът не се поглъща');
  {
    const h = env({
      rows: [{ id:'r-1', store_name:'Раднево', metric_key:'stoka_vrashtane',
               portal_value:'1/2', control_value:'da', control_num:null, comment:'бележка' }],
      returns: many('Раднево', 'taken', null, 5)
    });
    h.w.loadChecklist();
    await ticks();

    const w = written(h, 'Раднево', 'stoka_vrashtane');
    if (ok('редът е записан', !!w)) {
      ok('portal_value е обновено на 5/5', w.portal_value === '5/5', JSON.stringify(w));
      ok('control_value НЕ е в тялото',
         !Object.prototype.hasOwnProperty.call(w, 'control_value'), JSON.stringify(Object.keys(w)));
      ok('comment НЕ е в тялото',
         !Object.prototype.hasOwnProperty.call(w, 'comment'), JSON.stringify(Object.keys(w)));
    }
    ok('клетката показва ръчното с превес',
       valText(h, 'Раднево', 'stoka_vrashtane') === 'да',
       JSON.stringify(valText(h, 'Раднево', 'stoka_vrashtane')));
    h.close();

    const h2 = env({
      returns: many('Раднево', 'taken', null, 5),
      fail: { POST: { status: 400, body: { message: 'отказано' } } }
    });
    h2.w.loadChecklist();
    await ticks();
    ok('излязъл е toast', h2.calls.toast.length > 0, JSON.stringify(h2.calls.toast));
    ok('клетката НЕ изглежда попълнена', valText(h2, 'Раднево', 'stoka_vrashtane') === '',
       JSON.stringify(valText(h2, 'Раднево', 'stoka_vrashtane')));
    ok('таблицата пак се рендира', !!h2.doc.getElementById('checklist-table'));
    h2.close();
  }

  /* ── 8. Нищо ново → нула записи ──────────────────────────────────────── */
  section('8. Непроменена стойност не праща заявка');
  {
    const h = env({
      rows: [{ store_name:'Раднево', metric_key:'stoka_vrashtane', portal_value:'5/5',
               control_value:null, control_num:null, comment:null }],
      returns: many('Раднево', 'taken', null, 5)
    });
    h.w.loadChecklist();
    await ticks();
    ok('нула записа', writes(h).length === 0, 'реално: ' + writes(h).length);
    h.close();
  }

  report();
})();
