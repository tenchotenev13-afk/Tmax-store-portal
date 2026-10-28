/* Чек лист — писмото до обектите: само колоните със стойност, оцветяване,
   бутон към портала (28.10.2026, сесия checklist-email-design; Тенчо 28.10
   след тестовото писмо за седмица 43, Теодор 26.10 — „оцветен чек лист").

   Какво заковава файлът:
   1. колоните: в мрежата — само показателите с поне една непразна клетка
      (правилото на checklistEmailCellValue); колоната се връща, щом има една
      стойност; нула → сив ред „Няма отметки за седмицата", без мрежа;
   2. цветовете (inline background): „да" #bbf7d0, „не" #fecaca, „не" 3+
      поредна седмица (checklistNoStreak) #dc2626 с бял текст; брой (3/5) и
      „нямат" — без фон; легенда с трите квадратчета; нула class= и <style>;
   3. бутонът „Напиши становище в портала →" — само при „не", линкът е
      ?tab=checklist&y=<година>&w=<седмица>;
   4. истински старт (startApp) с ?tab=checklist&y=2026&w=43 → табът „Чек
      лист" на седмица 43 (admin, manager); без таба (kasa) или невалиден
      параметър → обичайният старт; регионален accounting — след
      rolesLoadRegional; accounting без регион — нищо.

   Мутационна проверка (28.10.2026) — всеки вариант пуснат и паднал:
     E1 тъмночервеното от 2 седмици подред (streak >= 2)        → пада 2
     E2 без филтъра на колоните (всички показатели)             → пада 1
     E3 бройката с фон (зелен като „да")                        → пада 2
     E4 линкът с година и седмица разменени                     → пада 3
     E5 checklistDeepLinkBoot без проверката canSeeChecklist()  → пада 4
     E6 rolesLoadRegional без checklistDeepLinkAfterRegional    → пада 4
   Пускане:  node tests/checklist-email-design.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, guard } = H;

const YEAR = 2026, WEEK = 43;
const M = [
  { key: 'revizia_953',    label: 'ревизия',          sublabel: '', value_type: 'yes_no',      sort_order: 1, active: true, source: 'manual' },
  { key: 'spravka_minusi', label: 'справка минуси',   sublabel: '', value_type: 'yes_no',      sort_order: 2, active: true, source: 'manual' },
  { key: 'razhodi',        label: 'разходи',          sublabel: '', value_type: 'yes_no',      sort_order: 3, active: true, source: 'manual' },
  { key: 'preocenka',      label: 'преоценка',        sublabel: '', value_type: 'yes_no_none', sort_order: 4, active: true, source: 'manual' },
  { key: 'dogovoreni',     label: 'Договорени ретури', sublabel: '', value_type: 'yes_no',     sort_order: 5, active: true, source: 'manual' }
];
const STORES = ['Враца', 'Габрово', 'Шумен'];
const ADMIN = { id: 'u-1', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'admin', store_name: 'Централен офис' };

function cl(store, key, f, week) {
  return Object.assign({ year: YEAR, week_number: week || WEEK, store_name: store, metric_key: key,
    portal_value: null, control_value: null, control_num: null, comment: null }, f || {});
}
/* Седмица 43: Враца — ревизия „да", справка „3/5"; Габрово — ревизия „не"
   (1-ва), преоценка „нямат"; Шумен — ревизия „не" (3-та подред: 41, 42, 43).
   разходи и Договорени ретури — празни за всички. */
const CUR = [
  cl('Враца', 'revizia_953', { portal_value: 'da' }),
  cl('Враца', 'spravka_minusi', { portal_value: '3/5' }),
  cl('Габрово', 'revizia_953', { control_value: 'ne' }),
  cl('Габрово', 'preocenka', { control_value: 'nyamat' }),
  cl('Шумен', 'revizia_953', { control_value: 'ne' }),
  cl('Шумен', 'razhodi', { comment: 'само коментар, без стойност' })
];
const HIST = [
  cl('Шумен', 'revizia_953', { control_value: 'ne' }, 42),
  cl('Шумен', 'revizia_953', { portal_value: 'ne' }, 41),
  cl('Габрово', 'revizia_953', { portal_value: 'da' }, 42)
];

function env(user, opts) {
  opts = opts || {};
  return boot({
    modules: ['bulletin.js', 'checklist.js', 'notifications.js', 'revaluation.js', 'revisions.js'],
    /* Копие — rolesLoadRegional пише is_regional / assigned_stores в currentUser,
       а един и същ обект в два старта би пренесъл регионалността. */
    user: Object.assign({}, user),
    data: Object.assign({
      users: url => url.indexOf('id=eq.') >= 0 ? [{ is_regional: !!opts.regional, assigned_stores: opts.regional ? ['Шумен'] : [] }]
        : STORES.concat(['Централен офис']).map(s => ({ store_name: s })),
      weekly_checklist_metrics: M, weekly_checklist: [], weekly_checklist_freezes: [], weekly_checklist_sends: [],
      weekly_checklist_responses: [], rpc: [],
      app_settings: [], transport_orders: [], client_orders: [], docs: [], revaluation_campaigns: [], revision_schedule: [], stores: []
    }, opts.data || {})
  });
}
function parse(h, html) { return new h.w.DOMParser().parseFromString(html, 'text/html'); }
function grid(d) {
  return Array.prototype.slice.call(d.querySelectorAll('table')).filter(t => t.querySelector('thead'))[0] || null;
}
function heads(d) { const g = grid(d); return g ? Array.prototype.slice.call(g.querySelectorAll('thead th')).map(th => th.textContent.trim()) : []; }
function cell(d, store, label) {
  const g = grid(d); if (!g) return null;
  const i = heads(d).indexOf(label); if (i < 0) return null;
  const tr = Array.prototype.slice.call(g.querySelectorAll('tbody tr')).filter(r => r.querySelector('td').textContent.trim() === store)[0];
  return tr ? tr.querySelectorAll('td')[i] : null;
}
const st = td => (td && td.getAttribute('style')) || '';

(async function () {

  section('1. Само колоните със стойност');
  {
    const h = env(ADMIN);
    const html = h.w.checklistEmailHtml(YEAR, WEEK, 1, CUR, M, STORES, null, { history: HIST, prevResponses: [] });
    const d = parse(h, html);
    ok('колоните: Обект, ревизия, справка минуси, преоценка', heads(d).join('|') === 'Обект|ревизия|справка минуси|преоценка', heads(d).join('|'));
    ok('„разходи" (само коментар, без стойност) и „Договорени ретури" — отпадат', heads(d).indexOf('разходи') < 0 && heads(d).indexOf('Договорени ретури') < 0);
    ok('коментарът на празната колона пак е в „Коментари"', html.indexOf('само коментар, без стойност') >= 0);
    const plus = CUR.concat([cl('Габрово', 'dogovoreni', { control_value: 'da' })]);
    const d2 = parse(h, h.w.checklistEmailHtml(YEAR, WEEK, 1, plus, M, STORES, null, { history: HIST }));
    ok('една стойност в „Договорени ретури" → колоната се връща', heads(d2).indexOf('Договорени ретури') >= 0, heads(d2).join('|'));
    const d3 = parse(h, h.w.checklistEmailHtml(YEAR, WEEK, 1, [cl('Шумен', 'razhodi', { comment: 'x' })], M, STORES, null, {}));
    ok('нула стойности → без мрежа', !grid(d3));
    ok('… и сив ред „Няма отметки за седмицата"', d3.body.textContent.indexOf('Няма отметки за седмицата') >= 0);
    ok('… без легендата на цветовете', d3.body.textContent.indexOf('3 или повече седмици подред') < 0);
    h.close();
  }

  section('2. Цветовете — inline background');
  {
    const h = env(ADMIN);
    const html = h.w.checklistEmailHtml(YEAR, WEEK, 1, CUR, M, STORES, null, { history: HIST, prevResponses: [] });
    const d = parse(h, html);
    ok('„да" → #bbf7d0', /background:#bbf7d0/.test(st(cell(d, 'Враца', 'ревизия'))), st(cell(d, 'Враца', 'ревизия')));
    ok('„не" (1-ва седмица) → #fecaca', /background:#fecaca/.test(st(cell(d, 'Габрово', 'ревизия'))), st(cell(d, 'Габрово', 'ревизия')));
    ok('„не" 3-та седмица подред → #dc2626 и бял текст', /background:#dc2626/.test(st(cell(d, 'Шумен', 'ревизия'))) && /color:#fff/.test(st(cell(d, 'Шумен', 'ревизия'))), st(cell(d, 'Шумен', 'ревизия')));
    ok('брой „3/5" → без фон', cell(d, 'Враца', 'справка минуси').textContent === '3/5' && !/background/.test(st(cell(d, 'Враца', 'справка минуси'))), st(cell(d, 'Враца', 'справка минуси')));
    ok('„нямат" → без фон', cell(d, 'Габрово', 'преоценка').textContent === 'нямат' && !/background/.test(st(cell(d, 'Габрово', 'преоценка'))));
    ok('празна клетка → без фон', !/background/.test(st(cell(d, 'Габрово', 'справка минуси'))));
    const hist2 = HIST.filter(r => r.week_number !== 41);
    const d2 = parse(h, h.w.checklistEmailHtml(YEAR, WEEK, 1, CUR, M, STORES, null, { history: hist2 }));
    ok('2-ра седмица подред → още светлочервено', /background:#fecaca/.test(st(cell(d2, 'Шумен', 'ревизия'))), st(cell(d2, 'Шумен', 'ревизия')));
    const legend = ['#bbf7d0', '#fecaca', '#dc2626'].every(c => html.indexOf('background:' + c + ';border:1px solid #cbd5e1') >= 0);
    ok('легенда: трите квадратчета', legend && html.indexOf('„не“ 3 или повече седмици подред') >= 0);
    ok('нула class=', !/\sclass=/.test(html));
    ok('нула <style>', !/<style/i.test(html));
    h.close();
  }

  section('3. Бутонът „Напиши становище в портала →"');
  {
    const h = env(ADMIN);
    const html = h.w.checklistEmailHtml(YEAR, WEEK, 1, CUR, M, STORES, null, { history: HIST });
    const a = html.match(/<a [^>]*>[^<]*<\/a>/g) || [];
    ok('има го при „не" — точно един', a.length === 1 && a[0].indexOf('Напиши становище в портала →') >= 0, a.join(' '));
    ok('линкът: ?tab=checklist&y=2026&w=43', a[0] && a[0].indexOf('href="https://tenchotenev13-afk.github.io/Tmax-store-portal/?tab=checklist&amp;y=2026&amp;w=43"') >= 0, a[0]);
    ok('бутонът е под „Изисква становище"', html.indexOf('Изисква становище') < html.indexOf('Напиши становище в портала'));
    const noNe = CUR.filter(r => r.control_value !== 'ne');
    const html2 = h.w.checklistEmailHtml(YEAR, WEEK, 1, noNe, M, STORES, null, { history: HIST });
    ok('без „не" → няма бутон и няма href', html2.indexOf('Напиши становище') < 0 && !/href=/.test(html2));
    const html3 = h.w.checklistEmailHtml(2027, 1, 1, [cl('Враца', 'revizia_953', { control_value: 'ne' })].map(r => Object.assign(r, { year: 2027, week_number: 1 })), M, STORES, null, {});
    ok('друга седмица → y=2027&w=1', html3.indexOf('?tab=checklist&amp;y=2027&amp;w=1"') >= 0);
    h.close();
  }

  section('4. Отваряне на портала с параметъра — истински startApp()');
  async function start(user, search, opts) {
    const h = env(user, opts);
    h.w.history.replaceState(null, '', '/' + search);
    guard('startApp ' + user.role + ' ' + search, () => h.w.startApp());
    await ticks(10);
    return h;
  }
  const shown = (h, mod) => { const el = h.doc.getElementById('mod-' + mod); return !!el && el.style.display === 'block'; };
  {
    const h = await start(ADMIN, '?tab=checklist&y=2026&w=43');
    ok('admin → табът „Чек лист"', shown(h, 'checklist'));
    ok('… на седмица 43 / 2026', h.w.checklistYear === 2026 && h.w.checklistWeek === 43, h.w.checklistYear + '/' + h.w.checklistWeek);
    ok('… и заявката е за седмица 43', h.calls.get.some(u => /weekly_checklist\?/.test(u) && /week_number=eq\.43/.test(u)), h.calls.get.filter(u => /weekly_checklist\?/.test(u)).join(' | '));
    h.close();
  }
  {
    const MGR = { id: 'u-2', email: 'managershumen@temax.bg', display_name: 'Шумен', role: 'manager', store_name: 'Шумен' };
    const h = await start(MGR, '?tab=checklist&y=2026&w=43', { data: { weekly_checklist_sends: [{ year: 2026, week_number: 43, version: 1, sent_at: '2026-10-27T08:00:00Z' }] } });
    ok('manager на отчетен обект → табът „Чек лист" на 43', shown(h, 'checklist') && h.w.checklistWeek === 43, h.w.checklistWeek);
    h.close();
  }
  {
    const KASA = { id: 'u-3', email: 'kasa@temax.bg', display_name: 'Каса', role: 'kasa', store_name: 'Шумен' };
    const h = await start(KASA, '?tab=checklist&y=2026&w=43');
    ok('kasa (без таба) → обичайният старт (Каса), не „Чек лист"', !shown(h, 'checklist') && shown(h, 'kasa'));
    h.close();
  }
  for (const bad of ['?tab=checklist&y=2027&w=53', '?tab=checklist&y=2026&w=0', '?tab=checklist&y=26&w=43', '?tab=checklist&y=2026&w=4x', '?tab=other&y=2026&w=43', '?tab=checklist']) {
    const h = await start(ADMIN, bad);
    ok('невалиден „' + bad + '" → обичайният старт', !shown(h, 'checklist') && h.w.checklistWeek === null, String(h.w.checklistWeek));
    h.close();
  }
  {
    ok('2026 има седмица 53 → валидна', (function () { const h = env(ADMIN); const r = h.w.checklistDeepLinkParams('?tab=checklist&y=2026&w=53'); h.close(); return r && r.week === 53; })());
  }
  {
    const ACC = { id: 'u-acc', email: 'acc@temax.bg', display_name: 'Счетоводител', role: 'accounting', store_name: 'Централен офис' };
    const h = await start(ACC, '?tab=checklist&y=2026&w=43', { regional: true });
    ok('регионален accounting → „Чек лист" на 43 след rolesLoadRegional', shown(h, 'checklist') && h.w.checklistWeek === 43, h.w.checklistWeek);
    h.close();
    const h2 = await start(ACC, '?tab=checklist&y=2026&w=43', { regional: false });
    ok('accounting без регион → не отваря „Чек лист"', !shown(h2, 'checklist'));
    h2.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
