/* ПАЛЕТИ — ЕКСПОРТ EXCEL.

   Бутонът „📊 Експорт Excel" стои и в двата изгледа:
     · admin / accounting / logistics (isGlobal) — всички обекти от матрицата;
     · магазин — само своя обект (дори данните да съдържат чужди редове).
   Workbook-ът има два листа:
     · „Палети"    — всеки ред, по обект и дата низходящо; „Предходно (общо)"
                     и „Δ" спрямо предходното подаване на СЪЩИЯ обект;
     · „Обобщение" — последното по обект; без данни и остарели (>7 дни) отгоре.
   SheetJS се зарежда веднъж: второ натискане, докато се зарежда, не добавя
   втори <script>; след провал може да се опита пак.

   SheetJS не е в node_modules — тестът подава фалшив XLSX, който пази
   масивите на листовете. Проверява се какво строи pallets.js, не библиотеката.

   Часовник: петък 18.09.2026 12:00.

   Пускане:  node tests/pallets-export.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

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
/* Сортирани низходящо по дата — както идва заявката (order=report_date.desc). */
const ROWS = [
  pal('Враца', '2026-09-18', [10, 5, 0, 0, 0], 'изпратени 4', 'Иван'),
  pal('Централен офис', '2026-09-18', [99, 0, 0, 0, 0]),
  pal('Шумен', '2026-09-17', [0, 0, 0, 0, 7]),
  pal('Враца', '2026-09-11', [20, 0, 0, 0, 0]),
  pal('Габрово', '2026-09-05', [3, 0, 0, 0, 0]),
  pal('Враца', '2026-09-04', [8, 0, 0, 0, 0])
];

function fakeXlsx() {
  const X = { written: [] };
  X.utils = {
    book_new: () => ({ names: [], sheets: {} }),
    aoa_to_sheet: aoa => ({ aoa: aoa }),
    book_append_sheet: (wb, ws, name) => { wb.names.push(name); wb.sheets[name] = ws; }
  };
  X.writeFile = (wb, name) => { X.written.push({ wb: wb, name: name }); };
  return X;
}

function env(user) {
  const h = boot({ modules: ['pallets.js'], user: user, data: { users: USERS, transport_pallets: ROWS } });
  freezeAt(h.w, NOW);
  return h;
}
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const LOGI = { email: 'l@temax.bg', display_name: 'Логист', role: 'logistics', store_name: 'Логистичен склад Добрич' };
const STORE = { email: 'v@temax.bg', display_name: 'Иван', role: 'sklad', store_name: 'Враца' };
const btnOf = doc => doc.getElementById('pallets-export-btn');
const scripts = doc => Array.from(doc.head.querySelectorAll('script')).filter(s => /xlsx/.test(s.src || ''));
const col = (aoa, name) => aoa[0].indexOf(name);

(async function () {

  section('1. Admin: бутонът е там, клик → 2 листа с правилните редове');
  {
    const h = env(ADMIN);
    h.w.loadPallets(); await ticks();
    const b = btnOf(h.doc);
    if (ok('бутонът „📊 Експорт Excel" е в матрицата', !!b && b.textContent.indexOf('Експорт Excel') >= 0)) {
      const X = fakeXlsx(); h.w.XLSX = X;
      realClick(h.w, b, 'Експорт (admin)');
      await ticks();
      ok('записан е един файл', X.written.length === 1, String(X.written.length));
      const f = X.written[0] || { wb: { names: [], sheets: {} } };
      ok('име ТеМАХ_Палети_2026-09-18.xlsx', f.name === 'ТеМАХ_Палети_2026-09-18.xlsx', String(f.name));
      ok('два листа: Палети, Обобщение', f.wb.names.join('|') === 'Палети|Обобщение', f.wb.names.join('|'));
      const p = (f.wb.sheets['Палети'] || {}).aoa || [];
      ok('Палети: заглавие + 5 реда (ЦО отпада)', p.length === 6, String(p.length));
      ok('колоните: обект, дата, подал, 5 типа, общо, предходно, Δ, коментар',
        p[0] && p[0].join('|') === ['Обект', 'Дата на подаване', 'Подал', 'Европалет 120*80', 'Малък палет 60*80',
          'Нестандартен палет', 'Скара', 'Палет Билка', 'Общо', 'Предходно (общо)', 'Δ',
          'Изпратени с камион / коментар'].join('|'), p[0] && p[0].join('|'));
      ok('редът: Враца×3, Габрово, Шумен; датите низходящо',
        p.slice(1).map(r => r[0] + ' ' + r[1]).join(', ') ===
        'Враца 2026-09-18, Враца 2026-09-11, Враца 2026-09-04, Габрово 2026-09-05, Шумен 2026-09-17',
        p.slice(1).map(r => r[0] + ' ' + r[1]).join(', '));
      const T = col(p, 'Общо'), P = col(p, 'Предходно (общо)'), D = col(p, 'Δ');
      ok('Враца 18.09: общо 15, предходно 20, Δ −5', p[1][T] === 15 && p[1][P] === 20 && p[1][D] === -5, JSON.stringify(p[1]));
      ok('Враца 11.09: предходно 8, Δ +12', p[2][P] === 8 && p[2][D] === 12, JSON.stringify(p[2]));
      ok('Враца 04.09: без предходно — празно', p[3][P] === '' && p[3][D] === '', JSON.stringify(p[3]));
      ok('Габрово НЕ ползва реда на Враца като предходно', p[4][P] === '' && p[4][D] === '', JSON.stringify(p[4]));
      ok('подал = updated_by, иначе created_by', p[1][2] === 'Иван' && p[4][2] === 'създал-Габрово');
      ok('коментарът пътува', p[1][col(p, 'Изпратени с камион / коментар')] === 'изпратени 4');
      ok('типовете са отделни колони (евро 10, малки 5)', p[1][3] === 10 && p[1][4] === 5);

      const s = (f.wb.sheets['Обобщение'] || {}).aoa || [];
      ok('Обобщение: заглавие + 4 обекта', s.length === 5, String(s.length));
      ok('ред: Добрич (няма данни), Габрово (остаряло), Враца, Шумен',
        s.slice(1).map(r => r[0] + ':' + r[1]).join(', ') ===
        'Добрич:Няма данни, Габрово:Остаряло (>7 дни), Враца:Актуално, Шумен:Актуално',
        s.slice(1).map(r => r[0] + ':' + r[1]).join(', '));
      ok('Габрово: 13 дни, последно 2026-09-05', s[2][2] === '2026-09-05' && s[2][3] === 13, JSON.stringify(s[2]));
      ok('Враца: последното подаване (18.09, общо 15)', s[3][2] === '2026-09-18' && s[3][s[0].indexOf('Общо')] === 15, JSON.stringify(s[3]));
    }
    h.close();
  }

  section('1б. Граница: точно 7 дни е актуално, 8 — остаряло');
  {
    const h = boot({ modules: ['pallets.js'], user: ADMIN, data: { users: [{ store_name: 'А' }, { store_name: 'Б' }],
      transport_pallets: [pal('А', '2026-09-11', [1, 0, 0, 0, 0]), pal('Б', '2026-09-10', [1, 0, 0, 0, 0])] } });
    freezeAt(h.w, NOW);
    h.w.loadPallets(); await ticks();
    const X = fakeXlsx(); h.w.XLSX = X;
    h.w.exportPalletsExcel();
    const s = X.written[0].wb.sheets['Обобщение'].aoa;
    ok('Б (8 дни) — остаряло и отгоре; А (7 дни) — актуално',
      s.slice(1).map(r => r[0] + ':' + r[1]).join(', ') === 'Б:Остаряло (>7 дни), А:Актуално', s.slice(1).map(r => r[0] + ':' + r[1]).join(', '));
    h.close();
  }

  section('1в. Logistics също вижда всички обекти');
  {
    const h = env(LOGI);
    h.w.loadPallets(); await ticks();
    const X = fakeXlsx(); h.w.XLSX = X;
    if (ok('бутонът е там', !!btnOf(h.doc))) {
      realClick(h.w, btnOf(h.doc), 'Експорт (logistics)');
      ok('5 подавания, 4 обекта', X.written.length === 1 && X.written[0].wb.sheets['Палети'].aoa.length === 6 &&
        X.written[0].wb.sheets['Обобщение'].aoa.length === 5);
    }
    h.close();
  }

  section('2. Магазин: бутонът е там, вижда САМО своите');
  {
    const h = env(STORE);
    h.w.loadPallets(); await ticks();
    const b = btnOf(h.doc);
    if (ok('бутонът е в магазинския изглед', !!b)) {
      const X = fakeXlsx(); h.w.XLSX = X;
      realClick(h.w, b, 'Експорт (магазин)');
      const f = X.written[0] || { wb: { sheets: {} } };
      const p = (f.wb.sheets['Палети'] || {}).aoa || [];
      ok('Палети: заглавие + 3 реда на Враца', p.length === 4, String(p.length));
      ok('нито един чужд обект', p.slice(1).every(r => r[0] === 'Враца'), p.slice(1).map(r => r[0]).join(','));
      const s = (f.wb.sheets['Обобщение'] || {}).aoa || [];
      ok('Обобщение: само Враца', s.length === 2 && s[1][0] === 'Враца', JSON.stringify(s.map(r => r[0])));
      ok('без заявка към users в магазинския клон', !h.calls.get.some(u => /\/users\?/.test(u)));
    }
    h.close();
  }

  section('3. SheetJS се зарежда ВЕДНЪЖ');
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
    s1[0].onload();
    ok('след зареждане — точно един файл', X.written.length === 1, String(X.written.length));
    realClick(h.w, btnOf(h.doc), 'клик 3 (заредено)');
    ok('клик 3 → нов файл, без нов <script>', X.written.length === 2 && scripts(h.doc).length === 1);
    h.close();
  }
  {
    const h = env(ADMIN);
    h.w.loadPallets(); await ticks();
    h.w.exportPalletsExcel();
    const s = scripts(h.doc)[0];
    s.onerror();
    ok('провал → toast за грешка', h.calls.toast.some(m => /Грешка при зареждане на SheetJS/.test(m)), h.calls.toast.join(' | '));
    h.w.exportPalletsExcel();
    ok('след провал нов опит добавя нов <script>', scripts(h.doc).length === 2, String(scripts(h.doc).length));
    h.close();
  }
  {
    const h = env(ADMIN);
    h.w.loadPallets(); await ticks();
    const X = fakeXlsx(); h.w.XLSX = X;   /* зареден от друг модул */
    h.w.exportPalletsExcel();
    ok('XLSX вече е зареден (друг модул) → без <script>, направо файл', scripts(h.doc).length === 0 && X.written.length === 1);
    h.close();
  }

  report();
})();
