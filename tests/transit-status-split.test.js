/* „Стока на път", етап 3 (04.11.2026): изпращачът и получателят отбелязват
   НЕЗАВИСИМО. status — получателят (pending / received / rejected);
   sender_status — изпращачът ('sent' / NULL); recon_* — „🔍 Чака засечка".

   Проверки (реални кликове):
     а) получателят натиска „✅ Доставена" без изпращачът да е отбелязал;
     б) изпращачът — „📤 Изпратена" на ред и „📤 Цялата доставка (N)": един
        PATCH с inbound_delivery + supplier, засегнати само неотбелязаните;
     в) всеки „↩ Върни" връща само своето поле;
     г) засечка от всяка страна, видима и в двата таба с кой/кога;
     д) чиповете и броячите = редовете след клик; смяна на таб нулира чипа;
     е) кодът търпи стар ред със status 'sent' (преди data-миграцията);
     ж) офисът може и двете страни; обект не може чуждата страна (няма
        <button> — проверка само по <button>).

   Мутационна проверка (04.11.2026, върху чист transit.js; чистият — exit 0):
     X1 „Доставена" изисква изпращачът да е изпратил         → ❌ а), ж)
     X2 „Цялата доставка" без филтъра по supplier            → ❌ б)
     X3 „↩ Върни" на получателя пипа и sender_status          → ❌ в)
     X4 броячът „за изпр." по status вместо по sender_status  → ❌ д)
        (оцеля, докато в д) двете числа съвпадаха — добавен е ред e2)
     X5 засечката не се брои като обработена (броячът на обекта) → ❌ г)
   Мутантът „засечката не се брои" за ФУНКЦИИТЕ в базата — в
   tests/sql/transit-recon.test.sql.

   Пускане:  node tests/transit-status-split.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';
const OFFICE = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'radnevo@temax.bg', display_name: 'Раднево', role: 'manager', store_name: 'Раднево' };
const WAREHOUSE = { email: 'sklad.t@temax.bg', display_name: 'Склад Т', role: 'logistics', store_name: WH };

const row = (id, o) => Object.assign({ id, store_name: 'Раднево', supplier: WH, direction: 'incoming', status: 'pending',
  purchase_doc: 'D-' + id, position: '10', doc_date: '2026-11-01', material_code: 'M-' + id, material_name: 'ART-' + id,
  unit: 'БР', ordered_qty: 1, sender_status: null, recon_at: null, reviewed_at: null }, o || {});
/* Доставка 180000001 от склада към Раднево: 3 реда, един вече изпратен.
   Същото ВД, но друг изпращач (Добрич) — не бива да се пипа от „Цялата доставка". */
const DATA = [
  row('a1', { inbound_delivery: '180000001' }),
  row('a2', { inbound_delivery: '180000001' }),
  row('a3', { inbound_delivery: '180000001', sender_status: 'sent', sender_status_by: 'Склад Т', sender_status_at: '2026-11-03T08:00:00Z' }),
  row('b1', { inbound_delivery: '180000001', supplier: 'Добрич', direction: 'transfer' }),
  row('c1', { store_name: WH, supplier: 'Раднево', direction: 'transfer' }),          /* Раднево връща към склада */
  row('d1', { status: 'received' })
];

function env(user, data) {
  const h = boot({ modules: ['transport.js', 'client-orders.js', 'transit.js'], user, confirm: true,
    data: { goods_transit: [], stores: [], users: [] } });
  h.toasts = [];
  const t0 = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: String(m), c }); t0(m, c); };
  h.reloads = 0;
  h.w.loadTransit = () => { h.reloads++; };
  h.w.requestAnimationFrame = f => f();
  h.w.transitData = JSON.parse(JSON.stringify(data || DATA));
  h.w.transitArchive = [];
  h.w.transitDir = 'all'; h.w.transitFilter = 'all'; h.w.transitStore = '';
  h.w.renderTransit();
  return h;
}
const mod = h => h.doc.getElementById('mod-transit');
const btn = (h, id, label) => Array.from(mod(h).querySelectorAll('button[data-id="' + id + '"]')).find(b => b.textContent.trim().indexOf(label) === 0) || null;
const rowBtns = (h, id) => Array.from(mod(h).querySelectorAll('button[data-id="' + id + '"]')).map(b => b.textContent.trim());
const patches = h => h.calls.patch.filter(p => p.table === 'goods_transit');
const R = (h, id) => h.w.transitData.find(r => r.id === id);
const settle = async () => { for (let i = 0; i < 20; i++) await ticks(3); };
const tabBtn = (h, k) => Array.from(mod(h).querySelectorAll('button')).find(b => (b.getAttribute('onclick') || '').indexOf("setTDir('" + k + "')") === 0);
const chipN = (h, f) => { const c = mod(h).querySelector('[data-tt-f="' + f + '"] .chips-n'); return c ? +c.textContent : NaN; };
const tabNum = (h, k) => { const b = tabBtn(h, k); const m = b && /\((\d+) /.exec(b.textContent); return m ? +m[1] : null; };
const shown = h => h.w._transitVisible.map(r => r.id).sort().join(',');

(async function run() {

  section('а) получателят — „✅ Доставена" без изпращачът да е отбелязал');
  {
    const h = env(STORE);
    ok('a1 е неизпратен', !R(h, 'a1').sender_status);
    const b = btn(h, 'a1', '✅ Доставена');
    if (ok('бутонът „✅ Доставена" на неизпратен ред', !!b)) {
      realClick(h.w, b, 'Доставена');
      await settle();
      const p = patches(h)[0];
      ok('1 PATCH: status received, без sender_status', patches(h).length === 1 && p.body.status === 'received' && !('sender_status' in p.body), JSON.stringify(p && p.body));
      ok('локално: получател received, изпращач — пак NULL', R(h, 'a1').status === 'received' && !R(h, 'a1').sender_status);
      ok('без презареждане', h.reloads === 0);
    }
  }

  section('б) изпращачът — „📤 Изпратена" на ред и „📤 Цялата доставка (N)"');
  {
    const h = env(WAREHOUSE);
    const one = btn(h, 'a1', '📤 Изпратена');
    const all = btn(h, 'a1', '📤 Цялата доставка');
    ok('„📤 Цялата доставка (2)" — само неотбелязаните от склада', !!all && /\(2\)/.test(all.textContent), all && all.textContent);
    ok('на изпратения a3 няма „Цялата доставка"', !btn(h, 'a3', '📤 Цялата доставка'));
    if (ok('„📤 Изпратена" на a1', !!one)) {
      realClick(h.w, one, 'Изпратена');
      await settle();
      const p = patches(h)[0];
      ok('1 PATCH по id, sender_status sent + кой/кога, без status', patches(h).length === 1 && /id=eq\.a1/.test(p.url) &&
        p.body.sender_status === 'sent' && !!p.body.sender_status_at && !!p.body.sender_status_by && !('status' in p.body), JSON.stringify(p));
      ok('a1 — изпратена; получателят пак pending', R(h, 'a1').sender_status === 'sent' && R(h, 'a1').status === 'pending');
    }
    const h2 = env(WAREHOUSE);
    realClick(h2.w, btn(h2, 'a2', '📤 Цялата доставка'), 'Цялата доставка');
    await settle();
    const ps = patches(h2);
    const u = ps[0] ? decodeURIComponent(ps[0].url) : '';
    ok('ЕДИН PATCH', ps.length === 1, ps.length);
    ok('… по inbound_delivery + supplier, само неизпратените', /inbound_delivery=eq\.180000001/.test(u) && /supplier=eq\.Логистичен склад Търговище/.test(u) && /sender_status=is\.null/.test(u), u);
    ok('локално: a1 и a2 изпратени', R(h2, 'a1').sender_status === 'sent' && R(h2, 'a2').sender_status === 'sent');
    ok('a3 не е пипнат (беше изпратен по-рано)', R(h2, 'a3').sender_status_by === 'Склад Т');
    ok('b1 (същото ВД, друг изпращач) не е пипнат', !R(h2, 'b1').sender_status);
    ok('„Цялата доставка" вече я няма (0 неизпратени)', !btn(h2, 'a1', '📤 Цялата доставка'));
  }

  section('в) всеки „↩ Върни" връща само своето поле');
  {
    const data = [row('x1', { status: 'received', sender_status: 'sent', sender_status_by: 'Склад Т', sender_status_at: '2026-11-03T08:00:00Z' })];
    const h = env(OFFICE, data);
    realClick(h.w, btn(h, 'x1', '↩ Върни изпращането'), 'Върни изпр');
    await settle();
    let p = patches(h)[0];
    ok('„↩ Върни изпращането" → само sender_*', !!p && p.body.sender_status === null && !('status' in p.body), JSON.stringify(p && p.body));
    ok('локално: получателят пак received', R(h, 'x1').status === 'received' && R(h, 'x1').sender_status === null);
    const h2 = env(OFFICE, data);
    const back = Array.from(mod(h2).querySelectorAll('button[data-id="x1"][data-side="recv"]')).find(b => /↩ Върни/.test(b.textContent));
    realClick(h2.w, back, 'Върни');
    await settle();
    p = patches(h2)[0];
    ok('„↩ Върни" на получателя → само status pending', !!p && p.body.status === 'pending' && !('sender_status' in p.body), JSON.stringify(p && p.body));
    ok('локално: изпращачът пак изпратена', R(h2, 'x1').status === 'pending' && R(h2, 'x1').sender_status === 'sent');
  }

  section('г) засечка — от всяка страна, видима и в двата таба с кой/кога');
  {
    const h = env(STORE);
    realClick(h.w, btn(h, 'a1', '🔍 Чака засечка'), 'засечка');
    await settle();
    const p = patches(h)[0];
    ok('получателят: recon_at + recon_by + recon_side receiver', !!p && !!p.body.recon_at && p.body.recon_by === 'Раднево' && p.body.recon_side === 'receiver', JSON.stringify(p && p.body));
    const badge = Array.from(mod(h).querySelectorAll('.t-recon')).map(x => x.textContent).join(' | ');
    ok('значка „🔍 Чака засечка · Раднево · дд.мм (получател)"', /🔍 Чака засечка · Раднево · \d\d\.\d\d \(получател\)/.test(badge), badge);
    ok('бутонът става „↩ Махни засечка"', !!btn(h, 'a1', '↩ Махни засечка'));
    ok('броячът на обекта: засечката е „обработена" (недоставени или засечка 1)', /недоставени или засечка 1/.test((h.doc.getElementById('t-review-counter') || {}).textContent || ''),
      (h.doc.getElementById('t-review-counter') || {}).textContent);
    /* Изпращачът (складът) вижда засечката в „Изпращам" и може да отбележи своя. */
    const hw = env(WAREHOUSE, h.w.transitData);
    hw.w.transitDir = 'out'; hw.w.transitFilter = 'recon'; hw.w.renderTransit();
    ok('складът в „Изпращам" + „Чака засечка" вижда a1', shown(hw) === 'a1', shown(hw));
    ok('… със същата значка', /Раднево/.test(Array.from(mod(hw).querySelectorAll('.t-recon')).map(x => x.textContent).join(' ')));
    realClick(hw.w, btn(hw, 'a2', '🔍 Чака засечка') || btn(hw, 'a1', '↩ Махни засечка'), 'засечка');
    await settle();
    const pw = patches(hw)[0];
    ok('изпращачът: recon_side sender (или маха)', !!pw && ('recon_at' in pw.body), JSON.stringify(pw && pw.body));
    const hs = env(WAREHOUSE, DATA);
    hs.w.transitDir = 'out'; hs.w.transitFilter = 'all'; hs.w.renderTransit();
    realClick(hs.w, btn(hs, 'a2', '🔍 Чака засечка'), 'засечка');
    await settle();
    ok('засечка от склада → recon_side sender', patches(hs)[0] && patches(hs)[0].body.recon_side === 'sender', JSON.stringify(patches(hs)[0] && patches(hs)[0].body));
    hs.w.transitDir = 'in'; hs.w.transitStore = ''; hs.w.renderTransit();
    const ho = env(OFFICE, hs.w.transitData);
    ho.w.transitStore = 'Раднево'; ho.w.transitDir = 'in'; ho.w.transitFilter = 'recon'; ho.w.renderTransit();
    ok('офис + Раднево, „Получавам" + „Чака засечка" — a2 със значка (изпращач)', shown(ho) === 'a2' &&
      /\(изпращач\)/.test(Array.from(mod(ho).querySelectorAll('.t-recon')).map(x => x.textContent).join(' ')), shown(ho));
  }

  section('д) чиповете и броячите = редовете след клик; смяна на таб нулира чипа');
  {
    /* e2 — получен, но НЕизпратен: разделя „неизпратени" (4) от „получател pending" (3).
       Без него двете числа съвпадат случайно и мутант X4 оцелява (проверено 04.11). */
    const h = env(WAREHOUSE, DATA.concat([row('e2', { status: 'received' })]));
    ok('„Изпращам (N за изпр.)" = неизпратени от склада (a1, a2, d1, e2 = 4), не получател pending (3)', tabNum(h, 'out') === 4, tabNum(h, 'out'));
    ok('„Получавам (N чакат)" = получател pending (c1 = 1)', tabNum(h, 'in') === 1, tabNum(h, 'in'));
    realClick(h.w, tabBtn(h, 'out'), 'Изпращам');
    ok('клик на „Изпращам" → чип „📭 Неизпратени"', h.w.transitFilter === 'snone' && shown(h) === 'a1,a2,d1,e2', h.w.transitFilter + ' / ' + shown(h));
    const keys = Array.from(mod(h).querySelectorAll('[data-tt-f]')).map(b => b.getAttribute('data-tt-f')).join(',');
    ok('чиповете на „Изпращам": Неизпратени / Изпратени / Чака засечка / Всички / Архив', keys === 'snone,ssent,recon,all,archive', keys);
    ['snone', 'ssent', 'recon', 'all'].forEach(k => {
      const n = chipN(h, k);
      realClick(h.w, mod(h).querySelector('[data-tt-f="' + k + '"]'), k);
      ok('„Изпращам" / ' + k + ': ' + n + ' = редове след клик', n === h.w._transitVisible.length, n + ' / ' + h.w._transitVisible.length);
    });
    /* „Чакат мен" в „Получавам", после „Изпращам" — чипът се нулира. */
    const hs = env(STORE, DATA.concat([row('s1', { sender_status: 'sent' })]));
    realClick(hs.w, tabBtn(hs, 'in'), 'Получавам');
    realClick(hs.w, mod(hs).querySelector('[data-tt-f="mine"]'), 'Чакат мен');
    ok('„📥 Чакат мен" = a3 и s1 (изпратени, получателят pending)', shown(hs) === 'a3,s1', shown(hs));
    const keysIn = Array.from(mod(hs).querySelectorAll('[data-tt-f]')).map(b => b.getAttribute('data-tt-f')).join(',');
    ok('чиповете на „Получавам"', keysIn === 'pending,received,undelivered,recon,mine,all,archive', keysIn);
    realClick(hs.w, tabBtn(hs, 'out'), 'Изпращам');
    ok('минаване в „Изпращам" → „📭 Неизпратени", не празна таблица', hs.w.transitFilter === 'snone' && shown(hs) === 'c1', hs.w.transitFilter + ' / ' + shown(hs));
  }

  section('е) стар ред със status \'sent\' (преди data-миграцията)');
  {
    const old = [row('o1', { direction: 'transfer', supplier: 'Добрич', status: 'sent', updated_by: 'Добрич', updated_at: '2026-11-02T10:00:00Z' })];
    const h = env(STORE, old);
    const tds = Array.from(mod(h).querySelectorAll('tbody td')).map(td => td.textContent).join(' | ');
    ok('показва се като „Все още недоставена" + „📤 Изпратена"', /Все още недоставена/.test(tds) && /📤 Изпратена/.test(tds), tds.slice(0, 200));
    h.w.transitDir = 'in'; h.w.renderTransit();
    ok('влиза в „📥 Чакат мен"', chipN(h, 'mine') === 1, chipN(h, 'mine'));
    realClick(h.w, btn(h, 'o1', '✅ Доставена'), 'Доставена');
    await settle();
    const p = patches(h)[0];
    ok('„Доставена" на стар sent пази изпращането в sender_status', !!p && p.body.status === 'received' && p.body.sender_status === 'sent' && p.body.sender_status_by === 'Добрич',
      JSON.stringify(p && p.body));
  }

  section('ж) офисът — и двете страни; обект — само своята');
  {
    const ho = env(OFFICE);
    const bo = rowBtns(ho, 'a1');
    ok('офис на a1: „✅ Доставена" И „📤 Изпратена"', bo.indexOf('✅ Доставена') >= 0 && bo.indexOf('📤 Изпратена') >= 0, bo.join(' | '));
    const hs = env(STORE);
    const bs = rowBtns(hs, 'a1');
    ok('Раднево (получател) на a1: „✅ Доставена", без „📤 Изпратена"', bs.indexOf('✅ Доставена') >= 0 && !bs.some(t => /📤/.test(t)), bs.join(' | '));
    const bc = rowBtns(hs, 'c1');
    ok('Раднево (изпращач) на c1: „📤 Изпратена", без „✅ Доставена" / „✕ Недоставена"', bc.indexOf('📤 Изпратена') >= 0 && bc.indexOf('✅ Доставена') < 0 && bc.indexOf('✕ Недоставена') < 0, bc.join(' | '));
    const hw = env(WAREHOUSE);
    const bw = rowBtns(hw, 'a1');
    ok('складът (изпращач) на a1: без „✅ Доставена"', bw.indexOf('✅ Доставена') < 0 && bw.indexOf('📤 Изпратена') >= 0, bw.join(' | '));
    ok('… и без „✕ Недоставена" (то е на получателя)', !bw.some(t => /Недоставена/.test(t)));
  }

  report();
})();
