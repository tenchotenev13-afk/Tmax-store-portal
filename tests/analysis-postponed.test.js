/* „📊 Анализ": отложената задача НЕ е изпълнена (04.10.2026).

   ПОВОД. В renderBulAnalysis() бяха изключени САМО редовете
   'not_applicable', тоест status='postponed' се броеше за ИЗПЪЛНЕНИЕ: вдигаше
   процента, влизаше в „✅ Изпълнени", добавяше обекта в „Изпълнили" и махаше
   задачата от „🔴 Просрочени".

   Нито едно друго място не брои така — сверено по пет източника: панелът на
   обекта (bulStoreCount), „Днес" (today.js), решетката/печатът (report.js) и
   двете едж функции send-routed-report / send-scheduled-report. Всички броят
   за изпълнено САМО 'done', а отложеното е отделно състояние. Анализ беше
   единственото изключение, затова тук НЕ се измисля правило — следва се тяхното.

   ТВЪРДЕНИЯТА:
   · изпълнение е само 'done'; 'postponed' и 'not_applicable' не са;
   · 'not_applicable' ИЗЛИЗА от знаменателя, 'postponed' ОСТАВА — защото
     Анализ брои цяла СЕДМИЦА и новата дата обикновено е вътре в нея (точно
     като седмичната картичка на send-routed-report), докато панелът и „Днес"
     броят ЕДИН ДЕН и пренесеното вече е на друг;
   · отложилият обект се ПОКАЗВА с ⏱ в реда, не изчезва безмълвно;
   · просрочена: срокът е минал, няма 'done' И няма отлагане с дата напред —
     дословно правилото на bulletin-notify („просрочена СЛЕД postponed_to, не
     след срока"). Стар отложен ред БЕЗ дата не отлага нищо.

   Пускане: node tests/analysis-postponed.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* Вторник на текущата седмица — задачите със срок „вчера" са минали, а
   „утре" не са, независимо кога се пуска тестът. */
const ANCHOR = (function () {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (1 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const shift = n => { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + n); return d; };
const MON = isoOf(shift(-1)), TUE = isoOf(shift(0)), WED = isoOf(shift(1)), THU = isoOf(shift(2));
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}

const STORES = ['Троян', 'Ловеч', 'Севлиево', 'Габрово'];
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

/* Еднодневна задача със срок ВЧЕРА (минал) по подразбиране. */
function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-1', title: 'Задача ' + id, department: 'trade',
    task_type: 'photo', due_date: MON, due_dates: [MON], sort_order: 1,
    target_stores: null, span_from: null
  }, over || {});
}
function comp(taskId, store, status, over) {
  return Object.assign({
    id: 'c-' + taskId + '-' + store, task_id: taskId, store_name: store,
    status: status, completion_date: MON, completed_by: store, completed_at: MON + 'T10:00:00Z',
    comment: null, postponed_to: null
  }, over || {});
}

function env(tasks, comps) {
  const h = boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: [], recurring_task_versions: [], recurring_task_periods: [],
      recurring_task_skips: [],
      bulletins: [{ id: 'b-1', week_number: 40, year: isoWeekYear(ANCHOR), status: 'published',
                    created_at: MON, content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } } }],
      bulletin_tasks: () => tasks,
      task_completions: () => comps,
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: [], stock_returns: []
    }
  });
  freezeDate(h.w);
  h.w.curBul = { id: 'b-1', week_number: 40, year: isoWeekYear(ANCHOR), status: 'published' };
  h.w.bulSelectedId = 'b-1';
  h.w.bulTasks = tasks;
  h.w.bulComps = comps;
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  return h;
}
async function view(tasks, comps) {
  const h = env(tasks, comps);
  if (!guard('renderBulAnalysis() не хвърля', () => h.w.renderBulAnalysis())) return null;
  for (let i = 0; i < 40; i++) {
    if (h.doc.querySelector('#an-tbl table')) break;
    await ticks();
  }
  return h;
}
/* Числото от картичка по заглавието ѝ. */
function card(h, label) {
  const divs = Array.prototype.slice.call(h.doc.querySelectorAll('#mod-bulletin div'));
  const head = divs.find(d => (d.textContent || '').trim() === label);
  if (!head) return null;
  const box = head.parentNode;
  const kids = Array.prototype.filter.call(box.children, x => x.tagName === 'DIV');
  return kids[1] ? (kids[1].textContent || '').trim() : null;
}
/* Редът на задачата в таблицата по заглавие. */
function row(h, title) {
  return Array.prototype.slice.call(h.doc.querySelectorAll('#an-tbl tbody tr'))
    .find(tr => (tr.textContent || '').indexOf(title) >= 0) || null;
}
const pctOf = tr => {
  const tds = tr ? tr.querySelectorAll('td') : [];
  return tds.length ? (tds[tds.length - 1].textContent || '').trim() : null;
};

(async function () {

  section('1. Предикатът „изпълнено"');
  {
    const w = env([], []).w;
    ok('done → да', w.bulAnIsDone({ status: 'done' }) === true);
    ok('postponed → НЕ', w.bulAnIsDone({ status: 'postponed' }) === false);
    ok('not_applicable → НЕ', w.bulAnIsDone({ status: 'not_applicable' }) === false);
    /* Ред без статус се брои за изпълнен — БУКВАЛНО както в bulStoreCount
       ((status||'done')==='done'), за да не се разминат двете числа. */
    ok('без статус → да (както панелът на обекта)', w.bulAnIsDone({}) === true);
    ok('нищо → НЕ', w.bulAnIsDone(null) === false);
  }

  section('2. Петте случая в един ред');
  {
    /* Четири обекта: един изпълнил, един отложил напред, един отложил за
       минала дата, един без отговор. Знаменателят е 4. */
    const T = [task('t-1')];
    const C = [
      comp('t-1', 'Троян', 'done'),
      comp('t-1', 'Ловеч', 'postponed', { postponed_to: THU }),
      comp('t-1', 'Севлиево', 'postponed', { postponed_to: MON })
    ];
    const h = await view(T, C);
    if (h) {
      const tr = row(h, 'Задача t-1');
      if (ok('редът го има', !!tr)) {
        ok('процентът е 25% (1 от 4), не 75%', pctOf(tr) === '25%', pctOf(tr));
        ok('изпълнилият е показан', (tr.textContent || '').indexOf('Троян') >= 0);
        ok('отложилите са показани с ⏱', tr.querySelectorAll('.an-pp').length === 2,
          String(tr.querySelectorAll('.an-pp').length));
        ok('и носят новата дата', (tr.textContent || '').indexOf('→') >= 0);
      }
      ok('„✅ Изпълнени" е 1 задача', card(h, '✅ Изпълнени') === '1', card(h, '✅ Изпълнени'));
      ok('„🏪 Магазини" е 1 (само изпълнилият)', card(h, '🏪 Магазини') === '1', card(h, '🏪 Магазини'));
      ok('„📋 Задачи" е 1', card(h, '📋 Задачи') === '1', card(h, '📋 Задачи'));
      h.close();
    }
  }

  section('3. „Не се отнася" излиза от знаменателя, отложеното ОСТАВА');
  {
    const T = [task('t-2')];
    const C = [
      comp('t-2', 'Троян', 'done'),
      comp('t-2', 'Ловеч', 'not_applicable', { comment: 'няма такъв щанд' }),
      comp('t-2', 'Севлиево', 'postponed', { postponed_to: THU })
    ];
    const h = await view(T, C);
    if (h) {
      const tr = row(h, 'Задача t-2');
      /* Знаменателят е 3 (4 − 1 „не се отнася"), числителят 1 → 33%.
         Ако отложеното също излизаше, щеше да е 50%. */
      ok('процентът е 33% (1 от 3)', pctOf(tr) === '33%', pctOf(tr));
      ok('„не се отнася" е показано с 🚫', (tr.textContent || '').indexOf('🚫') >= 0);
      ok('а отложеното с ⏱', tr.querySelectorAll('.an-pp').length === 1);
      h.close();
    }
  }

  section('4. Задача САМО с отлагане не е „изпълнена"');
  {
    const T = [task('t-3')];
    const C = [comp('t-3', 'Троян', 'postponed', { postponed_to: THU })];
    const h = await view(T, C);
    if (h) {
      ok('„✅ Изпълнени" е 0', card(h, '✅ Изпълнени') === '0', card(h, '✅ Изпълнени'));
      ok('„🏪 Магазини" е 0', card(h, '🏪 Магазини') === '0', card(h, '🏪 Магазини'));
      ok('процентът е 0%', pctOf(row(h, 'Задача t-3')) === '0%', pctOf(row(h, 'Задача t-3')));
      h.close();
    }
  }

  section('5. Просрочени — по правилото на bulletin-notify');
  {
    const w = env([], []).w;
    const T = task('o-1');
    const TODAY = w.bulTodayISO();
    ok('срок минал, без нищо → просрочена',
      w.bulAnOverdue(T, {}, {}, TODAY) === true);
    ok('срок минал, но има done → НЕ',
      w.bulAnOverdue(T, { 'o-1': 1 }, {}, TODAY) === false);
    ok('отложена за УТРЕ → още НЕ е просрочена',
      w.bulAnOverdue(T, {}, { 'o-1': WED }, TODAY) === false);
    ok('отложена за ДНЕС → още НЕ е',
      w.bulAnOverdue(T, {}, { 'o-1': TUE }, TODAY) === false);
    ok('отложена за ВЧЕРА и неизпълнена → просрочена',
      w.bulAnOverdue(T, {}, { 'o-1': MON }, TODAY) === true);
    /* Стар отложен ред без дата (има три такива от С36) не отлага нищо. */
    ok('отложена БЕЗ дата → просрочена',
      w.bulAnOverdue(T, {}, {}, TODAY) === true);
    ok('срокът още не е минал → НЕ е просрочена',
      w.bulAnOverdue(task('o-2', { due_date: THU, due_dates: [THU] }), {}, {}, TODAY) === false);
  }

  section('5б. Картата на новите дати се СТРОИ правилно');
  {
    /* Горната секция подава ppTo на ръка, тоест не докосва строителя му.
       Той има два капана: ред БЕЗ дата (три такива има от С36 — отложени по
       стария начин) и ДВА обекта, отложили същата задача за различни дни. */
    const w = env([], []).w;
    const m1 = w.bulAnPostponedTo([comp('x-1', 'Троян', 'postponed')]);
    ok('ред без дата НЕ влиза в картата', m1['x-1'] === undefined, JSON.stringify(m1));
    const m2 = w.bulAnPostponedTo([
      comp('x-1', 'Троян', 'postponed', { postponed_to: WED }),
      comp('x-1', 'Ловеч', 'postponed', { postponed_to: THU })
    ]);
    ok('при две дати се взема НАЙ-КЪСНАТА', m2['x-1'] === THU, JSON.stringify(m2));
    const m3 = w.bulAnPostponedTo([
      comp('x-1', 'Троян', 'postponed', { postponed_to: THU }),
      comp('x-1', 'Ловеч', 'postponed', { postponed_to: WED })
    ]);
    ok('и редът на редовете не го мени', m3['x-1'] === THU, JSON.stringify(m3));
    ok('done ред не влиза', w.bulAnPostponedTo([comp('x-1', 'Троян', 'done', { postponed_to: THU })])['x-1'] === undefined);
    ok('празен списък → празна карта', Object.keys(w.bulAnPostponedTo([])).length === 0);
    ok('нищо → празна карта', Object.keys(w.bulAnPostponedTo(null)).length === 0);
  }

  section('5в. Отлагане БЕЗ дата не спасява задачата (случаят С36)');
  {
    /* През целия път, не през ръчна карта: задача със минал срок, един
       отложил БЕЗ дата (както трите реда от С36) → просрочена. */
    const T = [task('n-1')];
    const C = [comp('n-1', 'Троян', 'postponed')];
    const h = await view(T, C);
    if (h) {
      ok('просрочена е', card(h, '🔴 Просрочени') === '1', card(h, '🔴 Просрочени'));
      ok('и редът е маркиран',
        (row(h, 'Задача n-1').getAttribute('style') || '').indexOf('fff5f5') >= 0);
      ok('а отложилият пак се вижда с ⏱', row(h, 'Задача n-1').querySelectorAll('.an-pp').length === 1);
      ok('без стрелка за дата', (row(h, 'Задача n-1').textContent || '').indexOf('→') === -1);
      h.close();
    }
    /* И обратното през целия път: отложена НАПРЕД → не е просрочена. */
    const h2 = await view([task('n-2')], [comp('n-2', 'Троян', 'postponed', { postponed_to: THU })]);
    if (h2) {
      ok('КОНТРОЛА: отложена за четвъртък → 0 просрочени',
        card(h2, '🔴 Просрочени') === '0', card(h2, '🔴 Просрочени'));
      h2.close();
    }
  }

  section('6. Картата „🔴 Просрочени" и редът');
  {
    const T = [
      task('p-1'),                                                 /* минал срок, нищо */
      task('p-2'),                                                 /* минал срок, отложена напред */
      task('p-3', { due_date: THU, due_dates: [THU] })             /* бъдещ срок */
    ];
    const C = [comp('p-2', 'Троян', 'postponed', { postponed_to: THU })];
    const h = await view(T, C);
    if (h) {
      ok('просрочена е точно ЕДНА', card(h, '🔴 Просрочени') === '1', card(h, '🔴 Просрочени'));
      ok('редът на p-1 е маркиран', (row(h, 'Задача p-1').getAttribute('style') || '').indexOf('fff5f5') >= 0,
        row(h, 'Задача p-1').getAttribute('style'));
      ok('а редът на p-2 НЕ е', (row(h, 'Задача p-2').getAttribute('style') || '').indexOf('fff5f5') === -1,
        row(h, 'Задача p-2').getAttribute('style'));
      ok('нито на p-3', (row(h, 'Задача p-3').getAttribute('style') || '').indexOf('fff5f5') === -1);
      h.close();
    }
  }

  section('7. Същото правило като в останалите места');
  {
    const fs = require('fs'), path = require('path');
    const ROOT = process.argv[2] || '.';
    const bul = fs.readFileSync(path.join(ROOT, 'bulletin.js'), 'utf8');
    const td = fs.readFileSync(path.join(ROOT, 'today.js'), 'utf8');
    const rp = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
    /* Панелът на обекта: същият предикат, дума по дума. */
    ok('панелът на обекта брои (status||done)===done',
      bul.indexOf("(c.status||'done')==='done'") >= 0, 'няма го');
    ok('и Анализ ползва СЪЩИЯ предикат през bulAnIsDone',
      bul.indexOf("function bulAnIsDone(c){ return !!c && (c.status||'done')==='done'; }") >= 0, 'няма го');
    ok('„Днес" брои само done', td.indexOf("status='done'") >= 0, 'няма го');
    ok('отчетът има отделно състояние postponed',
      rp.indexOf("state==='postponed'") >= 0, 'няма го');
    /* И нито едно останало „всичко освен not_applicable" в Анализ. */
    const an = bul.slice(bul.indexOf('function renderBulAnalysis'),
      bul.indexOf('ПОСТОЯННИ ЗАДАЧИ'));
    ok('в Анализ няма останало условие само срещу not_applicable',
      an.indexOf("status!=='not_applicable'") === -1, 'останало е');
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
