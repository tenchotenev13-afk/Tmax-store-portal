/* Клиентски заявки — РАБОТНИ дни и в модула (вариант А, 18.10.2026).

   Повод: писмо на Теодор от 14.10 („да не брои и събота и неделя“). Отчетите
   са в работни дни от 15.10 (reportWorkdaysBetween); модулът не беше —
   на живо 18.10 Севлиево-0083 (доставка 15.10) беше „🔴 +3 дни“ в
   Клиентски и „+1 ден“ в „Днес“.

   Какво заковава тестът:
     1. lateBadge(): доставка петък 16.10 → събота 17.10 „+1 раб. ден“
        (подът 1 — иначе 0 и чипът изчезва); вторник 20.10 „+2 раб. дни“;
        празник не се брои; неизтекъл срок / без доставка → '';
     2. calcElapsed(): created вт 06.10 → нд 18.10 = 8 (не 12); задна дата
        по-ранна от created — от нея;
     3. elapsedBadge(): етикетите са „раб. дни“, праговете 5 / 7 / 10 —
        същите числа;
     4. на екрана (истински рендер на Клиентски и Транспорт) чипът е
        „+N раб. дни“ и числото е същото като в отчета (reportLateDays);
     5. ЕДНА реализация на работните дни в клиента: workdaysBetween в
        shared.js; reportWorkdaysBetween в report.js само я вика; в
        lateBadge / calcElapsed няма деление на 86400000.

   Числата в 1–3 са сметнати на ръка от календара (не с кода), за да не е
   тестът тавтология. Октомври 2026: 02 петък, 06 вторник, 10 събота,
   16 петък, 17 събота, 18 неделя, 19 понеделник. Декември 2026: 24 чт, 25 пт, 26 сб — празници; 26-и е в
   събота и се пренася на понеделник 28-и (bgHolidaysForYear).

   Пускане:  node tests/co-workdays-module.test.js .
*/
'use strict';
process.env.TZ = 'Europe/Sofia';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const USER = { email: 'troyan@temax.bg', display_name: 'Магазин Троян', role: 'store', store_name: 'Троян' };

function env() {
  return boot({
    modules: ['transport.js', 'client-orders.js', 'history.js', 'notifications.js', 'report.js'],
    user: USER,
    data: { client_orders: [], transport_orders: [], stores: [] }
  });
}
/* TODAY е глобалната var от shared.js — подменя се с полунощ на дадения ден. */
function setToday(w, y, m, d) { w.TODAY = new w.Date(y, m - 1, d); }

(async function run() {

  section('1. lateBadge() — работни дни, подът 1, празници');
  {
    const h = env(); const w = h.w;
    setToday(w, 2026, 10, 17);  /* събота */
    const fri = w.lateBadge({ delivery: '2026-10-16', status: 'sent' });
    ok('срок петък 16.10, днес събота 17.10 → „+1 раб. ден“ (не 0, не изчезва)',
      fri.indexOf('🔴 +1 раб. ден<') >= 0, fri);

    setToday(w, 2026, 10, 20);  /* вторник: пон 19 + вт 20 = 2 */
    const tue = w.lateBadge({ delivery: '2026-10-16', status: 'sent' });
    ok('срок петък 16.10, днес вторник 20.10 → „+2 раб. дни“ (календарно 4)',
      tue.indexOf('🔴 +2 раб. дни<') >= 0, tue);

    /* Севлиево-0083 от проверката на живо: доставка чт 15.10, днес нд 18.10 →
       пт 16 = 1 работен ден (календарно 3). */
    setToday(w, 2026, 10, 18);
    const sev = w.lateBadge({ delivery: '2026-10-15', status: 'sent' });
    ok('Севлиево-0083: срок 15.10, днес 18.10 → „+1 раб. ден“ (на живо беше „+3 дни“)',
      sev.indexOf('+1 раб. ден<') >= 0, sev);

    /* Празници: срок ср 23.12, днес вт 29.12. 24, 25 — празник; 26 сб; 27 нд;
       28 пн — пренесеният 26-и; 29 вт — работен. → 1 (календарно 6). */
    setToday(w, 2026, 12, 29);
    const hol = w.lateBadge({ delivery: '2026-12-23', status: 'sent' });
    ok('празниците 24–26.12 и пренесеният 28.12 не се броят → „+1 раб. ден“',
      hol.indexOf('+1 раб. ден<') >= 0, hol);

    setToday(w, 2026, 10, 20);
    ok('неизтекъл срок (днес) → празен низ', w.lateBadge({ delivery: '2026-10-20', status: 'sent' }) === '');
    ok('бъдещ срок → празен низ', w.lateBadge({ delivery: '2026-10-23', status: 'sent' }) === '');
    ok('без доставка (транспорт без delivery) → празен низ, не хвърля',
      w.lateBadge({ delivery: null, status: 'sent' }) === '');
    ok('приключена → празен низ', w.lateBadge({ delivery: '2026-10-16', status: 'done' }) === '');
    h.close();
  }

  section('2. calcElapsed() — работни дни от по-ранната дата');
  {
    const h = env(); const w = h.w;
    /* Задачата казва „събота 18.10 → 9“ — 18.10.2026 е НЕДЕЛЯ и работните дни
       са 8; проверяват се и неделя 18-и, и събота 17-и. */
    setToday(w, 2026, 10, 18);
    /* created вт 06.10 → нд 18.10: 07–09 (3; 10-и е събота) + 12–16 (5) = 8;
       календарно 12. */
    ok('created вт 06.10, днес нд 18.10 → 8 (не 12)',
      w.calcElapsed('2026-10-06T10:00:00+03:00', '2026-10-06') === 8,
      String(w.calcElapsed('2026-10-06T10:00:00+03:00', '2026-10-06')));
    setToday(w, 2026, 10, 17);  /* събота — същото: 8 */
    ok('днес събота 17.10 → пак 8 (съботата не добавя)',
      w.calcElapsed('2026-10-06T10:00:00+03:00', '2026-10-06') === 8,
      String(w.calcElapsed('2026-10-06T10:00:00+03:00', '2026-10-06')));
    /* Задна дата: date пт 02.10 преди created вт 06.10 → от 02.10:
       05,06 (2) + 8 = 10. Днес събота 17.10. */
    ok('задна дата 02.10 преди created 06.10 → от 02.10 = 10',
      w.calcElapsed('2026-10-06T10:00:00+03:00', '2026-10-02') === 10,
      String(w.calcElapsed('2026-10-06T10:00:00+03:00', '2026-10-02')));
    ok('бъдеща date не прави брояча отрицателен → от created = 8',
      w.calcElapsed('2026-10-06T10:00:00+03:00', '2026-10-30') === 8);
    ok('създадена днес → 0', w.calcElapsed('2026-10-17T09:00:00+03:00', '2026-10-17') === 0);
    ok('без created_at → 0', w.calcElapsed(null, '2026-10-01') === 0);
    h.close();
  }

  section('3. elapsedBadge() — „раб. дни“, праговете 5 / 7 / 10');
  {
    const h = env(); const w = h.w;
    const b = d => w.elapsedBadge(d, 'pending', {});
    ok('4 → сиво „4 раб. дни“', /color:#94a3b8;">4 раб\. дни</.test(b(4)), b(4));
    ok('5 → ⚠️ (прагът 5 е същото число)', b(5).indexOf('⚠️ 5 раб. дни') >= 0, b(5));
    ok('6 → още ⚠️', b(6).indexOf('⚠️ 6 раб. дни') >= 0, b(6));
    ok('7 → 🔶', b(7).indexOf('🔶 7 раб. дни') >= 0, b(7));
    ok('9 → още 🔶', b(9).indexOf('🔶 9 раб. дни') >= 0, b(9));
    ok('10 → 🔴 „10 раб. дни!“', b(10).indexOf('🔴 10 раб. дни!') >= 0, b(10));
    ok('пристигнала → сиво „N раб. дни“', /color:#94a3b8;">12 раб\. дни</.test(w.elapsedBadge(12, 'arrived', {})));
    ok('нито един вариант не казва голо „ дни“',
      [4, 5, 7, 10].every(d => !/\d дни/.test(b(d))));
    h.close();
  }

  section('4. На екрана — същото число като в отчета');
  {
    const h = env(); const w = h.w;
    setToday(w, 2026, 10, 18);
    const o = {
      id: 'c-sev', in_num: 'Севлиево-0083', store_name: 'Троян', fulfiller: 'Централен офис',
      status: 'sent', date: '2026-10-06', hour: '10:00', customer_name: 'Емил Антонов', phone: '0878',
      product: 'СКЕЛЕ', sap: '59280', qty: 1, unit: 'бр.',
      items: [{ product: 'СКЕЛЕ', sap: '59280', qty: 1, unit: 'бр.' }],
      delivery: '2026-10-15', note: '', created_at: '2026-10-06T10:00:00+03:00',
      co_eta: null, co_note: null, paid_transport: false, transport_id: null
    };
    w.clientOrders = [o];
    o._status = w.calcStatus(o.delivery, o.status);
    o._days = w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = false;
    w.orderFilter = 'all';
    w.renderClientOrders();
    const row = h.doc.getElementById('co-row-c-sev');
    const txt = row ? row.textContent : '';
    ok('редът е изрисуван', !!row);
    ok('чипът е „+1 раб. ден“', txt.indexOf('🔴 +1 раб. ден') >= 0, txt);
    ok('и не е старото календарно „+3 дни“', txt.indexOf('+3 дни') < 0, txt);
    const rep = w.reportLateDays(o, w.TODAY);
    ok('отчетът (reportLateDays) дава същото число: 1', rep === 1, String(rep));

    /* Транспорт — същият lateBadge. */
    w.transportOrders = [{
      id: 't-1', in_num: 'T-1', store_name: 'Троян', status: 'sent', date: '2026-10-06', hour: '09:00',
      customer_name: 'Мария Тестова', phone: '0888', product: 'МАСА', sap: '901', qty: 1, unit: 'бр.',
      items: [{ product: 'МАСА', sap: '901', qty: 1, unit: 'бр.' }], address: 'ул. 1',
      delivery: '2026-10-14', created_at: '2026-10-06T09:00:00+03:00', awaiting_stock: false
    }];
    w.transportOrders.forEach(t => { t._status = w.calcStatus(t.delivery, t.status); t._days = w.calcElapsed(t.created_at, t.date); });
    w.transportFilter = 'all';
    w.renderTransport();
    const tb = h.doc.getElementById('tr-body');
    /* срок ср 14.10, днес нд 18.10: чт 15, пт 16 = 2 (календарно 4). */
    ok('Транспорт: „+2 раб. дни“', !!tb && tb.textContent.indexOf('🔴 +2 раб. дни') >= 0, tb && tb.textContent.slice(0, 300));
    h.close();
  }

  section('5. Една реализация на работните дни в клиента');
  {
    const shared = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
    const co = fs.readFileSync(path.join(ROOT, 'client-orders.js'), 'utf8');
    const rep = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
    const body = (src, name) => {
      const i = src.indexOf('function ' + name + '(');
      if (i < 0) return null;
      const j = src.indexOf('\n}', i);
      return src.slice(i, j + 2);
    };
    const lb = body(shared, 'lateBadge'), ce = body(co, 'calcElapsed');
    ok('lateBadge я има', !!lb);
    ok('calcElapsed я има', !!ce);
    ok('в lateBadge няма 86400000', lb && lb.indexOf('86400000') < 0, lb);
    ok('в calcElapsed няма 86400000', ce && ce.replace(/\/\*[\s\S]*?\*\//g, '').indexOf('86400000') < 0, ce);
    ok('lateBadge вика workdaysBetween', lb && lb.indexOf('workdaysBetween(') >= 0);
    ok('calcElapsed вика workdaysBetween', ce && ce.indexOf('workdaysBetween(') >= 0);
    ok('workdaysBetween е дефинирана точно веднъж в shared.js',
      (shared.match(/^function workdaysBetween\(/gm) || []).length === 1);
    const rw = (rep.match(/^function reportWorkdaysBetween\([^)]*\)\{[^\n]*\}$/m) || [])[0] || '';
    ok('reportWorkdaysBetween в report.js е само обвивка → workdaysBetween',
      /return workdaysBetween\(fromD, refD\);/.test(rw), rw || '(няма едноредова обвивка)');
    ok('report.js не съдържа втори цикъл по isBgWorkday',
      rep.indexOf('isBgWorkday(') < 0);
    ok('calcElapsed не върти свой цикъл по isBgWorkday',
      ce && ce.indexOf('isBgWorkday(') < 0);
  }

  report();
})();
