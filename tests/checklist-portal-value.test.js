/* Чек лист — автоматичното попълване на portal_value от Бюлетина.

   Два от шестте показателя идват от постоянни задачи и се смятат при
   отваряне на седмица. Останалите четири остават празни — включително
   „Стока за връщане- ТАБЛИЦИ", която ИМА recurring: източник, но няма
   due_weekdays и няма договорено правило. Точно затова списъкът с режими е
   по metric.key, а не „всичко с recurring: източник".

   Какво заковава файлът:
   1. ДВАТА РЕЖИМА. „Ревизия" пита ИМА ЛИ отмятане в прозореца (да/не);
      „Справка минуси" брои РАЗЛИЧНИ дни (4/5). Два записа в един ден са
      един ден — иначе усърдието се брои за срок.
   2. ПРОЗОРЕЦЪТ Е НА ЗАДАЧАТА. Отмятане извън due_weekdays не влиза.
      Дните идват от recurring_tasks, не от кода.
   3. РЪЧНОТО НЕ СЕ ПИПА. Записът носи САМО portal_value; control_value,
      control_num и comment не влизат в тялото, тоест merge-duplicates няма
      какво да презапише.
   4. ЧАСЪТ НЕ СЕ ПРОВЕРЯВА. Задачите са с 16:00 и 20:00, но отмятанията
      пазят дата без час. Тестът не се прави, че проверява срок по час.
   5. ПРОВАЛЪТ НЕ СЕ ПОГЛЪЩА — toast, и нито една клетка не изглежда
      попълнена.

   Етап 2 (checklist-live-calc, 26.10.2026): отварянето НЕ пише portal_value —
   правилото се проверява през checklistComputePortalValues() (без запис), а
   мрежата показва живите стойности от rpc/checklist_portal_values (`rpc` в
   data). Проверките „какво влиза в тялото на записа" са махнати — запис няма.

   Пускане:  node tests/checklist-portal-value.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const REV_ID = '74da41e4-494f-48cc-a434-79bfc04fc243';
const MIN_ID = '03c44560-9572-4274-ad53-5228d61b4de7';
const VRA_ID = '0a20f6e8-c526-400b-bed5-57194f35e4e5';

/* Реалните редове от weekly_checklist_metrics към 02.09.2026. Трите
   recurring: източника са тук нарочно — за да се види, че се пълнят ДВА. */
const METRICS = [
  { key:'revizia_953',     label:'ревизия',        sublabel:'953', value_type:'yes_no',      sort_order:1, active:true, source:'recurring:' + REV_ID },
  { key:'spravka_minusi',  label:'справка минуси', sublabel:'',    value_type:'yes_no',      sort_order:2, active:true, source:'recurring:' + MIN_ID },
  { key:'stoka_vrashtane', label:'стока',          sublabel:'',    value_type:'yes_no',      sort_order:3, active:true, source:'recurring:' + VRA_ID },
  { key:'storna_priem',    label:'сторна',         sublabel:'',    value_type:'number',      sort_order:4, active:true, source:'module:kasa' },
  { key:'stoka_na_pat',    label:'на път',         sublabel:'',    value_type:'yes_no',      sort_order:5, active:true, source:'module:transit' },
  { key:'preocenka',       label:'преоценка',      sublabel:'',    value_type:'yes_no_none', sort_order:6, active:true, source:'manual' }
];

/* Реалните срокове: ревизията Пон–Сря, справката Пон–Пет, стоката без
   due_weekdays (затова не се пълни, дори че е recurring:). */
const TASKS = [
  { id: REV_ID, due_weekdays: [0, 1, 2] },
  { id: MIN_ID, due_weekdays: [0, 1, 2, 3, 4] },
  { id: VRA_ID, due_weekdays: null }
];

const USERS = ['Враца', 'Габрово', 'Добрич', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

const ADMIN = { id:'u-1', email:'c.teneva@temax.bg', display_name:'Ц. Тенева',
                role:'admin', store_name:'Централен офис' };

function env(opts) {
  opts = opts || {};
  const b = {
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: opts.rows || [],
      recurring_tasks: TASKS,
      task_completions: opts.comps || [],
      rpc: opts.rpc || []
    }
  };
  if (opts.fail) b.fail = opts.fail;
  return boot(b);
}

/* Датите на седмицата, която таб „Чек лист" показва по подразбиране
   (приключилата). Строят се със СЪЩИТЕ помощници като продукцията, за да не
   гният при смяна на година. */
function weekOf(h) {
  const def = h.w.checklistDefaultWeek();
  return h.w.weekDays(def.week, def.year).map(h.w.toLocalISO);
}

function comp(taskId, store, dateISO, status) {
  return { recurring_task_id: taskId, store_name: store,
           completion_date: dateISO, status: status || 'done' };
}

/* Записите към weekly_checklist — от етап 2 при отваряне трябва да са НУЛА. */
function writes(h) {
  return h.calls.post.filter(function (p) { return (p.url || '').indexOf('/weekly_checklist') >= 0; });
}
/* Отваря таба и смята правилото без запис; резултатът стои в h.__vals. */
async function open(h) {
  h.w.loadChecklist();
  await ticks();
  h.__vals = await h.w.checklistComputePortalValues();
}
/* Стойността по правилото за (обект, показател); undefined = „не се пълни". */
function pv(h, store, key) { return (h.__vals || {})[store + '|' + key]; }
function live(store, key, value) { return { store_name: store, metric_key: key, value: value }; }
function cellVal(h, store, key) {
  const t = h.doc.getElementById('checklist-table');
  if (!t) return null;
  const tr = Array.prototype.slice.call(t.querySelectorAll('tbody tr')).filter(function (x) {
    const f = x.querySelector('td');
    return f && f.textContent.trim() === store;
  })[0];
  if (!tr) return null;
  const i = METRICS.map(function (m) { return m.key; }).indexOf(key);
  const td = tr.querySelectorAll('td')[i + 1];
  if (!td) return null;
  const v = td.querySelector('.cl-val');
  return v ? v.textContent.trim() : '';
}

(async function () {

  /* ── 1. Ревизия: прозорецът Пон–Сря ──────────────────────────────────── */
  section('1. Ревизия 953 — да/не според прозореца Пон–Сря');
  {
    const probe = env(); const wk = weekOf(probe); probe.close();

    const h = env({ comps: [
      comp(REV_ID, 'Враца',   wk[2]),   /* сряда — В ПРОЗОРЕЦА */
      comp(REV_ID, 'Габрово', wk[3])    /* четвъртък — ИЗВЪН него */
      /* Добрич — никакво отмятане */
    ], rpc: [live('Враца', 'revizia_953', 'da'), live('Габрово', 'revizia_953', 'ne')] });
    await open(h);

    ok('сряда → da', pv(h, 'Враца', 'revizia_953') === 'da',
       JSON.stringify(pv(h, 'Враца', 'revizia_953')));
    ok('четвъртък → ne (извън Пон–Сря)',
       pv(h, 'Габрово', 'revizia_953') === 'ne',
       JSON.stringify(pv(h, 'Габрово', 'revizia_953')));
    ok('без отмятане → ne',
       pv(h, 'Добрич', 'revizia_953') === 'ne',
       JSON.stringify(pv(h, 'Добрич', 'revizia_953')));

    /* Клетката показва живото от rpc — тук със стойностите, които дава правилото. */
    ok('в клетката се вижда „да"', cellVal(h, 'Враца', 'revizia_953') === 'да',
       JSON.stringify(cellVal(h, 'Враца', 'revizia_953')));
    ok('и „не" при четвъртък', cellVal(h, 'Габрово', 'revizia_953') === 'не',
       JSON.stringify(cellVal(h, 'Габрово', 'revizia_953')));

    /* Понеделник и вторник също са в прозореца — не само сряда. */
    ok('първият ден от прозореца също брои',
       h.w.checklistPortalValueFor('any', { [wk[0]]: 1 }, 3) === 'da');
    h.close();
  }

  /* ── 2. Справка минуси: брой различни дни ────────────────────────────── */
  section('2. Справка минуси — „X/5" по РАЗЛИЧНИ дни');
  {
    const probe = env(); const wk = weekOf(probe); probe.close();

    const h = env({ comps: [
      /* Враца: четири различни дни */
      comp(MIN_ID, 'Враца', wk[0]), comp(MIN_ID, 'Враца', wk[1]),
      comp(MIN_ID, 'Враца', wk[2]), comp(MIN_ID, 'Враца', wk[3]),
      /* Габрово: ДВА записа в ЕДИН ден — това е един ден, не два */
      comp(MIN_ID, 'Габрово', wk[1]), comp(MIN_ID, 'Габрово', wk[1])
      /* Добрич: нула */
    ]});
    await open(h);

    ok('четири дни → 4/5', pv(h, 'Враца', 'spravka_minusi') === '4/5',
       JSON.stringify(pv(h, 'Враца', 'spravka_minusi')));
    ok('два записа в един ден → 1/5, не 2/5',
       pv(h, 'Габрово', 'spravka_minusi') === '1/5',
       JSON.stringify(pv(h, 'Габрово', 'spravka_minusi')));
    ok('нула → 0/5', pv(h, 'Добрич', 'spravka_minusi') === '0/5',
       JSON.stringify(pv(h, 'Добрич', 'spravka_minusi')));

    /* Знаменателят е дължината на due_weekdays, не заковано 5. */
    ok('знаменателят идва от задачата', h.w.checklistPortalValueFor('count', {}, 3) === '0/3');

    /* Съботно отмятане е извън Пон–Пет. */
    const h2 = env({ comps: [comp(MIN_ID, 'Враца', wk[5])] });
    await open(h2);
    ok('събота не влиза в 0/5',
       pv(h2, 'Враца', 'spravka_minusi') === '0/5',
       JSON.stringify(pv(h2, 'Враца', 'spravka_minusi')));
    h2.close();
    h.close();
  }

  /* ── 3. „X/5" се рендира дословно ────────────────────────────────────── */
  section('3. „4/5" не се превежда');
  {
    const probe = env(); const wk = weekOf(probe); probe.close();
    const h = env({ comps: [
      comp(MIN_ID, 'Враца', wk[0]), comp(MIN_ID, 'Враца', wk[1]),
      comp(MIN_ID, 'Враца', wk[2]), comp(MIN_ID, 'Враца', wk[3])
    ], rpc: [live('Враца', 'spravka_minusi', '4/5')] });
    await open(h);

    ok('правилото дава „4/5"', pv(h, 'Враца', 'spravka_minusi') === '4/5',
       JSON.stringify(pv(h, 'Враца', 'spravka_minusi')));
    ok('клетката показва „4/5" както е', cellVal(h, 'Враца', 'spravka_minusi') === '4/5',
       JSON.stringify(cellVal(h, 'Враца', 'spravka_minusi')));
    ok('checklistValueLabel не пипа „4/5"', h.w.checklistValueLabel('4/5') === '4/5');
    /* А трите известни стойности продължават да се превеждат. */
    ok('„da" още се превежда', h.w.checklistValueLabel('da') === 'да');
    ok('„ne" още се превежда', h.w.checklistValueLabel('ne') === 'не');
    ok('„nyamat" още се превежда', h.w.checklistValueLabel('nyamat') === 'нямат');
    h.close();
  }

  /* ── 4. Ръчното не се пипа ───────────────────────────────────────────── */
  section('4. Съществуващ ред: portal_value се обновява, ръчното — не');
  {
    const probe = env(); const wk = weekOf(probe); probe.close();

    const h = env({
      rows: [{ id:'r-1', year:2026, week_number:1, store_name:'Враца',
               metric_key:'revizia_953', portal_value:'ne',
               control_value:'nyamat', control_num:7, comment:'важна бележка' }],
      comps: [comp(REV_ID, 'Враца', wk[1])],   /* вторник → portal става da */
      rpc: [live('Враца', 'revizia_953', 'da')]
    });
    await open(h);

    ok('правилото дава da за вторник', pv(h, 'Враца', 'revizia_953') === 'da',
       JSON.stringify(pv(h, 'Враца', 'revizia_953')));
    /* Махнати (етап 2): „control_value / control_num / comment / updated_by НЕ
       са в тялото" — отварянето вече не пише, тяло няма. Вместо тях: нула записа. */
    ok('при отваряне НЯМА запис към weekly_checklist', writes(h).length === 0,
       'реално: ' + writes(h).length);

    /* И местно ръчното е непокътнато — живото пипа само portal_value. */
    const row = h.w.checklistRows.filter(function (r) {
      return r.store_name === 'Враца' && r.metric_key === 'revizia_953';
    })[0];
    if (ok('редът съществува местно', !!row)) {
      ok('control_value още е nyamat', row.control_value === 'nyamat', String(row.control_value));
      ok('control_num още е 7', row.control_num === 7, String(row.control_num));
      ok('коментарът е непокътнат', row.comment === 'важна бележка', String(row.comment));
      ok('portal_value е новото', row.portal_value === 'da', String(row.portal_value));
    }
    /* Клетката показва РЪЧНОТО с превес, не автоматичното. */
    ok('клетката още показва „нямат" (control бие portal)',
       cellVal(h, 'Враца', 'revizia_953') === 'нямат',
       JSON.stringify(cellVal(h, 'Враца', 'revizia_953')));
    h.close();
  }

  /* ── 5. Само status='done' ───────────────────────────────────────────── */
  section('5. Отложено и чакащо не се броят');
  {
    const probe = env(); const wk = weekOf(probe); probe.close();

    const h = env({ comps: [
      comp(REV_ID, 'Враца',   wk[1], 'postponed'),
      comp(REV_ID, 'Габрово', wk[1], 'pending'),
      comp(MIN_ID, 'Добрич',  wk[0], 'postponed'),
      comp(MIN_ID, 'Добрич',  wk[1], 'done')
    ]});
    await open(h);

    ok('отложена → ne', pv(h, 'Враца', 'revizia_953') === 'ne',
       JSON.stringify(pv(h, 'Враца', 'revizia_953')));
    ok('чакаща → ne', pv(h, 'Габрово', 'revizia_953') === 'ne',
       JSON.stringify(pv(h, 'Габрово', 'revizia_953')));
    ok('брои се само done: 1/5, не 2/5',
       pv(h, 'Добрич', 'spravka_minusi') === '1/5',
       JSON.stringify(pv(h, 'Добрич', 'spravka_minusi')));

    /* Отмятане без дата — фантомът от 19-те стари записа. */
    const h2 = env({ comps: [
      { recurring_task_id: REV_ID, store_name: 'Враца', completion_date: null, status: 'done' }
    ]});
    await open(h2);
    ok('отмятане без дата не се брои',
       pv(h2, 'Враца', 'revizia_953') === 'ne',
       JSON.stringify(pv(h2, 'Враца', 'revizia_953')));
    h2.close();
    h.close();
  }

  /* ── 6. Кои показатели изобщо се пълнят ──────────────────────────────── */
  section('6. Пълнят се ДВА показателя, не всички с recurring: източник');
  {
    const probe = env(); const wk = weekOf(probe); probe.close();
    const h = env({ comps: [comp(REV_ID, 'Враца', wk[0])] });
    await open(h);

    const keys = {}, stores = {};
    Object.keys(h.__vals).forEach(function (k) {
      const p = k.split('|'); stores[p[0]] = 1; keys[p[1]] = 1;
    });
    ok('пълни се revizia_953', !!keys.revizia_953, Object.keys(keys).join(','));
    ok('пълни се spravka_minusi', !!keys.spravka_minusi, Object.keys(keys).join(','));
    ok('НЕ се пълни stoka_vrashtane (recurring, но без правило)',
       !keys.stoka_vrashtane, Object.keys(keys).join(','));
    ok('НЕ се пълни storna_priem', !keys.storna_priem, Object.keys(keys).join(','));
    ok('НЕ се пълни stoka_na_pat', !keys.stoka_na_pat, Object.keys(keys).join(','));
    ok('НЕ се пълни preocenka', !keys.preocenka, Object.keys(keys).join(','));
    ok('точно два показателя', Object.keys(keys).length === 2, Object.keys(keys).join(','));

    /* uuid-тата се четат от source, не са заковани. */
    ok('uuid се чете от source',
       h.w.checklistRecurringId({ source: 'recurring:abc-123' }) === 'abc-123');
    ok('module: източник не дава uuid',
       h.w.checklistRecurringId({ source: 'module:kasa' }) === null);
    ok('manual не дава uuid', h.w.checklistRecurringId({ source: 'manual' }) === null);

    /* ЦО не е отчетен обект — не бива да получава ред. */
    ok('Централен офис не влиза', !stores['Централен офис'], Object.keys(stores).join(','));
    h.close();

    /* ЯДРОТО на списъка с режими, отделно от липсващите due_weekdays.
       Горните проверки минаваха и по ВТОРАТА причина: „Стока за връщане" е
       без due_weekdays, тоест правилото ѝ и без това е неизвестно. Затова
       тук ѝ се ДАВАТ дни — остава само липсата на режим. Без този случай
       махането на CHECKLIST_PORTAL_MODE от филтъра минаваше незабелязано
       (проверено с мутация). */
    const h3 = boot({
      modules: ['bulletin.js', 'checklist.js'],
      user: ADMIN,
      data: {
        users: USERS,
        weekly_checklist_metrics: METRICS,
        weekly_checklist: [],
        recurring_tasks: [
          { id: REV_ID, due_weekdays: [0, 1, 2] },
          { id: MIN_ID, due_weekdays: [0, 1, 2, 3, 4] },
          { id: VRA_ID, due_weekdays: [2] }   /* ← вече ИМА срок */
        ],
        task_completions: [comp(VRA_ID, 'Враца', wk[2])]
      }
    });
    await open(h3);

    const keys3 = {};
    Object.keys(h3.__vals).forEach(function (k) { keys3[k.split('|')[1]] = 1; });
    ok('показател с recurring: И с due_weekdays, но без режим, пак НЕ се пълни',
       !keys3.stoka_vrashtane, Object.keys(keys3).join(','));
    ok('а другите два продължават да се пълнят',
       !!keys3.revizia_953 && !!keys3.spravka_minusi, Object.keys(keys3).join(','));
    ok('пак точно два показателя', Object.keys(keys3).length === 2, Object.keys(keys3).join(','));
    h3.close();
  }

  /* ── 7. Отварянето не пише ───────────────────────────────────────────── */
  /* До етап 2 тук стоеше „непроменена стойност не праща заявка". От етап 2
     отварянето не пише ИЗОБЩО — нито непроменено, нито променено. */
  section('7. Отварянето не праща запис към weekly_checklist');
  {
    const probe = env(); const wk = weekOf(probe); probe.close();

    /* Редовете носят СТАРИ стойности, а правилото дава други — до етап 2
       това значеше запис при отваряне. */
    const rows = [];
    ['Враца', 'Габрово', 'Добрич'].forEach(function (s) {
      rows.push({ store_name:s, metric_key:'revizia_953', portal_value:'ne',
                  control_value:null, control_num:null, comment:null });
      rows.push({ store_name:s, metric_key:'spravka_minusi', portal_value:'0/5',
                  control_value:null, control_num:null, comment:null });
    });

    const h = env({ rows: rows, comps: [comp(REV_ID, 'Враца', wk[0]), comp(MIN_ID, 'Габрово', wk[0])] });
    await open(h);

    ok('правилото дава нова стойност (da)', pv(h, 'Враца', 'revizia_953') === 'da',
       JSON.stringify(pv(h, 'Враца', 'revizia_953')));
    ok('нула записа при отваряне', writes(h).length === 0,
       'реално: ' + writes(h).length);
    ok('нито един POST изобщо', h.calls.post.length === 0,
       JSON.stringify(h.calls.post.map(function (p) { return p.url; })));
    ok('таблицата пак е рендирана', !!h.doc.getElementById('checklist-table'));
    h.close();
  }

  /* ── 8. Провалът не се поглъща ───────────────────────────────────────── */
  /* До етап 2: провален ЗАПИС. Запис при отваряне вече няма — провалът,
     който може да се случи при отваряне, е на живите стойности (rpc). */
  section('8. Провалени живи стойности: toast и нито една попълнена клетка');
  {
    const probe = env(); const wk = weekOf(probe); probe.close();

    const h = env({
      comps: [comp(REV_ID, 'Враца', wk[1])],
      rpc: [live('Враца', 'revizia_953', 'da'), live('Добрич', 'spravka_minusi', '0/5')],
      fail: { GET: { status: 400, body: { message: 'нарушено ограничение' },
                     url: /rpc\/checklist_portal_values/ } }
    });
    await open(h);

    ok('излязъл е toast', h.calls.toast.length > 0, JSON.stringify(h.calls.toast));
    ok('toast-ът носи причината',
       h.calls.toast.join(' ').indexOf('нарушено ограничение') >= 0,
       JSON.stringify(h.calls.toast));
    ok('клетката НЕ изглежда попълнена', cellVal(h, 'Враца', 'revizia_953') === '',
       JSON.stringify(cellVal(h, 'Враца', 'revizia_953')));
    ok('нито една клетка не е попълнена', cellVal(h, 'Добрич', 'spravka_minusi') === '',
       JSON.stringify(cellVal(h, 'Добрич', 'spravka_minusi')));
    ok('местните редове са без portal_value',
       h.w.checklistRows.every(function (r) { return !r.portal_value; }),
       JSON.stringify(h.w.checklistRows.slice(0, 3)));
    /* Мрежата все пак е тук — контрол, който изчезва при грешка, изглежда
       като счупен. */
    ok('таблицата пак се рендира', !!h.doc.getElementById('checklist-table'));
    ok('и при провал нищо не се пише', writes(h).length === 0, 'реално: ' + writes(h).length);
    h.close();
  }

  report();
})();
