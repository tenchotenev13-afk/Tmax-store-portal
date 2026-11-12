/* „💬 Коментар" от ЦО при клиентска заявка в статус „Изчаква" / „Отложена" (12.11.2026).
   Искане от Снабдяване: коментар към обекта без смяна на статуса и без дата.

   Зарежда shared.js + transport.js + client-orders.js + history.js +
   notifications.js в реалния ред от index.html, с ИСТИНСКИ кликове.

   Пускане: node tests/co-comment-pending.test.js .

   Мутационна проверка (12.11.2026) — всеки счупен вариант на client-orders.js
   е пуснат срещу този тест и е хванат (exit 1):
     M1 бутонът само при 'pending' (`if(rawStatus==='pending')` пред него)
        → пада „Отложена към ЦО → има бутон".
     M2 submitCoComment праща и status:'pending' в PATCH-а
        → пада „PATCH носи САМО co_note".
     M3 coEtaCell връща '' при co_note без co_eta (старото поведение)
        → пада „редът показва 💬 ЦО:".
     M4 модалът се затваря и при неуспешен PATCH
        → пада „модалът остава отворен при грешка".
     M5 textarea с esc() вместо escAttrVal() → пада „textarea е ПРАЗНА".
     M6 title с esc() вместо escAttr() → пада „кавички … не чупят title".
     M7 клонът с co_eta пак с esc() в title → пада „кавичка при co_eta не
        чупи title" (еталонът е с „ТЕСИ" — без кавичка, там esc = escAttr).
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;
const DIR = process.argv[2] || '.';

const CO = 'Централен офис';
function order(id, over) {
  return Object.assign({
    id: id, in_num: '90' + id.slice(-2), store_name: 'Троян', fulfiller: CO,
    status: 'pending', date: dayOffset(-2), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(10), note: '', created_at: tsOffset(-2),
    co_eta: null, co_note: null, co_processed_at: null, co_processed_by: null,
    paid_transport: false, transport_id: null
  }, over || {});
}
const ORDERS = [
  order('o-01'),                                                   /* Изчаква към ЦО */
  order('o-02', { fulfiller: 'Монтана' }),                          /* към друг обект */
  order('o-03', { status: 'processed', co_eta: dayOffset(5), co_note: 'ТЕСИ' }),
  order('o-04', { status: 'postponed' }),
  order('o-05', { status: 'sent' }),
  order('o-06', { co_note: 'Цветът в SAP е бял — клиентът иска сив' }), /* коментар без дата */
  order('o-07', { customer_name: "Д'Артанян О'Брайън", co_note: 'стар <b>текст</b>' })
];
const CO_USER = { email: 'sn@temax.bg', display_name: 'Снабдяване ЦО', role: 'supply', store_name: CO };
const STORE_USER = { email: 'tr@temax.bg', display_name: 'Троян', role: 'store', store_name: 'Троян' };

function env(over) {
  over = over || {};
  const h = boot(Object.assign({
    repo: DIR,
    modules: ['transport.js', 'client-orders.js', 'history.js', 'notifications.js'],
    user: CO_USER,
    data: { client_orders: ORDERS, transport_orders: [], stores: [] }
  }, over));
  h.w.transportOrders = [];
  h.w.clientOrders = JSON.parse(JSON.stringify(ORDERS));
  h.w.clientOrders.forEach(o => {
    o._status = h.w.calcStatus(o.delivery, o.status);
    o._days = h.w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = h.w.coIsMineToFulfill(o);
  });
  h.w.loadClientOrders = () => { h.reloaded = (h.reloaded || 0) + 1; };
  return h;
}
const row = (doc, id) => doc.getElementById('co-row-' + id);
const cBtn = r => btn(r, '💬 Коментар');

(async function run() {

  section('1. Бутонът — кой и кога го вижда');
  {
    const { w, doc } = env();
    if (guard('renderClientOrders() за ЦО', () => w.renderClientOrders())) {
      ok('ЦО + Изчаква към ЦО → има „💬 Коментар"', !!cBtn(row(doc, 'o-01')));
      ok('… и „✅ Обработена от ЦО" е още там', !!btn(row(doc, 'o-01'), 'Обработена от ЦО'));
      ok('заявка към друг изпълнител → няма бутон', !!row(doc, 'o-02') && !cBtn(row(doc, 'o-02')));
      ok('Обработена от ЦО → няма бутон', !!row(doc, 'o-03') && !cBtn(row(doc, 'o-03')));
      ok('Отложена към ЦО → има бутон', !!cBtn(row(doc, 'o-04')));
      ok('… до „✅ Обработена от ЦО"', !!btn(row(doc, 'o-04'), 'Обработена от ЦО'));
      ok('Изпратена → няма бутон', !!row(doc, 'o-05') && !cBtn(row(doc, 'o-05')));
      const b = cBtn(row(doc, 'o-01'));
      ok('onclick без низ — this.dataset.id', !!b && b.getAttribute('onclick') === 'openCoCommentModal(this.dataset.id)' && b.getAttribute('data-id') === 'o-01');
    }
  }
  {
    const { w, doc } = env({ user: STORE_USER });
    if (guard('renderClientOrders() за обект', () => w.renderClientOrders())) {
      ok('обектът (Троян) вижда реда', !!row(doc, 'o-01'));
      ok('обектът НЯМА бутон „💬 Коментар" никъде', !Array.from(doc.querySelectorAll('button')).some(b => b.textContent.indexOf('💬 Коментар') >= 0));
    }
  }

  section('2. Клик → модал → запис само на co_note');
  {
    const h = env(); const { w, doc, calls } = h;
    guard('рендер', () => w.renderClientOrders());
    realClick(w, cBtn(row(doc, 'o-01')), '💬 Коментар');
    const ov = doc.getElementById('coc-ov');
    ok('модалът се отваря', !!ov && ov.classList.contains('open'));
    ok('заглавието носи № заявка, обект и клиент', !!ov && /№9001/.test(ov.textContent) && ov.textContent.indexOf('Троян') >= 0 && ov.textContent.indexOf('Иван Петров') >= 0);
    const ta = doc.getElementById('coc-note');
    ok('полето е textarea', !!ta && ta.tagName === 'TEXTAREA');
    ok('без коментар textarea е ПРАЗНА (не „—")', !!ta && ta.value === '', ta && JSON.stringify(ta.value));
    ta.value = '  Объркан размер — 60x60, не 45x45  ';
    realClick(w, btn(ov, 'Запази'), 'Запази');
    ok('двоен клик → бутонът е заключен', doc.getElementById('coc-submit') && doc.getElementById('coc-submit').disabled);
    w.submitCoComment('o-01');
    await ticks();
    ok('точно един PATCH (двойният клик не праща втори)', calls.patch.length === 1, calls.patch.length);
    const p = calls.patch[0] || {};
    ok('PATCH към client_orders?id=eq.o-01', p.table === 'client_orders' && /id=eq\.o-01/.test(p.url));
    ok('PATCH носи САМО co_note', !!p.body && JSON.stringify(Object.keys(p.body)) === '["co_note"]', JSON.stringify(p.body));
    ok('текстът е изчистен от крайни интервали', p.body && p.body.co_note === 'Объркан размер — 60x60, не 45x45');
    ok('модалът се затваря при успех', !doc.getElementById('coc-ov'));
    ok('списъкът се презарежда', h.reloaded === 1);
  }

  section('3. Попълнено с текущия коментар; празно → null');
  {
    const { w, doc, calls } = env();
    guard('рендер', () => w.renderClientOrders());
    realClick(w, cBtn(row(doc, 'o-07')), '💬 Коментар');
    const ta = doc.getElementById('coc-note');
    ok('textarea е попълнена с текущия co_note (екраниран, не HTML)', !!ta && ta.value === 'стар <b>текст</b>', ta && ta.value);
    ok('клиент с апостроф не чупи модала', !!doc.getElementById('coc-ov') && doc.getElementById('coc-ov').textContent.indexOf("Д'Артанян") >= 0);
    ta.value = '   ';
    realClick(w, btn(doc.getElementById('coc-ov'), 'Запази'), 'Запази');
    await ticks();
    ok('празен текст → co_note:null', calls.patch.length === 1 && calls.patch[0].body.co_note === null && Object.keys(calls.patch[0].body).length === 1, JSON.stringify(calls.patch[0] && calls.patch[0].body));
  }

  section('4. Неуспешен PATCH → модалът остава');
  {
    const h = env({ fail: { PATCH: true } }); const { w, doc, calls } = h;
    guard('рендер', () => w.renderClientOrders());
    realClick(w, cBtn(row(doc, 'o-01')), '💬 Коментар');
    doc.getElementById('coc-note').value = 'тест';
    realClick(w, btn(doc.getElementById('coc-ov'), 'Запази'), 'Запази');
    await ticks();
    ok('модалът остава отворен при грешка', !!doc.getElementById('coc-ov'));
    ok('текстът не се губи', doc.getElementById('coc-note') && doc.getElementById('coc-note').value === 'тест');
    ok('бутонът се отключва', doc.getElementById('coc-submit') && !doc.getElementById('coc-submit').disabled);
    ok('червен toast за грешка', calls.toast.some(m => /Грешка/.test(m)), JSON.stringify(calls.toast));
    ok('няма презареждане', !h.reloaded);
    realClick(w, btn(doc.getElementById('coc-ov'), 'Откажи'), 'Откажи');
    ok('„Откажи" затваря модала', !doc.getElementById('coc-ov'));
  }

  section('5. Редът показва коментара без дата; с дата — без промяна');
  {
    const { w, doc } = env({ user: STORE_USER });
    guard('рендер', () => w.renderClientOrders());
    const r6 = row(doc, 'o-06');
    ok('редът показва 💬 ЦО: при co_note без co_eta', !!r6 && r6.textContent.indexOf('💬 ЦО: Цветът в SAP е бял') >= 0);
    const el = r6 && Array.from(r6.querySelectorAll('div[title]')).find(d => d.textContent.indexOf('💬 ЦО:') === 0);
    ok('пълният текст е в title', !!el && el.getAttribute('title') === 'Цветът в SAP е бял — клиентът иска сив');
    ok('без co_note и без co_eta → празно', w.coEtaCell({ co_eta: null, co_note: null }) === '');
    ok('XSS в co_note е екраниран', w.coEtaCell({ co_eta: null, co_note: '<img src=x>' }).indexOf('<img') < 0);
    {
      const box = doc.createElement('div');
      box.innerHTML = w.coEtaCell({ co_eta: null, co_note: 'плочка 60" x 60" onmouseover="x()' });
      const d0 = box.firstElementChild;
      ok('кавички в co_note не чупят title', !!d0 && d0.getAttribute('title') === 'плочка 60" x 60" onmouseover="x()' && !d0.hasAttribute('onmouseover'), box.innerHTML);
    }
    /* Еталон: изходът на coEtaCell() при налична co_eta, от 29073a5 — с ЕДНА
       нарочна промяна (решение на Тенчо 12.11): title е escAttr, не esc. */
    const o3 = w.clientOrders.find(o => o.id === 'o-03');
    const late = o3.status === 'processed' && !w.coWaitingSupplier(o3);
    const col = late ? '#dc2626' : '#047857';
    const expected = '<div style="font-size:10px;color:' + col + ';margin-top:2px;white-space:nowrap;" title="' +
      w.escAttr(o3.co_note) + '">' + (late ? '🏭 просрочена от ' : '🏭 очаквана ') + w.fmtDate(o3.co_eta) + '</div>' +
      '<div style="font-size:10px;color:#94a3b8;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + w.esc(o3.co_note) + '</div>';
    ok('при co_eta изходът е байт по байт старият', w.coEtaCell(o3) === expected);
    {
      const q = 'плочка 60" x 60" onmouseover="x()';
      const box = doc.createElement('div');
      box.innerHTML = w.coEtaCell(Object.assign({}, o3, { co_note: q }));
      const d0 = box.firstElementChild;
      ok('кавичка при co_eta не чупи title', !!d0 && d0.getAttribute('title') === q && !d0.hasAttribute('onmouseover'), box.innerHTML);
      ok('… и текстът под датата е цял', !!d0 && !!d0.nextElementSibling && d0.nextElementSibling.textContent === q);
    }
    const noNote = Object.assign({}, o3, { co_note: null });
    ok('при co_eta без co_note — старият изход', w.coEtaCell(noNote) ===
      '<div style="font-size:10px;color:' + col + ';margin-top:2px;white-space:nowrap;" title="Ориентировъчна дата за получаване в обекта">' +
      (late ? '🏭 просрочена от ' : '🏭 очаквана ') + w.fmtDate(o3.co_eta) + '</div>');
  }

  report();
})();
