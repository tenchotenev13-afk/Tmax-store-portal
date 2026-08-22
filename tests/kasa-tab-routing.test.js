/* Маршрутизация на подтабовете в Каса при ВЛИЗАНЕ в модула.

   showModule('kasa') вика loadKasa() (shared.js), не kasaTab(). Двете са
   различни пътища и дълго време се разминаваха: loadKasa() разклоняваше
   двоично — 'pos' или ВСИЧКО ОСТАНАЛО в renderGlavna(). Резултатът беше
   съдържание на един таб под заглавието и подсветката на друг.

   Тестът НЕ проверява „извикана ли е функцията". Проверява каква страница
   вижда потребителят: подзаглавието на съдържанието срещу тъмния бутон в
   лентата. Ако двете се разминат, тестът пада — независимо кое от двете е
   сгрешено.

   Пускане:  node tests/kasa-tab-routing.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const USER = {
  email: 'troyan@temax.bg', display_name: 'Мария Иванова',
  role: 'manager', store_name: 'Троян'
};

/* Всеки таб се разпознава по подзаглавието, което САМ рендира, и по
   бутона, който лентата подсветява. Двете идват от различни места в кода
   (render* срещу kasaTabBar/tabStyle) — затова съвпадението им значи нещо. */
const TABS = [
  { view: 'pos', btn: 'ktab-pos', sub: 'Троян', label: 'ПОС Отчети' },
  { view: 'glavna', btn: 'ktab-glavna', sub: 'Троян — Главна каса', label: 'Главна каса' },
  { view: 'zoborot', btn: 'ktab-zoborot', sub: 'Троян — Равнение на оборота', label: 'Равнение' },
  { view: 'storno', btn: 'ktab-storno', sub: 'Троян — Сторно бележки', label: 'Сторно бележки' },
  { view: 'oborot', btn: 'ktab-oborot', sub: 'Троян — Вечерен оборот', label: 'Вечерен оборот' }
];

const DATA = {
  kasa_reports: [], kasa_glavna: [], kasa_zoborot: [],
  kasa_storno: [], daily_turnover: [], stores: [{ name: 'Троян' }]
};

function env() {
  return boot({
    modules: ['bulletin.js', 'kasa.js', 'daily-turnover.js'],
    user: USER,
    data: DATA
  });
}

/* Кой бутон е тъмен. Стилът идва или от tabStyle() в markup-а, или от
   инлайн присвояването в kasaTab() — приемаме и двете форми. */
function highlighted(doc) {
  const dark = [];
  TABS.forEach(t => {
    const el = doc.getElementById(t.btn);
    if (!el) return;
    const style = (el.getAttribute('style') || '') + ' ' + (el.style.background || '');
    if (/background:\s*#2f2f2f|rgb\(47,\s*47,\s*47\)/.test(style)) dark.push(t.btn);
  });
  return dark;
}

(async function () {

  section('1. Всеки kasaView рендира СВОЯ таб при влизане в модула');
  for (const t of TABS) {
    const h = env();
    h.w.kasaView = t.view;
    h.w.loadKasa();
    await ticks();
    await ticks();

    const sub = h.doc.querySelector('#mod-kasa .pg-sub');
    const subTxt = sub ? sub.textContent : '(липсва)';
    ok('kasaView=' + t.view + ' → съдържанието е на „' + t.label + '"',
      subTxt === t.sub, 'подзаглавие: ' + subTxt);

    const dark = highlighted(h.doc);
    ok('kasaView=' + t.view + ' → подсветен е точно един бутон',
      dark.length === 1, 'тъмни: ' + JSON.stringify(dark));
    ok('kasaView=' + t.view + ' → подсветеният бутон е ' + t.btn,
      dark.length === 1 && dark[0] === t.btn, 'тъмни: ' + JSON.stringify(dark));
  }

  section('2. Заглавието „Каса" е на всеки таб');
  for (const t of TABS) {
    const h = env();
    h.w.kasaView = t.view;
    h.w.loadKasa();
    await ticks();
    await ticks();
    const title = h.doc.querySelector('#mod-kasa .pg-title');
    ok('kasaView=' + t.view + ' → има pg-title „Каса"',
      !!title && title.textContent.indexOf('Каса') >= 0,
      title ? title.textContent : 'ЛИПСВА');
  }

  section('3. Същото и по пътя през kasaTab() — двата пътя не се разминават');
  for (const t of TABS) {
    const h = env();
    h.w.kasaTab(t.view);
    await ticks();
    await ticks();
    const sub = h.doc.querySelector('#mod-kasa .pg-sub');
    ok('kasaTab(\'' + t.view + '\') → съдържанието е на „' + t.label + '"',
      !!sub && sub.textContent === t.sub, sub ? sub.textContent : '(липсва)');
    const dark = highlighted(h.doc);
    ok('kasaTab(\'' + t.view + '\') → подсветен е ' + t.btn,
      dark.length === 1 && dark[0] === t.btn, 'тъмни: ' + JSON.stringify(dark));
  }

  section('4. Непозната стойност не оставя празна страница');
  {
    /* Стари сесии или бъдещ таб, чийто клон липсва. Падаме на ПОС Отчети,
       което е и началната стойност на kasaView, и това, което kasaTabBar()
       подсветява при празна стойност — тоест съдържание и лента пак
       съвпадат, вместо да се разминат. */
    const h = env();
    h.w.kasaView = 'няма-такъв';
    h.w.loadKasa();
    await ticks();
    await ticks();
    const sub = h.doc.querySelector('#mod-kasa .pg-sub');
    ok('непозната стойност → рендира ПОС Отчети',
      !!sub && sub.textContent === 'Троян', sub ? sub.textContent : '(липсва)');
    ok('страницата не е празна', !!h.doc.querySelector('#mod-kasa .page'));
  }

  section('5. Закотвяне: loadKasa() не се връща към двоичния клон');
  {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'kasa.js'), 'utf8');
    const fn = src.slice(src.indexOf('function loadKasa('),
      src.indexOf('function kasaTab('));
    ok('loadKasa() има клон за zoborot', /case 'zoborot'/.test(fn));
    ok('loadKasa() има клон за storno', /case 'storno'/.test(fn));
    ok('loadKasa() има клон за oborot', /case 'oborot'/.test(fn));
    ok('loadKasa() има клон за glavna', /case 'glavna'/.test(fn));
    ok('няма „всичко останало → renderGlavna()"',
      !/else\s+renderGlavna\(\)/.test(fn));
  }

  report();
})();
