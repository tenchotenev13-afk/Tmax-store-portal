/* Отчет по задача — секция „Зареждане" (send-routed-report v10, 19.09.2026).

   Задача с bulletin_tasks.linked_module='supply' получава под картичката
   обобщение на бланките от Транспорт › Зареждане за седмицата на бюлетина:
   „Попълнили N от M", „Без данни: …", таблица артикул | „Обект N · Обект M"
   (при col2_label „N/M" с легенда), „Общо". Задача без linked_module='supply'
   — нищо ново, дори не се четат supply_* таблиците. Провал на заявка →
   червен ред, картичката за отметките остава (правило 13).

   Как: реже се РЕАЛНИЯТ index.ts преди Deno.serve (както в
   task-report-responder.test.js), внася се в Node; fetch е мини-PostgREST.

   Пускане: node tests/task-report-supply.test.js . */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const ROUTED = path.join(ROOT, 'supabase/functions/send-routed-report/index.ts');

/* Същото рязане като в task-report-responder.test.js (.mjs път с изрязване
   на типовете) — ако новият код не минава през него, и там би паднал. */
function slice(file, exportsList) {
  let s = fs.readFileSync(file, 'utf8');
  s = s.slice(0, s.indexOf('Deno.serve('));
  s = s.split(/\r?\n/).filter(l => !/^import\s/.test(l)).join('\n')
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  s = s.replace(/:\s*Record<[^>]*>/g, '')
    .replace(/:\s*\{ skips: any\[\] \| null \}/g, '')
    .replace(/:\s*(string|number|any)\[\]/g, '')
    .replace(/\((\w+)\?:\s*(string|number|any)\)/g, '($1)')
    .replace(/(\w)\?:\s*(string|number|any)\b/g, '$1')
    .replace(/:\s*(string|number|boolean|any)\b/g, '')
    .replace(/\bq\?/g, 'q');
  s += '\nexport { ' + exportsList.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-task-report-supply');
  fs.mkdirSync(dir, { recursive: true });
  const h = require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);
  const out = path.join(dir, 'routed-' + h + '.mjs');
  fs.writeFileSync(out, s);
  return out;
}

const WK = { week_number: 38, year: 2026 };   /* 14.09–20.09.2026 */
const MON = '2026-09-14';
function db(over) {
  return Object.assign({
    notification_topics: [{ key: 'weekly_routed', active: true, test_email: null }],
    bulletin_tasks: [
      { id: 't-sup', bulletin_id: 'b-pub', title: 'ЗАРЕЖДАНЕ', target_stores: null, due_date: '2026-09-18', due_dates: ['2026-09-18'], linked_module: 'supply', task_type: 'check' },
      { id: 't-plain', bulletin_id: 'b-pub', title: 'Витрина', target_stores: ['Троян', 'Ловеч'], due_date: '2026-09-18', due_dates: ['2026-09-18'], linked_module: null, task_type: 'comment' }
    ],
    bulletins: [Object.assign({ id: 'b-pub', status: 'published' }, WK)],
    task_completions: [
      { id: 'c1', task_id: 't-sup', store_name: 'Троян', status: 'done', completion_date: '2026-09-18', comment: 'Попълнено', photos: null, files: null },
      { id: 'c2', task_id: 't-plain', store_name: 'Троян', status: 'done', completion_date: '2026-09-18', comment: 'Готово', photos: null, files: null }
    ],
    users: [
      { id: 'u-zh', email: 'j.jeliazkov@temax.bg', display_name: 'Жеко Желязков', notify_groups: ['co'], active: true, store_name: 'Централен офис' },
      { id: 'u-tr', email: 'tr@temax.bg', display_name: 'Троян', notify_groups: [], active: true, store_name: 'Троян' },
      { id: 'u-lo', email: 'lo@temax.bg', display_name: 'Ловеч', notify_groups: [], active: true, store_name: 'Ловеч' }
    ],
    supply_templates: [
      { id: 'tpl-col', name: 'Колоранти', slug: 'colorants', col1_label: 'Брой за поръчка', col2_label: null, target_stores: ['Троян'], active: false, sort_order: 0 },
      { id: 'tpl-floor', name: 'Подови настилки (линейни метри)', slug: 'floor-lm', col1_label: 'Места в зала', col2_label: 'За поръчка', target_stores: null, active: true, sort_order: 1 },
      { id: 'tpl-cab', name: 'Кабели на макара', slug: 'cables-reels', col1_label: 'Налична макара', col2_label: null, target_stores: null, active: true, sort_order: 2 }
    ],
    supply_template_items: [
      { id: 'col-1', template_id: 'tpl-col', sap_code: '39801', name: 'КОЛОРАНТ WB1', active: true, sort_order: 1 },
      { id: 'f-1', template_id: 'tpl-floor', sap_code: null, name: 'Балатум 4м.', active: true, sort_order: 1 },
      { id: 'f-2', template_id: 'tpl-floor', sap_code: null, name: 'Балатум 3м.', active: true, sort_order: 2 },
      { id: 'c-1', template_id: 'tpl-cab', sap_code: '23237', name: 'ПВВ-МБ1 2X1', active: true, sort_order: 1 },
      { id: 'c-2', template_id: 'tpl-cab', sap_code: '23238', name: 'ПВВ-МБ1 2X1.5', active: true, sort_order: 2 },
      { id: 'c-off', template_id: 'tpl-cab', sap_code: '99999', name: 'ИЗВАДЕН', active: false, sort_order: 3 }
    ],
    supply_entries: [
      { id: 'e1', template_id: 'tpl-cab', item_id: 'c-1', store_name: 'Ловеч', week_start: MON, qty1: 3, qty2: null },
      { id: 'e2', template_id: 'tpl-cab', item_id: 'c-1', store_name: 'Троян', week_start: MON, qty1: 1, qty2: null },
      { id: 'e3', template_id: 'tpl-floor', item_id: 'f-1', store_name: 'Ловеч', week_start: MON, qty1: 3, qty2: 1 },
      { id: 'e4', template_id: 'tpl-floor', item_id: 'f-2', store_name: 'Ловеч', week_start: MON, qty1: null, qty2: null },
      /* извън седмицата, неотчитащ се обект и неактивна бланка — не влизат */
      { id: 'e5', template_id: 'tpl-cab', item_id: 'c-2', store_name: 'Ловеч', week_start: '2026-09-07', qty1: 50, qty2: null },
      { id: 'e6', template_id: 'tpl-cab', item_id: 'c-2', store_name: 'Централен офис', week_start: MON, qty1: 70, qty2: null },
      { id: 'e7', template_id: 'tpl-col', item_id: 'col-1', store_name: 'Троян', week_start: MON, qty1: 9, qty2: null }
    ]
  }, over || {});
}
/* Мини-PostgREST: eq / in / gte / lte / is.null / not.is.null; limit/offset
   се прилагат (за страницирането). fail(table) → 500 за тази таблица. */
function pgFetch(data, log, fail) {
  return function (url, init) {
    init = init || {};
    const u = new URL(url, 'http://x');
    const method = (init.method || 'GET').toUpperCase();
    if (u.pathname.indexOf('/functions/v1/resend-email') >= 0) {
      log.mail.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    }
    const table = u.pathname.split('/').pop();
    log.get.push(table + '?' + decodeURIComponent(u.search.slice(1)));
    if (fail && fail(table)) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) });
    if (method !== 'GET') return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) });
    let rows = (data[table] || []).slice();
    let limit = null, offset = 0;
    u.searchParams.forEach((v, k) => {
      if (k === 'limit') { limit = Number(v); return; }
      if (k === 'offset') { offset = Number(v); return; }
      if (['select', 'order'].indexOf(k) >= 0) return;
      const val = x => String(x == null ? '' : x);
      if (v.indexOf('eq.') === 0) rows = rows.filter(r => val(r[k]) === v.slice(3));
      else if (v.indexOf('in.(') === 0) { const set = v.slice(4, -1).split(','); rows = rows.filter(r => set.indexOf(val(r[k])) >= 0); }
      else if (v.indexOf('gte.') === 0) rows = rows.filter(r => r[k] != null && val(r[k]) >= v.slice(4));
      else if (v.indexOf('lte.') === 0) rows = rows.filter(r => r[k] != null && val(r[k]) <= v.slice(4));
      else if (v === 'not.is.null') rows = rows.filter(r => r[k] != null);
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    });
    rows = rows.slice(offset, limit == null ? undefined : offset + limit);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
  };
}
function quiet(fn) {
  const w = console.warn, e = console.error, got = [];
  console.warn = function () { got.push(Array.prototype.join.call(arguments, ' ')); };
  console.error = function () { got.push(Array.prototype.join.call(arguments, ' ')); };
  return Promise.resolve().then(fn).then(r => { console.warn = w; console.error = e; return { r, got }; },
    x => { console.warn = w; console.error = e; throw x; });
}
/* Текстът на HTML-а без таговете — за проверки по видимото съдържание. */
const text = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

(async function () {
  let T = null;
  section('0. Реалният код се зарежда');
  {
    let f = null;
    guard('routed се реже', () => { f = slice(ROUTED, ['routedTaskReportResponse', 'collectSupplyReport', 'supplyReportSectionHtml', 'supplyReportSummary', 'SUPPLY_PAGE']); });
    try { T = await import(pathToFileURL(f).href); } catch (e) { ok('routed се внася', false, e && e.message); }
    if (!ok('модулът е зареден', !!T)) { report(); return; }
  }

  const run = async (taskId, over, opts) => {
    opts = opts || {};
    const log = { get: [], mail: [] };
    globalThis.fetch = pgFetch(db(over), log, opts.fail);
    const body = { task_id: taskId, recipients: { groups: ['co'], user_ids: [] }, run_date: '2026-09-19', run_time: '18:00' };
    const { r, got } = await quiet(() => T.routedTaskReportResponse(body, !!opts.dry, opts.testEmail || null));
    const j = await r.json();
    return { j, log, logs: got, html: (log.mail[0] || {}).html || '' };
  };

  section('1. linked_module=supply → секцията е под картичката');
  {
    const a = await run('t-sup');
    const t = text(a.html);
    ok('едно писмо', a.log.mail.length === 1 && a.j.sent === 1, JSON.stringify(a.j));
    ok('картичката е там („1 от 2 обекта изпълнили")', t.indexOf('1 от 2 обекта изпълнили') >= 0);
    ok('секцията „🎨 Зареждане — седмица от 14.09.2026"', t.indexOf('🎨 Зареждане — седмица от 14.09.2026') >= 0, (t.match(/🎨 Зареждане[^А-Я]{0,40}/) || [''])[0]);
    ok('секцията е СЛЕД картичката', a.html.indexOf('обекта изпълнили') < a.html.indexOf('🎨 Зареждане'));
    ok('записите са за понеделника на бюлетина (wkDates[0])',
      a.log.get.some(g => /^supply_entries\?week_start=eq\.2026-09-14&template_id=in\.\(tpl-floor,tpl-cab\)/.test(g)), a.log.get.filter(g => /supply/.test(g)).join(' | '));
    ok('записите се теглят на страници (limit=1000&offset=0)', a.log.get.some(g => /^supply_entries\?.*order=id\.asc&limit=1000&offset=0/.test(g)));
    ok('неактивната бланка (Колоранти) я няма', t.indexOf('Колоранти') < 0 && t.indexOf('КОЛОРАНТ') < 0);
    ok('бланките по sort_order: Подови настилки преди Кабели', a.html.indexOf('Подови настилки') >= 0 && a.html.indexOf('Подови настилки') < a.html.indexOf('Кабели на макара'));
    ok('линк към портала с текста „Пълна матрица и Excel → Портал › Транспорт › Зареждане"',
      /<a href="https:\/\/tenchotenev13-afk\.github\.io\/Tmax-store-portal\/"[^>]*>Пълна матрица и Excel → Портал › Транспорт › Зареждане<\/a>/.test(a.html));
    ok('без картинки в секцията', a.html.slice(a.html.indexOf('🎨 Зареждане')).indexOf('<img') < 0);
    ok('таблица с border-collapse', /<table style="[^"]*border-collapse:collapse/.test(a.html.slice(a.html.indexOf('🎨 Зареждане'))));
  }

  section('2. Кабели (една колона): стойности, САП, Общо, само редове със стойност');
  {
    const a = await run('t-sup');
    const cab = a.html.slice(a.html.indexOf('Кабели на макара'), a.html.indexOf('Пълна матрица'));
    const t = text(cab);
    ok('„Попълнили 2 от 2" (Ловеч и Троян; ЦО не се брои)', t.indexOf('Попълнили 2 от 2') >= 0, t.slice(0, 120));
    ok('без ред „Без данни" (всички са попълнили)', t.indexOf('Без данни') < 0);
    ok('ред с САП + име: „23237 ПВВ-МБ1 2X1"', t.indexOf('23237 ПВВ-МБ1 2X1') >= 0);
    ok('стойности „Ловеч 3 · Троян 1" (азбучно)', t.indexOf('Ловеч 3 · Троян 1') >= 0, t);
    ok('„Общо: 4"', t.indexOf('Общо: 4') >= 0);
    ok('ред без стойност за седмицата (23238 — има само от миналата седмица и от ЦО) го няма', t.indexOf('23238') < 0);
    ok('неактивният артикул го няма', t.indexOf('ИЗВАДЕН') < 0);
    ok('без легенда (няма col2)', t.indexOf('Налична макара /') < 0);
  }

  section('3. Подови настилки (col2): „3/1", легенда, „Без данни", Общо „X / Y", без САП');
  {
    const a = await run('t-sup');
    const fl = a.html.slice(a.html.indexOf('Подови настилки'), a.html.indexOf('Кабели на макара'));
    const t = text(fl);
    ok('„Попълнили 1 от 2"', t.indexOf('Попълнили 1 от 2') >= 0, t.slice(0, 160));
    ok('обектът без записи е в „Без данни: Троян"', t.indexOf('Без данни: Троян') >= 0);
    ok('легенда „Места в зала / За поръчка" над таблицата', t.indexOf('Места в зала / За поръчка') >= 0 && fl.indexOf('Места в зала / За поръчка') < fl.indexOf('<table'));
    ok('„Ловеч 3/1"', t.indexOf('Ловеч 3/1') >= 0, t);
    ok('„Общо: 3 / 1"', t.indexOf('Общо: 3 / 1') >= 0);
    ok('без САП пред името (Балатум 4м. е първото в клетката)', /<td[^>]*>Балатум 4м\.<\/td>/.test(fl), (fl.match(/<td[^>]*>[^<]*Балатум 4м\.[^<]*<\/td>/) || [''])[0]);
    ok('ред само с празни стойности (Балатум 3м.) го няма', t.indexOf('Балатум 3м.') < 0);
  }

  section('4. col2 с празна първа стойност: „—/5"; бланка без записи → „Няма попълнени данни"');
  {
    const over = db();
    over.supply_entries = [{ id: 'x', template_id: 'tpl-floor', item_id: 'f-1', store_name: 'Троян', week_start: MON, qty1: null, qty2: 5 }];
    const a = await run('t-sup', over);
    const t = text(a.html);
    ok('„Троян —/5"', t.indexOf('Троян —/5') >= 0, t);
    ok('„Общо: — / 5"', t.indexOf('Общо: — / 5') >= 0);
    const cab = text(a.html.slice(a.html.indexOf('Кабели на макара'), a.html.indexOf('Пълна матрица')));
    ok('Кабели без нито един запис: „Няма попълнени данни за седмицата"', cab.indexOf('Няма попълнени данни за седмицата') >= 0, cab);
    ok('и „Попълнили 0 от 2", „Без данни: Ловеч, Троян"', cab.indexOf('Попълнили 0 от 2') >= 0 && cab.indexOf('Без данни: Ловеч, Троян') >= 0, cab);
    ok('без таблица и „Общо" за Кабели', cab.indexOf('Общо:') < 0);
  }

  section('5. M = target_stores ∩ отчитащите се обекти');
  {
    const over = db();
    over.supply_templates = [Object.assign({}, over.supply_templates[2], { target_stores: ['Троян', 'Шумен', 'Централен офис'] })];
    const a = await run('t-sup', over);
    const t = text(a.html);
    ok('„Попълнили 1 от 1" (Шумен и ЦО нямат акаунт-обект / не се отчитат)', t.indexOf('Попълнили 1 от 1') >= 0, t);
    ok('стойността на Ловеч (извън target_stores) не влиза', t.indexOf('Ловеч 3') < 0 && t.indexOf('Троян 1') >= 0 && t.indexOf('Общо: 1') >= 0, t);
  }

  section('6. Задача без linked_module=supply → нищо ново');
  {
    const a = await run('t-plain');
    ok('едно писмо с картичката', a.log.mail.length === 1 && text(a.html).indexOf('Витрина') >= 0);
    ok('няма секция „Зареждане"', a.html.indexOf('🎨 Зареждане') < 0 && a.html.indexOf('Пълна матрица') < 0);
    ok('не се чете нито една supply_* таблица', !a.log.get.some(g => /^supply_/.test(g)), a.log.get.join(' | '));
    const d = await run('t-plain', null, { dry: true });
    ok('dry_run: supply = null', d.j.dry_run === true && d.j.supply === null, JSON.stringify(d.j.supply));
  }

  section('7. Провал на supply_entries → червен ред, картичката остава');
  {
    const a = await run('t-sup', null, { fail: t => t === 'supply_entries' });
    const t = text(a.html);
    ok('писмото е тръгнало', a.log.mail.length === 1 && a.j.sent === 1, JSON.stringify(a.j));
    ok('картичката е там', t.indexOf('ЗАРЕЖДАНЕ') >= 0 && t.indexOf('1 от 2 обекта изпълнили') >= 0);
    ok('„Данните за Зареждане не можаха да се заредят"', t.indexOf('Данните за Зареждане не можаха да се заредят') >= 0);
    ok('редът е червен', /<div style="[^"]*color:#B91C1C[^"]*">Данните за Зареждане не можаха да се заредят<\/div>/.test(a.html));
    ok('НЕ лъже: няма „Попълнили", „Без данни" или „Няма попълнени данни"', t.indexOf('Попълнили') < 0 && t.indexOf('Без данни') < 0 && t.indexOf('Няма попълнени') < 0);
    ok('провалът е в лога на функцията', a.logs.some(x => /Зареждане/.test(x) && /boom/.test(x)), a.logs.join(' | '));
    const b = await run('t-sup', null, { fail: t => t === 'supply_templates' });
    ok('провал на supply_templates → същият червен ред', text(b.html).indexOf('Данните за Зареждане не можаха да се заредят') >= 0 && b.log.mail.length === 1);
    const c = await run('t-sup', null, { fail: t => t === 'supply_template_items' });
    ok('провал на supply_template_items → същият червен ред', text(c.html).indexOf('Данните за Зареждане не можаха да се заредят') >= 0);
    const d = await run('t-sup', null, { fail: t => t === 'supply_entries', dry: true });
    ok('dry_run при провал: supply.ok=false с причината', d.j.supply && d.j.supply.ok === false && /boom/.test(d.j.supply.error || ''), JSON.stringify(d.j.supply));
  }

  section('8. Над 1000 записа: втората страница влиза');
  {
    const over = db();
    const many = [];
    for (let i = 0; i < 1000; i++) many.push({ id: 'p' + String(i).padStart(4, '0'), template_id: 'tpl-cab', item_id: 'c-2', store_name: 'Ловеч', week_start: MON, qty1: null, qty2: null });
    many.push({ id: 'z-last', template_id: 'tpl-cab', item_id: 'c-2', store_name: 'Троян', week_start: MON, qty1: 7, qty2: null });
    over.supply_entries = many;
    const a = await run('t-sup', over);
    ok('има заявка с offset=1000', a.log.get.some(g => /^supply_entries\?.*offset=1000/.test(g)), a.log.get.filter(g => /supply_entries/.test(g)).join(' | '));
    ok('записът от втората страница е в писмото („Троян 7")', text(a.html).indexOf('Троян 7') >= 0);
  }

  section('9. dry_run носи резюме на секцията');
  {
    const d = await run('t-sup', null, { dry: true });
    ok('без писма', d.log.mail.length === 0 && d.j.dry_run === true);
    const s = d.j.supply || {};
    ok('supply.ok, седмица 2026-09-14', s.ok === true && s.week === MON, JSON.stringify(s));
    const names = (s.templates || []).map(x => x.name + ':' + x.filled + '/' + x.of + ':' + x.rows).join(' | ');
    ok('Подови 1/2 с 1 ред, Кабели 2/2 с 1 ред', names === 'Подови настилки (линейни метри):1/2:1 | Кабели на макара:2/2:1', names);
    ok('missing за Подови = [Троян]', JSON.stringify(((s.templates || [])[0] || {}).missing) === '["Троян"]');
  }

  section('10. Шапката на файла и точката на включване (закотвено)');
  {
    const src = fs.readFileSync(ROUTED, 'utf8');
    const head = src.slice(0, src.indexOf('*/'));
    ok('v10 е първият запис в шапката, преди v8', /v10 \(19\.09\.2026\)/.test(head) && head.indexOf('v10 (') < head.indexOf('v8 ('));
    const fn = src.slice(src.indexOf('async function routedTaskReportResponse'), src.indexOf('function routedEmptyGroups'));
    ok('условието е t.linked_module === \'supply\'', /t\.linked_module === 'supply' \? await collectSupplyReport\(t\.weekFrom, data\.stores\) : null/.test(fn));
    ok('секцията е залепена СЛЕД personalizedSectionHtml', /personalizedSectionHtml\(\[t\], data\.comps, data\.stores\) \+\s*\(supplyRep \? supplyReportSectionHtml\(supplyRep\) : ''\)/.test(fn));
    const serve = src.slice(src.indexOf('Deno.serve('));
    ok('седмичният режим не вика секцията', serve.indexOf('supplyReport') < 0 && serve.indexOf('collectSupplyReport') < 0);
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
