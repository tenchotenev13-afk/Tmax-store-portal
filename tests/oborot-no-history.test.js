/* Вечерен оборот — обектът НЕ вижда минали дни (решение на Теодор, 19.11.2026).

   Изгледът на обекта (dtStoreView) е само днешният ден: формата или картата
   „записан". Таблицата „Последните 7 дни" (#dt-last7, dtLast7Block) е махната.
   Четенето на 30 дни в loadOborot() ОСТАВА — от него идва средното за
   предупреждението „необичайно високо" (dtAvg30). Изгледът на ЦО — без промяна.

   Стъбът за daily_turnover УВАЖАВА филтрите store_name=eq. / date=eq. /
   date=gte. — иначе мутацията „четене само за днес" не би променила данните,
   които тестът получава, и проверката за предупреждението би минавала и
   срещу счупен код.

   Мутационна проверка (19.11.2026, ръчно, всяка събаря теста):
     M1 dtLast7Block() върнат в dtStoreView()              → секция 1/2 пада
     M2 loadOborot() чете само date=eq.днес (без 30 дни)   → секция 3 пада
     M3 таблицата върната, но скрита с display:none (CSS)  → секция 1/2 пада
        (проверката е за наличие в DOM-а и за textContent, не за видимост)

   Пускане:  node tests/oborot-no-history.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, dayOffset, tsOffset, ticks } = H;

const MANAGER = { email: 'troyan@temax.bg', display_name: 'Мария Иванова', role: 'manager', store_name: 'Троян' };
const KASA    = { email: 'kasa.troyan@temax.bg', display_name: 'Касиер Троян', role: 'kasa', store_name: 'Троян' };
const CO_ADMIN = { email: 'admin@temax.bg', display_name: 'Админ ЦО', role: 'admin', store_name: 'Централен офис' };
const CO_ACC   = { email: 'acc@temax.bg', display_name: 'Счетоводител', role: 'accounting', store_name: 'Централен офис' };

const STORES = [{ name: 'Троян' }, { name: 'Враца' }, { name: 'Централен офис' }];
const USERS_ROWS = [{ store_name: 'Троян' }, { store_name: 'Враца' }, { store_name: 'Централен офис' }];

function rec(over) {
  return Object.assign({
    id: 'r', store_name: 'Троян', date: dayOffset(-1),
    total_turnover: 100, cash_turnover: 60, card_turnover: 40, bank_turnover: 0,
    customers: 10, note: null, created_by: 'Мария Иванова', created_at: tsOffset(-1)
  }, over || {});
}

/* 5 минали дни с РАЗЛИЧИМИ суми — всяка се търси поотделно в текста.
   Средно ≈ 103.33 → 5× ≈ 516.65. */
const PAST = [
  rec({ id: 'p1', date: dayOffset(-1), total_turnover: 101.11, cash_turnover: 61.17, card_turnover: 39.94 }),
  rec({ id: 'p2', date: dayOffset(-2), total_turnover: 102.22, cash_turnover: 62.28, card_turnover: 39.94 }),
  rec({ id: 'p3', date: dayOffset(-3), total_turnover: 103.33, cash_turnover: 63.39, card_turnover: 39.94 }),
  rec({ id: 'p4', date: dayOffset(-4), total_turnover: 104.44, cash_turnover: 64.46, card_turnover: 39.98, bank_turnover: 13.57 }),
  rec({ id: 'p5', date: dayOffset(-5), total_turnover: 105.55, cash_turnover: 65.57, card_turnover: 39.98, note: 'минала-бележка' })
];
const PAST_MARKS = ['101.11', '102.22', '103.33', '104.44', '105.55',
  '61.17', '62.28', '63.39', '64.46', '65.57', '13.57', 'минала-бележка'];
const TODAY_REC = rec({ id: 't', date: dayOffset(0), total_turnover: 4321.09,
  cash_turnover: 3000.09, card_turnover: 1321, customers: 77, created_at: tsOffset(0), note: 'днешна-бележка' });

/* Стъб, който филтрира като PostgREST за трите филтъра, ползвани тук. */
function dtStub(rows) {
  return function (url) {
    const u = decodeURIComponent(String(url));
    let out = rows.slice();
    const st = u.match(/store_name=eq\.([^&]+)/);
    if (st) out = out.filter(r => r.store_name === st[1]);
    const eq = u.match(/date=eq\.(\d{4}-\d{2}-\d{2})/);
    if (eq) out = out.filter(r => r.date === eq[1]);
    const gte = u.match(/date=gte\.(\d{4}-\d{2}-\d{2})/);
    if (gte) out = out.filter(r => r.date >= gte[1]);
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  };
}

async function view(user, rows, confirm) {
  const h = boot({
    modules: ['bulletin.js', 'kasa.js', 'daily-turnover.js'],
    user,
    data: { daily_turnover: dtStub(rows), stores: STORES, users: USERS_ROWS },
    confirm: confirm === undefined ? true : confirm
  });
  h.w.loadOborot();
  await ticks();
  return h;
}

async function submit(h, total) {
  const set = (id, val) => { const el = h.doc.getElementById(id); if (el) el.value = String(val); };
  set('dt-total', total); set('dt-cash', total); set('dt-card', '0'); set('dt-customers', '10');
  const b = btn(h.doc, 'Запиши оборота');
  if (!b) return false;
  realClick(h.w, b, 'Запиши оборота');
  await ticks();
  return true;
}
const posts = h => h.calls.post.filter(p => p.table === 'daily_turnover');

function noHistory(h, label) {
  const mod = h.doc.getElementById('mod-kasa');
  const txt = mod ? mod.textContent : '';
  ok(label + ': няма #dt-last7', !h.doc.getElementById('dt-last7'));
  ok(label + ': няма текст „Последните 7 дни"', txt.indexOf('Последните 7 дни') < 0);
  const seen = PAST_MARKS.filter(m => txt.indexOf(m) >= 0 || mod.innerHTML.indexOf(m) >= 0);
  ok(label + ': нито една сума/бележка от минал ден в #mod-kasa', seen.length === 0, seen.join(', '));
}

(async function () {

  for (const u of [MANAGER, KASA]) {
    section('1. Обект (' + u.role + '), днес още НЕ е подаден — само формата');
    {
      const h = await view(u, PAST);
      ok('заявката чете 30 дни (date=gte.' + dayOffset(-29) + ')',
        h.calls.get.some(x => /daily_turnover/.test(x) && x.indexOf('date=gte.' + dayOffset(-29)) >= 0));
      ok('формата за днес е на място', !!h.doc.getElementById('dt-total') && !!btn(h.doc, 'Запиши оборота'));
      noHistory(h, u.role + '/форма');
    }

    section('2. Обект (' + u.role + '), днес е подаден — картата „записан"');
    {
      const h = await view(u, PAST.concat([TODAY_REC]));
      const txt = h.doc.getElementById('mod-kasa').textContent;
      ok('картата „записан" се вижда', /Оборотът за днес е записан/.test(txt));
      ok('днешната сума се вижда', txt.indexOf('4321.09') >= 0);
      ok('днешната бележка се вижда', txt.indexOf('днешна-бележка') >= 0);
      ok('няма форма (вече е подаден)', !h.doc.getElementById('dt-total'));
      noHistory(h, u.role + '/записан');
    }
  }

  section('3. Предупреждението „необичайно високо" още работи (средно от минали дни)');
  {
    const h1 = await view(MANAGER, PAST, false);
    ok('dtAvg30() вижда миналите дни', Math.abs(h1.w.dtAvg30() - 103.33) < 0.01, String(h1.w.dtAvg30()));
    await submit(h1, '600.00');
    ok('600 > 5× средното → confirm се вика', h1.calls.confirm.length === 1,
      'confirm: ' + h1.calls.confirm.length);
    ok('текстът е за необичайно високо', /необичайно високо/.test(h1.calls.confirm[0] || ''));
    ok('отказ → няма POST', posts(h1).length === 0);

    const h2 = await view(KASA, PAST, false);
    await submit(h2, '400.00');
    ok('контрола: 400 < 5× средното → без confirm', h2.calls.confirm.length === 0);
    ok('контрола: записва', posts(h2).length === 1);
  }

  for (const u of [CO_ADMIN, CO_ACC]) {
    section('4. Централен офис (' + u.role + ') — справката както преди');
    {
      const rows = PAST.concat([TODAY_REC, rec({ id: 'v', store_name: 'Враца', date: dayOffset(0), total_turnover: 222.22 })]);
      const h = await view(u, rows);
      const tbl = h.doc.getElementById('dt-co-table');
      ok('има таблица по обекти', !!tbl);
      ok('има избор на дата', !!h.doc.getElementById('dt-co-date'));
      ok('няма форма на обект', !h.doc.getElementById('dt-total'));
      if (tbl) {
        ok('днес: Троян 4321.09', tbl.textContent.indexOf('4321.09') >= 0);
        ok('днес: Враца 222.22', tbl.textContent.indexOf('222.22') >= 0);
        ok('има ред „Общо"', tbl.textContent.indexOf('Общо') >= 0);
      }
      /* ЦО продължава да вижда МИНАЛ ден през избора на дата. */
      h.w.oborotSetDate(dayOffset(-3));
      await ticks();
      const t2 = h.doc.getElementById('dt-co-table');
      ok('минал ден в ЦО: Троян 103.33', !!t2 && t2.textContent.indexOf('103.33') >= 0);
    }
  }

  report();
})();
