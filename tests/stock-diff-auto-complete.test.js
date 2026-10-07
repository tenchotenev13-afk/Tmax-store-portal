/* „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ": отметката идва от данните (04.10.2026).

   ПОВОД. Задачата се отмяташе или от sdMarkDiffTask (всяко действие на обекта
   по подадена бланка), или ръчно — а в базата двете са НЕРАЗЛИЧИМИ:
   completed_by е името на човека и в двата случая. Измерено за 01.10.2026:
   13 от 18 обекта отметнати, но девет от тях с редове, чакащи тяхното
   действие, и четири от петте неотметнати — без нищо чакащо. Вярна е била
   5 от 18.

   ТВЪРДЕНИЯТА:
   · правилото „чака МОЕТО действие" е едно и също на трите места — SQL,
     stock-differences.js и броячът в Бюлетина — и ИЗКЛЮЧВА will_send, празен
     отговор на склада, no_stock и приключен ред;
   · превключването е по ДАТА (AUTO_COMPLETE_FROM в shared.js = v_start в
     базата): до 11.10 задачата е РЪЧНА и sdMarkDiffTask пише, от 12.10 е
     заключена и той мълчи;
   · от 12.10 обектът не може да я отметне, да я отложи, нито да каже „не се
     отнася за нас" — вижда сив надпис „⏳ N реда чакат отговор";
   · табът „Разлики" казва на обекта колко реда чакат него и има филтър;
   · баджът на таба продължава да брои БЛАНКИ и го казва в подсказката си;
   · действията по бланки работят както преди (регресия — само отметката
     отпада).

   Пускане: node tests/stock-diff-auto-complete.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, btn, ticks } = H;
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || '.';

const BEFORE = '2026-10-09';   /* петък преди превключването */
const AFTER  = '2026-10-12';   /* понеделник, първият ден по правилото */

function freezeDate(w, iso) {
  const Real = w.Date, ms = new Real(iso + 'T12:00:00').getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}

const STORE = 'Троян';
const WH = 'Логистичен склад Добрич';
const USER = { email: 't@temax.bg', display_name: 'Иван Петров', role: 'store', store_name: STORE };
const WHUSER = { email: 'w@temax.bg', display_name: 'Складов', role: 'store', store_name: WH };
const OFFICE = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'accounting', store_name: 'Централен офис' };

/* Бланка и ред, както ги връща заявката. */
function rep_(id, over) {
  return Object.assign({
    id: id, store_name: STORE, counterpart: WH, direction: 'interstore',
    reviewed: false, doc_date: AFTER
  }, over || {});
}
function line(id, over) {
  return Object.assign({
    id: id, report_id: 'r-1', store_name: STORE, material_name: 'Артикул ' + id,
    material_code: 'M' + id, type: 'return', status: 'pending',
    warehouse_response: null, store_response: null, quantity: 1
  }, over || {});
}

function env(iso, user, reports, lines, swaps) {
  const h = boot({
    /* stock-returns.js е НУЖЕН: sdModalHtml вика canCompleteSR(), която
       живее там. Редът е същият като в index.html (792 преди 793). */
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: user || USER,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      differences_reports: () => (reports || []),
      stock_differences: () => (lines || []),
      stock_diff_swaps: () => (swaps || []),
      contacts: []
    }
  });
  freezeDate(h.w, iso || AFTER);
  h.w.diffReports = reports || [];
  h.w.sdData = lines || [];
  h.w.sdSwaps = swaps || [];
  h.w.sdDirTab = 'interstore';
  return h;
}
const mod = h => h.doc.getElementById('mod-stock-diff');

(async function () {

  section('1. Правилото: кой ред чака обекта');
  {
    const w = env(AFTER).w;
    ok('обратно движение без отговор → чака обекта',
      w.sdLineWaitsStore(line('1', { warehouse_response: 'return' })) === true);
    ok('изпратено без отговор → чака обекта',
      w.sdLineWaitsStore(line('1', { warehouse_response: 'sent' })) === true);
    ok('изпратено по система → чака обекта',
      w.sdLineWaitsStore(line('1', { warehouse_response: 'sent_sap' })) === true);
    ok('„ще се изпрати" → НЕ (стоката не е тръгнала)',
      w.sdLineWaitsStore(line('1', { warehouse_response: 'will_send' })) === false);
    ok('празен отговор на склада → НЕ (чака СКЛАДА)',
      w.sdLineWaitsStore(line('1')) === false);
    ok('обектът е отговорил → НЕ',
      w.sdLineWaitsStore(line('1', { warehouse_response: 'return', store_response: 'sap_done' })) === false);
    ok('„няма наличност" е отговор на обекта → НЕ',
      w.sdLineWaitsStore(line('1', { warehouse_response: 'return', store_response: 'no_stock' })) === false);
    ok('приключен ред → НЕ',
      w.sdLineWaitsStore(line('1', { warehouse_response: 'return', status: 'received' })) === false);
  }

  section('2. Правилото по БЛАНКА: посока, прегледана, чужд обект');
  {
    const L = [line('l-1', { warehouse_response: 'return' })];
    ok('междускладова непрегледана → брои се',
      env(AFTER, USER, [rep_('r-1')], L).w.sdMyWaitingLines().length === 1);
    ok('доставчикова бланка → НЕ',
      env(AFTER, USER, [rep_('r-1', { direction: 'supplier' })], L).w.sdMyWaitingLines().length === 0);
    ok('прегледана бланка → НЕ',
      env(AFTER, USER, [rep_('r-1', { reviewed: true })], L).w.sdMyWaitingLines().length === 0);
    ok('бланка на ДРУГ обект → НЕ',
      env(AFTER, USER, [rep_('r-1', { store_name: 'Ловеч' })],
        [line('l-1', { warehouse_response: 'return', store_name: 'Ловеч' })]).w.sdMyWaitingLines().length === 0);
    ok('ред без бланка → НЕ',
      env(AFTER, USER, [], [line('l-1', { warehouse_response: 'return', report_id: null })]).w.sdMyWaitingLines().length === 0);
    /* Складът и офисът не дължат тази задача. Складът сам по себе си НЕ
       доказва гарда (редовете са на обект, значи и без гард не биха му се
       паднали) — офисът го доказва: той има assigned_stores и без гарда
       получава брой. */
    ok('складов потребител → празно',
      env(AFTER, WHUSER, [rep_('r-1')], L).w.sdMyWaitingLines().length === 0);
    /* Счетоводител ПО ОБЕКТИ: assignedStores() му връща списъка, значи без
       гарда редовете на тези обекти му се падат и броячът му показва чужда
       работа. Точно това доказва гарда. */
    const hOff = env(AFTER, Object.assign({}, OFFICE, { assigned_stores: [STORE] }), [rep_('r-1')], L);
    ok('офис (глобален) → празно', hOff.w.sdMyWaitingLines().length === 0,
      String(hOff.w.sdMyWaitingLines().length));
    hOff.close();
  }

  section('3. Размените местят хода');
  {
    const L = [line('l-1'), line('l-2', { id: 'l-2' })];
    const sw = st => [{ id: 's-1', from_line_id: 'l-1', to_line_id: 'l-2',
                        from_store: STORE, to_store: 'Ловеч', status: st }];
    ok('linked и съм ИЗПРАЩАЧ → чака мен',
      env(AFTER, USER, [rep_('r-1')], L, sw('linked')).w.sdMyWaitingLines().length === 1);
    ok('sent и съм изпращач → НЕ чака мен',
      env(AFTER, USER, [rep_('r-1')], L, sw('sent')).w.sdMyWaitingLines().length === 0);
    const swIn = st => [{ id: 's-2', from_line_id: 'l-9', to_line_id: 'l-1',
                          from_store: 'Ловеч', to_store: STORE, status: st }];
    ok('sent и съм ПОЛУЧАТЕЛ → чака мен',
      env(AFTER, USER, [rep_('r-1')], L, swIn('sent')).w.sdMyWaitingLines().length === 1);
    ok('linked и съм получател → НЕ',
      env(AFTER, USER, [rep_('r-1')], L, swIn('linked')).w.sdMyWaitingLines().length === 0);
    ok('приключена размяна → НЕ',
      env(AFTER, USER, [rep_('r-1')], L, swIn('received')).w.sdMyWaitingLines().length === 0);
  }

  section('4. Датата превключва всичко');
  {
    const w = env(BEFORE).w;
    ok('константата е 12.10.2026', w.AUTO_COMPLETE_FROM['stock-diff'] === '2026-10-12',
      w.AUTO_COMPLETE_FROM['stock-diff']);
    ok('петък 09.10 → НЕ е активно', w.autoCompleteActive('stock-diff', BEFORE) === false);
    ok('понеделник 12.10 → активно', w.autoCompleteActive('stock-diff', AFTER) === true);
    ok('по-късно → активно', w.autoCompleteActive('stock-diff', '2026-11-03') === true);
    /* Модул без дата е автоматичен винаги — иначе оборотът и „Стока на път"
       биха се отключили. */
    ok('модул без дата (оборот) → винаги активно',
      w.autoCompleteActive('oborot', '2020-01-01') === true);
    ok('и „Стока на път" → винаги', w.autoCompleteActive('transit-auto', '2020-01-01') === true);
  }

  section('5. sdMarkDiffTask: пише ДО 11.10, мълчи ОТ 12.10');
  {
    /* Пътят е същият, който магазинът минава при отговор по ред. Тук се
       проверява само дали ОТМЯТАНЕТО тръгва — самото действие по реда е
       покрито от stock-diff-task-autocomplete.test.js. */
    for (const [iso, expect, label] of [[BEFORE, true, 'до 11.10 ПИШЕ'], [AFTER, false, 'от 12.10 МЪЛЧИ']]) {
      const h = env(iso, USER, [rep_('r-1')], [line('l-1', { warehouse_response: 'return' })]);
      h.calls.get.length = 0;
      guard('sdMarkDiffTask() не хвърля (' + iso + ')', () => h.w.sdMarkDiffTask(STORE));
      await ticks();
      const asked = h.calls.get.some(u => String(u).indexOf('recurring_tasks') >= 0);
      ok(label, asked === expect, 'заявки към recurring_tasks: ' + asked);
      h.close();
    }
  }

  section('6. Табът: брояч, филтър, обяснение');
  {
    const reports = [rep_('r-1'), rep_('r-2')];
    const lines = [
      line('l-1', { warehouse_response: 'return' }),                      /* чака мен */
      line('l-2', { id: 'l-2', warehouse_response: 'sent' }),             /* чака мен */
      line('l-3', { id: 'l-3', warehouse_response: 'will_send' }),        /* не чака */
      line('l-4', { id: 'l-4' }),                                        /* чака склада */
      line('l-5', { id: 'l-5', report_id: 'r-2', warehouse_response: 'return', store_response: 'sap_done' })
    ];
    const h = env(AFTER, USER, reports, lines);
    h.w.sdView = 'rows'; /* изгледът на екрана за тази проверка */
    if (guard('renderStockDiff() не хвърля', () => h.w.renderStockDiff())) {
      const b = btn(mod(h), 'Чакат моя отговор');
      if (ok('чипът „Чакат моя отговор" го има', !!b)) {
        ok('и показва 2', (b.textContent || '').indexOf('(2)') >= 0, b.textContent.trim());
        realClick(h.w, b);
        /* САМО тялото на ГЛАВНАТА таблица (#sd-rows): над нея стои секцията с
           непрегледаните бланки, която показва всеки ред по бланката и не
           зависи от чипа. */
        const tbEl = h.doc.getElementById('sd-rows');
        const tb = tbEl ? tbEl.textContent : '(няма #sd-rows)';
        ok('таблицата има свое тяло #sd-rows', !!tbEl);
        ok('след клик в таблицата се вижда Артикул l-1', tb.indexOf('Артикул l-1') >= 0, tb.slice(0, 120));
        ok('и Артикул l-2', tb.indexOf('Артикул l-2') >= 0);
        ok('а „ще се изпрати" не е в таблицата', tb.indexOf('Артикул l-3') === -1);
        ok('и отговореният не е в таблицата', tb.indexOf('Артикул l-5') === -1);
        /* И по списъка, който пълни таблицата — по id, не по текст. */
        const ids = h.w.sdTableRows({ status: 'waiting' }).map(x => x.id).sort().join(',');
        ok('списъкът за таблицата е точно двата реда', ids === 'l-1,l-2', ids);
      }
      ok('обяснението казва общия брой',
        mod(h).innerHTML.indexOf('<b>2</b> реда чакат') >= 0, '');
      ok('и че ръчна отметка няма',
        mod(h).innerHTML.indexOf('ръчна отметка няма') >= 0, '');
    }
    h.close();

    /* Подтаб „Доставчици": чипът брои 0 (чакащите са междускладови), а
       обяснението пак казва 2 — задачата гледа двата подтаба. Без това
       разликата между „общо" и „в подтаба" не се вижда. */
    const hSup = env(AFTER, USER, reports, lines);
    hSup.w.sdDirTab = 'supplier';
    hSup.w.sdView = 'rows'; /* изгледът на екрана за тази проверка */
    if (guard('рендер в подтаб „Доставчици" не хвърля', () => hSup.w.renderStockDiff())) {
      const bs = btn(mod(hSup), 'Чакат моя отговор');
      ok('чипът в „Доставчици" показва 0', !!bs && (bs.textContent || '').indexOf('(0)') >= 0,
        bs && bs.textContent.trim());
      ok('а обяснението пак казва 2',
        mod(hSup).innerHTML.indexOf('<b>2</b> реда чакат') >= 0, '');
    }
    hSup.close();

    /* Преди 12.10 обяснението го няма, но чипът и филтърът работят. */
    const h2 = env(BEFORE, USER, reports, lines);
    h2.w.sdView = 'rows'; /* изгледът на екрана за тази проверка */
    if (guard('renderStockDiff() преди датата не хвърля', () => h2.w.renderStockDiff())) {
      ok('преди 12.10 обяснение НЯМА', !h2.doc.getElementById('sd-waiting-note'));
      ok('а чипът си е там', !!btn(mod(h2), 'Чакат моя отговор'));
    }
    h2.close();

    /* Складът няма такъв чип — той има свой изглед. */
    const h3 = env(AFTER, WHUSER, reports, lines);
    if (guard('рендер за склада не хвърля', () => h3.w.renderStockDiff())) {
      ok('складът не вижда чипа', !btn(mod(h3), 'Чакат моя отговор'));
      ok('и не вижда обяснението', !h3.doc.getElementById('sd-waiting-note'));
    }
    h3.close();
  }

  section('7. Нула чакащи → обяснението поздравява');
  {
    const h = env(AFTER, USER, [rep_('r-1')], [line('l-1', { warehouse_response: 'will_send' })]);
    h.w.sdView = 'rows'; /* изгледът на екрана за тази проверка */
    if (guard('рендер не хвърля', () => h.w.renderStockDiff())) {
      const b = btn(mod(h), 'Чакат моя отговор');
      ok('чипът стои и при 0', !!b && (b.textContent || '').indexOf('(0)') >= 0, b && b.textContent.trim());
      ok('и обяснението поздравява',
        mod(h).innerHTML.indexOf('Нито един ред не чака вашия отговор') >= 0, '');
    }
    h.close();
  }

  section('8. Баджът брои БЛАНКИ и го казва');
  {
    const h = env(AFTER, USER, [rep_('r-1')], [line('l-1', { warehouse_response: 'return' })]);
    /* Табът трябва да го има в DOM-а, за да се роди баджът. */
    const tab = h.doc.getElementById('tab-stock-diff');
    if (ok('табът съществува', !!tab)) {
      const b = h.w.sdTabBadgeEl();
      if (ok('баджът се създава', !!b)) {
        ok('подсказката казва БЛАНКИ', b.title === 'Бланки, чакащи вашата реакция', b.title);
      }
    }
    h.close();
  }

  section('9. Едно правило на три места — SQL, модулът, Бюлетинът');
  {
    const sql = fs.readFileSync(path.join(ROOT, 'stock-diff-auto-complete-schema.sql'), 'utf8');
    ok('SQL-ът брои само sent/sent_sap/return',
      /warehouse_response in \('sent','sent_sap','return'\)/.test(sql));
    ok('и иска празен store_response', /d\.store_response is null/.test(sql));
    ok('и пропуска приключения ред', /coalesce\(d\.status, ''\) <> 'received'/.test(sql));
    ok('и само междускладови', /r\.direction = 'interstore'/.test(sql));
    ok('и само непрегледани бланки', /not coalesce\(r\.reviewed, false\)/.test(sql));
    ok('и носи същата начална дата',
      sql.indexOf("v_start   date := date '2026-10-12'") >= 0, 'няма я');

    const sh = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
    ok('shared.js носи същата дата', sh.indexOf("'stock-diff': '2026-10-12'") >= 0, 'няма я');

    const bul = fs.readFileSync(path.join(ROOT, 'bulletin.js'), 'utf8');
    ok('Бюлетинът тегли и посоката, и reviewed',
      bul.indexOf('differences_reports.direction=eq.interstore') >= 0 &&
      bul.indexOf('differences_reports.reviewed=eq.false') >= 0, 'няма ги');
    ok('и има свое копие на условието (зарежда се преди модула)',
      bul.indexOf('function bulDiffLineWaitsStore') >= 0, 'няма го');

    /* И функционално: двете реализации върху едни и същи редове. */
    const w = env(AFTER).w;
    const bulRule = l => {
      if (!l) return false;
      if (String(l.status || '') === 'received') return false;
      if (l.store_response) return false;
      const x = String(l.warehouse_response || '');
      return x === 'sent' || x === 'sent_sap' || x === 'return';
    };
    const cases = [
      line('c1'), line('c2', { warehouse_response: 'return' }),
      line('c3', { warehouse_response: 'sent' }), line('c4', { warehouse_response: 'sent_sap' }),
      line('c5', { warehouse_response: 'will_send' }),
      line('c6', { warehouse_response: 'return', store_response: 'sap_done' }),
      line('c7', { warehouse_response: 'return', store_response: 'no_stock' }),
      line('c8', { warehouse_response: 'return', status: 'received' })
    ];
    const diff = cases.filter(l => w.sdLineWaitsStore(l) !== bulRule(l));
    ok('двете дават еднакъв отговор за 8 случая', diff.length === 0, diff.map(x => x.id).join(', '));
    const yes = cases.filter(l => w.sdLineWaitsStore(l)).length;
    ok('и случаите не са едностранни', yes > 0 && yes < cases.length, yes + ' от ' + cases.length);
  }

  section('10. Бюлетинът: заключване по дата и ЕДНО правило');
  {
    /* Тук се вдигат ТРИТЕ модула в реда от index.html (bulletin 779 →
       stock-returns 792 → stock-differences 793): правилото живее на две
       места и трябва да се сверят ИСТИНСКИТЕ функции, не препис в теста. */
    function envBul(iso) {
      const h = boot({
        modules: ['bulletin.js', 'stock-returns.js', 'stock-differences.js'],
        user: USER,
        data: { users: [{ store_name: STORE }], stores: [{ name: STORE }],
                differences_reports: [], stock_differences: [], stock_diff_swaps: [] }
      });
      freezeDate(h.w, iso);
      return h;
    }
    const hb = envBul(BEFORE);
    ok('до 11.10 задачата НЕ е заключена (ръчната отметка работи)',
      hb.w.bulAutoLocked('stock-diff') === false);
    ok('и регистърът не я дава за автоматична',
      hb.w.bulAutoModuleOf('stock-diff') === null);
    ok('а „Стока на път" е заключена и тогава',
      hb.w.bulAutoLocked('transit-auto') === true);
    ok('и „За връщане" също', hb.w.bulAutoLocked('stock-returns-complaint') === true);
    hb.close();

    const ha = envBul(AFTER);
    ok('от 12.10 задачата Е заключена', ha.w.bulAutoLocked('stock-diff') === true);
    const am = ha.w.bulAutoModuleOf('stock-diff');
    if (ok('и регистърът я дава', !!am)) {
      ok('с етикет „Отмята се автоматично от Разлики"',
        am.label === 'Отмята се автоматично от Разлики', am.label);
      ok('и единица в РЕДОВЕ', am.unit && am.unit[1] === 'реда чакат отговор', String(am.unit));
      ok('и своя причина', am.reason === 'auto-diff', am.reason);
    }
    ok('етикетът на заключената контрола идва от регистъра',
      ha.w.bulLockLabel('auto-diff') === 'Отмята се автоматично от Разлики',
      ha.w.bulLockLabel('auto-diff'));
    ok('и автоматичната отметка си има име в отчета',
      ha.w.bulCompletedByLabel('auto:stock-diff') === 'автоматично от Разлики',
      ha.w.bulCompletedByLabel('auto:stock-diff'));

    /* ДВЕТЕ ИСТИНСКИ функции, ред по ред — не препис в теста. */
    const cases = [
      line('c1'), line('c2', { warehouse_response: 'return' }),
      line('c3', { warehouse_response: 'sent' }), line('c4', { warehouse_response: 'sent_sap' }),
      line('c5', { warehouse_response: 'will_send' }),
      line('c6', { warehouse_response: 'return', store_response: 'sap_done' }),
      line('c7', { warehouse_response: 'return', store_response: 'no_stock' }),
      line('c8', { warehouse_response: 'return', status: 'received' })
    ];
    const diff2 = cases.filter(l => ha.w.sdLineWaitsStore(l) !== ha.w.bulDiffLineWaitsStore(l));
    ok('sdLineWaitsStore и bulDiffLineWaitsStore съвпадат за 8 случая',
      diff2.length === 0, diff2.map(x => x.id).join(', '));
    const yes2 = cases.filter(l => ha.w.bulDiffLineWaitsStore(l)).length;
    ok('и случаите не са едностранни', yes2 > 0 && yes2 < cases.length,
      yes2 + ' от ' + cases.length);

    ha.close();
  }

  report();
})();
