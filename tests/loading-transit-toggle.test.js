/* Товарни листи — блокът „Документи от Стока на път" зад превключвател.

   „Стока на път" е МЕСЕЧНА снимка. В редактора тя изглежда като оперативен
   списък и складът тръгва да товари по документи отпреди седмици. Докато не
   решим какво правим с нея, блокът се скрива — но не с CSS, а изцяло:
   скритият блок пак дърпа хиляди реда от goods_transit и пак поддържа
   впечатлението, че данните са налични.

   Въпросите, в които е лесно да се сбърка ТИХО, и затова са заковани тук:
     · ЗАЯВКАТА. „Блокът не се вижда" и „заявката не се прави" са различни
       твърдения; първото минава и с второто счупено;
     · безопасната посока е ИЗКЛЮЧЕНО. Липсващ ключ, празна стойност, боклук
       и паднала заявка значат едно и също — за разлика от
       reportKasaThreshold, където безопасното е стойност по подразбиране;
     · всичко останало в редактора работи и при изключен блок: десетте
       празни реда, „➕ Добави нов ред", скенерът и автодопълването. Те
       нямат нищо общо със снимката и не бива да изчезнат с нея;
     · при 'on' — точно както досега. Затова другите четири теста на
       редактора подават флага изрично.

   Пускане:  node tests/loading-transit-toggle.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';

const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };

function transitRow(doc, store, i) {
  return { id: doc + '-' + i, purchase_doc: doc, store_name: store, supplier: WH,
           doc_date: '2026-09-01', status: 'pending', position: String(i),
           material_code: '3' + i, material_name: 'АРТИКУЛ ' + i };
}
const TRANSIT = [transitRow('4600179694', 'Петрич', 1),
                 transitRow('4600179700', 'Гоце Делчев', 1)];

const USERS = [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' },
               { store_name: 'Централен офис' }, { store_name: WH }];

/* settings: масивът, който app_settings връща. undefined = празна таблица
   (липсващ ключ). fail: правило за провалена заявка (виж harness). */
function env(settings, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js'],
    user: WAREHOUSE, confirm: true,
    fail: opts.fail,
    data: {
      app_settings: settings || [],
      goods_transit: TRANSIT,
      users: USERS,
      loading_lists: [], loading_list_items: [], product_catalog: [],
      stock_differences: [], differences_reports: [], stock_returns: [],
      stores: [], contacts: [], transport_orders: []
    }
  });
  h.w.llLists = []; h.w.llItems = []; h.w.llView = 'list';
  h.w.llCurrentId = null; h.w.llDraft = null; h.w.llPendingDocs = [];
  h.w.llStores = []; h.w.llIncompleteSaves = {};
  h.w.invalidateStoreCaches();
  return h;
}

const mod = doc => doc.getElementById('mod-loading');
/* Заявките към goods_transit — СЪРЦЕВИНАТА. Блокът може да е скрит и
   заявката пак да тръгва; тогава скриването не е свършило работа. */
const transitGets = h => h.calls.get.filter(u => /goods_transit/.test(u));
const settingsGets = h => h.calls.get.filter(u => /app_settings/.test(u));

/* Отваря редактора за нов лист и изчаква зареждането. */
async function openEditor(h) {
  h.w.llNewList();
  await ticks(); await ticks(); await ticks();
  return mod(h.doc);
}

(async function () {

  section('а) Липсващ ключ → блокът го няма и заявката НЕ се прави');
  {
    const h = env([]);
    const wrap = await openEditor(h);
    ok('редакторът се отвори', wrap.textContent.indexOf('Нов товарен лист') >= 0,
      wrap.textContent.slice(0, 160));
    ok('блокът „Документи от Стока на път" го няма',
      wrap.textContent.indexOf('Документи от Стока на път') < 0,
      wrap.textContent.slice(0, 400));
    ok('НУЛА заявки към goods_transit', transitGets(h).length === 0,
      JSON.stringify(transitGets(h)));
    ok('но ключът Е прочетен', settingsGets(h).length === 1,
      JSON.stringify(settingsGets(h)));
    ok('и то точно loading_transit_docs',
      settingsGets(h).every(u => /key=eq\.loading_transit_docs/.test(u)),
      JSON.stringify(settingsGets(h)));
    ok('llTransitDocsOn е false', h.w.llTransitDocsOn === false,
      String(h.w.llTransitDocsOn));
    ok('llPendingDocs е празен', h.w.llPendingDocs.length === 0,
      JSON.stringify(h.w.llPendingDocs.length));
  }

  section('б) Останалото в редактора работи и при изключен блок');
  {
    const h = env([]);
    const wrap = await openEditor(h);
    /* Десетте празни реда (Пакет Г1) нямат нищо общо със снимката. */
    ok('десетте празни реда си стоят', h.w.llDraft.items.length === 10,
      String(h.w.llDraft.items.length));
    ok('заглавието „📦 Редове (10)" е там',
      wrap.textContent.indexOf('Редове (10)') >= 0, wrap.textContent.slice(0, 500));
    ok('„➕ Добави нов ред" е там', !!btn(wrap, '➕ Добави нов ред'));
    ok('обектите са заредени', h.w.llStores.length > 0, String(h.w.llStores.length));
    /* Блокът за артикули (Пакет В1) — скенерът и полетата. */
    h.w.llToggleProducts(0);
    await ticks();
    ok('блокът за артикули се разгъва', !!btn(mod(h.doc), '📷 Сканирай'));
    ok('и полето за SAP код е там', !!h.doc.getElementById('ll-pf-sap-0'));
    /* „↺ Отново от Стока на път" се показва само при документ НА РЕДА —
       при изключена снимка не бива да се появява дори тогава. */
    h.w.llSetRowField(0, 'purchase_doc', '4600179694');
    h.w.renderLoadingLists();
    ok('формата за артикули Е отворена — отрицанието долу е носещо',
      !!btn(mod(h.doc), '📷 Сканирай'));
    ok('„↺ Отново от Стока на път" го няма',
      !btn(mod(h.doc), '↺ Отново от Стока на път'),
      mod(h.doc).textContent.slice(0, 300));
    ok('и пак нула заявки към goods_transit', transitGets(h).length === 0,
      JSON.stringify(transitGets(h)));
  }

  section('в) Стойност „on" → точно както досега');
  {
    const h = env([{ key: 'loading_transit_docs', value: 'on' }]);
    const wrap = await openEditor(h);
    ok('блокът е там', wrap.textContent.indexOf('Документи от Стока на път') >= 0,
      wrap.textContent.slice(0, 400));
    ok('llTransitDocsOn е true', h.w.llTransitDocsOn === true);
    ok('заявката към goods_transit Е направена', transitGets(h).length === 1,
      JSON.stringify(transitGets(h)));
    ok('документите са групирани — 2', h.w.llPendingDocs.length === 2,
      String(h.w.llPendingDocs.length));
    ok('и се виждат в таблицата', wrap.innerHTML.indexOf('4600179694') >= 0,
      wrap.textContent.slice(0, 500));
    ok('има чекбокс за отмятане', !!wrap.querySelector('tr[data-ll-doc="0"] input[type=checkbox]'));

    h.w.llSetRowField(0, 'purchase_doc', '4600179694');
    h.w.llToggleProducts(0);
    await ticks();
    ok('„↺ Отново от Стока на път" се показва',
      !!btn(mod(h.doc), '↺ Отново от Стока на път'),
      mod(h.doc).textContent.slice(0, 300));
  }

  section('г) Всяка друга стойност значи ИЗКЛЮЧЕНО');
  {
    const cases = [
      ['изрично „off"', 'off'],
      ['празен низ', ''],
      ['боклук', 'да'],
      ['„true" не е „on"', 'true'],
      ['„1" не е „on"', '1']
    ];
    for (const [name, value] of cases) {
      const h = env([{ key: 'loading_transit_docs', value: value }]);
      const wrap = await openEditor(h);
      ok(name + ' → няма блок',
        wrap.textContent.indexOf('Документи от Стока на път') < 0 &&
        transitGets(h).length === 0,
        'блок=' + (wrap.textContent.indexOf('Документи от Стока на път') >= 0) +
        ' заявки=' + transitGets(h).length);
      h.close();
    }
    /* „ON" с главни букви и с празни места е ЧОВЕШКИ въведена стойност —
       ключът се пипа от SQL Editor на ръка. */
    const h2 = env([{ key: 'loading_transit_docs', value: '  ON  ' }]);
    const w2 = await openEditor(h2);
    ok('„  ON  " (главни букви и празни места) → ВКЛЮЧЕНО',
      w2.textContent.indexOf('Документи от Стока на път') >= 0,
      w2.textContent.slice(0, 300));
  }

  section('д) Паднала заявка към app_settings → изключено, редакторът работи');
  {
    const h = env([{ key: 'loading_transit_docs', value: 'on' }],
                  { fail: { GET: /app_settings/ } });
    const wrap = await openEditor(h);
    ok('блокът го няма', wrap.textContent.indexOf('Документи от Стока на път') < 0,
      wrap.textContent.slice(0, 400));
    ok('нула заявки към goods_transit', transitGets(h).length === 0,
      JSON.stringify(transitGets(h)));
    /* Провалът на ключа НЕ бива да събаря редактора: листът се пише и без
       снимката, а складът не бива да остане пред празен екран. */
    ok('редакторът пак се рендира', wrap.textContent.indexOf('Нов товарен лист') >= 0,
      wrap.textContent.slice(0, 200));
    ok('десетте реда са там', h.w.llDraft.items.length === 10,
      String(h.w.llDraft.items.length));
    ok('обектите са заредени', h.w.llStores.length > 0, String(h.w.llStores.length));
  }

  section('д2) sbGet ОТХВЪРЛЯ (мрежа) → пак изключено');
  {
    /* Две различни неща под едно име. sbGet НИКОГА не отхвърля — при HTTP
       грешка резолвва с [], и точно това проверява сценарий „д". Остава
       вторият път: самата обвивка да гръмне (мрежата пада под нея). Без
       този сценарий .catch-ът в llLoadTransitFlag е непокрит код и може да
       върне ВКЛЮЧЕНО, без нищо да се обади. Образецът е pallets-export. */
    const h = env([{ key: 'loading_transit_docs', value: 'on' }]);
    const real = h.w.sbGet;
    h.w.sbGet = function (t, q, s2) {
      return /app_settings/.test(t) ? Promise.reject(new Error('мрежа')) : real(t, q, s2);
    };
    const wrap = await openEditor(h);
    ok('блокът го няма', wrap.textContent.indexOf('Документи от Стока на път') < 0,
      wrap.textContent.slice(0, 400));
    ok('llTransitDocsOn е false', h.w.llTransitDocsOn === false,
      String(h.w.llTransitDocsOn));
    ok('нула заявки към goods_transit', transitGets(h).length === 0,
      JSON.stringify(transitGets(h)));
    ok('редакторът пак се рендира', wrap.textContent.indexOf('Нов товарен лист') >= 0,
      wrap.textContent.slice(0, 200));
    ok('десетте реда са там', h.w.llDraft.items.length === 10,
      String(h.w.llDraft.items.length));
  }

  section('е) Паднала заявка към goods_transit при ВКЛЮЧЕН блок — както досега');
  {
    const h = env([{ key: 'loading_transit_docs', value: 'on' }],
                  { fail: { GET: /goods_transit/ } });
    const wrap = await openEditor(h);
    /* Старото поведение: блокът СЕ показва с червено обяснение. Това е
       различно от изключен блок и не бива да се слее с него. */
    ok('блокът се показва', wrap.textContent.indexOf('Документи от Стока на път') >= 0,
      wrap.textContent.slice(0, 300));
    ok('с маркера за провалена снимка',
      !!wrap.querySelector('[data-ll-transit-error="1"]'),
      wrap.textContent.slice(0, 400));
  }

  report();
})();
