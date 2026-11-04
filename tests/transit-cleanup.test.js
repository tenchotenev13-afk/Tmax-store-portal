/* „Стока на път" — поправките след проверката на живо и писмото на Цвети
   (04.11.2026, сесия transit-cleanup). Решенията — в Проекта на чата,
   claude/stoka-na-pat-reshenia-2026-11.md („След писмото на Цвети").

   Проверки:
     а) позицията в ДОСТАВКАТА (delivery_position) я няма на реда — „ВД
        180518104" без „· 80"; „Поз." (позицията в поръчката) остава;
        търсенето по ВД намира реда;
     б) „✕ Недоставена" — реален клик пише reviewed_at, status остава pending
        (НЕ 'rejected'); „↩ Върни" го маха; няма <button> „Неприето" /
        „Проверено"; чипът „✕ Недоставени" брои reviewed_at при pending и
        стар 'rejected';
     в) „📤 Изпращам": склад без нито един неизпратен → чипът е „Всички"
        (таблицата не е празна); обект с неизпратени → „📭 Неизпратени";
        склад с неизпратени → „📭 Неизпратени".
   „✕ Недоставена" подробно (брояч, общ бутон, формата, Excel) —
   transit-auto-complete.test.js, раздели A1–A8.

   Мутанти (04.11.2026, всеки върху чист transit.js; чистият — exit 0 и тук,
   и в transit-auto-complete). И четирите падат (exit 1):
     C1 „Недоставена" пише status 'rejected'                      → ❌ б) + auto-complete A3
     C2 позицията в доставката пак в реда                         → ❌ а)
     C3 чипът на „Изпращам" винаги „Неизпратени"                  → ❌ в)
     C4 правилото и при офис без гледна точка (без _vp)           → ❌ в)

   Пускане:  node tests/transit-cleanup.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';
const OFFICE = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'radnevo@temax.bg', display_name: 'Раднево', role: 'manager', store_name: 'Раднево' };
const WAREHOUSE = { email: 'sklad.t@temax.bg', display_name: 'Склад Т', role: 'logistics', store_name: WH };

const row = (id, o) => Object.assign({ id, store_name: 'Раднево', supplier: WH, direction: 'incoming', status: 'pending',
  purchase_doc: 'D-' + id, position: '10', doc_date: '2026-11-01', material_code: 'M-' + id, material_name: 'ART-' + id,
  unit: 'БР', ordered_qty: 1, sender_status: null, recon_at: null, reviewed_at: null }, o || {});

function env(user, data) {
  const h = boot({ modules: ['transport.js', 'client-orders.js', 'transit.js'], user, confirm: true,
    data: { goods_transit: [], stores: [], users: [] } });
  h.w.loadTransit = () => {};
  h.w.requestAnimationFrame = f => f();
  h.w.transitData = JSON.parse(JSON.stringify(data));
  h.w.transitArchive = [];
  h.w.transitDir = 'all'; h.w.transitFilter = 'all';
  h.w.transitStore = ''; h.w.transitMonthFilter = ''; h.w.transitSearch = '';
  guard('renderTransit()', () => h.w.renderTransit());
  return h;
}
const mod = h => h.doc.getElementById('mod-transit');
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const rowOf = (h, id) => { const b = h.doc.querySelector('button[data-id="' + id + '"]'); return b ? b.closest('tr') : null; };
const rowBtn = (h, id, needle) => Array.from(h.doc.querySelectorAll('button[data-id="' + id + '"]')).find(b => (b.getAttribute('onclick') || '').indexOf(needle) >= 0) || null;
const tabBtn = (h, k) => Array.from(mod(h).querySelectorAll('button')).find(b => (b.getAttribute('onclick') || '') === "setTDir('" + k + "')");
const visibleIds = h => (h.w._transitVisible || []).map(r => r.id).join(',');
async function settle() { for (let i = 0; i < 6; i++) await ticks(); }

(async function run() {

  section('а) Позицията в доставката я няма на реда; търсенето по ВД работи');
  {
    const h = env(OFFICE, [
      row('p1', { inbound_delivery: '180518104', delivery_position: '80', position: '30' }),
      row('p2', { inbound_delivery: '180518105', delivery_position: '900001' })
    ]);
    const vd = rowOf(h, 'p1') && rowOf(h, 'p1').querySelector('.t-vd');
    ok('ВД е на реда: „ВД 180518104"', !!vd && txt(vd) === 'ВД 180518104', txt(vd));
    ok('… без „· 80" (позицията в доставката)', !!vd && !/·/.test(txt(vd)) && !/\b80\b/.test(txt(vd)), txt(vd));
    ok('в целия ред няма „· 80" и „900001"', !/·\s*80\b/.test(txt(rowOf(h, 'p1'))) && txt(rowOf(h, 'p2')).indexOf('900001') < 0, txt(rowOf(h, 'p2')));
    ok('„Поз. 30" (позицията в поръчката) остава', txt(rowOf(h, 'p1')).indexOf('Поз. 30') >= 0, txt(rowOf(h, 'p1')));
    ok('delivery_position остава в данните', h.w.transitData[0].delivery_position === '80');
    h.w.transitSearch = '180518104'; h.w.renderTransit();
    ok('търсене по ВД 180518104 → p1', visibleIds(h) === 'p1', visibleIds(h));
    h.w.transitSearch = ''; h.w.renderTransit();
  }

  section('б) „✕ Недоставена" — reviewed_at, не status; „↩ Върни" го маха');
  {
    const h = env(STORE, [row('u1'), row('u2', { status: 'rejected' }), row('u3', { reviewed_at: '2026-11-04T09:00:00Z', reviewed_by: 'Раднево' })]);
    const all = Array.from(mod(h).querySelectorAll('button'));
    ok('няма <button> „Неприето"', !all.some(b => /Неприет/.test(b.textContent)));
    ok('няма <button> „Проверено"', !all.some(b => /Проверено/.test(b.textContent)));
    const chip = mod(h).querySelector('[data-tt-f="undelivered"]');
    ok('чипът „✕ Недоставени 2" (reviewed_at + стар rejected)', !!chip && txt(chip) === '✕ Недоставени 2', txt(chip));
    ok('чип „rejected" го няма', !mod(h).querySelector('[data-tt-f="rejected"]'));
    const b = rowBtn(h, 'u1', "'undelivered'");
    if (ok('u1 има „✕ Недоставена"', !!b && txt(b) === '✕ Недоставена', txt(b))) {
      realClick(h.w, b, '✕ Недоставена'); await settle();
      const p = h.calls.patch.filter(x => x.table === 'goods_transit');
      ok('една заявка с status pending, НЕ rejected', p.length === 1 && p[0].body.status === 'pending', p[0] && JSON.stringify(p[0].body));
      ok('… reviewed_at (ISO) и reviewed_by = Раднево', !!p[0] && !isNaN(Date.parse(p[0].body.reviewed_at)) && p[0].body.reviewed_by === 'Раднево', p[0] && JSON.stringify(p[0].body));
      ok('редът е „✕ Недоставена · Раднево · дд.мм"', /^✕ Недоставена · Раднево · \d\d\.\d\d$/.test(txt(rowOf(h, 'u1').querySelector('.t-recv'))), txt(rowOf(h, 'u1').querySelector('.t-recv')));
      const back = rowBtn(h, 'u1', "'pending'");
      if (ok('… и има „↩ Върни"', !!back)) {
        realClick(h.w, back, 'Върни'); await settle();
        const p2 = h.calls.patch.filter(x => x.table === 'goods_transit')[1];
        ok('„↩ Върни" → status pending, reviewed_at / reviewed_by null', !!p2 && p2.body.status === 'pending' && p2.body.reviewed_at === null && p2.body.reviewed_by === null, p2 && JSON.stringify(p2.body));
        ok('… и редът е пак „⏳ Все още недоставена"', txt(rowOf(h, 'u1').querySelector('.t-recv')) === '⏳ Все още недоставена', txt(rowOf(h, 'u1').querySelector('.t-recv')));
      }
    }
    const back2 = rowBtn(h, 'u2', "'pending'");
    if (ok('стар rejected (u2) — „↩ Върни"', !!back2)) {
      realClick(h.w, back2, 'Върни'); await settle();
      const p3 = h.calls.patch.filter(x => x.table === 'goods_transit').pop();
      ok('… → status pending (стойност rejected не се пише)', !!p3 && p3.body.status === 'pending', p3 && JSON.stringify(p3.body));
    }
    ok('нито една заявка не пише status rejected', !h.calls.patch.some(x => x.body && x.body.status === 'rejected'));
  }

  section('в) „📤 Изпращам": без неизпратени → „Всички"; с неизпратени → „Неизпратени"');
  {
    /* Склад Търговище, 04.11.2026: всичките редове изпратени от импорта. */
    const sent = { sender_status: 'sent', sender_status_by: 'импорт', sender_status_at: '2026-11-04T13:25:00Z' };
    const h = env(WAREHOUSE, [row('w1', sent), row('w2', sent), row('w3', Object.assign({ store_name: 'Шумен' }, sent))]);
    const t = tabBtn(h, 'out');
    if (ok('табът „📤 Изпращам" е там', !!t)) {
      ok('… с „(0 за изпр.)"', /\(0 за изпр\.\)/.test(txt(t)), txt(t));
      realClick(h.w, t, 'Изпращам');
      ok('склад без неизпратени → чипът е „Всички"', h.w.transitFilter === 'all', h.w.transitFilter);
      ok('… и таблицата не е празна (3 реда)', visibleIds(h) === 'w1,w2,w3', visibleIds(h));
      /* Пак клик на таба — пак „Всички"; ръчен клик на „Неизпратени" — уважава се. */
      realClick(h.w, mod(h).querySelector('[data-tt-f="snone"]'), 'Неизпратени');
      ok('ръчен клик на „📭 Неизпратени" → 0 реда (изборът на човека)', h.w.transitFilter === 'snone' && visibleIds(h) === '', h.w.transitFilter);
    }
  }
  {
    const h = env(WAREHOUSE, [row('w1', { sender_status: 'sent' }), row('w2')]);
    realClick(h.w, tabBtn(h, 'out'), 'Изпращам');
    ok('склад с неизпратен → „📭 Неизпратени"', h.w.transitFilter === 'snone' && visibleIds(h) === 'w2', h.w.transitFilter + ' / ' + visibleIds(h));
  }
  {
    /* Раднево изпраща към склада (трансфер) — неизпратен. */
    const h = env(STORE, [row('s1', { store_name: WH, supplier: 'Раднево', direction: 'transfer' }), row('s2')]);
    realClick(h.w, tabBtn(h, 'out'), 'Изпращам');
    ok('обект с неизпратен → „📭 Неизпратени"', h.w.transitFilter === 'snone' && visibleIds(h) === 's1', h.w.transitFilter + ' / ' + visibleIds(h));
  }
  {
    const h = env(STORE, [row('s1', { store_name: WH, supplier: 'Раднево', direction: 'transfer', sender_status: 'sent' })]);
    realClick(h.w, tabBtn(h, 'out'), 'Изпращам');
    ok('обект без неизпратени → „Всички"', h.w.transitFilter === 'all' && visibleIds(h) === 's1', h.w.transitFilter + ' / ' + visibleIds(h));
  }
  {
    const h = env(OFFICE, [row('o1', { sender_status: 'sent' })]);
    realClick(h.w, tabBtn(h, 'out'), 'Изпращам');
    ok('офис без избран обект → „📭 Неизпратени" (няма гледна точка — правилото не важи)', h.w.transitFilter === 'snone', h.w.transitFilter);
  }
  {
    /* „📥 Получавам" не е засегнат. */
    const h = env(STORE, [row('i1', { sender_status: 'sent', status: 'received' })]);
    realClick(h.w, tabBtn(h, 'in'), 'Получавам');
    ok('„📥 Получавам" без чакащи → пак „⏳ Все още недоставени"', h.w.transitFilter === 'pending', h.w.transitFilter);
  }

  report();
})();
