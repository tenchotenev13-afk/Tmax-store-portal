/* Чек лист — „Стока на път" само в седмицата със срока (checklist-store-gaps,
   етап Б, 23.11.2026; решения на Тенчо 23.11).

   Какво заковава файлът:
   1. Еталонът (checklist.js, checklistComputePortalValues): стойност има САМО
      в ISO седмицата с деня deadline_day — и когато той е събота или неделя;
      прагът е от weekly_checklist_metrics.deadline_day, не закован 10.
   2. да/не: всички входящи обработени → „да"; един необработен → „не"; без
      входящи → празно.
   3. Снимка (weekly_checklist_snapshots) → записаното в weekly_checklist, не
      живото от goods_transit.
   4. „Още рано" — само в седмицата със срока, до края на деня-срок, без снимка.
   5. „не" влиза в блока „Пропуски" (етап А) и в „Изисква становище".
   6. SQL (статично, със закотвени регекси — jsdom не пуска Postgres, а SQL
      тест, който пише, е забранен без отделно „давай"): checklist_freeze_week
      НЕ презаписва снимката (not exists в update И insert), паднал крон →
      'freeze-late'; checklist_portal_values връща записаното при снимка и NULL
      извън седмицата; кронът е с двата UTC часа и guard по София; rollback-ът
      връща функциите БАЙТ В БАЙТ към предишните миграции.

   МУТАЦИОННА ПРОВЕРКА (23.11.2026, ръчно, върху временно променени файлове;
   всяка събаря теста, после файлът е върнат):
     М1 checklistTransitValue: „да" при поне един обработен (done.length > 0);
     М2 без проверката за седмицата (checklistDeadlineDate винаги денят);
     М3 снимката се пренебрегва (винаги живо) в checklistModuleChanges;
     М4 „още рано" не гледа снимката;
     М5 SQL: checklist_freeze_week без not exists за снимката в update.

   Пускане:  node tests/checklist-transit-deadline.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;
const ROOT = process.argv[2] || path.join(__dirname, '..');

function metrics(dd) {
  return [
    { key: 'revizia_953', label: 'ревизия', sublabel: '', value_type: 'yes_no', sort_order: 1, active: true, source: 'manual', deadline_day: null },
    { key: 'stoka_na_pat', label: 'стока на път', sublabel: '', value_type: 'yes_no', sort_order: 2, active: true, source: 'module:transit', deadline_day: dd === undefined ? 10 : dd }
  ];
}
const USERS = [
  { store_name: 'Севлиево', email: 'manager.sevlievo@temax.bg', role: 'manager', active: true },
  { store_name: 'Сливен', email: 'manager.sliven@temax.bg', role: 'manager', active: true },
  { store_name: 'Враца', email: 'manager.vraca@temax.bg', role: 'manager', active: true },
  { store_name: 'Централен офис', email: 'co@temax.bg', role: 'admin', active: true }
];
const ADMIN = { id: 'u-1', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'admin', store_name: 'Централен офис' };
const AT = '2026-09-09T09:00:00Z';
function tr(store, status, extra) {
  return Object.assign({ store_name: store, direction: 'incoming', status: status, reviewed_at: null, recon_at: null }, extra || {});
}
/* Севлиево: един необработен → „не"; Сливен: всички обработени (вкл.
   проверен и „чака засечка") → „да"; Враца: само изходящи → празно. */
const TRANSIT = [
  tr('Севлиево', 'received'), tr('Севлиево', 'pending'),
  tr('Сливен', 'received'), tr('Сливен', 'pending', { reviewed_at: AT }), tr('Сливен', 'pending', { recon_at: AT }),
  { store_name: 'Враца', direction: 'outgoing', status: 'pending' }
];

function env(year, week, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: opts.metrics || metrics(),
      weekly_checklist: opts.rows || [],
      weekly_checklist_snapshots: opts.snaps || [],
      weekly_checklist_freezes: opts.frozen ? [{ year: year, week_number: week }] : [],
      weekly_checklist_sends: [], weekly_checklist_responses: [],
      recurring_tasks: [], task_completions: [],
      goods_transit: opts.transit || TRANSIT,
      rpc: opts.rpc || []
    }
  });
  h.w.checklistYear = year; h.w.checklistWeek = week;
  return h;
}
async function compute(h) {
  h.w.loadChecklist(); for (let i = 0; i < 4; i++) await ticks();
  h.vals = await h.w.checklistComputePortalValues();
  return h.vals;
}
function got(h, store) {
  const k = store + '|stoka_na_pat';
  return Object.prototype.hasOwnProperty.call(h.vals || {}, k) ? h.vals[k] : null;
}
function transitGets(h) { return h.calls.get.filter(function (u) { return /goods_transit/.test(u); }); }
function cell(h, store) {
  const t = h.doc.getElementById('checklist-table');
  const row = t && Array.prototype.slice.call(t.querySelectorAll('tbody tr')).filter(function (x) {
    const f = x.querySelector('td'); return f && f.textContent.trim() === store;
  })[0];
  return row ? row.querySelectorAll('td')[2] : null;
}
function fakeNow(h, y, mo, d, hh, mi) {
  const RealDate = h.w.Date;
  const fixed = new RealDate(y, mo, d, hh || 12, mi || 0, 0);
  function FakeDate() { if (arguments.length === 0) return new RealDate(fixed.getTime()); return new RealDate(...arguments); }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return fixed.getTime(); };
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  h.w.Date = FakeDate;
}

(async function () {

  section('1. Седмицата със срока и без');
  {
    const h = env(2026, 37);              /* 07.09–13.09, 10-ти е четвъртък */
    await compute(h);
    ok('седм. 37: Севлиево „не" (един необработен)', got(h, 'Севлиево') === 'ne', JSON.stringify(h.vals));
    ok('седм. 37: Сливен „да" (received + проверен + чака засечка)', got(h, 'Сливен') === 'da', JSON.stringify(h.vals));
    ok('седм. 37: Враца (без входящи) — празно', got(h, 'Враца') === null, JSON.stringify(h.vals));
    ok('няма „N/M" никъде', Object.keys(h.vals).every(function (k) { return !/\//.test(h.vals[k]); }), JSON.stringify(h.vals));
    h.close();
  }
  {
    const h = env(2026, 38);              /* 14.09–20.09 — без 10-ти */
    await compute(h);
    ok('седм. 38 (без срока): нито една стойност', got(h, 'Севлиево') === null && got(h, 'Сливен') === null, JSON.stringify(h.vals));
    ok('… и goods_transit изобщо не се тегли', transitGets(h).length === 0, transitGets(h).join(' | '));
    h.close();
  }
  {
    const h = env(2026, 36);              /* 31.08–06.09 — без 10-ти */
    await compute(h);
    ok('седм. 36: празно', got(h, 'Севлиево') === null, JSON.stringify(h.vals));
    h.close();
  }

  section('2. Срокът в събота и в неделя');
  {
    const h = env(2026, 41);              /* 05.10–11.10, 10.10 е събота */
    await compute(h);
    ok('седм. 41 (сб 10.10): има стойност', got(h, 'Севлиево') === 'ne' && got(h, 'Сливен') === 'da', JSON.stringify(h.vals));
    ok('checklistDeadlineDate → 2026-10-10', h.w.checklistDeadlineDate(metrics()[1], 2026, 41) === '2026-10-10');
    h.close();
  }
  {
    const h = env(2026, 19);              /* 04.05–10.05, 10.05 е неделя */
    await compute(h);
    ok('седм. 19 (нд 10.05): има стойност', got(h, 'Севлиево') === 'ne', JSON.stringify(h.vals));
    ok('седм. 20 (11.05–17.05): checklistDeadlineDate → null', h.w.checklistDeadlineDate(metrics()[1], 2026, 20) === null);
    h.close();
  }
  {
    /* Прагът е от deadline_day: 15 → седм. 38 (15.09), не 37. */
    const h = env(2026, 38, { metrics: metrics(15) });
    await compute(h);
    ok('deadline_day 15 → седм. 38 има стойност', got(h, 'Севлиево') === 'ne', JSON.stringify(h.vals));
    h.close();
    const h2 = env(2026, 37, { metrics: metrics(15) });
    await compute(h2);
    ok('deadline_day 15 → седм. 37 е празна', got(h2, 'Севлиево') === null, JSON.stringify(h2.vals));
    h2.close();
    const h3 = env(2026, 37, { metrics: metrics('10') });
    await compute(h3);
    ok('текстово „10" също се разбира', got(h3, 'Севлиево') === 'ne', JSON.stringify(h3.vals));
    h3.close();
  }

  section('3. Снимката: записаното, не живото');
  {
    const h = env(2026, 37, {
      snaps: [{ year: 2026, week_number: 37, metric_key: 'stoka_na_pat', taken_by: 'cron' }],
      rows: [
        { id: 1, year: 2026, week_number: 37, store_name: 'Севлиево', metric_key: 'stoka_na_pat', portal_value: 'da', control_value: null, control_num: null, comment: null },
        { id: 2, year: 2026, week_number: 37, store_name: 'Сливен', metric_key: 'stoka_na_pat', portal_value: null, control_value: null, control_num: null, comment: null }
      ]
    });
    await compute(h);
    ok('Севлиево „да" от снимката (живото би дало „не")', got(h, 'Севлиево') === 'da', JSON.stringify(h.vals));
    ok('Сливен празно от снимката (живото би дало „да")', got(h, 'Сливен') === null, JSON.stringify(h.vals));
    ok('при снимка goods_transit не се тегли', transitGets(h).length === 0, transitGets(h).join(' | '));
    h.close();
  }
  {
    /* Снимка за ДРУГА колона/седмица не важи. */
    const h = env(2026, 37, { snaps: [] });
    await compute(h);
    ok('без снимка → живо', got(h, 'Севлиево') === 'ne', JSON.stringify(h.vals));
    h.close();
  }

  section('4. „Още рано" в таба');
  {
    const h = env(2026, 37, { rpc: [{ store_name: 'Севлиево', metric_key: 'stoka_na_pat', value: 'ne' }] });
    fakeNow(h, 2026, 8, 10, 22, 0);       /* 10.09, 22:00 — преди снимката */
    h.w.loadChecklist(); for (let i = 0; i < 4; i++) await ticks();
    const v = cell(h, 'Севлиево') && cell(h, 'Севлиево').querySelector('.cl-val');
    ok('10.09 22:00: „не" е бледо, с cl-early', !!v && v.textContent.trim() === 'не' && /cl-early/.test(v.getAttribute('class') || ''),
       v ? v.outerHTML : 'няма');
    h.close();
  }
  {
    const h = env(2026, 37, { rpc: [{ store_name: 'Севлиево', metric_key: 'stoka_na_pat', value: 'ne' }],
      snaps: [{ year: 2026, week_number: 37, metric_key: 'stoka_na_pat', taken_by: 'cron' }] });
    fakeNow(h, 2026, 8, 10, 23, 59);       /* снимката вече я има */
    h.w.loadChecklist(); for (let i = 0; i < 4; i++) await ticks();
    const v = cell(h, 'Севлиево') && cell(h, 'Севлиево').querySelector('.cl-val');
    ok('след снимката — без cl-early', !!v && !/cl-early/.test(v.getAttribute('class') || ''), v ? v.outerHTML : 'няма');
    h.close();
  }
  {
    const h = env(2026, 37);
    fakeNow(h, 2026, 8, 11, 0, 5);
    h.w.loadChecklist(); for (let i = 0; i < 2; i++) await ticks();
    ok('11.09 00:05 (без снимка): вече не е рано', h.w.checklistIsEarly(metrics()[1], new h.w.Date()) === false);
    h.w.checklistWeek = 38;
    ok('седмица без срока: никога рано', h.w.checklistIsEarly(metrics()[1], new Date(2026, 8, 15)) === false);
    h.close();
  }

  section('5. „не" в блока „Пропуски" и в „Изисква становище"');
  {
    const h = env(2026, 37, { frozen: true, rows: [
      { id: 1, year: 2026, week_number: 37, store_name: 'Севлиево', metric_key: 'stoka_na_pat', portal_value: 'ne', control_value: null, control_num: null, comment: null },
      { id: 2, year: 2026, week_number: 37, store_name: 'Сливен', metric_key: 'stoka_na_pat', portal_value: 'da', control_value: null, control_num: null, comment: null }
    ] });
    h.w.loadChecklist(); for (let i = 0; i < 4; i++) await ticks();
    const mails = [];
    h.w.sendEmail = function (to, s, html) { mails.push({ to: to[0], html: html }); return Promise.resolve({ ok: true }); };
    h.doc.getElementById('cl-send-btn').click(); await ticks(); await ticks();
    h.doc.getElementById('cl-send-go').click(); for (let i = 0; i < 12; i++) await ticks();
    const sev = mails.filter(function (m) { return m.to === 'manager.sevlievo@temax.bg'; })[0];
    const sl = mails.filter(function (m) { return m.to === 'manager.sliven@temax.bg'; })[0];
    const text = function (html) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); };
    ok('Севлиево: „стока на път: не" в блока', sev && /Пропуски на Севлиево за седмица 37 стока на път\s*:\s*не/.test(text(sev.html)), sev ? text(sev.html).slice(0, 400) : 'няма');
    ok('Севлиево: в „Изисква становище"', sev && /Изисква становище.*Севлиево · стока на път/.test(text(sev.html)));
    ok('Сливен: „да" не е пропуск', sl && /Няма пропуски за седмицата/.test(sl.html));
    h.close();
  }

  section('6. SQL — статично (миграцията и rollback-ът)');
  {
    const rd = function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'); };
    const MIG = 'supabase/migrations/20261123120000_checklist_transit_deadline.sql';
    const sql = rd(MIG);
    const fnOf = function (src, name) {
      const a = src.indexOf('create or replace function public.' + name);
      if (a < 0) return '';
      const b = src.indexOf('$function$;', a);
      return src.slice(a, b);
    };
    const fr = fnOf(sql, 'checklist_freeze_week');
    const upd = fr.slice(fr.indexOf('update public.weekly_checklist w'), fr.indexOf('get diagnostics n_upd'));
    const ins = fr.slice(fr.indexOf('insert into public.weekly_checklist ('), fr.indexOf('get diagnostics n_ins'));
    const snapGuard = /not exists \(select 1 from public\.weekly_checklist_snapshots s\s+where s\.year = p_year and s\.week_number = p_week and s\.metric_key = x\.metric_key\)/;
    ok('freeze: update не пипа колона със снимка', snapGuard.test(upd), upd);
    ok('freeze: insert не пипа колона със снимка', snapGuard.test(ins), ins);
    ok('freeze: паднал крон → снимка \'freeze-late\'', /select p_year, p_week, k, 'freeze-late' from unnest\(v_late\)/.test(fr));
    const pv = fnOf(sql, 'checklist_portal_values');
    ok('portal_values: при снимка — записаното', /when a\.snapped\s+then sw\.portal_value/.test(pv));
    ok('portal_values: извън седмицата — NULL', /when a\.dl_date is null\s+then null/.test(pv));
    ok('portal_values: transit е да/не', /case when tr\.done = tr\.total then 'da' else 'ne' end/.test(pv));
    ok('portal_values: прагът е deadline_day (не 10)', /extract\(day from g\.d\)::int = m\.deadline_day/.test(pv) && !/= 10\b/.test(pv));
    ok('снимка: само след 23:00 в София', /if extract\(hour from v_now\) < 23 then/.test(fnOf(sql, 'checklist_snapshot_deadline')));
    ok('крон: 59 20,21 * * * + guard 23 ч. в София',
       /'checklist-transit-snapshot-2359',\s*'59 20,21 \* \* \*',[\s\S]*?extract\(hour from now\(\) at time zone 'Europe\/Sofia'\) = 23/.test(sql));
    ok('таблицата: само select за anon/authenticated',
       /revoke insert, update, delete, truncate on table public\.weekly_checklist_snapshots from anon, authenticated;/.test(sql));
    ok('snapshot функцията: без EXECUTE за anon/PUBLIC',
       /revoke all on function public\.checklist_snapshot_deadline\(text\) from public;/.test(sql));
    ok('огледалото в корена носи същото тяло', rd('weekly-checklist-transit-deadline-schema.sql').indexOf(sql.slice(sql.indexOf('create table'))) > 0);

    /* Rollback: функциите — байт в байт като в предишните миграции. */
    const body = function (src, name) {
      const f = fnOf(src, name);
      const a = f.indexOf('$function$');
      return a < 0 ? '' : f.slice(a);
    };
    const md5 = function (s) { return crypto.createHash('md5').update(s).digest('hex'); };
    const down = rd('supabase/migrations/20261123120000_checklist_transit_deadline_down.sql');
    const prevPv = rd('supabase/migrations/20261116120000_checklist_portal_values_task_type.sql');
    const prevFr = rd('supabase/migrations/20261026210000_weekly_checklist_freezes.sql');
    ok('rollback: checklist_portal_values = 20261116120000', body(down, 'checklist_portal_values') !== '' &&
       md5(body(down, 'checklist_portal_values')) === md5(body(prevPv, 'checklist_portal_values')));
    ok('rollback: checklist_freeze_week = 20261026210000', body(down, 'checklist_freeze_week') !== '' &&
       md5(body(down, 'checklist_freeze_week')) === md5(body(prevFr, 'checklist_freeze_week')));
    ok('rollback: кронът и таблицата се махат', /cron\.unschedule\('checklist-transit-snapshot-2359'\)/.test(down) &&
       /drop table if exists public\.weekly_checklist_snapshots;/.test(down));

    /* Data миграцията: 108 клетки, само извън седмиците със срока. */
    const data = rd('supabase/migrations/20261123120100_checklist_transit_history_data.sql');
    const vals = data.match(/^\s+\((\d+), '/gm) || [];
    const weeks = {};
    vals.forEach(function (v) { const w = /\((\d+)/.exec(v)[1]; weeks[w] = (weeks[w] || 0) + 1; });
    ok('data: 108 реда', vals.length === 108, String(vals.length));
    ok('data: само 40, 42, 43, 44, 45, 47 — по 18', JSON.stringify(weeks) === JSON.stringify({ 40: 18, 42: 18, 43: 18, 44: 18, 45: 18, 47: 18 }), JSON.stringify(weeks));
    ok('data: 41 и 46 НЕ се пипат', !/\((41|46), '/.test(data));
    ok('data: само без ръчна стойност и при точно записаната', /and w\.portal_value = o\.portal_value\s+and w\.control_value is null and w\.control_num is null;/.test(data));
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
