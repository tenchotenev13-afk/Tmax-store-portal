/* Таб „Днес": прозоречна постоянна задача (due_window)

   Прозоречната задача е ЕДНА единица работа за седмицата: „Ревизии 953" с
   дни [Пон, Вто, Сря] значи „подай до сряда", а не три отделни задължения.

   В НАБОРА това вече работеше и преди тази промяна — recurringIsDueToday()
   минава през recurringReportDueOnWeekday(), която за прозоречна връща true
   единствено за деня на срока. Затова секция 1 по-долу е РЕГРЕСИОННА: тя
   заковава поведение, което е било вярно, за да не се загуби при следваща
   промяна, и НЕ пада срещу стария код. Това е нарочно и е отбелязано.

   Счупена беше ВТОРАТА половина — съпоставянето на отметката. И заявката, и
   JS филтърът искаха completion_date = ДНЕС, тоест обект, свършил задачата в
   понеделник, излизаше неизпълнил в сряда и висеше в знаменателя си.
   report.js го прави правилно от по-рано (collectDailyReportData); тук двете
   се изравняват.

   ⚠️ Никакви фиксирани календарни дати: котва + отместване, часовникът
   замразен на конкретен ден.

   Пускане: node tests/today-window-task.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* ── Котва и дати ────────────────────────────────────────────────────────── */
const ANCHOR_MON = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
})();
function dateAt(n) { const d = new Date(ANCHOR_MON.getTime()); d.setDate(d.getDate() + n); return d; }
function isoAt(n) {
  const d = dateAt(n), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
const MON = isoAt(0), TUE = isoAt(1), WED = isoAt(2);

function freezeAt(w, n) {
  const Real = w.Date;
  const fixedMs = dateAt(n).getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}

/* ── Данни ───────────────────────────────────────────────────────────────── */
const STORES = ['Троян', 'Ловеч', 'Севлиево'];
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const WIN_TITLE = 'Ревизии 953';

function winTask(over) {
  return Object.assign({
    id: 'r-win', title: WIN_TITLE, department: 'trade',
    task_type: 'info', active: true, sort_order: 1,
    due_weekdays: [0, 1, 2], due_weekday: 0, due_time: '16:00', due_window: true,
    target_stores: null, report_groups: null, linked_module: null, description: null,
  }, over || {});
}
function comp(store, date, over) {
  return Object.assign({
    id: 'c-' + store + '-' + date, task_id: null, recurring_task_id: 'r-win',
    store_name: store, status: 'done', completion_date: date,
    completed_by: store, comment: null, photos: null, files: null,
  }, over || {});
}

/* Мъничък PostgREST: прилага completion_date филтрите НАИСТИНА. Без това
   проверката „заявката носи обхват" щеше да е декоративна — JS филтърът
   долу щеше да върши всичко и заявката спокойно можеше да е eq.днес. */
function pgFake(rows) {
  return function (url) {
    const qs = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1) : '';
    const preds = [];
    qs.split('&').forEach(function (p) {
      const i = p.indexOf('=');
      if (i < 0) return;
      const col = decodeURIComponent(p.slice(0, i));
      const val = decodeURIComponent(p.slice(i + 1));
      if (col === 'select' || col === 'order' || col === 'limit') return;
      const m = /^(eq|gte|lte)\.([\s\S]*)$/.exec(val);
      if (m) {
        preds.push(r => {
          const v = r[col];
          if (v === null || v === undefined) return false;
          const x = String(v);
          return m[1] === 'eq' ? x === m[2] : m[1] === 'gte' ? x >= m[2] : x <= m[2];
        });
        return;
      }
      const mi = /^in\.\(([\s\S]*)\)$/.exec(val);
      if (mi) {
        const list = mi[1] ? mi[1].split(',') : [];
        preds.push(r => list.indexOf(String(r[col])) >= 0);
        return;
      }
      if (val === 'not.is.null') { preds.push(r => r[col] !== null && r[col] !== undefined); return; }
    });
    return rows.filter(r => preds.every(f => f(r)));
  };
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: ADMIN, data: {},
  });
  const w = h.w;
  freezeAt(w, opts.at === undefined ? 2 : opts.at);
  const wkDate = dateAt(0);
  const bul = {
    id: 'b-1', week_number: w.weekNum(wkDate), year: isoWeekYear(wkDate),
    status: 'published', created_at: isoAt(0),
    content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } },
  };
  w.DKEYS.forEach(k => { bul.content.calendar[k] = []; });
  h.setData('bulletins', [bul]);
  h.setData('recurring_tasks', opts.recurring || [winTask()]);
  h.setData('bulletin_tasks', []);
  h.setData('task_completions', pgFake(opts.comps || []));
  h.setData('users', STORES.map(s => ({ store_name: s })));
  h.setData('report_snapshots', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot',
    'goods_transit', 'transport_pallets', 'stock_differences', 'client_orders',
    'transport_orders', 'daily_turnover', 'report_recipients'].forEach(t => h.setData(t, []));
  return h;
}

async function board(h) {
  h.w.loadTodayDashboard();
  await ticks(); await ticks();
  return h.w.todayCache;
}
const compUrl = h => h.calls.get.filter(u =>
  u.indexOf('/task_completions') >= 0 && u.indexOf('recurring_task_id=in.') >= 0)[0];

(async function run() {

  /* ═══ 1. Наборът — РЕГРЕСИОННА секция, не пада срещу стария код ══════ */
  section('1. Прозоречната задача е в набора САМО в деня на срока');
  {
    /* Заковава поведение, което вече беше вярно: recurringIsDueToday()
       минава през recurringReportDueOnWeekday(). Тук е, за да не се загуби
       мълчаливо при следваща промяна по набора. */
    for (const [n, name, want] of [[0, 'понеделник', false], [1, 'вторник', false],
                                   [2, 'сряда (срокът)', true], [3, 'четвъртък', false]]) {
      const h = env({ at: n });
      const c = await board(h);
      const has = !!c && (c.items || []).some(i => i.title === WIN_TITLE);
      ok('в ' + name + ' задачата ' + (want ? 'Е' : 'НЕ Е') + ' на таблото', has === want,
        c ? JSON.stringify((c.items || []).map(i => i.title)) : 'няма кеш');
    }
  }

  section('1б. КОНТРОЛА: същата задача БЕЗ флага излиза и в трите дни');
  {
    /* Без нея секция 1 би минавала и ако задачата изобщо е спряла да се
       показва по някаква друга причина. */
    for (const [n, name] of [[0, 'понеделник'], [1, 'вторник'], [2, 'сряда']]) {
      const h = env({ at: n, recurring: [winTask({ due_window: false })] });
      const c = await board(h);
      ok('в ' + name + ' е на таблото', !!c && (c.items || []).some(i => i.title === WIN_TITLE),
        c ? JSON.stringify((c.items || []).map(i => i.title)) : 'няма кеш');
    }
  }

  /* ═══ 2. ЯДРОТО: отметка от кой да е ден от прозореца затваря ════════ */
  section('2. Сряда, отметка от ПОНЕДЕЛНИК → обектът е изпълнил');
  {
    const h = env({ at: 2, comps: [comp('Троян', MON)] });
    const c = await board(h);
    if (ok('таблото се напълни', !!c, String(c))) {
      const mine = (c.comps || []).filter(x => x.item_id === 'r-win');
      ok('отмятането се брои', mine.length === 1, JSON.stringify(c.comps));
      ok('и е на Троян', mine[0] && mine[0].store_name === 'Троян',
        mine[0] ? mine[0].store_name : 'няма');
    }
  }

  section('2б. Отметка от ВТОРНИК (среда на прозореца) също брои');
  {
    const h = env({ at: 2, comps: [comp('Ловеч', TUE)] });
    const c = await board(h);
    const mine = (c.comps || []).filter(x => x.item_id === 'r-win');
    ok('брои се', mine.length === 1, JSON.stringify(c.comps));
  }

  section('2в. Отметка в самия ден на срока — както преди');
  {
    const h = env({ at: 2, comps: [comp('Севлиево', WED)] });
    const c = await board(h);
    const mine = (c.comps || []).filter(x => x.item_id === 'r-win');
    ok('брои се', mine.length === 1, JSON.stringify(c.comps));
  }

  section('2г. Отметка ИЗВЪН прозореца (миналата седмица) НЕ брои');
  {
    const h = env({ at: 2, comps: [comp('Троян', isoAt(-5))] });
    const c = await board(h);
    const mine = (c.comps || []).filter(x => x.item_id === 'r-win');
    ok('не се брои', mine.length === 0, JSON.stringify(c.comps));
  }

  section('2д. Отложена (postponed) в прозореца НЕ брои за изпълнена');
  {
    const h = env({ at: 2, comps: [comp('Троян', MON, { status: 'postponed' })] });
    const c = await board(h);
    const mine = (c.comps || []).filter(x => x.item_id === 'r-win');
    ok('не се брои', mine.length === 0, JSON.stringify(c.comps));
  }

  section('2е. И трите обекта, отметнали в различни дни от прозореца → 3/3');
  {
    const h = env({
      at: 2,
      comps: [comp('Троян', MON), comp('Ловеч', TUE), comp('Севлиево', WED)],
    });
    const c = await board(h);
    const mine = (c.comps || []).filter(x => x.item_id === 'r-win');
    ok('три отмятания', mine.length === 3, JSON.stringify(mine.map(x => x.store_name)));
    ok('знаменателят е 3 обекта', (c.stores || []).length === 3, String((c.stores || []).length));
  }

  /* ═══ 3. Заявката ════════════════════════════════════════════════════ */
  section('3. Заявката покрива ЦЕЛИЯ прозорец, не само днес');
  {
    const h = env({ at: 2, comps: [comp('Троян', MON)] });
    await board(h);
    const u = compUrl(h);
    if (ok('има заявка за постоянните', !!u, h.calls.get.join('\n'))) {
      ok('долната граница е първият ден от прозореца (понеделник)',
        u.indexOf('completion_date=gte.' + MON) >= 0, u);
      ok('горната е днес (сряда)', u.indexOf('completion_date=lte.' + WED) >= 0, u);
      ok('не е изродена в eq.днес', u.indexOf('completion_date=eq.') < 0, u);
    }
  }

  section('3б. БЕЗ прозоречна задача обхватът се свива до днес');
  {
    /* Иначе „поправката" би значела всяка постоянна задача да тегли цяла
       седмица отмятания без причина. */
    const h = env({ at: 2, recurring: [winTask({ id: 'r-p', due_window: false, due_weekdays: [2], due_weekday: 2 })] });
    await board(h);
    const u = compUrl(h);
    if (ok('има заявка', !!u)) {
      ok('gte и lte сочат ДНЕС', u.indexOf('completion_date=gte.' + WED) >= 0
        && u.indexOf('completion_date=lte.' + WED) >= 0, u);
    }
  }

  section('3в. Обикновените задачи от бюлетина остават с eq.днес');
  {
    const h = env({ at: 2 });
    h.setData('bulletin_tasks', [{
      id: 't-1', bulletin_id: 'b-1', title: 'Опис', department: 'trade',
      due_date: WED, due_dates: null, task_type: 'info', target_stores: null,
      sort_order: 1, report_groups: null, linked_module: null,
    }]);
    await board(h);
    const u = h.calls.get.filter(x => x.indexOf('/task_completions') >= 0
      && x.indexOf('task_id=in.') >= 0 && x.indexOf('recurring_task_id') < 0)[0];
    if (ok('има заявка за обикновените', !!u, h.calls.get.join('\n'))) {
      ok('носи eq.<днес>', u.indexOf('completion_date=eq.' + WED) >= 0, u);
    }
  }

  /* ═══ 4. „Днес" и дневният отчет казват едно и също ══════════════════ */
  section('4. Таблото и collectDailyReportData дават еднакъв резултат');
  {
    /* Дневният отчет описва ВЧЕРА, затова часовникът е в четвъртък, а
       наборът и на двете пада върху сряда — деня на срока. */
    const comps = [comp('Троян', MON), comp('Ловеч', TUE)];

    const hR = env({ at: 3, comps: comps });
    const d = await new Promise(res => { hR.w.collectDailyReportData(res); });

    const hT = env({ at: 2, comps: comps });
    const c = await board(hT);

    if (ok('отчетът се събира', !!d, String(d)) && ok('таблото се напълни', !!c)) {
      const boardDone = (c.comps || []).filter(x => x.item_id === 'r-win').length;
      ok('отчетът за сряда: 2 от 3', d.totalDone === 2 && d.totalAll === 3,
        d.totalDone + '/' + d.totalAll);
      ok('таблото за сряда: същите 2 изпълнили', boardDone === 2, String(boardDone));
      ok('и същият знаменател', (c.stores || []).length === d.totalAll,
        (c.stores || []).length + ' vs ' + d.totalAll);
    }
  }

  report();
})();
