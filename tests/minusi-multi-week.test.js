/* Минуси — „Минуси за седмицата" в писмото „повтарящи се артикули" (minus_multi),
   30.10.2026, сесия minusi-weekly-count (искане на Теодор, 29.10).

   Правилото (report.js и send-scheduled-report v63, еднакво — report-edge-sync):
   седмицата е пн–нд, завършваща в неделята от reportMinusMultiRefSunday;
   предходната — седмицата преди нея. Брои се САМО 955 (956 не). Промяна в % —
   (сегашна − предходна) / предходна × 100, цяло, със знак (+12% / −8%);
   предходна 0 → „—" (и при 0 и 0). Ред „Общо" за обектите в обхвата. „Данни до"
   — max(posting_date) на обектите в обхвата, всякакъв вид движение.
   Изпращане: без обхват — винаги; с обхват — поне един повтарящ се артикул ИЛИ
   поне един минус за седмицата в неговите обекти.

   Мутационна проверка (30.10.2026) — всеки вариант пуснат срещу report.js и паднал:
     W1 reportMinusMultiWeek брои и 956 (без проверката за mvt_type)      → пада
     W2 грешна граница: седмицата от ref − 7 (понеделникът на следващата
        / неделята на предходната влизат не там)                          → пада
     W3 reportMinusMultiPct без проверката за предходна 0 (Infinity / NaN) → пада
     W4 reportMinusMultiShouldSend без седмичния брой (само артикули)     → пада
     W5 reportMinusMultiForStores не реже седмицата по обхвата            → пада
   Пускане:  node tests/minusi-multi-week.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const GD = 'Гоце Делчев', MO = 'Монтана', PE = 'Петрич', TR = 'Троян';
const STORES = [GD, MO, PE, TR];
const REF = '2026-10-25';   /* неделя; седмица 19.10–25.10, предходна 12.10–18.10 */
let seq = 0;
function mv(store, type, date, material) {
  seq++;
  return { id: seq, store_name: store, material: material || ('M' + seq), material_desc: 'ОП', mvt_type: type,
    posting_date: date, mat_doc: 'D' + String(seq).padStart(4, '0'), doc_item: '1', action: null };
}
const rep = (n, store, type, date, mat) => Array.from({ length: n }, () => mv(store, type, date, mat));
/* Гоце Делчев: седмица 9 (вкл. 1 в понеделник 19.10 и 1 в неделя 25.10), предходна 8
   (вкл. 12.10 и 18.10) → +13%; 956 в седмицата ×5 — не се брои; 26.10 (понеделник
   на следващата) — не; 11.10 (неделя преди предходната) — не; lastDate = 26.10.
   Монтана: 3 / 4 → −25%. Петрич: 2 / 0 → „—". Троян: 0 / 0 → „—". */
const ROWS = [].concat(
  rep(1, GD, '955', '2026-10-19'), rep(7, GD, '955', '2026-10-22', '52215'), rep(1, GD, '955', '2026-10-25'),
  rep(5, GD, '956', '2026-10-23'),
  rep(1, GD, '955', '2026-10-12'), rep(6, GD, '955', '2026-10-15'), rep(1, GD, '955', '2026-10-18'),
  rep(2, GD, '955', '2026-10-26'), rep(3, GD, '955', '2026-10-11'),
  rep(3, MO, '955', '2026-10-24'), rep(4, MO, '955', '2026-10-14'), rep(1, MO, '956', '2026-10-24'),
  rep(2, PE, '955', '2026-10-21'),
  rep(1, 'Враца', '955', '2026-10-21')
);
const copy = a => a.map(x => Object.assign({}, x));
const ADMIN = { id: 'u-1', email: 'ten.tenev@temax.bg', display_name: 'Тен', role: 'admin', store_name: 'Централен офис' };

function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
/* Фалшива база, която ФИЛТРИРА като PostgREST: mvt_type=eq, posting_date gte/lte, store_name in. */
function install(h, db) {
  h.w.fetch = function (url, init) {
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    db.log.push({ tbl, q });
    if (tbl === 'app_settings') return resp(200, db.settings);
    if (tbl === 'minus_movements') {
      if (db.failWeek && !/mvt_type=eq/.test(q)) return resp(500, { message: 'boom' });
      if (/offset=[1-9]/.test(q)) return resp(200, []);
      const mt = (q.match(/mvt_type=eq\.(\d+)/) || [])[1];
      const gte = (q.match(/posting_date=gte\.([\d-]+)/) || [])[1];
      const lte = (q.match(/posting_date=lte\.([\d-]+)/) || [])[1];
      const inS = ((q.match(/store_name=in\.\(([^)]*)\)/) || [])[1] || '').split(',').map(s => s.replace(/"/g, ''));
      return resp(200, copy(db.movs.filter(x => (!mt || x.mvt_type === mt) && (!gte || x.posting_date >= gte) &&
        (!lte || x.posting_date <= lte) && inS.indexOf(x.store_name) >= 0)));
    }
    return resp(200, []);
  };
}

(async function () {
  const h = boot({ modules: ['minusi.js', 'report.js'], user: ADMIN, data: {} });
  const w = h.w;

  section('1. Процентът');
  ok('+12.5 → „+13%"', w.reportMinusMultiPct(9, 8) === '+13%', w.reportMinusMultiPct(9, 8));
  ok('3 / 4 → „−25%" (знак минус U+2212)', w.reportMinusMultiPct(3, 4) === '−25%', w.reportMinusMultiPct(3, 4));
  ok('5 / 5 → „0%"', w.reportMinusMultiPct(5, 5) === '0%');
  ok('предходна 0 → „—"', w.reportMinusMultiPct(2, 0) === '—', w.reportMinusMultiPct(2, 0));
  ok('0 и 0 → „—" (не NaN)', w.reportMinusMultiPct(0, 0) === '—', w.reportMinusMultiPct(0, 0));
  ok('0 / 3 → „−100%"', w.reportMinusMultiPct(0, 3) === '−100%');

  section('2. Седмицата по обект');
  const wk = w.reportMinusMultiWeek(copy(ROWS), STORES, REF);
  const r = s => wk.rows.filter(x => x.store === s)[0];
  ok('границите: 19.10–25.10, предходна 12.10–18.10', wk.from === '2026-10-19' && wk.to === REF && wk.prevFrom === '2026-10-12' && wk.prevTo === '2026-10-18', JSON.stringify([wk.from, wk.to, wk.prevFrom, wk.prevTo]));
  ok('Гоце Делчев 9 / 8 / +13% (956 и 26.10 / 11.10 не влизат)', r(GD).cur === 9 && r(GD).prev === 8 && r(GD).pct === '+13%', JSON.stringify(r(GD)));
  ok('Монтана 3 / 4 / −25% (956 не се брои)', r(MO).cur === 3 && r(MO).prev === 4 && r(MO).pct === '−25%', JSON.stringify(r(MO)));
  ok('Петрич 2 / 0 / „—"', r(PE).cur === 2 && r(PE).prev === 0 && r(PE).pct === '—');
  ok('Троян 0 / 0 / „—" (ред има, макар без данни)', r(TR) && r(TR).cur === 0 && r(TR).prev === 0 && r(TR).pct === '—');
  ok('обект извън minus_stores (Враца) не влиза', wk.rows.length === 4 && !wk.rows.some(x => x.store === 'Враца'));
  ok('редовете — в реда на minus_stores', wk.rows.map(x => x.store).join(',') === STORES.join(','));
  ok('Общо 14 / 12 / +17%', wk.total.cur === 14 && wk.total.prev === 12 && wk.total.pct === '+17%', JSON.stringify(wk.total));
  ok('„Данни до" = 26.10 (max posting_date, и след неделята)', wk.total.lastDate === '2026-10-26', wk.total.lastDate);
  ok('lastDate по обект: Монтана 24.10 (956 също е движение), Троян — няма', r(MO).lastDate === '2026-10-24' && r(TR).lastDate === null);
  const edge = w.reportMinusMultiWeek([mv(GD, '955', '2026-10-18'), mv(GD, '955', '2026-10-19'), mv(GD, '955', '2026-10-25'), mv(GD, '955', '2026-10-26'), mv(GD, '955', '2026-10-11'), mv(GD, '955', '2026-10-12')], [GD], REF);
  ok('граници поотделно: пн 19.10 и нд 25.10 → седмицата (2); нд 18.10 и пн 12.10 → предходната (2); 26.10 и 11.10 → никъде', edge.rows[0].cur === 2 && edge.rows[0].prev === 2, JSON.stringify(edge.rows[0]));

  section('3. Обхватът реже таблицата');
  const data = w.reportMinusMultiGroup(copy(ROWS), STORES, 3, 30, REF);
  data.week = wk;
  const subMO = w.reportMinusMultiForStores(data, [MO, TR]);
  ok('само Монтана и Троян', subMO.week.rows.map(x => x.store).join(',') === MO + ',' + TR);
  ok('… Общо 3 / 4 / −25%, „Данни до" 24.10', subMO.week.total.cur === 3 && subMO.week.total.prev === 4 && subMO.week.total.pct === '−25%' && subMO.week.total.lastDate === '2026-10-24', JSON.stringify(subMO.week.total));
  ok('общата седмица не е пипната от срязването', data.week.rows.length === 4 && data.week.total.cur === 14);

  section('4. Писмото');
  const html = w.reportMinusMultiHtml(subMO);
  const d = new (w.DOMParser)().parseFromString(html, 'text/html');
  const title = d.querySelector('.mm-week-title');
  ok('заглавие „Минуси за седмицата 19.10–25.10"', title && title.textContent === 'Минуси за седмицата 19.10–25.10', title && title.textContent);
  ok('частта е ПРЕДИ повтарящите се (преди „Няма артикул…" / таблицата с артикули)', html.indexOf('mm-week-title') >= 0 && html.indexOf('mm-week-title') < html.indexOf('mm-empty'));
  const rows = Array.from(d.querySelectorAll('tr.mm-week-row')).map(tr => Array.from(tr.querySelectorAll('td')).map(x => x.textContent).join(' | '));
  ok('редове: Монтана | 3 | 4 | −25%; Троян | 0 | 0 | —', rows.join(' / ') === 'Монтана | 3 | 4 | −25% / Троян | 0 | 0 | —', rows.join(' / '));
  const tot = d.querySelector('tr.mm-week-total');
  ok('ред „Общо | 3 | 4 | −25%"', tot && Array.from(tot.querySelectorAll('td')).map(x => x.textContent).join(' | ') === 'Общо | 3 | 4 | −25%');
  const hd = Array.from(d.querySelectorAll('table.mm-week th')).map(x => x.textContent).join(' | ');
  ok('заглавия: Обект | Седмица 19.10–25.10 | Предходна 12.10–18.10 | Промяна', hd === 'Обект | Седмица 19.10–25.10 | Предходна 12.10–18.10 | Промяна', hd);
  const dn = d.querySelector('.mm-week-data');
  ok('сив ред „Данни до 24.10 (последна дата на движение в портала)"', dn && dn.textContent === 'Данни до 24.10 (последна дата на движение в портала)' && /color:#94a3b8/.test(dn.getAttribute('style')), dn && dn.textContent);
  const full = w.reportMinusMultiHtml(Object.assign({}, data));
  ok('без обхват — 4 реда и „Данни до 26.10"', (full.match(/mm-week-row/g) || []).length === 4 && full.indexOf('Данни до 26.10') >= 0);
  ok('без week (стари данни) → без частта, без грешка', w.reportMinusMultiHtml(w.reportMinusMultiGroup([], [GD], 3, 30, REF)).indexOf('mm-week') < 0);
  ok('темата е без промяна', w.reportMinusMultiSubject(data) === 'Минуси — повтарящи се артикули — до 25.10.2026', w.reportMinusMultiSubject(data));

  section('5. Правилото за изпращане');
  const send = (plan, stores) => w.reportMinusMultiShouldSend(plan, w.reportMinusMultiForStores(data, stores));
  const P = (scoped, stores) => ({ email: 'x@temax.bg', scoped, stores });
  ok('предпоставка: в Петрич няма повтарящ се артикул, но има 2 минуса за седмицата', w.reportMinusMultiForStores(data, [PE]).total === 0);
  ok('с обхват [Петрич] — само седмични минуси → ПРАЩА', send(P(true, [PE]), [PE]) === true);
  ok('с обхват [Троян] — нищо → НЕ праща', send(P(true, [TR]), [TR]) === false);
  ok('с обхват без сечение [] → НЕ праща', send(P(true, []), []) === false);
  ok('без обхват (NULL) и нищо → праща', send(P(false, [TR]), [TR]) === true);
  const subGD = w.reportMinusMultiForStores(data, [GD]);
  ok('с обхват [Гоце Делчев] — има повтарящи се → праща', subGD.total > 0 && send(P(true, [GD]), [GD]) === true);
  ok('с обхват, но sub без week (стар формат) и 0 артикула → не праща', w.reportMinusMultiShouldSend(P(true, [TR]), { total: 0 }) === false);

  section('6. Колекторът (фалшива база с PostgREST филтри)');
  const db = { settings: [{ key: 'minus_stores', value: STORES.join(',') }], movs: copy(ROWS), log: [] };
  install(h, db);
  const got = await new Promise(res => w.collectMinusMultiReportData(REF, res));
  const qs = db.log.filter(x => x.tbl === 'minus_movements').map(x => x.q);
  ok('две заявки към minus_movements', qs.length === 2, qs.length);
  ok('първата — както досега (955, прозорецът на повтарящите се)', /mvt_type=eq\.955/.test(qs[0]) && /posting_date=lte\.2026-10-25/.test(qs[0]));
  ok('втората — без mvt_type и без горна граница, от 12.10, само обектите', qs[1] && !/mvt_type=/.test(qs[1]) && !/posting_date=lte/.test(qs[1]) && /posting_date=gte\.2026-10-12/.test(qs[1]) && qs[1].indexOf('store_name=in.("Гоце Делчев","Монтана","Петрич","Троян")') >= 0, qs[1]);
  ok('данните носят седмицата: Общо 14 / 12, „Данни до" 26.10', got && got.week && got.week.total.cur === 14 && got.week.total.prev === 12 && got.week.total.lastDate === '2026-10-26', got && JSON.stringify(got.week && got.week.total));
  db.failWeek = true;
  const bad = await new Promise(res => w.collectMinusMultiReportData(REF, res));
  ok('паднала седмична заявка → null (без писмо с грешни числа)', bad === null);
  db.failWeek = false;
  db.settings = [];
  const none = await new Promise(res => w.collectMinusMultiReportData(REF, res));
  ok('без включени обекти → празна седмица, без част в писмото', none && none.week && none.week.rows.length === 0 && w.reportMinusMultiHtml(none).indexOf('mm-week') < 0);
  h.close();
})().then(function () {
  section('7. Едж функцията и Администрация');
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
  const m = src.match(/if \(type === 'minus_multi'\) \{[\s\S]*?\n    \}\n/);
  const br = m ? m[0] : '';
  ok('dry_run по получател носи week (cur / prev / pct / last_date / by_store)', /week: j\.sub\.week \? \{[^}]*cur:j\.sub\.week\.total\.cur, prev:j\.sub\.week\.total\.prev, pct:j\.sub\.week\.total\.pct, last_date:j\.sub\.week\.total\.lastDate/.test(br) && /by_store:j\.sub\.week\.rows\.map/.test(br));
  ok('отчетът след пращане носи броя за седмицата', /mmOut\.push\(\{[^}]*week:j\.sub\.week \? j\.sub\.week\.total\.cur/.test(br));
  const adm = fs.readFileSync(path.join(ROOT, 'admin.js'), 'utf8');
  ok('ADMIN_REPORTS: minus_multi — „понеделник 11:00"', /kind: 'minus_multi'[^}]*schedule: 'понеделник 11:00'/.test(adm));
  report();
}).catch(function (e) { console.error(e); process.exit(1); });
