/* ПАЛЕТИ — ЕКСПОРТ EXCEL.

   Бутонът „📊 Експорт Excel" стои и в двата изгледа:
     · admin / accounting / logistics (isGlobal) — всички обекти от матрицата;
     · магазин — само своя обект (дори данните да съдържат чужди редове).
   Workbook-ът има два листа:
     · „Палети"    — всеки ред, по обект и дата низходящо; след всеки тип
                     „Δ <тип>", после „Предходно (общо)", „Δ" и „Проверка"
                     („⚠ спад" за тип с Δ <= −праг от app_settings
                     'pallets_drop_threshold', липсва/невалиден → 10);
     · „Обобщение" — последното по обект; без данни и остарели (>7 дни)
                     отгоре; ред с броя им и ред ОБЩО = сума по колоните.
   Датите са Date (местна полунощ) + cellDates/dateNF dd.mm.yyyy → Excel дата.
   SheetJS се зарежда веднъж: второ натискане, докато се зарежда, не добавя
   втори <script>; след провал може да се опита пак.

   SheetJS не е в node_modules — тестът подава фалшив XLSX, който пази
   масивите и опциите на листовете. Проверява се какво строи pallets.js.

   Враца са РЕАЛНИТЕ редове от transport_pallets (18.09 / 11.09 / 04.09):
   18.09 спрямо 11.09 — Европалет +20, Малък +8; 11.09 спрямо 04.09 —
   Европалет −18 (изпратени 36 към Холсим) → „⚠ спад" при праг 10.

   Часовник: петък 18.09.2026 12:00.

   Пускане:  node tests/pallets-export.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const NOW = new Date(2026, 8, 18, 12, 0).getTime();
function freezeAt(w, ms) {
  const Real = w.Date;
  w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  };
}

const USERS = ['Враца', 'Габрово', 'Добрич', 'Шумен', 'Централен офис', 'Логистичен склад Добрич']
  .map(s => ({ store_name: s }));
function pal(store, date, v, note, by) {
  return { id: store + '-' + date, store_name: store, report_date: date,
           euro_pallets: v[0], small_pallets: v[1], nonstandard_pallets: v[2],
           grate_pallets: v[3], bilka_pallets: v[4], sent_note: note || null,
           updated_by: by || null, created_by: 'създал-' + store };
}
/* Низходящо по дата — както идва заявката (order=report_date.desc). */
const ROWS = [
  pal('Враца', '2026-09-18', [20, 10, 8, 40, 9], 'изпратени 4', 'Иван'),
  pal('Централен офис', '2026-09-18', [99, 0, 0, 0, 0]),
  pal('Шумен', '2026-09-17', [0, 0, 0, 0, 7]),
  pal('Враца', '2026-09-11', [0, 2, 6, 40, 9], 'Холсим 36'),
  pal('Габрово', '2026-09-05', [3, 0, 0, 0, 0]),
  pal('Враца', '2026-09-04', [18, 2, 6, 40, 9])
];
const THR = v => [{ key: 'pallets_drop_threshold', value: v }];

function fakeXlsx() {
  const X = { written: [] };
  X.utils = {
    book_new: () => ({ names: [], sheets: {} }),
    aoa_to_sheet: (aoa, opts) => ({ aoa: aoa, opts: opts }),
    book_append_sheet: (wb, ws, name) => { wb.names.push(name); wb.sheets[name] = ws; }
  };
  X.writeFile = (wb, name, opts) => { X.written.push({ wb: wb, name: name, opts: opts }); };
  return X;
}

function env(user, opts) {
  opts = opts || {};
  const data = { users: USERS, transport_pallets: ROWS };
  if (opts.settings !== undefined) data.app_settings = opts.settings;
  const h = boot({ modules: ['pallets.js'], user: user, data: data, fail: opts.fail });
  freezeAt(h.w, NOW);
  return h;
}
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const LOGI = { email: 'l@temax.bg', display_name: 'Логист', role: 'logistics', store_name: 'Логистичен склад Добрич' };
const STORE = { email: 'v@temax.bg', display_name: 'Иван', role: 'sklad', store_name: 'Враца' };
const btnOf = doc => doc.getElementById('pallets-export-btn');
const scripts = doc => Array.from(doc.head.querySelectorAll('script')).filter(s => /xlsx/.test(s.src || ''));
const col = (aoa, name) => aoa[0].indexOf(name);
const isDate = (w, v) => Object.prototype.toString.call(v) === '[object Date]';
const ymd = v => v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
const cellStr = (w, v) => isDate(w, v) ? ymd(v) : String(v);

async function exportWith(h) {
  const X = fakeXlsx(); h.w.XLSX = X;
  realClick(h.w, btnOf(h.doc), 'Експорт');
  await ticks(); await ticks();
  return X;
}

(async function () {

  section('1. Admin: бутонът е там, клик → 2 листа с правилните редове');
  let P = [], S = [], W = null;
  {
    const h = env(ADMIN, { settings: THR('10') });
    h.w.loadPallets(); await ticks();
    if (ok('бутонът „📊 Експорт Excel" е в матрицата', !!btnOf(h.doc) && btnOf(h.doc).textContent.indexOf('Експорт Excel') >= 0)) {
      const X = await exportWith(h);
      ok('записан е един файл', X.written.length === 1, String(X.written.length));
      const f = X.written[0] || { wb: { names: [], sheets: {} } };
      ok('име ТеМАХ_Палети_2026-09-18.xlsx', f.name === 'ТеМАХ_Палети_2026-09-18.xlsx', String(f.name));
      ok('два листа: Палети, Обобщение', f.wb.names.join('|') === 'Палети|Обобщение', f.wb.names.join('|'));
      P = (f.wb.sheets['Палети'] || {}).aoa || [];
      S = (f.wb.sheets['Обобщение'] || {}).aoa || [];
      W = h.w;
      ok('Палети: заглавие + 5 реда (ЦО отпада)', P.length === 6, String(P.length));
      ok('колоните: след всеки тип „Δ <тип>", накрая общо / предходно / Δ / проверка / коментар',
        P[0] && P[0].join('|') === ['Обект', 'Дата на подаване', 'Подал',
          'Европалет 120*80', 'Δ Европалет 120*80', 'Малък палет 60*80', 'Δ Малък палет 60*80',
          'Нестандартен палет', 'Δ Нестандартен палет', 'Скара', 'Δ Скара', 'Палет Билка', 'Δ Палет Билка',
          'Общо', 'Предходно (общо)', 'Δ', 'Проверка', 'Изпратени с камион / коментар'].join('|'), P[0] && P[0].join('|'));
      ok('редът: Враца×3, Габрово, Шумен; датите низходящо',
        P.slice(1).map(r => r[0] + ' ' + cellStr(h.w, r[1])).join(', ') ===
        'Враца 2026-09-18, Враца 2026-09-11, Враца 2026-09-04, Габрово 2026-09-05, Шумен 2026-09-17',
        P.slice(1).map(r => r[0] + ' ' + cellStr(h.w, r[1])).join(', '));
      ok('подал = updated_by, иначе created_by', P[1][2] === 'Иван' && P[4][2] === 'създал-Габрово');
      ok('коментарът пътува', P[1][col(P, 'Изпратени с камион / коментар')] === 'изпратени 4');
    }
    h.close();
  }

  section('2. Датите са истински Excel дати');
  {
    if (ok('„Дата на подаване" е Date', P.length > 1 && P.slice(1).every(r => isDate(W, r[1])),
      P.slice(1).map(r => Object.prototype.toString.call(r[1])).join(','))) {
      const d = P[1][1];
      ok('в местна полунощ (без изместване на деня)', d.getHours() === 0 && d.getMinutes() === 0 && ymd(d) === '2026-09-18', String(d));
    }
    const sd = S.slice(1).filter(r => r[1] === 'Актуално' || /Остаряло/.test(r[1]));
    ok('„Последно подаване" е Date при всеки обект с данни', sd.length === 3 && sd.every(r => isDate(W, r[2])),
      sd.map(r => Object.prototype.toString.call(r[2])).join(','));
    ok('обект без данни — празно, не Date', S.find(r => r[0] === 'Добрич')[2] === '');
  }
  {
    const h = env(ADMIN);
    h.w.loadPallets(); await ticks();
    const X = await exportWith(h);
    const f = X.written[0];
    ok('и двата листа са с cellDates:true и dateNF dd.mm.yyyy',
      ['Палети', 'Обобщение'].every(n => f.wb.sheets[n].opts && f.wb.sheets[n].opts.cellDates === true && f.wb.sheets[n].opts.dateNF === 'dd.mm.yyyy'),
      JSON.stringify(['Палети', 'Обобщение'].map(n => f.wb.sheets[n].opts)));
    ok('writeFile с cellDates:true', f.opts && f.opts.cellDates === true, JSON.stringify(f.opts));
    h.close();
  }

  section('3. Δ по тип и общо — спрямо предходното подаване на СЪЩИЯ обект');
  {
    const c = n => col(P, n);
    const r18 = P[1], r11 = P[2], r04 = P[3], gab = P[4];
    ok('Враца 18.09: Δ Европалет +20', r18[c('Δ Европалет 120*80')] === 20, String(r18[c('Δ Европалет 120*80')]));
    ok('Враца 18.09: Δ Малък +8', r18[c('Δ Малък палет 60*80')] === 8, String(r18[c('Δ Малък палет 60*80')]));
    ok('Враца 18.09: Δ Нестандартен +2, Скара 0, Билка 0',
      r18[c('Δ Нестандартен палет')] === 2 && r18[c('Δ Скара')] === 0 && r18[c('Δ Палет Билка')] === 0);
    ok('Враца 18.09: общо 87, предходно 57, Δ +30',
      r18[c('Общо')] === 87 && r18[c('Предходно (общо)')] === 57 && r18[c('Δ')] === 30, JSON.stringify(r18));
    ok('Враца 11.09: Δ Европалет −18, общо Δ −18', r11[c('Δ Европалет 120*80')] === -18 && r11[c('Δ')] === -18);
    ok('Враца 04.09 (първо подаване): всички Δ празни',
      ['Δ Европалет 120*80', 'Δ Малък палет 60*80', 'Δ Нестандартен палет', 'Δ Скара', 'Δ Палет Билка', 'Предходно (общо)', 'Δ']
        .every(n => r04[c(n)] === ''), JSON.stringify(r04));
    ok('Габрово НЕ ползва реда на Враца като предходно', gab[c('Δ Европалет 120*80')] === '' && gab[c('Δ')] === '');
    ok('типовете стоят като числа (Враца 18.09: 20 / 10 / 8 / 40 / 9)',
      [r18[c('Европалет 120*80')], r18[c('Малък палет 60*80')], r18[c('Нестандартен палет')], r18[c('Скара')], r18[c('Палет Билка')]].join('/') === '20/10/8/40/9');
  }

  section('4. „Проверка" — прагът от app_settings');
  {
    const c = n => col(P, n);
    ok('праг 10: Враца 11.09 (Европалет −18) → „⚠ спад"',
      /^⚠ спад: Европалет 120\*80 -18$/.test(P[2][c('Проверка')]), String(P[2][c('Проверка')]));
    ok('ръст (Враца 18.09) → празно', P[1][c('Проверка')] === '');
    ok('първо подаване → празно', P[3][c('Проверка')] === '');
  }
  /* Всеки случай гледа И реда с −18 (Враца 11.09), И реда без спад (Враца
     18.09, където има Δ 0): праг 0 или отрицателен би маркирал и нулите. */
  for (const [label, settings, fail, want] of [
    ['праг 20 → −18 не е спад', THR('20'), null, ''],
    ['праг 18 → точно на прага Е спад', THR('18'), null, '⚠ спад: Европалет 120*80 -18'],
    ['праг „abc" → 10', THR('abc'), null, '⚠ спад: Европалет 120*80 -18'],
    ['праг 0 → 10', THR('0'), null, '⚠ спад: Европалет 120*80 -18'],
    ['праг −5 → 10', THR('-5'), null, '⚠ спад: Европалет 120*80 -18'],
    ['праг „9,5" (запетая) → 9.5', THR('9,5'), null, '⚠ спад: Европалет 120*80 -18'],
    ['без настройка → 10', [], null, '⚠ спад: Европалет 120*80 -18'],
    ['заявката пада (500) → 10, файлът пак тръгва', THR('20'), { GET: /app_settings/ }, '⚠ спад: Европалет 120*80 -18']
  ]) {
    const h = env(ADMIN, { settings: settings, fail: fail || undefined });
    h.w.loadPallets(); await ticks();
    const X = await exportWith(h);
    const p = X.written.length ? X.written[0].wb.sheets['Палети'].aoa : [[]];
    ok(label, X.written.length === 1 && p[2] && p[2][col(p, 'Проверка')] === want && p[1][col(p, 'Проверка')] === '',
      X.written.length + ' / ' + JSON.stringify([p[2] && p[2][col(p, 'Проверка')], p[1] && p[1][col(p, 'Проверка')]]));
    if (fail) ok('…и без червен toast „Грешка при зареждане"', !h.calls.toast.some(m => /Грешка при зареждане/.test(m)), h.calls.toast.join(' | '));
    h.close();
  }
  {
    /* Ако sbGet някога започне да отхвърля — експортът не бива да умре. */
    const h = env(ADMIN, { settings: THR('20') });
    h.w.loadPallets(); await ticks();
    const real = h.w.sbGet;
    h.w.sbGet = function (t, q, s) { return /app_settings/.test(t) ? Promise.reject(new Error('мрежа')) : real(t, q, s); };
    const X = await exportWith(h);
    const p = X.written.length ? X.written[0].wb.sheets['Палети'].aoa : [[]];
    ok('отхвърлен sbGet → праг 10, файлът тръгва', X.written.length === 1 && p[2][col(p, 'Проверка')] === '⚠ спад: Европалет 120*80 -18',
      String(X.written.length));
    h.close();
  }

  section('5. Обобщение: ред с броя и ред ОБЩО = сума на колоните');
  {
    const body = S.slice(1, S.length - 2);
    ok('обектите: Добрич (няма данни), Габрово (остаряло), Враца, Шумен',
      body.map(r => r[0] + ':' + r[1]).join(', ') === 'Добрич:Няма данни, Габрово:Остаряло (>7 дни), Враца:Актуално, Шумен:Актуално',
      body.map(r => r[0] + ':' + r[1]).join(', '));
    ok('Габрово: 13 дни', body[1][3] === 13, JSON.stringify(body[1]));
    const cnt = S[S.length - 2], tot = S[S.length - 1];
    ok('предпоследният ред — броят без данни / остарели',
      cnt[0] === 'Без данни: 1 · Остарели (>7 дни): 1 · Общо обекти: 4', String(cnt[0]));
    ok('последният ред е ОБЩО', tot[0] === 'ОБЩО', String(tot[0]));
    ok('ОБЩО носи „по 3 от 4 обекта"', tot[1] === 'по 3 от 4 обекта', String(tot[1]));
    const typeCols = ['Европалет 120*80', 'Малък палет 60*80', 'Нестандартен палет', 'Скара', 'Палет Билка', 'Общо'];
    const sums = typeCols.map(n => body.reduce((s, r) => s + (typeof r[col(S, n)] === 'number' ? r[col(S, n)] : 0), 0));
    const got = typeCols.map(n => tot[col(S, n)]);
    ok('ОБЩО = сумата на всяка колона', JSON.stringify(sums) === JSON.stringify(got), JSON.stringify({ sums, got }));
    ok('конкретно: 23 / 10 / 8 / 40 / 16 / 97', got.join('/') === '23/10/8/40/16/97', got.join('/'));
  }

  section('6. Logistics вижда всички; магазин — само своите');
  {
    const h = env(LOGI);
    h.w.loadPallets(); await ticks();
    if (ok('logistics: бутонът е там', !!btnOf(h.doc))) {
      const X = await exportWith(h);
      ok('logistics: 5 подавания, 4 обекта + 2 реда долу', X.written.length === 1 &&
        X.written[0].wb.sheets['Палети'].aoa.length === 6 && X.written[0].wb.sheets['Обобщение'].aoa.length === 7);
    }
    h.close();
  }
  {
    const h = env(STORE);
    h.w.loadPallets(); await ticks();
    if (ok('магазин: бутонът е там', !!btnOf(h.doc))) {
      const X = await exportWith(h);
      const f = X.written[0] || { wb: { sheets: {} } };
      const p = (f.wb.sheets['Палети'] || {}).aoa || [];
      ok('Палети: заглавие + 3 реда на Враца', p.length === 4, String(p.length));
      ok('нито един чужд обект', p.slice(1).every(r => r[0] === 'Враца'), p.slice(1).map(r => r[0]).join(','));
      const s = (f.wb.sheets['Обобщение'] || {}).aoa || [];
      ok('Обобщение: Враца + брой + ОБЩО', s.length === 4 && s[1][0] === 'Враца' && s[3][0] === 'ОБЩО', JSON.stringify(s.map(r => r[0])));
      ok('ОБЩО на магазина = неговият ред (87)', s[3][col(s, 'Общо')] === 87, String(s[3][col(s, 'Общо')]));
      ok('без заявка към users в магазинския клон', !h.calls.get.some(u => /\/users\?/.test(u)));
    }
    h.close();
  }

  section('7. Граница: точно 7 дни е актуално, 8 — остаряло');
  {
    const h = boot({ modules: ['pallets.js'], user: ADMIN, data: { users: [{ store_name: 'А' }, { store_name: 'Б' }],
      transport_pallets: [pal('А', '2026-09-11', [1, 0, 0, 0, 0]), pal('Б', '2026-09-10', [1, 0, 0, 0, 0])] } });
    freezeAt(h.w, NOW);
    h.w.loadPallets(); await ticks();
    const X = fakeXlsx(); h.w.XLSX = X;
    h.w.exportPalletsExcel(); await ticks(); await ticks();
    const s = X.written[0].wb.sheets['Обобщение'].aoa.slice(1, -2);
    ok('Б (8 дни) — остаряло и отгоре; А (7 дни) — актуално',
      s.map(r => r[0] + ':' + r[1]).join(', ') === 'Б:Остаряло (>7 дни), А:Актуално', s.map(r => r[0] + ':' + r[1]).join(', '));
    h.close();
  }

  section('8. SheetJS се зарежда ВЕДНЪЖ');
  {
    const h = env(ADMIN);
    h.w.loadPallets(); await ticks();
    ok('преди клик XLSX го няма', !h.w.XLSX);
    realClick(h.w, btnOf(h.doc), 'клик 1');
    const s1 = scripts(h.doc);
    ok('клик 1 → един <script>', s1.length === 1, String(s1.length));
    ok('от cdnjs, xlsx 0.18.5', s1[0] && s1[0].src === 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', s1[0] && s1[0].src);
    realClick(h.w, btnOf(h.doc), 'клик 2 (докато се зарежда)');
    ok('клик 2 докато се зарежда → пак един <script>', scripts(h.doc).length === 1, String(scripts(h.doc).length));
    const X = fakeXlsx(); h.w.XLSX = X;
    s1[0].onload(); await ticks(); await ticks();
    ok('след зареждане — точно един файл', X.written.length === 1, String(X.written.length));
    realClick(h.w, btnOf(h.doc), 'клик 3 (заредено)'); await ticks(); await ticks();
    ok('клик 3 → нов файл, без нов <script>', X.written.length === 2 && scripts(h.doc).length === 1);
    h.close();
  }
  {
    const h = env(ADMIN);
    h.w.loadPallets(); await ticks();
    h.w.exportPalletsExcel();
    scripts(h.doc)[0].onerror();
    ok('провал → toast за грешка', h.calls.toast.some(m => /Грешка при зареждане на SheetJS/.test(m)), h.calls.toast.join(' | '));
    h.w.exportPalletsExcel();
    ok('след провал нов опит добавя нов <script>', scripts(h.doc).length === 2, String(scripts(h.doc).length));
    h.close();
  }
  {
    const h = env(ADMIN);
    h.w.loadPallets(); await ticks();
    const X = fakeXlsx(); h.w.XLSX = X;   /* зареден от друг модул */
    h.w.exportPalletsExcel(); await ticks(); await ticks();
    ok('XLSX вече е зареден (друг модул) → без <script>, направо файл', scripts(h.doc).length === 0 && X.written.length === 1);
    h.close();
  }

  report();
})();
