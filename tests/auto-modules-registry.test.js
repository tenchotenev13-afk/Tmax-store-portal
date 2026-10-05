/* ОБЩОТО правило „свързан таб с автоматично отмятане" (02.10.2026).

   Задача, чието изпълнение се ДОКАЗВА ОТ ДАННИ: обектът не я отмята, не я
   отлага, не може да каже „не се отнася за нас" — вместо това вижда сив надпис
   какво остава. Дотук това бяха два низа в едно условие („oborot",
   „transit-auto") и тройна тернарна проверка за етикета на три места; третият
   модул („За връщане", stock-returns) го превърна в РЕГИСТЪР.

   ТВЪРДЕНИЯТА:
   · регистърът е единственият източник — заключване, етикет и надпис излизат
     от него, а добавянето на модул е един ред;
   · „За връщане" получава ВСИЧКИ свойства на автоматичен модул наведнъж:
     заключен чекбокс, без „⏱ Отложи", без „🚫 Не се отнася", сив надпис;
   · надписът работи и при ПОСТОЯННА задача — дотук го имаше само при
     еднократните, защото автоматични бяха само те;
   · броячът е ЕДИН източник (bulAutoPending), не глобална променлива на модул;
   · „Вечерен оборот" и „Стока на път" са непроменени (регресия).

   Пускане: node tests/auto-modules-registry.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const shifted = n => { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + n); return d; };
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const D = n => isoOf(shifted(-2 + n));
const MON = D(0), TUE = D(1), WED = D(2);

const STORE = 'Троян';
const USER = { email: 't@temax.bg', display_name: 'Иван', role: 'store', store_name: STORE };

/* Постоянната задача „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" — сряда 20:00, както е в
   базата след прилагане на версията за седмицата (task_type: info). */
function retTask(over) {
  return Object.assign({
    id: 'r-ret', title: 'СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ', department: 'admin',
    task_type: 'info', active: true, sort_order: 1,
    due_weekday: 2, due_weekdays: [2], due_time: '20:00', due_window: false,
    target_stores: null, report_groups: ['controlling'], linked_module: 'stock-returns'
  }, over || {});
}
function manualTask(over) {
  return Object.assign({
    id: 'r-man', title: 'Ръчна постоянна', department: 'admin',
    task_type: 'info', active: true, sort_order: 2,
    due_weekday: 2, due_weekdays: [2], due_time: null, due_window: false,
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
function ret(id, over) {
  return Object.assign({
    id: id, store_name: STORE, status: 'pending', confirmed_date: null, confirmed_by: null,
    source: 'complaint', product_name: 'Стока ' + id, sap_code: '1', quantity: 1
  }, over || {});
}
function env(recs, returns) {
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: USER,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      recurring_tasks: recs || [retTask()],
      recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
      bulletins: () => [{
        id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR),
        status: 'published', created_at: MON,
        content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(),
                   columns: { trade: [], warehouse: [], admin: [] } }
      }],
      bulletin_tasks: [], task_completions: [],
      stock_returns: () => (returns || []),
      goods_transit: [], bulletin_promotions: [], task_subtasks: [],
      subtask_completions: [], notification_schedules: [], report_snapshots: []
    }
  });
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [STORE];
  h.w.allStoresCache = [STORE];
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function view(recs, returns) {
  const h = env(recs, returns);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle(() => !!h.doc.getElementById('sec-calendar'));
  return h;
}
const panel = h => h.doc.getElementById('dept-panel-admin');
const btnIn = (el, text) => Array.prototype.slice.call((el || { querySelectorAll: () => [] }).querySelectorAll('button'))
  .find(b => (b.textContent || '').indexOf(text) >= 0) || null;
const noteOf = (h, cls) => {
  const el = (panel(h) || h.doc).querySelector('.' + cls);
  return el ? (el.textContent || '').trim() : null;
};

(async function () {

  section('1. РЕГИСТЪРЪТ е единственият източник');
  {
    const h = env();
    const w = h.w;
    const keys = Object.keys(w.BUL_AUTO_MODULES);
    /* ПЕТ от 05.10.2026 („Зареждане"); ЧЕТИРИ от 04.10.2026: „Разлики" (stock-diff) влезе с дата на влизане в
       сила. Числото е заковано нарочно — нов модул трябва да мине и през
       този тест, а не да се промъкне. */
    ok('съдържа петте модула', keys.length === 5 && keys.indexOf('supply') >= 0 && keys.indexOf('oborot') >= 0 &&
      keys.indexOf('transit-auto') >= 0 && keys.indexOf('stock-returns') >= 0 &&
      keys.indexOf('stock-diff') >= 0, keys.join(', '));
    ok('bulAutoLocked чете от него', w.bulAutoLocked('stock-returns') === true);
    ok('и казва НЕ за непознат модул', w.bulAutoLocked('reference') === false);
    ok('и за празен', w.bulAutoLocked('') === false);
    /* Всеки модул носи reason, label и tab — иначе етикетът излиза празен. */
    const bad = keys.filter(k => {
      const m = w.BUL_AUTO_MODULES[k];
      return !m.reason || !m.label || !m.tab || !m.cls;
    });
    ok('всеки модул има reason, label, tab и клас', bad.length === 0, bad.join(', '));
    /* Причините са различни — иначе два модула биха дали един етикет. */
    const reasons = keys.map(k => w.BUL_AUTO_MODULES[k].reason);
    ok('причините са различни', new Set(reasons).size === reasons.length, reasons.join(', '));
  }

  section('1б. РЕГРЕСИЯ: двата стари модула са дословно непроменени');
  {
    const w = env().w;
    ok('oborot → reason „auto"', w.bulLockReason(WED, 'oborot') === 'auto');
    ok('и етикет „при запис на оборота"',
      w.bulLockLabel('auto') === 'Отмята се автоматично при запис на оборота', w.bulLockLabel('auto'));
    ok('transit-auto → reason „auto-transit"', w.bulLockReason(WED, 'transit-auto') === 'auto-transit');
    ok('и етикет „от Стока на път"',
      w.bulLockLabel('auto-transit') === 'Отмята се автоматично от Стока на път', w.bulLockLabel('auto-transit'));
    /* Неавтоматичните причини минават по стария път. */
    ok('бъдещ ден', w.bulLockLabel('future') === 'Денят още не е настъпил');
    ok('минал ден', w.bulLockLabel('past') === 'Денят е приключил');
    ok('ръчна задача днес не е заключена', w.bulLockReason(WED, null) === null);
  }

  section('2. „За връщане" получава всичко наведнъж');
  {
    const w = env().w;
    ok('заключена е', w.bulAutoLocked('stock-returns') === true);
    ok('reason е свой', w.bulLockReason(WED, 'stock-returns') === 'auto-returns');
    ok('етикетът сочи таба',
      w.bulLockLabel('auto-returns') === 'Отмята се автоматично от „За връщане"',
      w.bulLockLabel('auto-returns'));
    /* Бутонът „🚫 Не се отнася" го няма — както при Стока на път. */
    const t = { id: 'r-ret', task_type: 'info', linked_module: 'stock-returns' };
    ok('„🚫 Не се отнася" го няма', w.bulNaBtnHtml('recurring', t, WED, null) === '');
    ok('КОНТРОЛА: ръчната постоянна го има',
      w.bulNaBtnHtml('recurring', { id: 'r-man', task_type: 'info', linked_module: null }, WED, null)
        .indexOf('🚫 Не се отнася') >= 0);
  }

  section('3. ЕКРАНЪТ на обекта: заключен чекбокс, без „Отложи", сив надпис');
  {
    const h = await view([retTask(), manualTask()], [ret('s1'), ret('s2'), ret('s3')]);
    if (!h) return report();
    await settle(() => h.w.bulAutoPending['stock-returns'] !== null && h.w.bulAutoPending['stock-returns'] !== undefined, 80);
    const p = panel(h);
    const cb = p.querySelector('input[data-rtid="r-ret"]');
    if (ok('чекбоксът е в DOM-а (не се крие — правило 11)', !!cb)) {
      ok('но е заключен', cb.disabled === true);
      /* title-ът е ЦЕЛИЯТ етикет, не началото му. Етикетът съдържа кавичка;
         без escAttr атрибутът се затваря по средата и getAttribute връща само
         първата половина. Точното равенство е единственото твърдение, което
         различава двете — „съдържа началото" минава и в двата случая. */
      ok('и title е целият етикет',
        cb.getAttribute('title') === h.w.bulLockLabel('auto-returns'),
        JSON.stringify(cb.getAttribute('title')));
      ok('и в него има затваряща кавичка',
        (cb.getAttribute('title') || '').slice(-1) === String.fromCharCode(34),
        JSON.stringify(cb.getAttribute('title')));
    }
    const note = noteOf(h, 'bul-auto-returns');
    if (ok('сивият надпис е там', !!note, String(note))) {
      ok('и казва колко остават', note === '⏳ 3 записа без актуализация от понеделник', note);
    }
    ok('общият клас bul-auto-note също е сложен', !!p.querySelector('.bul-auto-note'));
    ok('„⏱ Отложи" го няма за автоматичната',
      !btnIn(p, '⏱ Отложи') || (btnIn(p, '⏱ Отложи').getAttribute('data-task-id') !== 'r-ret'));
    /* КОНТРОЛА: ръчната постоянна задача е отключена и има „Отложи". */
    const cbMan = p.querySelector('input[data-rtid="r-man"]');
    ok('КОНТРОЛА: ръчната е отключена', !!cbMan && !cbMan.disabled);
    const pp = Array.prototype.slice.call(p.querySelectorAll('button'))
      .filter(b => (b.textContent || '').indexOf('⏱ Отложи') >= 0);
    ok('и „Отложи" е само за нея', pp.length === 1 && pp[0].getAttribute('data-task-id') === 'r-man',
      pp.map(b => b.getAttribute('data-task-id')).join(','));
    ok('и тя НЕ носи сив надпис', !cbMan.parentNode.querySelector('.bul-auto-note'));
  }

  section('3б. Числото в надписа брои ПРАВИЛНИТЕ записи');
  {
    /* Актуализиран в понеделник ОТ ОБЕКТА → не се брои. Без дата, стара дата,
       БЪДЕЩА дата и дата ОТ ОФИСА → броят се. Бъдещата е реалният случай
       Козлодуй 2029; офисната е причината да има confirmed_by изобщо. */
    const BY = { confirmed_by: 'store:' + STORE };
    const h = await view([retTask()], [
      ret('ok1', Object.assign({ confirmed_date: MON }, BY)),
      ret('ok2', Object.assign({ confirmed_date: WED }, BY)),
      ret('no1'),
      ret('no2', Object.assign({ confirmed_date: D(-7) }, BY)),
      ret('no3', Object.assign({ confirmed_date: D(30) }, BY)),
      ret('no4', { confirmed_date: MON, confirmed_by: 'office:Цветелина' }),
      ret('taken', Object.assign({ status: 'taken' }, BY))
    ]);
    if (!h) return report();
    await settle(() => typeof h.w.bulAutoPending['stock-returns'] === 'number', 80);
    ok('броят е 4 — без дата, стара, бъдеща и поставена от офиса',
      h.w.bulAutoPending['stock-returns'] === 4, String(h.w.bulAutoPending['stock-returns']));
    ok('надписът го казва',
      noteOf(h, 'bul-auto-returns') === '⏳ 4 записа без актуализация от понеделник',
      noteOf(h, 'bul-auto-returns'));
  }

  section('3в. Всичко актуализирано → надписът не брои нищо');
  {
    const h = await view([retTask()], [
      ret('a', { confirmed_date: MON, confirmed_by: 'store:' + STORE }),
      ret('b', { confirmed_date: TUE, confirmed_by: 'store:' + STORE })
    ]);
    if (!h) return report();
    await settle(() => typeof h.w.bulAutoPending['stock-returns'] === 'number', 80);
    ok('броят е 0', h.w.bulAutoPending['stock-returns'] === 0, String(h.w.bulAutoPending['stock-returns']));
    ok('надписът е общият', noteOf(h, 'bul-auto-returns') === '⏳ отмята се от „За връщане"',
      noteOf(h, 'bul-auto-returns'));
  }

  section('4. Обект без невзети записи — надписът пак е там');
  {
    const h = await view([retTask()], []);
    if (!h) return report();
    await settle(() => typeof h.w.bulAutoPending['stock-returns'] === 'number', 80);
    ok('броят е 0', h.w.bulAutoPending['stock-returns'] === 0);
    ok('надписът съществува', !!noteOf(h, 'bul-auto-returns'), String(noteOf(h, 'bul-auto-returns')));
  }

  section('5. „Само за информация" (стара седмица) — без брояч и без заявка');
  {
    /* Версията прави задачата info от 28.09; за по-стара седмица тя е notice и
       нито надпис, нито заявка са ѝ нужни. */
    const h = await view([retTask({ task_type: 'notice' })], [ret('x')]);
    if (!h) return report();
    await ticks(); await ticks();
    ok('броячът остава незареден',
      h.w.bulAutoPending['stock-returns'] === null || h.w.bulAutoPending['stock-returns'] === undefined,
      String(h.w.bulAutoPending['stock-returns']));
    const q = h.calls.get.filter(u => u.indexOf('/stock_returns') >= 0);
    ok('и заявка към stock_returns няма', q.length === 0, q.join('\n'));
  }

  /* ЗАПИСАНО СЪЗНАТЕЛНО: мутант „bulAutoNoteHtml чете ключа с bulTaskLinkKey
     вместо по вида" НЕ може да бъде убит и не е пропуск на теста — той е
     ЕКВИВАЛЕНТЕН. bulTaskLinkKey различава само случая linked_module==='transit'
     И auto_complete, а recurring_tasks НЯМА колона auto_complete (проверено в
     базата), тоест за постоянна задача двата пътя дават един и същ ключ.
     Параметърът kind остава, защото при ЕДНОКРАТНИТЕ разликата е истинска
     ('transit' + auto_complete → 'transit-auto'); измислен тест за невъзможно
     състояние би бил по-лош от този коментар. */

  section('6. Етикетът на автора на автоматичната отметка');
  {
    const w = env().w;
    ok('auto:stock-returns', w.bulCompletedByLabel('auto:stock-returns') === 'автоматично от „За връщане"',
      w.bulCompletedByLabel('auto:stock-returns'));
    ok('РЕГРЕСИЯ auto:transit', w.bulCompletedByLabel('auto:transit') === 'автоматично от Стока на път');
    ok('РЕГРЕСИЯ auto:transit-empty',
      w.bulCompletedByLabel('auto:transit-empty') === 'автоматично — няма входящи редове');
    ok('име на човек минава както е', w.bulCompletedByLabel('Иван Петров') === 'Иван Петров');
  }

  report();
})();
