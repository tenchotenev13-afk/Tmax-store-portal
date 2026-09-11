/* Подзадачите в Бюлетина: „📅" на изпълнена, ⚠️ от първия ден, и двата
   контейнера.

   Същото правило като задачите (tests/bulletin-due-done.test.js), но за
   renderSubtasks() в bulletin.js:
     · subtask_completions няма status и completion_date — всеки ред е
       изпълнение, а денят на отмятането е completed_at по ЛОКАЛНО време,
       сравнен с task_subtasks.due_date (общото bulDoneLate());
     · изпълнена → сиво, без ⚠️; отметната след деня на срока →
       „✓ със закъснение", сиво;
     · неизпълнена със срок ВЧЕРА → ⚠️ още от първия ден. Дотогава
       new Date('YYYY-MM-DD') четеше датата като UTC и в София вчерашният
       срок излизаше diff=0 — ⚠️ идваше ден късно; днешният — без ⚠️;
     · подзадачите стоят в ДВА контейнера — блокът по отдел и панелът
       „Задачи за седмицата" на обекта. До 11.09.2026 id-то беше едно и се
       пълнеше само първият; сега и двата, а отмятане в единия обновява и
       другия;
     · реално отмятане (bulToggleSubtask) пише completed_at и в паметта.

   ⚠️ Дати: котвата е сряда от текущата реална седмица, замразена на w.Date.

   Пускане: node tests/subtask-due-done.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, fire, ok, guard, section, report, ticks } = H;

const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
function at(days, h, m) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); d.setHours(h, m || 0, 0, 0); return d; }
function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function isoWeekYear(d) {
  const t = new Date(d.getTime());
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function freezeDate(w) {
  const Real = w.Date, fixedMs = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}
const fmt2 = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);

const MON = isoOf(at(-2, 12)), TUE = isoOf(at(-1, 12)), WED = isoOf(ANCHOR);
const TR = 'Троян';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: TR };

const S = {
  early:     { id: 's-early', title: 'Под ранна',          due: MON },
  late:      { id: 's-late',  title: 'Под късна',          due: MON },
  midnight:  { id: 's-mid',   title: 'Под след полунощ',   due: MON },
  over:      { id: 's-over',  title: 'Под неизпълнена',    due: TUE },  /* срок ВЧЕРА */
  todayOpen: { id: 's-topen', title: 'Под днес чакаща',    due: WED },
  todayDone: { id: 's-tdone', title: 'Под днес свършена',  due: WED },
  toTick:    { id: 's-tick',  title: 'Под за отмятане',    due: MON }
};
const SUBS = Object.keys(S).map((k, i) => ({ id: S[k].id, task_id: 't-1', recurring_task_id: null,
  title: S[k].title, sort_order: i, due_date: S[k].due, description: null, attachments: null }));
const sc = (k, when) => ({ id: 'sc-' + k, subtask_id: S[k].id, store_name: TR, completed_by: TR, completed_at: when.toISOString() });
const SUB_COMPS = [
  sc('early', at(-2, 10)),          /* понеделник 10:00 — в срок */
  sc('late', at(-1, 9)),            /* вторник 09:00 */
  sc('midnight', at(-1, 0, 30)),    /* вторник 00:30 местно = понеделник в UTC */
  sc('todayDone', at(0, 9)),
  /* Чужд обект — не бива да прави подзадачата изпълнена за Троян. */
  { id: 'sc-other', subtask_id: S.over.id, store_name: 'Ловеч', completed_by: 'Ловеч', completed_at: at(-1, 9).toISOString() }
];

function env() {
  const h = boot({
    modules: ['bulletin.js'],
    user: MANAGER,
    data: {
      users: [{ store_name: TR }],
      recurring_tasks: [],
      recurring_task_skips: [],
      bulletins: () => [h.bul],
      bulletin_tasks: [{ id: 't-1', bulletin_id: 'b-1', title: 'Задача с подзадачи', department: 'trade',
        due_date: WED, due_dates: null, task_type: 'info', target_stores: null, sort_order: 1,
        report_groups: null, linked_module: null, description: null, created_by: 'Админ' }],
      task_completions: [],
      subtask_completions: SUB_COMPS.map(c => Object.assign({}, c)),
      task_subtasks: url => (/task_id=eq\.t-1/.test(url) ? SUBS : [])
    }
  });
  freezeDate(h.w);
  const cal = {};
  h.w.DKEYS.forEach(k => { cal[k] = []; });
  h.bul = { id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
            content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = [TR];
  return h;
}
async function settle(cond, max) {
  for (let i = 0; i < (max || 60); i++) { if (cond()) return true; await new Promise(r => setTimeout(r, 10)); await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const colorOf = el => ((el && el.getAttribute('style')) || '').replace(/.*color:(#[0-9a-f]{6}).*/i, '$1');
const box = (doc, where) => doc.getElementById('sub-t-1-' + where);
const subBox = (doc, where, k) => { const b = box(doc, where); return b ? b.querySelector('input[data-stid="' + S[k].id + '"]') : null; };

/* Спанът „📅 …" в реда на подзадачата в даден контейнер. */
function dueSpan(doc, k, where) {
  const cb = subBox(doc, where || 'dept', k);
  const row = cb && cb.parentElement;
  return row ? Array.prototype.find.call(row.querySelectorAll('span'), s => s.textContent.indexOf('📅') === 0) || null : null;
}

(async function () {
  const h = env();
  const doc = h.doc, w = h.w;
  section('0. Зареждане — и двата контейнера');
  if (!guard('loadBulletin() не хвърля', () => w.loadBulletin())) { report(); return; }
  await settle(() => !!subBox(doc, 'dept', 'early') && !!subBox(doc, 'panel', 'early'));
  ok('контейнер в блока по отдел (#sub-t-1-dept)', !!box(doc, 'dept') && !!box(doc, 'dept').closest('#dept-panel-trade'));
  ok('контейнер в панела на обекта (#sub-t-1-panel)', !!box(doc, 'panel') && !box(doc, 'panel').closest('[id^="dept-panel-"]'));
  ok('старото общо id sub-t-1 го няма', !doc.getElementById('sub-t-1'));
  ok('подзадачите се виждат в блока по отдел', !!subBox(doc, 'dept', 'early') &&
    box(doc, 'dept').querySelectorAll('input[data-stid]').length === SUBS.length);
  ok('подзадачите се виждат и в ПАНЕЛА', !!subBox(doc, 'panel', 'early') &&
    box(doc, 'panel').querySelectorAll('input[data-stid]').length === SUBS.length,
    String(box(doc, 'panel') && box(doc, 'panel').querySelectorAll('input[data-stid]').length));

  ['dept', 'panel'].forEach(where => {
    const L = '[' + (where === 'dept' ? 'отдел' : 'панел') + '] ';
    section('1. ' + L + 'Изпълнена в срок → само дата, сиво, без ⚠️');
    {
      const el = dueSpan(doc, 'early', where);
      ok(L + 'точно „📅 ' + fmt2(MON) + '", сиво', !!el && txt(el) === '📅 ' + fmt2(MON) && colorOf(el) === '#94a3b8',
        txt(el) + ' ' + colorOf(el));
      const t = dueSpan(doc, 'todayDone', where);
      ok(L + 'изпълнена днес → „📅 ' + fmt2(WED) + '", сиво', !!t && txt(t) === '📅 ' + fmt2(WED) && colorOf(t) === '#94a3b8',
        txt(t) + ' ' + colorOf(t));
    }
    section('2. ' + L + 'Изпълнена след срока → „✓ със закъснение", сиво');
    {
      const el = dueSpan(doc, 'late', where);
      ok(L + '„✓ със закъснение", без ⚠️, сиво', !!el && txt(el) === '📅 ' + fmt2(MON) + ' ✓ със закъснение' &&
        colorOf(el) === '#94a3b8', txt(el) + ' ' + colorOf(el));
      if (new Date().getTimezoneOffset() < 0) {
        const m = dueSpan(doc, 'midnight', where);
        ok(L + '00:30 на следващия ден → по ЛОКАЛНА дата „със закъснение"', !!m && txt(m).indexOf('✓ със закъснение') >= 0, txt(m));
      } else {
        console.log('  (пропуснато: часовата зона на машината не е източно от UTC)');
      }
    }
    section('3. ' + L + 'Неизпълнена със срок ВЧЕРА → ⚠️ от първия ден; днешна → без ⚠️');
    {
      const el = dueSpan(doc, 'over', where);
      ok(L + '„📅 ' + fmt2(TUE) + ' ⚠️", червено (отметката на Ловеч не се брои)',
        !!el && txt(el) === '📅 ' + fmt2(TUE) + ' ⚠️' && colorOf(el) === '#dc2626', txt(el) + ' ' + colorOf(el));
      const t = dueSpan(doc, 'todayOpen', where);
      ok(L + 'днешна неизпълнена → „📅 ' + fmt2(WED) + '", оранжево, без ⚠️',
        !!t && txt(t) === '📅 ' + fmt2(WED) && colorOf(t) === '#d97706', txt(t) + ' ' + colorOf(t));
    }
  });

  section('4. Отмятане от ПАНЕЛА → completed_at; обновяват се и двата контейнера');
  {
    const cb = subBox(doc, 'panel', 'toTick');
    if (ok('чекбоксът в панела съществува', !!cb)) {
      ok('преди: в блока по отдел не е отметната', !!subBox(doc, 'dept', 'toTick') && !subBox(doc, 'dept', 'toTick').checked);
      cb.checked = true;
      guard('onchange не хвърля', () => fire(w, cb, 'change'));
      await settle(() => h.calls.post.some(p => p.table === 'subtask_completions'));
      const p = h.calls.post.filter(x => x.table === 'subtask_completions');
      if (ok('един POST към subtask_completions', p.length === 1, String(p.length))) {
        ok('POST-ът носи completed_at', !!p[0].body.completed_at, JSON.stringify(p[0].body));
      }
      const findMem = () => (w.subtaskComps || []).find(c => c.subtask_id === S.toTick.id && c.store_name === TR);
      await settle(() => !!findMem());
      const mem = findMem();
      ok('редът в subtaskComps носи същия completed_at', !!mem && p.length === 1 && mem.completed_at === p[0].body.completed_at,
        JSON.stringify(mem));
      await settle(() => { const d = subBox(doc, 'dept', 'toTick'); return !!d && d.checked; });
      ['dept', 'panel'].forEach(where => {
        const c = subBox(doc, where, 'toTick');
        const el = dueSpan(doc, 'toTick', where);
        ok('[' + where + '] отметната', !!c && c.checked);
        ok('[' + where + '] „✓ със закъснение", сиво', !!el && txt(el) === '📅 ' + fmt2(MON) + ' ✓ със закъснение' &&
          colorOf(el) === '#94a3b8', txt(el) + ' ' + colorOf(el));
      });
    }
  }

  section('5. Отмятане на отметката от БЛОКА ПО ОТДЕЛ → и панелът се обновява');
  {
    const cb = subBox(doc, 'dept', 'toTick');
    if (ok('чекбоксът в блока съществува и е отметнат', !!cb && cb.checked)) {
      cb.checked = false;
      guard('onchange не хвърля', () => fire(w, cb, 'change'));
      await settle(() => h.calls.del.some(u => u.indexOf('/subtask_completions') >= 0));
      ok('DELETE към subtask_completions', h.calls.del.some(u => u.indexOf('/subtask_completions') >= 0 && u.indexOf('subtask_id=eq.' + S.toTick.id) >= 0),
        h.calls.del.join(' | '));
      await settle(() => { const pp = subBox(doc, 'panel', 'toTick'); return !!pp && !pp.checked; });
      ok('[panel] вече НЕ е отметната', !!subBox(doc, 'panel', 'toTick') && !subBox(doc, 'panel', 'toTick').checked);
      const el = dueSpan(doc, 'toTick', 'panel');
      ok('[panel] пак ⚠️ (срок понеделник)', !!el && txt(el) === '📅 ' + fmt2(MON) + ' ⚠️', txt(el));
    }
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
