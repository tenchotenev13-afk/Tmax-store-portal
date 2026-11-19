/* „Стока на път" — седемте находки от прегледа за инструкцията (сесия
   transit-nahodki, 19.11.2026).

   РЕШЕНИЕ НА ТЕНЧО (18.11.2026): „Засечката е отговор" — ред с
   „🔍 Чака засечка" (recon_at) не чака никого.

   ТВЪРДЕНИЯТА (реалният ред от index.html, showModule → loadTransit през
   стъбнат fetch, истински клик по inline onclick):
   1. Обект Монтана: жълтият банер (t-recv-note), чипът „📥 Чакат мен" и скокът
      при влизане НЕ броят редовете със засечка; сивият ред „ваши изпратени
      реда чакат получателя" (t-other-note) — също. Чипът „🔍 Чака засечка" и
      числото под таба „📥 Получавам (N недоставени)" ги БРОИ, както досега
      (надписът до 19.11.2026 — „N чакат", виж раздел 1д).
      Клик „↩ Махни засечка" → редът се връща в банера и в „Чакат мен".
   2. Табът „📦📤 Всички" — „(N недоставени)", същото N.
   3. „📤 Цялата доставка (N неизпратени)"; кликът праща същия PATCH (ВД +
      изпращач + sender_status=is.null, тяло sender_status 'sent').
   4. Няма „outgoing" / „incoming" във видимия текст на модула, на формата и на
      прегледа на импорта; option value="outgoing" е на място.
   5. Менюто „Всички магазини" на обект — без собствения обект; на офиса — с
      всички.
   6. Подсказката „чакаме втори палет".
   7. Видът на изпращача: склад → „🏭 От склад", магазин → „🏬 От магазин",
      друго (Сервиз Троян) → „🏢 От Сервиз Троян"; в Excel — същото без
      емотикона.

   МУТАЦИИ (ръчно, 19.11.2026 — всяка пада):
   M1 transitAwaitsAnswer без &&!r.recon_at (засечката пак се брои);
   M2 „Друго (outgoing)" в формата;
   M3 без изтриването на собствения обект от менюто;
   M4 transitSenderKindText → всеки немагазин „От склад" (старото правило).
   M5 (сесия transit-tab-nadpis) върнато „ чакат)" на таба „Получавам".
   Оцелели мутанти: няма.

   Пускане: node tests/transit-nahodki-1811.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const STORE = 'Монтана';
const WH = 'Логистичен склад Търговище';
const STORE_USER = { email: 'montana@temax.bg', display_name: 'Управител Монтана', role: 'manager', store_name: STORE, assigned_stores: [] };
const OFFICE_USER = { email: 'office@temax.bg', display_name: 'Офис', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

let seq = 0;
function row(over) {
  seq++;
  return Object.assign({ id: 'r' + seq, purchase_doc: '45000' + seq, position: 10, doc_date: '2026-11-0' + (1 + seq % 8), direction: 'incoming',
    supplier: WH, store_name: STORE, material_code: 'M' + seq, material_name: 'АРТИКУЛ ' + seq,
    ordered_qty: 1, unit: 'бр.', remaining_qty: null, status: 'pending', comment: null, transfer_date: null,
    inbound_delivery: 'VD' + seq, outbound_delivery: null,
    sender_status: 'sent', sender_status_by: 'импорт', sender_status_at: '2026-11-04T10:00:00Z',
    reviewed_at: null, reviewed_by: null, recon_at: null, recon_by: null, recon_side: null,
    archived_at: null, created_at: '2026-11-01T08:00:00.000Z' }, over || {});
}
const RECON = { recon_at: '2026-11-18T09:00:00Z', recon_by: 'Управител Монтана', recon_side: 'receiver' };
function montana() {
  seq = 0;
  return [
    /* 3 изпратени към Монтана, със засечка — като живите 3 реда на 19.11 */
    row(RECON), row(RECON), row(RECON),
    /* 2 изпратени към Монтана, без отговор */
    row(), row(),
    /* Монтана изпраща към Враца: един чака, един е със засечка */
    row({ supplier: STORE, store_name: 'Враца', direction: 'transfer' }),
    row(Object.assign({ supplier: STORE, store_name: 'Враца', direction: 'transfer' }, RECON)),
    /* Една доставка (ВД VD99) от Монтана, два неизпратени реда */
    row({ supplier: STORE, store_name: 'Враца', direction: 'transfer', inbound_delivery: 'VD99', sender_status: null, sender_status_by: null, sender_status_at: null }),
    row({ supplier: STORE, store_name: 'Враца', direction: 'transfer', inbound_delivery: 'VD99', sender_status: null, sender_status_by: null, sender_status_at: null }),
    /* Отговорен — не чака никого */
    row({ status: 'received' })
  ];
}

function stubFetch(w, rows) {
  const db = rows.map(r => Object.assign({}, r));
  const writes = [];
  w.fetch = function (url, opts) {
    url = String(url);
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') {
      let body = null; try { body = JSON.parse(opts.body); } catch (e) {}
      writes.push({ method, url, body });
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null },
        json: () => Promise.resolve([{}]), text: () => Promise.resolve('[{}]') });
    }
    const data = /goods_transit/.test(url) && !/archived_at=not/.test(url) ? db.map(r => Object.assign({}, r)) : [];
    return Promise.resolve({ ok: true, status: 206,
      headers: { get: k => /content-range/i.test(k) ? ('0-' + Math.max(data.length - 1, 0) + '/' + data.length) : null },
      json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
  };
  return { db, writes };
}
function env(user, rows) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'transit.js', 'bulletin.js'],
    user, confirm: true,
    data: { goods_transit: [], stores: [], users: [], recurring_tasks: [], bulletins: [] }
  });
  h.stub = stubFetch(h.w, rows);
  h.w.requestAnimationFrame = function () { return 0; };
  h.w.scrollTo = function () {};
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 30); i++) await ticks(); }
async function open(user, rows) {
  const h = env(user, rows);
  if (!guard('showModule(transit) не хвърля', () => h.w.showModule('transit'))) return null;
  await settle();
  return h;
}
const mod = h => h.doc.getElementById('mod-transit');
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const chip = (h, f) => mod(h) && mod(h).querySelector('button[data-tt-f="' + f + '"]');
const chipN = (h, f) => { const c = chip(h, f); const n = c && c.querySelector('.chips-n'); return n ? Number(txt(n)) : NaN; };
const tabBtn = (h, d) => Array.from(mod(h).querySelectorAll('button')).find(b => (b.getAttribute('onclick') || '') === "setTDir('" + d + "')");
const tabSub = (h, d) => { const b = tabBtn(h, d); return b ? txt(b.querySelector('div')) : ''; };
const rowBtn = (h, id, side, re) => Array.from(mod(h).querySelectorAll('button[data-id="' + id + '"]')).find(b => b.getAttribute('data-side') === side && re.test(txt(b)));
const storeOpts = h => { const s = mod(h).querySelector('select[onchange^="setTStore"]'); return s ? Array.from(s.options).map(o => o.value).filter(Boolean) : null; };

(async function () {

  section('1. Обект Монтана: засечката е отговор');
  {
    const h = await open(STORE_USER, montana());
    if (h) {
      ok('скокът при влизане: таб „📥 Получавам" + „📥 Чакат мен"', h.w.transitDir === 'in' && h.w.transitFilter === 'mine', h.w.transitDir + '/' + h.w.transitFilter);
      const b = h.doc.getElementById('t-recv-note');
      ok('банерът брои 2 (без трите със засечка)', !!b && txt(b.querySelector('b')) === '2', txt(b));
      ok('чипът „📥 Чакат мен" = 2', chipN(h, 'mine') === 2, txt(chip(h, 'mine')));
      ok('таблицата под „Чакат мен" — 2 реда, без r1–r3',
        ['r4', 'r5'].every(id => !!mod(h).querySelector('button[data-id="' + id + '"]')) &&
        ['r1', 'r2', 'r3'].every(id => !mod(h).querySelector('button[data-id="' + id + '"]')));
      ok('чипът „🔍 Чака засечка" още ги брои (3)', chipN(h, 'recon') === 3, txt(chip(h, 'recon')));
      ok('„📥 Получавам (5 недоставени)" — числото непроменено, брои и засечката', tabSub(h, 'in') === '(5 недоставени)', tabSub(h, 'in'));
      const o = h.doc.getElementById('t-other-note');
      ok('t-other-note: 1 ваш изпратен ред (без реда със засечка)', !!o && txt(o) === '📤 1 ваш изпратен ред чака получателя.', txt(o));

      section('1б. „↩ Махни засечка" връща реда');
      realClick(h.w, chip(h, 'recon')); await settle(5);
      const undo = rowBtn(h, 'r1', 'recon', /Махни засечка/);
      if (ok('бутонът „↩ Махни засечка" на r1 е там', !!undo)) {
        realClick(h.w, undo); await settle(10);
        const w = h.stub.writes.filter(x => x.method === 'PATCH');
        ok('PATCH recon_at=null за r1', w.length === 1 && /id=eq\.r1/.test(w[0].url) && w[0].body && w[0].body.recon_at === null, JSON.stringify(w));
        const b2 = h.doc.getElementById('t-recv-note');
        ok('банерът вече брои 3', !!b2 && txt(b2.querySelector('b')) === '3', txt(b2));
        ok('„📥 Чакат мен" = 3', chipN(h, 'mine') === 3, txt(chip(h, 'mine')));
        ok('„🔍 Чака засечка" = 2', chipN(h, 'recon') === 2, txt(chip(h, 'recon')));
        ok('„Получавам (5 недоставени)" — пак 5', tabSub(h, 'in') === '(5 недоставени)', tabSub(h, 'in'));
      }

      section('2. „📦📤 Всички (N недоставени)"');
      const allN = h.w.transitData.filter(r => h.w.transitRecvStatus(r) === 'pending').length;
      ok('„(' + allN + ' недоставени)" — същото число', tabSub(h, 'all') === '(' + allN + ' недоставени)', tabSub(h, 'all'));

      section('3. „📤 Цялата доставка (N неизпратени)"');
      realClick(h.w, tabBtn(h, 'out')); await settle(5);
      const del = rowBtn(h, 'r8', 'send', /Цялата доставка/);
      if (ok('бутонът е там', !!del)) {
        ok('надпис „📤 Цялата доставка (2 неизпратени)"', txt(del) === '📤 Цялата доставка (2 неизпратени)', txt(del));
        const before = h.stub.writes.length;
        realClick(h.w, del); await settle(10);
        const w = h.stub.writes.slice(before);
        ok('един PATCH по ВД + изпращач, само неизпратените', w.length === 1 && w[0].method === 'PATCH' &&
          /inbound_delivery=eq\.VD99/.test(w[0].url) && w[0].url.indexOf('supplier=eq.' + encodeURIComponent(STORE)) >= 0 &&
          /sender_status=is\.null/.test(w[0].url) && /archived_at=is\.null/.test(w[0].url), JSON.stringify(w));
        ok('тяло sender_status „sent"', w[0] && w[0].body && w[0].body.sender_status === 'sent', JSON.stringify(w[0] && w[0].body));
        ok('двата реда са изпратени локално', ['r8', 'r9'].every(id => h.w.transitSenderSent(h.w.transitData.find(r => r.id === id))));
      }

      section('5. Менюто на обекта — без собствения обект');
      const opts = storeOpts(h);
      ok('„Монтана" не е опция', !!opts && opts.indexOf(STORE) < 0, JSON.stringify(opts));
      ok('другата страна е там (Враца, склад Търговище)', !!opts && opts.indexOf('Враца') >= 0 && opts.indexOf(WH) >= 0, JSON.stringify(opts));
      h.close();
    }
  }

  section('1в. Обект без засечка — банерът и „Чакат мен" както досега');
  {
    const rows = montana().map(r => Object.assign({}, r, { recon_at: null, recon_by: null, recon_side: null }));
    const h = await open(STORE_USER, rows);
    if (h) {
      ok('банерът брои 5', txt(h.doc.querySelector('#t-recv-note b')) === '5', txt(h.doc.getElementById('t-recv-note')));
      ok('„Чакат мен" = 5', chipN(h, 'mine') === 5);
      ok('t-other-note: 2 реда', txt(h.doc.getElementById('t-other-note')) === '📤 2 ваши изпратени реда чакат получателя.', txt(h.doc.getElementById('t-other-note')));
      h.close();
    }
  }

  section('1г. Всички чакащи са със засечка — без банер и без скок');
  {
    seq = 0;
    const h = await open(STORE_USER, [row(RECON), row(RECON)]);
    if (h) {
      ok('без t-recv-note', !h.doc.getElementById('t-recv-note'));
      ok('без скок в „Чакат мен"', h.w.transitFilter !== 'mine', h.w.transitDir + '/' + h.w.transitFilter);
      h.close();
    }
  }

  section('1д. Таб „Получавам (N недоставени)" — 3 изпратени реда, всички със засечка (решение 19.11.2026)');
  {
    seq = 0;
    const h = await open(STORE_USER, [row(RECON), row(RECON), row(RECON)]);
    if (h) {
      ok('банер няма', !h.doc.getElementById('t-recv-note'));
      realClick(h.w, tabBtn(h, 'in')); await settle(5);
      ok('„📥 Чакат мен" = 0', chipN(h, 'mine') === 0, txt(chip(h, 'mine')));
      ok('табът „(3 недоставени)", без „чакат"', tabSub(h, 'in') === '(3 недоставени)', tabSub(h, 'in'));
      ok('кликът на таба → чип „⏳ Все още недоставени"', h.w.transitFilter === 'pending', h.w.transitFilter);
      ok('… и точно 3 реда в таблицата', h.w._transitVisible.length === 3 &&
        ['r1', 'r2', 'r3'].every(id => !!mod(h).querySelector('button[data-id="' + id + '"]')), h.w._transitVisible.length);
      h.close();
    }
  }

  section('4, 5, 6, 7. Офис');
  {
    seq = 0;
    const rows = [
      row({ supplier: 'Логистичен склад Добрич', store_name: 'Враца' }),
      row({ supplier: 'Габрово', store_name: 'Враца', direction: 'transfer' }),
      row({ supplier: 'Сервиз Троян', store_name: 'Враца', direction: 'outgoing' }),
      row({ supplier: WH, store_name: STORE })
    ];
    const h = await open(OFFICE_USER, rows);
    if (h) {
      h.w.transitDir = 'all'; h.w.transitFilter = 'all'; h.w.transitStore = ''; h.w.renderTransit();
      ok('видимият текст на модула е без outgoing / incoming', !/outgoing|incoming/i.test(txt(mod(h))), (txt(mod(h)).match(/.{30}(outgoing|incoming).{30}/i) || [''])[0]);

      const opts = storeOpts(h);
      ok('менюто на офиса — с Монтана и с Враца', !!opts && opts.indexOf(STORE) >= 0 && opts.indexOf('Враца') >= 0, JSON.stringify(opts));

      const badge = id => { const b = mod(h).querySelector('button[data-id="' + id + '"]'); const tr = b && b.closest('tr'); return tr ? txt(tr.querySelector('.t-badge')) : ''; };
      ok('склад → „🏭 От склад"', badge('r1') === '🏭 От склад', badge('r1'));
      ok('магазин → „🏬 От магазин"', badge('r2') === '🏬 От магазин', badge('r2'));
      ok('друго → „🏢 От Сервиз Троян"', badge('r3') === '🏢 От Сервиз Троян', badge('r3'));

      /* Формата */
      guard('openTransitAdd', () => h.w.openTransitAdd());
      const m = h.doc.getElementById('transit-modal');
      const optOut = m && m.querySelector('#tr-direction option[value="outgoing"]');
      ok('формата: value="outgoing" е на място, надпис „Друго (изходящо)"', !!optOut && txt(optOut) === 'Друго (изходящо)', txt(optOut));
      ok('формата: без outgoing във видимия текст', !!m && !/outgoing|incoming/i.test(txt(m)), txt(m).slice(0, 120));
      ok('подсказка „чакаме втори палет"', h.doc.getElementById('tr-comment').getAttribute('placeholder') === 'напр. дойде непълно, чакаме втори палет', h.doc.getElementById('tr-comment').getAttribute('placeholder'));
      ok('без „пале" като дума', !/пале(?![а-я])/.test(h.doc.getElementById('tr-comment').getAttribute('placeholder')));
      if (h.w.closeTransitModal) guard('closeTransitModal', () => h.w.closeTransitModal());

      /* Прегледът на импорта */
      const plan = { rows: [{ store_name: 'Враца', direction: 'incoming' }, { store_name: 'Враца', direction: 'outgoing' }, { store_name: 'Габрово', direction: 'transfer' }],
        skipped: [], only2: [], newRows: [], updRows: [], archiveIds: [], f1Total: 3, recognized: 3, blocked: false, revived: 0 };
      guard('renderTransitImportPreview', () => h.w.renderTransitImportPreview(plan));
      const ov = h.doc.getElementById('transit-import-ov');
      ok('прегледът: „📤 ИЗПРАЩАМ (изходящи) — 1 реда"', !!ov && /📤 ИЗПРАЩАМ \(изходящи\) — 1 реда/.test(txt(ov)), txt(ov).slice(0, 300));
      ok('прегледът: без outgoing / incoming', !!ov && !/outgoing|incoming/i.test(txt(ov)), (txt(ov).match(/.{30}(outgoing|incoming).{30}/i) || [''])[0]);
      const plan0 = Object.assign({}, plan, { rows: plan.rows.filter(r => r.direction !== 'outgoing') });
      guard('renderTransitImportPreview без изходящи', () => h.w.renderTransitImportPreview(plan0));
      ok('прегледът: „Няма изходящи записи"', /Няма изходящи записи/.test(txt(h.doc.getElementById('transit-import-ov'))));

      /* Excel */
      const cap = { aoa: null };
      h.w.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: a => { cap.aoa = a; return {}; }, book_append_sheet: () => {} }, writeFile: () => {} };
      guard('exportTransitExcel', () => h.w.exportTransitExcel());
      const kinds = cap.aoa ? cap.aoa.slice(1).map(r => r[0]) : [];
      ok('Excel „Посока": От склад / От магазин / От Сервиз Троян / От склад',
        JSON.stringify(kinds) === JSON.stringify(['От склад', 'От магазин', 'От Сервиз Троян', 'От склад']), JSON.stringify(kinds));
      ok('нищо не е записано в базата', h.stub.writes.length === 0, JSON.stringify(h.stub.writes));
      h.close();
    }
  }

  section('7б. Изпращач без име — „От склад", не „От "');
  {
    const h = await open(OFFICE_USER, []);
    if (h) {
      ok('празен supplier → „🏭 От склад"', h.w.transitSenderKindLabel({ supplier: '' }) === '🏭 От склад', h.w.transitSenderKindLabel({ supplier: '' }));
      ok('име с „<" се ескейпва в баджа', h.w.transitRowBadgeHtml({ supplier: 'А<b>' }, '').indexOf('А&lt;b&gt;') >= 0, h.w.transitRowBadgeHtml({ supplier: 'А<b>' }, ''));
      h.close();
    }
  }

  report();
})();
