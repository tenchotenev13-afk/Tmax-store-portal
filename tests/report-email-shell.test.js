/* Обвивката и типографията на имейл репортите — reportEmailShell() и
   размерите на шрифта.

   Симптом: в седмичното писмо някои коментари се рендираха с ОГРОМЕН шрифт,
   а съседните — нормално. Данните бяха чисти (проверено с hex), HTML-ът беше
   балансиран и всеки коментарен ред носеше собствен font-size. Тоест
   разликата идваше от клиента.

   Водеща причина: <body> нямаше -webkit-text-size-adjust. WebKit/Blink
   (Gmail на Android, Apple Mail, iOS Mail) прилагат автоматично уголемяване
   НА БЛОК, а коефициентът зависи от ширината на блока и обема текст в него —
   точно затова кратък коментар се уголемява, а по-дългият до него не.

   Утежняващо: всички размери бяха дробни (11.5px / 12.5px) и различните
   двигатели ги закръгляват различно.

   jsdom не смята лейаут — тук се заковават самите декларации, а реалният
   вид се потвърждава само от истинско писмо.

   Плюс: ph.url в <img src="..."> беше ЕДИНСТВЕНОТО място в репорта без
   esc(). Кавичка в URL чупи атрибута и изнася останалото като markup.

   Пускане:  node tests/report-email-shell.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

function env() {
  return boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: {} });
}

(async function () {

  section('1. body носи text-size-adjust');
  {
    const { w } = env();
    const html = w.reportEmailShell('Заглавие', 'Подзаглавие', '<p>тяло</p>', 'долу');
    const body = (html.match(/<body style="([^"]*)"/) || [])[1] || '';

    ok('намерен е body стилът', !!body, html.slice(0, 200));
    ok('-webkit-text-size-adjust:100%', body.indexOf('-webkit-text-size-adjust:100%') >= 0, body);
    ok('-ms-text-size-adjust:100%', body.indexOf('-ms-text-size-adjust:100%') >= 0, body);
    /* Заварените декларации не бива да са изтрити при добавянето. */
    ok('background остава', body.indexOf('background:#e8ecf3') >= 0, body);
    ok('font-family остава', body.indexOf('font-family:') >= 0, body);
    ok('margin/padding остават',
      body.indexOf('margin:0') >= 0 && body.indexOf('padding:20px') >= 0, body);
    ok('viewport meta е налице (иначе adjust не стига)',
      html.indexOf('name="viewport"') >= 0);
  }

  section('2. Нито един дробен размер в целия имейл');
  {
    const { w } = env();
    /* Целият седмичен имейл, с попълнени всички секции — така минаваме през
       всеки билдър наведнъж, не само през обвивката. */
    const data = {
      overallPct: 50, totalDone: 3, totalAll: 6, laggards: 1, storeCount: 2,
      rows: [{ name: 'Раднево', done: 2, total: 3, pct: 67 },
             { name: 'Габрово', done: 1, total: 3, pct: 33 }],
      top3: [{ name: 'Раднево', pct: 67 }], bottom3: [{ name: 'Габрово', pct: 33 }],
      noDueCount: 2,
      postponedList: [{ title: 'Палети', store: 'Раднево', comment: 'после' }],
      commentedList: [{ title: 'Каса', store: 'Габрово', comment: 'готово',
                        photos: [{ url: 'https://example.com/a.jpg' }] }],
      weekLabel: 'Седмица 34 · 2026', cross: null
    };
    const html = w.buildWeeklyReportHtml(data);
    const fractional = html.match(/font-size:\d+\.\d+px/g) || [];
    ok('нула дробни font-size', fractional.length === 0,
      Array.from(new Set(fractional)).join(', '));

    /* И че размерите не са изчезнали — йерархията се пази. */
    const sizes = Array.from(new Set(html.match(/font-size:\d+px/g) || [])).sort();
    ok('размерите са налице', sizes.length >= 4, sizes.join(', '));
    ok('заглавието на задача е по-едро от коментара',
      html.indexOf('font-size:13px') >= 0 && html.indexOf('font-size:12px') >= 0,
      sizes.join(', '));
  }

  section('3. Същото за дневния имейл');
  {
    const { w } = env();
    const data = {
      overallPct: 0, totalDone: 0, totalAll: 1, laggards: 1, storeCount: 1,
      rows: [{ name: 'Раднево', done: 0, total: 1, pct: 0 }],
      top3: [{ name: 'Раднево', pct: 0 }], bottom3: [{ name: 'Раднево', pct: 0 }],
      noDueCount: 1, postponedList: [], commentedList: []
    };
    const html = w.buildDailyReportHtml(data);
    ok('нула дробни font-size', (html.match(/font-size:\d+\.\d+px/g) || []).length === 0,
      (html.match(/font-size:\d+\.\d+px/g) || []).join(', '));
    ok('и дневният носи text-size-adjust',
      html.indexOf('-webkit-text-size-adjust:100%') >= 0);
  }

  section('4. ЯДРОТО: URL на снимка минава през escAttr()');
  {
    const { w, doc } = env();
    /* Кавичка в URL-а е достатъчна, за да излезе от атрибута.
       esc() САМ НЕ СТИГА — той покрива само & < >, не и кавичка. */
    const evil = 'https://x/a.jpg" onerror="alert(1)';
    const html = w.reportCommentedSectionHtml([
      { title: 'Каса', store: 'Раднево', comment: '', photos: [{ url: evil }] }
    ]);
    ok('кавичката е екранирана в изхода',
      html.indexOf('a.jpg" onerror=') < 0, html.slice(0, 400));

    /* Проверката е на ПАРСНАТ DOM, не на низа: `&quot; onerror=` вътре в
       стойността си съдържа текста „ onerror=" и регекс върху суровия HTML
       би се хванал напразно. Единственият верен въпрос е дали браузърът
       вижда атрибут. */
    const box = doc.createElement('div');
    box.innerHTML = html;
    const img = box.querySelector('img');
    if (ok('има <img>', !!img, html.slice(0, 300))) {
      ok('НЯМА onerror атрибут', !img.hasAttribute('onerror'),
        Array.prototype.map.call(img.attributes, a => a.name).join(', '));
      ok('целият зловреден низ е останал ВЪТРЕ в src',
        img.getAttribute('src') === evil, img.getAttribute('src'));
    }

    /* Обикновен URL продължава да работи — esc() пипа само & < >. */
    const plain = w.reportCommentedSectionHtml([
      { title: 'Каса', store: 'Раднево', comment: '', photos: [{ url: 'https://x/b.jpg' }] }
    ]);
    ok('нормален URL остава непроменен',
      plain.indexOf('src="https://x/b.jpg"') >= 0, plain.slice(0, 300));

    /* Амперсанд в URL (query низ) се екранира коректно за HTML атрибут. */
    const amp = w.reportCommentedSectionHtml([
      { title: 'Каса', store: 'Раднево', comment: '', photos: [{ url: 'https://x/c.jpg?a=1&b=2' }] }
    ]);
    ok('амперсандът става &amp;', amp.indexOf('c.jpg?a=1&amp;b=2') >= 0,
      amp.slice(0, 300));
  }

  section('5. Празни/липсващи данни не чупят секциите');
  {
    const { w } = env();
    ok('празен списък коментари → празен низ',
      w.reportCommentedSectionHtml([]) === '');
    ok('null → празен низ', w.reportCommentedSectionHtml(null) === '');
    ok('коментар без снимки не хвърля',
      w.reportCommentedSectionHtml([{ title: 'x', store: 'y', comment: 'z', photos: [] }])
        .indexOf('<img') < 0);
    ok('празен списък отложени → празен низ',
      w.reportPostponedSectionHtml([]) === '');
  }

  report();
})();
