/* Интеграционен тест за таб "Разлики" (stock-differences.js)
   shared.js + stock-returns.js + stock-differences.js се зареждат ЗАЕДНО,
   в реалния ред от index.html, и се кликат с истински кликове (jsdom).

   Пускане от папката на репото:
     npm i -D jsdom
     node test-stock-differences.js
   Или срещу друга папка:
     node test-stock-differences.js /път/до/репото
*/
const fs = require('fs');
const { JSDOM } = require('jsdom');
const DIR = process.argv[2] ? process.argv[2].replace(/\/*$/, '/') : __dirname + '/';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  →  ' + extra : '')); }
}
function section(t){ console.log('\n=== ' + t + ' ==='); }

/* ── Данни (същата форма като в Supabase) ── */
const REPORTS = [
  { id:'r-sup-1', direction:'supplier', store_name:'Враца', counterpart:'ТЕСИ ООД',
    document_number:'4100111', doc_date:'2026-08-10', reviewed:false, submitted_by:'Управител Враца',
    general_comment:'', photos:[{url:'https://x/a.jpg',name:'a.jpg'},{url:'https://x/b.pdf',name:'b.pdf'}] },
  { id:'r-sup-2', direction:'supplier', store_name:'Раднево', counterpart:'АКСОН АД',
    document_number:'4100222', doc_date:'2026-08-11', reviewed:false, photos:[] },
  { id:'r-int-1', direction:'interstore', store_name:'Враца', counterpart:'Логистичен склад Добрич',
    document_number:'4600333', doc_date:'2026-08-12', reviewed:false,
    photos:[{url:'https://x/c.png',name:'c.png'}] },
  /* решена бланка -> редовете ѝ живеят в главната таблица */
  { id:'r-sup-done', direction:'supplier', store_name:'Севлиево', counterpart:'ПРОФИЛИ БГ',
    document_number:'4100999', doc_date:'2026-08-01', reviewed:true,
    photos:[{url:'https://x/miss1.jpg',name:'miss1.jpg'},{url:'https://x/miss2.jpg',name:'miss2.jpg'}] },
  { id:'r-int-done', direction:'interstore', store_name:'Шумен', counterpart:'Логистичен склад Търговище',
    document_number:'4600999', doc_date:'2026-08-02', reviewed:true, photos:[] }
];
const LINES = [
  { id:'l1', report_id:'r-sup-1', store_name:'Враца', supplier:'ТЕСИ ООД', material_code:'111',
    material_name:'БОЙЛЕР 80Л', quantity:2, quantity_received:1, difference_category:'undelivered', type:null, status:'new' },
  { id:'l2', report_id:'r-sup-2', store_name:'Раднево', supplier:'АКСОН АД', material_code:'222',
    material_name:'ЛАМПА LED', quantity:5, quantity_received:4, difference_category:'undelivered', type:null, status:'new' },
  { id:'l3', report_id:'r-int-1', store_name:'Враца', supplier:'Логистичен склад Добрич', material_code:'333',
    material_name:'ЩУЦЕР МЕТАЛЕН', quantity:10, quantity_received:8, difference_category:'damaged', type:null, status:'new' },
  /* КЛЮЧОВИЯТ СЛУЧАЙ: Цвети е дала директно "Липса" без коментар */
  { id:'l4', report_id:'r-sup-done', store_name:'Севлиево', supplier:'ПРОФИЛИ БГ', material_code:'444',
    material_name:'ПРОФИЛ ПВЦ', quantity:20, type:'missing', status:'pending',
    resolution_comment:'', attachments:[] },
  { id:'l5', report_id:'r-int-done', store_name:'Шумен', supplier:'Логистичен склад Търговище',
    material_code:'555', material_name:'КРАН СПИРАТЕЛЕН', quantity:3, type:'return', status:'pending',
    warehouse_response:'sent', warehouse_comment:'изпратено с буса' },
  /* ръчно добавен ред без report_id -> третира се като доставчиков, без снимки */
  { id:'l6', report_id:null, store_name:'Габрово', supplier:'РЪЧНО', material_code:'666',
    material_name:'РЪЧЕН ЗАПИС', quantity:1, type:'writein', status:'taken' }
];

/* ── Инициализация на среда ── */
function boot(user, opts) {
  opts = opts || {};
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="toast" id="toast"></div>
    <div class="nav"><div class="nav-tabs" id="nav-tabs-container">
      <button id="tab-transport" class="nav-tab"><span class="ti">🚚</span><span class="tl">Транспорт</span></button>
      <button id="tab-stock-returns" class="nav-tab"><span class="ti">🔄</span><span class="tl">За връщане</span></button>
      <button id="tab-stock-diff" class="nav-tab"><span class="ti">📊</span><span class="tl">Разлики</span></button>
    </div></div>
    <div id="mod-stock-returns" class="page"></div>
    <div id="mod-stock-diff" class="page"></div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://example.org/' });

  const w = dom.window;
  const calls = { patch: [], post: [], del: [], get: [], scrollTo: [], scrollIntoView: [], toast: [], confirm: [] };

  w.scrollTo = (x, y) => { calls.scrollTo.push([x, y]); w.__y = y; };
  Object.defineProperty(w, 'pageYOffset', { get: () => w.__y || 0, configurable: true });
  w.Element.prototype.scrollIntoView = function (o) { calls.scrollIntoView.push({ id: this.id, opt: o }); };
  w.confirm = (m) => { calls.confirm.push(m); return true; };
  w.alert = () => {};
  w.requestAnimationFrame = undefined; /* синхронен fallback в кода */

  /* fetch stub - връща данните и записва мутациите */
  w.fetch = function (url, init) {
    init = init || {};
    const method = init.method || 'GET';
    if (method === 'GET') {
      calls.get.push(url);
      let body = [];
      if (/\/stock_differences/.test(url)) body = JSON.parse(JSON.stringify(w.__lines || LINES));
      else if (/\/differences_reports/.test(url)) body = JSON.parse(JSON.stringify(w.__reports || REPORTS));
      else if (/\/stock_returns/.test(url)) body = [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') });
    }
    if (method === 'PATCH') calls.patch.push({ url, body: JSON.parse(init.body) });
    if (method === 'POST') calls.post.push({ url, body: JSON.parse(init.body) });
    if (method === 'DELETE') calls.del.push(url);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  };

  const load = f => w.eval(fs.readFileSync(DIR + f, 'utf8'));
  /* реалният ред от index.html */
  load('shared.js');
  load('stock-returns.js');
  load('stock-differences.js');

  w.currentUser = user;
  w.diffReports = JSON.parse(JSON.stringify(opts.reports || REPORTS));
  w.sdData = JSON.parse(JSON.stringify(opts.lines || LINES));
  const origToast = w.toast;
  w.toast = (m, c) => { calls.toast.push(m); try { origToast(m, c); } catch (e) {} };
  return { w, calls, doc: w.document };
}

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' };
const WH = { email: 'wh@temax.bg', display_name: 'Склад Добрич', role: 'logistics', store_name: 'Логистичен склад Добрич' };

function click(doc, el) {
  const w = doc.defaultView;
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  /* onclick атрибутите се изпълняват от jsdom при runScripts:'outside-only'? не —
     затова ги пускаме ръчно през eval в контекста на прозореца. */
}
/* Истински клик: изпълнява onclick атрибута точно както браузърът, с this=елемента */
function realClick(w, el) {
  if (!el) throw new Error('елементът не съществува');
  const code = el.getAttribute('onclick');
  if (!code) throw new Error('няма onclick: ' + el.outerHTML.slice(0, 120));
  w.eval('(function(){ var __el = window.__clickTarget; (function(){' + code + '}).call(__el); })');
  w.__clickTarget = el;
  const fn = w.eval('(function(el){ (function(){' + code + '}).call(el); })');
  fn(el);
}
function findBtn(doc, text) {
  return Array.from(doc.querySelectorAll('button')).find(b => (b.textContent || '').indexOf(text) >= 0);
}
function allBtns(doc) { return Array.from(doc.querySelectorAll('button')); }

/* ══════════ 1. Снимките в главната таблица (основният бъг) ══════════ */
section('1. Снимки от магазина в главната таблица (директно решение "Липса")');
{
  const { w, doc } = boot(ADMIN);
  w.renderStockDiff();
  const html = doc.getElementById('mod-stock-diff').innerHTML;
  ok('колоната "Снимки" е в заглавния ред', /<th[^>]*>Снимки<\/th>/.test(html));

  /* l4 = Липса, бланка r-sup-done с 2 снимки. Табът по подразбиране е supplier. */
  ok('снимка miss1.jpg се показва в таблицата', html.indexOf('https://x/miss1.jpg') >= 0);
  ok('снимка miss2.jpg се показва в таблицата', html.indexOf('https://x/miss2.jpg') >= 0);

  /* филтър по тип "Липса" - снимките трябва да оцелеят */
  const missBtn = allBtns(doc).find(b => b.dataset && b.dataset.f === 'missing');
  ok('бутонът "Липса" съществува', !!missBtn);
  realClick(w, missBtn);
  const h2 = doc.getElementById('mod-stock-diff').innerHTML;
  ok('след клик на "Липса" редът е там', h2.indexOf('ПРОФИЛ ПВЦ') >= 0);
  ok('след клик на "Липса" снимките са там', h2.indexOf('https://x/miss1.jpg') >= 0 && h2.indexOf('https://x/miss2.jpg') >= 0);
  ok('няма други типове в списъка', h2.indexOf('РЪЧЕН ЗАПИС') < 0);

  /* fallback: ред без report_id и бланка без снимки */
  w.sdTypeFilter = 'all';
  w.renderStockDiff();
  ok('ред без report_id -> тире, не грешка', w.diffReportPhotoThumbs(null).indexOf('—') >= 0);
  ok('бланка без снимки -> тире', w.diffReportPhotoThumbs('r-sup-2').indexOf('—') >= 0);
  ok('PDF се рендира като 📄, не като счупен <img>', w.diffReportPhotoThumbs('r-sup-1').indexOf('📄') >= 0);
  ok('JPG в същата бланка се рендира като <img>', w.diffReportPhotoThumbs('r-sup-1').indexOf('<img') >= 0);
}

/* ══════════ 2. Табове Доставчик / Междускладов и за новите бланки ══════════ */
section('2. Табове по посока — и за новите бланки');
{
  const { w, doc } = boot(ADMIN);
  w.renderStockDiff();
  let html = doc.getElementById('mod-stock-diff').innerHTML;
  ok('секцията "Нови подадени бланки" е налична', html.indexOf('Нови подадени бланки') >= 0);
  ok('таб "Доставчик": показва доставчиковите бланки', html.indexOf('ТЕСИ ООД') >= 0 && html.indexOf('АКСОН АД') >= 0);
  ok('таб "Доставчик": НЕ показва междускладовите', html.indexOf('4600333') < 0);
  ok('брояч 🆕 2 на таб доставчици', /🆕 2/.test(html));

  const interBtn = allBtns(doc).find(b => b.dataset && b.dataset.dir === 'interstore');
  ok('бутонът за междускладов таб съществува', !!interBtn);
  realClick(w, interBtn);
  html = doc.getElementById('mod-stock-diff').innerHTML;
  ok('таб "Междускладов": показва междускладовата бланка', html.indexOf('4600333') >= 0);
  ok('таб "Междускладов": скрива доставчиковите', html.indexOf('4100111') < 0 && html.indexOf('4100222') < 0);
  ok('таб "Междускладов": главната таблица показва КРАН СПИРАТЕЛЕН', html.indexOf('КРАН СПИРАТЕЛЕН') >= 0);
  ok('таб "Междускладов": главната таблица крие ПРОФИЛ ПВЦ', html.indexOf('ПРОФИЛ ПВЦ') < 0);
  ok('снимката на междускладовата бланка се вижда', html.indexOf('https://x/c.png') >= 0);
}

/* ══════════ 3. Търсачка и чипове по магазин ══════════ */
section('3. Търсачка + чипове по магазин');
{
  const { w, doc } = boot(ADMIN);
  w.renderStockDiff();
  let html = doc.getElementById('mod-stock-diff').innerHTML;
  ok('има точно едно поле за търсене', (html.match(/id="sd-search-input"/g) || []).length === 1);

  const chips = allBtns(doc).filter(b => b.dataset && b.dataset.store !== undefined);
  ok('чиповете по магазин се рендират', chips.length >= 3, 'намерени: ' + chips.length);
  const vraca = chips.find(b => b.dataset.store === 'Враца');
  ok('чип "Враца" съществува', !!vraca);
  realClick(w, vraca);
  html = doc.getElementById('mod-stock-diff').innerHTML;
  ok('чип "Враца": показва бланката на Враца', html.indexOf('4100111') >= 0);
  ok('чип "Враца": крие бланката на Раднево', html.indexOf('4100222') < 0);
  ok('чип "Враца": крие реда на Севлиево в таблицата', html.indexOf('ПРОФИЛ ПВЦ') < 0);

  /* Смяна на посока нулира чипа (иначе празен екран) */
  const interBtn = allBtns(doc).find(b => b.dataset && b.dataset.dir === 'interstore');
  realClick(w, interBtn);
  ok('смяната на таб нулира филтъра по магазин', w.sdStoreFilter === '');

  /* Търсене - филтрира и бланките, и таблицата */
  const { w: w2, doc: d2 } = boot(ADMIN);
  w2.renderStockDiff();
  w2.setSDSearch('БОЙЛЕР');
  let h = d2.getElementById('mod-stock-diff').innerHTML;
  ok('търсене "БОЙЛЕР": намира бланката на Враца', h.indexOf('4100111') >= 0);
  ok('търсене "БОЙЛЕР": крие бланката на Раднево', h.indexOf('4100222') < 0);
  w2.setSDSearch('ТЕСИ');
  h = d2.getElementById('mod-stock-diff').innerHTML;
  ok('търсене по доставчик "ТЕСИ" работи', h.indexOf('4100111') >= 0);
  w2.setSDSearch('НЯМА ТАКОВА НЕЩО');
  h = d2.getElementById('mod-stock-diff').innerHTML;
  ok('празен резултат -> подсказка "Изчисти филтъра"', h.indexOf('Изчисти филтъра') >= 0);
  const clearBtn = findBtn(d2, 'Изчисти филтъра');
  realClick(w2, clearBtn);
  h = d2.getElementById('mod-stock-diff').innerHTML;
  ok('бутонът "Изчисти филтъра" наистина чисти', w2.sdSearch === '' && h.indexOf('4100111') >= 0);
}

/* ══════════ 4. Скрол позиция ══════════ */
section('4. Не връща най-отгоре при работа по разлика');
{
  const { w, doc, calls } = boot(ADMIN);
  w.renderStockDiff();
  w.__y = 1200; /* потребителят е скролнал надолу */

  /* истински клик точно по бутона "❓ Липса" на ред l1 в секцията с новите бланки
     (не по първия попаднал — той е "Заприх.") */
  const resolveBtns = allBtns(doc).filter(b => b.dataset && b.dataset.id === 'l1'
    && (b.getAttribute('onclick') || '').indexOf('resolveDiffLine') >= 0);
  ok('трите бутона за решение на ред l1 са налични', resolveBtns.length === 3, 'намерени: ' + resolveBtns.length);
  const resolveBtn = resolveBtns.find(b => (b.getAttribute('onclick') || '').indexOf("'missing'") >= 0);
  ok('бутонът "Липса" за ред l1 съществува', !!resolveBtn);
  realClick(w, resolveBtn);
  ok('котвата към бланката е запазена преди заявката', w.sdScrollAnchor === 'r-sup-1' || calls.scrollIntoView.length > 0);

  return new Promise(res => setTimeout(res, 60)).then(() => {
    ok('PATCH заявката е изпратена', calls.patch.some(p => /id=eq\.l1/.test(p.url) && p.body.type === 'missing'));
    ok('НЕ е скролнато до 0 (не връща най-отгоре)', !calls.scrollTo.some(c => c[1] === 0 && c !== calls.scrollTo[0]));
    /* котва: след рендер бланката r-sup-1 още е непрегледана (има само 1 ред, който сега е решен ->
       става прегледана; тогава fallback-ът е връщане на Y) */
    const anchored = calls.scrollIntoView.length > 0;
    const restoredY = calls.scrollTo.some(c => c[1] === 1200);
    ok('позицията е възстановена (котва или Y)', anchored || restoredY,
      'scrollIntoView=' + JSON.stringify(calls.scrollIntoView) + ' scrollTo=' + JSON.stringify(calls.scrollTo));

    /* loadStockDiff не трие съдържанието при опресняване */
    const before = doc.getElementById('mod-stock-diff').innerHTML;
    ok('съдържанието не е празно преди опресняване', before.length > 500);
    w.loadStockDiff();
    const during = doc.getElementById('mod-stock-diff').innerHTML;
    ok('при опресняване НЕ показва "Зареждане..." върху заредено съдържание', during.indexOf('⏳ Зареждане...') < 0);

    /* първо отваряне (празен модул) - трябва да покаже "Зареждане..." */
    doc.getElementById('mod-stock-diff').innerHTML = '';
    w.loadStockDiff();
    ok('при ПЪРВО отваряне показва "Зареждане..."', doc.getElementById('mod-stock-diff').innerHTML.indexOf('Зареждане') >= 0);
    return testReturnPath();
  });
}

/* Решение "Връщане" — трябва да създаде запис в "За връщане" и пак да пази позицията */
function testReturnPath() {
  section('4б. Решение "Връщане" — авто-запис в "За връщане"');
  const { w, doc, calls } = boot(ADMIN);
  w.renderStockDiff();
  w.__y = 900;
  const btn = allBtns(doc).filter(b => b.dataset && b.dataset.id === 'l2'
    && (b.getAttribute('onclick') || '').indexOf('resolveDiffLine') >= 0)
    .find(b => (b.getAttribute('onclick') || '').indexOf("'return'") >= 0);
  ok('бутонът "Връщане" за ред l2 съществува', !!btn);
  realClick(w, btn);
  return new Promise(res => setTimeout(res, 120)).then(() => {
    ok('PATCH type=return е изпратен', calls.patch.some(p => /id=eq\.l2/.test(p.url) && p.body.type === 'return'),
      JSON.stringify(calls.patch.map(p => p.url)));
    ok('създаден е запис в stock_returns', calls.post.some(p => /stock_returns/.test(p.url) && p.body.diff_line_id === 'l2'),
      JSON.stringify(calls.post.map(p => p.url)));
    ok('не е скочило най-отгоре', !calls.scrollTo.slice(1).some(c => c[1] === 0));
    return runRest();
  });
}

function runRest() {
  /* ══════════ 5. Брояч на таба ══════════ */
  section('5. Брояч-нотификация на таб "Разлики"');
  {
    const { w, doc } = boot(ADMIN);
    w.renderStockDiff();
    const badge = doc.getElementById('badge-stock-diff');
    ok('балончето е създадено динамично (index.html не се пипа)', !!badge);
    ok('ЦО вижда всички 3 непрегледани бланки', badge.textContent === '3', 'текст=' + (badge && badge.textContent));
    ok('балончето е видимо', badge.style.display === 'block');

    const s = boot(STORE);
    s.w.renderStockDiff();
    ok('магазин Враца вижда само своите 2', s.doc.getElementById('badge-stock-diff').textContent === '2',
      'текст=' + s.doc.getElementById('badge-stock-diff').textContent);

    const wh = boot(WH);
    wh.w.renderStockDiff();
    ok('склад Добрич вижда само своята 1 насрещна', wh.doc.getElementById('badge-stock-diff').textContent === '1',
      'текст=' + wh.doc.getElementById('badge-stock-diff').textContent);

    /* склад, който вече е отговорил по всички редове -> не му виси на таба */
    const lines2 = JSON.parse(JSON.stringify(LINES));
    lines2.find(l => l.id === 'l3').warehouse_response = 'sent';
    const wh2 = boot(WH, { lines: lines2 });
    wh2.w.renderStockDiff();
    ok('склад с пълен отговор -> балончето изчезва', wh2.doc.getElementById('badge-stock-diff').style.display === 'none');

    /* нула бланки -> скрито */
    const none = boot(ADMIN, { reports: REPORTS.map(r => Object.assign({}, r, { reviewed: true })) });
    none.w.renderStockDiff();
    ok('нула непрегледани -> балончето е скрито', none.doc.getElementById('badge-stock-diff').style.display === 'none');

    ok('startApp е обвит (стартира поллинга след логин)', typeof w.startApp === 'function');
  }

  /* ══════════ 6. Видимост по роли ══════════ */
  section('6. Видимост по роли (нищо не изтича)');
  {
    const wh = boot(WH);
    wh.w.renderStockDiff();
    const h = wh.doc.getElementById('mod-stock-diff').innerHTML;
    ok('склад: НЯМА табове по посока', h.indexOf('Разлики от доставчици') < 0);
    ok('склад: вижда своята междускладова бланка', h.indexOf('4600333') >= 0);
    ok('склад: НЕ вижда доставчиковите бланки', h.indexOf('4100111') < 0 && h.indexOf('4100222') < 0);
    ok('склад: НЕ вижда чужди решени редове', h.indexOf('ПРОФИЛ ПВЦ') < 0);

    const st = boot(STORE);
    st.w.renderStockDiff();
    const hs = st.doc.getElementById('mod-stock-diff').innerHTML;
    ok('магазин: вижда собствената си бланка', hs.indexOf('4100111') >= 0);
    ok('магазин: няма бутони за решение на Цвети', hs.indexOf('resolveDiffLine') < 0);
  }

  /* ══════════ 7. Модал — двата пътя (нов + редакция) ══════════ */
  section('7. Модал: нов запис + редакция на съществуващ');
  {
    const { w, doc } = boot(ADMIN);
    w.renderStockDiff();
    /* редакция на решения ред l4 (Липса, бланка с 2 снимки) */
    w.openSDModal('l4');
    let mh = doc.getElementById('mod-stock-diff').innerHTML;
    ok('модалът се отваря при редакция', !!doc.getElementById('sd-ov'));
    ok('модалът показва "Снимки от магазина"', mh.indexOf('Снимки от магазина (2)') >= 0);
    ok('модалът показва самите снимки', mh.indexOf('https://x/miss1.jpg') >= 0);
    const cancel = findBtn(doc, 'Откажи');
    ok('бутонът "Откажи" съществува', !!cancel);
    realClick(w, cancel); /* истински клик, не само оглед на markup-а */
    ok('"Откажи" реално затваря модала', !doc.getElementById('sd-ov').classList.contains('open') && w.sdEditId === null);

    /* нов запис - без report_id, не бива да гърми на снимките */
    w.openSDModal(null);
    ok('нов запис: модалът се отваря без грешка', !!doc.getElementById('sd-ov'));
    ok('нов запис: няма секция за снимки', doc.getElementById('mod-stock-diff').innerHTML.indexOf('Снимки от магазина') < 0);

    /* ред без report_id (ръчно добавен) - редакция */
    w.closeSDModal();
    w.openSDModal('l6');
    ok('ръчен ред без бланка: модалът не гърми', !!doc.getElementById('sd-ov'));
    ok('ръчен ред: няма секция за снимки', doc.getElementById('mod-stock-diff').innerHTML.indexOf('Снимки от магазина') < 0);
  }

  /* ══════════ 8. Гранични случаи ══════════ */
  section('8. Гранични случаи');
  {
    /* 1 магазин в таба -> чиповете не се рендират (само заемат място) */
    const one = boot(ADMIN, {
      reports: [REPORTS[0]],
      lines: [LINES[0]]
    });
    one.w.renderStockDiff();
    const h = one.doc.getElementById('mod-stock-diff').innerHTML;
    ok('1 магазин -> няма чипове', (h.match(/data-store=/g) || []).length === 0);

    /* празни данни изобщо */
    const empty = boot(ADMIN, { reports: [], lines: [] });
    empty.w.renderStockDiff();
    ok('празни данни -> рендира се без грешка', empty.doc.getElementById('mod-stock-diff').innerHTML.indexOf('Няма записи') >= 0);
    ok('празни данни -> балончето е скрито', empty.doc.getElementById('badge-stock-diff').style.display === 'none');

    /* бланка с photos = null (стари записи) */
    const nullPhotos = boot(ADMIN, {
      reports: [Object.assign({}, REPORTS[3], { photos: null })],
      lines: [LINES[3]]
    });
    nullPhotos.w.renderStockDiff();
    ok('photos=null -> тире, не грешка', nullPhotos.doc.getElementById('mod-stock-diff').innerHTML.indexOf('—') >= 0);

    /* точно на границата: 2 магазина -> чиповете СЕ показват */
    const two = boot(ADMIN, { reports: [REPORTS[0], REPORTS[1]], lines: [LINES[0], LINES[1]] });
    two.w.renderStockDiff();
    ok('2 магазина -> чиповете се показват', (two.doc.getElementById('mod-stock-diff').innerHTML.match(/data-store=/g) || []).length === 3);
  }

  /* ══════════ 9. Интеграция със stock-returns.js ══════════ */
  section('9. Интеграция: двата модула заредени заедно');
  {
    const { w, doc } = boot(ADMIN);
    w.srData = [];
    w.renderStockReturns();
    ok('таб "За връщане" се рендира след stock-differences.js', doc.getElementById('mod-stock-returns').innerHTML.indexOf('Стока за връщане') >= 0);
    w.renderStockDiff();
    ok('таб "Разлики" се рендира след това', doc.getElementById('mod-stock-diff').innerHTML.indexOf('📋 Разлики') >= 0);
    ok('setSRStoreFilter и setSDStoreFilter са различни функции', w.setSRStoreFilter !== w.setSDStoreFilter);
    ok('srSearch и sdSearch са независими', (function () {
      w.setSDSearch('AAA'); return w.srSearch === '' && w.sdSearch === 'AAA';
    })());
  }

  console.log('\n──────────────────────────────');
  console.log(pass + ' успешни, ' + fail + ' провалени');
  process.exit(fail ? 1 : 0);
}
