/* ОТДЕЛНИ ПОЛУЧАТЕЛИ ЗА ЧЕТИРИТЕ ОБЩИ ОТЧЕТА (18.09.2026).

   report_recipients има по флаг на отчет: daily, weekly, pallets, warehouse
   (последните два — миграция 20260918114902; backfill pallets = weekly).

     · Палети  — pallets=true (weekly вече НЕ решава) + регионалните;
     · Склад   — role=logistics за своя склад + warehouse=true за ВСЕКИ склад;
                 регионалните НЕ получават;
     · Дневен / Седмичен — daily / weekly, както досега.

   Функциите за Палети и Склад са ДОСЛОВНО същите в send-scheduled-report
   (tests/report-edge-sync.test.js); тук се проверява поведението им и
   заявките, които едж функцията прави за всеки тип.

   UI (Администрация → Известия → „📧 Общи отчети"): по 4 икони на ред —
   клик = PATCH само с този флаг; 4 отметки при добавяне; броячите от
   флаговете.

   Пускане:  node tests/report-recipient-flags.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const EDGE = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

const ADMIN = { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

const R = (id, email, f, over) => Object.assign({ id: id, name: id, email: email, active: true, scope_stores: null,
  daily: !!f.daily, weekly: !!f.weekly, pallets: !!f.pallets, warehouse: !!f.warehouse }, over || {});
const RECIPIENTS = [
  R('r-all', 'all@temax.bg', { daily: 1, weekly: 1, pallets: 1, warehouse: 1 }),
  R('r-week', 'week@temax.bg', { weekly: 1 }),                 /* седмичен, НЕ палети */
  R('r-pal', 'pal@temax.bg', { pallets: 1 }),                  /* палети, без седмичен */
  R('r-wh', 'wh@temax.bg', { warehouse: 1 }),                  /* само склад */
  R('r-off', 'off@temax.bg', { daily: 1, weekly: 1, pallets: 1, warehouse: 1 }, { active: false })
];
const REGIONAL = [{ email: 'reg@temax.bg', display_name: 'Регионален', assigned_stores: ['Троян'], active: true, is_regional: true }];
const LOGISTICS = [
  { email: 'lt@temax.bg', display_name: 'Търговище', store_name: 'Логистичен склад Търговище', role: 'logistics', active: true },
  { email: 'ld@temax.bg', display_name: 'Добрич', store_name: 'Логистичен склад Добрич', role: 'logistics', active: true },
  { email: '', display_name: 'Без имейл', store_name: 'Логистичен склад Русе', role: 'logistics', active: true },
  { email: 'old@temax.bg', display_name: 'Стар', store_name: 'Логистичен склад Стар', role: 'logistics', active: false }
];
function usersFor(url) {
  if (url.indexOf('is_regional') >= 0) return REGIONAL;
  if (url.indexOf('role=eq.logistics') >= 0) return LOGISTICS;
  return [];
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function settle(ms) { await wait(ms || 80); for (let i = 0; i < 4; i++) await ticks(); }
async function env() {
  const h = boot({
    modules: ['bulletin.js', 'email.js', 'admin.js', 'report.js'],
    user: ADMIN,
    data: { report_recipients: RECIPIENTS.filter(r => r.active), users: usersFor, notification_topics: [],
            notification_matrix: [], notification_overrides: [], notification_schedules: [], stores: [] }
  });
  h.w.loadNotificationsAdmin(); await settle();
  return h;
}
const body = h => h.doc.getElementById('notif-reports-body');
const rowOf = (h, email) => Array.prototype.find.call(body(h).querySelectorAll('.report-recipient'), x => x.textContent.indexOf(email) >= 0);
const flagBtn = (h, email, flag) => { const r = rowOf(h, email); return r ? r.querySelector('button.rcpt-flag[data-flag="' + flag + '"]') : null; };
const countOf = (h, kind) => { const row = h.doc.getElementById('report-row-' + kind); return row ? row.querySelectorAll('td')[2].textContent : null; };
/* Тялото на обработчика за даден тип — от „if (type === '<x>')" до следващия такъв клон. */
function branch(type) {
  const s = EDGE.indexOf("if (type === '" + type + "')");
  if (s < 0) return '';
  const e = EDGE.indexOf('if (type ===', s + 10);
  return EDGE.slice(s, e > 0 ? e : s + 4000);
}

(async function () {
  const h0 = await env();
  const w = h0.w;

  section('1. Палети — решава pallets, регионалните остават');
  {
    const p = w.reportPalletsRecipients(RECIPIENTS, REGIONAL);
    ok('общото писмо: all + pal', p.all.join('|') === 'all@temax.bg|pal@temax.bg', p.all.join('|'));
    ok('weekly=true без pallets НЕ получава', p.all.indexOf('week@temax.bg') < 0);
    ok('само склад НЕ получава', p.all.indexOf('wh@temax.bg') < 0);
    ok('неактивният НЕ получава', p.all.indexOf('off@temax.bg') < 0);
    ok('регионалният — личен отчет за своите', p.personal.length === 1 && p.personal[0].email === 'reg@temax.bg' &&
      p.personal[0].stores.join('|') === 'Троян', JSON.stringify(p.personal));
  }

  section('2. Склад — logistics за своя, warehouse=true за всеки склад');
  {
    const plan = w.reportWarehouseRecipients(LOGISTICS, RECIPIENTS);
    const lines = plan.map(x => x.email + '→' + x.warehouse);
    ok('logistics: всеки само за своя склад',
      lines.indexOf('lt@temax.bg→Логистичен склад Търговище') >= 0 && lines.indexOf('ld@temax.bg→Логистичен склад Добрич') >= 0 &&
      !lines.some(l => /^lt@.*Добрич|^ld@.*Търговище/.test(l)), lines.join(', '));
    const whAll = plan.filter(x => x.email === 'wh@temax.bg').map(x => x.warehouse).sort();
    ok('warehouse=true получава по писмо за ВСЕКИ активен склад (и за Русе без имейл)',
      whAll.join('|') === ['Логистичен склад Добрич', 'Логистичен склад Русе', 'Логистичен склад Търговище'].sort().join('|'), whAll.join('|'));
    ok('и all@ (всички флагове) — за всеки склад', plan.filter(x => x.email === 'all@temax.bg').length === 3);
    ok('неактивен склад (Стар) не е склад за никого', !plan.some(x => x.warehouse === 'Логистичен склад Стар'));
    ok('складът без имейл сам не получава', !plan.some(x => !x.email));
    ok('weekly / pallets без warehouse НЕ получават', !plan.some(x => /^(week|pal)@/.test(x.email)));
    ok('неактивният НЕ получава', !plan.some(x => x.email === 'off@temax.bg'));
    ok('регионалният НЕ получава (не е вход изобщо)', !plan.some(x => x.email === 'reg@temax.bg'));
    ok('общо: 2 logistics + 2 × 3 склада = 8 писма', plan.length === 8, String(plan.length));
    const dup = w.reportWarehouseRecipients(LOGISTICS, [R('x', 'LT@Temax.bg', { warehouse: 1 })]);
    ok('дедупликация по имейл (малки букви) + склад', dup.filter(x => x.email.toLowerCase() === 'lt@temax.bg').length === 3,
      JSON.stringify(dup.map(x => x.email + '→' + x.warehouse)));
    ok('без втори аргумент — поведението отпреди (само logistics)', w.reportWarehouseRecipients(LOGISTICS).length === 2);
    ok('без склад (няма logistics) — warehouse=true няма какво да получи', w.reportWarehouseRecipients([], RECIPIENTS).length === 0);
  }

  section('3. Едж функцията — всеки тип чете своя флаг');
  {
    const pb = branch('pallets'), wb = branch('warehouse');
    ok('Палети: report_recipients с pallets=eq.true', /sbGet\('report_recipients', 'active=eq\.true&pallets=eq\.true&/.test(pb));
    ok('Палети: НЕ чете weekly', pb.indexOf('weekly=eq.true') < 0);
    ok('Палети: регионалните се четат (is_regional)', /is_regional=eq\.true/.test(pb));
    ok('Склад: report_recipients с warehouse=eq.true', /sbGet\('report_recipients', 'active=eq\.true&warehouse=eq\.true&/.test(wb));
    ok('Склад: подава ги на reportWarehouseRecipients', /reportWarehouseRecipients\(wUsersRes, wRecRes\)/.test(wb));
    ok('Склад: НЕ чете регионалните', wb.indexOf('is_regional') < 0);
    ok('Дневен/Седмичен: daily / weekly',
      /var flagFilter = type === 'weekly' \? 'weekly=eq\.true' : 'daily=eq\.true';/.test(EDGE));
  }

  section('4. UI — броячите от флаговете');
  {
    ok('Дневен: 1 (all)', countOf(h0, 'daily') === '1', countOf(h0, 'daily'));
    ok('Седмичен: 2 (all, week)', countOf(h0, 'weekly') === '2', countOf(h0, 'weekly'));
    ok('Палети: 3 (all, pal + регионалния)', countOf(h0, 'pallets') === '3', countOf(h0, 'pallets'));
    ok('Склад: 4 души (lt, ld, all, wh) — хора, не писма', countOf(h0, 'warehouse') === '4', countOf(h0, 'warehouse'));
    const note = body(h0).textContent;
    ok('сивият текст назовава флаговете', note.indexOf('Палети: отметнатите 🟫') >= 0 && note.indexOf('Склад: отметнатите 📦') >= 0, '');
  }

  section('5. UI — 4 икони на ред, клик = PATCH само с този флаг');
  {
    const h = await env();
    const r = rowOf(h, 'week@temax.bg');
    const icons = r ? Array.from(r.querySelectorAll('button.rcpt-flag')) : [];
    ok('4 икони в реда', icons.map(b => b.dataset.flag).join('|') === 'daily|weekly|pallets|warehouse', icons.map(b => b.dataset.flag).join('|'));
    ok('състоянието: само седмичен е включен', icons.map(b => b.dataset.on).join('') === '0100', icons.map(b => b.dataset.on).join(''));
    ok('включеният е ярък, изключеният е избледнял',
      icons[1].getAttribute('style').indexOf('opacity:.25') < 0 && icons[2].getAttribute('style').indexOf('opacity:.25') >= 0);
    realClick(h.w, flagBtn(h, 'week@temax.bg', 'pallets'), '🟫 на week@');
    await settle();
    const pt = h.calls.patch.filter(p => p.table === 'report_recipients');
    ok('един PATCH', pt.length === 1, String(pt.length));
    ok('по id на реда', !!pt[0] && /id=eq\.r-week/.test(pt[0].url), pt[0] && pt[0].url);
    ok('тялото е САМО { pallets: true }', !!pt[0] && JSON.stringify(pt[0].body) === '{"pallets":true}', pt[0] && JSON.stringify(pt[0].body));
    ok('списъкът се презарежда', h.calls.get.filter(u => u.indexOf('report_recipients') >= 0).length >= 2);
    h.close();
  }
  {
    const h = await env();
    realClick(h.w, flagBtn(h, 'all@temax.bg', 'warehouse'), '📦 на all@ (включен → спри)');
    await settle();
    const pt = h.calls.patch.filter(p => p.table === 'report_recipients');
    ok('включен флаг → PATCH { warehouse: false }', pt.length === 1 && JSON.stringify(pt[0].body) === '{"warehouse":false}' &&
      /id=eq\.r-all/.test(pt[0].url), pt.map(p => p.url + ' ' + JSON.stringify(p.body)).join(' | '));
    h.close();
  }
  {
    const h = await env();
    const b = flagBtn(h, 'wh@temax.bg', 'daily');
    realClick(h.w, b, 'клик 1'); realClick(h.w, b, 'клик 2 докато тече');
    await settle();
    ok('двоен клик → един PATCH', h.calls.patch.filter(p => p.table === 'report_recipients').length === 1);
    h.close();
  }

  section('6. UI — добавяне с 4 отметки');
  {
    const h = await env();
    ['daily', 'weekly', 'pallets', 'warehouse'].forEach(f => ok('отметка „' + f + '"', !!h.doc.getElementById('admin-rcpt-' + f)));
    ok('по подразбиране: дневен и седмичен — да; палети и склад — не',
      ['daily', 'weekly', 'pallets', 'warehouse'].map(f => h.doc.getElementById('admin-rcpt-' + f).checked ? 1 : 0).join('') === '1100');
    h.doc.getElementById('admin-rcpt-email').value = 'nov@temax.bg';
    h.doc.getElementById('admin-rcpt-daily').checked = false;
    h.doc.getElementById('admin-rcpt-warehouse').checked = true;
    realClick(h.w, Array.prototype.find.call(body(h).querySelectorAll('button'), x => x.textContent.trim() === '+ Добави'), '+ Добави');
    await settle();
    const posts = h.calls.post.filter(p => p.table === 'report_recipients');
    ok('POST с четирите флага', posts.length === 1 && JSON.stringify(posts[0].body) ===
      JSON.stringify({ name: null, email: 'nov@temax.bg', daily: false, weekly: true, pallets: false, warehouse: true }),
      posts[0] && JSON.stringify(posts[0].body));
    h.close();
  }

  section('7. setReportRecipientFlag отказва непознат флаг');
  {
    let got = null;
    w.setReportRecipientFlag('r-all', 'active', false, v => { got = v; });
    await settle();
    ok('„active" не е флаг на отчет → false, без PATCH', got === false && h0.calls.patch.length === 0, String(got));
  }

  h0.close();
  report();
})();
