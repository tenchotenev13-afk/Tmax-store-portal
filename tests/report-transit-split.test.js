/* „🚚 Стока на път" в таб „Днес" и в седмичния отчет — застоялите редове
   РАЗДЕЛЕНИ на три по отговора на получателя (решение на Тенчо 20.11.2026,
   сесия report-transit-split):
     1) без отговор от обекта — червено при > 0;
     2) отбелязани „✕ Недоставена" (reviewed_at или стар status 'rejected');
     3) „🔍 Чака засечка" (recon_at).
   Всеки ред е в ТОЧНО една група (двете отметки → недоставена), сборът е
   старото transitStale — то не сменя смисъла си.

   Покрито (за report.js И за копието в send-scheduled-report/index.ts):
     - трите групи с по един ред; двойна отметка → недоставена; сборът точен;
     - стар status 'rejected' → недоставена (стъб без филтъра по статус —
       живата заявка тегли само pending/sent, затова такъв ред на живо не идва;
       правилото е огледално на transitRecvStatus в transit.js);
     - ред под прага: не влиза в картите, но е в „отворени";
     - обект само с недоставени → без червено; обект с 1 без отговор →
       червено и най-отгоре (дори по-млад от другите);
     - 0 застояли → една карта, байт в байт както преди;
     - transitStale = сборът; „Непълни данни" при паднала заявка — както досега.
   Мутации (вътре в теста, върху изходния код на report.js; всяка трябва да
   падне на поне една проверка):
     М1 засечката пак в „без отговор";  М2 двойната отметка броена два пъти;
     М3 червено и при само недоставени;  М4 сортировката без „без отговор
     най-отгоре".
   Оцелял мутант: няма.

   Пускане:  node tests/report-transit-split.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const CLIENT_SRC = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
const EDGE_SRC = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const USERS = ['Враца', 'Габрово', 'Добрич', 'Дупница', 'Карлово', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

function dayShift(n) {
  const d = new Date(); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
const STAMP = new Date(Date.now() - 86400000).toISOString();
const row = (store, days, extra) => Object.assign({
  store_name: store, supplier: 'ТЕСИ', material_name: 'АРТ', remaining_qty: 1, unit: 'бр',
  doc_date: dayShift(-days), status: 'pending', direction: 'incoming',
  reviewed_at: null, recon_at: null, created_at: STAMP
}, extra || {});

/* Враца — 1 без отговор (застоял) + 1 под прага; Габрово — само недоставена
   (най-старата, 30 дни); Добрич — засечка; Дупница — двете отметки. */
const BASE = [
  row('Враца', 12),
  row('Враца', 3),
  row('Габрово', 30, { reviewed_at: STAMP }),
  row('Добрич', 15, { recon_at: STAMP }),
  row('Дупница', 20, { reviewed_at: STAMP, recon_at: STAMP, status: 'sent' }),
  row('Карлово', 25, { status: 'received' })          /* приключена — не е отворена */
];
const REJECTED = row('Карлово', 9, { status: 'rejected' });

/* Стъбът спазва status=in.(…), както PostgREST. noFilter — за стар 'rejected'. */
function stub(rows, noFilter) {
  return function (url) {
    const m = String(url).match(/status=in\.\(([^)]*)\)/);
    if (noFilter || !m) return rows.filter(r => r.status !== 'received');
    const a = m[1].split(',');
    return rows.filter(r => a.indexOf(r.status) >= 0);
  };
}

function grabFn(src, name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) throw new Error('няма ' + name);
  let d = 0, st = false;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; st = true; } else if (c === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('незатворена ' + name);
}
const FNS = ['collectCrossModuleWeeklySummary', 'reportTransitListHtml', 'buildCrossModuleSectionHtml'];
const stripTs = s => s.replace(/:\s*any(\[\])?(?=[\s,)=;])/g, '').replace(/ as any/g, '');

/* variant: 'client' (report.js както е зареден), 'edge' (трите функции от
   index.ts презаписват клиентските), или {src, mut} — мутант върху report.js. */
function env(variant, data, failGet) {
  const h = boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    fail: failGet ? { GET: failGet } : undefined,
    data: Object.assign({
      users: USERS, client_orders: [], transport_orders: [], stock_returns: [],
      differences_reports: [], stock_differences: [], kasa_storno: [], kasa_zoborot: [],
      transport_pallets: [], app_settings: []
    }, data)
  });
  let code = null;
  if (variant === 'edge') code = FNS.map(n => stripTs(grabFn(EDGE_SRC, n))).join('\n');
  else if (variant && variant.mut) code = FNS.map(n => grabFn(CLIENT_SRC, n)).join('\n').split(variant.mut[0]).join(variant.mut[1]);
  if (code) h.w.eval(code);
  return h;
}
const collect = (h, scope) => new Promise(res => h.w.collectCrossModuleWeeklySummary(res, null, scope || null));
const storeRow = (html, store) => {
  const parts = html.split('<div style="padding:7px 10px;');
  return parts.filter(p => p.indexOf('>' + store + '<') >= 0)[0] || '';
};
const transitBlock = html => {
  const a = html.indexOf('🚚 Стока на път'), b = html.indexOf('📦 Палети');
  return a >= 0 && b > a ? html.slice(a, b) : '';
};

/* Всички проверки — като {име, резултат}; за мутантите се търси поне един провал. */
async function checks(variant) {
  const out = [];
  const add = (name, cond, detail) => out.push({ name, cond: !!cond, detail: detail || '' });

  {
    const h = env(variant, { goods_transit: stub(BASE) });
    const c = await collect(h);
    add('отворени общо 5 (без приключената), застояли 4',
      c && c.transitByStore.reduce((s, g) => s + g.open, 0) === 5 && c.transitStale === 4,
      c && JSON.stringify(c.transitByStore));
    add('без отговор = 1 (Враца)', c && c.transitNoAnswer === 1, c && c.transitNoAnswer);
    add('недоставени = 2 (Габрово + Дупница с двете отметки)', c && c.transitUndelivered === 2, c && c.transitUndelivered);
    add('засечка = 1 (Добрич)', c && c.transitRecon === 1, c && c.transitRecon);
    add('сборът на трите = transitStale',
      c && c.transitNoAnswer + c.transitUndelivered + c.transitRecon === c.transitStale);
    const byS = {}; (c ? c.transitByStore : []).forEach(g => { byS[g.store] = g; });
    add('Враца: 2 отворени, 1 застоял, 1 без отговор (редът под прага е само в отворени)',
      byS['Враца'] && byS['Враца'].open === 2 && byS['Враца'].stale === 1 && byS['Враца'].noAnswer === 1 &&
      byS['Враца'].undelivered === 0 && byS['Враца'].recon === 0, JSON.stringify(byS['Враца']));
    add('Дупница: двете отметки → 1 недоставена, 0 засечка',
      byS['Дупница'] && byS['Дупница'].undelivered === 1 && byS['Дупница'].recon === 0 && byS['Дупница'].stale === 1,
      JSON.stringify(byS['Дупница']));
    add('Враца е първа (има без отговор), макар Габрово да е по-стара',
      c && c.transitByStore[0] && c.transitByStore[0].store === 'Враца',
      c && c.transitByStore.map(g => g.store).join(','));

    const sec = h.w.buildCrossModuleSectionHtml(c, false);
    const blk = transitBlock(sec);
    add('заглавието носи прага веднъж', blk.indexOf('Стока на път — застояли над 7 дни по документ') >= 0 &&
      blk.split('над 7 дни').length === 2, blk.slice(0, 200));
    add('три карти с етикетите', blk.indexOf('без отговор от обекта') >= 0 &&
      blk.indexOf('отбелязани недоставени') >= 0 && blk.indexOf('чака засечка') >= 0);
    add('картата „без отговор" е червена (1)',
      sec.indexOf(h.w.crossMetricCard(1, 'без отговор от обекта', true)) >= 0);
    add('„недоставени" и „засечка" — сиви',
      sec.indexOf(h.w.crossMetricCard(2, 'отбелязани недоставени', false)) >= 0 &&
      sec.indexOf(h.w.crossMetricCard(1, 'чака засечка', false)) >= 0);
    add('старата една карта я няма', sec.indexOf('застояли (>7 дни по документ)') < 0);

    const list = h.w.reportTransitListHtml(c, false);
    const vr = storeRow(list, 'Враца'), gb = storeRow(list, 'Габрово');
    add('ред Враца: „2 отворени · 1 без отговор · 0 недоставени · 0 засечка · най-старата от 12 дни"',
      vr.indexOf('2 отворени · ') >= 0 && vr.indexOf('1 без отговор</b> · 0 недоставени · 0 засечка · най-старата от 12 дни') >= 0, vr);
    add('ред Враца — червен', vr.indexOf('#C0392B;">1 без отговор') >= 0, vr);
    add('ред Габрово (само недоставени) — без червено', gb && gb.indexOf('#C0392B') < 0, gb);
    add('ред Дупница: 1 недоставени · 0 засечка', storeRow(list, 'Дупница').indexOf('0 без отговор</b> · 1 недоставени · 0 засечка') >= 0,
      storeRow(list, 'Дупница'));
    add('Враца е най-отгоре в списъка', list.indexOf('>Враца<') >= 0 && list.indexOf('>Враца<') < list.indexOf('>Габрово<'));
    h.close();
  }

  {
    const h = env(variant, { goods_transit: stub(BASE.concat([REJECTED]), true) });
    const c = await collect(h);
    add('стар status \'rejected\' (без reviewed_at) → недоставена',
      c && c.transitUndelivered === 3 && c.transitStale === 5, c && JSON.stringify([c.transitUndelivered, c.transitStale]));
    h.close();
  }

  {
    /* Обект само с недоставени и под прага — срязан изглед. */
    const h = env(variant, { goods_transit: stub([row('Габрово', 30, { reviewed_at: STAMP }), row('Габрово', 2)]) });
    const c = await collect(h, ['Габрово']);
    const sec = h.w.buildCrossModuleSectionHtml(c, true);
    add('само недоставени: никаква червена карта в блока', transitBlock(sec).indexOf('#C0392B') < 0, transitBlock(sec));
    add('само недоставени: срязаният ред „2 отворени · 0 без отговор · 1 недоставени"',
      sec.indexOf('2 отворени · <b style="color:#4b5563;">0 без отговор</b> · 1 недоставени') >= 0);
    h.close();
  }

  {
    /* 0 застояли (само под прага) и 0 реда — блокът е старата карта с 0. */
    const old0 = (w) => w.crossModuleRow('🚚', 'Стока на път', w.crossMetricCard(0, 'застояли (>7 дни по документ)', false));
    const h = env(variant, { goods_transit: stub([row('Враца', 2)]) });
    const c = await collect(h);
    add('0 застояли: transitStale 0 и трите по 0',
      c && c.transitStale === 0 && c.transitNoAnswer === 0 && c.transitUndelivered === 0 && c.transitRecon === 0);
    add('0 застояли: блокът е байт в байт старата карта', h.w.buildCrossModuleSectionHtml(c, false).indexOf(old0(h.w)) >= 0);
    add('0 застояли: пълният списък е празен, срязаният показва обекта',
      h.w.reportTransitListHtml(c, false) === '' && h.w.reportTransitListHtml(c, true).indexOf('1 отворена') >= 0);
    h.close();
    const h2 = env(variant, { goods_transit: [] });
    const c2 = await collect(h2);
    add('0 реда: блокът е старата карта с 0, без списък',
      h2.w.buildCrossModuleSectionHtml(c2, false).indexOf(old0(h2.w)) >= 0 && h2.w.reportTransitListHtml(c2, false) === '');
    h2.close();
  }

  {
    const h = env(variant, { goods_transit: stub(BASE) }, url => /goods_transit/.test(url));
    const c = await collect(h);
    const html = h.w.buildCrossModuleSectionHtml(c, false);
    add('паднала заявка → „⚠️ Непълни данни — прочетени 0 реда" както досега',
      html.indexOf('⚠️ Непълни данни — прочетени 0 реда, четенето прекъсна (goods_transit)') >= 0);
    h.close();
  }
  return out;
}

(async function () {
  for (const v of ['client', 'edge']) {
    section(v === 'client' ? '1. report.js' : '2. Копието в send-scheduled-report/index.ts');
    const res = await checks(v);
    res.forEach(r => ok(r.name, r.cond, String(r.detail)));
  }

  section('3. Заявката и dry_run');
  [['report.js', CLIENT_SRC], ['едж', EDGE_SRC]].forEach(function (p) {
    const line = p[1].split('\n').filter(l => l.indexOf("reportGetAll('goods_transit'") >= 0)[0] || '';
    ok(p[0] + ': заявката тегли reviewed_at и recon_at',
      /select=[^&']*reviewed_at/.test(line) && /select=[^&']*recon_at/.test(line), line);
    ok(p[0] + ': не гледа sender_status', line.indexOf('sender_status') < 0, line);
  });
  ok('едж: weekly dry_run връща трите числа',
    EDGE_SRC.indexOf('noAnswer:wkCross.transitNoAnswer, undelivered:wkCross.transitUndelivered, recon:wkCross.transitRecon') >= 0);

  section('4. Мутации (всяка трябва да падне)');
  const MUTANTS = [
    ['М1 засечката пак в „без отговор"', ["if (row.recon_at) return 'recon';", ''], /без отговор = 1|засечка = 1/],
    ['М2 двойната отметка броена два пъти', ["        else if (k === 'recon')", "        if (x.recon_at) { g.recon++; transitSplit.recon++; }\n        if (k === 'recon')"], /сборът|Дупница/],
    ['М3 червено и при само недоставени', ["(na>0?'#C0392B':'#4b5563')", "(g.stale>0?'#C0392B':'#4b5563')"], /без червено|0 без отговор/],
    ['М4 без „без отговор" най-отгоре', ["(b.noAnswer > 0 ? 1 : 0) - (a.noAnswer > 0 ? 1 : 0) ||", '0 ||'], /най-отгоре|е първа/]
  ];
  for (const m of MUTANTS) {
    ok(m[0] + ': мутацията се прилага', CLIENT_SRC.indexOf(m[1][0]) >= 0);
    const res = await checks({ mut: m[1] });
    const failed = res.filter(r => !r.cond).map(r => r.name);
    ok(m[0] + ': убит', failed.some(n => m[2].test(n)), 'паднали: ' + failed.join(' | '));
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
