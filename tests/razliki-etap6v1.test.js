/* Разлики, етап 6в-1 — чипове за логистичния склад (решения т.4 — „за склада
   по обем“). Едно правило sdWhChipKind(l, rep) за броя и за филтъра:
     'noanswer'  — без отговор на склада;
     'willsend7' — will_send без отговор на обекта, редът подаден преди 7+
                   денонощия (ТОЧНО 7×24 ч ВЛИЗА — избрано правило, заковано в §3);
     'takeback'  — return + sap_done („Ход: склада — „📬 Прието обратно““);
     null        — приключен, насочен по 5а, отворена размяна, „Ход: ЦО“.

   1. Склад: трите чипа с верните N върху смесени данни (насочен ред, „Ход: ЦО“,
      will_send на 6 и на 8 дни, приключен ред, размяна, чужд склад, прегледана
      бланка); клик → само бланките с такъв ред; втори клик → всички; друг чип
      сменя избора; смяна на подтаб (setSDDirTab) → нулиран; при 0 — видими.
   2. admin, обект, Миглена (razliki_co) — нито един от трите (само <button>).
   3. Граница: will_send точно 7×24 ч (−1 мин / точно / +1 мин).
   4. 6а / 6б не са счупени: чипът „🏢 Ход: ЦО“, бутоните на склада по категория.

   Мутационна проверка (18.11.2026, мутант върху stock-differences.js, файлът —
   върнат от копие и сверен с cmp; чистият код: exit 0, 47/47):
     М1  насоченият ред влиза в „Без отговор“ (без проверката who === warehouse) → 5 ❌
     М2  чипът брои приключени (ходът се смята като при status new)            → 8 ❌
     М3  прагът 7 дни обърнат (< вместо >=)                                     → 5 ❌
     М3б точно 7 денонощия не влиза (> вместо >=)                              → 1 ❌
     М4  чиповете за всички роли (sdWhChipsHere → true)                        → 3 ❌
     М5  вторият клик не маха активния чип                                     → 1 ❌
   Всички — exit 1. Изключенията идват само от sdInterstoreTurn (6а): при
   двойна проверка М1 и М2 оцеляваха (0 ❌) — затова не се дублират.

   Пускане:  node tests/razliki-etap6v1.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WH2 = 'Логистичен склад Добрич';
const DAY = 86400000;
const ago = ms => new Date(Date.now() - ms).toISOString();
const U = {
  admin: { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  migl:  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  wh:    { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH },
  wh2:   { id: 'u-wh2', email: 'wh2@temax.bg', display_name: 'Склад Добрич', role: 'logistics', store_name: WH2 },
  store: { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: 'Карлово' }
};
const DBU = [
  { id: 'u-adm', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-mp', notify_groups: ['controlling', 'razliki_co'], is_regional: false, assigned_stores: [] },
  { id: 'u-wh', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-wh2', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-st', notify_groups: [], is_regional: false, assigned_stores: [] }
];
const rep = (id, store, extra) => Object.assign({ id, direction: 'interstore', store_name: store, counterpart: WH, document_number: 'D' + id,
  doc_date: '2026-11-10', submitted_by: store, general_comment: '', photos: [], reviewed: false, created_at: ago(10 * DAY) }, extra || {});
const line = (id, rid, store, cat, extra) => Object.assign({ id, report_id: rid, store_name: store, supplier: WH, material_code: 'S' + id,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр', difference_category: cat, type: null, status: 'new',
  warehouse_response: null, store_response: null, attachments: [], created_at: ago(10 * DAY) }, extra || {});

/* Бланки:
   rA (Карлово)  — a1 без отговор, a2 насочен pack_mismatch, a3 „Ход: ЦО“
   rB (Пловдив)  — b1 will_send 8 дни, b2 will_send 6 дни
   rC (Раднево)  — c1 return+sap_done, c2 приключен (received, без отговор)
   rD (Русе)     — d1 без отговор, но с отворена размяна; d2 sent (ход на обекта)
   rE (Шумен)    — e1 без отговор (втори ред за „Без отговор“), e2 return+sap_done, приключен
   rF (Варна)    — f1 без отговор, ЧУЖД склад (Добрич)
   rG (Бургас)   — g1 без отговор, бланката е ПРЕГЛЕДАНА (не е в горната секция)
   rH (Габрово)  — h1 return+sap_done, бланката чака имейл (email_pending) — влиза */
const REPS = [
  rep('rA', 'Карлово'), rep('rB', 'Пловдив'), rep('rC', 'Раднево'), rep('rD', 'Русе'), rep('rE', 'Шумен'),
  rep('rF', 'Варна', { counterpart: WH2 }), rep('rG', 'Бургас', { reviewed: true }),
  rep('rH', 'Габрово', { reviewed: true, email_pending: true })
];
const LINES = [
  line('a1', 'rA', 'Карлово', 'undelivered'),
  line('a2', 'rA', 'Карлово', 'pack_mismatch'),
  line('a3', 'rA', 'Карлово', 'excess', { warehouse_response: 'return', store_response: 'no_stock' }),
  line('b1', 'rB', 'Пловдив', 'undelivered', { warehouse_response: 'will_send', created_at: ago(8 * DAY) }),
  line('b2', 'rB', 'Пловдив', 'undelivered', { warehouse_response: 'will_send', created_at: ago(6 * DAY) }),
  line('c1', 'rC', 'Раднево', 'excess', { warehouse_response: 'return', store_response: 'sap_done' }),
  line('c2', 'rC', 'Раднево', 'undelivered', { status: 'received', completed_by: 'Миглена Павлова', completed_at: ago(DAY), resolution_comment: 'Ок' }),
  line('d1', 'rD', 'Русе', 'undelivered'),
  line('d2', 'rD', 'Русе', 'undelivered', { warehouse_response: 'sent' }),
  line('e1', 'rE', 'Шумен', 'excess'),
  line('e2', 'rE', 'Шумен', 'excess', { warehouse_response: 'return', store_response: 'sap_done', status: 'received' }),
  line('f1', 'rF', 'Варна', 'undelivered', { supplier: WH2 }),
  line('g1', 'rG', 'Бургас', 'undelivered'),
  line('h1', 'rH', 'Габрово', 'undelivered', { warehouse_response: 'return', store_response: 'sap_done' })
];
const SWAPS = [{ id: 'sw1', from_line_id: 'zz', to_line_id: 'd1', from_store: 'Пловдив', to_store: 'Русе', warehouse: WH, status: 'linked', created_at: ago(DAY) }];

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const clone = x => JSON.parse(JSON.stringify(x));

function env(user, lines, reps, swaps) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true,
    data: {
      stock_differences: clone(lines || LINES), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: clone(swaps || SWAPS), users: DBU, contacts: [],
      differences_reports: clone(reps || REPS), storno_notes: [], storno_note_replies: []
    }
  });
  h.w.pushInterstoreDiff = () => Promise.resolve({ ok: true });
  return h;
}
async function render(h, lines, reps, swaps) {
  h.w.sdData = clone(lines || LINES);
  h.w.diffReports = clone(reps || REPS);
  h.w.sdSwaps = clone(swaps || SWAPS);
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'interstore'; h.w.sdView = 'reports';
  await h.w.sdLoadMe(); await settle();
  h.w.renderStockDiff();
}
const chip = (h, k) => h.doc.querySelector('button#sd-wh-chip-' + k);
const chipText = (h, k) => { const b = chip(h, k); return b ? b.textContent.trim() : null; };
const shownReps = h => Array.prototype.map.call(h.doc.querySelectorAll('[id^="diff-rep-"]'), el => el.id.replace('diff-rep-', ''))
  .filter((x, i, a) => a.indexOf(x) === i).sort().join(',');
const anyWhChipBtn = h => Array.prototype.some.call(h.doc.querySelectorAll('button'), b => /^sd-wh-chip-/.test(b.id || '') || /setSDWhChip/.test(b.getAttribute('onclick') || ''));

(async function run() {

  section('0. Правилото sdWhChipKind — по ред');
  {
    const h = env(U.wh);
    await render(h);
    const exp = { a1: 'noanswer', a2: null, a3: null, b1: 'willsend7', b2: null, c1: 'takeback', c2: null, d1: null, d2: null,
      e1: 'noanswer', e2: null, f1: 'noanswer', g1: 'noanswer', h1: 'takeback' };
    Object.keys(exp).forEach(id => {
      const l = h.w.sdData.find(x => x.id === id), r = h.w.diffReports.find(x => x.id === l.report_id);
      const k = h.w.sdWhChipKind(l, r);
      ok(id + ' → ' + exp[id], k === exp[id], String(k));
    });
    ok('доставчикова бланка → null', h.w.sdWhChipKind(LINES[0], Object.assign({}, REPS[0], { direction: 'supplier' })) === null);
    h.close();
  }

  section('1. Склад Търговище — трите чипа и броят им');
  {
    const h = env(U.wh);
    await render(h);
    /* Видими бланки на склада: rA–rE + rH (rF е на Добрич, rG е прегледана).
       Без отговор: a1, e1 (d1 — размяна; a2 — насочен; f1 — чужд; g1 — прегледана) = 2.
       7+ дни: b1 (b2 — 6 дни) = 1. Прието обратно: c1, h1 (e2 — приключен) = 2. */
    ok('„📝 Без отговор (2)“', chipText(h, 'noanswer') === '📝 Без отговор (2)', chipText(h, 'noanswer'));
    ok('„⏳ Ще се изпрати, подадени преди 7+ дни (1)“', chipText(h, 'willsend7') === '⏳ Ще се изпрати, подадени преди 7+ дни (1)', chipText(h, 'willsend7'));
    ok('„📬 За „Прието обратно“ (2)“', chipText(h, 'takeback') === '📬 За „Прието обратно“ (2)', chipText(h, 'takeback'));
    ok('без избран чип — всички бланки на склада', shownReps(h) === 'rA,rB,rC,rD,rE,rH', shownReps(h));

    realClick(h.w, chip(h, 'noanswer')); await settle();
    ok('клик „Без отговор“ → rA, rE', shownReps(h) === 'rA,rE', shownReps(h));
    ok('… активният чип е оцветен', /background:#2563eb/.test(chip(h, 'noanswer').getAttribute('style')));
    ok('… броевете не се менят от филтъра', chipText(h, 'takeback') === '📬 За „Прието обратно“ (2)');

    realClick(h.w, chip(h, 'willsend7')); await settle();
    ok('клик „7+ дни“ → само rB (един активен чип)', shownReps(h) === 'rB', shownReps(h));
    ok('… „Без отговор“ вече не е активен', !/background:#2563eb/.test(chip(h, 'noanswer').getAttribute('style')));

    realClick(h.w, chip(h, 'takeback')); await settle();
    ok('клик „Прието обратно“ → rC, rH', shownReps(h) === 'rC,rH', shownReps(h));

    realClick(h.w, chip(h, 'takeback')); await settle();
    ok('втори клик на активния → всички', shownReps(h) === 'rA,rB,rC,rD,rE,rH', shownReps(h));

    realClick(h.w, chip(h, 'noanswer')); await settle();
    ok('пак „Без отговор“ → rA, rE', shownReps(h) === 'rA,rE');
    /* Складът няма подтабове по посока — нулирането е в setSDDirTab (и при
       местене на бланка), викано направо. */
    h.w.setSDDirTab('interstore'); await settle();
    ok('смяна на подтаб → нулиран избор', h.w.sdWhChip === '' && shownReps(h) === 'rA,rB,rC,rD,rE,rH', shownReps(h));
    h.close();
  }
  {
    const h = env(U.wh2);
    await render(h);
    ok('Добрич: „Без отговор (1)“ — само своята бланка', chipText(h, 'noanswer') === '📝 Без отговор (1)', chipText(h, 'noanswer'));
    ok('Добрич: при 0 — чиповете са видими', chipText(h, 'willsend7') === '⏳ Ще се изпрати, подадени преди 7+ дни (0)' && chipText(h, 'takeback') === '📬 За „Прието обратно“ (0)');
    realClick(h.w, chip(h, 'takeback')); await settle();
    ok('Добрич: клик на чип с 0 → 0 бланки, чипът остава', shownReps(h) === '' && !!chip(h, 'takeback'), shownReps(h));
    h.close();
  }
  {
    const h = env(U.wh, [], [], []);
    await render(h, [], [], []);
    ok('без нито една бланка — трите чипа са видими с 0',
      chipText(h, 'noanswer') === '📝 Без отговор (0)' && chipText(h, 'willsend7') === '⏳ Ще се изпрати, подадени преди 7+ дни (0)' && chipText(h, 'takeback') === '📬 За „Прието обратно“ (0)');
    h.close();
  }

  section('2. admin, обект, Миглена — без трите чипа');
  for (const [name, u] of [['admin', U.admin], ['обект', U.store], ['Миглена (razliki_co)', U.migl]]) {
    const h = env(u);
    await render(h);
    ok(name + ': нито един чип на склада (<button>)', !anyWhChipBtn(h));
    h.close();
  }

  section('3. Граница — will_send точно 7×24 ч');
  {
    const h = env(U.wh);
    await render(h);
    const r = REPS[1];
    const k = ms => {
      const real = Date.now, t0 = real();
      const l = line('x', 'rB', 'Пловдив', 'undelivered', { warehouse_response: 'will_send', created_at: new Date(t0 - ms).toISOString() });
      h.w.Date.now = () => t0;
      try { return h.w.sdWhChipKind(l, r); } finally { h.w.Date.now = real; }
    };
    ok('7 денонощия − 1 мин → не влиза', k(7 * DAY - 60000) === null);
    ok('ТОЧНО 7 денонощия → влиза (правило „7+ дни“, >=)', k(7 * DAY) === 'willsend7');
    ok('7 денонощия + 1 мин → влиза', k(7 * DAY + 60000) === 'willsend7');
    ok('без created_at → не влиза', h.w.sdWhChipKind(line('y', 'rB', 'Пловдив', 'undelivered', { warehouse_response: 'will_send', created_at: null }), r) === null);
    ok('will_send + отговор на обекта → не влиза', h.w.sdWhChipKind(line('z', 'rB', 'Пловдив', 'undelivered', { warehouse_response: 'will_send', store_response: 'accepted', created_at: ago(9 * DAY) }), r) === null);
    h.close();
  }

  section('4. 6а / 6б не са счупени');
  {
    const h = env(U.migl);
    await render(h);
    const co = h.doc.getElementById('sd-co-turn-chip');
    /* Ход на ЦО: a3 (return + no_stock) и a2 (насочен pack_mismatch). */
    ok('Миглена: „🏢 Ход: ЦО (2)“', !!co && co.textContent.trim() === '🏢 Ход: ЦО (2)', co && co.textContent);
    realClick(h.w, co); await settle();
    ok('Миглена: „Ход: ЦО“ → само rA', shownReps(h) === 'rA', shownReps(h));
    h.close();
  }
  {
    const h = env(U.wh);
    await render(h);
    ok('склад: без „🏢 Ход: ЦО“', !h.doc.getElementById('sd-co-turn-chip'));
    const rowOf = id => Array.prototype.find.call(h.doc.querySelectorAll('[id^="diff-rep-"] tr'), tr => { const td = tr.querySelectorAll('td')[1]; return td && td.textContent.replace(/[^\wА-я ]/g, '').trim() === 'АРТ ' + id; });
    const btns = id => { const r = rowOf(id); return r ? Array.prototype.map.call(r.querySelectorAll('button[data-val]'), b => b.textContent.trim()) : null; };
    ok('6б: липса a1 → 3 бутона', JSON.stringify(btns('a1')) === JSON.stringify(['📤 Изпратено', '⏳ Ще се изпрати със следващ транспорт', '📄 Приемете по документи, пускам нова заявка']), JSON.stringify(btns('a1')));
    ok('6б: излишък e1 → 2 бутона', JSON.stringify(btns('e1')) === JSON.stringify(['📝 Пуснете заявка ZSTR тип 4', '📄 Изписано по система']), JSON.stringify(btns('e1')));
    ok('6б: „Ход: ЦО“ a3 → 0 бутона', JSON.stringify(btns('a3')) === '[]');
    realClick(h.w, chip(h, 'noanswer')); await settle();
    ok('6б: бутоните остават и при активен чип', JSON.stringify(btns('a1')).indexOf('📤 Изпратено') >= 0);
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
