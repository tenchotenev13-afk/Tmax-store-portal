/* Три поправки (15.11.2026, сесия korekcii-1511):
   1. Преоценка — таблицата: дълъг текст се пренася в клетката, а широката
      таблица (розовите полета на ЦО) скролира в собствената си кутия, вместо
      да излиза от картата. Правилата са в index.html, ограничени до
      #mod-revaluation. jsdom НЕ смята лейаут (CLAUDE.md т.12) — правилата се
      заковават с регекс, а тук се проверява само, че ВСИЧКИ изгледи на
      бланката (обект — чернова / обработена; ЦО — чакаща / одобрена с полета;
      регионален) рисуват таблицата в .tbl-compact вътре в #mod-revaluation,
      тоест правилата ги хващат. Визуално — човек / чатът в браузъра.
   2. push.js — без неизползвания REST ключ на OneSignal (OS_API_KEY).
   3. Каталог — CSV с кавички (parseDelimitedCatalog / parseDelimitedRecords,
      admin.js): поле в "…" не се цепи по разделителя, "" = кавичка; BOM, таб,
      ; и , — както преди; разделителят се гадае по заглавния ред.

   Мутационна проверка (15.11.2026) — всеки вариант е пуснат и е паднал:
     K1 parseDelimitedRecords без кавичките (q никога true) → пада „описание
        със запетая в кавички — БМЕ остава БР“;
     K2 "" не се свежда до една кавичка → пада „"" вътре → една кавичка“;
     K3 разделителят пак по целия файл → пада „; в описание при CSV със
        запетаи не обръща разделителя“;
     K4 без BOM махането → пада „BOM + заглавие в кавички“ (незакавиченото
        заглавие минава и без него — trim() маха U+FEFF);
     K5 правилото за пренасяне махнато от index.html → пада „Описание и
        Коментар обект — overflow-wrap:anywhere“;
     K7 пренасяне „навсякъде“ за ВСИЧКИ клетки (първата версия) → пада „не за
        всички клетки“ — при 1100px кодът се цепеше на „801/234/5“ (мерено в
        браузър 15.11.2026);
     K8 класът tbl-rv-sheet махнат от бланката → пада „обект — чернова“ и
        останалите изгледи;
     K6 кавичка в средата на поле без кавички отваря кавички → пада
        „25/80" в средата — буквална кавичка“.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, dayOffset, ticks } = H;

const ROOT = path.resolve(process.argv[2] || '.');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const PUSH = fs.readFileSync(path.join(ROOT, 'push.js'), 'utf8');

const CAMP = { id: 'c-1', title: 'Пожелателна преоценка 11.2026', kind: 'optional', starts_on: dayOffset(-1), ends_on: dayOffset(1), default_pct: 50, status: 'open' };
const LONG = 'ПРЕОЦ.ШЕЗЛОНГ2-ПОЗИЦ.МЕТАЛ+ТЕКСТ60/153/8';
const item = (id, sub, store, o) => Object.assign({ id, submission_id: sub, campaign_id: 'c-1', store_name: store, sort_order: 1, sap_code: '8012345',
  product_name: LONG, unit: 'бр.', qty: 1, std_price: 10, discount_pct: 50, proposed_price: 5, store_comment: 'Наранени,остатъчно количество',
  new_sap_code: null, sale_price: null, co_qty: null, co_comment: null }, o || {});
function filt(rows, url) {
  const q = decodeURIComponent(String(url).split('?')[1] || '');
  let out = rows.slice();
  q.split('&').forEach(p => {
    const m = /^([a-z_]+)=eq\.(.*)$/.exec(p); if (m) out = out.filter(r => String(r[m[1]]) === m[2]);
    const mi = /^([a-z_]+)=in\.\((.*)\)$/.exec(p); if (mi) { const v = mi[2].split(','); out = out.filter(r => v.indexOf(String(r[mi[1]])) >= 0); }
  });
  return out;
}
function rvEnv(user, status, extraUsers) {
  const subs = [{ id: 's-k', campaign_id: 'c-1', store_name: 'Кърджали', status, no_items: false, submitted_at: new Date().toISOString() }];
  const items = [item('i-1', 's-k', 'Кърджали', status === 'processed' ? { new_sap_code: '8012345', sale_price: 5, co_qty: 1 } : {})];
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user,
    data: {
      revaluation_campaigns: [CAMP], revaluation_submissions: url => filt(subs, url), revaluation_items: url => filt(items, url),
      revaluation_codes: [], product_catalog: [], stores: [{ name: 'Кърджали' }, { name: 'Шумен' }],
      users: url => filt(extraUsers || [], url), app_settings: []
    }
  });
  h.w.rvStoresOn = true;
  return h;
}
const inRvCompact = h => {
  const t = h.doc.querySelector('#mod-revaluation #rv-rows');
  const wrap = t && t.closest('.tbl-compact');
  return !!wrap && wrap.classList.contains('tbl-rv-sheet') && !!wrap.closest('#mod-revaluation');
};

(async function run() {
  section('1. Преоценка — CSS правилата (само #mod-revaluation)');
  {
    ok('кутията: хоризонтален скрол', /#mod-revaluation \.tbl-compact\{overflow-x:auto;\}/.test(INDEX));
    ok('таблицата: автоматичен лейаут', /#mod-revaluation \.tbl-compact table\{table-layout:auto;\}/.test(INDEX));
    ok('Описание и Коментар обект — overflow-wrap:anywhere, но не под 160px',
      /#mod-revaluation \.tbl-rv-sheet td:nth-child\(2\),#mod-revaluation \.tbl-rv-sheet td:nth-child\(5\)\{overflow-wrap:anywhere;min-width:160px;\}/.test(INDEX));
    ok('не за всички клетки (иначе кодът се цепи на букви)', !/#mod-revaluation \.tbl-(compact|rv-sheet) td\{[^}]*overflow-wrap:anywhere/.test(INDEX));
    /* Правилата трябва да са СЛЕД @media(min-width:1200px) с .tbl-compact{overflow:visible;} и извън него. */
    const media = INDEX.indexOf('@media(min-width:1200px){\n  .tbl-compact{overflow:visible;}');
    const mine = INDEX.indexOf('#mod-revaluation .tbl-compact{overflow-x:auto;}');
    const mediaEnd = INDEX.indexOf('\n}', media);
    ok('след @media блока на .tbl-compact и извън него', media > 0 && mine > mediaEnd, media + ' / ' + mediaEnd + ' / ' + mine);
    ok('глобалните .tbl-compact правила — непипнати', INDEX.indexOf('.tbl-compact table{width:100%;table-layout:fixed;}') >= 0 && INDEX.indexOf('  .tbl-compact{overflow:visible;}') >= 0);
    ok('нито едно ново правило без #mod-revaluation', !/^\.tbl-compact td\{[^}]*overflow-wrap/m.test(INDEX));
  }

  section('1б. Всички изгледи рисуват таблицата в .tbl-compact вътре в #mod-revaluation');
  {
    const MGR = { email: 'm@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
    const CO = { email: 'e@temax.bg', display_name: 'Елица', role: 'controlling', store_name: 'Централен офис' };
    const REG = { email: 'r@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Кърджали'] };
    let h = rvEnv(MGR, 'draft'); await h.w.loadRevaluation(); await ticks(8);
    ok('обект — чернова', inRvCompact(h) && h.doc.querySelector('#rv-rows').textContent.indexOf(LONG) >= 0);
    h = rvEnv(MGR, 'processed'); await h.w.loadRevaluation(); await ticks(8);
    ok('обект — обработена (с розовите колони)', inRvCompact(h) && h.doc.querySelectorAll('#rv-rows td').length >= 12);
    h = rvEnv(CO, 'submitted'); await h.w.loadRevaluation(); await ticks(8); await h.w.rvCoOpenStore('Кърджали'); await ticks(8);
    ok('ЦО — чакаща регионалния', inRvCompact(h));
    h = rvEnv(CO, 'approved'); await h.w.loadRevaluation(); await ticks(8); await h.w.rvCoOpenStore('Кърджали'); await ticks(8);
    ok('ЦО — одобрена, с полета (най-широкият изглед)', inRvCompact(h) && h.doc.querySelectorAll('#rv-rows input[data-f="co_comment"]').length === 1);
    h = rvEnv(REG, 'submitted'); await h.w.loadRevaluation(); await ticks(8); await h.w.rvCoOpenStore('Кърджали'); await ticks(8);
    ok('регионален — с „Одобри“', inRvCompact(h) && !!btn(h.doc.getElementById('mod-revaluation'), 'Одобри'));
  }

  section('2. push.js — без REST ключа на OneSignal');
  {
    ok('в push.js няма „os_v2_“', PUSH.indexOf('os_v2_') < 0);
    ok('…нито OS_API_KEY', PUSH.indexOf('OS_API_KEY') < 0);
    ok('OS_APP_ID остава (публичен, нужен на клиента)', /var OS_APP_ID\s*=\s*'[0-9a-f-]{36}';/.test(PUSH));
    const h = boot({ modules: ['push.js'], user: { email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: {} });
    ok('модулът се зарежда, OS_API_KEY не е дефиниран', typeof h.w.OS_APP_ID === 'string' && typeof h.w.OS_API_KEY === 'undefined');
  }

  section('3. Каталог — CSV с кавички');
  {
    const h = boot({ modules: ['admin.js'], user: { email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: { product_catalog: [] } });
    const P = t => h.w.parseDelimitedCatalog(t);
    const HDR = 'Материал,Описание на Материал,БМЕ,Група материали,EAN/UPC код';
    /* Видът от реалния износ: описание със запетая в кавички, " вътре като "". */
    const csv = '\uFEFF' + HDR + '\r\n' +
      '55001,"Резервоар 200л, за дъждовни резервоари",БР,G1,3800000000017\r\n' +
      '55002,"Маркуч 1/2"" 25/80""",ЛМ,G2,\r\n' +
      '55003,Стелаж 25/80" метал,БР,G3,\r\n' +
      '55004,"Кутия за организиране, 3 бр.; с капак",КУТ,G4,\r\n';
    const r = P(csv);
    ok('BOM — първата колона е „Материал“', r._detectedHeaders[0] === 'Материал' && r[0]['Материал'] === '55001', JSON.stringify(r._detectedHeaders));
    ok('описание със запетая в кавички — БМЕ остава БР', r[0]['БМЕ'] === 'БР' && r[0]['Описание на Материал'] === 'Резервоар 200л, за дъждовни резервоари', JSON.stringify(r[0]));
    ok('…и групата / EAN на мястото си', r[0]['Група материали'] === 'G1' && r[0]['EAN/UPC код'] === '3800000000017');
    ok('"" вътре → една кавичка', r[1]['Описание на Материал'] === 'Маркуч 1/2" 25/80"' && r[1]['БМЕ'] === 'ЛМ', JSON.stringify(r[1]));
    ok('25/80" в средата — буквална кавичка, колоните не мърдат', r[2]['Описание на Материал'] === 'Стелаж 25/80" метал' && r[2]['БМЕ'] === 'БР', JSON.stringify(r[2]));
    ok('; в описание при CSV със запетаи не обръща разделителя', r[3]['БМЕ'] === 'КУТ' && r[3]['Описание на Материал'] === 'Кутия за организиране, 3 бр.; с капак', JSON.stringify(r[3]));
    ok('4 реда, без празния накрая', r.length === 4, r.length);
    /* Реалният случай от базата (15.11.2026): в кавички е „Група материали“, ПРЕДИ БМЕ —
       в базата стои category '"Бидони' и default_unit 'резервоари"'. */
    const real = P('Материал,Описание на Материал,Група материали,БМЕ\r\n' +
      '41001,БИДОН 20Л С ВИНТОВ КАПАК,"Бидони, резервоари",БР\r\n' +
      '41002,ФАЯНС PLANET BLUE 25/80 BR,"Фаянс Испания 28/85, 25/80",M2\r\n');
    ok('реалният случай: група „Бидони, резервоари“, БМЕ БР', real[0]['Група материали'] === 'Бидони, резервоари' && real[0]['БМЕ'] === 'БР', JSON.stringify(real[0]));
    ok('реалният случай: фаянс — БМЕ M2', real[1]['БМЕ'] === 'M2' && real[1]['Група материали'] === 'Фаянс Испания 28/85, 25/80', JSON.stringify(real[1]));
    /* BOM пред заглавие в кавички: без махането на BOM кавичката не се разпознава
       (trim() маха \uFEFF, затова незакавиченото заглавие минава и без него). */
    const qb = P('\uFEFF"Материал","Описание на Материал","БМЕ"\r\n"90001","Лампа, LED","БР"\r\n');
    ok('BOM + заглавие в кавички — „Материал“ без кавички', qb._detectedHeaders[0] === 'Материал' && qb[0]['Материал'] === '90001' && qb[0]['БМЕ'] === 'БР', JSON.stringify(qb._detectedHeaders));
    /* ; разделител (европейски износ) — запетаята в числото и описанието не цепи */
    const semi = 'Материал;Описание на Материал;БМЕ\n60001;"Резервоар; 50 л";БР\n60002;Тръба 0,5 м;ЛМ\n';
    const s = P(semi);
    ok('; разделител: кавички с ; вътре', s[0]['БМЕ'] === 'БР' && s[0]['Описание на Материал'] === 'Резервоар; 50 л', JSON.stringify(s[0]));
    ok('; разделител: запетая без кавички не цепи', s[1]['Описание на Материал'] === 'Тръба 0,5 м' && s[1]['БМЕ'] === 'ЛМ');
    /* таб — както преди */
    const tab = 'Материал\tОписание на Материал\tБМЕ\n70001\t"Табла, 2 бр."\tБР\n';
    const t = P(tab);
    ok('таб разделител: кавички и запетая', t[0]['Описание на Материал'] === 'Табла, 2 бр.' && t[0]['БМЕ'] === 'БР', JSON.stringify(t[0]));
    ok('нов ред вътре в кавички не цепи записа', P('Материал,Описание на Материал,БМЕ\n80001,"ред1\nред2",БР\n')[0]['БМЕ'] === 'БР');

    /* Истинският път: модал → файл → „Започни импорт“ → POST към product_catalog */
    h.w.openCatalogImportModal();
    const inp = h.doc.getElementById('catalog-file-inp');
    Object.defineProperty(inp, 'files', { value: [new h.w.File([csv], 'katalog.csv', { type: 'text/csv' })] });
    realClick(h.w, btn(h.doc.getElementById('catalog-import-ov'), 'Започни импорт'));
    for (let i = 0; i < 40 && !h.calls.post.some(x => x.table === 'product_catalog'); i++) await ticks(5);
    const post = h.calls.post.find(x => x.table === 'product_catalog');
    const units = post ? post.body.map(x => x.sap_code + ':' + x.default_unit).join(',') : '';
    ok('импортът качва верните мерни единици', units === '55001:бр.,55002:л.м,55003:бр.,55004:кут', units);
    ok('…без текст от описанието в default_unit', post && post.body.every(x => !/резервоари|организиране|25\/80/.test(x.default_unit)));
  }

  report();
})().catch(e => {
  console.log('  ❌ тестът гръмна: ' + ((e && e.stack) || e));
  process.exit(1);
});
