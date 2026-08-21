/* Бюлетин: подразбиращ се избор по ДНЕШНАТА дата + лента за контекст.

   Досега порталът отваряше последния публикуван бюлетин. Управителят обаче
   работи по този, който покрива днешния ден — а новият за следващата седмица
   не бива да изчезва, защото в петък по него върви оперативката.

   Системната дата е закована на петък 21.08.2026 (ISO седмица 34), за да са
   детерминирани и изборът, и текстовете в лентата.

   Пускане: node tests/bulletin-week-default.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

/* ── Заковаване на системната дата ──────────────────────────────────────── */

/* Кодът вика new Date() и weekNum(new Date()) вътре в себе си, затова датата
   се подменя на самия window — файловете са заредени с w.eval() и виждат
   именно w.Date. Конструкторът с аргументи остава истинският, иначе
   weekDays(wk,yr) и new Date(iso) биха се счупили. */
const FROZEN = '2026-08-21T09:00:00';   /* петък, ISO седмица 34 */

function freezeDate(w) {
  const RealDate = w.Date;
  const fixedMs = new RealDate(FROZEN).getTime();
  function FakeDate(a, b, c, d, e, f, g) {
    switch (arguments.length) {
      case 0: return new RealDate(fixedMs);
      case 1: return new RealDate(a);
      case 2: return new RealDate(a, b);
      case 3: return new RealDate(a, b, c);
      case 4: return new RealDate(a, b, c, d);
      case 5: return new RealDate(a, b, c, d, e);
      case 6: return new RealDate(a, b, c, d, e, f);
      default: return new RealDate(a, b, c, d, e, f, g);
    }
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => fixedMs;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  w.Date = FakeDate;
}

/* ── Данни ──────────────────────────────────────────────────────────────── */

const STORE = 'Кърджали';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: STORE };

/* created_at нарочно расте с номера на седмицата — така "последният по
   created_at" (старото поведение) е С35, а правилният отговор е С34.
   Ако тестът мине и с двете, не доказва нищо. */
function bul(wk, id, status) {
  return {
    id: id, week_number: wk, year: 2026,
    status: status || 'published',
    created_at: '2026-0' + (wk === 33 ? '8-10' : wk === 34 ? '8-17' : '8-24') + 'T08:00:00Z'
  };
}
const B33 = bul(33, 'b-33');
const B34 = bul(34, 'b-34');
const B35 = bul(35, 'b-35');

function emptyContent(w) {
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  return { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } };
}

/* boot + замразена дата + празни колекции, които renderBulView() чете. */
function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || MANAGER,
    data: opts.data || {}
  });
  freezeDate(h.w);
  const w = h.w;
  w.bulListCache = opts.cache || [];
  w.bulTasks = opts.tasks || [];
  w.recurringTasks = [];
  w.bulComps = [];
  w.recurringComps = [];
  w.subtaskComps = [];
  w.bulPromotions = [];
  w.allStoresCache = [STORE, 'Троян'];
  if (opts.curBul) {
    w.curBul = Object.assign({}, opts.curBul, { content: emptyContent(w) });
  }
  return h;
}

/* САМО бутоните на лентата — не 'button, span'. */
function bannerBtns(doc) {
  return Array.prototype.slice.call(
    doc.querySelectorAll('button[onclick*=selectBulletin]'));
}

(async function run() {

  section('0. Датата е закована и седмицата е тази, която очакваме');
  {
    const h = env({});
    ok('21.08.2026 е петък', h.w.Date().getDay() === 5, String(h.w.Date()));
    ok('weekNum(днес) === 34', h.w.weekNum(new h.w.Date()) === 34,
      String(h.w.weekNum(new h.w.Date())));
    ok('годината е 2026', new h.w.Date().getFullYear() === 2026);
    ok('bulWeekBannerHtml() съществува', typeof h.w.bulWeekBannerHtml === 'function');
  }

  /* ── ЧАСТ 1: подразбиращ се избор ─────────────────────────────────────── */

  /* Списъчната заявка се разпознава по select=; всичко друго е заявката
     за конкретния бюлетин. */
  function bulletinsRoute(list) {
    return url => (url.indexOf('select=id,week_number') >= 0 ? list : [B34]);
  }
  function bulUrls(calls) {
    return calls.get.filter(u => u.indexOf('/bulletins') >= 0 &&
      u.indexOf('select=id,week_number') < 0);
  }

  section('A. Без bulSelectedId се избира бюлетинът за ТЕКУЩАТА седмица (С34)');
  {
    const h = env({ data: { bulletins: bulletinsRoute([B35, B34]) } });
    h.w.bulSelectedId = null;
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      for (let i = 0; i < 8; i++) await ticks();
      const urls = bulUrls(h.calls);
      if (ok('има заявка за конкретен бюлетин', urls.length >= 1, JSON.stringify(h.calls.get))) {
        ok('сочи id-то на С34', urls[0].indexOf('id=eq.b-34') >= 0, urls[0]);
        ok('НЕ сочи С35 (последния по created_at)', urls[0].indexOf('b-35') < 0, urls[0]);
      }
    }
  }

  section('B. Няма С34 в кеша → резервата (последният по created_at)');
  {
    const h = env({ data: { bulletins: bulletinsRoute([B35, B33]) } });
    h.w.bulSelectedId = null;
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      for (let i = 0; i < 8; i++) await ticks();
      const urls = bulUrls(h.calls);
      if (ok('има заявка за конкретен бюлетин', urls.length >= 1)) {
        ok('пада на order=created_at.desc&limit=1',
          urls[0].indexOf('order=created_at.desc') >= 0 && urls[0].indexOf('limit=1') >= 0,
          urls[0]);
        ok('не се вкопчва в несъществуващо id', urls[0].indexOf('id=eq.') < 0, urls[0]);
      }
    }
  }

  section('B2. bulSelectedId има превес — изричният избор не се пренаписва');
  {
    const h = env({ data: { bulletins: bulletinsRoute([B35, B34]) } });
    h.w.bulSelectedId = 'b-35';
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      for (let i = 0; i < 8; i++) await ticks();
      const urls = bulUrls(h.calls);
      if (ok('има заявка за конкретен бюлетин', urls.length >= 1)) {
        ok('сочи изрично избрания С35', urls[0].indexOf('id=eq.b-35') >= 0, urls[0]);
      }
    }
  }

  /* ── ЧАСТ 2: лентата ──────────────────────────────────────────────────── */

  section('C. Случай А — текуща седмица + по-нов публикуван бюлетин');
  {
    const h = env({ curBul: B34, cache: [B35, B34, B33] });
    const html = h.w.bulWeekBannerHtml();
    ok('лентата не е празна', !!html);
    ok('казва, че е публикуван нов бюлетин', html.indexOf('Публикуван е нов бюлетин') >= 0);
    ok('назовава С35', html.indexOf('С35') >= 0, html.slice(0, 200));
    ok('показва диапазона на С35 (24.08 – 30.08)',
      html.indexOf('24.08') >= 0 && html.indexOf('30.08') >= 0, html.slice(0, 260));
    ok('споменава оперативката', html.indexOf('оперативката') >= 0);
    ok('синият стил е приложен', html.indexOf('#eff6ff') >= 0 && html.indexOf('#bfdbfe') >= 0);
  }
  {
    /* Реален клик върху бутона на лентата, през целия рендер. */
    const h = env({ curBul: B34, cache: [B35, B34, B33] });
    if (guard('renderBulView() не хвърля', () => h.w.renderBulView())) {
      const btns = bannerBtns(h.doc);
      if (ok('лентата има точно един бутон', btns.length === 1, String(btns.length))) {
        ok('надписът е "Отвори"', btns[0].textContent.indexOf('Отвори') >= 0,
          btns[0].textContent);
        const seen = [];
        h.w.selectBulletin = function (id) { seen.push(id); };
        realClick(h.w, btns[0], 'Отвори');
        ok('selectBulletin() е извикан веднъж', seen.length === 1, JSON.stringify(seen));
        ok('с id-то на С35', seen[0] === 'b-35', JSON.stringify(seen));
      }
    }
  }

  section('D. Случай Б — гледаш БЪДЕЩА седмица (С35)');
  {
    const h = env({ curBul: B35, cache: [B35, B34, B33] });
    const html = h.w.bulWeekBannerHtml();
    ok('лентата не е празна', !!html);
    ok('казва "следваща седмица"', html.indexOf('Гледаш следваща седмица') >= 0);
    ok('показва диапазона на С35', html.indexOf('24.08') >= 0 && html.indexOf('30.08') >= 0);
    ok('сочи къде са отметките за днес (С34)', html.indexOf('в С34') >= 0, html.slice(0, 260));
    ok('кехлибареният стил е приложен',
      html.indexOf('#fffbeb') >= 0 && html.indexOf('#fde68a') >= 0);
  }
  {
    const h = env({ curBul: B35, cache: [B35, B34, B33] });
    if (guard('renderBulView() не хвърля', () => h.w.renderBulView())) {
      const btns = bannerBtns(h.doc);
      if (ok('лентата има бутон', btns.length === 1, String(btns.length))) {
        ok('надписът е "Към текущата"', btns[0].textContent.indexOf('Към текущата') >= 0,
          btns[0].textContent);
        const seen = [];
        h.w.selectBulletin = function (id) { seen.push(id); };
        realClick(h.w, btns[0], 'Към текущата');
        ok('води към С34', seen.length === 1 && seen[0] === 'b-34', JSON.stringify(seen));
      }
    }
  }

  section('E. Случай В — гледаш МИНАЛА седмица (С33)');
  {
    const h = env({ curBul: B33, cache: [B35, B34, B33] });
    const html = h.w.bulWeekBannerHtml();
    ok('казва "минала седмица"', html.indexOf('Гледаш минала седмица') >= 0);
    ok('показва диапазона на С33 (10.08 – 16.08)',
      html.indexOf('10.08') >= 0 && html.indexOf('16.08') >= 0, html.slice(0, 260));
    ok('НЕ казва "следваща"', html.indexOf('следваща') < 0);
    ok('кехлибареният стил е приложен', html.indexOf('#fffbeb') >= 0);
  }
  {
    const h = env({ curBul: B33, cache: [B35, B34, B33] });
    if (guard('renderBulView() не хвърля', () => h.w.renderBulView())) {
      const btns = bannerBtns(h.doc);
      if (ok('лентата има бутон', btns.length === 1)) {
        const seen = [];
        h.w.selectBulletin = function (id) { seen.push(id); };
        realClick(h.w, btns[0], 'Към текущата');
        ok('води към С34', seen.length === 1 && seen[0] === 'b-34', JSON.stringify(seen));
      }
    }
  }

  section('F. Текуща седмица без по-нов бюлетин → лентата мълчи');
  {
    const h = env({ curBul: B34, cache: [B34, B33] });
    ok('bulWeekBannerHtml() връща празен низ', h.w.bulWeekBannerHtml() === '',
      h.w.bulWeekBannerHtml());
  }
  {
    const h = env({ curBul: B34, cache: [B34, B33] });
    if (guard('renderBulView() не хвърля', () => h.w.renderBulView())) {
      ok('в рендера няма бутон на лента', bannerBtns(h.doc).length === 0);
    }
  }
  {
    /* Черновата за С35 не е "публикуван нов бюлетин" — не вдига синята лента. */
    const h = env({ curBul: B34, cache: [bul(35, 'b-35d', 'draft'), B34] });
    ok('чернова за С35 не вдига лентата', h.w.bulWeekBannerHtml() === '',
      h.w.bulWeekBannerHtml());
  }

  section('G. Бъдеща седмица, но С34 липсва в кеша → текст БЕЗ бутон');
  {
    const h = env({ curBul: B35, cache: [B35, B33] });
    const html = h.w.bulWeekBannerHtml();
    ok('лентата пак се показва', !!html);
    ok('текстът е налице', html.indexOf('Гледаш следваща седмица') >= 0);
    ok('няма бутон в HTML-а', html.indexOf('<button') < 0, html.slice(0, 260));
  }
  {
    const h = env({ curBul: B35, cache: [B35, B33] });
    if (guard('renderBulView() не хвърля', () => h.w.renderBulView())) {
      ok('в рендера няма бутон на лента', bannerBtns(h.doc).length === 0);
      ok('но лентата е там', h.doc.getElementById('bul-body')
        .textContent.indexOf('Гледаш следваща седмица') >= 0);
    }
  }

  section('H. РЕГРЕСИЯ: чекбоксчетата за бъдеща седмица НЕ са заключени');
  {
    const h = env({
      curBul: B35, cache: [B35, B34, B33],
      tasks: [{
        id: 't-1', title: 'Задача в С35', department: 'trade',
        due_dates: ['2026-08-25'], target_stores: [STORE], linked_module: null
      }]
    });
    if (guard('renderBulView() не хвърля', () => h.w.renderBulView())) {
      /* Календарът е само едно от местата с чекбоксчета — панелите по отдели
         също рендерират задачата. Тук държим на календара, но по-долу
         проверяваме и че НИКОЕ от всичките не е заключено. */
      const boxes = Array.prototype.slice.call(
        h.doc.querySelectorAll('#sec-calendar input[type=checkbox][data-tid]'));
      if (ok('чекбоксчето в календара съществува', boxes.length === 1, String(boxes.length))) {
        ok('НЕ е disabled', boxes[0].disabled === false);
        ok('няма readonly атрибут', !boxes[0].hasAttribute('readonly'));
        ok('запазва onchange handler-а',
          (boxes[0].getAttribute('onchange') || '').indexOf('bulCheckboxChanged') >= 0,
          boxes[0].getAttribute('onchange'));
      }
      const allBoxes = Array.prototype.slice.call(
        h.doc.querySelectorAll('#bul-body input[type=checkbox][data-tid]'));
      ok('има чекбоксчета и извън календара', allBoxes.length > 1, String(allBoxes.length));
      ok('НИТО ЕДНО чекбоксче не е disabled',
        allBoxes.every(b => b.disabled === false), String(allBoxes.length));
      ok('лентата за бъдеща седмица също е там',
        h.doc.getElementById('bul-body').textContent.indexOf('Гледаш следваща седмица') >= 0);
    }
  }

  report();
})();
