/* „Стока на път": текстът на банера за обекта и значката „по SAP"
   (решение на Тенчо 08.11.2026 — само текст).

   ПОВОД. Севлиево, 08.11.2026: 17 реда, най-старият от 24.09, без отговор.
   Старият банер („… чакат да ги приемете. Когато стоката пристигне,
   натиснете …") караше обекта да ЧАКА, не споменаваше „🔍 Чака засечка" и не
   казваше, че задачата в Бюлетина зависи от отговора. Значката на изпращача
   „📤 Изпратена · импорт" — „импорт" не говори нищо на обекта.

   ТВЪРДЕНИЯТА (реалният ред от index.html, showModule → loadTransit през
   стъбнат fetch):
   1. N=17, най-старата doc_date 24.09 сред ЧАКАЩИТЕ (не първа и не последна
      в масива; по-стар ред, който не се брои — приет / изходящ — не влиза):
      точният текст от решението; числото = чипа „📥 Чакат мен".
   2. Етикетите в банера са същите като бутоните в таблицата
      (T_STATUS.received / undelivered и T_RECON_LABEL).
   3. N=1 — единствено число, „(от дд.мм)".
   4. Без doc_date на всички чакащи — без скобите.
   5. Значката: by 'импорт' → „📤 Изпратена по SAP" (и title „по SAP");
      by „Склад Добрич" → „📤 Изпратена" без промяна; в базата нищо не се пише.

   МУТАЦИИ (ръчно, 08.11.2026 — всяка пада):
   M1 старият текст на банера;
   M2 датата от най-новия ред (d>min вместо d<min);
   M3 „ · импорт" вместо „ по SAP".

   Пускане: node tests/transit-store-banner-text.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const STORE = 'Севлиево';
const USER = { email: 'sevlievo@temax.bg', display_name: 'Управител Севлиево', role: 'manager', store_name: STORE, assigned_stores: [] };

let seq = 0;
function row(over) {
  seq++;
  return Object.assign({ id: 'r' + seq, purchase_doc: '45000' + seq, position: 10, doc_date: '2026-10-20', direction: 'incoming',
    supplier: 'Логистичен склад Добрич', store_name: STORE, material_code: 'M' + seq, material_name: 'АРТИКУЛ ' + seq,
    ordered_qty: 1, unit: 'бр.', remaining_qty: null, status: 'pending', comment: null, transfer_date: null,
    sender_status: 'sent', sender_status_by: 'импорт', sender_status_at: '2026-11-04T10:00:00Z',
    reviewed_at: null, reviewed_by: null, recon_at: null, created_at: '2026-10-20T08:00:00.000Z' }, over || {});
}
/* 17 чакащи: датите разбъркани, най-старата (24.09) по средата, най-новата
   (05.11) също по средата — първият/последният ред не са крайните. */
function sevlievo() {
  const dates = ['2026-10-10', '2026-10-01', '2026-11-05', '2026-10-15', '2026-10-02', '2026-10-20', '2026-10-21',
    '2026-09-24', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-11',
    '2026-10-12', '2026-10-13', '2026-10-14'];
  const rows = dates.map(d => row({ doc_date: d }));
  /* По-стари, но НЕ чакащи: приет, изходящ, неизпратен — не бива да дават датата. */
  rows.push(row({ doc_date: '2026-09-01', status: 'received' }));
  rows.push(row({ doc_date: '2026-09-02', supplier: STORE, store_name: 'Габрово' }));
  rows.push(row({ doc_date: '2026-09-03', sender_status: null, sender_status_by: null, sender_status_at: null }));
  return rows;
}

function stubFetch(w, rows) {
  const db = rows.map(r => Object.assign({}, r));
  const writes = [];
  w.fetch = function (url, opts) {
    url = String(url);
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') {
      writes.push({ method, url });
      return Promise.resolve({ ok: true, status: 204, headers: { get: () => null },
        json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    const data = /goods_transit/.test(url) ? db.map(r => Object.assign({}, r)) : [];
    return Promise.resolve({ ok: true, status: 206,
      headers: { get: k => /content-range/i.test(k) ? ('0-' + Math.max(data.length - 1, 0) + '/' + data.length) : null },
      json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
  };
  return { db, writes };
}
function env(rows) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'transit.js', 'bulletin.js'],
    user: USER, confirm: true,
    data: { goods_transit: [], stores: [], users: [], recurring_tasks: [], bulletins: [] }
  });
  h.stub = stubFetch(h.w, rows);
  h.w.requestAnimationFrame = function () { return 0; };
  h.w.scrollTo = function () {};
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 30); i++) await ticks(); }
async function open(rows) {
  const h = env(rows);
  if (!guard('showModule(transit) не хвърля', () => h.w.showModule('transit'))) return null;
  await settle();
  return h;
}
const mod = h => h.doc.getElementById('mod-transit');
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const banner = h => txt(h.doc.getElementById('t-recv-note'));
const chip = (h, f) => mod(h) && mod(h).querySelector('button[data-tt-f="' + f + '"]');

(async function () {

  section('1. Севлиево: 17 реда, най-старият от 24.09');
  {
    const h = await open(sevlievo());
    if (h) {
      const EXP = '📥 17 реда са изпратени към вас и чакат отговор (най-старият от 24.09). ' +
        'Отговорете на всеки ред — ✅ Доставена, ✕ Недоставена или 🔍 Чака засечка. ' +
        'Дотогава задачата в Бюлетина не се отмята.';
      ok('точният текст', banner(h) === EXP, banner(h));
      ok('числото е <b>', !!h.doc.querySelector('#t-recv-note b') && txt(h.doc.querySelector('#t-recv-note b')) === '17');
      ok('числото = чипа „📥 Чакат мен"', txt(chip(h, 'mine')) === '📥 Чакат мен 17', txt(chip(h, 'mine')));
      ok('старият текст го няма', banner(h).indexOf('приемете') < 0 && banner(h).indexOf('Когато стоката пристигне') < 0, banner(h));

      section('2. Етикетите в банера са тези на бутоните');
      const labels = [h.w.T_STATUS.received.label, h.w.T_STATUS.undelivered.label, h.w.T_RECON_LABEL];
      ok('T_RECON_LABEL = „🔍 Чака засечка"', h.w.T_RECON_LABEL === '🔍 Чака засечка', h.w.T_RECON_LABEL);
      const btnTexts = Array.from(mod(h).querySelectorAll('tbody button')).map(txt);
      labels.forEach(l => {
        ok('„' + l + '" е в банера', banner(h).indexOf(l) >= 0);
        ok('… и е бутон в таблицата', btnTexts.indexOf(l) >= 0, JSON.stringify(btnTexts.slice(0, 6)));
      });
      ok('нищо не е записано в базата', h.stub.writes.length === 0, JSON.stringify(h.stub.writes));
      h.close();
    }
  }

  section('3. Един ред — единствено число');
  {
    const h = await open([row({ doc_date: '2026-10-03' }), row({ doc_date: '2026-09-01', status: 'received' })]);
    if (h) {
      const EXP = '📥 1 ред е изпратен към вас и чака отговор (от 03.10). ' +
        'Отговорете на реда — ✅ Доставена, ✕ Недоставена или 🔍 Чака засечка. ' +
        'Дотогава задачата в Бюлетина не се отмята.';
      ok('точният текст', banner(h) === EXP, banner(h));
      ok('без „реда са" / „чакат"', !/реда са|чакат/.test(banner(h)), banner(h));
      h.close();
    }
  }

  section('4. Без doc_date на всички чакащи — без скобите');
  {
    const h = await open([row({ doc_date: null }), row({ doc_date: '' }), row({ doc_date: '2026-09-01', status: 'received' })]);
    if (h) {
      const EXP = '📥 2 реда са изпратени към вас и чакат отговор. ' +
        'Отговорете на всеки ред — ✅ Доставена, ✕ Недоставена или 🔍 Чака засечка. ' +
        'Дотогава задачата в Бюлетина не се отмята.';
      ok('точният текст, без „(…)"', banner(h) === EXP, banner(h));
      ok('дата от неброен ред (01.09) не влиза', banner(h).indexOf('01.09') < 0);
      h.close();
    }
    /* Само част без дата — датата е от тези, които я имат. */
    const h2 = await open([row({ doc_date: null }), row({ doc_date: '2026-10-28' })]);
    if (h2) {
      ok('смесено: „(най-старият от 28.10)"', banner(h2).indexOf('(най-старият от 28.10)') > 0, banner(h2));
      h2.close();
    }
  }

  section('5. Значката на изпращача: „по SAP" само при by „импорт"');
  {
    const h = await open([
      row({ material_name: 'АРТ ИМПОРТ', sender_status_by: 'импорт' }),
      row({ material_name: 'АРТ РЪЧНО', sender_status_by: 'Склад Добрич' })
    ]);
    if (h) {
      h.w.transitDir = 'all'; h.w.transitFilter = 'all'; h.w.renderTransit();
      const trOf = name => Array.from(mod(h).querySelectorAll('tbody tr')).find(tr => txt(tr).indexOf(name) >= 0);
      const sendOf = name => { const tr = trOf(name); return tr && tr.querySelector('.t-send'); };
      const imp = sendOf('АРТ ИМПОРТ'), man = sendOf('АРТ РЪЧНО');
      ok('импорт → „📤 Изпратена по SAP"', txt(imp) === '📤 Изпратена по SAP', txt(imp));
      ok('… title „Изпращач · по SAP"', !!imp && imp.getAttribute('title') === 'Изпращач · по SAP', imp && imp.getAttribute('title'));
      ok('ръчно → „📤 Изпратена" (без промяна)', txt(man) === '📤 Изпратена', txt(man));
      ok('… title „Изпращач · Склад Добрич"', !!man && man.getAttribute('title') === 'Изпращач · Склад Добрич', man && man.getAttribute('title'));
      ok('„импорт" не се вижда никъде в таблицата', txt(mod(h)).indexOf('импорт') < 0);
      ok('в базата остава „импорт"', h.w.transitData.some(r => r.sender_status_by === 'импорт'));
      ok('нищо не е записано', h.stub.writes.length === 0, JSON.stringify(h.stub.writes));
      h.close();
    }
  }

  report();
})();
