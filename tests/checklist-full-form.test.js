/* Чек лист — пълната бланка на контролинга (12 колони, 28.09.2026).

   Какво заковава файлът:
   1. „Ревизия група / групи" се пълни от „РЕВИЗИЯ ГРУПИ" (recurring:,
      Пон–Сря) в режим 'any' — като ревизия 953.
   2. „Сторна по грешни приеми" работи в пълната бланка: „бланки/редове",
      без сторна „0/0", не празно. Самото правило — в
      checklist-wrong-receipt.test.js.
   3. „Преоценка" — задача без due_weekdays, режим 'file_none': файл → да,
      иначе → не. „Нямат" НЕ идва от портала дори при отмятане само с
      коментар — Бюлетинът изисква файл (Дупница, седмица 37); остава ръчно.
   Във всеки от трите: ръчното на контролинга не влиза в тялото на записа и
   клетката показва него.
   4–5. 12 колони в реда от базата; ръчна колона се кликва да/не и
      порталът не пише нищо в нея. Писмото и седмичният отчет рисуват
      колоните от редовете, без заковани ключове.

   Пускане:  node tests/checklist-full-form.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const REV_ID  = '74da41e4-494f-48cc-a434-79bfc04fc243';
const GRP_ID  = '0d668f1a-a8df-40ff-ab8f-ebf6b9d9acc4';
const MIN_ID  = '03c44560-9572-4274-ad53-5228d61b4de7';
const PREO_ID = 'a5e1e6f8-5b47-43ce-bfa4-5ab3ee7f70a6';

/* Бланката след миграцията, в реда на sort_order. */
const METRICS = [
  ['revizia_953',       'ревизия',                    'yes_no',      'recurring:' + REV_ID],
  ['revizia_grupi',     'Ревизия група / групи',      'yes_no',      'recurring:' + GRP_ID],
  ['spravka_minusi',    'справка минуси',             'yes_no',      'recurring:' + MIN_ID],
  ['stoka_vrashtane',   'Стока за връщане- ТАБЛИЦИ',  'yes_no',      'module:returns'],
  ['razhodi',           'разходи',                    'yes_no',      'manual'],
  ['zanulyavane_lm',    'таблица зануляване л.м.',    'yes_no',      'manual'],
  ['razliki_dostavka',  'Разлики от доставка',        'yes_no',      'manual'],
  ['srok_godnost',      'Срок на годност/рекламации', 'yes_no',      'manual'],
  ['dogovoreni_returi', 'Договорени ретури',          'yes_no',      'manual'],
  ['storna_priem',      'Сторна по грешни приеми',    'number',      'module:wrong_receipt'],
  ['stoka_na_pat',      'стока на път',               'yes_no',      'module:transit'],
  ['preocenka',         'преоценка',                  'yes_no_none', 'recurring:' + PREO_ID]
].map(function (a, i) {
  return { key: a[0], label: a[1], sublabel: '', value_type: a[2], source: a[3],
           sort_order: i + 1, active: true, deadline_day: null };
});
const KEYS = METRICS.map(function (m) { return m.key; });
const MANUAL = ['razhodi', 'zanulyavane_lm', 'razliki_dostavka', 'srok_godnost', 'dogovoreni_returi'];

const TASKS = [
  { id: REV_ID,  due_weekdays: [0, 1, 2] },
  { id: GRP_ID,  due_weekdays: [0, 1, 2] },
  { id: MIN_ID,  due_weekdays: [0, 1, 2, 3, 4] },
  { id: PREO_ID, due_weekdays: null }
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
      recurring_task_versions: [],
      recurring_task_periods: [],
      recurring_task_skips: [],
      task_completions: opts.comps || [],
      differences_reports: opts.reports || [],
      stock_differences: opts.lines || [],
      stock_returns: [],
      goods_transit: []
    }
  };
  if (opts.fail) b.fail = opts.fail;
  return boot(b);
}

function weekOf(h) {
  const def = h.w.checklistDefaultWeek();
  return h.w.weekDays(def.week, def.year).map(h.w.toLocalISO);
}
/* Местно време → ISO, както го пише Supabase за timestamptz. */
function at(dateISO, hhmm) { return new Date(dateISO + 'T' + hhmm + ':00').toISOString(); }

let seq = 0;
function comp(taskId, store, dateISO, extra) {
  return Object.assign({ id: 'c-' + (++seq), recurring_task_id: taskId, store_name: store,
                         completion_date: dateISO, status: 'done', comment: null, files: [] }, extra || {});
}
function rep(id, store, direction, createdAt) {
  return { id: id, store_name: store, direction: direction, created_at: createdAt };
}
function lines(reportId, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: reportId + '-l' + i, report_id: reportId });
  return out;
}

function bodyOf(p) { return Array.isArray(p.body) ? p.body : [p.body]; }
function writes(h) {
  return h.calls.post.filter(function (p) { return (p.url || '').indexOf('/weekly_checklist?') >= 0; });
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
function pv(h, store, key) { const r = written(h, store, key); return r ? r.portal_value : undefined; }
function cellOf(h, store, key) {
  const t = h.doc.getElementById('checklist-table');
  if (!t) return null;
  const tr = Array.prototype.slice.call(t.querySelectorAll('tbody tr')).filter(function (x) {
    const f = x.querySelector('td');
    return f && f.textContent.trim() === store;
  })[0];
  if (!tr) return null;
  return tr.querySelectorAll('td')[KEYS.indexOf(key) + 1] || null;
}
function cellVal(h, store, key) {
  const td = cellOf(h, store, key);
  if (!td) return null;
  const v = td.querySelector('.cl-val');
  return v ? v.textContent.trim() : '';
}
function cellTitle(h, store, key) {
  const td = cellOf(h, store, key);
  const v = td && td.querySelector('.cl-val');
  return v ? (v.getAttribute('title') || '') : null;
}
function noManualInBody(h) {
  return writes(h).every(function (p) {
    return bodyOf(p).every(function (r) {
      return !('control_value' in r) && !('control_num' in r) && !('comment' in r);
    });
  });
}

(async function () {

  const probe = env(); const wk = weekOf(probe); probe.close();
  /* Предходната седмица — за да се види, че не влиза. */
  const prevSun = (function () { const d = new Date(wk[0] + 'T12:00:00'); d.setDate(d.getDate() - 1); return probe.w.toLocalISO(d); })();

  /* ── 1. Ревизия групи ───────────────────────────────────────────────── */
  section('1. Ревизия група / групи — да/не в прозореца Пон–Сря');
  {
    const h = env({
      comps: [
        comp(GRP_ID, 'Враца',   wk[1]),        /* вторник — в прозореца */
        comp(GRP_ID, 'Габрово', wk[4])         /* петък — извън него */
      ],
      rows: [{ store_name:'Добрич', metric_key:'revizia_grupi', portal_value:null,
               control_value:'da', control_num:null, comment:'по имейл' }]
    });
    h.w.loadChecklist(); await ticks();

    ok('има данни в прозореца → da', pv(h, 'Враца', 'revizia_grupi') === 'da', JSON.stringify(written(h, 'Враца', 'revizia_grupi')));
    ok('отмятане извън прозореца → ne', pv(h, 'Габрово', 'revizia_grupi') === 'ne', JSON.stringify(written(h, 'Габрово', 'revizia_grupi')));
    ok('няма данни → ne (порталът пише)', pv(h, 'Добрич', 'revizia_grupi') === 'ne', JSON.stringify(written(h, 'Добрич', 'revizia_grupi')));
    ok('control_value/comment не влизат в тялото', noManualInBody(h));
    ok('Добрич показва ръчното „да", не портала', cellVal(h, 'Добрич', 'revizia_grupi') === 'да', cellVal(h, 'Добрич', 'revizia_grupi'));
    ok('Враца показва портала „да" (бледо)', cellVal(h, 'Враца', 'revizia_grupi') === 'да' &&
       /Стойност от портала/.test(cellTitle(h, 'Враца', 'revizia_grupi')), cellTitle(h, 'Враца', 'revizia_grupi'));
    h.close();
  }

  /* ── 2. Сторна по грешни приеми ─────────────────────────────────────── */
  /* Правилото („бланки/редове", границите на седмицата, бъдеща седмица) е
     заковано в checklist-wrong-receipt.test.js. Тук само, че показателят
     работи в пълната бланка: source module:wrong_receipt, ръчното бие
     портала, 0 е „0/0", не празно. Фалшивият PostgREST не филтрира, затова
     бланките тук са само от показаната седмица. */
  section('2. Сторна — „бланки/редове" в пълната бланка, „0/0" ≠ празно');
  {
    const reports = [
      rep('r1', 'Враца',  'wrong_receipt', at(wk[0], '09:00')),
      rep('r2', 'Враца',  'wrong_receipt', at(wk[4], '15:00')),
      rep('r7', 'Добрич', 'wrong_receipt', at(wk[3], '09:00'))
    ];
    const ls = [].concat(lines('r1', 3), lines('r2', 4), lines('r7', 1));
    const h = env({
      reports: reports, lines: ls,
      rows: [{ store_name:'Добрич', metric_key:'storna_priem', portal_value:null,
               control_value:null, control_num:5, comment:null }]
    });
    h.w.loadChecklist(); await ticks();

    ok('Враца → „2/7"', pv(h, 'Враца', 'storna_priem') === '2/7', JSON.stringify(written(h, 'Враца', 'storna_priem')));
    ok('Габрово без сторна → „0/0", не празно', pv(h, 'Габрово', 'storna_priem') === '0/0', JSON.stringify(written(h, 'Габрово', 'storna_priem')));
    ok('в клетката на Габрово се вижда „0/0"', cellVal(h, 'Габрово', 'storna_priem') === '0/0', cellVal(h, 'Габрово', 'storna_priem'));
    ok('Добрич: порталът пише „1/1"', pv(h, 'Добрич', 'storna_priem') === '1/1', JSON.stringify(written(h, 'Добрич', 'storna_priem')));
    ok('Добрич показва control_num 5, не портала', cellVal(h, 'Добрич', 'storna_priem') === '5', cellVal(h, 'Добрич', 'storna_priem'));
    ok('control_num не влиза в тялото', noManualInBody(h));
    h.close();
  }
  {
    /* Провал при редовете → нищо за сторната, toast. */
    const h = env({ reports: [rep('r1', 'Враца', 'wrong_receipt', at(wk[2], '10:00'))],
                    fail: { GET: /stock_differences/ } });
    h.w.loadChecklist(); await ticks();
    ok('провал → сторната не се записва', written(h, 'Враца', 'storna_priem') === null && written(h, 'Габрово', 'storna_priem') === null);
    ok('провал → червен toast', h.calls.toast.some(function (t) { return /Грешка/.test(String(t)); }), JSON.stringify(h.calls.toast));
    h.close();
  }

  /* ── 3. Преоценка ───────────────────────────────────────────────────── */
  section('3. Преоценка — файл → да, иначе не; „нямат" само ръчно');
  {
    const FILE = [{ url: 'https://x/completion_1.pdf', name: 'преоценка.pdf' }];
    const h = env({
      comps: [
        comp(PREO_ID, 'Враца',   wk[5], { files: FILE, comment: 'подадена' }),      /* събота — всеки ден важи */
        comp(PREO_ID, 'Габрово', wk[1], { files: [], comment: 'няма преоценка' }),
        comp(PREO_ID, 'Добрич',  wk[1], { files: FILE, status: 'postponed' }),      /* не е свършена */
        comp(PREO_ID, 'Добрич',  prevSun, { files: FILE })                          /* предната седмица */
      ],
      rows: [{ store_name:'Габрово', metric_key:'preocenka', portal_value:null,
               control_value:'da', control_num:null, comment:null },
             { store_name:'Добрич', metric_key:'preocenka', portal_value:null,
               control_value:'nyamat', control_num:null, comment:null }]
    });
    h.w.loadChecklist(); await ticks();

    ok('ръчното „нямат" се показва и не се пипа', cellVal(h, 'Добрич', 'preocenka') === 'нямат', cellVal(h, 'Добрич', 'preocenka'));
    ok('файл → da', pv(h, 'Враца', 'preocenka') === 'da', JSON.stringify(written(h, 'Враца', 'preocenka')));
    ok('само коментар → ne (порталът не дава nyamat)', pv(h, 'Габрово', 'preocenka') === 'ne', JSON.stringify(written(h, 'Габрово', 'preocenka')));
    ok('порталът не пише nyamat никъде', writes(h).every(function (p) { return bodyOf(p).every(function (r) { return r.portal_value !== 'nyamat'; }); }));
    ok('нищо свършено в седмицата → ne', pv(h, 'Добрич', 'preocenka') === 'ne', JSON.stringify(written(h, 'Добрич', 'preocenka')));
    ok('Враца показва „да"', cellVal(h, 'Враца', 'preocenka') === 'да', cellVal(h, 'Враца', 'preocenka'));
    ok('Габрово показва ръчното „да", не портала „не"', cellVal(h, 'Габрово', 'preocenka') === 'да', cellVal(h, 'Габрово', 'preocenka'));
    ok('control_value не влиза в тялото', noManualInBody(h));
    const q = h.calls.get.filter(function (u) { return u.indexOf('/task_completions') >= 0; })[0] || '';
    ok('заявката за отмятанията носи files', /select=[^&]*files/.test(q), q);
    h.close();
  }
  {
    /* Файл и коментар в два отделни реда на един обект — файлът печели,
       независимо от реда. Пренесено в показаната седмица се брои. */
    const FILE = [{ url: 'https://x/a.pdf' }];
    const h = env({ comps: [
      comp(PREO_ID, 'Враца', wk[1], { comment: 'още няма' }),
      comp(PREO_ID, 'Враца', wk[3], { files: FILE }),
      comp(PREO_ID, 'Габрово', prevSun, { files: FILE, postponed_to: wk[2] })
    ]});
    h.w.loadChecklist(); await ticks();
    ok('коментар + по-късен файл → da', pv(h, 'Враца', 'preocenka') === 'da', JSON.stringify(written(h, 'Враца', 'preocenka')));
    ok('пренесено в седмицата с файл → da', pv(h, 'Габрово', 'preocenka') === 'da', JSON.stringify(written(h, 'Габрово', 'preocenka')));
    h.close();
  }
  {
    /* Стойността вече е записана → нищо ново не се пише. */
    const h = env({ rows: ['Враца', 'Габрово', 'Добрич'].map(function (s) {
      return { store_name: s, metric_key: 'preocenka', portal_value: 'ne', control_value: null, control_num: null, comment: null };
    })});
    h.w.loadChecklist(); await ticks();
    ok('непроменено „ne" не се пише наново', written(h, 'Враца', 'preocenka') === null);
    h.close();
  }

  /* ── 4–5. Колоните ──────────────────────────────────────────────────── */
  section('4–5. 12 колони в реда на бланката; ръчните се кликват, порталът не ги пипа');
  {
    const h = env();
    h.w.loadChecklist(); await ticks();

    const ths = Array.prototype.slice.call(h.doc.querySelectorAll('#checklist-table thead th')).slice(1);
    ok('12 колони', ths.length === 12, String(ths.length));
    const labels = ths.map(function (th) { return th.querySelector('div').textContent.trim(); });
    ok('редът е ревизия · групи · минуси · връщане · 5 ръчни · сторна · на път · преоценка',
       JSON.stringify(labels) === JSON.stringify(METRICS.map(function (m) { return m.label; })), JSON.stringify(labels));
    const mq = h.calls.get.filter(function (u) { return u.indexOf('/weekly_checklist_metrics') >= 0; })[0] || '';
    ok('метриките се искат по sort_order', /order=sort_order/.test(mq), mq);

    ok('порталът не пише нищо в ръчните колони',
       MANUAL.every(function (k) { return ['Враца', 'Габрово', 'Добрич'].every(function (s) { return written(h, s, k) === null; }); }));

    const before = h.calls.post.length;
    cellOf(h, 'Враца', 'razhodi').click(); await ticks();
    ok('клик → „да"', cellVal(h, 'Враца', 'razhodi') === 'да', cellVal(h, 'Враца', 'razhodi'));
    cellOf(h, 'Враца', 'razhodi').click(); await ticks();
    ok('втори клик → „не"', cellVal(h, 'Враца', 'razhodi') === 'не', cellVal(h, 'Враца', 'razhodi'));
    const clicks = h.calls.post.slice(before).map(function (p) { return bodyOf(p)[0]; });
    ok('два записа с control_value da, ne', clicks.length === 2 && clicks[0].control_value === 'da' && clicks[1].control_value === 'ne', JSON.stringify(clicks));
    ok('кликът не носи portal_value', clicks.every(function (b) { return !('portal_value' in b); }));
    cellOf(h, 'Габрово', 'dogovoreni_returi').click(); await ticks();
    ok('последната ръчна колона също се кликва', cellVal(h, 'Габрово', 'dogovoreni_returi') === 'да', cellVal(h, 'Габрово', 'dogovoreni_returi'));
    h.close();
  }
  {
    /* Писмото и седмичният отчет — колоните идват от редовете. */
    const h = boot({ modules: ['bulletin.js', 'checklist.js', 'report.js'], user: ADMIN, data: {} });
    const stores = ['Враца', 'Габрово'];
    const rows = [
      { store_name:'Враца',   metric_key:'storna_priem', portal_value:'0/0' },
      { store_name:'Габрово', metric_key:'preocenka',    portal_value:'nyamat' },
      { store_name:'Габрово', metric_key:'srok_godnost', control_value:'da' }
    ];
    const html = h.w.checklistEmailHtml(2026, 39, 1, rows, METRICS, stores, null);
    const d = new h.w.DOMParser().parseFromString(html, 'text/html');
    const th = d.querySelectorAll('thead th');
    ok('писмото: 1 + 12 колони', th.length === 13, String(th.length));
    const tr = Array.prototype.slice.call(d.querySelectorAll('tbody tr'));
    const cell = function (s, k) {
      const r = tr.filter(function (x) { return x.querySelector('td').textContent.trim() === s; })[0];
      return r.querySelectorAll('td')[KEYS.indexOf(k) + 1].textContent.trim();
    };
    ok('писмото: сторна „0/0"', cell('Враца', 'storna_priem') === '0/0', cell('Враца', 'storna_priem'));
    ok('писмото: преоценка „нямат"', cell('Габрово', 'preocenka') === 'нямат', cell('Габрово', 'preocenka'));
    ok('писмото: нова колона „да"', cell('Габрово', 'srok_godnost') === 'да', cell('Габрово', 'srok_godnost'));

    const sec = h.w.reportChecklistSectionHtml({ checklist: { year: 2026, week: 39, metrics: METRICS, stores: stores, rows: rows, updatedAt: null } });
    const d2 = new h.w.DOMParser().parseFromString(sec, 'text/html');
    const rth = d2.querySelectorAll('tr')[0].querySelectorAll('th');
    ok('седмичният отчет: 1 + 12 колони', rth.length === 13, String(rth.length));
    const rtr = Array.prototype.slice.call(d2.querySelectorAll('tr')).slice(1);
    const rcell = function (s, k) {
      const r = rtr.filter(function (x) { return x.querySelector('td').textContent.trim() === s; })[0];
      return r.querySelectorAll('td')[KEYS.indexOf(k) + 1].textContent.trim();
    };
    ok('отчетът: сторна „0/0"', rcell('Враца', 'storna_priem') === '0/0', rcell('Враца', 'storna_priem'));
    ok('отчетът: преоценка „нямат"', rcell('Габрово', 'preocenka') === 'нямат', rcell('Габрово', 'preocenka'));
    ok('отчетът: нова колона „да"', rcell('Габрово', 'srok_godnost') === 'да', rcell('Габрово', 'srok_godnost'));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
