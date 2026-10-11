/* Зареждане — коментар на Снабдяването към обект за седмица и бланка
   (supply_store_notes, supply-store-notes-schema.sql, 11.10.2026).

   Какво се заковава:
   - обектът: „🏢 Снабдяване: текст · автор, дд.мм чч:мм" над таблицата само
     при запис за ТАЗИ седмица; сив ред „миналата седмица: …" при запис за
     предишната; без запис — нищо; една заявка за двете седмици; esc();
   - ЦО, supply/admin: блок „🏢 Коментар на Снабдяването" под матрицата, поле
     и „💾" на всеки обект от списъка ✅/⬜; РЕАЛЕН клик -> ЕДИН POST към
     supply_store_notes?on_conflict=template_id,store_name,week_start с
     Prefer merge-duplicates и тяло template_id/store_name/week_start/co_note/
     co_note_by/co_note_at; празен текст -> co_note null; седмицата е
     избраната (supplyOvWeek), не текущата; грешка от PostgREST -> червен
     toast, без „✓ Запазено" и без нов печат автор/час;
   - провал при ЧЕТЕНЕТО на коментарите: матрицата стои, полетата ги няма,
     червен ред вместо тях (запис на сляпо би презаписал незареден текст);
   - accounting (глобална роля без supply/admin): без поле, текстът се вижда;
   - Excel: лист „Снабдяване" само ако има коментар.

   Мутации (пуснати на 11.10.2026, всяка поотделно върху supply.js; всяка
   събаря поне една проверка, чистият код минава):
   M1 supplyStoreCoNoteHtml: esc(String(cur.co_note).trim()) -> без esc
      -> „<b> не е рендиран" (обект) пада.
   M2 supplySaveCoNote: махнат '?on_conflict=…' от URL-а -> „URL-ът носи
      on_conflict" пада.
   M3 supplyCanWriteCoNote: връща true за всички -> „accounting: няма поле"
      пада.
   M4 supplySaveCoNote: week_start: supplyWeek вместо supplyOvWeek ->
      „избраната седмица" пада.
   M5 supplySaveCoNote: co_note: raw (без null при празно) -> „празен текст
      -> co_note null" пада.
   M6 supplySaveCoNote: печатът се обновява и при грешка (if(!res.ok) без
      return) -> „при грешка няма „✓ Запазено"" пада.

   Пускане: node tests/supply-co-note.test.js . */
'use strict';
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, realClick, btn } = H;

const STORE = { email: 'sl@temax.bg', display_name: 'Иван Сливен', role: 'store', store_name: 'Сливен' };
const SUPPLY = { email: 's@temax.bg', display_name: 'Мария Снабдяване', role: 'supply', store_name: 'Централен офис' };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const ACC = { email: 'acc@temax.bg', display_name: 'Счетоводител', role: 'accounting', store_name: 'Централен офис' };

const TPL = { id: 'tpl-fl', name: 'Подови настилки', slug: 'floor-lm', col1_label: 'Места в зала',
  col2_label: 'Брой за трансфер/поръчка', target_stores: ['Петрич', 'Сливен'], active: true, sort_order: 0 };
const ITEMS = [
  { id: 'it-a', template_id: 'tpl-fl', sap_code: null, name: 'Балатум 4м.', supplier: 'ВАМКО ООД', active: true, sort_order: 1 }
];
const EVIL = 'поръчани <b>2</b> балатум & "мокет"';
/* Фиксиран час в местно време -> очакваният печат „дд.мм чч:мм". */
const AT = new Date(2026, 9, 12, 9, 5).toISOString();

function env(user, notes, extra) {
  const h = boot(Object.assign({
    modules: ['pallets.js', 'supply.js'],
    user: user,
    data: {
      supply_templates: [TPL],
      supply_template_items: ITEMS,
      supply_entries: [],
      supply_store_notes: notes || (() => []),
      users: [{ store_name: 'Сливен' }, { store_name: 'Петрич' }]
    }
  }, extra || {}));
  /* Хедърите не се пазят от harness-а — прихващаме ги тук. */
  h.heads = [];
  const f = h.w.fetch;
  h.w.fetch = function (url, init) { h.heads.push({ url: String(url), method: ((init && init.method) || 'GET').toUpperCase(), headers: (init && init.headers) || {} }); return f(url, init); };
  /* Цветът на toast-а — също. */
  h.toasts = [];
  const t = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ m: m, c: c }); return t(m, c); };
  return h;
}
function mod(h) { return h.doc.getElementById('mod-supply'); }
const coPosts = h => h.calls.post.filter(p => p.table === 'supply_store_notes' || /supply_store_notes/.test(p.url));

(async function () {
  section('1. Обект: запис за тази седмица + предишната');
  {
    let wk, prev;
    const h = env(STORE, url => [
      { template_id: 'tpl-fl', store_name: 'Сливен', week_start: wk, co_note: EVIL, co_note_by: 'Мария Снабдяване', co_note_at: AT },
      { template_id: 'tpl-fl', store_name: 'Сливен', week_start: prev, co_note: 'миналия път: 1 мокет', co_note_by: 'Мария', co_note_at: AT },
      /* чужд обект — клиентът не бива да го покаже, каквото и да върне заявката */
      { template_id: 'tpl-fl', store_name: 'Петрич', week_start: wk, co_note: 'ЧУЖДО', co_note_by: 'x', co_note_at: AT }
    ]);
    wk = h.w.supplyWeekStart(); prev = h.w.supplyAddDays(wk, -7);
    if (guard('loadSupply() не хвърля', () => h.w.loadSupply())) {
      await ticks(6);
      const m = mod(h);
      const gets = h.calls.get.filter(u => /supply_store_notes/.test(u)).map(decodeURIComponent);
      ok('ЕДНА заявка към supply_store_notes, за двете седмици', gets.length === 1 &&
        gets[0].indexOf('week_start=in.(' + wk + ',' + prev + ')') >= 0 && gets[0].indexOf('store_name=eq.Сливен') >= 0, gets.join(' | '));
      const cur = m.querySelector('.sup-co-cur');
      ok('ред „🏢 Снабдяване: …" е там', !!cur && cur.textContent.indexOf('🏢 Снабдяване: ' + EVIL) === 0, cur && cur.textContent);
      ok('авторът и датата „12.10 09:05"', !!cur && cur.textContent.indexOf('Мария Снабдяване, 12.10 09:05') >= 0, cur && cur.textContent);
      ok('<b> не е рендиран (esc)', !!cur && !cur.querySelector('b'));
      ok('white-space:pre-line', !!cur && /white-space:pre-line/.test(cur.getAttribute('style')));
      const old = m.querySelector('.sup-co-prev');
      ok('сив ред „миналата седмица: …"', !!old && old.textContent === 'миналата седмица: миналия път: 1 мокет', old && old.textContent);
      ok('сивият ред е след текущия, и двата — преди таблицата',
        !!cur && !!old && m.innerHTML.indexOf('sup-co-cur') < m.innerHTML.indexOf('sup-co-prev') &&
        m.innerHTML.indexOf('sup-co-prev') < m.innerHTML.indexOf('<table'));
      ok('чуждият обект не излиза', m.textContent.indexOf('ЧУЖДО') < 0);
    }
  }

  section('2. Обект: без запис — нищо; само предишна седмица — само сивият ред');
  {
    const h = env(STORE, () => []);
    h.w.loadSupply(); await ticks(6);
    ok('без запис: няма .sup-co-cur / .sup-co-prev / „Снабдяване"',
      !mod(h).querySelector('.sup-co-cur') && !mod(h).querySelector('.sup-co-prev') && mod(h).textContent.indexOf('Снабдяване') < 0);
    ok('без запис: няма поле за писане', !mod(h).querySelector('.sup-co-input'));

    let prev;
    const h2 = env(STORE, () => [
      { template_id: 'tpl-fl', store_name: 'Сливен', week_start: prev, co_note: 'старо', co_note_by: 'М', co_note_at: AT }
    ]);
    prev = h2.w.supplyAddDays(h2.w.supplyWeekStart(), -7);
    h2.w.loadSupply(); await ticks(6);
    ok('само предишна: няма „🏢 Снабдяване"', !mod(h2).querySelector('.sup-co-cur'));
    ok('само предишна: сивият ред е там', (mod(h2).querySelector('.sup-co-prev') || {}).textContent === 'миналата седмица: старо');

    let wk;
    const h3 = env(STORE, () => [
      { template_id: 'tpl-fl', store_name: 'Сливен', week_start: wk, co_note: null, co_note_by: 'М', co_note_at: AT }
    ]);
    wk = h3.w.supplyWeekStart();
    h3.w.loadSupply(); await ticks(6);
    ok('ред с co_note null (изтрито съдържание) — нищо', !mod(h3).querySelector('.sup-co-cur'));
  }

  section('3. ЦО, supply: поле за всеки обект, запис с реален клик');
  {
    const h = env(SUPPLY, () => []);
    h.w.loadSupply(); await ticks(8);
    const m = mod(h);
    ok('матрицата е там', !!m.querySelector('table.sup-matrix'));
    const box = m.querySelector('.sup-co');
    ok('блок „🏢 Коментар на Снабдяването" под матрицата', !!box && box.textContent.indexOf('🏢 Коментар на Снабдяването') >= 0 &&
      m.innerHTML.indexOf('sup-matrix') < m.innerHTML.indexOf('class="sup-co"'));
    ok('блокът е ИЗВЪН закачената матрица', !!box && !box.closest('.sup-matrix-wrap'));
    const inputs = box ? Array.from(box.querySelectorAll('.sup-co-input')) : [];
    ok('по едно поле за Петрич и Сливен', inputs.length === 2, String(inputs.length));
    const rowSl = box && Array.from(box.querySelectorAll('.sup-co-row')).find(r => r.textContent.indexOf('Сливен') >= 0);
    rowSl.querySelector('.sup-co-input').value = '  ' + EVIL + '  ';
    realClick(h.w, btn(rowSl, '💾'));
    await ticks(6);
    const posts = coPosts(h);
    ok('ЕДИН POST към supply_store_notes', posts.length === 1, String(posts.length));
    const p = (posts[0] || {}).body || {};
    const wk = h.w.supplyWeekStart();
    ok('URL-ът носи on_conflict=template_id,store_name,week_start', posts[0] && /supply_store_notes\?on_conflict=template_id,store_name,week_start$/.test(posts[0].url), posts[0] && posts[0].url);
    const hd = h.heads.find(x => x.method === 'POST' && /supply_store_notes/.test(x.url));
    ok('Prefer: resolution=merge-duplicates', !!hd && /resolution=merge-duplicates/.test(hd.headers.Prefer || ''), hd && JSON.stringify(hd.headers));
    ok('тяло: точно шестте ключа', Object.keys(p).sort().join(',') === 'co_note,co_note_at,co_note_by,store_name,template_id,week_start', Object.keys(p).join(','));
    ok('template_id / store_name / week_start', p.template_id === 'tpl-fl' && p.store_name === 'Сливен' && p.week_start === wk, JSON.stringify(p));
    ok('co_note — подрязаният суров текст', p.co_note === EVIL, JSON.stringify(p.co_note));
    ok('co_note_by = display_name', p.co_note_by === 'Мария Снабдяване');
    ok('co_note_at е ISO час от сега', typeof p.co_note_at === 'string' && Math.abs(Date.parse(p.co_note_at) - Date.now()) < 60000, p.co_note_at);
    ok('„✓ Запазено"', h.toasts.some(t => t.m === '✓ Запазено'), JSON.stringify(h.toasts));
    const by = rowSl.querySelector('.sup-co-by');
    ok('печатът под полето показва автора', !!by && by.textContent.indexOf('Мария Снабдяване, ') === 0, by && by.textContent);

    /* празен текст -> co_note null, пак POST (редът остава) */
    rowSl.querySelector('.sup-co-input').value = '   ';
    realClick(h.w, btn(rowSl, '💾'));
    await ticks(6);
    const p2 = (coPosts(h)[1] || {}).body || {};
    ok('празен текст -> co_note null (ключът го има)', coPosts(h).length === 2 && 'co_note' in p2 && p2.co_note === null, JSON.stringify(p2));
    ok('печатът се изчиства', (rowSl.querySelector('.sup-co-by') || {}).textContent === '');
  }

  section('4. ЦО, supply: предзаредено, избрана седмица, грешка от PostgREST');
  {
    let wk;
    const h = env(SUPPLY, url => {
      const u = decodeURIComponent(url);
      return [{ id: 'n1', template_id: 'tpl-fl', store_name: 'Петрич', week_start: (u.match(/week_start=eq\.([\d-]+)/) || [])[1], co_note: EVIL, co_note_by: 'Мария', co_note_at: AT }];
    }, { fail: { POST: { status: 403, body: { message: 'new row violates row-level security policy' } } } });
    wk = h.w.supplyWeekStart();
    h.w.loadSupply(); await ticks(8);
    const rowP = Array.from(mod(h).querySelectorAll('.sup-co-row')).find(r => r.textContent.indexOf('Петрич') >= 0);
    ok('предзаредено: value е ТОЧНО текстът', !!rowP && rowP.querySelector('.sup-co-input').value === EVIL, rowP && rowP.querySelector('.sup-co-input').value);
    ok('печат „Мария, 12.10 09:05"', !!rowP && rowP.querySelector('.sup-co-by').textContent === 'Мария, 12.10 09:05');

    /* миналата седмица в обобщението */
    realClick(h.w, h.doc.getElementById('sup-week-prev'));
    await ticks(8);
    const prev = h.w.supplyAddDays(wk, -7);
    const rowP2 = Array.from(mod(h).querySelectorAll('.sup-co-row')).find(r => r.textContent.indexOf('Петрич') >= 0);
    rowP2.querySelector('.sup-co-input').value = 'ново';
    realClick(h.w, btn(rowP2, '💾'));
    await ticks(6);
    const p = (coPosts(h)[0] || {}).body || {};
    ok('избраната седмица (предишна), не текущата', p.week_start === prev, p.week_start + ' vs ' + prev);
    const red = h.toasts.find(t => /Грешка при запис на коментара/.test(t.m));
    ok('червен toast с причината', !!red && red.c === '#dc2626' && red.m.indexOf('row-level security') >= 0, JSON.stringify(h.toasts));
    ok('при грешка няма „✓ Запазено"', !h.toasts.some(t => t.m === '✓ Запазено'));
    ok('при грешка печатът е старият', rowP2.querySelector('.sup-co-by').textContent === 'Мария, 12.10 09:05', rowP2.querySelector('.sup-co-by').textContent);
    const st = h.w.supplyOvCoNote('tpl-fl', 'Петрич');
    ok('при грешка състоянието е старото', !!st && st.co_note === EVIL);
  }

  section('5. Провал при четенето на коментарите: матрицата стои, полетата ги няма');
  {
    const h = env(SUPPLY, () => [], { fail: { GET: /supply_store_notes/ } });
    h.w.loadSupply(); await ticks(8);
    const m = mod(h);
    ok('матрицата е там', !!m.querySelector('table.sup-matrix'));
    ok('червен ред за коментарите', !!m.querySelector('.sup-co-err'));
    ok('няма поле за писане', !m.querySelector('.sup-co-input'));
  }

  section('6. accounting: само четене');
  {
    const h = env(ACC, () => [
      { id: 'n1', template_id: 'tpl-fl', store_name: 'Сливен', week_start: '', co_note: EVIL, co_note_by: 'Мария', co_note_at: AT }
    ].map(n => Object.assign(n, { week_start: h.w.supplyWeekStart() })));
    h.w.loadSupply(); await ticks(8);
    const m = mod(h);
    ok('няма поле и няма 💾', !m.querySelector('.sup-co-input') && !m.querySelector('.sup-co-save'));
    const txt = m.querySelector('.sup-co-text');
    ok('текстът се вижда, суров', !!txt && txt.textContent === EVIL, txt && txt.textContent);
    ok('<b> не е рендиран', !!txt && !txt.querySelector('b'));
    ok('Петрич (без коментар) не е изброен', Array.from(m.querySelectorAll('.sup-co-row')).length === 1);

    const h2 = env(ACC, () => []);
    h2.w.loadSupply(); await ticks(8);
    ok('accounting без коментари: блокът го няма', !mod(h2).querySelector('.sup-co'));

    const h3 = env(ADMIN, () => []);
    h3.w.loadSupply(); await ticks(8);
    ok('admin: полета има', mod(h3).querySelectorAll('.sup-co-input').length === 2);
  }

  section('7. Excel: лист „Снабдяване" само ако има коментар');
  {
    async function exportWith(notes) {
      const h = env(SUPPLY, notes);
      h.w.loadSupply(); await ticks(8);
      const x = { sheets: [], aoas: [] };
      h.w.XLSX = {
        utils: { book_new: () => ({}), aoa_to_sheet: a => { x.aoas.push(a); return {}; },
          book_append_sheet: (wb, ws, name) => { x.sheets.push(name); } },
        writeFile: () => {}
      };
      realClick(h.w, mod(h).querySelector('.sup-excel'));
      await ticks(2);
      return x;
    }
    const a = await exportWith(url => [
      { id: 'n1', template_id: 'tpl-fl', store_name: 'Сливен', week_start: (decodeURIComponent(url).match(/week_start=eq\.([\d-]+)/) || [])[1], co_note: EVIL, co_note_by: 'Мария', co_note_at: AT }
    ]);
    ok('листове: бланката и „Снабдяване"', a.sheets.join('|') === 'Подови настилки|Снабдяване', a.sheets.join('|'));
    const sh = a.aoas[a.aoas.length - 1] || [];
    ok('заглавка Обект|Коментар на Снабдяването|От|Кога', (sh[0] || []).join('|') === 'Обект|Коментар на Снабдяването|От|Кога');
    ok('ред: Сливен, суровият текст, Мария', sh.length === 2 && sh[1][0] === 'Сливен' && sh[1][1] === EVIL && sh[1][2] === 'Мария', JSON.stringify(sh[1]));
    const b = await exportWith(() => []);
    ok('без коментар: само листът на бланката', b.sheets.join('|') === 'Подови настилки', b.sheets.join('|'));
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
