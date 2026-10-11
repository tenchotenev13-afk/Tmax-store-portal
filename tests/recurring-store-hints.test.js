/* Жокер по обект под постоянна задача (recurring_tasks.store_hints, 11.10.2026).

   „ЗАРЕЖДАНЕ КОЛОРАНТИ" е една задача за всички, но всеки обект поръчва
   различни артикули. store_hints = { "<store_name>": "<текст>" }; обектът
   вижда САМО своя текст под задачата (блок в Бюлетина и ред в „План за
   деня"), глобалните виждат всички обекти сгънати + редактор от реда.

   Какво заковава тестът:
     1. обект С жокер: блокът „💡 Жокер за Петрич" е там, с неговия текст;
        текстът на Шумен НЕ е в DOM-а на обекта; бутон за редакция няма;
     2. обект БЕЗ жокер (Враца): няма блок, няма грешка — редът се рисува;
     3. „План за деня" на обекта носи същия блок при постоянната задача,
        а при обикновена задача — не;
     4. админ: „Жокери по обект: 2", двата обекта; ИСТИНСКИ клик на
        „Редактирай жокерите" → модал; смяна на обекта в <select>, писане,
        връщане към предишния обект (черновата е запазена), изтриване на
        текста на Шумен, 💾 → ЕДИН PATCH върху recurring_tasks с
        {Петрич, Враца} и БЕЗ Шумен; редът се прерисува с новия брой;
     5. задача без жокери: админ вижда „+ Жокер по обект"; обект — нищо;
        store_hints като низ (ако PostgREST някога върне текст) се парсва.

   Мутации, с които тестът ТРЯБВА да падне:
     М1: махни `h += bulStoreHintsHtml(t, store)` в renderRecurringTasks
     М2: в bulStoreHintsHtml подай hints[keys[0]] вместо hints[store]
         (обектът вижда чужд текст)
     М3: в bulHintTextChanged махни записа в черновата (смяната на обекта
         губи текста)
     М4: празният текст да остава ключ — и в bulHintTextChanged (вместо
         delete), и в submitStoreHints (без филтъра): Шумен остава с ''.
         Само едното от двете НЕ събаря теста — те са двойна защита.
     М5: махни реда с жокера в bulPlanRowHtml

   Пускане: node tests/recurring-store-hints.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, guard, section, report, ticks } = H;

const ANCHOR = (function () { const d = new Date(); d.setHours(12, 0, 0, 0); return d; })();
function shifted(days) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); return d; }
function isoOf(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, fixedMs = ANCHOR.getTime();
  class Frozen extends Real { constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); } static now() { return fixedMs; } }
  w.Date = Frozen;
}
const IDX = (ANCHOR.getDay() + 6) % 7;
const MON0 = isoOf(shifted(-IDX));

const PETRICH = 'Петрич', VRATSA = 'Враца', SHUMEN = 'Шумен';
const STORES = [VRATSA, PETRICH, SHUMEN];
const PET_TXT = 'ВАМКО ООД:\n39801 — КОЛОРАНТ WB1 BLUE 1Л\n39802 — КОЛОРАНТ WB3 LIGHT BLUE 1Л';
const SHU_TXT = 'ДФХ БЪЛГАРИЯ ЕООД:\n63223 — КОЛОРАНТ KRAFT 01 ЯРКО ЖЪЛТ 1Л';
const HINTS = {}; HINTS[PETRICH] = PET_TXT; HINTS[SHUMEN] = SHU_TXT;

const userOf = s => ({ email: s + '@temax.bg', display_name: 'Управител ' + s, role: 'store', store_name: s });
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'warehouse', task_type: 'info',
    description: 'Всеки понеделник до 11:00ч.', target_stores: null, due_weekday: null, due_weekdays: [IDX],
    due_time: '11:00', due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 1, store_hints: null
  }, over || {});
}

function env(user, recs, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js'],
    user: user,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: url => { const m = /[?&]active=eq\.(true|false)/.exec(url); return recs.filter(r => !m || String(!!r.active) === m[1]); },
      recurring_task_periods: recs.map((r, i) => ({ id: 'p' + i, recurring_task_id: r.id, from_monday: isoOf(shifted(-60)), to_monday: null })),
      recurring_task_versions: [],
      recurring_task_skips: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: opts.tasks || [],
      task_completions: [],
      subtask_completions: [],
      task_subtasks: []
    }
  });
  freezeDate(h.w);
  const cal = {}; h.w.DKEYS.forEach(k => { cal[k] = []; });
  h.buls = [{ id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
              created_at: MON0, content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } }];
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'warehouse';
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); } return cond(); }
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const recRow = (doc, id) => doc.querySelector('[data-rec-row="' + id + '"]');
const hintsIn = root => root ? Array.from(root.querySelectorAll('details.bul-hint')) : [];
const editBtn = root => root ? Array.from(root.querySelectorAll('button')).find(b => /[Жж]окер/.test(b.textContent)) : null;

(async function () {

  /* ═══ 1. Обект С жокер ══════════════════════════════════════════════════ */
  section('1. Обект Петрич: вижда само своя жокер');
  {
    const h = env(userOf(PETRICH), [rec('r-kol', { title: 'ЗАРЕЖДАНЕ КОЛОРАНТИ', store_hints: HINTS })]);
    if (guard('loadBulletin()', () => h.w.loadBulletin())) {
      await settle(() => !!recRow(h.doc, 'r-kol'), 120);
      const row = recRow(h.doc, 'r-kol');
      if (ok('редът на постоянната задача е нарисуван', !!row)) {
        const hs = hintsIn(row);
        ok('точно ЕДИН блок жокер в реда', hs.length === 1, hs.length);
        if (hs.length) {
          ok('заглавието е „Жокер за Петрич"', txt(hs[0].querySelector('summary')) === '💡 Жокер за Петрич', txt(hs[0].querySelector('summary')));
          ok('текстът на Петрич е вътре', hs[0].textContent.indexOf('39801 — КОЛОРАНТ WB1 BLUE 1Л') >= 0);
          ok('сгънат по подразбиране', !hs[0].hasAttribute('open'));
        }
        ok('текстът на Шумен НЕ е в DOM-а на Петрич', h.doc.body.innerHTML.indexOf('63223') < 0);
        ok('няма бутон за редакция при обект', !editBtn(row));
        ok('описанието на задачата си остава', row.textContent.indexOf('Всеки понеделник до 11:00ч.') >= 0);
      }
    }
    h.close();
  }

  /* ═══ 2. Обект БЕЗ жокер ════════════════════════════════════════════════ */
  section('2. Обект Враца: без ключ → без блок, без грешка');
  {
    const h = env(userOf(VRATSA), [rec('r-kol', { title: 'ЗАРЕЖДАНЕ КОЛОРАНТИ', store_hints: HINTS })]);
    if (guard('loadBulletin()', () => h.w.loadBulletin())) {
      await settle(() => !!recRow(h.doc, 'r-kol'), 120);
      const row = recRow(h.doc, 'r-kol');
      if (ok('редът е нарисуван', !!row)) {
        ok('нула блокове жокер', hintsIn(row).length === 0, hintsIn(row).length);
        ok('чужди текстове няма', h.doc.body.innerHTML.indexOf('39801') < 0 && h.doc.body.innerHTML.indexOf('63223') < 0);
      }
    }
    h.close();
  }

  /* ═══ 3. План за деня ═══════════════════════════════════════════════════ */
  section('3. „План за деня" на Петрич: жокерът е и там, само при постоянната');
  {
    const h = env(userOf(PETRICH), [rec('r-kol', { title: 'ЗАРЕЖДАНЕ КОЛОРАНТИ', store_hints: HINTS })]);
    if (guard('loadBulletin()', () => h.w.loadBulletin())) {
      await settle(() => !!recRow(h.doc, 'r-kol'), 120);
      h.w.bulPlanOpen = true;
      guard('renderBulletin() с отворен план', () => h.w.renderBulletin());
      await ticks();
      const plan = h.doc.getElementById('sec-dayplan');
      const prow = plan ? plan.querySelector('[data-plan-row="r-kol"]') : null;
      if (ok('редът на задачата е в плана за днес', !!prow, plan ? txt(plan).slice(0, 200) : 'няма sec-dayplan')) {
        const hs = hintsIn(prow);
        ok('планът носи жокера на обекта', hs.length === 1 && hs[0].textContent.indexOf('39801') >= 0, hs.length);
      }
    }
    h.close();
  }

  /* ═══ 4. Админ: всички + редактор с истински клик ═══════════════════════ */
  section('4. Админ: всички обекти + редакция от реда');
  {
    const h = env(ADMIN, [rec('r-kol', { title: 'ЗАРЕЖДАНЕ КОЛОРАНТИ', store_hints: HINTS })]);
    if (guard('loadBulletin()', () => h.w.loadBulletin())) {
      await settle(() => !!recRow(h.doc, 'r-kol'), 120);
      const row = recRow(h.doc, 'r-kol');
      if (ok('редът е нарисуван', !!row)) {
        const outer = hintsIn(row)[0];
        ok('обвивка „Жокери по обект: 2"', !!outer && txt(outer.querySelector('summary')).indexOf('Жокери по обект: 2') >= 0, outer ? txt(outer.querySelector('summary')) : '—');
        const inner = outer ? hintsIn(outer) : [];
        ok('два вътрешни блока — Петрич и Шумен', inner.length === 2 && inner.map(d => txt(d.querySelector('summary'))).join('|') === '💡 Петрич|💡 Шумен',
          inner.map(d => txt(d.querySelector('summary'))).join('|'));
        const eb = editBtn(row);
        if (ok('бутон „Редактирай жокерите"', !!eb && eb.textContent.indexOf('Редактирай жокерите') >= 0, eb ? eb.textContent : '—')) {
          guard('истински клик → модал', () => realClick(h.w, eb));
          await settle(() => !!h.doc.getElementById('hint-ov') && h.doc.querySelectorAll('#hint-store option').length > 0, 60);
          const ov = h.doc.getElementById('hint-ov');
          if (ok('модалът е отворен', !!ov)) {
            const sel = h.doc.getElementById('hint-store'), ta = h.doc.getElementById('hint-text');
            const opts = Array.from(sel.options).map(o => o.textContent);
            ok('обектите са в <select>, с ✓ при тези с текст', opts.join('|') === 'Враца|Петрич ✓|Шумен ✓', opts.join('|'));
            ok('първият обект е избран и текстът му (празен) е зареден', sel.value === VRATSA && ta.value === '', sel.value + '/' + ta.value);

            /* Пишем за Враца */
            ta.value = '62960 — КОЛОРАНТ COLTEC BLACK XS 1Л';
            fire(h.w, ta, 'input');
            ok('✓ се появява веднага за Враца', sel.options[sel.selectedIndex].textContent === 'Враца ✓', sel.options[sel.selectedIndex].textContent);

            /* Към Петрич — текстът му е там */
            sel.value = PETRICH; fire(h.w, sel, 'change');
            ok('текстът на Петрич е зареден', ta.value === PET_TXT);

            /* Обратно към Враца — черновата е запазена (М3) */
            sel.value = VRATSA; fire(h.w, sel, 'change');
            ok('черновата за Враца НЕ е загубена при смяна на обекта', ta.value === '62960 — КОЛОРАНТ COLTEC BLACK XS 1Л', ta.value);

            /* Шумен — изтриваме текста */
            sel.value = SHUMEN; fire(h.w, sel, 'change');
            ok('текстът на Шумен е зареден', ta.value === SHU_TXT);
            ta.value = '   '; fire(h.w, ta, 'input');
            ok('✓ пада при празен текст', sel.options[sel.selectedIndex].textContent === SHUMEN, sel.options[sel.selectedIndex].textContent);

            const before = h.calls.patch.length;
            const save = btn(ov, 'Запази');
            guard('истински клик 💾', () => realClick(h.w, save));
            await settle(() => h.calls.patch.length > before, 60);
            const p = h.calls.patch.filter(x => x.table === 'recurring_tasks');
            if (ok('ЕДИН PATCH върху recurring_tasks', p.length === 1, JSON.stringify(h.calls.patch))) {
              ok('…по id на задачата', p[0].url.indexOf('id=eq.r-kol') >= 0, p[0].url);
              const sh = p[0].body && p[0].body.store_hints;
              ok('…само store_hints в тялото', p[0].body && Object.keys(p[0].body).join(',') === 'store_hints', JSON.stringify(p[0].body));
              ok('…Петрич и Враца, БЕЗ Шумен (М4)', sh && Object.keys(sh).sort().join(',') === [VRATSA, PETRICH].sort().join(','), JSON.stringify(sh));
              ok('…текстът на Петрич е непроменен', sh && sh[PETRICH] === PET_TXT);
              ok('…текстът на Враца е подрязан', sh && sh[VRATSA] === '62960 — КОЛОРАНТ COLTEC BLACK XS 1Л');
            }
            await settle(() => !h.doc.getElementById('hint-ov'), 60);
            ok('модалът е затворен', !h.doc.getElementById('hint-ov'));
            ok('toast за успех', h.calls.toast.some(m => /Жокерите са записани \(2 обекта\)/.test(m)), JSON.stringify(h.calls.toast));
            const row2 = recRow(h.doc, 'r-kol');
            const outer2 = row2 ? hintsIn(row2)[0] : null;
            ok('редът е прерисуван: „Жокери по обект: 2" с Враца и Петрич', !!outer2 && hintsIn(outer2).map(d => txt(d.querySelector('summary'))).join('|') === '💡 Враца|💡 Петрич',
              outer2 ? hintsIn(outer2).map(d => txt(d.querySelector('summary'))).join('|') : '—');
            ok('Шумен го няма вече в реда', !row2 || row2.innerHTML.indexOf('63223') < 0);
            ok('базовият ред е синхронизиран (bulSyncBaseRow)', (() => { const b = h.w.recurringAll.find(x => x.id === 'r-kol'); return b && b.store_hints && !b.store_hints[SHUMEN] && !!b.store_hints[VRATSA]; })());
          }
        }
      }
    }
    h.close();
  }

  /* ═══ 5. Без жокери; низ вместо обект ══════════════════════════════════ */
  section('5. Задача без жокери: админ „+ Жокер по обект", обект — нищо; низ се парсва');
  {
    const ha = env(ADMIN, [rec('r-0', { title: 'Без жокери' }), rec('r-s', { title: 'Низ', sort_order: 2, store_hints: JSON.stringify(HINTS) })]);
    if (guard('loadBulletin() админ', () => ha.w.loadBulletin())) {
      await settle(() => !!recRow(ha.doc, 'r-0') && !!recRow(ha.doc, 'r-s'), 120);
      const r0 = recRow(ha.doc, 'r-0');
      ok('без жокери: няма обвивка', r0 && hintsIn(r0).length === 0);
      const eb = editBtn(r0);
      ok('без жокери: бутон „+ Жокер по обект"', !!eb && eb.textContent.indexOf('+ Жокер по обект') >= 0, eb ? eb.textContent : '—');
      const rs = recRow(ha.doc, 'r-s');
      ok('store_hints като низ: парсва се — „Жокери по обект: 2"', rs && hintsIn(rs)[0] && txt(hintsIn(rs)[0].querySelector('summary')).indexOf('Жокери по обект: 2') >= 0);
    }
    ha.close();
    const hs = env(userOf(PETRICH), [rec('r-0', { title: 'Без жокери' })]);
    if (guard('loadBulletin() обект', () => hs.w.loadBulletin())) {
      await settle(() => !!recRow(hs.doc, 'r-0'), 120);
      const r0 = recRow(hs.doc, 'r-0');
      ok('обект, задача без жокери: нито блок, нито бутон', r0 && hintsIn(r0).length === 0 && !editBtn(r0));
    }
    hs.close();
  }

  report();
})();
