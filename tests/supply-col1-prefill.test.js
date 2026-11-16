/* Зареждане — подсказка за колона 1 от последната въведена стойност
   (SUPPLY_STICKY_COL1 = ['floor-lm'], 16.11.2026).

   При „Подови настилки (линейни метри)" col1 е „места в търговската зала" —
   сменя се само при нов дисплей / стелаж / стойка. Ако тази седмица редът
   няма qty1, полето се попълва с най-новото непразно qty1 на обекта за
   артикула от предишна седмица (без ограничение назад), с „от дд.мм" отдолу.
   Записва се само при „💾 Запази". Другите бланки (Кабели — „Налична
   макара") НЕ се подсказват.

   Какво се заковава (с РЕАЛЕН клик на „💾 Запази"):
   а) без qty1 тази седмица → полето е с последното qty1 + „от дд.мм";
      записът го праща като qty1;
   б) с qty1 тази седмица → то, без подсказка;
   в) Кабели (друг slug) → без подсказка;
   г) няма история → празно поле, без „от";
   д) обектът сменя стойността → записва се новата;
   е) провал на заявката → празно поле + червен toast, формата я има;
   + подсказаната непроменена стойност не блокира „Нямам нужда";
     при отбелязано „Нямам нужда" — без подсказка.

   Пускане: node tests/supply-col1-prefill.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, realClick, btn } = H;

const STORE = { email: 'ra@temax.bg', display_name: 'Мария Раднево', role: 'store', store_name: 'Раднево' };

const TPL_FL = { id: 'tpl-fl', name: 'Подови настилки (линейни метри)', slug: 'floor-lm', col1_label: 'Общ брой места в търговска зала',
  col2_label: 'Брой за трансфер/поръчка', target_stores: null, active: true, sort_order: 0 };
const TPL_CB = { id: 'tpl-cb', name: 'Кабели на макара', slug: 'cables-reels', col1_label: 'Налична макара',
  col2_label: null, target_stores: null, active: true, sort_order: 1 };
const ITEMS = [
  { id: 'it-a', template_id: 'tpl-fl', sap_code: null, name: 'Балатум 4м.', supplier: 'ВАМКО', active: true, sort_order: 1 },
  { id: 'it-b', template_id: 'tpl-fl', sap_code: null, name: 'Балатум 3м.', supplier: 'ВАМКО', active: true, sort_order: 2 },
  { id: 'it-n', template_id: 'tpl-fl', sap_code: null, name: 'Мокет нов', supplier: 'ВАМКО', active: true, sort_order: 3 },
  { id: 'it-c', template_id: 'tpl-cb', sap_code: '23237', name: 'ПВВ-МБ1 2X1', supplier: 'Кабелен', active: true, sort_order: 1 }
];

/* Мини-PostgREST върху масив: eq / in / lt / not.is.null. Обвивката не
   филтрира — без това всяка заявка би върнала всички редове. */
function pg(rows, url) {
  const u = new URL(url);
  let out = rows.slice();
  u.searchParams.forEach((v, k) => {
    if (['select', 'order', 'limit', 'offset'].indexOf(k) >= 0) return;
    const val = x => String(x == null ? '' : x);
    if (v.indexOf('eq.') === 0) out = out.filter(r => val(r[k]) === v.slice(3));
    else if (v.indexOf('in.(') === 0) { const set = v.slice(4, -1).split(','); out = out.filter(r => set.indexOf(val(r[k])) >= 0); }
    else if (v.indexOf('lt.') === 0) out = out.filter(r => r[k] != null && val(r[k]) < v.slice(3));
    else if (v === 'not.is.null') out = out.filter(r => r[k] != null);
  });
  return out;
}
function env(st, fail) {
  return boot({
    modules: ['pallets.js', 'supply.js'],
    user: STORE,
    fail: fail,
    data: {
      supply_templates: [TPL_FL, TPL_CB],
      supply_template_items: ITEMS,
      supply_entries: url => pg(st.entries, url),
      supply_store_notes: [],
      supply_no_need: url => pg(st.noNeed, url)
    }
  });
}
const card = (h, tid) => h.doc.getElementById('sup-card-' + tid);
const q1 = (h, id) => h.doc.getElementById('sup-q1-' + id);
const hint = (h, id) => { const el = q1(h, id); return el ? el.parentNode.querySelector('.sup-sticky') : null; };
const entryPosts = h => h.calls.post.filter(p => /\/supply_entries(\?|$)/.test(p.url));
const entryPatches = h => h.calls.patch.filter(p => /\/supply_entries\?/.test(p.url));
const toastBg = h => (h.doc.getElementById('toast') || { style: {} }).style.background;
const toastTxt = h => (h.doc.getElementById('toast') || {}).textContent || '';
const isRed = h => /220,\s*38,\s*38|#dc2626/i.test(toastBg(h));
const dm = w => w.slice(8, 10) + '.' + w.slice(5, 7);

/* История: it-a — 7 преди три седмици, 9 преди две (най-новото), миналата
   седмица ред само с qty2 (qty1 празно — не бива да „изтрие" подсказката);
   it-b — 12 преди пет седмици; it-n — нищо; it-c (Кабели) — 40 миналата. */
function history(wk, addDays) {
  const w1 = addDays(wk, -7), w2 = addDays(wk, -14), w3 = addDays(wk, -21), w5 = addDays(wk, -35);
  return {
    w1, w2, w5,
    rows: [
      { id: 'h1', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Раднево', week_start: w2, qty1: 9, qty2: 1 },
      { id: 'h2', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Раднево', week_start: w3, qty1: 7, qty2: 2 },
      { id: 'h3', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Раднево', week_start: w1, qty1: null, qty2: 4 },
      { id: 'h4', template_id: 'tpl-fl', item_id: 'it-b', store_name: 'Раднево', week_start: w5, qty1: 12, qty2: null },
      { id: 'h5', template_id: 'tpl-cb', item_id: 'it-c', store_name: 'Раднево', week_start: w1, qty1: 40, qty2: null },
      /* друг обект — не влиза */
      { id: 'h6', template_id: 'tpl-fl', item_id: 'it-n', store_name: 'Силистра', week_start: w1, qty1: 99, qty2: null }
    ]
  };
}

(async function () {

  section('а / в / г. Подсказка от последната стойност; Кабели и без история — празно');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(st);
    const wk = h.w.supplyWeekStart();
    const hs = history(wk, h.w.supplyAddDays);
    st.entries = hs.rows.slice();
    if (guard('loadSupply() не хвърля', () => h.w.loadSupply())) {
      await ticks(10);
      ok('SUPPLY_STICKY_COL1 = [floor-lm]', JSON.stringify(h.w.SUPPLY_STICKY_COL1) === '["floor-lm"]');
      const sq = h.calls.get.filter(u => /supply_entries\?/.test(u) && /qty1=not\.is\.null/.test(u));
      ok('една заявка за историята (на страници)', sq.length === 1, h.calls.get.filter(u => /supply_entries/.test(u)).join('\n'));
      ok('заявката: обектът, само floor-lm, преди седмицата',
        sq.length === 1 && sq[0].indexOf('store_name=eq.' + encodeURIComponent('Раднево')) >= 0 &&
        sq[0].indexOf('template_id=in.(tpl-fl)') >= 0 && sq[0].indexOf('week_start=lt.' + wk) >= 0 &&
        /limit=1000&offset=0/.test(sq[0]), sq[0]);

      ok('(а) it-a: полето е 9 (най-новото непразно, не 7)', q1(h, 'it-a') && q1(h, 'it-a').value === '9', q1(h, 'it-a') && q1(h, 'it-a').value);
      ok('(а) под него „от ' + dm(addW(hs)) + '"', hint(h, 'it-a') && hint(h, 'it-a').textContent === 'от ' + dm(addW(hs)),
        hint(h, 'it-a') && hint(h, 'it-a').textContent);
      ok('(а) ред с празно qty1 миналата седмица не мести подсказката', q1(h, 'it-a').value === '9');
      ok('(а) it-b: 12 от преди пет седмици (без ограничение назад)', q1(h, 'it-b').value === '12' && hint(h, 'it-b').textContent === 'от ' + dm(hs.w5));
      ok('(а) „мин. седм." остава записаното (—)', /мин\. седм\.: —/.test(q1(h, 'it-a').parentNode.textContent), q1(h, 'it-a').parentNode.textContent);
      ok('(а) колона 2 НЕ се подсказва', h.doc.getElementById('sup-q2-it-a').value === '');
      ok('(г) it-n: празно поле, без „от" (99 е на друг обект)', q1(h, 'it-n').value === '' && !hint(h, 'it-n'));
      ok('(в) Кабели: празно поле, без „от"', q1(h, 'it-c').value === '' && !hint(h, 'it-c'));
      ok('без червен toast', !isRed(h), toastTxt(h));
      ok('нищо не е записано само от отварянето', entryPosts(h).length === 0 && entryPatches(h).length === 0);

      /* „Нямам нужда" с подсказаните, непроменени стойности — минава. */
      const nnb = btn(card(h, 'tpl-fl'), 'Нямам нужда');
      ok('бутонът „Нямам нужда" е активен', !!nnb && !nnb.disabled);
      realClick(h.w, nnb); await ticks(4);
      ok('подсказаната стойност не блокира „Нямам нужда" (POST към supply_no_need)',
        h.calls.post.filter(p => /supply_no_need/.test(p.url)).length === 1, toastTxt(h));
    }
    h.close();
  }

  section('а. „💾 Запази" праща подсказаната стойност като qty1');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(st);
    const wk = h.w.supplyWeekStart();
    st.entries = history(wk, h.w.supplyAddDays).rows.slice();
    h.w.loadSupply(); await ticks(10);
    h.doc.getElementById('sup-q2-it-a').value = '2';   /* колона 2 е задължителна при floor-lm */
    realClick(h.w, btn(card(h, 'tpl-fl'), 'Запази')); await ticks(8);
    const posts = entryPosts(h);
    const a = posts.find(p => p.body.item_id === 'it-a'), b = posts.find(p => p.body.item_id === 'it-b');
    ok('POST за it-a с qty1 = 9 (подсказано), qty2 = 2, за текущата седмица', !!a && a.body.qty1 === 9 && a.body.qty2 === 2 && a.body.week_start === wk, JSON.stringify(a && a.body));
    ok('POST за it-b с qty1 = 12', !!b && b.body.qty1 === 12, JSON.stringify(b && b.body));
    ok('it-n (празно) не се записва', !posts.some(p => p.body.item_id === 'it-n'));
    ok('Кабели не се пипат', !posts.some(p => p.body.template_id === 'tpl-cb'));
    h.close();
  }

  section('б / д. С qty1 тази седмица → без подсказка; сменена стойност → записва се новата');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(st);
    const wk = h.w.supplyWeekStart();
    st.entries = history(wk, h.w.supplyAddDays).rows.concat([
      { id: 'c1', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Раднево', week_start: wk, qty1: 5, qty2: null, created_by: 'Мария', created_at: '2026-11-16T07:00:00Z' }
    ]);
    h.w.loadSupply(); await ticks(10);
    ok('(б) it-a: 5 (тази седмица), без „от"', q1(h, 'it-a').value === '5' && !hint(h, 'it-a'), q1(h, 'it-a').value);
    ok('(б) it-b: пак подсказано 12', q1(h, 'it-b').value === '12' && !!hint(h, 'it-b'));
    q1(h, 'it-b').value = '15';
    h.doc.getElementById('sup-q2-it-b').value = '1';   /* колона 2 е задължителна при floor-lm */
    realClick(h.w, btn(card(h, 'tpl-fl'), 'Запази')); await ticks(8);
    const pa = entryPatches(h).find(p => /id=eq\.c1/.test(p.url));
    const pb = entryPosts(h).find(p => p.body.item_id === 'it-b');
    ok('(б) it-a: PATCH с qty1 = 5', !!pa && pa.body.qty1 === 5, JSON.stringify(pa && pa.body));
    ok('(д) it-b: POST с qty1 = 15 (новата, не 12)', !!pb && pb.body.qty1 === 15, JSON.stringify(pb && pb.body));
    h.close();
  }

  section('д. Изтрита подсказка → празно, без запис на qty1');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(st);
    const wk = h.w.supplyWeekStart();
    st.entries = history(wk, h.w.supplyAddDays).rows.slice();
    h.w.loadSupply(); await ticks(10);
    q1(h, 'it-a').value = ''; q1(h, 'it-b').value = '';
    h.doc.getElementById('sup-q2-it-a').value = '3';
    realClick(h.w, btn(card(h, 'tpl-fl'), 'Запази')); await ticks(8);
    const a = entryPosts(h).find(p => p.body.item_id === 'it-a');
    ok('it-a: qty1 = null, qty2 = 3', !!a && a.body.qty1 === null && a.body.qty2 === 3, JSON.stringify(a && a.body));
    ok('it-b: не се записва', !entryPosts(h).some(p => p.body.item_id === 'it-b'));
    h.close();
  }

  /* Решение на Тенчо, 16.11.2026: при floor-lm „Запази" иска поне една стойност
     в колона 2 (никога не се подсказва → от тази седмица). 0 е стойност. */
  const NEED_COL2 = 'Въведете брой за трансфер/поръчка или натиснете „Нямам нужда тази седмица“.';
  const saveFl = async (setup) => {
    const st = { entries: [], noNeed: [] };
    const h = env(st);
    st.entries = history(h.w.supplyWeekStart(), h.w.supplyAddDays).rows.slice();
    h.w.loadSupply(); await ticks(10);
    if (setup) setup(h);
    realClick(h.w, btn(card(h, 'tpl-fl'), 'Запази')); await ticks(8);
    return h;
  };

  section('Колона 2 при floor-lm: само подсказки → отказ');
  {
    const h = await saveFl();
    ok('подсказките са в полетата (9 и 12)', q1(h, 'it-a').value === '9' && q1(h, 'it-b').value === '12');
    ok('0 POST и 0 PATCH към supply_entries', entryPosts(h).length === 0 && entryPatches(h).length === 0,
      JSON.stringify(entryPosts(h).map(p => p.body)));
    ok('не е правена и заявката за съществуващите редове', !h.calls.get.some(u => /supply_entries\?.*week_start=eq\./.test(u)));
    ok('червен toast с точния текст', isRed(h) && toastTxt(h) === NEED_COL2, toastTxt(h));
    ok('„Нямам нужда" не е махнато (без DELETE)', h.calls.del.length === 0);
    h.close();
  }

  section('Колона 2 при floor-lm: сменена колона 1 и коментар без колона 2 → пак отказ');
  {
    const h = await saveFl(h => { q1(h, 'it-a').value = '20'; h.doc.getElementById('sup-note-it-n').value = 'спрян'; });
    ok('0 POST', entryPosts(h).length === 0 && entryPatches(h).length === 0);
    ok('същият червен toast', isRed(h) && toastTxt(h) === NEED_COL2, toastTxt(h));
    h.close();
  }

  section('Колона 2 при floor-lm: една стойност → запис');
  {
    const h = await saveFl(h => { h.doc.getElementById('sup-q2-it-n').value = '4'; });
    const n = entryPosts(h).find(p => p.body.item_id === 'it-n');
    ok('it-n: POST с qty2 = 4', !!n && n.body.qty2 === 4, JSON.stringify(n && n.body));
    ok('подсказките също се записват (it-a 9, it-b 12)', entryPosts(h).some(p => p.body.item_id === 'it-a' && p.body.qty1 === 9) &&
      entryPosts(h).some(p => p.body.item_id === 'it-b' && p.body.qty1 === 12));
    ok('без червен toast', !isRed(h), toastTxt(h));
    h.close();
  }

  section('Колона 2 при floor-lm: 0 е стойност → запис');
  {
    const h = await saveFl(h => { h.doc.getElementById('sup-q2-it-b').value = '0'; });
    const b = entryPosts(h).find(p => p.body.item_id === 'it-b');
    ok('it-b: POST с qty1 = 12, qty2 = 0', !!b && b.body.qty1 === 12 && b.body.qty2 === 0, JSON.stringify(b && b.body));
    ok('без червен toast', !isRed(h), toastTxt(h));
    h.close();
  }

  section('Колона 2 при floor-lm: стойност, записана по-рано тази седмица → редакцията минава');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(st);
    const wk = h.w.supplyWeekStart();
    st.entries = history(wk, h.w.supplyAddDays).rows.concat([
      { id: 'c2', template_id: 'tpl-fl', item_id: 'it-n', store_name: 'Раднево', week_start: wk, qty1: null, qty2: 6 }
    ]);
    h.w.loadSupply(); await ticks(10);
    ok('it-n колона 2 = 6 от записа', h.doc.getElementById('sup-q2-it-n').value === '6');
    realClick(h.w, btn(card(h, 'tpl-fl'), 'Запази')); await ticks(8);
    const pn = entryPatches(h).find(p => /id=eq\.c2/.test(p.url));
    ok('PATCH за it-n с qty2 = 6', !!pn && pn.body.qty2 === 6, JSON.stringify(pn && pn.body));
    ok('без червен toast', !isRed(h), toastTxt(h));
    h.close();
  }

  section('Кабели (без колона 2) — без промяна: само колона 1 → запис');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(st);
    h.w.loadSupply(); await ticks(10);
    q1(h, 'it-c').value = '3';
    realClick(h.w, btn(card(h, 'tpl-cb'), 'Запази')); await ticks(8);
    const c = entryPosts(h).find(p => p.body.item_id === 'it-c');
    ok('it-c: POST с qty1 = 3', !!c && c.body.qty1 === 3, JSON.stringify(c && c.body));
    ok('без червен toast', !isRed(h), toastTxt(h));
    h.close();
  }

  section('„Нямам нужда" отбелязано → без подсказка');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(st);
    const wk = h.w.supplyWeekStart();
    st.entries = history(wk, h.w.supplyAddDays).rows.slice();
    st.noNeed = [{ id: 'nn1', template_id: 'tpl-fl', store_name: 'Раднево', week_start: wk, created_by: 'Мария', created_at: '2026-11-16T06:33:00Z' }];
    h.w.loadSupply(); await ticks(10);
    ok('зеленият ред „Нямам нужда" е там', !!card(h, 'tpl-fl').querySelector('.sup-no-need'));
    ok('it-a и it-b са празни, без „от"', q1(h, 'it-a').value === '' && q1(h, 'it-b').value === '' && !hint(h, 'it-a') && !hint(h, 'it-b'));
    h.close();
  }

  section('е. Провал на заявката → празно + червен toast, формата я има');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(st, { GET: /qty1=not\.is\.null/ });
    const wk = h.w.supplyWeekStart();
    st.entries = history(wk, h.w.supplyAddDays).rows.slice();
    h.w.loadSupply(); await ticks(10);
    ok('формата е показана (поле за it-a)', !!q1(h, 'it-a'));
    ok('it-a и it-b са празни, без „от"', q1(h, 'it-a').value === '' && q1(h, 'it-b').value === '' && !hint(h, 'it-a') && !hint(h, 'it-b'));
    ok('червен toast', isRed(h), toastBg(h));
    ok('toast-ът назовава колоната и казва „ръчно"', /Общ брой места в търговска зала/.test(toastTxt(h)) && /ръчно/.test(toastTxt(h)), toastTxt(h));
    ok('Кабели също са показани', !!q1(h, 'it-c'));
    h.close();
  }

  section('Без floor-lm при обекта → няма заявка за историята');
  {
    const st = { entries: [], noNeed: [] };
    const h = boot({
      modules: ['pallets.js', 'supply.js'], user: STORE,
      data: { supply_templates: [TPL_CB], supply_template_items: ITEMS, supply_entries: url => pg(st.entries, url), supply_store_notes: [], supply_no_need: [] }
    });
    h.w.loadSupply(); await ticks(10);
    ok('Кабели са показани', !!q1(h, 'it-c'));
    ok('без заявка с qty1=not.is.null', !h.calls.get.some(u => /qty1=not\.is\.null/.test(u)));
    h.close();
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });

/* Седмицата на най-новото непразно qty1 за it-a — w2 (две седмици назад). */
function addW(hs) { return hs.__w2 || (hs.__w2 = hs.rows.find(r => r.id === 'h1').week_start); }
