/* Зареждане — какво е заявил обектът в предишните седмици (стъпка 1 от
   предложението от 11.10.2026; без промяна в базата).

   Какво се заковава:
   - формата: миналата стойност стои ПОД полето на същата колона
     („мин. седм.: X", „—" при липса), за всяка от двете колони отделно;
     миналият коментар — в последната колона, ескейпнат; бутон „🕘 4 седмици";
   - бланка с една колона (Кабели): една стойност под полето, без втора;
   - РЕАЛЕН клик на „🕘 4 седмици": една заявка по обекта, артикула и
     четирите предишни понеделника; прозорецът показва 4 блока по седмици, не
     таблица (на 375px таблицата излизаше ~690px) — и „няма запис",
     стойностите, коментара (ескейпнат) и кой е записал; чужд обект/артикул от
     отговора не влиза; текущата седмица не влиза;
   - провал на заявката -> червен ред, НЕ „няма запис" (правило 13);
   - „Затвори" и клик по фона затварят прозореца.

   Пускане: node tests/supply-history.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, realClick, btn } = H;

const STORE = { email: 'kj@temax.bg', display_name: 'Управител Кърджали', role: 'store', store_name: 'Кърджали' };
const FLOOR = { id: 'tpl-fl', name: 'Подови настилки (линейни метри)', slug: 'floor-lm', col1_label: 'Общ брой места в търговска зала',
  col2_label: 'Брой за трансфер/поръчка ОБЩО (зала и склад)', target_stores: null, active: true, sort_order: 1 };
const CAB = { id: 'tpl-cab', name: 'Кабели на макара', slug: 'cables-reels', col1_label: 'Налична макара', col2_label: null,
  target_stores: null, active: true, sort_order: 2 };
const ITEMS = [
  { id: 'f-1', template_id: 'tpl-fl', sap_code: null, name: 'Балатум 4м.', supplier: null, active: true, sort_order: 1 },
  { id: 'f-2', template_id: 'tpl-fl', sap_code: null, name: 'Балатум 3м.', supplier: null, active: true, sort_order: 2 },
  { id: 'c-1', template_id: 'tpl-cab', sap_code: '23237', name: 'ПВВ-МБ1 2X1', supplier: null, active: true, sort_order: 1 }
];
const EVIL = 'Поръчано "вече" <b>2</b> & чакаме';

function env(entriesFn, extra) {
  return boot(Object.assign({
    modules: ['pallets.js', 'supply.js'],
    user: STORE,
    data: { supply_templates: [FLOOR, CAB], supply_template_items: ITEMS, supply_entries: entriesFn }
  }, extra || {}));
}
function mod(h) { return h.doc.getElementById('mod-supply'); }
const rowOf = (h, itemId) => {
  const inp = h.doc.getElementById('sup-q1-' + itemId);
  return inp ? inp.closest('tr') : null;
};

(async function () {
  section('1. Формата: миналата стойност под полето, коментарът в последната колона');
  {
    let h = null;
    h = env(url => {
      const wk = h.w.supplyWeekStart(), prev = h.w.supplyAddDays(wk, -7);
      return [
        { id: 'p1', template_id: 'tpl-fl', item_id: 'f-1', store_name: 'Кърджали', week_start: prev, qty1: 6, qty2: 2, note: EVIL },
        { id: 'c1', template_id: 'tpl-fl', item_id: 'f-1', store_name: 'Кърджали', week_start: wk, qty1: 7, qty2: 9, note: 'тази седмица' },
        { id: 'p3', template_id: 'tpl-cab', item_id: 'c-1', store_name: 'Кърджали', week_start: prev, qty1: 0, qty2: null, note: null }
      ];
    });
    if (guard('loadSupply() не хвърля', () => h.w.loadSupply())) {
      await ticks(6);
      const r1 = rowOf(h, 'f-1'), r2 = rowOf(h, 'f-2'), rc = rowOf(h, 'c-1');
      const pq = r => r ? Array.from(r.querySelectorAll('.sup-prev-q')).map(d => d.textContent.trim()) : [];
      ok('Балатум 4м.: под двете полета „мин. седм.: 6" и „мин. седм.: 2"', pq(r1).join('|') === 'мин. седм.: 6|мин. седм.: 2', pq(r1).join('|'));
      ok('всяка стойност е в клетката на своята колона (под полето)',
        !!r1 && h.doc.getElementById('sup-q1-f-1').parentNode.querySelector('.sup-prev-q').textContent.indexOf('6') >= 0 &&
        h.doc.getElementById('sup-q2-f-1').parentNode.querySelector('.sup-prev-q').textContent.indexOf('2') >= 0);
      ok('текущата седмица (7/9) НЕ е в „мин. седм."', pq(r1).join('|').indexOf('7') < 0 && pq(r1).join('|').indexOf('9') < 0);
      ok('ред без минал запис: „—" и под двете', pq(r2).join('|') === 'мин. седм.: —|мин. седм.: —', pq(r2).join('|'));
      ok('Кабели (една колона): една стойност „мин. седм.: 0"', pq(rc).join('|') === 'мин. седм.: 0', pq(rc).join('|'));
      const note = r1 ? r1.querySelector('td.sup-prev .sup-prev-note') : null;
      ok('миналият коментар е в последната колона, текстът е точен', !!note && note.textContent === '💬 ' + EVIL, note && note.textContent);
      ok('HTML от коментара НЕ е рендиран', !!r1 && !r1.querySelector('td.sup-prev b'));
      ok('ред без минал коментар: няма .sup-prev-note', !!r2 && !r2.querySelector('.sup-prev-note'));
      ok('бутон „🕘 4 седмици" на всеки ред', ['f-1', 'f-2', 'c-1'].every(id => { const r = rowOf(h, id); return r && btn(r, '4 седмици'); }));
      const heads = Array.from(mod(h).querySelectorAll('#sup-card-tpl-fl thead th')).map(th => th.textContent.trim());
      ok('последната колона се казва „Миналата седмица"', heads[heads.length - 1] === 'Миналата седмица', heads.join('|'));
    }
  }

  section('2. Реален клик „🕘 4 седмици": заявка и съдържание на прозореца');
  {
    let h = null;
    const W = k => h.w.supplyAddDays(h.w.supplyWeekStart(), -7 * k);
    h = env(url => {
      const wk = h.w.supplyWeekStart();
      if (/item_id=eq\./.test(url)) return [
        { id: 'a', item_id: 'f-1', store_name: 'Кърджали', week_start: W(1), qty1: 6, qty2: 2, note: EVIL,
          created_by: 'Склад Кърджали', created_at: '2026-10-05T08:00:00Z', updated_by: 'Склад Кърджали', updated_at: '2026-10-05T08:21:00Z' },
        { id: 'b', item_id: 'f-1', store_name: 'Кърджали', week_start: W(3), qty1: 5, qty2: null, note: null,
          created_by: 'Иван', created_at: '2026-09-21T09:00:00Z', updated_by: null, updated_at: null },
        /* чужд обект и чужд артикул в отговора — не бива да влязат */
        { id: 'x', item_id: 'f-1', store_name: 'Пловдив', week_start: W(2), qty1: 99, qty2: 99, note: 'чужд' },
        { id: 'y', item_id: 'f-2', store_name: 'Кърджали', week_start: W(4), qty1: 88, qty2: 88, note: 'друг артикул' },
        /* текущата седмица — не е в историята */
        { id: 'z', item_id: 'f-1', store_name: 'Кърджали', week_start: wk, qty1: 77, qty2: 77, note: 'сега' }
      ];
      return [];
    });
    h.w.loadSupply(); await ticks(6);
    const getsBefore = h.calls.get.length;
    realClick(h.w, btn(rowOf(h, 'f-1'), '4 седмици'));
    await ticks(6);
    const q = h.calls.get.slice(getsBefore).map(u => decodeURIComponent(u));
    ok('точно една нова заявка', q.length === 1, q.join('\n'));
    ok('по обекта, артикула и четирите предишни понеделника',
      !!q[0] && q[0].indexOf('store_name=eq.Кърджали') >= 0 && q[0].indexOf('item_id=eq.f-1') >= 0 &&
      q[0].indexOf('week_start=in.(' + [W(1), W(2), W(3), W(4)].join(',') + ')') >= 0, q[0]);
    const ov = h.doc.getElementById('sup-hist-ov');
    ok('прозорецът е отворен', !!ov && ov.classList.contains('open'));
    ok('заглавие с името на артикула', !!ov && ov.querySelector('h3').textContent.indexOf('Балатум 4м.') >= 0);
    const wks = ov ? Array.from(ov.querySelectorAll('.sup-hist-week')) : [];
    ok('4 блока, от най-новата към най-старата седмица', wks.map(t => t.getAttribute('data-week')).join(',') === [W(1), W(2), W(3), W(4)].join(','),
      wks.map(t => t.getAttribute('data-week')).join(','));
    ok('без таблица (на телефон таблицата излиза ~690px)', !!ov && !ov.querySelector('table'));
    const qs = el => el ? Array.from(el.querySelectorAll('.sup-hist-q')).map(d => d.textContent.trim()) : [];
    const w1 = wks[0];
    ok('седмица 1: „Седмица от <дата>"', !!w1 && w1.textContent.indexOf('Седмица от ' + h.w.fmtDate(W(1))) === 0, w1 && w1.textContent);
    ok('седмица 1: стойностите с етикетите на бланката', qs(w1).join('|') === FLOOR.col1_label + ': 6|' + FLOOR.col2_label + ': 2', qs(w1).join('|'));
    ok('седмица 1: коментарът — точният текст', !!w1 && w1.querySelector('.sup-hist-note').textContent === '💬 ' + EVIL);
    ok('седмица 1: „Склад Кърджали · <дата час>"', !!w1 && /^Склад Кърджали · \d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(w1.querySelector('.sup-hist-by').textContent), w1 && w1.querySelector('.sup-hist-by').textContent);
    ok('коментарът в прозореца не рендира HTML', !!w1 && !w1.querySelector('b'));
    ok('седмица 2: „няма запис" (записът на Пловдив не влиза)', !!wks[1] && !!wks[1].querySelector('.sup-hist-none') && ov.textContent.indexOf('чужд') < 0,
      wks[1] && wks[1].textContent);
    const w3 = wks[2];
    ok('седмица 3: 5 и „—", без коментар', qs(w3).join('|') === FLOOR.col1_label + ': 5|' + FLOOR.col2_label + ': —' && !!w3 && !w3.querySelector('.sup-hist-note'), qs(w3).join('|'));
    ok('седмица 3: записал Иван (created_by при липса на updated_by)', !!w3 && w3.querySelector('.sup-hist-by').textContent.indexOf('Иван · ') === 0, w3 && w3.querySelector('.sup-hist-by').textContent);
    ok('седмица 4: „няма запис" (редът на друг артикул не влиза)', !!wks[3] && !!wks[3].querySelector('.sup-hist-none') && ov.textContent.indexOf('друг артикул') < 0);
    ok('текущата седмица не е в прозореца', ov.textContent.indexOf('сега') < 0 && ov.textContent.indexOf('77') < 0);

    realClick(h.w, ov.querySelector('.sup-hist-close'));
    ok('„Затвори" затваря прозореца', !ov.classList.contains('open'));
    realClick(h.w, btn(rowOf(h, 'f-1'), '4 седмици'));
    await ticks(6);
    ok('отваря се пак (един и същ елемент, не нов)', ov.classList.contains('open') && h.doc.querySelectorAll('#sup-hist-ov').length === 1);
    ov.dispatchEvent(new h.w.MouseEvent('click', { bubbles: true }));
    ok('клик по фона затваря', !ov.classList.contains('open'));
  }

  section('3. Кабели (една колона): прозорецът е без втора колона');
  {
    let h = null;
    h = env(url => /item_id=eq\./.test(url) ? [{ id: 'a', item_id: 'c-1', store_name: 'Кърджали', week_start: h.w.supplyAddDays(h.w.supplyWeekStart(), -7), qty1: 0, qty2: null, note: null, created_by: 'Иван' }] : []);
    h.w.loadSupply(); await ticks(6);
    realClick(h.w, btn(rowOf(h, 'c-1'), '4 седмици'));
    await ticks(6);
    const ov = h.doc.getElementById('sup-hist-ov');
    const q = Array.from(ov.querySelectorAll('.sup-hist-week')[0].querySelectorAll('.sup-hist-q')).map(d => d.textContent.trim());
    ok('една стойност „Налична макара: 0" (не „—", без втора)', q.join('|') === 'Налична макара: 0', q.join('|'));
    ok('останалите 3 седмици — „няма запис"', ov.querySelectorAll('.sup-hist-none').length === 3);
  }

  section('4. Провал на заявката: червен ред, НЕ „няма запис"');
  {
    const h = env(() => [], { fail: { GET: /item_id=eq\./ } });
    h.w.loadSupply(); await ticks(6);
    realClick(h.w, btn(rowOf(h, 'f-1'), '4 седмици'));
    await ticks(6);
    const ov = h.doc.getElementById('sup-hist-ov');
    const err = ov && ov.querySelector('.sup-hist-err');
    ok('червен ред „Историята не можа да се зареди"', !!err && err.textContent.indexOf('Историята не можа да се зареди') >= 0 && /dc2626|220, ?38, ?38/.test(err.getAttribute('style')));
    ok('НЕ лъже: няма „няма запис" и няма блокове по седмици', ov.textContent.indexOf('няма запис') < 0 && !ov.querySelector('.sup-hist-week'));
    ok('формата отдолу е непокътната', !!h.doc.getElementById('sup-q1-f-1'));
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
