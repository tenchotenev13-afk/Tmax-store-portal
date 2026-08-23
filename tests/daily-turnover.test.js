/* Вечерен оборот — подтаб в Каса.

   kasa.js и daily-turnover.js се зареждат ЗАЕДНО, в реалния ред от
   index.html (правило 8): loadOborot()/renderOborot() се викат от kasa.js,
   а kasaTabBar() се вика от daily-turnover.js. Тест на всеки поотделно не
   доказва нищо за връзката между двата.

   bulletin.js е в списъка, защото toLocalISO() живее там (ред ~466) и
   daily-turnover.js я ползва за датата на записа. Без него тестът минава,
   но в конзолата тихо седи "toLocalISO is not defined".

   Пускане:  node tests/daily-turnover.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ── Потребители ────────────────────────────────────────────────────────── */
const STORE_USER = {
  email: 'troyan@temax.bg', display_name: 'Мария Иванова',
  role: 'manager', store_name: 'Троян'
};
const CO_USER = {
  email: 'ivo@temax.bg', display_name: 'Иво Петров',
  role: 'accounting', store_name: 'Централен офис'
};
const CLERK_USER = {
  email: 'clerk@temax.bg', display_name: 'Продавач',
  role: 'employee', store_name: 'Троян'
};

const STORES = [
  { name: 'Ловеч' }, { name: 'Троян' },
  { name: 'Централен офис' }, { name: 'Логистичен склад Добрич' }
];

function rec(over) {
  return Object.assign({
    id: 'dt-1', store_name: 'Троян', date: dayOffset(-1),
    total_turnover: 1000, cash_turnover: 600, card_turnover: 400,
    customers: 50, note: null, created_by: 'Мария Иванова',
    created_at: tsOffset(-1)
  }, over || {});
}

/* ── Обвивка над boot() ─────────────────────────────────────────────────── */
function env(over) {
  over = over || {};
  return boot(Object.assign({
    modules: ['bulletin.js', 'kasa.js', 'daily-turnover.js'],
    user: STORE_USER,
    data: { daily_turnover: [], stores: STORES }
  }, over));
}

/* Зарежда таба точно както kasaTab('oborot') би го направил. */
async function view(over) {
  const h = env(over);
  h.w.loadOborot();
  await ticks();
  return h;
}

function fill(doc, total, cash, card, cust, note) {
  function set(id, val) {
    const el = doc.getElementById(id);
    if (el) el.value = (val === undefined || val === null) ? '' : String(val);
  }
  set('dt-total', total); set('dt-cash', cash);
  set('dt-card', card); set('dt-customers', cust); set('dt-note', note);
}

/* Попълва формата и кликa истински по бутона за запис. */
async function submit(h, total, cash, card, cust, note) {
  fill(h.doc, total, cash, card, cust, note);
  const b = btn(h.doc, 'Запиши оборота');
  if (!b) return null;
  realClick(h.w, b, 'Запиши оборота');
  await ticks();
  return b;
}

const posts = h => h.calls.post.filter(p => p.table === 'daily_turnover');

/* Цветът на toast-а носи смисъл: зелено = записано, жълто = вече го има,
   червено = грешка. harness-ът записва само текста, затова се чете от DOM-а —
   toast() пише в #toast.style.background. jsdom нормализира до rgb(). */
function toastColor(h) {
  const el = h.doc.getElementById('toast');
  return el ? (el.style.background || '') : '';
}
const GREEN = /#16a34a|rgb\(22,\s*163,\s*74\)/;
const AMBER = /#d97706|rgb\(217,\s*119,\s*6\)/;
const RED = /#dc2626|rgb\(220,\s*38,\s*38\)/;

(async function () {

  section('1. Достъп до подтаба');
  {
    const { w, doc } = env();
    const bar = w.kasaTabBar();
    ok('kasaTabBar() съдържа бутона ktab-oborot', bar.indexOf('ktab-oborot') >= 0);
    ok('бутонът вика kasaTab(\'oborot\')', bar.indexOf("kasaTab('oborot')") >= 0);
    ok('етикетът е "Вечерен оборот"', bar.indexOf('Вечерен оборот') >= 0);
    ok('бутоните станаха пет', (bar.match(/id="ktab-/g) || []).length === 5);

    ok('Оборот не е разтегнат на flex:1',
      !/id="ktab-oborot"[^>]*flex:1/.test(bar));
    ok('Оборот има собствена рамка и заоблени ъгли',
      /id="ktab-oborot"[^>]*border:1px solid[^>]*border-radius:/.test(bar));

    /* Рамката се намира през DOM-а, не чрез рязане по първия </div> —
       иначе проверката зависи от това КОЙ блок е първи и мълчаливо почва
       да гледа друг контейнер, щом редът се размени. */
    const box = doc.createElement('div');
    box.innerHTML = bar;
    const frame = box.querySelector('#ktab-storno').parentElement;
    ok('рамката на четирите е без flex-wrap',
      frame.getAttribute('style').indexOf('flex-wrap') < 0);
    ok('в рамката са точно четирите счетоводни таба',
      frame.querySelectorAll('button').length === 4);
    ok('ktab-oborot е ИЗВЪН рамката', !frame.contains(box.querySelector('#ktab-oborot')));

    /* Мястото на бутона: под надписа „Каса", НАД рамката. Под нея се четеше
       като последна стъпка от касовите отчети, каквато не е. */
    ok('Оборот стои ПРЕДИ рамката на четирите',
      bar.indexOf('ktab-oborot') < bar.indexOf('ktab-pos'));
    const order = box.querySelector('#ktab-oborot')
      .compareDocumentPosition(frame) & 4; /* 4 = FOLLOWING */
    ok('и в реда на документа рамката идва СЛЕД него', !!order);
    ok('има отстъп горе и долу, за да не е залепен',
      /margin:14px 0/.test(bar));
  }
  {
    const { w } = env({ user: CLERK_USER });
    ok('роля извън manager/admin/kasa → kasaTabBar() връща празен низ',
      w.kasaTabBar() === '');
  }
  {
    const { w } = env({ user: CO_USER });
    /* CO_USER е accounting — извън manager/admin/kasa, така че лентата пак
       е празна. Проверката е, че новият бутон НЕ добавя ново право. */
    ok('новият бутон не разширява правата (accounting пак няма лента)',
      w.kasaTabBar() === '');
  }

  section('1б. Валутата е EUR, не лв.');
  {
    /* От 01.01.2026 официалната валута е еврото. Числата в daily_turnover
       СА в евро и не се конвертират — грешен беше само етикетът. */
    const { w, doc } = env();
    ok('dtMoney(5847.65) завършва на EUR',
      /EUR$/.test(w.dtMoney(5847.65)), w.dtMoney(5847.65));
    ok('и стойността е непроменена, само етикетът',
      w.dtMoney(5847.65) === '5847.65 EUR', w.dtMoney(5847.65));
    ok('нула също', w.dtMoney(0) === '0.00 EUR', w.dtMoney(0));
    ok('никъде не остава „лв."', w.dtMoney(1).indexOf('лв') < 0);

    /* Един и същ вид в двата таба на Каса — kasa.js ползва fmtMoney().
       ⚠️ fmtMoney е известна колизия (KNOWN_COLLISIONS в smoke.js): kasa.js
       дава ' EUR' с интервал, history.js — 'EUR' без. В браузъра печели
       history.js по ред на зареждане. Тук history.js НЕ е зареден, затова
       w.fmtMoney е версията на kasa.js — с нея се сравняваме, както е
       указано. Ако някой ден двете се уеднаквят, тази проверка не се чупи. */
    ok('форматът съвпада с fmtMoney() от kasa.js',
      w.dtMoney(1234.5) === w.fmtMoney(1234.5), w.dtMoney(1234.5) + ' / ' + w.fmtMoney(1234.5));

    /* И в рендерирания изглед, не само във функцията. */
    const box = doc.createElement('div');
    box.innerHTML = w.dtInpRow('Общ оборот', 'dt-total', 'EUR');
    ok('наставката до полето е EUR', box.textContent.indexOf('EUR') >= 0);
    ok('и не е лв.', box.textContent.indexOf('лв') < 0);
  }
  {
    const h = await view({
      data: {
        daily_turnover: [rec({ id: 'e1', date: dayOffset(0), total_turnover: 5847.65, cash_turnover: 3847.65, card_turnover: 2000, customers: 100 })],
        stores: STORES
      }
    });
    const txt = h.doc.getElementById('mod-kasa').textContent;
    ok('записаният оборот се показва в EUR', txt.indexOf('5847.65 EUR') >= 0);
    ok('в целия изглед няма „лв."', txt.indexOf('лв.') < 0);
  }

  section('2. Оборот е отделен от рамката на счетоводните табове');
  {
    const h = await view();
    const ob = h.doc.getElementById('ktab-oborot');
    const st = h.doc.getElementById('ktab-storno');
    if (ok('и двата бутона съществуват в рендерирания DOM', !!ob && !!st)) {
      ok('ktab-oborot НЕ е дете на същия контейнер като ktab-storno',
        ob.parentElement !== st.parentElement);
      const frame = st.parentElement;
      ok('в контейнера на storno са точно 4 бутона',
        frame.querySelectorAll('button').length === 4,
        'намерени: ' + frame.querySelectorAll('button').length);
      ok('контейнерът на storno не съдържа ktab-oborot',
        !frame.querySelector('#ktab-oborot'));
      ok('ktab-oborot не е потомък на рамката (нито на по-дълбоко ниво)',
        !frame.contains(ob));
    }

    /* Подсветяването минава през getElementById, не през обхождане на
       контейнера — затова трябва да работи и извън рамката. */
    if (ob) {
      h.w.kasaTab('oborot');
      await ticks();
      ok('kasaTab(\'oborot\') подсветява бутона въпреки че е извън рамката',
        /#2f2f2f|rgb\(47,\s*47,\s*47\)/.test(ob.style.background), ob.style.background);
      const st2 = h.doc.getElementById('ktab-storno');
      ok('и гаси Сторно бележки',
        /#fff|rgb\(255,\s*255,\s*255\)/.test(st2.style.background), st2.style.background);
      h.w.kasaTab('storno');
      await ticks();
      const ob2 = h.doc.getElementById('ktab-oborot');
      ok('обратно: превключване към Сторно гаси Оборот',
        !ob2 || /#fff|rgb\(255,\s*255,\s*255\)/.test(ob2.style.background));
    }
  }

  section('3. Връщане в Каса, докато Оборот е активен');
  {
    /* Сценарият от снимката на 22.08.2026: клик по Вечерен оборот, после
       навигация към друг модул и обратно в Каса. showModule('kasa') вика
       loadKasa(), чийто клон беше двоичен — pos или ВСИЧКО ОСТАНАЛО в
       renderGlavna(). Резултат: съдържание на Главна каса под подсветен
       Вечерен оборот. */
    const h = env();
    h.w.kasaView = 'oborot';
    h.w.loadKasa();
    await ticks();
    await ticks();

    const txt = h.doc.getElementById('mod-kasa').textContent;
    ok('НЕ рендира Главна каса', txt.indexOf('Обобщение по купюри') < 0, txt.slice(0, 80));
    ok('рендира изгледа на Оборот',
      txt.indexOf('Оборот за днес') >= 0 || txt.indexOf('Оборот по обекти') >= 0);

    const ob = h.doc.getElementById('ktab-oborot');
    const gl = h.doc.getElementById('ktab-glavna');
    if (ok('лентата е налична', !!ob && !!gl)) {
      /* Тези две гледат само подсветката. Съвпадението със съдържанието го
         носят проверките по-горе — подсветката е вярна и в счупения случай. */
      ok('Вечерен оборот е подсветен',
        /#2f2f2f|rgb\(47,\s*47,\s*47\)/.test(ob.style.background) ||
        ob.getAttribute('style').indexOf('background:#2f2f2f') >= 0,
        ob.getAttribute('style'));
      ok('Главна каса НЕ е подсветена',
        gl.getAttribute('style').indexOf('background:#2f2f2f') < 0);
    }
  }

  section('4. Истински клик по таба зарежда данните');
  {
    const h = await view();
    const tabBtn = h.doc.getElementById('ktab-oborot');
    if (ok('бутонът съществува в рендерирания DOM', !!tabBtn)) {
      const before = h.calls.get.filter(u => u.indexOf('daily_turnover') >= 0).length;
      realClick(h.w, tabBtn, 'ktab-oborot');
      await ticks();
      const after = h.calls.get.filter(u => u.indexOf('daily_turnover') >= 0).length;
      ok('кликът минава без грешка и праща нов GET към daily_turnover', after > before);
      ok('заявката филтрира по собствения обект',
        h.calls.get.some(u => u.indexOf('daily_turnover') >= 0 &&
          u.indexOf(encodeURIComponent('Троян')) >= 0));
    }
  }

  section('5. Заглавието на страницата не изчезва');
  {
    /* renderOborot пишеше само лентата + съдържанието и махаше .page с
       надписа „Каса" — а бутонът е точно под този надпис. */
    const h = await view();
    const t = h.doc.querySelector('#mod-kasa .pg-title');
    const s = h.doc.querySelector('#mod-kasa .pg-sub');
    ok('има заглавие „Каса"', !!t && t.textContent.indexOf('Каса') >= 0,
      t ? t.textContent : 'ЛИПСВА');
    ok('подзаглавието казва кой таб е активен',
      !!s && s.textContent.indexOf('Вечерен оборот') >= 0, s ? s.textContent : 'ЛИПСВА');
    ok('обектът е в подзаглавието', !!s && s.textContent.indexOf('Троян') >= 0);
    ok('обвивката .page е налична', !!h.doc.querySelector('#mod-kasa .page'));
    ok('бутонът е ВЪТРЕ в .page, под заглавието',
      !!h.doc.querySelector('#mod-kasa .page #ktab-oborot'));
  }

  section('6. Магазин без запис за днес → форма');
  {
    const h = await view();
    ok('има поле "Общ оборот"', !!h.doc.getElementById('dt-total'));
    ok('има поле "В брой"', !!h.doc.getElementById('dt-cash'));
    ok('има поле "С карта"', !!h.doc.getElementById('dt-card'));
    ok('има поле "Брой клиенти"', !!h.doc.getElementById('dt-customers'));
    ok('има поле "Забележка"', !!h.doc.getElementById('dt-note'));
    ok('има бутон "Запиши оборота"', !!btn(h.doc, 'Запиши оборота'));
    ok('формата няма избор на дата', !h.doc.getElementById('dt-date'));
  }

  section('7. Валиден запис');
  {
    const h = await view();
    await submit(h, '100.00', '60.00', '40.00', '25', 'тест');
    const p = posts(h);
    if (ok('тръгва POST към daily_turnover', p.length === 1)) {
      const b = p[0].body;
      ok('store_name е обектът на потребителя', b.store_name === 'Троян');
      ok('date е локалната днешна дата (не toISOString)',
        b.date === h.w.toLocalISO(new Date()), b.date);
      ok('total_turnover = 100', b.total_turnover === 100);
      ok('cash_turnover = 60', b.cash_turnover === 60);
      ok('card_turnover = 40', b.card_turnover === 40);
      ok('customers = 25 (число, не низ)', b.customers === 25);
      ok('note се записва', b.note === 'тест');
      ok('created_by е display_name', b.created_by === 'Мария Иванова');
    }
    ok('зелен toast за успех', h.calls.toast.some(t => /записан/.test(t)));
    ok('toast-ът наистина е ЗЕЛЕН', GREEN.test(toastColor(h)), toastColor(h));
  }
  {
    const h = await view();
    await submit(h, '100.00', '60.00', '40.00', '25');
    const b = posts(h)[0];
    ok('празна забележка се записва като null, не празен низ',
      !!b && b.body.note === null);
  }

  section('8. Сборът не съвпада → няма заявка');
  {
    const h = await view();
    await submit(h, '102.00', '60.00', '40.00', '25');
    ok('разлика 2 EUR → НЕ тръгва POST', posts(h).length === 0);
    ok('казва защо', h.calls.toast.some(t => /не съвпада със сбора/.test(t)));
  }
  {
    const h = await view();
    await submit(h, '100.05', '50.00', '50.00', '25');
    ok('разлика 0,05 EUR минава (закръгляне на фискалното устройство)',
      posts(h).length === 1);
  }

  section('9. Границата на толеранса — явно, от двете страни');
  {
    const h = await view();
    await submit(h, '101.00', '50.00', '50.00', '10');
    ok('точно 1,00 EUR разлика МИНАВА', posts(h).length === 1);
  }
  {
    const h = await view();
    await submit(h, '101.01', '50.00', '50.00', '10');
    ok('1,01 EUR разлика НЕ минава', posts(h).length === 0);
  }
  {
    const h = await view();
    await submit(h, '99.00', '50.00', '50.00', '10');
    ok('–1,00 EUR разлика МИНАВА (толерансът е двупосочен)', posts(h).length === 1);
  }
  {
    const h = await view();
    await submit(h, '98.99', '50.00', '50.00', '10');
    ok('–1,01 EUR разлика НЕ минава', posts(h).length === 0);
  }

  section('10. Празни и невалидни стойности');
  {
    const h = await view();
    await submit(h, '100.00', '60.00', '40.00', '');
    ok('празно "Брой клиенти" → НЕ тръгва POST', posts(h).length === 0);
    ok('toast "Попълни всички полета"',
      h.calls.toast.some(t => /Попълни всички полета/.test(t)));
  }
  {
    const h = await view();
    await submit(h, '', '60.00', '40.00', '25');
    ok('празен общ оборот → НЕ тръгва POST', posts(h).length === 0);
  }
  {
    const h = await view();
    await submit(h, '-100.00', '-60.00', '-40.00', '25');
    ok('отрицателни суми → НЕ тръгва POST', posts(h).length === 0);
    ok('казва, че сумите не може да са под нула',
      h.calls.toast.some(t => /не по-малки от нула/.test(t)));
  }
  {
    const h = await view();
    await submit(h, '100.00', '60.00', '40.00', '-5');
    ok('отрицателен брой клиенти → НЕ тръгва POST', posts(h).length === 0);
  }
  {
    const h = await view();
    await submit(h, '100.00', '60.00', '40.00', '25.5');
    ok('дробен брой клиенти → НЕ тръгва POST', posts(h).length === 0);
    ok('казва, че клиентите са цяло число',
      h.calls.toast.some(t => /цяло число/.test(t)));
  }
  {
    const h = await view();
    await submit(h, '0', '0', '0', '0');
    ok('нулев ден (0 клиенти, 0 оборот) МИНАВА', posts(h).length === 1);
  }

  section('11. Вече има запис за днес → формата не се рендира');
  {
    const h = await view({
      data: {
        daily_turnover: [rec({
          id: 'dt-today', date: H.dayOffset(0),
          total_turnover: 1234.56, cash_turnover: 734.56, card_turnover: 500,
          customers: 40, note: 'вечерна смяна'
        })],
        stores: STORES
      }
    });
    /* Проверката гледа САМО input/button — обвиващият div съдържа текста на
       всичко вътре, така че търсене по div винаги е истина и тестът лъже. */
    ok('няма поле "Общ оборот"', !h.doc.getElementById('dt-total'));
    ok('няма поле "В брой"', !h.doc.getElementById('dt-cash'));
    ok('няма поле "С карта"', !h.doc.getElementById('dt-card'));
    ok('няма поле "Брой клиенти"', !h.doc.getElementById('dt-customers'));
    ok('няма бутон "Запиши оборота"', !btn(h.doc, 'Запиши оборота'));
    ok('няма бутон за редакция', !btn(h.doc, 'Редактирай'));

    const txt = h.doc.getElementById('mod-kasa').textContent;
    ok('показва записаните числа', txt.indexOf('1234.56') >= 0);
    ok('показва кой е въвел', txt.indexOf('Мария Иванова') >= 0);
    ok('показва забележката', txt.indexOf('вечерна смяна') >= 0);
    ok('показва потвърждение, че е записан', /записан/.test(txt));
  }

  section('12. Таблицата за 7 дни — липсващите дни се виждат');
  {
    const h = await view({
      data: {
        daily_turnover: [
          rec({ id: 'a', date: dayOffset(-1), customers: 50 }),
          rec({ id: 'b', date: dayOffset(-3), customers: 40 })
        ],
        stores: STORES
      }
    });
    const tbl = h.doc.getElementById('dt-last7');
    if (ok('таблицата за 7 дни съществува', !!tbl)) {
      const rows = Array.prototype.slice.call(tbl.querySelectorAll('tr')).slice(1);
      ok('показва точно 7 дни', rows.length === 7, 'редове: ' + rows.length);
      const dashed = rows.filter(r => r.textContent.indexOf('—') >= 0);
      ok('5-те дни без запис се показват като ред с тире, не се пропускат',
        dashed.length === 5, 'с тире: ' + dashed.length);
      const filled = rows.filter(r => r.textContent.indexOf('1000.00') >= 0);
      ok('2-та дни със запис показват сумите', filled.length === 2);
      ok('среден чек се смята', rows.some(r => r.textContent.indexOf('20.00') >= 0));
    }
  }

  section('13. Централен офис — обобщение вместо форма');
  {
    const h = await view({
      user: CO_USER,
      data: {
        daily_turnover: [rec({ id: 'c', store_name: 'Троян', date: dayOffset(0) })],
        stores: STORES
      }
    });
    ok('НЯМА поле за въвеждане', !h.doc.getElementById('dt-total'));
    ok('НЯМА бутон за запис', !btn(h.doc, 'Запиши оборота'));
    ok('има таблица по обекти', !!h.doc.getElementById('dt-co-table'));
    ok('има избор на дата', !!h.doc.getElementById('dt-co-date'));

    const co = h.doc.getElementById('dt-co-table').textContent;
    ok('показва подалия обект', co.indexOf('Троян') >= 0);
    ok('има ред "Общо"', co.indexOf('Общо') >= 0);

    const miss = h.doc.getElementById('dt-missing');
    if (ok('има изричен списък на неподалите', !!miss)) {
      ok('Ловеч е в списъка на неподалите', miss.textContent.indexOf('Ловеч') >= 0);
      ok('Централен офис НЕ се брои за неподал обект',
        miss.textContent.indexOf('Централен офис') < 0);
      ok('логистичният склад НЕ се брои за неподал обект',
        miss.textContent.indexOf('Логистичен склад') < 0);
      ok('Троян не е сред неподалите', miss.textContent.indexOf('Троян') < 0);
    }
  }
  {
    /* Критерият е ОБЕКТ, не роля: admin в магазин подава оборот. */
    const h = await view({ user: { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Троян' } });
    ok('admin в МАГАЗИН вижда формата (isGlobal() не решава тук)',
      !!h.doc.getElementById('dt-total'));
  }

  section('14. Смяна на датата в изгледа на ЦО');
  {
    const h = await view({
      user: CO_USER,
      data: { daily_turnover: [], stores: STORES }
    });
    const inp = h.doc.getElementById('dt-co-date');
    if (ok('полето за дата съществува', !!inp)) {
      inp.value = '2026-08-10';
      H.fire(h.w, inp, 'change');
      await ticks();
      ok('новата дата отива в заявката',
        h.calls.get.some(u => u.indexOf('daily_turnover') >= 0 && u.indexOf('2026-08-10') >= 0));
    }
  }

  section('15. Грешките не се поглъщат тихо');
  {
    const h = await view({ fail: { POST: { status: 409, body: { message: 'duplicate key value violates unique constraint' } } } });
    await submit(h, '100.00', '60.00', '40.00', '25');
    ok('409 → разбираем toast, не мълчание',
      h.calls.toast.some(t => /вече е записан/.test(t)));
    ok('409 → toast-ът е ЖЪЛТ (не червено — това не е грешка на потребителя)',
      AMBER.test(toastColor(h)), toastColor(h));
    ok('409 → изгледът се презарежда',
      h.calls.get.filter(u => u.indexOf('daily_turnover') >= 0).length >= 2);
    ok('409 → НЕ се игнорира мълчаливо (има точно един toast)',
      h.calls.toast.length === 1, 'toasts: ' + JSON.stringify(h.calls.toast));
  }
  {
    const h = await view({ fail: { POST: { status: 400, body: { message: 'invalid input syntax for type numeric' } } } });
    await submit(h, '100.00', '60.00', '40.00', '25');
    ok('400 → toast с ПРИЧИНАТА от PostgREST, не само "Грешка"',
      h.calls.toast.some(t => /invalid input syntax for type numeric/.test(t)));
    ok('400 → toast-ът е ЧЕРВЕН', RED.test(toastColor(h)), toastColor(h));
    const el = h.doc.getElementById('dt-total');
    ok('формата остава попълнена, за да не се въвежда наново',
      !!el && el.value === '100.00', el && el.value);
  }
  {
    /* Празно тяло — точно каквото връща Supabase при 401 без apikey. */
    const h = await view({ fail: { POST: { status: 401 } } });
    await submit(h, '100.00', '60.00', '40.00', '25');
    ok('401 с празно тяло не хвърля и пак казва нещо',
      h.calls.toast.some(t => /Грешка при запис/.test(t)));
  }

  section('16. Предупреждение при необичайно висок оборот');
  {
    const hist = [];
    for (let i = 1; i <= 5; i++) hist.push(rec({ id: 'h' + i, date: dayOffset(-i), total_turnover: 100, cash_turnover: 60, card_turnover: 40 }));
    const data = { daily_turnover: hist, stores: STORES };

    const h1 = await view({ data, confirm: false });
    await submit(h1, '600.00', '600.00', '0', '10');
    ok('над 5× средното → пита потребителя', h1.calls.confirm.length === 1);
    ok('отказ на въпроса → НЕ тръгва POST', posts(h1).length === 0);

    const h2 = await view({ data, confirm: true });
    await submit(h2, '600.00', '600.00', '0', '10');
    ok('потвърждение → записът минава (предупреждение, не забрана)',
      posts(h2).length === 1);

    const h3 = await view({ data, confirm: false });
    await submit(h3, '400.00', '400.00', '0', '10');
    ok('под 5× средното → не пита изобщо', h3.calls.confirm.length === 0);
    ok('и записва', posts(h3).length === 1);
  }

  section('17. Регресионни закотвяния в изходния код');
  {
    const src = fs.readFileSync(path.join(ROOT, 'daily-turnover.js'), 'utf8');
    /* Коментарите падат преди проверката — в тях today() се СПОМЕНАВА нарочно,
       за да е ясно защо не се ползва, и иначе закотвянето лови само себе си. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('не ползва today() от shared.js (дава вчера в ранните часове)',
      !/[^A-Za-z]today\(\)/.test(code));
    ok('не предефинира toLocalISO()', !/function\s+toLocalISO/.test(src));
    ok('емоджитата са HTML entity-та, не сурови символи в JS низ',
      !/[\uD800-\uDBFF]/.test(src));

    const kasa = fs.readFileSync(path.join(ROOT, 'kasa.js'), 'utf8');
    ok('kasa.js знае за таба в масива за подсветка',
      /\['pos','glavna','zoborot','storno','oborot'\]/.test(kasa));
    ok('kasa.js вика loadOborot() в kasaTab()',
      /tab==='oborot'\)\{loadOborot\(\);\}/.test(kasa));

    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ok('daily-turnover.js е в index.html',
      html.indexOf('<script src="daily-turnover.js"></script>') >= 0);
    ok('зарежда се СЛЕД kasa-docs.js',
      html.indexOf('kasa-docs.js') < html.indexOf('daily-turnover.js'));
    ok('зарежда се СЛЕД bulletin.js (toLocalISO)',
      html.indexOf('bulletin.js') < html.indexOf('daily-turnover.js'));
  }

  section('18. MODULE_ORDER на harness.js огледало ли е на index.html');
  {
    /* Ако новият файл влезе в КРАЯ на MODULE_ORDER вместо на мястото си,
       тестовете пак минават, но зареждат друг ред от браузъра — тоест
       престават да доказват това, за което са писани. Затова редът се
       сверява цял, а не само позицията на новия файл. */
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const re = /<script src="([^"]+?)(?:\?[^"]*)?"><\/script>/g;
    const inHtml = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      if (!/^https?:/.test(m[1])) inHtml.push(m[1]);
    }
    ok('броят локални скриптове съвпада',
      inHtml.length === H.MODULE_ORDER.length,
      'index.html: ' + inHtml.length + ', MODULE_ORDER: ' + H.MODULE_ORDER.length);

    const firstDiff = inHtml.findIndex((f, i) => f !== H.MODULE_ORDER[i]);
    ok('редът е идентичен, файл по файл', firstDiff === -1,
      firstDiff === -1 ? '' :
        'поз ' + firstDiff + ': index.html=' + inHtml[firstDiff] +
        ', MODULE_ORDER=' + H.MODULE_ORDER[firstDiff]);

    const i = H.MODULE_ORDER.indexOf('daily-turnover.js');
    ok('daily-turnover.js е в MODULE_ORDER', i >= 0);
    ok('и е ВЕДНАГА след kasa-docs.js, не в края',
      H.MODULE_ORDER[i - 1] === 'kasa-docs.js',
      'предх: ' + H.MODULE_ORDER[i - 1]);
    ok('не е последен в списъка', i < H.MODULE_ORDER.length - 1);
  }

  report();
})();
