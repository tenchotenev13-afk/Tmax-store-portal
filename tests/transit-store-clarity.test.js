/* „Стока на път": обектът вижда веднага какво чака НЕГО (24.10.2026, след
   проверката на живо с Монтана).

   ПОВОД. Модулът се отваряше на „Всички" + „⏳ Не доставени" → „📦 Няма
   записи.", а подтабът казваше „(0 за изпр. / 11 за получ.)" — от 11-те само
   2 чакаха Монтана („✅ Прието" / „✕ Неприето"), другите 9 бяха изпратени ОТ
   Монтана и чакаха другия обект.

   ТВЪРДЕНИЯТА (обект, fixture като Монтана — 2 входящи трансфера 'sent' към
   обекта, 3 изходящи 'sent' от обекта, 1 приет):
   · чипът „📥 Чакат мен" = 2 (правилото transitAwaitsMyReceive — същото, по
     което се рисуват бутоните; до 03.11.2026 и „за получ." под таба „Трансфери");
   · при влизане (showModule) — подтаб „📥 Получавам" (до 03.11.2026 „Трансфери"),
     филтър „📥 Чакат мен" и
     в таблицата ТОЧНО двата реда (<tr>) с по един „✅ Прието" / „✕ Неприето";
   · банерът казва 2 и назовава бутоните; сивият ред — 3 ваши чакат другия;
   · истински клик на „✅ Прието" → PATCH, презареждане, броят става 1 и
     филтърът остава;
   · обект без чакащи — без банер, модулът се отваря както днес;
   · „Отвори →" от Бюлетина (transit-auto) — без скока;
   · офис акаунт — без скок, без чип и без банер; без избран обект табовете
     „Получавам" / „Изпращам" са без числа (етап 2, 03.11.2026).

   МУТАЦИИ (пускани ръчно на 24.10.2026, всяка пада):
   M1 „за получ." брои и изходящите (status 'sent' вместо 'mine') — броячът под
      „Трансфери" е махнат на 03.11.2026, мутантът вече няма къде да се приложи;
   M2 при влизане не се показват чакащите (transitApplyOpenFocus не пипа нищо);
   M3 банерът брои по друг критерий (всички 'sent' трансфери).

   Пускане: node tests/transit-store-clarity.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

const STORE = 'Монтана';
const USER = { email: 'montana@temax.bg', display_name: 'Склад Монтана', role: 'manager', store_name: STORE, assigned_stores: [] };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function row(id, over) {
  return Object.assign({ id: id, purchase_doc: 'D-' + id, position: 10, doc_date: '2026-10-20', direction: 'transfer',
    supplier: 'Козлодуй', store_name: STORE, material_code: 'M' + id, material_name: 'АРТИКУЛ ' + id,
    ordered_qty: 1, unit: 'бр.', remaining_qty: null, status: 'sent', comment: null, transfer_date: null,
    reviewed_at: null, reviewed_by: null, created_at: '2026-10-20T08:00:00.000Z' }, over || {});
}
const ROWS = [
  row('in1', { supplier: 'Козлодуй', purchase_doc: '4600190517' }),
  row('in2', { supplier: 'Търговище', purchase_doc: '4700193367' }),
  row('out1', { supplier: STORE, store_name: 'Враца' }),
  row('out2', { supplier: STORE, store_name: 'Шумен' }),
  row('out3', { supplier: STORE, store_name: 'Добрич' }),
  row('acc1', { supplier: 'Враца', status: 'received' })
];

/* loadTransit вика fetch направо (Range + content-range), а sbPatch — също
   fetch. Стъбът държи данните и прилага PATCH по id=eq.<id>. */
function stubFetch(w, rows) {
  const db = rows.map(r => Object.assign({}, r));
  const patches = [];
  w.fetch = function (url, opts) {
    url = String(url);
    const method = (opts && opts.method) || 'GET';
    if (method === 'PATCH' && /goods_transit/.test(url)) {
      const m = url.match(/id=eq\.([^&]+)/);
      const body = JSON.parse(opts.body);
      patches.push({ id: m && decodeURIComponent(m[1]), body: body });
      db.forEach(r => { if (m && String(r.id) === decodeURIComponent(m[1])) Object.assign(r, body); });
      return Promise.resolve({ ok: true, status: 204, headers: { get: () => null },
        json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    const data = /goods_transit/.test(url) ? db.map(r => Object.assign({}, r)) : [];
    return Promise.resolve({ ok: true, status: 206,
      headers: { get: k => /content-range/i.test(k) ? ('0-' + Math.max(data.length - 1, 0) + '/' + data.length) : null },
      json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
  };
  return { db, patches };
}
function env(user, rows) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'transit.js', 'bulletin.js'],
    user: user, confirm: true,
    data: { goods_transit: [], stores: [], users: [], recurring_tasks: [], bulletins: [] }
  });
  h.stub = stubFetch(h.w, rows || ROWS);
  /* renderTransit след loadTransit връща скрола през requestAnimationFrame —
     jsdom го няма и грешката се лови в .catch на loadTransit („Грешка: {}"). */
  h.w.requestAnimationFrame = function () { return 0; };
  h.w.scrollTo = function () {};
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 30); i++) await ticks(); }
const mod = h => h.doc.getElementById('mod-transit');
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const bodyRows = h => mod(h) ? Array.from(mod(h).querySelectorAll('tbody tr')) : [];
const rowIds = h => bodyRows(h).map(tr => (txt(tr).match(/АРТИКУЛ ([a-z]+\d)/) || [])[1]).sort().join(',');
const btns = (h, label) => mod(h) ? Array.from(mod(h).querySelectorAll('button')).filter(b => txt(b) === label) : [];
const dirBtn = (h, label) => mod(h) && Array.from(mod(h).querySelectorAll('button')).find(b => txt(b).indexOf(label) === 0);
const chip = (h, f) => mod(h) && mod(h).querySelector('button[data-tt-f="' + f + '"]');
async function open(user, rows) {
  const h = env(user, rows);
  if (!guard('showModule(transit) не хвърля', () => h.w.showModule('transit'))) return null;
  await settle();
  return h;
}

(async function () {

  section('1. Обект с 2 трансфера за приемане — при влизане');
  {
    const h = await open(USER);
    if (h) {
      /* От 03.11.2026 (етап 2) скокът е към „📥 Получавам"; „за получ." под
         стария таб „Трансфери" го няма — същото число е в чипа „Чакат мен". */
      const tr = dirBtn(h, '📥 Получавам');
      ok('таб „🔄 Трансфери" го няма', !dirBtn(h, '🔄 Трансфери'));
      ok('подтабът „📥 Получавам" е активен', !!tr && h.w.transitDir === 'in' && /background:#0f172a/.test(tr.getAttribute('style')));
      ok('филтърът „📥 Чакат мен" е активен', h.w.transitFilter === 'mine' && !!chip(h, 'mine') && chip(h, 'mine').classList.contains('active'));
      ok('чипът казва 2', txt(chip(h, 'mine')) === '📥 Чакат мен 2', txt(chip(h, 'mine')));
      ok('в таблицата са точно двата реда', rowIds(h) === 'in1,in2', rowIds(h));
      ok('два бутона „✅ Прието"', btns(h, '✅ Прието').length === 2);
      ok('два бутона „✕ Неприето"', btns(h, '✕ Неприето').length === 2);
      ok('„↩ Върни" (изходящите) го няма', btns(h, '↩ Върни').length === 0);
      const n = h.doc.getElementById('t-recv-note');
      ok('банерът казва 2', !!n && txt(n).indexOf('📥 2 трансфера чакат да ги приемете.') === 0, txt(n));
      ok('… и назовава бутоните', !!n && txt(n).indexOf('натиснете „✅ Прието“ или „✕ Неприето“.') >= 0, txt(n));
      const o = h.doc.getElementById('t-other-note');
      ok('сивият ред: 3 ваши чакат другия', !!o && txt(o) === '📤 3 ваши трансфера чакат другия обект.', txt(o));

      section('2. Истински клик на „✅ Прието" → броят става 1');
      const b = btns(h, '✅ Прието').find(x => x.closest('tr') && txt(x.closest('tr')).indexOf('АРТИКУЛ in1') >= 0);
      if (ok('бутонът на in1 го има', !!b)) {
        realClick(h.w, b);
        await settle();
        ok('PATCH status=received за in1', h.stub.patches.length === 1 && h.stub.patches[0].id === 'in1' && h.stub.patches[0].body.status === 'received',
          JSON.stringify(h.stub.patches));
        ok('чипът „Чакат мен" = 1', txt(chip(h, 'mine')) === '📥 Чакат мен 1', txt(chip(h, 'mine')));
        ok('филтърът остава „Чакат мен"', h.w.transitFilter === 'mine');
        ok('в таблицата остава in2', rowIds(h) === 'in2', rowIds(h));
        ok('банерът казва 1', /^📥 1 трансфер чака да го приемете./.test(txt(h.doc.getElementById('t-recv-note'))), txt(h.doc.getElementById('t-recv-note')));
      }
      h.close();
    }
  }

  section('3. Обект без чакащи → без банер, отваря се както днес');
  {
    const none = ROWS.filter(r => r.id !== 'in1' && r.id !== 'in2');
    const h = await open(USER, none);
    if (h) {
      ok('без банер', !h.doc.getElementById('t-recv-note'));
      ok('подтабът е „Всички", филтърът „Не доставени"', h.w.transitDir === 'all' && h.w.transitFilter === 'pending', h.w.transitDir + '/' + h.w.transitFilter);
      ok('табът „📥 Получавам" е там, неактивен', !!dirBtn(h, '📥 Получавам') && h.w.transitDir !== 'in');
      ok('чипът „📥 Чакат мен" стои и при 0', txt(chip(h, 'mine')) === '📥 Чакат мен 0', txt(chip(h, 'mine')));
      ok('сивият ред за изходящите си стои', !!h.doc.getElementById('t-other-note'));
      h.close();
    }
  }

  section('4. „Отвори →" от Бюлетина (transit-auto) — без скока');
  {
    const h = env(USER);
    if (guard('bulOpenPending(transit-auto)', () => h.w.bulOpenPending('transit-auto'))) {
      await settle();
      ok('подтабът остава „Всички"', h.w.transitDir === 'all', h.w.transitDir);
      ok('филтърът остава „Не доставени"', h.w.transitFilter === 'pending', h.w.transitFilter);
      ok('банерът пак казва 2', /📥 2 трансфера/.test(txt(h.doc.getElementById('t-recv-note'))));
      /* Следващо влизане през навигацията — скокът пак работи. */
      h.w.showModule('transit');
      await settle();
      ok('следващото влизане пак отваря „Получавам" + „Чакат мен"', h.w.transitFilter === 'mine' && h.w.transitDir === 'in');
    }
    h.close();
  }

  section('5. Офис акаунт — нищо ново');
  {
    const h = await open(ADMIN);
    if (h) {
      ok('без скок: „Всички" / „Не доставени"', h.w.transitDir === 'all' && h.w.transitFilter === 'pending', h.w.transitDir + '/' + h.w.transitFilter);
      /* От 03.11.2026: офис без избран обект няма гледна точка — табовете без числа. */
      ok('без избран обект „Получавам" / „Изпращам" са без числа', txt(dirBtn(h, '📥 Получавам')) === '📥 Получавам' && txt(dirBtn(h, '📤 Изпращам')) === '📤 Изпращам',
        txt(dirBtn(h, '📥 Получавам')) + ' | ' + txt(dirBtn(h, '📤 Изпращам')));
      ok('без чип „Чакат мен"', !chip(h, 'mine'));
      ok('без банер и без сив ред', !h.doc.getElementById('t-recv-note') && !h.doc.getElementById('t-other-note'));
      h.close();
    }
  }

  report();
})();
