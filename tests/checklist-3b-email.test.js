/* Чек лист, етап 3Б — „Изисква становище" в писмото до обектите (23.10.2026).

   Какво заковава файлът:
   1. checklistEmailHtml(…, extra): секцията е СЛЕД мрежата и ПРЕДИ
      „Коментари"; ред на клетка „не" (без числовите), по обект и вътре по
      показател; „N-та седмица подред" / „нова"; поредица 3+ оцветена;
      становище за предходната седмица — ескейпнато, само ако и тя е „не";
      редът със срока „до петък ДД.ММ, 18:00".
   2. нула „не" → секцията отпада; extra липсва → писмото се строи;
      нула class= / href= / <style> в писмото.
   3. submitChecklistSend: двете нови заявки (историята с or= за 7-те
      седмици, становищата за предходната); провал на тях → писмото пак
      тръгва (sendEmail е извикан).

   Седмицата е закована: С43/2026; предходната — С42.

   Пускане:  node tests/checklist-3b-email.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const YEAR = 2026, WEEK = 43;
const METRICS = [
  { key: 'revizia_953', label: 'ревизия', sublabel: '', value_type: 'yes_no', sort_order: 1, active: true, source: 'manual' },
  { key: 'spravka_minusi', label: 'справка минуси', sublabel: '', value_type: 'yes_no', sort_order: 2, active: true, source: 'manual' },
  { key: 'storna_priem', label: 'Сторна', sublabel: '', value_type: 'number', sort_order: 3, active: true, source: 'manual' }
];
const STORES = ['Враца', 'Шумен'];
const ADMIN = { id: 'u-1', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'admin', store_name: 'Централен офис' };
const USERS = [
  { store_name: 'Враца', email: 'managervraca@temax.bg', role: 'manager', active: true },
  { store_name: 'Шумен', email: 'managershumen@temax.bg', role: 'manager', active: true },
  { store_name: 'Централен офис', email: 'co@temax.bg', role: 'admin', active: true }
];

function r(store, key, week, f) {
  return Object.assign({ year: YEAR, week_number: week, store_name: store, metric_key: key,
                         portal_value: null, control_value: null, control_num: null, comment: null }, f || {});
}
/* Текущата седмица: Шумен ревизия „не" (3-та подред), Шумен минуси „не" (нова),
   Враца ревизия „не" (2-ра), Враца минуси „да", сторна 5 и при двата. */
const CUR = [
  r('Шумен', 'revizia_953', WEEK, { control_value: 'ne', comment: 'няма протокол' }),
  r('Шумен', 'spravka_minusi', WEEK, { portal_value: 'ne' }),
  r('Шумен', 'storna_priem', WEEK, { control_num: 5 }),
  r('Враца', 'revizia_953', WEEK, { control_value: 'ne' }),
  r('Враца', 'spravka_minusi', WEEK, { control_value: 'da' }),
  r('Враца', 'storna_priem', WEEK, { control_num: 5 })
];
const HIST = [
  r('Шумен', 'revizia_953', 42, { control_value: 'ne' }),
  r('Шумен', 'revizia_953', 41, { control_value: 'ne' }),
  r('Шумен', 'spravka_minusi', 42, { control_value: 'da' }),
  r('Враца', 'revizia_953', 42, { control_value: 'ne' })
];
const PREV_RESP = [
  { year: YEAR, week_number: 42, store_name: 'Шумен', metric_key: 'revizia_953', text: 'Протоколът е <b>при РУ</b>' },
  { year: YEAR, week_number: 42, store_name: 'Шумен', metric_key: 'spravka_minusi', text: 'НЕ БИВА ДА СЕ ВИЖДА' }
];

function bootIt(opts) {
  opts = opts || {};
  const b = {
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: USERS, weekly_checklist_metrics: METRICS,
      /* Фалшивият PostgREST не филтрира: заявката с or= (историята) получава
         HIST, всяка друга — текущата седмица. */
      weekly_checklist: function (url) { return url.indexOf('or=') >= 0 ? HIST : CUR; },
      weekly_checklist_sends: [], weekly_checklist_responses: opts.responses || PREV_RESP,
      recurring_tasks: [], task_completions: []
    }
  };
  if (opts.fail) b.fail = opts.fail;
  return boot(b);
}
function sectionOf(html) {
  const a = html.indexOf('Изисква становище');
  if (a < 0) return '';
  const b = html.indexOf('</table>', a);
  return html.slice(a, html.indexOf('</div>', b) + 6);
}

(async function () {

  section('1. Секцията в писмото');
  {
    const h = bootIt();
    const html = h.w.checklistEmailHtml(YEAR, WEEK, 1, CUR, METRICS, STORES, null, { history: HIST, prevResponses: PREV_RESP });
    const iGrid = html.indexOf('</tbody></table>'), iSec = html.indexOf('Изисква становище'), iCom = html.indexOf('>Коментари<');
    ok('секцията я има', iSec > 0);
    ok('след мрежата и преди „Коментари"', iGrid > 0 && iSec > iGrid && iCom > iSec, iGrid + ' < ' + iSec + ' < ' + iCom);
    const d = new h.w.DOMParser().parseFromString(html, 'text/html');
    const secTable = Array.prototype.slice.call(d.querySelectorAll('table')).filter(function (t) {
      return t.previousElementSibling && /Изисква становище/.test(t.previousElementSibling.textContent);
    })[0];
    const rows = secTable ? Array.prototype.slice.call(secTable.querySelectorAll('td')).map(function (td) { return td.textContent; }) : [];
    ok('3 реда (2× Шумен, 1× Враца; без „да" и без числовите)', rows.length === 3, JSON.stringify(rows));
    ok('ред 1: Враца · ревизия · 2-ра седмица подред', /^Враца · ревизия · 2-ра седмица подред/.test(rows[0] || ''), rows[0]);
    ok('ред 2: Шумен · ревизия · 3-та седмица подред', /^Шумен · ревизия · 3-та седмица подред/.test(rows[1] || ''), rows[1]);
    ok('ред 3: Шумен · справка минуси · нова', /^Шумен · справка минуси · нова/.test(rows[2] || ''), rows[2]);
    ok('становището за седм. 42 се цитира', (rows[1] || '').indexOf('становище за седм. 42: Протоколът е <b>при РУ</b>') >= 0, rows[1]);
    ok('ескейпнато — няма <b> в HTML-а', html.indexOf('<b>при РУ</b>') < 0 && html.indexOf('&lt;b&gt;при РУ&lt;/b&gt;') >= 0);
    ok('при „нова" (42 е „да") становището за 42 НЕ се цитира', html.indexOf('НЕ БИВА ДА СЕ ВИЖДА') < 0);
    const tds = secTable ? secTable.querySelectorAll('td') : [];
    ok('поредица 3+ е оцветена (#FEF2F2 / #991B1B)', tds[1] && /background:#FEF2F2/.test(tds[1].getAttribute('style')) &&
       /color:#991B1B/.test(tds[1].getAttribute('style')));
    ok('поредица 2 — не е оцветена', tds[0] && !/#FEF2F2/.test(tds[0].getAttribute('style')));
    ok('редът със срока: „до петък 30.10, 18:00"', /пишат становище в портала, таб „Чек лист", до петък 30\.10, 18:00\./.test(html));
    ok('нула class=', !/\sclass=/.test(html));
    ok('нула href=', !/href=/.test(html));
    ok('нула <style>', !/<style/i.test(html));
    h.close();
  }
  {
    const h = bootIt();
    const noNe = CUR.map(function (x) { return Object.assign({}, x, { control_value: x.control_value === 'ne' ? 'da' : x.control_value, portal_value: null }); });
    const html = h.w.checklistEmailHtml(YEAR, WEEK, 1, noNe, METRICS, STORES, null, { history: HIST, prevResponses: PREV_RESP });
    ok('нула „не" → секцията отпада', html.indexOf('Изисква становище') < 0);
    const old = h.w.checklistEmailHtml(YEAR, WEEK, 1, CUR, METRICS, STORES, null);
    ok('extra липсва → писмото се строи', old.indexOf('<!DOCTYPE html>') === 0 && old.indexOf('Изисква становище') > 0);
    ok('extra липсва → поредица само от седмицата („нова")', /Шумен<\/b> · ревизия · нова/.test(old));
    h.close();
  }

  section('2. submitChecklistSend — двете нови заявки');
  {
    const h = bootIt();
    h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
    h.w.loadChecklist(); await ticks(); await ticks();
    const mails = [];
    h.w.sendEmail = function (to, subject, html) { mails.push({ to: to, html: html }); return Promise.resolve({ ok: true }); };
    h.doc.getElementById('cl-send-btn').click(); await ticks(); await ticks();
    h.doc.getElementById('cl-send-go').click(); await ticks(); await ticks(); await ticks(); await ticks();
    const hist = h.calls.get.filter(function (u) { return u.indexOf('/weekly_checklist?or=') >= 0; });
    ok('една заявка за историята (or=)', hist.length === 1, JSON.stringify(hist));
    const hq = decodeURIComponent(hist[0] || '');
    ok('историята е за 42…36, без 43', ['42', '41', '40', '39', '38', '37', '36'].every(function (w) { return hq.indexOf('week_number.eq.' + w + ')') >= 0; }) &&
       hq.indexOf('week_number.eq.43') < 0, hq);
    ok('историята е на страници (order=id, limit)', /order=id\.asc&limit=1000&offset=0/.test(hq), hq);
    const resp = h.calls.get.filter(function (u) { return u.indexOf('/weekly_checklist_responses') >= 0 && u.indexOf('week_number=eq.42') >= 0; });
    ok('становищата — за седмица 42', resp.length === 1, JSON.stringify(h.calls.get.filter(function (u) { return u.indexOf('responses') >= 0; })));
    ok('писмата тръгнаха (2)', mails.length === 2, String(mails.length));
    ok('писмото носи „3-та седмица подред" и цитата', mails[0] && mails[0].html.indexOf('3-та седмица подред') >= 0 &&
       mails[0].html.indexOf('становище за седм. 42') >= 0);
    h.close();
  }
  {
    const h = bootIt({ fail: { GET: /weekly_checklist\?or=|weekly_checklist_responses/ } });
    h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
    h.w.loadChecklist(); await ticks(); await ticks();
    const mails = [];
    h.w.sendEmail = function (to, subject, html) { mails.push({ to: to, html: html }); return Promise.resolve({ ok: true }); };
    h.doc.getElementById('cl-send-btn').click(); await ticks(); await ticks();
    h.doc.getElementById('cl-send-go').click(); await ticks(); await ticks(); await ticks(); await ticks();
    ok('провал на двете заявки → sendEmail е извикан', mails.length === 2, String(mails.length));
    ok('… секцията пак е там, поредица само от седмицата', mails[0] && /Шумен<\/b> · ревизия · нова/.test(mails[0].html));
    ok('… редът в weekly_checklist_sends е записан', h.calls.post.some(function (p) { return (p.url || '').indexOf('/weekly_checklist_sends') >= 0; }));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
