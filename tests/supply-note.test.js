/* Зареждане — незадължителен коментар от обекта на всеки ред
   (supply_entries.note, supply-note-schema.sql, 11.10.2026).

   Какво се заковава:
   - формата на обекта: колона „Коментар" след последната колона за бройки,
     поле с placeholder „по желание", предзаредено от записа; кавички и HTML в
     коментара не чупят value="" (escAttr);
   - „Запази" с РЕАЛЕН клик: коментарът влиза в POST и PATCH; празен или само
     интервали -> null; ред само с коментар се създава; редакция на
     съществуващ ред сменя и изтрива коментара;
   - ЦО обобщение: „💬 Коментари от обектите" под матрицата само ако има;
     escaping; филтърът по доставчик важи; „Скрий празните" не крие ред с
     коментар; „попълнили N от M" не брои ред само с коментар;
   - Excel: лист „Коментари" само ако има коментари; матрицата е непроменена;
   - имейлът (send-routed-report, отчет по задача): „💬 Обект: текст" под
     стойностите, само ако го има; escaping; ред само с коментар се показва;
     „Попълнили" не се мени; заявката чете note.

   Пускане: node tests/supply-note.test.js . */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, realClick, btn } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const ROUTED = path.join(ROOT, 'supabase/functions/send-routed-report/index.ts');

const STORE = { email: 'sl@temax.bg', display_name: 'Иван Сливен', role: 'store', store_name: 'Сливен' };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

const TPL = { id: 'tpl-fl', name: 'Подови настилки', slug: 'floor-lm', col1_label: 'Места в зала',
  col2_label: 'Брой за трансфер/поръчка', target_stores: ['Петрич', 'Сливен'], active: true, sort_order: 0 };
const ITEMS = [
  { id: 'it-a', template_id: 'tpl-fl', sap_code: null, name: 'Балатум 4м.', supplier: 'ВАМКО ООД', active: true, sort_order: 1 },
  { id: 'it-b', template_id: 'tpl-fl', sap_code: null, name: 'Балатум 3м.', supplier: 'ОРГАХИМ ЕАД', active: true, sort_order: 2 }
];
const EVIL = 'Няма "място" <b>щанд</b> & край';

function env(user, entries) {
  return boot({
    modules: ['pallets.js', 'supply.js'],
    user: user,
    data: {
      supply_templates: [TPL],
      supply_template_items: ITEMS,
      supply_entries: () => entries || [],
      users: [{ store_name: 'Сливен' }, { store_name: 'Петрич' }]
    }
  });
}
function mod(h) { return h.doc.getElementById('mod-supply'); }

/* Рязане на реалния index.ts преди Deno.serve — същото като в
   task-report-supply.test.js. */
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
  const dir = path.join(os.tmpdir(), 'tmax-supply-note');
  fs.mkdirSync(dir, { recursive: true });
  const h = require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);
  const out = path.join(dir, 'routed-' + h + '.mjs');
  fs.writeFileSync(out, s);
  return out;
}
const text = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

(async function () {
  section('1. Формата: колона „Коментар" и предзареждане');
  {
    const h = env(STORE);
    const wk = h.w.supplyWeekStart();
    h.setData('supply_entries', () => [
      { id: 'e-a', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 3, qty2: 1, note: EVIL }
    ]);
    if (guard('loadSupply() не хвърля', () => h.w.loadSupply())) {
      await ticks(6);
      const m = mod(h);
      const heads = Array.from(m.querySelectorAll('thead th')).map(th => th.textContent.trim());
      ok('„Коментар" е веднага след „Брой за трансфер/поръчка"',
        heads.indexOf('Коментар') === heads.indexOf('Брой за трансфер/поръчка') + 1, heads.join('|'));
      ok('„Миналата седмица" остава последна', heads[heads.length - 1] === 'Миналата седмица', heads.join('|'));
      const na = h.doc.getElementById('sup-note-it-a'), nb = h.doc.getElementById('sup-note-it-b');
      ok('поле за коментар на всеки ред, type=text', !!na && !!nb && na.type === 'text');
      ok('placeholder „по желание"', na && na.getAttribute('placeholder') === 'по желание');
      ok('кавички и HTML: value е ТОЧНО текстът (escAttr не е счупил атрибута)', na && na.value === EVIL, na && na.value);
      ok('няма инжектиран <b> в реда', !m.querySelector('tr b'));
      ok('ред без запис: празно поле, не „—"', nb && nb.value === '', nb && nb.value);
      ok('maxlength=500', na && na.getAttribute('maxlength') === '500');
      ok('телефон: полето е в .tbl-wrap (хоризонтален скрол) с min-width, без фиксирана ширина над екрана',
        !!na && !!na.closest('.tbl-wrap') && /min-width:140px/.test(na.getAttribute('style')) && /width:100%/.test(na.getAttribute('style')));
    }
  }

  section('2. Запис на нов ред с коментар и без коментар');
  {
    const h = env(STORE);
    h.w.loadSupply(); await ticks(6);
    h.doc.getElementById('sup-q1-it-a').value = '5';
    h.doc.getElementById('sup-note-it-a').value = '  ' + EVIL + '  ';
    h.doc.getElementById('sup-q1-it-b').value = '2';
    h.doc.getElementById('sup-note-it-b').value = '   ';
    realClick(h.w, btn(mod(h), 'Запази'));
    await ticks(8);
    ok('два POST', h.calls.post.length === 2, String(h.calls.post.length));
    const pa = (h.calls.post.find(p => p.body.item_id === 'it-a') || {}).body || {};
    const pb = (h.calls.post.find(p => p.body.item_id === 'it-b') || {}).body || {};
    ok('с коментар: note е подрязаният текст (сурово, без escaping в базата)', pa.note === EVIL, JSON.stringify(pa.note));
    ok('само интервали -> note null (ключът го има)', 'note' in pb && pb.note === null, JSON.stringify(pb));
    ok('бройките са непроменени', pa.qty1 === 5 && pb.qty1 === 2);
    ok('„Запазено"', h.calls.toast.some(t => t.indexOf('Запазено') >= 0), h.calls.toast.join(' | '));
  }

  section('3. Ред САМО с коментар се създава');
  {
    const h = env(STORE);
    h.w.loadSupply(); await ticks(6);
    h.doc.getElementById('sup-note-it-a').value = 'спрян от доставчика';
    realClick(h.w, btn(mod(h), 'Запази'));
    await ticks(8);
    ok('един POST — за it-a', h.calls.post.length === 1 && h.calls.post[0].body.item_id === 'it-a', String(h.calls.post.length));
    const p = (h.calls.post[0] || {}).body || {};
    ok('qty1/qty2 null, note текстът', p.qty1 === null && p.qty2 === null && p.note === 'спрян от доставчика', JSON.stringify(p));
  }

  section('4. Редакция на съществуващ ред: смяна и изтриване на коментара');
  {
    const h = env(STORE);
    const wk = h.w.supplyWeekStart();
    const rows = [
      { id: 'e-a', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 3, qty2: 1, note: 'старо' },
      { id: 'e-b', template_id: 'tpl-fl', item_id: 'it-b', store_name: 'Сливен', week_start: wk, qty1: 2, qty2: null, note: 'за триене' }
    ];
    h.setData('supply_entries', () => rows);
    h.w.loadSupply(); await ticks(6);
    ok('предзаредено „старо"', h.doc.getElementById('sup-note-it-a').value === 'старо');
    h.doc.getElementById('sup-note-it-a').value = 'ново';
    h.doc.getElementById('sup-note-it-b').value = '';
    realClick(h.w, btn(mod(h), 'Запази'));
    await ticks(8);
    ok('два PATCH, нула POST', h.calls.patch.length === 2 && h.calls.post.length === 0, h.calls.patch.length + '/' + h.calls.post.length);
    const pa = (h.calls.patch.find(p => /id=eq\.e-a$/.test(p.url)) || {}).body || {};
    const pb = (h.calls.patch.find(p => /id=eq\.e-b$/.test(p.url)) || {}).body || {};
    ok('e-a: note = „ново", бройките запазени', pa.note === 'ново' && pa.qty1 === 3 && pa.qty2 === 1, JSON.stringify(pa));
    ok('e-b: изтрит коментар -> note null', 'note' in pb && pb.note === null, JSON.stringify(pb));
  }

  /* ЦО обобщение */
  function ovEnv(rows) {
    const h = env(ADMIN);
    const wk = h.w.supplyWeekStart();
    h.setData('supply_entries', () => rows(wk));
    return h;
  }
  section('5. ЦО обобщение: коментарите под матрицата, escaping, „попълнили"');
  {
    const h = ovEnv(wk => [
      { id: '1', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 5, qty2: 2, note: EVIL },
      { id: '2', template_id: 'tpl-fl', item_id: 'it-b', store_name: 'Петрич', week_start: wk, qty1: null, qty2: null, note: 'само коментар' },
      /* обект извън target_stores — коментарът му не влиза, както и бройките */
      { id: '3', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Габрово', week_start: wk, qty1: 9, qty2: null, note: 'чужд' }
    ]);
    h.w.loadSupply(); await ticks(8);
    const m = mod(h);
    ok('коментар от обект извън target_stores го няма', m.textContent.indexOf('чужд') < 0);
    ok('заявката чете note', h.calls.get.some(u => /supply_entries\?.*select=[^&]*\bnote\b/.test(decodeURIComponent(u))), h.calls.get.filter(u => /supply_entries/.test(u)).join('\n'));
    const box = m.querySelector('.sup-notes');
    ok('блок „💬 Коментари от обектите" е там', !!box && box.textContent.indexOf('Коментари от обектите') >= 0);
    const rowsTxt = box ? Array.from(box.querySelectorAll('.sup-note-row')).map(d => d.textContent) : [];
    ok('два реда: Сливен · Балатум 4м. и Петрич · Балатум 3м.', rowsTxt.length === 2 &&
      rowsTxt[0] === 'Сливен · Балатум 4м.: ' + EVIL && rowsTxt[1] === 'Петрич · Балатум 3м.: само коментар', JSON.stringify(rowsTxt));
    ok('HTML от коментара НЕ е рендиран (няма <b> вътре в блока)', box && !box.querySelector('.sup-note-row span b'));
    ok('блокът е след таблицата', m.innerHTML.indexOf('sup-matrix') < m.innerHTML.indexOf('sup-notes'));
    const title = (m.querySelector('.card-title') || {}).textContent || '';
    ok('„попълнили 1 от 2" — редът само с коментар не брои', title.indexOf('попълнили 1 от 2') >= 0, title);
    const st = Array.from(m.querySelectorAll('.sup-ov-store')).map(s => s.textContent.trim() + ':' + s.getAttribute('data-filled')).join('|');
    ok('Петрич е ⬜', st.indexOf('⬜ Петрич:0') >= 0, st);

    /* „Скрий празните" не крие ред само с коментар */
    const cb = m.querySelector('.sup-hide-empty');
    cb.checked = true; H.fire(h.w, cb, 'change');
    const vis = Array.from(mod(h).querySelectorAll('tr[data-item]')).map(t => t.getAttribute('data-item')).join(',');
    ok('„Скрий празните": it-b (само коментар) остава', vis === 'it-a,it-b', vis);

    /* филтър по доставчик — само коментарите на видимите редове */
    const chip = Array.from(mod(h).querySelectorAll('.sup-chip')).find(c => c.textContent.trim() === 'ВАМКО ООД');
    realClick(h.w, chip);
    const rows2 = Array.from(mod(h).querySelectorAll('.sup-note-row')).map(d => d.textContent);
    ok('филтър ВАМКО: остава само коментарът на Балатум 4м.', rows2.length === 1 && rows2[0].indexOf('Балатум 4м.') >= 0, JSON.stringify(rows2));
  }

  section('6. ЦО обобщение без коментари: блокът го няма');
  {
    const h = ovEnv(wk => [
      { id: '1', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 5, qty2: 2, note: null },
      { id: '2', template_id: 'tpl-fl', item_id: 'it-b', store_name: 'Петрич', week_start: wk, qty1: 1, qty2: 1, note: '   ' }
    ]);
    h.w.loadSupply(); await ticks(8);
    ok('няма .sup-notes и няма „Коментари"', !mod(h).querySelector('.sup-notes') && mod(h).textContent.indexOf('Коментари') < 0);
  }

  section('6б. target_stores=null: обект само с коментар НЕ получава празна колона');
  {
    const h = env(ADMIN);
    const wk = h.w.supplyWeekStart();
    h.setData('supply_templates', [Object.assign({}, TPL, { target_stores: null })]);
    h.setData('supply_entries', () => [
      { id: '1', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 5, qty2: 2, note: null },
      { id: '2', template_id: 'tpl-fl', item_id: 'it-b', store_name: 'Петрич', week_start: wk, qty1: null, qty2: null, note: 'само коментар' }
    ]);
    h.w.loadSupply(); await ticks(8);
    const m = mod(h);
    const top = Array.from(m.querySelectorAll('table.sup-matrix thead tr:first-child th')).map(th => th.textContent.trim());
    ok('колони: само Сливен (+ Общо), без Петрич', top.indexOf('Петрич') < 0 && top.indexOf('Сливен') >= 0, top.join('|'));
    const rowsTxt = Array.from(m.querySelectorAll('.sup-note-row')).map(d => d.textContent);
    ok('коментарът на Петрич е в блока', rowsTxt.length === 1 && rowsTxt[0] === 'Петрич · Балатум 3м.: само коментар', JSON.stringify(rowsTxt));
  }

  section('7. Excel: лист „Коментари" само ако има');
  {
    async function exportWith(rows) {
      const h = ovEnv(rows);
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
    const a = await exportWith(wk => [
      { id: '1', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 5, qty2: 2, note: EVIL }
    ]);
    ok('два листа: бланката и „Коментари"', a.sheets.join('|') === 'Подови настилки|Коментари', a.sheets.join('|'));
    ok('матрицата: заглавката без „Коментар"', (a.aoas[0][0] || []).indexOf('Коментар') < 0, (a.aoas[0][0] || []).join('|'));
    ok('листът: заглавка Обект|САП|Име|Доставчик|Коментар', (a.aoas[1] || [[]])[0].join('|') === 'Обект|САП|Име|Доставчик|Коментар');
    ok('ред: Сливен, Балатум 4м., суровият текст', JSON.stringify((a.aoas[1] || [])[1]) === JSON.stringify(['Сливен', '', 'Балатум 4м.', 'ВАМКО ООД', EVIL]), JSON.stringify((a.aoas[1] || [])[1]));
    const b = await exportWith(wk => [
      { id: '1', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Сливен', week_start: wk, qty1: 5, qty2: 2, note: null }
    ]);
    ok('без коментари: един лист', b.sheets.length === 1 && b.aoas.length === 1, b.sheets.join('|'));
  }

  section('8. Имейл (send-routed-report): коментарът под реда, само ако го има');
  {
    let T = null;
    try { T = await import(pathToFileURL(slice(ROUTED, ['collectSupplyReport', 'supplyReportSectionHtml', 'supplyReportSummary'])).href); }
    catch (e) { ok('routed се внася', false, e && e.message); }
    if (ok('модулът е зареден', !!T)) {
      const MON = '2026-10-05';
      const gets = [];
      const data = {
        supply_templates: [TPL],
        supply_template_items: ITEMS,
        supply_entries: [
          { id: '1', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Сливен', week_start: MON, qty1: 3, qty2: 1, note: EVIL },
          { id: '2', template_id: 'tpl-fl', item_id: 'it-a', store_name: 'Петрич', week_start: MON, qty1: 2, qty2: null, note: null },
          { id: '3', template_id: 'tpl-fl', item_id: 'it-b', store_name: 'Петрич', week_start: MON, qty1: null, qty2: null, note: 'само коментар' }
        ]
      };
      globalThis.fetch = function (url) {
        const u = new URL(url, 'http://x');
        const table = u.pathname.split('/').pop();
        gets.push(table + '?' + decodeURIComponent(u.search.slice(1)));
        const off = Number(u.searchParams.get('offset') || 0);
        const rows = off ? [] : (data[table] || []);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
      };
      const rep = await T.collectSupplyReport(MON, ['Петрич', 'Сливен']);
      const html = T.supplyReportSectionHtml(rep);
      const t = text(html);
      ok('заявката за записите чете note', gets.some(g => /^supply_entries\?.*select=[^&]*,note(&|$)/.test(g)), gets.join(' | '));
      ok('„💬 Сливен: …" с ескейпнат текст', html.indexOf('💬 Сливен: Няма "място" &lt;b&gt;щанд&lt;/b&gt; &amp; край') >= 0,
        (html.match(/💬[^<]*/g) || []).join(' | '));
      ok('няма суров <b>щанд</b>', html.indexOf('<b>щанд</b>') < 0);
      ok('коментарът е СЛЕД стойностите на същия ред', html.indexOf('Петрич 2/—') >= 0 && html.indexOf('Петрич 2/—') < html.indexOf('💬 Сливен'), t);
      ok('Петрич (без коментар) няма 💬 ред за Балатум 4м.', (html.match(/💬 Петрич/g) || []).length === 1);
      ok('ред само с коментар (Балатум 3м.) се показва с „💬 Петрич: само коментар"', t.indexOf('Балатум 3м.') >= 0 && t.indexOf('💬 Петрич: само коментар') >= 0, t);
      ok('„Попълнили 2 от 2" — непроменено (Петрич има бройка за it-a)', t.indexOf('Попълнили 2 от 2') >= 0, t);
      ok('„Общо: 5 / 1" — коментарът не пипа сумите', t.indexOf('Общо: 5 / 1') >= 0, t);

      const sum = T.supplyReportSummary(rep).templates[0];
      ok('dry_run: rows = 1 (само артикулите с бройки), notes = 2', sum.rows === 1 && sum.notes === 2, JSON.stringify(sum));

      /* Бланка само с коментари: „Няма попълнени данни", без „Общо", коментарът стои */
      const onlyNote = data.supply_entries.slice();
      data.supply_entries = [onlyNote[2]];
      const html3 = T.supplyReportSectionHtml(await T.collectSupplyReport(MON, ['Петрич', 'Сливен']));
      const t3 = text(html3);
      ok('само коментари: „Няма попълнени данни за седмицата"', t3.indexOf('Няма попълнени данни за седмицата') >= 0, t3);
      ok('само коментари: без „Общо" и без легенда', t3.indexOf('Общо:') < 0 && t3.indexOf('Места в зала / Брой') < 0, t3);
      ok('само коментари: „💬 Петрич: само коментар" е там', t3.indexOf('💬 Петрич: само коментар') >= 0, t3);
      ok('само коментари: „Попълнили 0 от 2"', t3.indexOf('Попълнили 0 от 2') >= 0, t3);
      data.supply_entries = onlyNote;

      data.supply_entries.forEach(e => { e.note = null; });
      data.supply_entries.pop();
      const html2 = T.supplyReportSectionHtml(await T.collectSupplyReport(MON, ['Петрич', 'Сливен']));
      ok('без коментари: нито един 💬 в секцията', html2.indexOf('💬') < 0);
      ok('без коментари: Балатум 3м. (празен ред) го няма', text(html2).indexOf('Балатум 3м.') < 0);
    }
  }

  section('9. Шапката на едж функцията: v16 е най-горе');
  {
    const src = fs.readFileSync(ROUTED, 'utf8');
    const head = src.slice(0, src.indexOf('*/'));
    ok('v16 (11.10.2026) е преди v15', /v16 \(11\.10\.2026\)/.test(head) && head.indexOf('v16 (') < head.indexOf('v15 ('));
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
