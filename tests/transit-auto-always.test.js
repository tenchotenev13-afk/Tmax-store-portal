/* „Стока на път" в Бюлетина — автоматична ВИНАГИ (решение на Тенчо 08.11.2026).

   Повод: 379d9f9d… „СТОКА НА ПЪТ" (05–08.11, auto_complete=false) — Кърджали
   е отговорила на всички 103 реда, отметнала е ръчно 05 и 06.11, а 07 и 08.11
   излизат неизпълнени. Дотогава автоматиката беше по избор (auto_complete) и
   само за еднодневна задача.

   Клиент (shared.js + bulletin.js, реалният ред от index.html):
     а. transit задача с auto_complete=false е заключена за обекта като
        автоматична (data-linked='transit-auto', disabled, модалът не се отваря);
     б. многодневна transit задача — също, за всеки свой ден;
     в. формата: без чекбокс за transit, многодневната се записва (не се спира
        от bulAutoCompleteValid); без срок — отказ;
     г. задачите от другите модули — без промяна (ръчна с Контакти, oborot);
     д. надписът „⏳ N необработени реда" и за многодневна; броячът се тегли.
   База (текстово, transit-auto-always-schema.sql — реалният dry-run е в
   доклада на сесията):
     е. transit_sync_completions без auto_complete и без cardinality <= 1;
        отметка за всеки ден (unnest), прозорец по последния ден (max),
        правилото transit_store_done_since остава;
     ж. bulletin_tasks_transit_sync_trg без auto_complete;
     з. transit_mark_empty_stores — същата промяна (решение Б, 08.11.2026);
        еднократен sync в края на миграцията (решение А1), без нов крон.
   Поведението в базата — tests/sql/transit-auto-always.test.sql (пуска се
   през execute_sql, всичко се връща назад; 11 мутанта).

   Пускане: node tests/transit-auto-always.test.js . */
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, dayOffset, ticks } = H;

const ROOT = path.resolve(process.argv[2] || '.');
const KR = 'Кърджали';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: KR };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const TODAY = dayOffset(0);
/* Втори ден В СЪЩАТА седмица — в неделя +1 би излязъл от бюлетина. */
const IDX = (new Date().getDay() + 6) % 7;
const OTHER = IDX === 0 ? dayOffset(1) : dayOffset(-1);
const AUTO_LABEL = 'Отмята се автоматично от Стока на път';

const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const patchesTo = (h, t) => h.calls.patch.filter(p => p.table === t);
const postsTo = (h, t) => h.calls.post.filter(p => p.table === t);
async function settle(n) { for (let i = 0; i < (n || 6); i++) await ticks(); }

function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear();
}
function btask(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-1', title: 'Задача ' + id, department: 'warehouse', task_type: 'info',
    description: null, target_stores: null, due_date: TODAY, due_dates: [TODAY],
    linked_module: null, auto_complete: false, report_groups: null, attachments: null, sort_order: 1
  }, over || {});
}
function bulEnv(user, tasks, data) {
  const h = boot({ modules: ['bulletin.js'], user: user,
                   data: Object.assign({ users: [{ store_name: KR }], goods_transit: [], task_completions: [] }, data || {}) });
  const w = h.w, now = new Date(), cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  w.curBul = { id: 'b-1', week_number: w.weekNum(now), year: isoWeekYear(now), status: 'published',
               content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  w.bulListCache = []; w.bulComps = []; w.recurringComps = []; w.recurringTasks = [];
  w.allStoresCache = [KR]; w.reportableStoresCache = [KR];
  w.bulTasks = tasks;
  h.reloads = 0;
  w.loadBulletin = function () { h.reloads++; };
  return h;
}
const cbs = (doc, id) => Array.prototype.slice.call(doc.querySelectorAll('input[type=checkbox][data-tid="' + id + '"]'));
function fakeCb(doc, id, linked, cdate) {
  const cb = doc.createElement('input'); cb.type = 'checkbox';
  cb.setAttribute('data-tid', id); cb.setAttribute('data-cdate', cdate || TODAY); cb.setAttribute('data-linked', linked);
  cb.checked = true; return cb;
}

/* Задачата от случая: linked_module transit, auto_complete=false. */
const T_ONE = () => btask('t-one', { title: 'СТОКА НА ПЪТ еднодневна', linked_module: 'transit', auto_complete: false });
const T_MULTI = () => btask('t-multi', { title: 'СТОКА НА ПЪТ многодневна', linked_module: 'transit', auto_complete: false,
                                         due_date: OTHER < TODAY ? OTHER : TODAY, due_dates: [OTHER, TODAY].sort() });
const T_MAN = () => btask('t-man', { title: 'Контакти ръчна', linked_module: 'contacts' });

(async function () {

  section('а. transit с auto_complete=false е автоматична');
  {
    const h = bulEnv(MANAGER, [T_ONE(), T_MAN()]);
    ok('bulTaskLinkKey(transit, auto_complete=false) → transit-auto',
      h.w.bulTaskLinkKey({ linked_module: 'transit', auto_complete: false }) === 'transit-auto');
    ok('bulTaskLinkKey(transit, без поле) → transit-auto',
      h.w.bulTaskLinkKey({ linked_module: 'transit' }) === 'transit-auto');
    guard('renderBulView()', () => h.w.renderBulView());
    const a = cbs(h.doc, 't-one');
    if (ok('има чекбокси', a.length > 0, a.length)) {
      ok('всички са disabled', a.every(c => c.disabled));
      ok('data-linked = transit-auto', a.every(c => c.getAttribute('data-linked') === 'transit-auto'));
      ok('title: „' + AUTO_LABEL + '"', a.every(c => c.getAttribute('title') === AUTO_LABEL), a.map(c => c.getAttribute('title')).join(' | '));
    }
    const pp = id => h.doc.querySelectorAll('button[data-task-id="' + id + '"][onclick^="openPostponeModal"]').length;
    ok('няма „Отложи"', pp('t-one') === 0, pp('t-one'));
  }
  {
    const h = bulEnv(MANAGER, [T_ONE()]);
    /* Истинският вход — обработчикът, с ключа, който сам задава рендерът. */
    const cb = fakeCb(h.doc, 't-one', 'transit-auto');
    guard('bulCheckboxChanged()', () => h.w.bulCheckboxChanged(cb));
    await settle();
    ok('обработчикът: няма запис', postsTo(h, 'task_completions').length === 0 && patchesTo(h, 'task_completions').length === 0);
    ok('чекбоксът се връща', cb.checked === false);
    guard('openTaskCompletionModal()', () => h.w.openTaskCompletionModal('t-one', 'regular', TODAY));
    ok('модалът не се отваря', !h.doc.getElementById('tc-modal-ov'));
  }

  section('б. многодневна transit задача — заключена за всеки ден');
  {
    const h = bulEnv(MANAGER, [T_MULTI()]);
    guard('renderBulView()', () => h.w.renderBulView());
    const a = cbs(h.doc, 't-multi');
    const dates = Array.from(new Set(a.map(c => c.getAttribute('data-cdate')))).sort();
    if (ok('има чекбокси и за двата дни', dates.indexOf(TODAY) >= 0 && dates.indexOf(OTHER) >= 0, dates.join(','))) {
      ok('всички са disabled', a.every(c => c.disabled));
      ok('data-linked = transit-auto', a.every(c => c.getAttribute('data-linked') === 'transit-auto'));
    }
    guard('модал за другия ден', () => h.w.openTaskCompletionModal('t-multi', 'regular', OTHER));
    ok('модалът не се отваря и за другия ден', !h.doc.getElementById('tc-modal-ov'));
  }

  section('в. формата — без чекбокс, многодневната се записва');
  {
    const h = bulEnv(ADMIN, [btask('t-x')]);
    h.w.renderBulView();
    guard('openTaskModal()', () => h.w.openTaskModal());
    const d = h.doc, sel = d.getElementById('tk-linked-module');
    sel.value = 'transit'; fire(h.w, sel, 'change');
    ok('бележката е видима', d.getElementById('tk-auto-wrap') && d.getElementById('tk-auto-wrap').style.display !== 'none');
    ok('няма чекбокс tk-auto-complete', !d.getElementById('tk-auto-complete'));
    ok('текстът не казва „само един ден"', !/един ден/.test(txt(d.getElementById('tk-auto-wrap'))), txt(d.getElementById('tk-auto-wrap')));
    d.getElementById('tk-title').value = 'СТОКА НА ПЪТ';
    const boxes = Array.prototype.slice.call(d.querySelectorAll('#tk-due-dates input[type=checkbox]'));
    boxes.forEach(b => { b.checked = b.value === TODAY || b.value === OTHER; });
    const add = Array.prototype.find.call(d.querySelectorAll('#tk-ov button'), b => (b.getAttribute('onclick') || '') === 'submitTask()');
    realClick(h.w, add, 'Добави задача'); await settle();
    const p = postsTo(h, 'bulletin_tasks');
    if (ok('2 дни → записва', p.length === 1, JSON.stringify(h.calls.toast))) {
      ok('linked_module transit, два дни', p[0].body.linked_module === 'transit' && (p[0].body.due_dates || []).length === 2, JSON.stringify(p[0].body.due_dates));
      ok('без toast „ЕДИН ден"', !h.calls.toast.some(t => /ЕДИН ден/.test(t)), JSON.stringify(h.calls.toast));
    }
    ok('bulAutoCompleteValid(true, 3 дни) → true', h.w.bulAutoCompleteValid(true, ['a', 'b', 'c']) === true);
    ok('bulAutoCompleteValid(true, 0 дни) → false', h.w.bulAutoCompleteValid(true, []) === false);
  }
  {
    const h = bulEnv(ADMIN, [T_MULTI()]);
    h.w.renderBulView();
    guard('openEditTaskModal(t-multi)', () => h.w.openEditTaskModal('t-multi'));
    const d = h.doc;
    ok('редакция: бележката е видима, без чекбокс',
      d.getElementById('etk-auto-wrap') && d.getElementById('etk-auto-wrap').style.display !== 'none' && !d.getElementById('etk-auto-complete'));
    const save = Array.prototype.find.call(d.querySelectorAll('#edit-tk-ov button'), b => (b.getAttribute('onclick') || '').indexOf('submitEditTask') >= 0);
    realClick(h.w, save, 'Запази'); await settle();
    const p = patchesTo(h, 'bulletin_tasks');
    ok('редакция на многодневна → записва', p.length === 1, JSON.stringify(h.calls.toast));
  }

  section('г. другите модули — без промяна');
  {
    const h = bulEnv(MANAGER, [T_MAN()]);
    h.w.renderBulView();
    const m = cbs(h.doc, 't-man');
    if (ok('ръчната (Контакти) има чекбокси', m.length > 0)) {
      ok('натискаема днес', m.some(c => c.getAttribute('data-cdate') === TODAY && !c.disabled));
      ok('data-linked = contacts', m.every(c => c.getAttribute('data-linked') === 'contacts'));
    }
    guard('модал за ръчната', () => h.w.openTaskCompletionModal('t-man', 'regular', TODAY));
    ok('модалът за ръчната се отваря', !!h.doc.getElementById('tc-modal-ov'));
    ok('oborot → oborot', h.w.bulTaskLinkKey({ linked_module: 'oborot' }) === 'oborot');
    ok('stock-diff → stock-diff', h.w.bulTaskLinkKey({ linked_module: 'stock-diff', auto_complete: true }) === 'stock-diff');
    ok('без свързан таб → ""', h.w.bulTaskLinkKey({ linked_module: null }) === '');
  }

  section('д. надписът и броячът — и за многодневна');
  {
    const h = bulEnv(MANAGER, [T_MULTI()], { goods_transit: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] });
    h.w.renderBulletin = function () {};
    guard('bulLoadTransitPending()', () => h.w.bulLoadTransitPending());
    await settle();
    ok('броячът се тегли (една заявка)', h.calls.get.filter(x => /goods_transit/.test(x)).length === 1, h.calls.get.join(' | '));
    ok('броячът = 4', h.w.bulAutoPending['transit-auto'] === 4, String(h.w.bulAutoPending['transit-auto']));
    h.w.renderBulView();
    const n = Array.prototype.map.call(h.doc.querySelectorAll('.bul-auto-transit'), txt);
    ok('„⏳ 4 необработени реда"', n.length > 0 && n.some(t => t.indexOf('⏳ 4 необработени реда') >= 0), n.join(' | '));
  }

  section('е/ж/з. миграцията (текст на transit-auto-always-schema.sql)');
  {
    const sqlPath = path.join(ROOT, 'transit-auto-always-schema.sql');
    if (ok('файлът съществува', fs.existsSync(sqlPath))) {
      const sql = fs.readFileSync(sqlPath, 'utf8').replace(/--[^\n]*/g, '');
      const fnSync = (sql.match(/function public\.transit_sync_completions[\s\S]*?\$\$;/) || [''])[0];
      const fnTrg = (sql.match(/function public\.bulletin_tasks_transit_sync_trg[\s\S]*?\$\$;/) || [''])[0];
      ok('transit_sync_completions е в файла', fnSync.length > 0);
      ok('без auto_complete', fnSync.length > 0 && !/auto_complete/.test(fnSync));
      ok('без cardinality(...) <= 1', fnSync.length > 0 && !/<=\s*1/.test(fnSync));
      ok('отметка за всеки ден — unnest(due_dates) и d.day в select-а',
        /unnest\(\s*case when coalesce\(cardinality\(bt\.due_dates\), 0\) > 0\s*then bt\.due_dates/.test(fnSync) && /'done', d\.day/.test(fnSync));
      ok('прозорец по ПОСЛЕДНИЯ ден (max) >= v_today - 14', /select max\(x\)[\s\S]*?>= v_today - 14/.test(fnSync));
      ok('правилото „отговорил на всичко" остава — transit_store_done_since(p_store, …)',
        /and transit_store_done_since\(p_store,/.test(fnSync));
      ok('on conflict — само postponed → done', /where task_completions\.status = 'postponed'/.test(fnSync));
      ok('тригерът е в файла и е без auto_complete', fnTrg.length > 0 && !/auto_complete/.test(fnTrg) && /linked_module is distinct from 'transit'/.test(fnTrg));
      const fnEmpty = (sql.match(/function public\.transit_mark_empty_stores[\s\S]*?\$\$;/) || [''])[0];
      ok('transit_mark_empty_stores е в файла', fnEmpty.length > 0);
      ok('empty: без auto_complete и без <= 1', fnEmpty.length > 0 && !/auto_complete/.test(fnEmpty) && !/<=\s*1/.test(fnEmpty));
      ok('empty: отметка за всеки ден — unnest(t.days), d.day в select-а',
        /cross join unnest\(t\.days\) as d\(day\)/.test(fnEmpty) && /'auto:transit-empty', now\(\), 'done', d\.day/.test(fnEmpty));
      ok('empty: прозорец по последния ден', /select max\(x\) from unnest\(dd\.days\) as x\) >= v_today - 14/.test(fnEmpty));
      ok('empty: празен = без нито един ред (not exists)', /and not exists \(/.test(fnEmpty));
      ok('empty: самопочистване за всеки ден >= днес, само auto:transit-empty',
        /tc\.completion_date = any\(t\.days\)/.test(fnEmpty) && /tc\.completion_date >= v_today/.test(fnEmpty) && /tc\.completed_by = 'auto:transit-empty'/.test(fnEmpty));
      const tail = sql.slice(sql.lastIndexOf('$$;'));
      ok('еднократен sync в края — за всеки обект от goods_transit (А1)',
        /select public\.transit_sync_completions\(x\.s\)\s+from \(select distinct store_name as s\s+from public\.goods_transit/.test(tail), tail.trim().slice(0, 120));
      ok('без нов крон', !/cron\.schedule/.test(sql));
      const down = fs.readFileSync(path.join(ROOT, 'transit-auto-always-schema-down.sql'), 'utf8');
      ok('rollback връща старите условия', /and bt\.auto_complete/.test(down) && /cardinality\(bt\.due_dates\), 0\) <= 1/.test(down) && /coalesce\(new\.auto_complete, false\)/.test(down));
      ok('rollback връща и старата transit_mark_empty_stores', /function public\.transit_mark_empty_stores[\s\S]*if t\.due >= v_today then/.test(down));
    }
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
