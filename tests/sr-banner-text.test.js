/* „За връщане": банерът за обекта назовава ИСТИНСКАТА задача на подтаба
   (24.10.2026, след проверката на живо с Монтана).

   ПОВОД. Банерът пишеше „Задачата „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" … ръчна
   отметка няма. Броят се двата подтаба заедно. Дата, поставена от офиса или
   от импорт…" — задача с това име вече няма (две са: „… ПО РАЗЛИКИ" и
   „… ЗА ВРЪЩАНЕ"), а последните изречения са технически.

   ТВЪРДЕНИЯТА (обект):
   · на всеки подтаб — заглавието на НЕГОВАТА задача (по linked_module),
     от версията за седмицата, ако има такава;
   · N > 0: „📝 N записа чакат актуализация тази седмица. Отворете ги с
     „📝 Без актуализация“ … Задачата „…“ в Бюлетина се отмята сама, когато
     няма такива записи."; етикетът е същият като на чипа;
   · 0: „✅ Всички невзети записи са актуализирани тази седмица. Задачата
     „…“ в Бюлетина се отмята сама.";
   · без задача (няма, насочена към друг обект, изключена за седмицата) —
     без изречение за Бюлетина;
   · „СРОК НА ГОДНОСТ" и „двата подтаба" ги няма никъде в модула;
   · офисът (25.10.2026, sr-banner-office) — същата функция и същите правила:
     задачата на подтаба, брой само за подтаба, ред за другия подтаб; само
     той вижда последното изречение „Дата, поставена от офиса или от импорт…“;
     броят не зависи от филтъра по магазин (както и преди).

   МУТАЦИИ (пускани ръчно на 24.10.2026, всяка пада):
   M1 твърдо име на задачата в банера;
   M2 размяна на подтабовете (заглавието на другия подтаб);
   M3 N = needs + needsOther (броят на двата подтаба в първия ред);
   M4 офисът с твърдо име на задачата;
   M5 офисът със сбор на двата подтаба.

   Пускане: node tests/sr-banner-text.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, ticks } = H;

const WED = '2026-10-07';
const MON = '2026-10-05';
function freezeDate(w, iso) {
  const Real = w.Date, ms = new Real(iso + 'T12:00:00').getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const STORE = 'Монтана';
const USER = { email: 'montana@temax.bg', display_name: 'Склад Монтана', role: 'manager', store_name: STORE };
const OFFICE = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'accounting', store_name: 'Централен офис' };

const T_DIFF = 'СПИСЪК СТОКА ЗА ИЗТЕГЛЯНЕ ПО РАЗЛИКИ';
const T_CMP = 'СПИСЪК СТОКА ЗА ВРЪЩАНЕ';
const T_CMP_OLD = 'СТАРО ИМЕ НА ВРЪЩАНЕТО';
function task(id, title, mod, over) {
  return Object.assign({ id: id, title: title, linked_module: mod, task_type: 'info', active: true,
    due_weekday: 4, due_weekdays: [4], target_stores: null }, over || {});
}
const TASKS = [
  task('rt-diff', T_DIFF, 'stock-returns-diff'),
  /* Като в базата (24.10.2026): linked_module на реда е NULL — живее само във версията. */
  task('rt-cmp', T_CMP_OLD, null, { task_type: 'comment' })
];
/* Заглавието на „връщане" за ТАЗИ седмица е във версията. */
const VERSIONS = [{ id: 'v1', recurring_task_id: 'rt-cmp', from_monday: MON, to_monday: null,
  title: T_CMP, description: null, due_weekday: 4, due_weekdays: [4], due_window: false, due_time: null,
  task_type: 'info', department: 'admin', target_stores: null, report_groups: null, linked_module: 'stock-returns-complaint' }];

function ret(id, over) {
  return Object.assign({ id: id, store_name: STORE, status: 'pending', source: 'diff',
    confirmed_date: null, confirmed_by: null, confirmed_at: null, created_at: '2026-10-01T08:00:00.000Z',
    product_name: 'Стока ' + id, sap_code: 'S' + id, quantity: 1, supplier: 'Доставчик', purchase_order: 'PV-' + id }, over || {});
}
const upd = { confirmed_date: WED, confirmed_by: 'store:' + STORE };
const ROWS_N = [ret('d1'), ret('d2'), ret('c1', Object.assign({ source: 'complaint' }, upd))];
const ROWS_0 = [ret('d1', upd), ret('c1', Object.assign({ source: 'complaint' }, upd))];

async function view(opts) {
  const h = boot({
    modules: ['stock-returns.js'], user: opts.user || USER,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      stock_returns: () => (opts.rows || ROWS_N), stock_differences: [],
      recurring_tasks: () => (opts.tasks || TASKS),
      recurring_task_versions: () => (opts.versions || VERSIONS),
      recurring_task_skips: () => (opts.skips || [])
    }
  });
  freezeDate(h.w, WED);
  if (!guard('loadStockReturns() не хвърля', () => h.w.loadStockReturns())) return null;
  for (let i = 0; i < 60; i++) {
    if (h.doc.getElementById('mod-stock-returns').innerHTML.indexOf('Стока за връщане') >= 0) break;
    await ticks();
  }
  return h;
}
const mod = h => h.doc.getElementById('mod-stock-returns');
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const note = h => txt(h.doc.getElementById('sr-needs-note'));
/* Първият ред на банера — без отделния ред за другия подтаб. */
const first = h => { const n = h.doc.getElementById('sr-needs-note'); if (!n) return ''; const c = n.cloneNode(true); const o = c.querySelector('#sr-needs-other'); if (o) o.remove(); return txt(c); };
const other = h => txt(h.doc.getElementById('sr-needs-other'));
const tabBtn = (h, label) => Array.from(mod(h).querySelectorAll('button')).find(b => txt(b) === label);
/* Офисът: старите изречения ги няма; „импорт“ е само в изречението за офиса. */
const noOldOffice = (h, where) => {
  const all = txt(mod(h));
  ok(where + ': „СРОК НА ГОДНОСТ" го няма', all.indexOf('СРОК НА ГОДНОСТ') < 0);
  ok(where + ': „двата подтаба" го няма', all.indexOf('двата подтаба') < 0);
  ok(where + ': „ръчна отметка" и „в другия подтаб" ги няма', note(h).indexOf('ръчна отметка') < 0 && note(h).indexOf('в другия подтаб') < 0, note(h));
};
const noOld = (h, where) => {
  const all = txt(mod(h));
  ok(where + ': „СРОК НА ГОДНОСТ" го няма', all.indexOf('СРОК НА ГОДНОСТ') < 0);
  ok(where + ': „двата подтаба" го няма', all.indexOf('двата подтаба') < 0);
  ok(where + ': „ръчна отметка" и „от импорт" ги няма в банера', note(h).indexOf('ръчна отметка') < 0 && note(h).indexOf('импорт') < 0, note(h));
};

(async function () {

  section('1. N > 0, подтаб „По разлики" → задачата по разлики');
  {
    const h = await view({});
    if (h) {
      ok('банерът — точният текст', first(h) ===
        '📝 2 записа чакат актуализация тази седмица. Отворете ги с „📝 Без актуализация“ и обновете статуса или коментара. ' +
        'Задачата „' + T_DIFF + '“ в Бюлетина се отмята сама, когато няма такива записи.', first(h));
      ok('в другия подтаб няма чакащи → без отделен ред', !h.doc.getElementById('sr-needs-other'));
      const chip = mod(h).querySelector('button[data-sr-f="needs"]');
      ok('етикетът в банера е същият като на чипа', !!chip && txt(chip).indexOf(h.w.SR_NEEDS_LABEL) === 0 && note(h).indexOf('„' + h.w.SR_NEEDS_LABEL + '“') >= 0, txt(chip));
      ok('заглавието на ДРУГИЯ подтаб го няма', note(h).indexOf(T_CMP) < 0);
      noOld(h, 'разлики');

      /* „0 тук, 2 в другия подтаб“: N е САМО за текущия подтаб — същото, по
         което се отмята назованата задача; другият подтаб е на свой ред. */
      section('2. Истински клик на „По рекламации": 0 тук, 2 в другия подтаб; задачата от версията');
      realClick(h.w, tabBtn(h, '📋 По рекламации / срок на годност'));
      await ticks();
      ok('подтабът е сменен', h.w.srTab === 'complaint');
      ok('първият ред е „✅ …“ с „' + T_CMP + '"', first(h) ===
        '✅ Всички невзети записи са актуализирани тази седмица. Задачата „' + T_CMP + '“ в Бюлетина се отмята сама.', first(h));
      ok('отделният ред казва какво и къде', other(h) === '📝 2 записа чакат актуализация в „🔄 По разлики“.', other(h));
      ok('… името е точно като на бутона на подтаба', !!tabBtn(h, '🔄 По разлики') && other(h).indexOf('„' + txt(tabBtn(h, '🔄 По разлики')) + '“') >= 0);
      ok('… и е отделен елемент вътре в банера', !!h.doc.getElementById('sr-needs-other') && h.doc.getElementById('sr-needs-other').parentNode.id === 'sr-needs-note');
      ok('не старото заглавие от реда (версията печели)', note(h).indexOf(T_CMP_OLD) < 0);
      ok('и не задачата по разлики', note(h).indexOf(T_DIFF) < 0);
      noOld(h, 'рекламации');
      h.close();
    }
  }

  section('3. Нула чакащи → кратко „✅ …", със задачата на подтаба');
  {
    const h = await view({ rows: ROWS_0 });
    if (h) {
      ok('точният текст', note(h) === '✅ Всички невзети записи са актуализирани тази седмица. Задачата „' + T_DIFF + '“ в Бюлетина се отмята сама.', note(h));
      noOld(h, 'при 0');
      h.close();
    }
  }

  section('4. Без задача → без изречение за Бюлетина');
  {
    const cases = [
      ['няма задачи', { tasks: [], versions: [] }],
      ['задачата е насочена към друг обект', { tasks: [task('rt-diff', T_DIFF, 'stock-returns-diff', { target_stores: ['Враца'] })], versions: [] }],
      ['задачата е изключена за седмицата', { tasks: [task('rt-diff', T_DIFF, 'stock-returns-diff')], versions: [],
        skips: [{ id: 's1', recurring_task_id: 'rt-diff', store_name: STORE }] }],
      ['само „за информация" (notice)', { tasks: [task('rt-diff', T_DIFF, 'stock-returns-diff', { task_type: 'notice' })], versions: [] }]
    ];
    for (const [label, o] of cases) {
      const h = await view(o);
      if (h) {
        ok(label + ': банерът го има', note(h).indexOf('📝 2 записа чакат актуализация тази седмица.') === 0, note(h));
        ok(label + ': без „Бюлетина"', note(h).indexOf('Бюлетина') < 0 && note(h).indexOf('Задачата') < 0, note(h));
        h.close();
      }
    }
    const h0 = await view({ rows: ROWS_0, tasks: [], versions: [] });
    if (h0) {
      ok('при 0 и без задача — само първото изречение', note(h0) === '✅ Всички невзети записи са актуализирани тази седмица.', note(h0));
      h0.close();
    }
  }

  section('5. Офисът — същите правила, плюс изречението за офиса/импорта');
  {
    const OFF = ' Дата, поставена от офиса или от импорт, не се брои за актуализация на обекта.';
    /* Чужд обект с чакащ запис по разлики — офисът вижда всички обекти. */
    const rows = ROWS_N.concat([ret('v1', { store_name: 'Враца' })]);
    const h = await view({ user: OFFICE, rows: rows });
    if (h) {
      ok('„По разлики": задачата по разлики, брой само за подтаба (3), изречението за офиса', first(h) ===
        '📝 3 записа на обектите чакат актуализация тази седмица. ' +
        'Задачата „' + T_DIFF + '“ в Бюлетина се отмята сама, когато няма такива записи.' + OFF, first(h));
      ok('офис: подканата „Отворете ги … обновете“ я няма (работа на обекта)', note(h).indexOf('Отворете ги') < 0 && note(h).indexOf('обновете') < 0, note(h));
      ok('„По разлики": без ред за другия подтаб (там 0)', !h.doc.getElementById('sr-needs-other'));
      noOldOffice(h, 'офис, разлики');
      /* Филтърът по магазин не пипа броя — както и преди тази промяна. */
      guard('филтър по магазин Враца', () => h.w.setSRStoreFilter('Враца'));
      ok('с филтър по магазин броят пак е 3', /^📝 3 записа на обектите/.test(first(h)), first(h));
      guard('без филтър', () => h.w.setSRStoreFilter(''));
      realClick(h.w, tabBtn(h, '📋 По рекламации / срок на годност'));
      await ticks();
      ok('„По рекламации": 0 тук, задачата от версията, изречението за офиса', first(h) ===
        '✅ Всички невзети записи са актуализирани тази седмица. Задачата „' + T_CMP + '“ в Бюлетина се отмята сама.' + OFF, first(h));
      ok('„По рекламации": отделният ред — 3 в „🔄 По разлики“', other(h) === '📝 3 записа чакат актуализация в „🔄 По разлики“.', other(h));
      noOldOffice(h, 'офис, рекламации');
      h.close();
    }
    /* И обратното: обектът НЕ вижда изречението за офиса/импорта. */
    const hs = await view({});
    if (hs) {
      ok('обектът: подканата „Отворете ги с „📝 Без актуализация“ и обновете…“ я има', note(hs).indexOf('Отворете ги с „📝 Без актуализация“ и обновете статуса или коментара.') >= 0, note(hs));
      ok('обектът: „на обектите“ го няма', note(hs).indexOf('на обектите') < 0, note(hs));
      ok('обектът: изречението за офиса/импорта го няма', note(hs).indexOf('поставена от офиса') < 0 && note(hs).indexOf('импорт') < 0, note(hs));
      hs.close();
    }
  }

  report();
})();
