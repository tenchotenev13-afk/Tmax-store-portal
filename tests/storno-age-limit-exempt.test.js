/* Капаро (900001) и Ваучер (900009) не попадат под ограничението
   „бон не по-стар от 1 месец".

   Ограничението живее в submitStornoForm(): обикновен магазин не може да
   запише сторно по бон, който е на повече от календарен месец от датата на
   сторното. Капарото и ваучерът обаче са финансови транзакции без реален
   заменящ артикул — те се връщат и след месеци, така че за тях проверката
   се прескача. Същите два кода вече бяха освободени от сравнението
   „нова сума ≥ върната сума" (stornoIsExempt / STORNO_EXEMPT_CODES) —
   тук се преизползва точно тази функция, а не втори списък.

   Ролята в теста е обикновен магазин. За admin/accounting ограничението и
   без това не важи (canBypassAgeLimit), тоест тест с админ не би доказал нищо.

   Всички случаи минават през РЕАЛЕН клик по бутона „💾 Запази", не през
   директно извикване на submitStornoForm() — иначе не се проверява, че
   бутонът наистина стига до тази проверка.

   Пускане:  node tests/storno-age-limit-exempt.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, realClick, btn, btnExact, dayOffset } = H;

/* Обикновен магазин — НЕ admin/accounting. */
const STORE_USER = {
  email: 'karlovo@temax.bg', display_name: 'Управител Карлово',
  role: 'store', store_name: 'Карлово'
};

const KAPARO  = '900001';
const VAUCHER = '900009';
const NORMAL  = '12345';

function env() {
  return boot({
    modules: ['kasa.js'],
    user: STORE_USER,
    data: {
      kasa_storno: [], kasa_storno_items: [], product_catalog: [],
      kasa_reports: [], kasa_zoborot: [], kasa_glavna: [], stores: []
    }
  });
}

/* guard() от harness-а е синхронен: async функция би му върнала промис и
   отхвърлянето нямаше да бъде хванато. Оттук и локалният вариант. */
async function guardAsync(name, fn) {
  try { await fn(); ok(name, true); return true; }
  catch (e) { ok(name, false, e && e.message); return false; }
}

function setVal(doc, id, value) {
  const el = doc.getElementById(id);
  if (!el) throw new Error('липсва поле #' + id);
  el.value = String(value);
  return el;
}

/* Отваря формата за НОВА бележка, попълва я и натиска „Запази".
   codes е списък с SAP кодове на ВЪРНАТИТЕ артикули — всеки следващ ред се
   добавя с истински клик по „+ Добави артикул", както го прави потребителят. */
async function fillAndSave(h, opts) {
  const w = h.w, doc = h.doc;
  w.kasaView = 'storno';
  w.openStornoForm();

  const codes = opts.codes;
  for (let i = 1; i < codes.length; i++) {
    realClick(w, btnExact(doc, '+ Добави артикул'), '+ Добави артикул');
  }
  codes.forEach((c, i) => setVal(doc, 'sf-ret-code-' + i, c));

  setVal(doc, 'sf-original_receipt_date', opts.origDate);
  setVal(doc, 'sf-storno_date', opts.stornoDate || w.today());
  setVal(doc, 'sf-returned_sum', opts.returnedSum === undefined ? 25 : opts.returnedSum);
  setVal(doc, 'sf-new_sum', opts.newSum === undefined ? 25 : opts.newSum);

  realClick(w, btn(doc, '💾 Запази'), '💾 Запази');
  await ticks();
}

/* Записът е станал само ако е тръгнал POST към kasa_storno. */
function saved(h) {
  return h.calls.post.some(p => p.table === 'kasa_storno');
}
/* Червеният toast за възрастта на бона. */
function ageToast(h) {
  return h.calls.toast.filter(t => t.indexOf('по-стар от 1 месец') >= 0);
}
function postedArticles(h) {
  const p = h.calls.post.find(x => x.table === 'kasa_storno');
  return p ? p.body.articles : null;
}

(async function () {

  /* ── 1. Капаро по бон отпреди 3 месеца — записва се ── */
  section('1. Бон отпреди 3 месеца + Капаро (900001)');
  {
    const h = env();
    const passed = await guardAsync('формата се записва без грешка', async () => {
      await fillAndSave(h, { origDate: dayOffset(-90), codes: [KAPARO] });
    });
    if (passed) {
      ok('POST към kasa_storno е изпратен', saved(h));
      ok('няма червен toast за възрастта на бона', ageToast(h).length === 0, ageToast(h).join(' | '));
      ok('articles съдържа 900001', postedArticles(h) === KAPARO, String(postedArticles(h)));
    }
    h.close();
  }

  /* ── 2. Ваучер по бон отпреди 3 месеца — записва се ── */
  section('2. Бон отпреди 3 месеца + Ваучер (900009)');
  {
    const h = env();
    const passed = await guardAsync('формата се записва без грешка', async () => {
      await fillAndSave(h, { origDate: dayOffset(-90), codes: [VAUCHER] });
    });
    if (passed) {
      ok('POST към kasa_storno е изпратен', saved(h));
      ok('няма червен toast за възрастта на бона', ageToast(h).length === 0, ageToast(h).join(' | '));
      ok('articles съдържа 900009', postedArticles(h) === VAUCHER, String(postedArticles(h)));
    }
    h.close();
  }

  /* ── 3. Контрола: обикновен артикул по стар бон — правилото важи ── */
  section('3. Бон отпреди 3 месеца + обикновен код (12345) — НЕ се записва');
  {
    const h = env();
    const passed = await guardAsync('кликът не хвърля', async () => {
      await fillAndSave(h, { origDate: dayOffset(-90), codes: [NORMAL] });
    });
    if (passed) {
      ok('НЯМА POST към kasa_storno', !saved(h));
      ok('излиза досегашният червен toast', ageToast(h).length === 1, h.calls.toast.join(' | '));
      ok('НЯМА POST и към kasa_storno_items',
         !h.calls.post.some(p => p.table === 'kasa_storno_items'));
    }
    h.close();
  }

  /* ── 4. Смесени редове: 900001 + 12345 — .some() пуска бележката ── */
  section('4. Бон отпреди 3 месеца + два реда (900001 и 12345)');
  {
    const h = env();
    const passed = await guardAsync('формата се записва без грешка', async () => {
      await fillAndSave(h, { origDate: dayOffset(-90), codes: [KAPARO, NORMAL] });
    });
    if (passed) {
      ok('POST към kasa_storno е изпратен', saved(h));
      ok('няма червен toast за възрастта на бона', ageToast(h).length === 0, ageToast(h).join(' | '));
      ok('articles е "900001/12345"', postedArticles(h) === KAPARO + '/' + NORMAL,
         String(postedArticles(h)));
    }
    h.close();
  }

  /* ── 5. Нормалният път: пресен бон + обикновен код ── */
  section('5. Бон отпреди 10 дни + обикновен код — записва се');
  {
    const h = env();
    const passed = await guardAsync('формата се записва без грешка', async () => {
      await fillAndSave(h, { origDate: dayOffset(-10), codes: [NORMAL] });
    });
    if (passed) {
      ok('POST към kasa_storno е изпратен', saved(h));
      ok('няма червен toast за възрастта на бона', ageToast(h).length === 0, ageToast(h).join(' | '));
    }
    h.close();
  }

  /* ── 6. Подсказката във формата казва за изключението ── */
  section('6. Подсказката под датите');
  {
    const h = env();
    if (guard('формата се рендира', () => { h.w.kasaView = 'storno'; h.w.openStornoForm(); })) {
      const txt = h.doc.getElementById('mod-kasa').textContent;
      ok('старият текст е запазен',
         txt.indexOf('Сторно не се допуска на бон по-стар от 1 месец спрямо датата на сторно') >= 0);
      ok('добавено е пояснението за Капаро/Ваучер',
         txt.indexOf('Капаро (900001) и Ваучер (900009) не подлежат на това ограничение') >= 0);
    }
    h.close();
  }

  report();
})();
