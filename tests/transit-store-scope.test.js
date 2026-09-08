/* „Стока на път": обхватът на обект се определя от ТОЧЕН подател, не от ilike.

   Филтърът беше `supplier.ilike.*<обект>*`, тоест ловеше всеки доставчик, в
   чието име се съдържа името на обекта. Реалните последствия (проверени в
   базата на 08.09.2026):

     Търговище   1710 реда вместо 91 (68 свои + 23 изпратени трансфера)
                 — заради доставчик „Логистичен склад Търговище"
     Добрич       520 реда вместо 110 — по същата причина
     Троян        182 вместо 179 — виждаше три ЧУЖДИ доставки (на Карлово,
                 Козлодуй и Търговище) само защото подателят е „Сервиз Троян"

   Новият филтър е `or=(store_name.eq.X, and(direction.eq.transfer,
   supplier.eq.X))`: своите редове плюс трансферите, изпратени от самия обект.
   PostgREST приема and() вътре в or() — проверено по HTTP срещу живата база,
   не само със SQL: заявката върна 206 и Content-Range 0-0/91.

   Складовите профили не минават оттук: role 'logistics' е вътре в isGlobal(),
   тоест за тях storeFilter остава празен и обхватът им не се променя.

   Пускане:  node tests/transit-store-scope.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard } = H;

/* loadTransit не минава през sbGet — вика fetch направо и чете
   content-range от заглавните редове, каквото harness-ът не дава. Затова
   собствен стъб: записва URL-ите и връща празна страница. */
function stubFetch(w) {
  const urls = [];
  w.fetch = function (url) {
    urls.push(String(url));
    return Promise.resolve({
      ok: true, status: 206,
      headers: { get: function (h) { return /content-range/i.test(h) ? '0-0/0' : null; } },
      json: function () { return Promise.resolve([]); },
      text: function () { return Promise.resolve('[]'); }
    });
  };
  return urls;
}

function env(user) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'transit.js'],
    user: user,
    data: { goods_transit: [], stores: [], users: [] }
  });
  h.urls = stubFetch(h.w);
  h.w.transitData = [];
  return h;
}

/* URL-ът на заявката към goods_transit — другите (напр. stores) не ни трябват. */
const transitUrl = urls => urls.filter(u => /goods_transit/.test(u))[0] || '';

const MANAGER = {
  email: 'targovishte@temax.bg', display_name: 'Управител Търговище',
  role: 'manager', store_name: 'Търговище'
};
const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис'
};
const SKLAD = {
  email: 'ls.targovishte@temax.bg', display_name: 'Логистичен склад Търговище',
  role: 'logistics', store_name: 'Логистичен склад Търговище'
};

(async function run() {

  section('а) Потребител-магазин: точен подател, само за трансфери');
  {
    const h = env(MANAGER);
    if (guard('loadTransit() не хвърля', () => h.w.loadTransit())) {
      const url = transitUrl(h.urls);
      if (ok('има заявка към goods_transit', !!url, h.urls.join(' | '))) {
        const T = encodeURIComponent('Търговище');

        ok('обектът вижда своите редове',
          url.indexOf('store_name.eq.' + T) >= 0, url);
        ok('и трансферите, които сам е изпратил',
          url.indexOf('and(direction.eq.transfer,supplier.eq.' + T + ')') >= 0, url);
        /* Същината на поправката: ilike ловеше и „Логистичен склад Търговище". */
        ok('НЯМА ilike никъде в URL-а', url.indexOf('ilike') < 0, url);
        ok('НЯМА звездички от шаблона на ilike', url.indexOf('*') < 0, url);

        /* Целият or() блок, в реда, в който кодът го строи — за да не мине
           проверката при разбъркани или излишни условия. */
        ok('or() блокът е точно очакваният',
          url.indexOf('&or=(store_name.eq.' + T +
            ',and(direction.eq.transfer,supplier.eq.' + T + '))') >= 0, url);
        /* Подателят се сравнява ТОЧНО — supplier.eq., не supplier.like. */
        ok('сравнението на подателя е eq, не like',
          /supplier\.eq\./.test(url) && !/supplier\.(i?like)\./.test(url), url);
        /* Условието за трансфер е ВЪТРЕ в or(), иначе би отрязало и своите
           редове, които не са трансфери. */
        ok('direction.eq.transfer е вътре в or(), не отделен параметър',
          url.indexOf('&direction=eq.transfer') < 0 &&
          url.indexOf('and(direction.eq.transfer') >= 0, url);
      }
    }
  }

  section('б) Глобален потребител: без ограничение по обект');
  {
    const h = env(CVETI);
    if (guard('loadTransit() не хвърля', () => h.w.loadTransit())) {
      const url = transitUrl(h.urls);
      if (ok('има заявка към goods_transit', !!url, h.urls.join(' | '))) {
        ok('няма or= изобщо', url.indexOf('or=') < 0, url);
        ok('няма store_name филтър', url.indexOf('store_name') < 0, url);
        ok('подредбата си остава', url.indexOf('order=doc_date.desc') >= 0, url);
      }
    }
  }

  section('в) Складов профил е глобален — обхватът му не се променя');
  {
    /* role 'logistics' е в isGlobal(). Ако някога излезе оттам, складът
       изведнъж би паднал до собствените си редове, а той трябва да вижда
       всичко изпратено. Затова се проверява изрично тук, а не се подразбира. */
    const h = env(SKLAD);
    if (guard('loadTransit() не хвърля', () => h.w.loadTransit())) {
      const url = transitUrl(h.urls);
      ok('isGlobal() върна истина за logistics', h.w.isGlobal() === true);
      ok('няма or= за складовия профил', url.indexOf('or=') < 0, url);
    }
  }

  section('г) Кирилица и интервал в името се URL-кодират');
  {
    const h = env({
      email: 'gd@temax.bg', display_name: 'Управител Гоце Делчев',
      role: 'manager', store_name: 'Гоце Делчев'
    });
    if (guard('loadTransit() не хвърля', () => h.w.loadTransit())) {
      const url = transitUrl(h.urls);
      const GD = encodeURIComponent('Гоце Делчев');
      if (ok('има заявка към goods_transit', !!url, h.urls.join(' | '))) {
        ok('името е URL-кодирано', url.indexOf(GD) >= 0, url);
        ok('интервалът е кодиран като %20, не суров',
          GD.indexOf('%20') >= 0 && url.indexOf('Гоце Делчев') < 0, GD + ' | ' + url);
        ok('кодираното име стои и в двете места на or()',
          url.indexOf('store_name.eq.' + GD) >= 0 &&
          url.indexOf('supplier.eq.' + GD + ')') >= 0, url);
        ok('суровата кирилица не изтича в URL-а',
          !/[Ѐ-ӿ]/.test(url), url);
      }
    }
  }

  report();
})();
