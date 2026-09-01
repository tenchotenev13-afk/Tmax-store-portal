/* Сторно вече НЯМА ограничение за възрастта на бона.

   До 01.09.2026 submitStornoForm() отказваше сторно по бон, по-стар от един
   календарен месец от датата на сторното (stornoExceedsOneMonth), освен за
   admin/accounting и за Капаро/Ваучер. Рекламациите обаче на практика ВИНАГИ
   идват с бон отпреди повече от месец, тоест правилото блокираше легитимна
   работа в магазините. Проверката, функцията и подсказката под датите са
   премахнати.

   Ролята в теста е обикновен магазин — НЕ admin/accounting. Само за нея
   ограничението изобщо е важало, тоест само с нея тестът доказва нещо.

   Всички случаи минават през РЕАЛЕН клик по бутона „💾 Запази", не през
   директно извикване на submitStornoForm() — иначе не се проверява, че
   бутонът наистина стига до записа.

   stornoIsExempt() / STORNO_EXEMPT_CODES НЕ са пипани — те обслужват
   индикатора „нова сума ≥ върната сума" и нямат общо с възрастта на бона.

   Пускане:  node tests/storno-no-age-limit.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, realClick, btn, btnExact, dayOffset } = H;

/* Обикновен магазин — НЕ admin/accounting. */
const STORE_USER = {
  email: 'karlovo@temax.bg', display_name: 'Управител Карлово',
  role: 'store', store_name: 'Карлово'
};

const KAPARO = '900001';
const NORMAL = '12345';

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
/* Отпадналият червен toast за възрастта на бона. */
function ageToast(h) {
  return h.calls.toast.filter(t => t.indexOf('по-стар от 1 месец') >= 0);
}
function postedArticles(h) {
  const p = h.calls.post.find(x => x.table === 'kasa_storno');
  return p ? p.body.articles : null;
}

(async function () {

  /* ── 1. Бон отпреди 3 месеца + обикновен код — записва се ── */
  section('1. Бон отпреди 3 месеца + обикновен код (12345)');
  {
    const h = env();
    const passed = await guardAsync('формата се записва без грешка', async () => {
      await fillAndSave(h, { origDate: dayOffset(-90), codes: [NORMAL] });
    });
    if (passed) {
      ok('POST към kasa_storno е изпратен', saved(h));
      ok('НЯМА червен toast за възрастта на бона', ageToast(h).length === 0, h.calls.toast.join(' | '));
      ok('articles съдържа 12345', postedArticles(h) === NORMAL, String(postedArticles(h)));
    }
    h.close();
  }

  /* ── 2. Бон отпреди 14 месеца — записва се (прескача се и година) ── */
  section('2. Бон отпреди 14 месеца + обикновен код (12345)');
  {
    const h = env();
    const passed = await guardAsync('формата се записва без грешка', async () => {
      await fillAndSave(h, { origDate: dayOffset(-425), codes: [NORMAL] });
    });
    if (passed) {
      ok('POST към kasa_storno е изпратен', saved(h));
      ok('НЯМА червен toast за възрастта на бона', ageToast(h).length === 0, h.calls.toast.join(' | '));
    }
    h.close();
  }

  /* ── 3. Бон отпреди 3 месеца + Капаро — записва се (както и преди) ── */
  section('3. Бон отпреди 3 месеца + Капаро (900001)');
  {
    const h = env();
    const passed = await guardAsync('формата се записва без грешка', async () => {
      await fillAndSave(h, { origDate: dayOffset(-90), codes: [KAPARO] });
    });
    if (passed) {
      ok('POST към kasa_storno е изпратен', saved(h));
      ok('НЯМА червен toast за възрастта на бона', ageToast(h).length === 0, h.calls.toast.join(' | '));
      ok('articles съдържа 900001', postedArticles(h) === KAPARO, String(postedArticles(h)));
    }
    h.close();
  }

  /* ── 4. Контрола: пресен бон — нормалният път не е счупен ── */
  section('4. Бон от вчера + обикновен код (12345)');
  {
    const h = env();
    const passed = await guardAsync('формата се записва без грешка', async () => {
      await fillAndSave(h, { origDate: dayOffset(-1), codes: [NORMAL] });
    });
    if (passed) {
      ok('POST към kasa_storno е изпратен', saved(h));
      ok('НЯМА червен toast за възрастта на бона', ageToast(h).length === 0, h.calls.toast.join(' | '));
    }
    h.close();
  }

  /* ── 5. Подсказката под датите вече не говори за ограничение ── */
  section('5. Подсказката под датите');
  {
    const h = env();
    if (guard('формата се рендира', () => { h.w.kasaView = 'storno'; h.w.openStornoForm(); })) {
      const txt = h.doc.getElementById('mod-kasa').textContent;
      ok('текстът за „по-стар от 1 месец" го няма', txt.indexOf('по-стар от 1 месец') < 0);
      ok('полето „Дата на сторно" си стои', !!h.doc.getElementById('sf-storno_date'));
      ok('полето „Дата на оригинален касов бон" си стои',
         !!h.doc.getElementById('sf-original_receipt_date'));
    }
    h.close();
  }

  report();
})();
