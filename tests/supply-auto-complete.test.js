/* „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М.": отметката идва от попълнените бланки (05.10.2026).

   ПОВОД. Задачата (linked_module='supply') се отмяташе ръчно, без проверка за
   данни. 05.10.2026 Габрово беше отметнат 09:09 без нито един ред, а Кърджали
   попълни и отметна в 11:22 и в доклада в 11:00 излезе „неподал".

   ТВЪРДЕНИЯТА (SQL логиката е тествана отделно в базата, в транзакция —
   вж. отчета; тук е клиентът и връзката му с базата):
   · от 12.10.2026 задачата е ЗАКЛЮЧЕНА: чекбоксът е изключен, няма „⏱ Отложи",
     няма „🚫 Не се отнася", ръчен клик не пише нищо;
   · до 11.10 е РЪЧНА (гейтът е по дата — AUTO_COMPLETE_FROM = v_start);
   · вместо квадратче обектът вижда „попълнено X от Y бланки" и връзка към
     модула; Y са САМО активните бланки, които важат за обекта;
   · 0 е попълнена стойност, null не е (същото правило като базата);
   · нова активна бланка променя знаменателя;
   · задача БЕЗ linked_module остава ръчна (регресия);
   · SQL-ът, shared.js и етикетът носят една и съща дата и един и същ маркер
     'auto:supply'; кронът-предпазна мрежа е описан в миграцията.

   Пускане: node tests/supply-auto-complete.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || '.';

const MON_ISO = '2026-10-12';
const ANCHOR = new Date(2026, 9, 12, 12, 0, 0, 0);          /* понеделник */
const BEFORE = '2026-10-09';
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

const STORE = 'Троян';
const USER = { email: 't@temax.bg', display_name: 'Иван', role: 'store', store_name: STORE };
const TPL_A = 't-floor', TPL_B = 't-cable', TPL_C = 't-new';

function supplyTask(over) {
  return Object.assign({
    id: 'r-sup', title: 'ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М.', department: 'admin',
    task_type: 'info', active: true, sort_order: 1,
    due_weekday: 0, due_weekdays: [0], due_time: '11:00', due_window: false,
    target_stores: null, report_groups: ['controlling'], linked_module: 'supply'
  }, over || {});
}
function manualTask(over) {
  return Object.assign({
    id: 'r-man', title: 'Ръчна постоянна', department: 'admin',
    task_type: 'info', active: true, sort_order: 2,
    due_weekday: 0, due_weekdays: [0], due_time: null, due_window: false,
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
const tpl = (id, over) => Object.assign({ id: id, active: true, target_stores: null }, over || {});
const ent = (tid, over) => Object.assign({ template_id: tid, store_name: STORE, week_start: MON_ISO, qty1: 5, qty2: null }, over || {});

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js'],
    user: USER,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      recurring_tasks: opts.tasks || [supplyTask(), manualTask()],
      recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
      bulletins: () => [{
        id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR),
        status: 'published', created_at: MON_ISO,
        content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(),
                   columns: { trade: [], warehouse: [], admin: [] } }
      }],
      bulletin_tasks: [], task_completions: opts.comps || [],
      supply_templates: opts.templates || [tpl(TPL_A), tpl(TPL_B)],
      supply_entries: opts.entries || [],
      goods_transit: [], bulletin_promotions: [], task_subtasks: [],
      subtask_completions: [], notification_schedules: [], report_snapshots: []
    }
  });
  freezeDate(h.w, opts.now || ANCHOR);
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
  await settle(() => h.w.bulAutoPending['supply'] !== null && h.w.bulAutoPending['supply'] !== undefined, 80);
  await ticks(); await ticks();
  return h;
}
const panel = h => h.doc.getElementById('dept-panel-admin');
const noteOf = h => { const el = (panel(h) || h.doc).querySelector('.bul-auto-supply'); return el ? (el.textContent || '').trim() : null; };
const cbOf = (h, id) => panel(h).querySelector('input[data-rtid="' + id + '"]');
const btns = (h, pred) => Array.prototype.slice.call(panel(h).querySelectorAll('button')).filter(pred);

(async function () {

  section('1. Гейтът по дата и регистърът');
  {
    const hb = env({ now: new Date(2026, 9, 9, 12) });
    ok('до 11.10 задачата НЕ е заключена', hb.w.bulAutoLocked('supply') === false);
    ok('и регистърът не я дава за автоматична', hb.w.bulAutoModuleOf('supply') === null);
    hb.close();
    const ha = env();
    ok('от 12.10 е заключена', ha.w.bulAutoLocked('supply') === true);
    const am = ha.w.bulAutoModuleOf('supply');
    if (ok('регистърът я дава', !!am)) {
      ok('причина auto-supply', am.reason === 'auto-supply', am.reason);
      ok('етикет „Отмята се автоматично от Зареждане"', am.label === 'Отмята се автоматично от Зареждане', am.label);
    }
    ok('етикетът на заключената контрола идва от регистъра',
      ha.w.bulLockLabel('auto-supply') === 'Отмята се автоматично от Зареждане', ha.w.bulLockLabel('auto-supply'));
    ok('completed_by „auto:supply" има име в отчета',
      ha.w.bulCompletedByLabel('auto:supply') === 'автоматично от Зареждане', ha.w.bulCompletedByLabel('auto:supply'));
    ok('shared.js: датата е 2026-10-12', ha.w.AUTO_COMPLETE_FROM['supply'] === '2026-10-12', String(ha.w.AUTO_COMPLETE_FROM['supply']));
    ok('останалите модули са непроменени (stock-diff)', ha.w.AUTO_COMPLETE_FROM['stock-diff'] === '2026-10-12');
    ha.close();
  }

  section('2. Екранът: 1 от 2 бланки → заключен, надпис, връзка към модула');
  {
    const h = await view({ entries: [ent(TPL_A)] });
    if (!h) return report();
    const cb = cbOf(h, 'r-sup');
    if (ok('чекбоксът е в DOM-а', !!cb)) ok('но е изключен', cb.disabled === true);
    ok('ръчна отметка няма: ВСИЧКИ <input> за задачата са изключени',
      Array.prototype.slice.call(panel(h).querySelectorAll('input[data-rtid="r-sup"]')).every(i => i.disabled));
    ok('надписът е „попълнено 1 от 2 бланки"', noteOf(h) === '⏳ попълнено 1 от 2 бланки', String(noteOf(h)));
    ok('броячът е {1,2}', JSON.stringify(h.w.bulAutoPending['supply']) === '{"done":1,"total":2}', JSON.stringify(h.w.bulAutoPending['supply']));
    ok('„⏱ Отложи" го няма за нея',
      btns(h, b => (b.textContent || '').indexOf('⏱ Отложи') >= 0 && b.getAttribute('data-task-id') === 'r-sup').length === 0);
    ok('„🚫 Не се отнася" го няма за нея', h.w.bulNaBtnHtml('recurring', supplyTask(), MON_ISO, null) === '');
    /* Връзката е бутон (не <a>) и стои в календара/плана, не в панела на отдела. */
    const link = Array.prototype.slice.call(h.doc.querySelectorAll('button[data-mod="supply"]'));
    ok('има връзка „Зареждане →" към модула (бутон)', link.length >= 1 && link.every(b => (b.textContent || '').indexOf('→') >= 0), String(link.length));
    /* Истински клик по чекбокса: нито POST, нито PATCH към task_completions. */
    h.calls.post.length = 0; h.calls.patch.length = 0;
    /* Disabled input не получава клик в браузъра; ако все пак го форсират
       (devtools), обработчикът сам отказва. */
    guard('форсиран onchange на заключения чекбокс не хвърля', () => { if (cb) { cb.checked = true; h.w.bulRecurringCheckboxChanged(cb); } });
    await ticks(); await ticks();
    const wrote = h.calls.post.concat(h.calls.patch).filter(r => String(r.url || r).indexOf('task_completions') >= 0);
    ok('ръчният клик НЕ пише в task_completions', wrote.length === 0, JSON.stringify(wrote).slice(0, 160));
    /* КОНТРОЛА: ръчната постоянна е отключена и има „Отложи". */
    const cm = cbOf(h, 'r-man');
    ok('КОНТРОЛА: задача без linked_module има отключен чекбокс', !!cm && !cm.disabled);
    ok('и „⏱ Отложи", и без надпис',
      btns(h, b => b.getAttribute('data-task-id') === 'r-man' && (b.textContent || '').indexOf('⏱ Отложи') >= 0).length === 1 &&
      !(cm && cm.parentNode.querySelector('.bul-auto-note')));
    h.close();
  }

  section('3. Попълнени и двете → „✓ от Зареждане" (редът идва от базата)');
  {
    const comp = { recurring_task_id: 'r-sup', store_name: STORE, completed_by: 'auto:supply', status: 'done', completion_date: MON_ISO, completed_at: new Date(2026, 9, 12, 10).toISOString() };
    const h = await view({ entries: [ent(TPL_A), ent(TPL_B)], comps: [comp] });
    if (!h) return report();
    ok('броячът е 2 от 2', JSON.stringify(h.w.bulAutoPending['supply']) === '{"done":2,"total":2}', JSON.stringify(h.w.bulAutoPending['supply']));
    const cb = cbOf(h, 'r-sup');
    ok('чекбоксът е отметнат и заключен', !!cb && cb.checked && cb.disabled);
    ok('надписът казва „✓ от Зареждане"', noteOf(h) === '✓ от Зареждане', String(noteOf(h)));
    h.close();
  }

  section('4. 0 е попълнена стойност, null не е');
  {
    const h0 = await view({ entries: [ent(TPL_A, { qty1: 0 }), ent(TPL_B, { qty1: null, qty2: 0 })] });
    ok('и двата 0 се броят → 2 от 2', h0 && JSON.stringify(h0.w.bulAutoPending['supply']) === '{"done":2,"total":2}', h0 && JSON.stringify(h0.w.bulAutoPending['supply']));
    h0 && h0.close();
    const hn = await view({ entries: [ent(TPL_A, { qty1: null, qty2: null }), ent(TPL_B)] });
    ok('ред с две празни стойности НЕ се брои → 1 от 2', hn && JSON.stringify(hn.w.bulAutoPending['supply']) === '{"done":1,"total":2}', hn && JSON.stringify(hn.w.bulAutoPending['supply']));
    hn && hn.close();
  }

  section('5. Нищо попълнено → 0 от 2; ред от друг обект/седмица не се брои');
  {
    const h = await view({ entries: [ent(TPL_A, { store_name: 'Габрово' }), ent(TPL_B, { week_start: '2026-10-05' })] });
    /* Заявката е по обект и седмица; фикстурата връща всичко, затова
       филтърът по обект/седмица се проверява по URL-а. */
    const q = h && h.calls.get.filter(u => u.indexOf('/supply_entries') >= 0);
    ok('заявката е по обект и по седмицата от понеделник',
      q && q.length >= 1 && q[0].indexOf('store_name=eq.' + encodeURIComponent(STORE)) >= 0 && q[0].indexOf('week_start=eq.' + MON_ISO) >= 0, q && q[0]);
    h && h.close();
    const h2 = await view({ entries: [] });
    ok('без редове → 0 от 2', h2 && JSON.stringify(h2.w.bulAutoPending['supply']) === '{"done":0,"total":2}', h2 && JSON.stringify(h2.w.bulAutoPending['supply']));
    ok('надписът казва „попълнено 0 от 2 бланки"', h2 && noteOf(h2) === '⏳ попълнено 0 от 2 бланки', h2 && String(noteOf(h2)));
    h2 && h2.close();
  }

  section('6. Знаменателят: нова активна бланка, насочена и неактивна');
  {
    const h = await view({ templates: [tpl(TPL_A), tpl(TPL_B), tpl(TPL_C)], entries: [ent(TPL_A), ent(TPL_B)] });
    ok('нова активна бланка → 2 от 3', h && JSON.stringify(h.w.bulAutoPending['supply']) === '{"done":2,"total":3}', h && JSON.stringify(h.w.bulAutoPending['supply']));
    h && h.close();
    const hT = await view({ templates: [tpl(TPL_A), tpl(TPL_B), tpl(TPL_C, { target_stores: ['Габрово'] })], entries: [ent(TPL_A), ent(TPL_B)] });
    ok('бланка, насочена към друг обект, не се брои → 2 от 2', hT && JSON.stringify(hT.w.bulAutoPending['supply']) === '{"done":2,"total":2}', hT && JSON.stringify(hT.w.bulAutoPending['supply']));
    hT && hT.close();
    const hM = await view({ templates: [tpl(TPL_A), tpl(TPL_B), tpl(TPL_C, { target_stores: [STORE] })], entries: [ent(TPL_A), ent(TPL_B)] });
    ok('бланка, насочена към ТОЗИ обект, се брои → 2 от 3', hM && JSON.stringify(hM.w.bulAutoPending['supply']) === '{"done":2,"total":3}', hM && JSON.stringify(hM.w.bulAutoPending['supply']));
    hM && hM.close();
    const hI = await view({ templates: [tpl(TPL_A), tpl(TPL_B), tpl(TPL_C, { active: false })], entries: [ent(TPL_A), ent(TPL_B)] });
    ok('неактивна бланка не се брои (и заявката я филтрира)',
      hI && hI.calls.get.some(u => u.indexOf('/supply_templates') >= 0 && u.indexOf('active=is.true') >= 0));
    hI && hI.close();
  }

  section('7. Регресия: без задача със linked_module=supply — без заявки и без надпис');
  {
    const h = env({ tasks: [manualTask()] });
    guard('loadBulletin() не хвърля', () => h.w.loadBulletin());
    await settle(() => !!h.doc.getElementById('sec-calendar'));
    await ticks(); await ticks();
    ok('броячът остава незареден', h.w.bulAutoPending['supply'] === null || h.w.bulAutoPending['supply'] === undefined);
    ok('и към supply_* няма заявки', h.calls.get.filter(u => u.indexOf('/supply_') >= 0).length === 0);
    const cm = cbOf(h, 'r-man');
    ok('ръчната постоянна е отключена', !!cm && !cm.disabled);
    h.close();
  }

  section('8. „Само за информация" не се брои');
  {
    const h = env({ tasks: [supplyTask({ task_type: 'notice' })] });
    guard('loadBulletin() не хвърля', () => h.w.loadBulletin());
    await settle(() => !!h.doc.getElementById('sec-calendar'));
    await ticks(); await ticks();
    ok('без брояч и без заявка към supply_*',
      (h.w.bulAutoPending['supply'] == null) && h.calls.get.filter(u => u.indexOf('/supply_') >= 0).length === 0);
    h.close();
  }

  section('9. Една дата и един маркер: SQL ↔ shared.js ↔ етикет');
  {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261005120000_supply_auto_complete.sql'), 'utf8');
    const mirror = fs.readFileSync(path.join(ROOT, 'supply-auto-complete-schema.sql'), 'utf8');
    ok('v_start е 2026-10-12', sql.indexOf("v_start   date := date '2026-10-12'") >= 0);
    ok('огледалото в корена съдържа цялата миграция', mirror.indexOf(sql) >= 0);
    const sh = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
    ok('shared.js носи същата дата', /'supply':\s*'2026-10-12'/.test(sh));
    ok('маркерът auto:supply е и при вмъкване, и при махане (само свои редове)',
      /select v_task.task_id, s, 'auto:supply'/.test(sql) && /tc.completed_by = 'auto:supply'/.test(sql));
    ok('правилото е ≥1 непразна стойност (0 се брои)', /e\.qty1 is not null or e\.qty2 is not null/.test(sql));
    ok('бланките са само активните и важещите за обекта',
      /coalesce\(t\.active, true\)/.test(sql) && /p_store = any\(t\.target_stores\)/.test(sql));
    ok('само за деня, в който задачата се пада', /v_idx = any\(v_task\.due_idx\)/.test(sql));
    ok('тригер за INSERT, UPDATE и DELETE върху supply_entries',
      /after insert on public\.supply_entries/.test(sql) && /after update on public\.supply_entries/.test(sql) && /after delete on public\.supply_entries/.test(sql));
    ok('грешката се хваща (записът не пропада) и е предупреждение',
      /exception when others then\s+raise warning 'supply_sync_completions/.test(sql));
    ok('кронът-предпазна мрежа е описан като ЗАДЪЛЖИТЕЛЕН и с точното извикване',
      /ЗАДЪЛЖИТЕЛЕН/.test(sql) && /cron\.schedule\('supply-auto-complete', '0 \* \* \* \*'/.test(sql));
    ok('rollback файлът маха крона, тригерите и функциите',
      (() => { const d = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261005120100_supply_auto_complete_down.sql'), 'utf8');
        return /cron\.unschedule\('supply-auto-complete'\)/.test(d) && (d.match(/drop trigger/g) || []).length === 3 && (d.match(/drop function/g) || []).length === 4; })());
    ok('права: EXECUTE се маха и от public', (sql.match(/from public, anon, authenticated/g) || []).length === 4);
    ok('няма нови таблици/колони (само функции) → няма ред за Живко', !/create table|add column/i.test(sql));
  }

  report();
})();
