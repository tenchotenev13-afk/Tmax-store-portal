/* Зареждане — „Нямам нужда тази седмица" по бланка
   (supply_no_need, supply-no-need-schema.sql, 13.10.2026).

   Ред в supply_no_need се брои за попълнена бланка в supply_store_done() и
   задачата „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М." се отмята. Случаят: Силистра, 12.10 —
   „Подови" попълнена, „Кабели" празна → без отметка.

   Какво се заковава (с РЕАЛЕН клик):
   1. бланка без записи → бутонът е активен; клик → POST към supply_no_need с
      template_id / store_name / week_start; след презареждане — зелен ред
      „✅ Нямам нужда…" и „↩ Отмени"; клик „Отмени" → DELETE по id;
   2. бланка със ЗАПИСАНИ количества → бутонът е disabled, с title;
      въведено, но незаписано количество → клик отказва, без POST;
   3. „Запази" със стойност → DELETE на реда в supply_no_need за бланката;
      „Запази" само с коментар → без DELETE;
   4. грешка при този DELETE → червен toast; грешка при POST → червен toast;
   5. ЦО: „➖ … — без нужда" в списъка, колона с „без нужда" в клетките,
      брояч „без нужда: N"; обект с бройки И отметка → данните печелят;
   6. Excel: „без нужда" в клетката; Общо не се мени;
   7. Бюлетин: надписът „попълнено X от Y" брои отметката (bulLoadSupplyPending).

   МУТАЦИОННА ПРОВЕРКА (13.10.2026, ръчно върху копие на supply.js) — всеки
   от вариантите долу събаря теста (exit 1):
   - POST към 'supply_no_needs' вместо 'supply_no_need';
   - липсващ sbDelete в submitSupplyForm (след успешен запис);
   - бутон без атрибута disabled при записани количества;
   - bulletin.js без res[2].forEach (отметката не се брои в надписа);
   - ЦО без маркера в клетката (num(v) вместо „без нужда");
   - DELETE и при запис само с коментар (без проверката hasVal);
   - „Отмени" с грешно id (template_id вместо id на реда).

   Пускане: node tests/supply-no-need.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, realClick, btn } = H;

const STORE = { email: 'si@temax.bg', display_name: 'Петя Силистра', role: 'store', store_name: 'Силистра' };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

const TPL_FL = { id: 'tpl-fl', name: 'Подови настилки', slug: 'floor-lm', col1_label: 'Места в зала',
  col2_label: 'Брой за трансфер/поръчка', target_stores: null, active: true, sort_order: 0 };
const TPL_CB = { id: 'tpl-cb', name: 'Кабели на макара', slug: 'cables', col1_label: 'Налична макара',
  col2_label: null, target_stores: null, active: true, sort_order: 1 };
const ITEMS = [
  { id: 'it-fl', template_id: 'tpl-fl', sap_code: null, name: 'Балатум 4м.', supplier: 'ВАМКО', active: true, sort_order: 1 },
  { id: 'it-cb', template_id: 'tpl-cb', sap_code: '1001', name: 'ПВ-А2 1.5', supplier: 'Кабелен', active: true, sort_order: 1 }
];

/* st = {entries, noNeed} — масиви, които тестът мени, за да „симулира базата". */
function env(user, st, fail) {
  return boot({
    modules: ['pallets.js', 'supply.js'],
    user: user,
    fail: fail,
    data: {
      supply_templates: [TPL_FL, TPL_CB],
      supply_template_items: ITEMS,
      supply_entries: () => st.entries,
      supply_store_notes: [],
      supply_no_need: () => st.noNeed,
      users: [{ store_name: 'Силистра' }, { store_name: 'Сливен' }]
    }
  });
}
const mod = h => h.doc.getElementById('mod-supply');
const card = (h, tid) => h.doc.getElementById('sup-card-' + tid);
const nnPosts = h => h.calls.post.filter(p => p.table === 'supply_no_need' || /\/supply_no_need(\?|$)/.test(p.url));
const nnDels = h => h.calls.del.filter(u => /\/supply_no_need\?/.test(u));
const toastBg = h => (h.doc.getElementById('toast') || { style: {} }).style.background;
const isRed = h => /220,\s*38,\s*38|#dc2626/i.test(toastBg(h));

(async function () {

  section('1. Бланка без записи: „Нямам нужда" → POST; после „Отмени" → DELETE');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(STORE, st);
    const wk = h.w.supplyWeekStart();
    if (guard('loadSupply() не хвърля', () => h.w.loadSupply())) {
      await ticks(8);
      ok('заявката към supply_no_need е за обекта и седмицата',
        h.calls.get.some(u => /supply_no_need\?/.test(u) && u.indexOf('store_name=eq.' + encodeURIComponent('Силистра')) >= 0 &&
          u.indexOf('week_start=eq.' + wk) >= 0), h.calls.get.filter(u => /no_need/.test(u)).join('\n'));
      const b = btn(card(h, 'tpl-cb'), 'Нямам нужда');
      ok('бутонът „Нямам нужда тази седмица" съществува в „Кабели"', !!b);
      ok('и е активен', !!b && !b.disabled && !b.hasAttribute('disabled'));
      ok('бутонът стои и в „Подови"', !!btn(card(h, 'tpl-fl'), 'Нямам нужда'));
      ok('зелен ред още няма', !mod(h).querySelector('.sup-no-need'));

      realClick(h.w, b); await ticks(4);
      const p = nnPosts(h);
      ok('точно един POST към supply_no_need', p.length === 1, JSON.stringify(h.calls.post.map(x => x.url)));
      if (p.length) {
        ok('template_id = tpl-cb', p[0].body.template_id === 'tpl-cb', p[0].body.template_id);
        ok('store_name = Силистра', p[0].body.store_name === 'Силистра', p[0].body.store_name);
        ok('week_start = понеделникът', p[0].body.week_start === wk, p[0].body.week_start);
        ok('created_by = името на човека', p[0].body.created_by === 'Петя Силистра', p[0].body.created_by);
      }
      ok('нищо не се пише в supply_entries', h.calls.post.filter(x => /supply_entries/.test(x.url)).length === 0);

      /* „Базата" вече има реда — презареждането след клика го чете. */
      st.noNeed.push({ id: 'nn-1', template_id: 'tpl-cb', store_name: 'Силистра', week_start: wk,
        created_by: 'Петя Силистра', created_at: new Date(2026, 9, 12, 9, 5).toISOString() });
      h.w.loadSupply(); await ticks(8);
      const row = card(h, 'tpl-cb').querySelector('.sup-no-need');
      ok('зеленият ред се вижда', !!row);
      ok('текст „✅ Нямам нужда тази седмица — отбелязано 12.10 09:05 от Петя Силистра"',
        !!row && row.textContent.indexOf('✅ Нямам нужда тази седмица — отбелязано 12.10 09:05 от Петя Силистра') >= 0,
        row && row.textContent);
      const undo = btn(card(h, 'tpl-cb'), 'Отмени');
      ok('бутон „↩ Отмени"', !!undo);
      ok('бутонът „Нямам нужда" вече го няма в „Кабели"', !btn(card(h, 'tpl-cb'), 'Нямам нужда'));
      ok('в „Подови" — без зелен ред, бутонът стои', !card(h, 'tpl-fl').querySelector('.sup-no-need') && !!btn(card(h, 'tpl-fl'), 'Нямам нужда'));

      if (undo) { realClick(h.w, undo); await ticks(4); }
      const d = nnDels(h);
      ok('„Отмени" → точно един DELETE към supply_no_need', d.length === 1, h.calls.del.join('\n'));
      ok('DELETE е по id на реда', d.length === 1 && /[?&]id=eq\.nn-1(&|$)/.test(d[0]), d[0]);
    }
    h.close();
  }

  section('2. Записани количества → бутонът е disabled; незаписани → клик отказва');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(STORE, st);
    const wk = h.w.supplyWeekStart();
    st.entries = [{ id: 'e1', template_id: 'tpl-fl', item_id: 'it-fl', store_name: 'Силистра', week_start: wk, qty1: 3, qty2: null,
      created_by: 'Петя', created_at: '2026-10-12T07:00:00Z' }];
    h.w.loadSupply(); await ticks(8);
    const b = btn(card(h, 'tpl-fl'), 'Нямам нужда');
    ok('бутонът стои (не се крие според данните)', !!b);
    ok('но е disabled', !!b && b.disabled === true);
    ok('с title „Има попълнени количества — първо ги изчисти"',
      !!b && b.getAttribute('title') === 'Има попълнени количества — първо ги изчисти', b && b.getAttribute('title'));
    const b2 = btn(card(h, 'tpl-cb'), 'Нямам нужда');
    ok('КОНТРОЛА: в празната „Кабели" е активен', !!b2 && !b2.disabled);
    /* Ред само с коментар не прави бутона неактивен. */
    st.entries.push({ id: 'e2', template_id: 'tpl-cb', item_id: 'it-cb', store_name: 'Силистра', week_start: wk, qty1: null, qty2: null, note: 'нямаме място' });
    h.w.loadSupply(); await ticks(8);
    const b3 = btn(card(h, 'tpl-cb'), 'Нямам нужда');
    ok('ред само с коментар → бутонът остава активен', !!b3 && !b3.disabled);
    /* Въведено, но НЕзаписано количество → клик отказва. */
    h.doc.getElementById('sup-q1-it-cb').value = '2';
    if (b3) { realClick(h.w, b3); await ticks(4); }
    ok('незаписано количество → няма POST', nnPosts(h).length === 0, JSON.stringify(nnPosts(h)));
    ok('и предупреждение', h.calls.toast.some(m => m.indexOf('Има попълнени количества') >= 0), h.calls.toast.join(' | '));
    h.close();
  }

  section('3. „Запази" със стойност → DELETE на отметката; само коментар → без DELETE');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(STORE, st);
    const wk = h.w.supplyWeekStart();
    st.noNeed.push({ id: 'nn-2', template_id: 'tpl-cb', store_name: 'Силистра', week_start: wk, created_by: 'Петя', created_at: '2026-10-12T07:00:00Z' });
    h.w.loadSupply(); await ticks(8);
    /* само коментар */
    h.doc.getElementById('sup-note-it-cb').value = 'само бележка';
    realClick(h.w, btn(card(h, 'tpl-cb'), 'Запази')); await ticks(8);
    ok('само коментар → POST в supply_entries', h.calls.post.filter(x => /supply_entries/.test(x.url)).length === 1);
    ok('и НЯМА DELETE към supply_no_need', nnDels(h).length === 0, h.calls.del.join('\n'));
    /* със стойност */
    h.calls.post.length = 0;
    h.doc.getElementById('sup-q1-it-cb').value = '0';
    realClick(h.w, btn(card(h, 'tpl-cb'), 'Запази')); await ticks(8);
    const d = nnDels(h);
    ok('стойност (0 се брои) → един DELETE към supply_no_need', d.length === 1, h.calls.del.join('\n'));
    if (d.length) {
      ok('филтърът е по бланката', d[0].indexOf('template_id=eq.tpl-cb') >= 0, d[0]);
      ok('по обекта', d[0].indexOf('store_name=eq.' + encodeURIComponent('Силистра')) >= 0, d[0]);
      ok('по седмицата', d[0].indexOf('week_start=eq.' + wk) >= 0, d[0]);
    }
    ok('toast „💾 Запазено"', h.calls.toast[h.calls.toast.length - 1] === '💾 Запазено', h.calls.toast.join(' | '));
    h.close();
  }

  section('4. Грешки: DELETE при запис и POST на отметката → червен toast');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(STORE, st, { DELETE: { status: 500, body: { message: 'boom-del' }, url: /supply_no_need/ } });
    const wk = h.w.supplyWeekStart();
    st.noNeed.push({ id: 'nn-3', template_id: 'tpl-cb', store_name: 'Силистра', week_start: wk, created_by: 'Петя', created_at: '2026-10-12T07:00:00Z' });
    h.w.loadSupply(); await ticks(8);
    h.doc.getElementById('sup-q1-it-cb').value = '4';
    realClick(h.w, btn(card(h, 'tpl-cb'), 'Запази')); await ticks(8);
    const last = h.calls.toast[h.calls.toast.length - 1] || '';
    ok('toast казва, че отметката НЕ е махната', last.indexOf('„Нямам нужда" НЕ е махнато') >= 0 && last.indexOf('boom-del') >= 0, last);
    ok('toast-ът е червен', isRed(h), toastBg(h));
    ok('НЕ казва „💾 Запазено"', h.calls.toast.indexOf('💾 Запазено') < 0, h.calls.toast.join(' | '));
    h.close();

    const st2 = { entries: [], noNeed: [] };
    const h2 = env(STORE, st2, { POST: { status: 409, body: { message: 'duplicate key' }, url: /supply_no_need/ } });
    h2.w.loadSupply(); await ticks(8);
    realClick(h2.w, btn(card(h2, 'tpl-cb'), 'Нямам нужда')); await ticks(6);
    const l2 = h2.calls.toast[h2.calls.toast.length - 1] || '';
    ok('провален POST → toast с грешката', l2.indexOf('Грешка при запис на „Нямам нужда"') >= 0 && l2.indexOf('duplicate key') >= 0, l2);
    ok('и е червен', isRed(h2), toastBg(h2));
    h2.close();

    const st3 = { entries: [], noNeed: [] };
    const h3 = env(STORE, st3, { DELETE: { status: 500, body: { message: 'boom-undo' }, url: /supply_no_need/ } });
    st3.noNeed.push({ id: 'nn-4', template_id: 'tpl-cb', store_name: 'Силистра', week_start: h3.w.supplyWeekStart(), created_by: 'Петя', created_at: '2026-10-12T07:00:00Z' });
    h3.w.loadSupply(); await ticks(8);
    realClick(h3.w, btn(card(h3, 'tpl-cb'), 'Отмени')); await ticks(6);
    const l3 = h3.calls.toast[h3.calls.toast.length - 1] || '';
    ok('провалено „Отмени" → червен toast', l3.indexOf('boom-undo') >= 0 && isRed(h3), l3 + ' / ' + toastBg(h3));
    h3.close();
  }

  section('5. ЦО: списък, колона и клетки „без нужда"');
  {
    const st = { entries: [], noNeed: [] };
    const h = env(ADMIN, st);
    const wk = h.w.supplyWeekStart();
    st.entries = [
      { id: 'e1', template_id: 'tpl-fl', item_id: 'it-fl', store_name: 'Силистра', week_start: wk, qty1: 3, qty2: 1 },
      { id: 'e2', template_id: 'tpl-cb', item_id: 'it-cb', store_name: 'Сливен', week_start: wk, qty1: 5, qty2: null }
    ];
    st.noNeed = [
      { id: 'nn-a', template_id: 'tpl-cb', store_name: 'Силистра', week_start: wk, created_by: 'Петя', created_at: '2026-10-12T07:00:00Z' },
      /* Сливен има бройки по „Подови"? Не — но има отметка И бройки в „Кабели" → данните печелят */
      { id: 'nn-b', template_id: 'tpl-cb', store_name: 'Сливен', week_start: wk, created_by: 'Иван', created_at: '2026-10-12T07:00:00Z' }
    ];
    h.w.loadSupply(); await ticks(10);
    const cb = h.doc.getElementById('sup-ov-tpl-cb');
    ok('картата на „Кабели" е рендирана', !!cb);
    if (cb) {
      ok('заявката чете supply_no_need за седмицата', h.calls.get.some(u => /supply_no_need\?/.test(u) && u.indexOf('week_start=eq.' + wk) >= 0));
      const nnSpan = cb.querySelector('.sup-ov-store[data-filled="nn"]');
      ok('Силистра в списъка е „➖ Силистра — без нужда"', !!nnSpan && nnSpan.textContent.trim() === '➖ Силистра — без нужда', nnSpan && nnSpan.textContent);
      const sl = Array.from(cb.querySelectorAll('.sup-ov-store')).find(s => s.textContent.indexOf('Сливен') >= 0);
      ok('Сливен (бройки + отметка) е ✅, не „без нужда"', !!sl && sl.getAttribute('data-filled') === '1', sl && sl.outerHTML);
      const title = cb.querySelector('.card-title').textContent;
      ok('заглавие „попълнили 1 от 2 · без нужда: 1"', title.indexOf('попълнили 1 от 2 · без нужда: 1') >= 0, title);
      const heads = Array.from(cb.querySelectorAll('thead th')).map(t => t.textContent.trim());
      ok('Силистра има колона (target_stores null, без бройки)', heads.indexOf('Силистра') >= 0, heads.join('|'));
      const nnCells = cb.querySelectorAll('td.sup-nn');
      ok('точно една клетка „без нужда" (един артикул × Силистра)', nnCells.length === 1, String(nnCells.length));
      ok('текстът в нея е „без нужда"', nnCells.length === 1 && nnCells[0].textContent === 'без нужда');
      const tot = cb.querySelector('td.sup-total');
      ok('Общо е само бройката на Сливен (5)', !!tot && tot.textContent === '5', tot && tot.textContent);
    }
    const fl = h.doc.getElementById('sup-ov-tpl-fl');
    ok('в „Подови" няма „без нужда"', !!fl && !fl.querySelector('.sup-nn') && !fl.querySelector('[data-filled="nn"]'));

    section('6. Excel: „без нужда" в клетката');
    const x = { aoas: [] };
    h.w.XLSX = {
      utils: { book_new: () => ({}), aoa_to_sheet: a => { x.aoas.push(a); return {}; }, book_append_sheet: () => {} },
      writeFile: () => {}
    };
    realClick(h.w, cb.querySelector('.sup-excel')); await ticks(2);
    const sh = x.aoas[0] || [];
    const hi = (sh[0] || []).indexOf('Силистра');
    ok('колоната „Силистра" е в заглавката', hi >= 0, JSON.stringify(sh[0]));
    ok('клетката е „без нужда"', hi >= 0 && sh[1] && sh[1][hi] === 'без нужда', JSON.stringify(sh[1]));
    ok('Общо = 5 (числото не е пипнато)', sh[1] && sh[1][sh[1].length - 1] === 5, JSON.stringify(sh[1]));
    h.close();

    /* Провал при четене → матрицата стои, червен ред. */
    const h2 = env(ADMIN, { entries: [], noNeed: [] }, { GET: { status: 500, body: { message: 'nn-down' }, url: /supply_no_need/ } });
    h2.w.loadSupply(); await ticks(10);
    ok('провал на supply_no_need → матрицата стои', !!h2.doc.getElementById('sup-ov-tpl-cb'));
    const err = mod(h2).querySelector('.sup-nn-err');
    ok('и червен ред с грешката', !!err && err.textContent.indexOf('nn-down') >= 0, err && err.textContent);
    h2.close();
  }

  section('7. Бюлетин: надписът брои „без нужда" като попълнена бланка');
  {
    async function pending(noNeed) {
      const h = boot({
        modules: ['bulletin.js'],
        user: STORE,
        data: {
          supply_templates: [{ id: 'tpl-fl', active: true, target_stores: null }, { id: 'tpl-cb', active: true, target_stores: null }],
          supply_entries: [{ template_id: 'tpl-fl', qty1: 3, qty2: null }],
          supply_no_need: noNeed
        }
      });
      h.w.recurringTasks = [{ id: 'r-sup', linked_module: 'supply', task_type: 'info', active: true }];
      h.w.renderBulletin = function () {};
      guard('bulLoadSupplyPending() не хвърля', () => h.w.bulLoadSupplyPending());
      for (let i = 0; i < 20 && !h.w.bulAutoPending['supply']; i++) await ticks();
      const r = JSON.stringify(h.w.bulAutoPending['supply']);
      const q = h.calls.get.find(u => /supply_no_need\?/.test(u)) || '';
      h.close();
      return { r: r, q: q };
    }
    const a = await pending([{ template_id: 'tpl-cb' }]);
    ok('Подови с бройки + Кабели „без нужда" → 2 от 2', a.r === '{"done":2,"total":2}', a.r);
    ok('заявката е по обекта', a.q.indexOf('store_name=eq.' + encodeURIComponent('Силистра')) >= 0, a.q);
    const b = await pending([]);
    ok('КОНТРОЛА: без отметка → 1 от 2', b.r === '{"done":1,"total":2}', b.r);
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
