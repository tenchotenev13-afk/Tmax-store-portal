/* „Стока на път", етап 1 (03.11.2026): импорт с ДВА файла от SAP, ВД / ИД на
   реда, сверка при повторен импорт, архив вместо „Изчисти всички".

   Данните са малки синтетични масиви с ИСТИНСКИТЕ header-и на двата файла
   (от SAP износите на 02.11.2026). Тестът минава през реалните функции в
   transit.js, зареден в реда от index.html, и натиска истинските бутони.

   Проверки:
     а) ред без ВД не влиза; ред само във файл 2 не влиза; броят в прегледа
        съвпада с POST тялото;
     б) ИД без водещи нули; delivery_qty от файл 2; position от файл 1,
        delivery_position от файл 2;
     в) втори импорт: ред 'received' с коментар ги пази и обновява
        количеството; липсващ ред → archived_at; ред с inbound_delivery = null
        не се пипа; архивиран ред, който се появи пак, излиза от архива;
        архивирането е СЛЕД всички партиди;
     г) провалена партида → няма архивиране, червен toast;
     д) търсене по ВД, по ИД с и без нули;
     е) архивът не се вижда и не се брои по подразбиране; реален клик на
        „🗄 Архив" го показва; чипът е видим и при 0; няма <button> за статус
        на архивиран ред;
     ж) няма бутон „Изчисти всички"; без двата файла импортът не тръгва.

   Мутационна проверка (03.11.2026, всеки вариант върху чист transit.js;
   чистият код — exit 0 преди кръга). И петте падат (exit 1):
     1. без филтъра за ВД (редовете без двойка влизат)       → ❌ а), в)
     2. архивиране и при провалена партида                    → ❌ г)
     3. ИД с водещите нули (без transitStripZeros при разбора) → ❌ б)
        (д) остава зелена: търсенето реже нулите и от двете страни)
     4. сверка по position вместо delivery_position           → ❌ в)
     5. архивът в transitData (без transitSplitArchive)       → ❌ е)
     6. imported_at само за новите редове (не при обновяване)  → ❌ в)
     7. imported_at изобщо не се праща                        → ❌ в)
   Прозорецът по imported_at в Бюлетина (bulletin.js) е заключен в
   task-span-weeks.test.js (раздел 13); мутант 8 — '&created_at=gte.' там
   → ❌. Функциите в базата — tests/sql/transit-*.test.sql (след миграцията).

   Пускане:  node tests/transit-vd-import.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const ADMIN = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис'
};
const STORE_USER = {
  email: 'targovishte@temax.bg', display_name: 'Търговище',
  role: 'manager', store_name: 'Търговище'
};

/* Истинските header-и (SAP, 02.11.2026). */
const HEAD1 = ['Завод', 'Склад', 'Доставчик/доставящ завод', 'Документ за покупка', 'Позиция',
  'Вид документ закуп.', 'Търг. организация', 'Снабдителска група', 'Инд. за изтриване',
  'История ПД/документация деблокиране', 'Дата на документ', 'Материал', 'Кратък текст',
  'Група материали', 'Категория контировка', 'Количество поръчка', 'МЕ поръчка',
  'Все още недоставено (колич.)'];
const HEAD2 = ['Доставка', 'Позиция', 'Материал', 'Описание на позиция', 'К-во по доставка',
  'Ед. за измерв. прод.', 'СтатусДвижениеСтоки', 'Пункт експ./пункт получав.', 'Доставчик',
  'Име на доставчик', 'Документ за покупка', 'Външен идентиф. на доставка', 'Дата на дос. (от/к.)'];

function r1(plant, supplier, doc, pos, mat, qty) {
  return [plant, '1000', supplier, doc, String(pos), 'ZUB', '5500', '112', '', '',
    '14.10.2026', mat, 'Материал ' + mat, '10171110', '', qty, 'БР', qty];
}
function r2(vd, dpos, mat, qty, doc, id) {
  return [vd, dpos, mat, 'Материал ' + mat, qty, 'БР', 'A', '5512', '5518',
    '5518 Логистичен склад Добрич', doc, id, '15.10.2026'];
}

/* Файл 1: 4 реда. D2/M3 няма ВД. D1 е с две позиции в поръчката (10, 20). */
const F1 = [HEAD1,
  r1('5512', '5518 5518 Логистичен склад Добрич', 'D1', 10, 'M1', 10),
  r1('5512', '5518 5518 Логистичен склад Добрич', 'D1', 20, 'M2', 8),
  r1('5520', '5518 5518 Логистичен склад Добрич', 'D2', 10, 'M3', 4),
  r1('6512', '6516 Добрич', 'D3', 10, 'M4', 3)
];
/* Файл 2: позициите в ДОСТАВКАТА са различни от тези в поръчката.
   180000009 / M9 / D9 го няма във файл 1. */
function F2(q1) {
  return [HEAD2,
    r2('180000001', '900001', 'M1', q1 == null ? 7 : q1, 'D1', '0080472987'),
    r2('180000001', '900002', 'M2', 5, 'D1', '0080472987'),
    r2('180000003', '10', 'M4', 2, 'D3', '0080000123'),
    r2('180000009', '10', 'M9', 1, 'D9', '0080000999')
  ];
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'transit.js'],
    user: opts.user || ADMIN,
    data: { goods_transit: opts.existing || [], stores: [], users: [] },
    fail: opts.fail
  });
  /* Цветът на toast-а: harness-ът пази само текста. */
  h.toasts = [];
  const t0 = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: String(m), c: c }); t0(m, c); };
  /* Редът на пишещите заявки — архивирането трябва да е последно. */
  h.seq = [];
  const f0 = h.w.fetch;
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    if (m !== 'GET') h.seq.push(m + ' ' + String(url));
    return f0(url, init);
  };
  h.w.loadTransit = () => {};   /* презареждането след импорта не е предмет тук */
  return h;
}

async function runImport(h, f1, f2) {
  h.w.openTransitImportModal();
  h.w.transitImportSetFile('Стока на път- 02.11.XLSX', f1);
  h.w.transitImportSetFile('ВД и ИД.XLSX', f2);
  await h.w.transitImportPrepare();
  await ticks(3);
}
async function clickImport(h) {
  const ov = h.doc.getElementById('transit-import-ov');
  const b = btn(ov, 'Импортирай');
  if (!ok('бутонът „Импортирай" съществува', !!b)) return;
  realClick(h.w, b, 'Импортирай');
  for (let i = 0; i < 40; i++) await ticks(3);
}
const num = (h, id) => {
  const el = h.doc.querySelector('#' + id + ' b');
  return el ? Number(el.textContent) : NaN;
};
const upserts = h => h.calls.post.filter(p => /goods_transit\?on_conflict=inbound_delivery,delivery_position/.test(p.url));
const archPatches = h => h.calls.patch.filter(p => p.table === 'goods_transit' && p.body && 'archived_at' in p.body);

(async function run() {

  section('а) Без ВД не влиза; само във файл 2 не влиза; прегледът = записът');
  {
    const h = env();
    await runImport(h, F1, F2());
    const ov = h.doc.getElementById('transit-import-ov');
    ok('прегледът се отваря', !!ov && /преглед/.test(ov.textContent));
    ok('редове във файл 1 = 4', num(h, 't-imp-f1') === 4, num(h, 't-imp-f1'));
    ok('с ВД за запис = 3', num(h, 't-imp-vd') === 3, num(h, 't-imp-vd'));
    ok('без ВД = 1', num(h, 't-imp-skip') === 1, num(h, 't-imp-skip'));
    ok('само във файл 2 = 1', num(h, 't-imp-only2') === 1, num(h, 't-imp-only2'));
    ok('нови = 3, обновяват се = 0, в архив = 0',
      num(h, 't-imp-new') === 3 && num(h, 't-imp-upd') === 0 && num(h, 't-imp-arch') === 0);
    const sk = h.doc.getElementById('t-imp-skip-stores');
    ok('пропуснатите без ВД са по обект (Силистра 1)', !!sk && /Силистра\s*1/.test(sk.textContent), sk && sk.textContent);
    ok('бутонът казва 3 реда', !!btn(ov, 'Импортирай 3 реда'));
    await clickImport(h);
    const body = [].concat.apply([], upserts(h).map(p => p.body));
    ok('POST upsert с on_conflict по ВД + позиция в доставката', upserts(h).length >= 1, h.calls.post.map(p => p.url).join(' | '));
    ok('записани точно 3 реда', body.length === 3, body.length);
    ok('редът без ВД (D2) не е записан', !body.some(b => b.purchase_doc === 'D2'));
    ok('редът само от файл 2 (M9) не е записан', !body.some(b => b.material_code === 'M9'));
    ok('новите са със status pending', body.every(b => b.status === 'pending'));
    ok('архивиране няма (празна база)', archPatches(h).length === 0);
    const t = h.toasts.filter(x => /Импорт:/.test(x.m))[0];
    ok('зелен toast с броя', !!t && /3 нови, 0 обновени, 0 в архива/.test(t.m), h.toasts.map(x => x.m).join(' | '));
  }

  section('б) ИД без нули; delivery_qty от файл 2; position от 1, delivery_position от 2');
  {
    const h = env();
    await runImport(h, F1, F2());
    await clickImport(h);
    const body = [].concat.apply([], upserts(h).map(p => p.body));
    const m1 = body.filter(b => b.material_code === 'M1')[0] || {};
    ok('ИД е 80472987 (без водещите нули)', m1.outbound_delivery === '80472987', m1.outbound_delivery);
    ok('ВД е 180000001', m1.inbound_delivery === '180000001', m1.inbound_delivery);
    ok('delivery_qty = 7 (от файл 2, не 10 от поръчката)', m1.delivery_qty === 7, m1.delivery_qty);
    ok('ordered_qty остава 10 (от файл 1)', m1.ordered_qty === 10, m1.ordered_qty);
    ok('position = 10 (позицията в поръчката, файл 1)', String(m1.position) === '10', m1.position);
    ok('delivery_position = 900001 (файл 2)', m1.delivery_position === '900001', m1.delivery_position);
    const m4 = body.filter(b => b.material_code === 'M4')[0] || {};
    ok('посоката на трансфера не е пипната (6512 ← Добрич → transfer)', m4.direction === 'transfer', m4.direction);
  }

  section('в) Втори импорт: пази статуса, обновява, архивира, не пипа ръчните');
  {
    const at = '2026-10-20T08:00:00Z';
    const existing = [
      /* в импорта, приет, с коментар */
      { id: 'e1', inbound_delivery: '180000001', delivery_position: '900001', archived_at: null,
        status: 'received', comment: 'ок, прието', store_name: 'Търговище', direction: 'incoming' },
      /* липсва в новия импорт */
      { id: 'e2', inbound_delivery: '180000005', delivery_position: '10', archived_at: null,
        status: 'pending', store_name: 'Търговище', direction: 'incoming' },
      /* ръчен ред — без ВД */
      { id: 'e3', inbound_delivery: null, delivery_position: null, archived_at: null,
        status: 'pending', store_name: 'Търговище', direction: 'incoming' },
      /* архивиран, но ВД-то се появява пак */
      { id: 'e4', inbound_delivery: '180000003', delivery_position: '10', archived_at: at,
        status: 'pending', store_name: 'Търговище', direction: 'transfer' },
      /* същото position като M2 (20), ДРУГО delivery_position — не е същият ред */
      { id: 'e5', inbound_delivery: '180000001', delivery_position: '20', archived_at: null,
        status: 'pending', store_name: 'Търговище', direction: 'incoming' }
    ];
    const h = env({ existing });
    await runImport(h, F1, F2(6));
    ok('нови = 1 (M2 / 900002)', num(h, 't-imp-new') === 1, num(h, 't-imp-new'));
    ok('обновяват се = 2 (e1, e4)', num(h, 't-imp-upd') === 2, num(h, 't-imp-upd'));
    ok('от тях излизат от архива = 1', num(h, 't-imp-revived') === 1, num(h, 't-imp-revived'));
    ok('отиват в архив = 2 (e2, e5)', num(h, 't-imp-arch') === 2, num(h, 't-imp-arch'));
    await clickImport(h);
    const ups = upserts(h);
    const bodies = [].concat.apply([], ups.map(p => p.body));
    const e1 = bodies.filter(b => b.inbound_delivery === '180000001' && b.delivery_position === '900001')[0] || {};
    ok('обновеният ред НЕ праща status', !('status' in e1), JSON.stringify(e1));
    ok('обновеният ред НЕ праща comment, reviewed_*, transfer_date',
      !('comment' in e1) && !('reviewed_at' in e1) && !('reviewed_by' in e1) && !('transfer_date' in e1));
    ok('обновеният ред носи новото количество 6', e1.delivery_qty === 6, e1.delivery_qty);
    /* Решение А (03.11.2026): прозорецът на авто-отметката е по imported_at —
       пише се при ВСЕКИ upsert, иначе оцелелият ред остава извън прозореца. */
    const stamp = b => typeof b.imported_at === 'string' && !isNaN(Date.parse(b.imported_at));
    ok('обновеният ред носи imported_at', stamp(e1), e1.imported_at);
    const nw = bodies.filter(b => b.delivery_position === '900002')[0] || {};
    ok('новият ред носи imported_at', stamp(nw), nw.imported_at);
    ok('всички редове в импорта — с еднакъв imported_at', bodies.length > 0 && bodies.every(b => b.imported_at === bodies[0].imported_at),
      JSON.stringify(bodies.map(b => b.imported_at)));
    ok('created_at не се праща (остава първото внасяне)', bodies.every(b => !('created_at' in b)));
    const e4 = bodies.filter(b => b.inbound_delivery === '180000003')[0] || {};
    ok('архивираният, появил се пак, получава archived_at = null', 'archived_at' in e4 && e4.archived_at === null, JSON.stringify(e4));
    ok('и пак без status', !('status' in e4));
    const ap = archPatches(h);
    const ids = ap.map(p => p.url).join(' ');
    ok('архивирането е PATCH с archived_at', ap.length === 1 && !!ap[0].body.archived_at, ap.length);
    ok('архивирани са e2 и e5', /e2/.test(ids) && /e5/.test(ids), ids);
    ok('ръчният ред e3 не е пипнат', !/e3/.test(ids) && !bodies.some(b => b.id === 'e3'));
    ok('e1 и e4 не са архивирани', !/e1|e4/.test(ids), ids);
    ok('PATCH-ът пази вече архивираните (archived_at=is.null)', /archived_at=is\.null/.test(ids), ids);
    const lastPost = h.seq.map(s => s.indexOf('POST') === 0).lastIndexOf(true);
    const firstArch = h.seq.findIndex(s => s.indexOf('PATCH') === 0);
    ok('архивирането е СЛЕД всички партиди', firstArch > lastPost && lastPost >= 0, h.seq.join(' | '));
  }

  section('г) Провалена партида → без архивиране, червен toast');
  {
    const existing = [
      { id: 'g2', inbound_delivery: '180000005', delivery_position: '10', archived_at: null, status: 'pending', store_name: 'Търговище' }
    ];
    const h = env({ existing, fail: { POST: /goods_transit/ } });
    await runImport(h, F1, F2());
    ok('прегледът обещава 1 за архив', num(h, 't-imp-arch') === 1);
    await clickImport(h);
    ok('опитът за запис е направен', upserts(h).length >= 1);
    ok('НЯМА архивиране', archPatches(h).length === 0, archPatches(h).length);
    const t = h.toasts.filter(x => /архивирането е пропуснато/.test(x.m))[0];
    ok('toast „архивирането е пропуснато"', !!t, h.toasts.map(x => x.m).join(' | '));
    ok('toast-ът е червен', !!t && t.c === '#dc2626', t && t.c);
    ok('няма зелен „Импорт:" toast', !h.toasts.some(x => /^✅ Импорт:/.test(x.m)));
  }

  section('д) Търсене по ВД и по ИД — с и без водещите нули');
  {
    const h = env();
    h.w.transitData = [
      { id: 's1', direction: 'incoming', status: 'pending', store_name: 'Търговище', purchase_doc: 'D1',
        material_code: 'M1', material_name: 'Първи', inbound_delivery: '180000001', outbound_delivery: '80472987', delivery_qty: 7 },
      { id: 's2', direction: 'incoming', status: 'pending', store_name: 'Търговище', purchase_doc: 'D2',
        material_code: 'M2', material_name: 'Втори', inbound_delivery: '180000002', outbound_delivery: '80000123' },
      /* нули само в ИД — „00" не бива да го намери през ИД */
      { id: 's3', direction: 'incoming', status: 'pending', store_name: 'Търговище', purchase_doc: 'P',
        material_code: 'X', material_name: 'Трети', inbound_delivery: '1', outbound_delivery: '80' }
    ];
    h.w.transitFilter = 'all';
    const shown = q => {
      h.w.transitSearch = q; h.w.renderTransit();
      return h.w._transitVisible.map(r => r.id).join(',');
    };
    ok('по ВД 180000001 → s1', shown('180000001') === 's1', shown('180000001'));
    ok('по ИД с нулите 0080472987 → s1', shown('0080472987') === 's1', shown('0080472987'));
    ok('по ИД без нулите 80472987 → s1', shown('80472987') === 's1', shown('80472987'));
    ok('по ИД 0080000123 → s2', shown('0080000123') === 's2', shown('0080000123'));
    ok('„00" не намира ред с нули само в ИД (s3)', shown('00') === 's1,s2', shown('00'));
    h.w.transitSearch = ''; h.w.renderTransit();
    const td = h.doc.querySelector('#mod-transit .t-vd');
    ok('редът показва „ВД 180000001"', !!td && /ВД\s*180000001/.test(td.textContent), td && td.textContent);
    const ti = h.doc.querySelector('#mod-transit .t-id');
    ok('редът показва „ИД 80472987"', !!ti && /ИД\s*80472987/.test(ti.textContent), ti && ti.textContent);
    const q = h.doc.querySelector('#mod-transit tbody tr td:nth-child(4)');
    ok('количеството на реда е delivery_qty (7)', !!q && /^7(\D|$)/.test(q.textContent.trim()), q && q.textContent);
  }

  section('е) Архивът: скрит и неброен по подразбиране; чипът „🗄 Архив"');
  {
    const h = env({ user: STORE_USER });
    h.w.transitData = [
      { id: 'a1', direction: 'incoming', status: 'pending', store_name: 'Търговище', purchase_doc: 'D1',
        material_code: 'M1', material_name: 'АКТИВЕН', inbound_delivery: '180000001' },
      { id: 'a2', direction: 'incoming', status: 'pending', store_name: 'Търговище', purchase_doc: 'D2',
        material_code: 'M2', material_name: 'АРХИВИРАН', inbound_delivery: '180000002',
        archived_at: '2026-11-01T08:00:00Z' }
    ];
    h.w.transitFilter = 'pending';
    h.w.renderTransit();
    const mod = () => h.doc.getElementById('mod-transit');
    ok('по подразбиране архивираният ред не се вижда', !/АРХИВИРАН/.test(mod().textContent));
    ok('активният се вижда', /АКТИВЕН/.test(mod().textContent));
    const chip = f => mod().querySelector('[data-tt-f="' + f + '"] .chips-n');
    ok('„Не доставени" брои 1 (без архива)', chip('pending') && chip('pending').textContent === '1', chip('pending') && chip('pending').textContent);
    ok('„Всички" брои 1 (без архива)', chip('all') && chip('all').textContent === '1', chip('all') && chip('all').textContent);
    const cnt = h.doc.getElementById('t-review-counter');
    ok('броячът на обекта: необработени 1 (без архива)', !!cnt && /необработени 1/.test(cnt.textContent), cnt && cnt.textContent);
    ok('„Провери всички чакащи (1)"', !!btn(mod(), 'Провери всички чакащи (1)'));
    ok('табът „Получавам" брои 1 чакащ', /\(1 чакат\)/.test(mod().textContent));
    const ach = chip('archive');
    ok('чипът „🗄 Архив" брои 1', !!ach && ach.textContent === '1', ach && ach.textContent);
    const archBtn = mod().querySelector('[data-tt-f="archive"]');
    if (ok('чипът „🗄 Архив" е <button>', !!archBtn && archBtn.tagName === 'BUTTON')) {
      realClick(h.w, archBtn, '🗄 Архив');
      ok('след клик архивираният ред се вижда', /АРХИВИРАН/.test(mod().textContent));
      ok('и активният не', !/АКТИВЕН/.test(mod().textContent));
      ok('бележката за архива е там', !!h.doc.getElementById('t-archive-note'));
      const body = mod().querySelector('table tbody');
      const stBtns = body ? Array.from(body.querySelectorAll('button')) : null;
      ok('в реда на архивирания няма нито един <button>', !!stBtns && stBtns.length === 0,
        stBtns && stBtns.map(b => b.textContent).join(' | '));
      ok('няма „Провери всички чакащи" в архива', !btn(mod(), 'Провери всички чакащи'));
      ok('баджът „🗄 архив" е на реда', !!mod().querySelector('.t-archived'));
    }
    /* Чипът е видим и при 0. */
    const h0 = env({ user: STORE_USER });
    h0.w.transitData = [{ id: 'z1', direction: 'incoming', status: 'pending', store_name: 'Търговище', material_name: 'X' }];
    h0.w.renderTransit();
    const z = h0.doc.querySelector('#mod-transit [data-tt-f="archive"] .chips-n');
    ok('чипът „🗄 Архив" е видим и при 0', !!z && z.textContent === '0', z && z.textContent);
    ok('редът без ВД няма „ВД"/„ИД"', !h0.doc.querySelector('#mod-transit .t-vd') && !h0.doc.querySelector('#mod-transit .t-id'));
  }

  section('ж) Няма „Изчисти всички"; без двата файла импортът не тръгва');
  {
    const h = env();
    h.w.transitData = [{ id: 'x1', direction: 'incoming', status: 'pending', store_name: 'Търговище', material_name: 'X' }];
    h.w.renderTransit();
    ok('няма бутон „Изчисти всички"', !btn(h.doc.getElementById('mod-transit'), 'Изчисти всички'));
    ok('confirmClearTransit я няма', typeof h.w.confirmClearTransit === 'undefined');
    ok('бутонът „📥 Импорт Excel" е там', !!btn(h.doc.getElementById('mod-transit'), 'Импорт Excel'));

    h.w.openTransitImportModal();
    h.w.transitImportSetFile('Стока на път- 02.11.XLSX', F1);
    const ov = h.doc.getElementById('transit-import-ov');
    ok('слотът на файл 2 казва „липсва"', !!ov && /Файл 2[^—]*— липсва/.test(ov.textContent), ov && ov.textContent);
    const next = btn(ov, 'Напред');
    if (ok('бутонът „Напред →" съществува', !!next)) {
      realClick(h.w, next, 'Напред');
      await ticks(5);
      const t = h.toasts.filter(x => /Липсва/.test(x.m))[0];
      ok('червен toast „Липсва файл 2 „ВД и ИД""', !!t && /файл 2/.test(t.m) && t.c === '#dc2626', h.toasts.map(x => x.m).join(' | '));
      ok('нищо не е записано', upserts(h).length === 0 && h.calls.get.filter(u => /goods_transit/.test(u)).length === 0);
    }
    /* Само файл 2 → казва, че липсва файл 1. */
    h.w.openTransitImportModal();
    h.w.transitImportSetFile('ВД и ИД.XLSX', F2());
    await h.w.transitImportPrepare();
    ok('само файл 2 → „Липсва файл 1"', h.toasts.some(x => /Липсва файл 1/.test(x.m)), h.toasts.map(x => x.m).join(' | '));
    ok('разпознаване по header: файл 2 → vd, файл 1 → transit',
      h.w.transitFileKind(F2()) === 'vd' && h.w.transitFileKind(F1) === 'transit');
  }

  report();
})();
