/* „Стока на път": общите компоненти (.chips / .tbl-compact) и компактен ред.

   Няма stat карти; чиповете са в контейнер class="filter-bar chips" с „Покажи:",
   атрибут data-tt-f (НЕ data-f — сблъсък с Разлики), брой в .chips-n;
   подразбиране „Не доставени" (pending). Редът е 6 колони (Документ · Дата /
   От → Към / Описание / Количество / Статус / Действия); бутоните са точно
   като преди (по роля, посока и статус); жълт фон за pending над 30 дни.
   tReviewCounterHtml() дава същите числа като в стария код при същата
   фикстура (еталонът е снет от стария код преди промяната).

   Пускане: node tests/transit-compact.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, dayOffset } = H;

const WH = 'Логистичен склад Търговище';
function stubFetch(w) {
  w.fetch = function () {
    return Promise.resolve({ ok: true, status: 206,
      headers: { get: function (h) { return /content-range/i.test(h) ? '0-0/0' : null; } },
      json: function () { return Promise.resolve([]); }, text: function () { return Promise.resolve('[]'); } });
  };
}
const user = (role, store) => ({ email: role + '@temax.bg', display_name: role, role, store_name: store, assigned_stores: role === 'manager' ? [store] : [] });
function env(u, data) {
  const h = boot({ modules: ['transport.js', 'client-orders.js', 'transit.js'], user: u, data: { goods_transit: [], stores: [], users: [] } });
  stubFetch(h.w);
  h.w.requestAnimationFrame = function (f) { f(); };
  h.w.transitData = JSON.parse(JSON.stringify(data));
  h.w.transitDir = 'all'; h.w.transitFilter = 'pending';
  h.w.transitStore = ''; h.w.transitMonthFilter = ''; h.w.transitSearch = '';
  guard('renderTransit()', () => h.w.renderTransit());
  return h;
}

let id = 0;
function row(doc, o) {
  id++;
  return Object.assign({ id: 'r' + id, direction: 'incoming', status: 'pending', doc_date: dayOffset(-3), purchase_doc: doc, position: 10,
    material_code: 'M' + id, material_name: 'Артикул ' + doc, ordered_qty: 5, remaining_qty: 2, unit: 'бр', transfer_date: null,
    comment: '', store_name: 'Кърджали', supplier: WH }, o);
}
const DATA = [
  row('INC-OLD', { doc_date: dayOffset(-45) }),
  row('INC-NEW'),
  row('TR-SEND', { direction: 'transfer', store_name: 'Шумен', supplier: 'Кърджали' }),
  row('TR-WAIT', { direction: 'transfer', store_name: 'Кърджали', supplier: 'Шумен' }),
  row('TR-RECV', { direction: 'transfer', status: 'sent', store_name: 'Кърджали', supplier: 'Шумен', transfer_date: dayOffset(-1) }),
  row('INC-REC', { status: 'received' }),
  row('INC-REJ', { status: 'rejected' }),
  row('INC-LONG', { material_name: 'Много дълго описание на артикул '.repeat(8) })
];
const F = ['pending', 'sent', 'received', 'rejected', 'all'];
const WANT = { pending: 5, sent: 1, received: 1, rejected: 1, all: 8 };
const DOCS = {
  pending: 'INC-LONG,INC-NEW,INC-OLD,TR-SEND,TR-WAIT', sent: 'TR-RECV', received: 'INC-REC', rejected: 'INC-REJ',
  all: 'INC-LONG,INC-NEW,INC-OLD,INC-REC,INC-REJ,TR-RECV,TR-SEND,TR-WAIT'
};

const bar = h => h.w.document.getElementById('t-filters');
const chip = (h, f) => bar(h).querySelector('[data-tt-f="' + f + '"]');
const count = (h, f) => parseInt(chip(h, f).querySelector('.chips-n').textContent, 10);
const rows = h => Array.from(h.w.document.querySelectorAll('#mod-transit tbody tr'));
const docOf = tr => tr.children[0].textContent.split(' · ')[0].replace(/\s+/g, '').replace(/Поз.*$/, '');
const docs = h => rows(h).map(docOf).sort().join(',');
const rowOf = (h, doc) => rows(h).find(tr => docOf(tr) === doc);
const btns = tr => Array.from(tr.querySelectorAll('button')).map(b => b.textContent.trim()).sort();
const spans = tr => Array.from(tr.children[5].querySelectorAll('span')).map(s => s.textContent.trim());
const j = a => JSON.stringify(a);
const S = a => a.slice().sort();

(async function run() {
  section('1. без stat карти');
  {
    const h = env(user('admin', 'Централен офис'), DATA);
    ok('няма grid repeat(6,1fr)', !h.w.document.querySelector('#mod-transit div[style*="repeat(6,1fr)"]'));
    ok('таб „Всички" още е там (посока)', !!Array.from(h.w.document.querySelectorAll('#mod-transit button')).find(b => /^transitDir='all'/.test(b.getAttribute('onclick') || '')));
  }

  section('1б. празно търсене и надпис на таба „Всички"');
  {
    const h = env(user('admin', 'Централен офис'), DATA);
    const si = h.w.document.getElementById('t-search');
    ok('празно търсене → value е празен низ (не „—")', !!si && si.value === '' && si.getAttribute('value') === '', si && si.getAttribute('value'));
    const tab = Array.from(h.w.document.querySelectorAll('#mod-transit button')).find(b => /^transitDir='all'/.test(b.getAttribute('onclick') || ''));
    const sub = tab.querySelector('div').textContent.trim();
    /* броят следва активния статус-филтър (подразбиране pending → 5 реда) */
    ok('надписът на „Всички" е само броят „(5)", без „all"', sub === '(5)' && !/all/i.test(sub), sub);
    h.w.transitSearch = 'ЛАМИНАТ'; h.w.renderTransit();
    ok('с търсене value е търсеният текст', h.w.document.getElementById('t-search').value === 'ЛАМИНАТ');
  }

  section('2. чипове');
  {
    const h = env(user('admin', 'Централен офис'), DATA);
    ok('контейнерът е .filter-bar.chips', bar(h).classList.contains('chips') && bar(h).classList.contains('filter-bar'));
    ok('„Покажи:"', /Покажи:/.test(bar(h).textContent));
    ok('ред: pending, sent | received, rejected, all', j(Array.from(bar(h).querySelectorAll('button')).map(b => b.getAttribute('data-tt-f'))) === j(F));
    ok('разделител преди историческите', !!bar(h).querySelector('.chips-sep'));
    ok('received / rejected / all са .chip-hist; pending / sent — не', ['received', 'rejected', 'all'].every(f => chip(h, f).classList.contains('chip-hist')) && !chip(h, 'pending').classList.contains('chip-hist') && !chip(h, 'sent').classList.contains('chip-hist'));
    ok('няма data-f (сблъсък с Разлики)', !bar(h).querySelector('[data-f]'));
    ok('подразбиране pending, само той е активен', h.w.transitFilter === 'pending' && j(Array.from(bar(h).querySelectorAll('.active')).map(b => b.getAttribute('data-tt-f'))) === j(['pending']));
    F.forEach(f => ok('брой „' + f + '" = ' + WANT[f], count(h, f) === WANT[f], String(count(h, f))));
    ok('магазин и месец са на същия ред', !!bar(h).querySelector('select') && !!bar(h).querySelector('#t-month'));
  }

  section('3. клик на всеки чип');
  {
    for (const f of F) {
      const h = env(user('admin', 'Централен офис'), DATA);
      realClick(h.w, chip(h, f));
      ok(f + ': маркиран е само той', j(Array.from(bar(h).querySelectorAll('.active')).map(b => b.getAttribute('data-tt-f'))) === j([f]));
      ok(f + ': редовете', docs(h) === DOCS[f], docs(h));
      ok(f + ': броят = редовете', count(h, f) === rows(h).length);
    }
  }

  section('4. редът');
  {
    const h = env(user('admin', 'Централен офис'), DATA);
    realClick(h.w, chip(h, 'all'));
    ok('thead: 6 колони', j(Array.from(h.w.document.querySelectorAll('#mod-transit thead th')).map(t => t.textContent.trim())) === j(['Документ · Дата', 'От → Към', 'Описание', 'Количество', 'Статус', 'Действия']));
    ok('обвивката е .tbl-wrap.tbl-compact.tbl-tt-compact', !!h.w.document.querySelector('.tbl-wrap.tbl-compact.tbl-tt-compact table'));
    ok('всеки ред има точно 6 <td>', rows(h).length === 8 && rows(h).every(tr => tr.children.length === 6), rows(h).map(tr => tr.children.length).join(','));
    const tr = rowOf(h, 'TR-RECV');
    ok('колона 1: документ, поз., дата и бадж „Трансфер"', /TR-RECV/.test(tr.children[0].textContent) && /Поз\. 10/.test(tr.children[0].textContent) && /🔄 Трансфер/.test(tr.children[0].textContent), tr.children[0].textContent);
    ok('колона 2: Шумен → Кърджали (доставчик → магазин)', /Шумен\s*→\s*Кърджали/.test(tr.children[1].textContent), tr.children[1].textContent);
    ok('колона 4: брой, мярка, остатък и дата на трансфер', /5бр/.test(tr.children[3].textContent.replace(/\s+/g, '')) && /остатък 2/.test(tr.children[3].textContent) && tr.children[3].textContent.indexOf(h.w.fmtDate(dayOffset(-1))) >= 0, tr.children[3].textContent);
    ok('колона 5: статус „Изпратена"', /Изпратена/.test(tr.children[4].textContent));
    const lg = rowOf(h, 'INC-LONG').children[2].querySelector('div');
    ok('дългото описание се реже с … и носи title с пълното', /text-overflow:ellipsis/.test(lg.getAttribute('style')) && lg.getAttribute('title').length > 100);
    ok('няма sticky колона отдясно', !Array.from(tr.children).some(c => /position:sticky/.test(c.getAttribute('style') || '')));
    ok('INC-OLD (над 30 дни, pending): жълт фон', /background:#fffbeb/.test(rowOf(h, 'INC-OLD').getAttribute('style')));
    ok('INC-NEW: без жълт фон', !/background:#fffbeb/.test(rowOf(h, 'INC-NEW').getAttribute('style')));
    ok('TR-WAIT (трансфер): светъл оранжев фон по посока', /rgba\(194,65,12,\.04\)/.test(rowOf(h, 'TR-WAIT').getAttribute('style')));
    ok('„Показани N от M записа"', /Показани 8 от 8 записа/.test(h.w.document.querySelector('#mod-transit').textContent));
  }

  section('5. бутоните — офис (admin)');
  {
    const h = env(user('admin', 'Централен офис'), DATA);
    realClick(h.w, chip(h, 'all'));
    const inc = S(['✅ Прието', '✕ Неприето', '👁 Проверено, не е пристигнало', '✏️ Редакция', '✕']);
    ok('incoming pending', j(btns(rowOf(h, 'INC-NEW'))) === j(inc), j(btns(rowOf(h, 'INC-NEW'))));
    ok('трансфер pending (global е подател): Изпратена', j(btns(rowOf(h, 'TR-SEND'))) === j(S(['📤 Изпратена', '✏️ Редакция', '✕'])), j(btns(rowOf(h, 'TR-SEND'))));
    ok('трансфер sent (global е получател): Прието, Неприето, Върни', j(btns(rowOf(h, 'TR-RECV'))) === j(S(['✅ Прието', '✕ Неприето', '↩ Върни', '✏️ Редакция', '✕'])), j(btns(rowOf(h, 'TR-RECV'))));
    ok('received с Върни', j(btns(rowOf(h, 'INC-REC'))) === j(S(['↩ Върни', '✏️ Редакция', '✕'])), j(btns(rowOf(h, 'INC-REC'))));
  }

  section('6. бутоните — магазин Кърджали');
  {
    const h = env(user('manager', 'Кърджали'), DATA);
    realClick(h.w, chip(h, 'all'));
    ok('incoming pending (магазинът е получател)', j(btns(rowOf(h, 'INC-NEW'))) === j(S(['✅ Прието', '✕ Неприето', '👁 Проверено, не е пристигнало', '✏️ Редакция'])), j(btns(rowOf(h, 'INC-NEW'))));
    ok('трансфер pending при ПОДАТЕЛ: Изпратена', j(btns(rowOf(h, 'TR-SEND'))) === j(S(['📤 Изпратена', '✏️ Редакция'])), j(btns(rowOf(h, 'TR-SEND'))));
    const w = rowOf(h, 'TR-WAIT');
    ok('трансфер pending при ПОЛУЧАТЕЛ: „чака Шумен", без Изпратена', j(btns(w)) === j(['✏️ Редакция']) && spans(w).some(t => /чака Шумен/.test(t)), j(btns(w)) + ' | ' + j(spans(w)));
    ok('трансфер sent при получател: Прието и Неприето, без Върни', j(btns(rowOf(h, 'TR-RECV'))) === j(S(['✅ Прието', '✕ Неприето', '✏️ Редакция'])), j(btns(rowOf(h, 'TR-RECV'))));
    ok('received: Върни (магазинът е получател)', j(btns(rowOf(h, 'INC-REC'))) === j(S(['↩ Върни', '✏️ Редакция'])), j(btns(rowOf(h, 'INC-REC'))));
    const tr2 = env(user('manager', 'Шумен'), DATA);
    realClick(tr2.w, chip(tr2, 'all'));
    ok('Шумен е получател на TR-SEND и ЧАКА подателя (Кърджали)', spans(rowOf(tr2, 'TR-SEND')).some(t => /чака Кърджали/.test(t)) && btns(rowOf(tr2, 'TR-SEND')).indexOf('📤 Изпратена') < 0);
  }

  section('7. tReviewCounterHtml() — същите числа като в стария код');
  {
    const text = h => {
      const el = h.w.document.createElement('div');
      el.innerHTML = h.w.tReviewCounterHtml(h.w.transitData.filter(r => r.status === 'pending'));
      return el.textContent.replace(/\s+/g, ' ').trim();
    };
    const mgr = env(user('manager', 'Кърджали'), DATA);
    const adm = env(user('admin', 'Централен офис'), DATA);
    ok('магазин Кърджали', text(mgr) === '📦 Кърджали: Обработени 2 / проверени 0 / необработени 3👁 Провери всички чакащи (3)', text(mgr));
    ok('офис (без избран магазин)', text(adm) === '👁 Провери всички чакащи (3)', text(adm));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
