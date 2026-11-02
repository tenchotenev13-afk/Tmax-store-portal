/* „СПРАВКА ПРАЗНИ ПАЛЕТИ": отметката идва от справката в Палети (02.11.2026).

   ПОВОД. Монтана, 30.10.2026: справката записана в 15:19, задачата отметната
   ръчно в 17:24 — след срока (петък 17:00). Решение на Тенчо: задачата се
   отмята сама при запис на справката; обектът няма отметка за слагане.

   ТВЪРДЕНИЯТА (SQL логиката е тествана отделно в базата, в транзакция с
   rollback — tests/sql/pallets-auto-complete.test.sql; тук е клиентът):
   · от 02.11.2026 задачата е ЗАКЛЮЧЕНА за обекта: чекбоксът е изключен,
     баджът „💬 Коментар" не отваря модала, няма „⏱ Отложи" и „🚫 Не се
     отнася", форсиран клик не пише нищо; до 01.11 е ръчна (AUTO_COMPLETE_FROM);
   · без отметка обектът вижда „⏳ отмята се от Палети", с отметка от
     'auto:pallets' — „✓ от Палети": в главния списък, в днешната клетка на
     календара и в „План за деня"; бутонът към модула остава;
   · офисът — както досега: без надпис;
   · SQL-ът и shared.js носят една и съща дата; маркерът е 'auto:pallets';
     функцията само добавя (не разотмята).

   Пускане: node tests/pallets-auto-complete.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || '.';

const MON_ISO = '2026-11-02';
const FRI_ISO = '2026-11-06';
const ANCHOR = new Date(2026, 10, 6, 12, 0, 0, 0);          /* петък, денят на срока */
const p2 = n => String(n).padStart(2, '0');
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w, d) {
  const Real = w.Date, ms = d.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}

const STORE = 'Монтана';
const STORE_USER = { email: 'm@temax.bg', display_name: 'Склад Монтана', role: 'store', store_name: STORE };
const ADMIN_USER = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: null };

/* Задачата, както е в базата (ceb052e6-…): петък 17:00, тип „коментар". */
function palTask(over) {
  return Object.assign({
    id: 'r-pal', title: 'СПРАВКА ПРАЗНИ ПАЛЕТИ', department: 'admin',
    task_type: 'comment', active: true, sort_order: 1,
    due_weekday: 4, due_weekdays: [4], due_time: '17:00', due_window: false,
    target_stores: null, report_groups: null, linked_module: 'pallets'
  }, over || {});
}
function manualTask(over) {
  return Object.assign({
    id: 'r-man', title: 'Ръчна постоянна', department: 'admin',
    task_type: 'info', active: true, sort_order: 2,
    due_weekday: 4, due_weekdays: [4], due_time: null, due_window: false,
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
const autoComp = over => Object.assign({
  recurring_task_id: 'r-pal', store_name: STORE, completed_by: 'auto:pallets', status: 'done',
  completion_date: FRI_ISO, completed_at: new Date(2026, 10, 4, 10).toISOString(), comment: null
}, over || {});

function env(opts) {
  opts = opts || {};
  const now = opts.now || ANCHOR;
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || STORE_USER,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      recurring_tasks: opts.tasks || [palTask(), manualTask()],
      recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
      bulletins: () => [{
        id: 'b-1', week_number: h.w.weekNum(now), year: isoWeekYear(now),
        status: 'published', created_at: MON_ISO,
        content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(),
                   columns: { trade: [], warehouse: [], admin: [] } }
      }],
      bulletin_tasks: [], task_completions: opts.comps || [],
      transport_pallets: [], goods_transit: [], bulletin_promotions: [], task_subtasks: [],
      subtask_completions: [], notification_schedules: [], report_snapshots: []
    }
  });
  freezeDate(h.w, now);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [STORE];
  h.w.allStoresCache = [STORE];
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function view(opts) {
  const h = env(opts);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle(() => !!h.doc.getElementById('sec-calendar'));
  await ticks(); await ticks(); await ticks();
  return h;
}
const panel = h => h.doc.getElementById('dept-panel-admin');
const txt = el => el ? (el.textContent || '').trim() : null;
const noteIn = (root) => root ? txt(root.querySelector('.bul-auto-pallets')) : null;
const cbOf = (h, id) => panel(h) && panel(h).querySelector('input[data-rtid="' + id + '"]');
const btns = (h, pred) => Array.prototype.slice.call(panel(h).querySelectorAll('button')).filter(pred);

(async function () {

  section('1. Гейтът по дата, регистърът, етикетите');
  {
    const hb = env({ now: new Date(2026, 9, 30, 12) });
    ok('до 01.11 задачата НЕ е заключена', hb.w.bulAutoLocked('pallets') === false);
    ok('и регистърът не я дава за автоматична', hb.w.bulAutoModuleOf('pallets') === null);
    hb.close();
    const ha = env();
    ok('от 02.11 е заключена', ha.w.bulAutoLocked('pallets') === true);
    const am = ha.w.bulAutoModuleOf('pallets');
    if (ok('регистърът я дава', !!am)) {
      ok('причина auto-pallets', am.reason === 'auto-pallets', am.reason);
      ok('без брояч (unit/progress) — надписът е общият', !am.unit && !am.progress);
    }
    ok('етикетът на заключената контрола', ha.w.bulLockLabel('auto-pallets') === 'Отмята се автоматично от Палети', ha.w.bulLockLabel('auto-pallets'));
    ok('completed_by „auto:pallets" има име в отчета',
      ha.w.bulCompletedByLabel('auto:pallets') === 'автоматично от Палети', ha.w.bulCompletedByLabel('auto:pallets'));
    ok('shared.js: датата е 2026-11-02', ha.w.AUTO_COMPLETE_FROM['pallets'] === '2026-11-02', String(ha.w.AUTO_COMPLETE_FROM['pallets']));
    ok('останалите дати са непроменени',
      ha.w.AUTO_COMPLETE_FROM['supply'] === '2026-10-12' && ha.w.AUTO_COMPLETE_FROM['stock-diff'] === '2026-10-12');
    ha.close();
  }

  section('2. Обектът, петък, без отметка: заключено и „⏳ отмята се от Палети"');
  {
    const h = await view();
    if (!h) return report();
    const cb = cbOf(h, 'r-pal');
    if (ok('чекбоксът е в DOM-а', !!cb)) ok('но е изключен', cb.disabled === true);
    ok('ВСИЧКИ <input> за задачата са изключени',
      Array.prototype.slice.call(h.doc.querySelectorAll('input[data-rtid="r-pal"]')).every(i => i.disabled));
    ok('главният списък: „⏳ отмята се от Палети"', noteIn(panel(h)) === '⏳ отмята се от Палети', String(noteIn(panel(h))));
    ok('календарът (днешната клетка): същият надпис',
      noteIn(h.doc.getElementById('sec-calendar')) === '⏳ отмята се от Палети', String(noteIn(h.doc.getElementById('sec-calendar'))));
    ok('„План за деня": същият надпис',
      noteIn(h.doc.getElementById('sec-dayplan')) === '⏳ отмята се от Палети', String(noteIn(h.doc.getElementById('sec-dayplan'))));
    ok('баджът „💬 Коментар" не отваря модала (не е път около чекбокса)',
      h.doc.querySelectorAll('span[onclick*="taskTypeBadgeClick"][data-task-id="r-pal"]').length === 0);
    ok('„⏱ Отложи" го няма за нея',
      btns(h, b => (b.textContent || '').indexOf('⏱ Отложи') >= 0 && b.getAttribute('data-task-id') === 'r-pal').length === 0);
    ok('„🚫 Не се отнася" го няма за нея', h.w.bulNaBtnHtml('recurring', palTask(), FRI_ISO, null) === '');
    const link = Array.prototype.slice.call(h.doc.querySelectorAll('button[data-mod="pallets"]'));
    ok('бутонът към Палети остава', link.length >= 1, String(link.length));
    /* Истински клик по бутона към модула → showModule('pallets'). */
    if (link.length) {
      let opened = null;
      const orig = h.w.showModule;
      h.w.showModule = m => { opened = m; };
      guard('клик по бутона не хвърля', () => realClick(h.w, link[0], 'Палети →'));
      h.w.showModule = orig;
      ok('клик по бутона отваря Палети', opened === 'pallets', String(opened));
    }
    h.calls.post.length = 0; h.calls.patch.length = 0;
    guard('форсиран onchange на заключения чекбокс не хвърля', () => { if (cb) { cb.checked = true; h.w.bulRecurringCheckboxChanged(cb); } });
    await ticks(); await ticks();
    const wrote = h.calls.post.concat(h.calls.patch).filter(r => String(r.url || r).indexOf('task_completions') >= 0);
    ok('ръчният клик НЕ пише в task_completions', wrote.length === 0, JSON.stringify(wrote).slice(0, 160));
    ok('и не отваря модал за коментар', !h.doc.querySelector('#tc-comment'));
    const cm = cbOf(h, 'r-man');
    ok('КОНТРОЛА: задача без linked_module има отключен чекбокс', !!cm && !cm.disabled);
    ok('и „⏱ Отложи"',
      btns(h, b => b.getAttribute('data-task-id') === 'r-man' && (b.textContent || '').indexOf('⏱ Отложи') >= 0).length === 1);
    h.close();
  }

  section('3. Обектът, с отметка от auto:pallets → „✓ от Палети" навсякъде');
  {
    const h = await view({ comps: [autoComp()] });
    if (!h) return report();
    const cb = cbOf(h, 'r-pal');
    ok('чекбоксът е отметнат и заключен', !!cb && cb.checked && cb.disabled);
    ok('главният списък: „✓ от Палети"', noteIn(panel(h)) === '✓ от Палети', String(noteIn(panel(h))));
    ok('календарът: „✓ от Палети"', noteIn(h.doc.getElementById('sec-calendar')) === '✓ от Палети', String(noteIn(h.doc.getElementById('sec-calendar'))));
    ok('„План за деня": „✓ от Палети"', noteIn(h.doc.getElementById('sec-dayplan')) === '✓ от Палети', String(noteIn(h.doc.getElementById('sec-dayplan'))));
    h.close();
  }

  section('4. Сряда, отметка вече поставена за петък (справка в сряда) → „✓" в списъка');
  {
    const h = await view({ now: new Date(2026, 10, 4, 12), comps: [autoComp()] });
    if (!h) return report();
    ok('главният списък: „✓ от Палети"', noteIn(panel(h)) === '✓ от Палети', String(noteIn(panel(h))));
    const cb = cbOf(h, 'r-pal');
    ok('чекбоксът е отметнат и заключен', !!cb && cb.checked && cb.disabled);
    h.close();
  }

  section('5. Офисът — както досега: без надпис');
  {
    const h = await view({ user: ADMIN_USER, comps: [autoComp()] });
    if (!h) return report();
    ok('няма надпис „от Палети" никъде', h.doc.querySelectorAll('.bul-auto-pallets').length === 0);
    ok('bulAutoNoteHtml за офиса е празен', h.w.bulAutoNoteHtml(palTask(), true, 'recurring') === '');
    h.close();
  }

  section('6. До 01.11 — обектът отмята ръчно (регресия на гейта)');
  {
    const h = await view({ now: new Date(2026, 9, 30, 12) });
    if (!h) return report();
    const cb = cbOf(h, 'r-pal');
    ok('чекбоксът е отключен', !!cb && !cb.disabled);
    ok('и без надпис', h.doc.querySelectorAll('.bul-auto-pallets').length === 0);
    h.close();
  }

  section('7. SQL ↔ shared.js: една дата, един маркер, само добавяне');
  {
    const sql = fs.readFileSync(path.join(ROOT, 'pallets-auto-schema.sql'), 'utf8');
    const code = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
    ok("v_start е 2026-11-02", /v_start\s+date := date '2026-11-02'/.test(code));
    const sh = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
    ok('shared.js носи същата дата', /'pallets':\s*'2026-11-02'/.test(sh));
    ok("маркерът е 'auto:pallets', completion_date = денят на срока",
      /'auto:pallets', now\(\), 'done', v_due/.test(code));
    ok('не разотмята: delete от task_completions няма', !/delete\s+from\s+task_completions/i.test(code));
    ok('do nothing при конфликт', /do nothing;/.test(code) && !/do update/i.test(code));
    ok('срокът е по Europe/Sofia, резерва 17:00',
      /\(v_due \+ v_time\) at time zone 'Europe\/Sofia'/.test(code) && /time '17:00'/.test(code));
    ok('справката е до срока (created_at <= p_deadline)', /p\.created_at <= p_deadline/.test(code));
    ok('замразяване след деня на срока', /if v_today > v_due then\s+return 0;/.test(code));
    ok('„Само за информация" не се отмята', /= 'notice' then\s+return 0;/.test(code));
    ok('без report_excluded_stores', /report_excluded_stores\(\)/.test(code) && /not \(s = any\(v_excl\)\)/.test(code));
    ok('тригер AFTER INSERT на transport_pallets', /after insert on public\.transport_pallets/.test(code));
    ok('грешката в тригера е предупреждение', /exception when others then\s+raise warning 'pallets_sync_completions/.test(code));
    ok('часов крон', /cron\.schedule\('pallets-auto-complete', '0 \* \* \* \*'/.test(code));
    ok('права: EXECUTE се маха и от public', (code.match(/from public, anon, authenticated/g) || []).length === 4);
    ok('няма нови таблици/колони → няма ред за Живко', !/create table|add column/i.test(code));
    ok('rollback е описан (крон, тригер, 4 функции)',
      /cron\.unschedule\('pallets-auto-complete'\)/.test(sql) && /drop trigger if exists pallets_sync_ins/.test(sql) &&
      (sql.match(/-- drop function if exists/g) || []).length === 4);
  }

  report();
})();
