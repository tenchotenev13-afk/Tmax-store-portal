/* Чек лист — показателят „стока на път" и състоянието „още рано".

   ДВЕ НЕЗАВИСИМИ НЕЩА, затова и две групи секции:

   1. ДЯЛЪТ. goods_transit не се натрупва — изтрива се и се зарежда наново
      при всеки месечен импорт, тоест created_at е моментът на импорта и не
      казва нищо за записа. Затова няма филтър по дата, а само по посока:
      броят се САМО incoming. При входящ запис обектът е получателят и той
      отговаря; при outgoing и transfer отговаря другата страна, тоест
      влезли в знаменателя биха наказвали обекта за чужда работа.
      Обект без нито един входящ запис остава ПРАЗЕН, не „0/0".

   2. „ОЩЕ РАНО". Цвети качва снимката до 3-то число, обектът я актуализира
      до 10-то. Между 1-во и 10-то „52/190" НЕ Е ОЦЕНКА — показано наравно с
      останалите числа, се чете като провал точно в дните, когато обектът е
      в правото си още да не е започнал. Прагът идва от
      weekly_checklist_metrics.deadline_day, НЕ е закован в рендирането:
      в checklist.js няма нито „стока на път", нито числото 10.

   3. СТРАНИЦИТЕ (14.09.2026). PostgREST реже на 1000 реда, а goods_transit
      има 2269. Без страниране Троян излизаше 10/20 при реални 130/159.
      Фалшивият PostgREST тук реже ТОЧНО както истинският — иначе заявка без
      страниране би получила всичко и тестът би минал срещу стария код.
      Провал на страница → нищо не се записва (частично ≠ стойност).

   4. ПРОВЕРЕНО = ОБРАБОТЕНО. Ред с reviewed_at („👁 проверено, не е
      пристигнало") се брои като обработен — същото правило като тригера
      transit_store_done, който отмята задачата в Бюлетина.

   Пускане:  node tests/checklist-transit.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');

/* deadline_day = 10 само за stoka_na_pat, NULL за останалите — точно това,
   което прави миграцията weekly-checklist-deadline-day.sql. */
const METRICS = [
  { key:'revizia_953',  label:'ревизия',   sublabel:'953', value_type:'yes_no', sort_order:1, active:true, source:'manual',          deadline_day:null },
  { key:'stoka_na_pat', label:'стока на път', sublabel:'', value_type:'yes_no', sort_order:2, active:true, source:'module:transit',  deadline_day:10 },
  { key:'preocenka',    label:'преоценка', sublabel:'',    value_type:'yes_no_none', sort_order:3, active:true, source:'manual',     deadline_day:null }
];

const USERS = ['Севлиево', 'Сливен', 'Враца', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

const ADMIN = { id:'u-1', email:'c.teneva@temax.bg', display_name:'Ц. Тенева',
                role:'admin', store_name:'Централен офис' };

function tr(store, direction, status) {
  return { store_name: store, direction: direction, status: status };
}
/* n записа с една и съща посока и статус. */
function many(store, direction, status, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(tr(store, direction, status));
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
function cellOf(h, store, key, metrics) {
  const t = h.doc.getElementById('checklist-table');
  if (!t) return null;
  const tr2 = Array.prototype.slice.call(t.querySelectorAll('tbody tr')).filter(function (x) {
    const f = x.querySelector('td');
    return f && f.textContent.trim() === store;
  })[0];
  if (!tr2) return null;
  const i = (metrics || METRICS).map(function (m) { return m.key; }).indexOf(key);
  return tr2.querySelectorAll('td')[i + 1] || null;
}
function valSpan(h, store, key, metrics) {
  const c = cellOf(h, store, key, metrics);
  return c ? c.querySelector('.cl-val') : null;
}
function valText(h, store, key, metrics) {
  const v = valSpan(h, store, key, metrics);
  return v ? v.textContent.trim() : '';
}

/* Замразява деня от месеца, без да пипа останалото от Date. */
function freezeDay(h, day) {
  const RealDate = h.w.Date;
  const fixed = new RealDate(2026, 8, day, 12, 0, 0);   /* септември 2026 */
  function FakeDate() {
    if (arguments.length === 0) return new RealDate(fixed.getTime());
    return new RealDate(...arguments);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return fixed.getTime(); };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  h.w.Date = FakeDate;
}

(async function () {

  /* ── 1. Дялът ────────────────────────────────────────────────────────── */
  section('1. „52/190" — само входящите, само непending');
  {
    const h = env({ transit: []
      .concat(many('Севлиево', 'incoming', 'pending', 138))
      .concat(many('Севлиево', 'incoming', 'received', 40))
      .concat(many('Севлиево', 'incoming', 'rejected', 12))   /* 52 непending от 190 */
      /* Шумът, който НЕ бива да влиза никъде: */
      .concat(many('Севлиево', 'outgoing', 'sent', 25))
      .concat(many('Севлиево', 'transfer', 'received', 30))
      .concat(many('Севлиево', 'outgoing', 'pending', 11))
    });
    h.w.loadChecklist();
    await ticks();

    const w = written(h, 'Севлиево', 'stoka_na_pat');
    ok('записано е 52/190', !!w && w.portal_value === '52/190', JSON.stringify(w));
    ok('клетката показва 52/190', valText(h, 'Севлиево', 'stoka_na_pat') === '52/190',
       JSON.stringify(valText(h, 'Севлиево', 'stoka_na_pat')));

    /* Без филтъра по посока знаменателят би бил 256, а числителят 107. */
    ok('знаменателят НЕ брои outgoing и transfer',
       !!w && w.portal_value.indexOf('/256') < 0, JSON.stringify(w));
    ok('числителят НЕ брои чуждите received/sent',
       !!w && w.portal_value.indexOf('107/') < 0, JSON.stringify(w));
    h.close();
  }

  /* ── 2. Само outgoing/transfer = празно, не 0/0 ──────────────────────── */
  section('2. Обект без входящи: празна клетка, не „0/0"');
  {
    const h = env({ transit: []
      .concat(many('Сливен', 'outgoing', 'pending', 7))
      .concat(many('Сливен', 'transfer', 'sent', 4))
      /* Враца няма нито един запис изобщо */
      .concat(many('Севлиево', 'incoming', 'pending', 3))
    });
    h.w.loadChecklist();
    await ticks();

    ok('за Сливен НЕ е записано нищо', written(h, 'Сливен', 'stoka_na_pat') === null,
       JSON.stringify(written(h, 'Сливен', 'stoka_na_pat')));
    ok('за Враца НЕ е записано нищо', written(h, 'Враца', 'stoka_na_pat') === null,
       JSON.stringify(written(h, 'Враца', 'stoka_na_pat')));
    ok('клетката на Сливен е празна', valText(h, 'Сливен', 'stoka_na_pat') === '',
       JSON.stringify(valText(h, 'Сливен', 'stoka_na_pat')));
    ok('няма „0/0" никъде в таблицата',
       h.doc.getElementById('mod-checklist').textContent.indexOf('0/0') < 0);
    /* А обектът с входящи все пак е записан — иначе горното минава и при
       напълно счупен показател. */
    ok('Севлиево пак е записано', (written(h, 'Севлиево', 'stoka_na_pat') || {}).portal_value === '0/3',
       JSON.stringify(written(h, 'Севлиево', 'stoka_na_pat')));
    h.close();
  }

  /* ── 3. NULL статус се брои за неактуализиран ────────────────────────── */
  section('3. Липсващ статус не минава за актуализиран');
  {
    const h = env({ transit: [
      tr('Севлиево', 'incoming', 'pending'),
      tr('Севлиево', 'incoming', null),
      tr('Севлиево', 'incoming', 'received')
    ]});
    h.w.loadChecklist();
    await ticks();
    /* SQL-ското `status <> 'pending'` също не пропуска NULL. */
    ok('1/3, не 2/3', (written(h, 'Севлиево', 'stoka_na_pat') || {}).portal_value === '1/3',
       JSON.stringify(written(h, 'Севлиево', 'stoka_na_pat')));
    h.close();
  }

  /* ── 4. „Още рано" преди срока ───────────────────────────────────────── */
  section('4. На 5-то число клетката е бледа и обяснява защо');
  {
    const h = env({ transit: many('Севлиево', 'incoming', 'pending', 190) });
    freezeDay(h, 5);
    h.w.loadChecklist();
    await ticks();

    const v = valSpan(h, 'Севлиево', 'stoka_na_pat');
    if (ok('стойността е рендирана', !!v, (cellOf(h,'Севлиево','stoka_na_pat')||{}).innerHTML)) {
      ok('стойността се ВИЖДА (не е скрита)', v.textContent.trim() === '0/190',
         v.textContent.trim());
      ok('носи клас cl-early', (v.getAttribute('class') || '').indexOf('cl-early') >= 0,
         v.getAttribute('class'));
      ok('title обяснява срока', v.getAttribute('title') === 'Срокът изтича на 10-то число',
         v.getAttribute('title'));
      ok('рендирана е бледо', (v.getAttribute('style') || '').indexOf('#94a3b8') >= 0,
         v.getAttribute('style'));
    }
    /* Показател без deadline_day в СЪЩАТА таблица не е „още рано". */
    const h2 = env({ rows: [{ store_name:'Севлиево', metric_key:'preocenka',
                              portal_value:null, control_value:'da', control_num:null, comment:null }] });
    freezeDay(h2, 5);
    h2.w.loadChecklist(); await ticks();
    const v2 = valSpan(h2, 'Севлиево', 'preocenka');
    ok('показател с deadline_day=null НЕ е „още рано" на 5-то',
       !!v2 && (v2.getAttribute('class') || '').indexOf('cl-early') < 0,
       v2 ? v2.getAttribute('class') : 'няма span');
    h2.close();
    h.close();
  }

  /* ── 4б. Ръчното бие срока ───────────────────────────────────────────── */
  section('4б. Попълнено control_value се рендира НОРМАЛНО дори на 5-то');
  {
    /* Същият показател, същият ден, същите данни — разликата е САМО, че
       контролингът е отметнал. Правилото „отметнатото бие портала" няма
       изключения: човекът е гледал и е решил, независимо че срокът тече. */
    const h = env({
      rows: [{ store_name:'Севлиево', metric_key:'stoka_na_pat', portal_value:'0/190',
               control_value:'da', control_num:null, comment:null }],
      transit: many('Севлиево', 'incoming', 'pending', 190)
    });
    freezeDay(h, 5);
    h.w.loadChecklist();
    await ticks();

    const v = valSpan(h, 'Севлиево', 'stoka_na_pat');
    if (ok('стойността е рендирана', !!v, (cellOf(h,'Севлиево','stoka_na_pat')||{}).innerHTML)) {
      ok('показва се ръчното („да"), не порталното', v.textContent.trim() === 'да',
         v.textContent.trim());
      ok('НЯМА клас cl-early', (v.getAttribute('class') || '').indexOf('cl-early') < 0,
         v.getAttribute('class'));
      ok('няма подсказка за срока',
         (v.getAttribute('title') || '').indexOf('Срокът изтича') < 0,
         v.getAttribute('title'));
      ok('рендира се плътно, не бледо',
         (v.getAttribute('style') || '').indexOf('#0f172a') >= 0,
         v.getAttribute('style'));
    }

    /* Контрол: СЪЩИЯТ ден и същият показател, но БЕЗ control_value — там
       „още рано" пак важи. Иначе горните проверки минават и при съвсем
       изключено правило. */
    const h2 = env({
      rows: [{ store_name:'Севлиево', metric_key:'stoka_na_pat', portal_value:'0/190',
               control_value:null, control_num:null, comment:null }],
      transit: many('Севлиево', 'incoming', 'pending', 190)
    });
    freezeDay(h2, 5);
    h2.w.loadChecklist(); await ticks();
    const v2 = valSpan(h2, 'Севлиево', 'stoka_na_pat');
    ok('без control_value същата клетка Е „още рано"',
       !!v2 && (v2.getAttribute('class') || '').indexOf('cl-early') >= 0,
       v2 ? v2.getAttribute('class') : 'няма span');
    h2.close();
    h.close();
  }

  /* ── 5. След срока ───────────────────────────────────────────────────── */
  section('5. На 15-то число клетката е нормална');
  {
    const h = env({ transit: many('Севлиево', 'incoming', 'pending', 190) });
    freezeDay(h, 15);
    h.w.loadChecklist();
    await ticks();

    const v = valSpan(h, 'Севлиево', 'stoka_na_pat');
    if (ok('стойността е рендирана', !!v)) {
      ok('същата стойност', v.textContent.trim() === '0/190', v.textContent.trim());
      ok('НЯМА клас cl-early', (v.getAttribute('class') || '').indexOf('cl-early') < 0,
         v.getAttribute('class'));
      ok('title е обичайният за portal_value',
         (v.getAttribute('title') || '').indexOf('не е потвърдена') >= 0,
         v.getAttribute('title'));
      ok('НЕ носи текста за срока',
         (v.getAttribute('title') || '').indexOf('Срокът изтича') < 0, v.getAttribute('title'));
    }
    h.close();
  }

  /* ── 6. Границата ────────────────────────────────────────────────────── */
  section('6. Границата: 10-то е още рано, 11-то вече не');
  {
    const m = METRICS[1];
    const probe = env(); const w = probe.w;

    ok('9-то: рано', w.checklistIsEarly(m, new Date(2026, 8, 9)) === true);
    ok('10-то ВКЛЮЧИТЕЛНО: рано', w.checklistIsEarly(m, new Date(2026, 8, 10)) === true);
    ok('11-то: вече не', w.checklistIsEarly(m, new Date(2026, 8, 11)) === false);
    ok('1-во: рано', w.checklistIsEarly(m, new Date(2026, 8, 1)) === true);
    ok('31-во: не', w.checklistIsEarly(m, new Date(2026, 7, 31)) === false);

    ok('deadline_day = null → никога рано',
       w.checklistIsEarly({ deadline_day: null }, new Date(2026, 8, 1)) === false);
    ok('липсващо поле → никога рано',
       w.checklistIsEarly({}, new Date(2026, 8, 1)) === false);
    ok('текстово „10" също се разбира',
       w.checklistIsEarly({ deadline_day: '10' }, new Date(2026, 8, 5)) === true);

    ok('подсказката се строи от числото',
       w.checklistDeadlineTitle({ deadline_day: 10 }) === 'Срокът изтича на 10-то число',
       w.checklistDeadlineTitle({ deadline_day: 10 }));
    ok('и за друг ден', w.checklistDeadlineTitle({ deadline_day: 2 }) === 'Срокът изтича на 2-ро число',
       w.checklistDeadlineTitle({ deadline_day: 2 }));
    ok('без срок няма подсказка', w.checklistDeadlineTitle({ deadline_day: null }) === '');
    probe.close();
  }

  /* ── 7. Прагът НЕ е закован в кода ───────────────────────────────────── */
  section('7. Нито „стока на път", нито 10 стоят в рендирането');
  {
    const src = fs.readFileSync(path.join(ROOT, 'checklist.js'), 'utf8');
    /* Търси се в КОДА, не в коментарите — те нарочно обясняват случая. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');

    ok('ключът stoka_na_pat не се среща в кода', code.indexOf('stoka_na_pat') < 0,
       'заковаване на показател в рендирането');
    ok('няма закован праг „<= 10" или „> 10"', !/[<>]=?\s*10\b/.test(code),
       (code.match(/[<>]=?\s*10\b/) || [''])[0]);
    ok('прагът идва от deadline_day', code.indexOf('deadline_day') >= 0);
    ok('показателят се търси по ИЗТОЧНИК module:transit',
       code.indexOf("'transit'") >= 0 || code.indexOf('module:') >= 0);
  }

  /* ── 8. Ръчното и грешките ───────────────────────────────────────────── */
  section('8. control_value не се пипа; провалът не се поглъща');
  {
    const h = env({
      rows: [{ id:'r-1', store_name:'Севлиево', metric_key:'stoka_na_pat',
               portal_value:'1/5', control_value:'ne', control_num:null, comment:'бележка' }],
      transit: many('Севлиево', 'incoming', 'pending', 190)
    });
    freezeDay(h, 15);
    h.w.loadChecklist();
    await ticks();

    const w = written(h, 'Севлиево', 'stoka_na_pat');
    if (ok('редът е записан', !!w)) {
      ok('portal_value е обновено на 0/190', w.portal_value === '0/190', JSON.stringify(w));
      ok('control_value НЕ е в тялото',
         !Object.prototype.hasOwnProperty.call(w, 'control_value'), JSON.stringify(Object.keys(w)));
      ok('comment НЕ е в тялото',
         !Object.prototype.hasOwnProperty.call(w, 'comment'), JSON.stringify(Object.keys(w)));
    }
    const row = h.w.checklistRows.filter(function (r) {
      return r.store_name === 'Севлиево' && r.metric_key === 'stoka_na_pat';
    })[0];
    ok('ръчното е непокътнато местно', !!row && row.control_value === 'ne' && row.comment === 'бележка',
       JSON.stringify(row));
    ok('клетката показва ръчното с превес',
       valText(h, 'Севлиево', 'stoka_na_pat') === 'не',
       JSON.stringify(valText(h, 'Севлиево', 'stoka_na_pat')));
    h.close();

    /* Провал при запис. */
    const h2 = env({
      transit: many('Севлиево', 'incoming', 'pending', 190),
      fail: { POST: { status: 400, body: { message: 'отказано' } } }
    });
    freezeDay(h2, 15);
    h2.w.loadChecklist();
    await ticks();
    ok('излязъл е toast', h2.calls.toast.length > 0, JSON.stringify(h2.calls.toast));
    ok('toast-ът носи причината', h2.calls.toast.join(' ').indexOf('отказано') >= 0,
       JSON.stringify(h2.calls.toast));
    ok('клетката НЕ изглежда попълнена', valText(h2, 'Севлиево', 'stoka_na_pat') === '',
       JSON.stringify(valText(h2, 'Севлиево', 'stoka_na_pat')));
    ok('таблицата пак се рендира', !!h2.doc.getElementById('checklist-table'));
    h2.close();
  }

  /* ── 9. Непроменена стойност не праща заявка ─────────────────────────── */
  section('9. Нищо ново → нула записи');
  {
    const h = env({
      rows: [{ store_name:'Севлиево', metric_key:'stoka_na_pat', portal_value:'0/190',
               control_value:null, control_num:null, comment:null }],
      transit: many('Севлиево', 'incoming', 'pending', 190)
    });
    h.w.loadChecklist();
    await ticks();
    ok('нула записа', writes(h).length === 0, 'реално: ' + writes(h).length);
    h.close();
  }

  /* Фалшив PostgREST: limit/offset като истинския, а БЕЗ limit реже на 1000
     (db-max-rows). Редовете са подредени по id, както order=id.asc. */
  function pgRoute(rows) {
    return function (url) {
      const lim = /[?&]limit=(\d+)/.exec(url), off = /[?&]offset=(\d+)/.exec(url);
      const o = off ? +off[1] : 0, l = Math.min(lim ? +lim[1] : 1000, 1000);
      return rows.slice(o, o + l);
    };
  }
  /* 2500 реда: първите 1000 носят само 20 от входящите на Севлиево (10
     обработени) — точно разпределението, което даде 10/20 на Троян. */
  function bigTransit() {
    const rows = [];
    let id = 0;
    const push = r => { rows.push(Object.assign({ id: ++id }, r)); };
    for (let i = 0; i < 980; i++) push(tr('Сливен', i % 2 ? 'outgoing' : 'transfer', 'sent'));
    for (let i = 0; i < 20; i++)  push(tr('Севлиево', 'incoming', i < 10 ? 'received' : 'pending'));
    for (let i = 0; i < 700; i++) push(tr('Враца', 'incoming', 'received'));
    for (let i = 0; i < 139; i++) push(tr('Севлиево', 'incoming', i < 120 ? 'received' : 'pending'));
    for (let i = 0; i < 661; i++) push(tr('Сливен', 'transfer', 'received'));
    return rows;   /* Севлиево: 159 входящи, 130 обработени */
  }

  /* ── 10. Страниците ──────────────────────────────────────────────────── */
  section('10. 2500 реда → всички страници, не първите 1000');
  {
    const rows = bigTransit();
    const h = env({ transit: pgRoute(rows) });
    freezeDay(h, 15);
    h.w.loadChecklist();
    for (let i = 0; i < 8; i++) await ticks();

    const w = written(h, 'Севлиево', 'stoka_na_pat');
    ok('Севлиево 130/159 (не 10/20 от първата страница)', !!w && w.portal_value === '130/159', JSON.stringify(w));
    const gets = h.calls.get.filter(u => /goods_transit/.test(u));
    ok('три страници: offset 0, 1000, 2000', gets.length === 3 &&
       [0, 1000, 2000].every((o, i) => gets[i].indexOf('offset=' + o) >= 0), gets.join(' | '));
    ok('всяка страница е с order=id.asc и limit=1000',
       gets.every(u => u.indexOf('order=id.asc') >= 0 && u.indexOf('limit=1000') >= 0), gets.join(' | '));
    ok('тегли се и reviewed_at', gets.every(u => /select=[^&]*reviewed_at/.test(u)), gets[0]);
    ok('Враца 700/700', (written(h, 'Враца', 'stoka_na_pat') || {}).portal_value === '700/700',
       JSON.stringify(written(h, 'Враца', 'stoka_na_pat')));
    h.close();
  }
  {
    /* Граничен случай: ТОЧНО 1000 реда — пълна страница значи „може да има
       още", тоест втора заявка, която връща празно, и край. */
    const rows = many('Севлиево', 'incoming', 'received', 1000).map((r, i) => Object.assign({ id: i + 1 }, r));
    const h = env({ transit: pgRoute(rows) });
    freezeDay(h, 15);
    h.w.loadChecklist();
    for (let i = 0; i < 6; i++) await ticks();
    const gets = h.calls.get.filter(u => /goods_transit/.test(u));
    ok('точно 1000 реда → 2 заявки (втората празна)', gets.length === 2, gets.join(' | '));
    ok('1000/1000', (written(h, 'Севлиево', 'stoka_na_pat') || {}).portal_value === '1000/1000',
       JSON.stringify(written(h, 'Севлиево', 'stoka_na_pat')));
    h.close();
  }

  /* ── 11. Провал на страница ──────────────────────────────────────────── */
  section('11. Пропаднала втора страница → нищо не се записва');
  {
    const h = env({
      transit: pgRoute(bigTransit()),
      fail: { GET: { status: 500, body: { message: 'страницата падна' }, url: /goods_transit.*offset=1000/ } }
    });
    freezeDay(h, 15);
    h.w.loadChecklist();
    for (let i = 0; i < 8; i++) await ticks();
    ok('Севлиево НЕ е записано (частичното 10/20 не става стойност)',
       written(h, 'Севлиево', 'stoka_na_pat') === null, JSON.stringify(written(h, 'Севлиево', 'stoka_na_pat')));
    ok('казва кое е паднало', h.calls.toast.some(t => String(t.msg || t).indexOf('goods_transit') >= 0 &&
       String(t.msg || t).indexOf('страницата падна') >= 0), JSON.stringify(h.calls.toast));
    ok('таблицата пак се рендира', !!h.doc.getElementById('checklist-table'));
    h.close();
  }

  /* ── 12. Проверено = обработено ──────────────────────────────────────── */
  section('12. „👁 проверено" се брои за обработено');
  {
    const at = '2026-09-10T09:00:00Z';
    const h = env({ transit: [
      Object.assign(tr('Севлиево', 'incoming', 'pending'), { reviewed_at: at }),
      Object.assign(tr('Севлиево', 'incoming', 'pending'), { reviewed_at: at }),
      tr('Севлиево', 'incoming', 'pending'),                          /* необработен */
      tr('Севлиево', 'incoming', 'received'),
      Object.assign(tr('Севлиево', 'transfer', 'pending'), { reviewed_at: at })   /* трансфер не влиза */
    ]});
    freezeDay(h, 15);
    h.w.loadChecklist();
    await ticks();
    ok('3/4: двата проверени + приетият', (written(h, 'Севлиево', 'stoka_na_pat') || {}).portal_value === '3/4',
       JSON.stringify(written(h, 'Севлиево', 'stoka_na_pat')));
    ok('пряко: непроверен pending не се брои', h.w.checklistTransitValue([tr('X', 'incoming', 'pending')]) === '0/1');
    ok('пряко: проверен pending се брои',
       h.w.checklistTransitValue([Object.assign(tr('X', 'incoming', 'pending'), { reviewed_at: at })]) === '1/1');
    h.close();
  }

  report();
})();
