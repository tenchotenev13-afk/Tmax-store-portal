/* „Стока на път": числата по бутоните следват филтрите (правилото на Разлики).

   Картите горе = целият модул (по посока), не се пипат. Числото на бутон-филтър
   = редовете в таблицата СЛЕД клик на него: сменя се само неговото измерение,
   останалите активни филтри (магазин, месец, търсене, посока/статус) остават.

   Еталонът в теста (ref) е написан отделно от transitRows() — не е копие.
   От 03.11.2026 (етап 2) табовете са „📥 Получавам" / „📤 Изпращам" спрямо
   гледната точка (склад → себе си, офис → избраният магазин), не по direction.

   Пускане:  node tests/transit-counts-follow-filters.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick } = H;

const TG = 'Логистичен склад Търговище';
const DB = 'Логистичен склад Добрич';

function stubFetch(w) {
  w.fetch = function () {
    return Promise.resolve({ ok: true, status: 206,
      headers: { get: function (h) { return /content-range/i.test(h) ? '0-0/0' : null; } },
      json: function () { return Promise.resolve([]); }, text: function () { return Promise.resolve('[]'); } });
  };
}
function env(user, data) {
  const h = boot({ modules: ['transport.js', 'client-orders.js', 'transit.js'], user: user,
    data: { goods_transit: [], stores: [], users: [] } });
  stubFetch(h.w);
  h.w.requestAnimationFrame = function (f) { f(); };
  h.w.transitData = data.slice();
  h.w.transitDir = 'all'; h.w.transitFilter = 'all';
  h.w.transitStore = ''; h.w.transitMonthFilter = ''; h.w.transitSearch = '';
  return h;
}

let id = 0;
function row(o) {
  id++;
  return Object.assign({ id: id, direction: 'incoming', status: 'pending', doc_date: '2026-09-10',
    purchase_doc: 'DOC' + id, position: 1, material_code: 'M' + id, material_name: 'Артикул ' + id,
    remaining_qty: 1, unit: 'бр', store_name: 'Кърджали', supplier: TG }, o);
}
const DATA = [];
['pending', 'sent', 'received', 'rejected'].forEach(function (st, i) {
  ['2026-08-15', '2026-09-10'].forEach(function (d, j) {
    DATA.push(row({ status: st, doc_date: d, store_name: 'Кърджали', supplier: TG }));
    DATA.push(row({ status: st, doc_date: d, store_name: 'Шумен', supplier: TG, material_name: 'Лампа ' + i + j }));
    DATA.push(row({ status: st, doc_date: d, store_name: 'Кърджали', supplier: DB }));
  });
});
['pending', 'sent', 'received'].forEach(function (st) {
  DATA.push(row({ direction: 'transfer', status: st, store_name: 'Шумен', supplier: 'Кърджали', material_name: 'Лампа трансфер' }));
  DATA.push(row({ direction: 'transfer', status: st, store_name: 'Кърджали', supplier: 'Шумен', doc_date: '2026-08-02' }));
  DATA.push(row({ direction: 'transfer', status: st, store_name: 'Шумен', supplier: 'Варна' }));
});
DATA.push(row({ direction: 'outgoing', status: 'pending', store_name: 'Шумен', supplier: 'Склад Х' }));
DATA.push(row({ store_name: TG, supplier: 'Доставчик X' }));

/* Еталон: НЕЗАВИСИМО от transitRows. f={dir,status,store,month,q,wh}
   От 03.11.2026 (етап 2) табовете са 'in' / 'out' спрямо гледната точка:
   склад → складът (TG), офис → избраният магазин; без нея — нищо.
   В таба падащото меню на офиса Е гледната точка; на склада е другата страна. */
function ref(data, f) {
  const vp = f.wh ? TG : (f.store || '');
  const vpTab = f.dir === 'in' || f.dir === 'out';
  let majStore = true;
  if (f.store && !f.wh) {
    let a = 0, b = 0;
    data.forEach(r => { if (r.store_name === f.store) a++; if (r.supplier === f.store) b++; });
    majStore = a >= b;
  }
  return data.filter(r => {
    if (vpTab) {
      if (!vp) return false;
      if (f.dir === 'in' && r.store_name !== vp) return false;
      if (f.dir === 'out' && r.supplier !== vp) return false;
    }
    if (f.status && f.status !== 'all' && r.status !== f.status) return false;
    if (vpTab) {
      if (f.wh && f.store) {
        if (f.dir === 'in' && r.supplier !== f.store) return false;
        if (f.dir === 'out' && r.store_name !== f.store) return false;
      }
    } else if (f.store) {
      if (f.wh) { if (r.store_name !== f.store) return false; }
      else if (r.direction === 'transfer') { if (r.store_name !== f.store && r.supplier !== f.store) return false; }
      else if (majStore) { if (r.store_name !== f.store) return false; }
      else if (r.supplier !== f.store) return false;
    }
    if (f.month && (r.doc_date || '').slice(0, 7) !== f.month) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (!([r.purchase_doc, r.material_code, r.material_name].some(x => x && String(x).toLowerCase().indexOf(q) >= 0))) return false;
    }
    return true;
  }).length;
}

function ui(h) {
  const d = h.w.document;
  const btns = Array.prototype.slice.call(d.querySelectorAll('#mod-transit button'));
  const tabs = {}, stat = {};
  btns.forEach(b => {
    const oc = b.getAttribute('onclick') || '';
    let m = oc.match(/^transitDir='(\w+)'/);
    if (m) tabs[m[1]] = b;
    m = oc.match(/^transitFilter='(\w+)'/);
    if (m) stat[m[1]] = b;
  });
  return { tabs, stat };
}
/* Бройката е в <span class="chips-n"> (общите чипове), не в скоби след текста. */
const num = (el) => parseInt((el.querySelector('.chips-n') || { textContent: '' }).textContent, 10);
const tabNums = (b) => (((b.querySelector('div') || { textContent: '' }).textContent).match(/\d+/g) || []).map(Number);
const trs = (h) => h.w.document.querySelectorAll('#mod-transit tbody tr').length;
function cards(h) {
  const g = h.w.document.querySelector('#mod-transit div[style*="repeat(6,1fr)"]');
  return g ? g.textContent.replace(/\s+/g, ' ') : null;
}
function clickTab(h, k) { realClick(h.w, ui(h).tabs[k], 'tab ' + k); }
function clickStat(h, k) { realClick(h.w, ui(h).stat[k], 'stat ' + k); }

/* Проверка на всички бутони при текущото състояние; всеки се кликва реално. */
function checkAll(h, name, base) {
  const st0 = { dir: h.w.transitDir, status: h.w.transitFilter };
  const reset = () => { h.w.transitDir = st0.dir; h.w.transitFilter = st0.status; h.w.renderTransit(); };
  reset();
  ['all', 'pending', 'received', 'sent', 'rejected'].forEach(k => {
    reset();
    const shown = num(ui(h).stat[k]);
    clickStat(h, k);
    ok(name + ': статус „' + k + '" показва ' + shown + ' = редове след клик (' + trs(h) + ')', shown === trs(h));
    ok(name + ': … и = еталон', shown === ref(h.w.transitData, Object.assign({}, base, { dir: st0.dir, status: k })));
  });
  /* Табовете (етап 2): 'in' = „📥 Получавам", 'out' = „📤 Изпращам". */
  const hasVp = !!(base.wh || base.store);
  ['all', 'in', 'out'].forEach(k => {
    reset();
    const t = tabNums(ui(h).tabs[k]);
    clickTab(h, k);
    if (k === 'all') {
      ok(name + ': таб „Всички" ' + t[0] + ' = редове след клик (' + trs(h) + ')', t[0] === trs(h));
      ok(name + ': … и = еталон', t[0] === ref(h.w.transitData, Object.assign({}, base, { dir: 'all', status: st0.status })));
    } else if (!hasVp) {
      ok(name + ': „' + k + '" без гледна точка — без число', t.length === 0, t.join('/'));
      ok(name + ': … и празна таблица след клик', h.w._transitVisible.length === 0, h.w._transitVisible.length);
    } else if (k === 'in') {
      clickStat(h, 'pending');
      ok(name + ': „Получавам" ' + t[0] + ' чакат = редове след таб+„Не доставени" (' + trs(h) + ')', t[0] === trs(h));
      ok(name + ': … и = еталон', t[0] === ref(h.w.transitData, Object.assign({}, base, { dir: 'in', status: 'pending' })));
    } else {
      clickStat(h, 'pending');
      const p = h.w._transitVisible.filter(r => r.direction === 'transfer').length;
      ok(name + ': „Изпращам" ' + t[0] + ' за изпр. = трансферите след таб+„Не доставени" (' + p + ')', t[0] === p);
    }
  });
  reset();
}

const ADMIN = { email: 'c@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const SKLAD = { email: 'ls@temax.bg', display_name: TG, role: 'logistics', store_name: TG };

(async function run() {

  section('а) Без филтри: числата са каквито бяха преди промяната');
  {
    const h = env(ADMIN, DATA);
    guard('renderTransit()', () => h.w.renderTransit());
    const u = ui(h);
    /* „Преди": статус = брой по статус в целия модул; таб Всички = всички редове;
       Получавам = incoming+pending; Трансфери = transfer pending / sent. */
    const cnt = (f) => DATA.filter(f).length;
    ok('Всички (статус) = всички редове', num(u.stat.all) === DATA.length, num(u.stat.all) + ' vs ' + DATA.length);
    ['pending', 'received', 'sent', 'rejected'].forEach(k =>
      ok('статус ' + k + ' = брой по статус', num(u.stat[k]) === cnt(r => r.status === k), num(u.stat[k])));
    ok('таб Всички = всички редове', tabNums(u.tabs.all)[0] === DATA.length);
    /* От 03.11.2026 (етап 2): офис без избран магазин няма гледна точка —
       „Получавам" / „Изпращам" са без числа (до тогава „Получавам" =
       incoming+pending и „Трансфери" = transfer pending / sent). */
    ok('Получавам — без число (без гледна точка)', !!u.tabs.in && tabNums(u.tabs.in).length === 0, u.tabs.in && u.tabs.in.textContent);
    ok('Изпращам — без число (без гледна точка)', !!u.tabs.out && tabNums(u.tabs.out).length === 0, u.tabs.out && u.tabs.out.textContent);
    ok('таб „Трансфери" го няма', !u.tabs.transfer && !u.tabs.incoming);
    /* Шестте stat карти са махнати — числата им са в табовете за посока и в чиповете. */
    ok('няма stat карти (repeat(6,1fr))', cards(h) === null, cards(h));
    checkAll(h, 'без филтри', {});
  }

  section('б) Избран магазин: всеки бутон = редове след реален клик');
  const cardsNoStore = (function () { const h = env(ADMIN, DATA); h.w.renderTransit(); return cards(h); })();
  ['Кърджали', 'Шумен', TG].forEach(store => {
    const h = env(ADMIN, DATA);
    h.w.setTStore(store);
    checkAll(h, 'магазин ' + store, { store });
    if (store === 'Кърджали') ok('г) и при избран магазин няма stat карти', cards(h) === null && cardsNoStore === null, cards(h) + ' | ' + cardsNoStore);
  });

  section('в) Магазин + месец + търсене');
  {
    const h = env(ADMIN, DATA);
    h.w.setTStore('Кърджали'); h.w.transitMonthFilter = '2026-09'; h.w.transitSearch = 'артикул';
    h.w.renderTransit();
    checkAll(h, 'магазин+месец+търсене', { store: 'Кърджали', month: '2026-09', q: 'артикул' });
    const h2 = env(ADMIN, DATA);
    h2.w.setTStore('Шумен'); h2.w.transitMonthFilter = '2026-08'; h2.w.transitSearch = 'лампа';
    h2.w.renderTransit();
    checkAll(h2, 'Шумен+август+„лампа"', { store: 'Шумен', month: '2026-08', q: 'лампа' });
    /* Контрол: числото наистина се сменя с филтъра (не е константа). */
    const h3 = env(ADMIN, DATA); h3.w.renderTransit();
    const before = num(ui(h3).stat.pending);
    h3.w.setTStore('Шумен');
    ok('контрол: „Не доставени" се променя при избор на магазин', num(ui(h3).stat.pending) !== before, before);
  }

  section('д) Складов профил — в рамките на своя склад');
  {
    const own = DATA.filter(r => r.supplier === TG || r.store_name === TG);
    const h = env(SKLAD, own);
    h.w.renderTransit();
    checkAll(h, 'склад без магазин', { wh: true }); /* складът винаги има гледна точка — себе си */
    const h2 = env(SKLAD, own);
    h2.w.setTStore('Кърджали');
    checkAll(h2, 'склад + Кърджали', { store: 'Кърджали', wh: true });
    const h3 = env(SKLAD, own);
    h3.w.setTStore('Кърджали'); h3.w.transitMonthFilter = '2026-09'; h3.w.transitSearch = 'артикул';
    h3.w.renderTransit();
    checkAll(h3, 'склад + Кърджали + месец + търсене', { store: 'Кърджали', month: '2026-09', q: 'артикул', wh: true });
  }

  report();
})();
