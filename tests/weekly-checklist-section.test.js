/* СЕДМИЧЕН ОТЧЕТ — секция „Чек лист (контролинг) — седмица N".

   Таблица обект × активните показатели (weekly_checklist_metrics) за
   (year, week) на отчетната седмица, само за обектите на получателя.
   Двете заявки са в collectWeeklyReportData; таб „Днес" вика кросмодулния
   колектор направо и секцията не се смята.

   Клетката следва checklistEmailCellValue() в checklist.js, копирано в
   reportChecklistCellValue: control бие portal; при number control_num бие
   portal_value; da/ne/nyamat → да/не/нямат; „x/y" остава; липсващ ред → ''.

     a) control_value печели над portal_value; number: control_num печели
     b) само portal_value → сив курсив; control → нормален
     c) липсващ ред → празна клетка, не „—"
     d) обект извън scope → няма ред; в scope без редове → ред с празни клетки
     e) заявките са за year/week на отчетната седмица (неделя 21:00 → текущата)
     f) comment → маркер 💬, текстът на коментара отсъства от HTML
     g) подвижен прозорец → секцията липсва
   Плюс: неактивен показател няма колона; ред от друга седмица не се ползва
   (стъбът връща цялата таблица — решава JS филтърът); „Данни на контролинга
   към дд.мм чч:мм" в Europe/Sofia само от редовете в scope; мястото в писмото.

   Пускане:  node tests/weekly-checklist-section.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };
const SCOPE = ['Враца', 'Габрово', 'Шумен'];

/* Нарочно разбъркани — подредбата е по sort_order. */
const METRICS = [
  { key: 'preocenka', label: 'преоценка', value_type: 'yes_no_none', sort_order: 7, active: true },
  { key: 'revizia_953', label: 'ревизия', value_type: 'yes_no', sort_order: 1, active: true },
  { key: 'revizia_grupi', label: 'Ревизия група / групи', value_type: 'yes_no', sort_order: 2, active: false },
  { key: 'storna_priem', label: 'Сторна по грешни приеми', value_type: 'number', sort_order: 5, active: true }
];

function row(store, key, o, week) {
  return Object.assign({ year: 2026, week_number: week || 37, store_name: store, metric_key: key,
    portal_value: null, control_value: null, control_num: null, comment: null,
    updated_at: '2026-09-12T07:05:00.000Z' }, o || {});
}
const ROWS = [
  row('Враца', 'revizia_953', { portal_value: 'ne', control_value: 'da' }),        /* a) control печели */
  row('Враца', 'storna_priem', { portal_value: '3/5', control_num: 2 }),            /* a) number: control_num */
  row('Враца', 'preocenka', { portal_value: 'da' }),                                /* b) само портал → сив */
  row('Враца', 'revizia_grupi', { control_value: 'da' }),                           /* неактивен показател */
  row('Габрово', 'revizia_953', { portal_value: '13/20' }),                          /* „x/y" остава, сив */
  row('Габрово', 'storna_priem', { portal_value: '4/5' }),                           /* number без control_num → портал */
  row('Габрово', 'preocenka', { control_value: 'nyamat', comment: 'ТАЙНА-БЕЛЕЖКА',   /* f) */
                                updated_at: '2026-09-13T15:30:00.000Z' }),         /* 18:30 София — най-новият в scope */
  row('Силистра', 'revizia_953', { control_value: 'da', updated_at: '2026-09-13T17:00:00.000Z' }), /* d) извън scope */
  row('Враца', 'revizia_953', { control_value: 'ne', updated_at: '2026-09-13T18:00:00.000Z' }, 36) /* друга седмица */
  /* Шумен — нито един ред (c, d) */
];

const USERS = ['Враца', 'Габрово', 'Шумен', 'Силистра', 'Централен офис']
  .map(s => ({ store_name: s }));

function env(extra) {
  const h = boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: Object.assign({
      users: USERS, bulletins: [{ id: 'b-37', week_number: 37, year: 2026, status: 'published' }],
      bulletin_tasks: [], recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: [], report_snapshots: [],
      differences_reports: [], stock_returns: [], kasa_storno: [], kasa_zoborot: [], goods_transit: [],
      transport_pallets: [], client_orders: [], transport_orders: [], app_settings: [],
      weekly_checklist_metrics: METRICS, weekly_checklist: ROWS
    }, extra || {})
  });
  /* Неделя 21:00 — моментът на крона; отчетната седмица е текущата (37). */
  const Real = h.w.Date, fixedMs = new Real('2026-09-13T21:00:00').getTime();
  h.w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  };
  return h;
}
const weekly = (h, scope) => new Promise(res => { h.w.collectWeeklyReportData(res, scope); });

/* Таблицата като DOM: { магазин: [{ text, italic, comment }] } в реда на колоните. */
function grid(h, html) {
  const div = h.doc.createElement('div');
  div.innerHTML = html;
  const heads = Array.from(div.querySelectorAll('th')).map(th => th.textContent.trim());
  const out = {};
  Array.from(div.querySelectorAll('tr')).slice(1).forEach(tr => {
    const tds = Array.from(tr.querySelectorAll('td'));
    out[tds[0].textContent.trim()] = tds.slice(1).map(td => ({
      text: td.textContent.replace('💬', '').trim(),
      italic: !!td.querySelector('span[style*="font-style:italic"]'),
      comment: td.textContent.indexOf('💬') >= 0,
      raw: td.innerHTML
    }));
  });
  return { heads: heads, rows: out };
}

(async function () {

  section('Правилото на клетката (reportChecklistCellValue)');
  {
    const h = env();
    const f = h.w.reportChecklistCellValue;
    const yn = { value_type: 'yes_no' }, num = { value_type: 'number' };
    ok('a) control_value печели над portal_value', f(yn, { portal_value: 'ne', control_value: 'da' }) === 'да');
    ok('a) number: control_num печели над portal_value', f(num, { portal_value: '3/5', control_num: 2 }) === '2');
    ok('number: control_num = 0 също печели', f(num, { portal_value: '3/5', control_num: 0 }) === '0');
    ok('number без control_num → portal_value', f(num, { portal_value: '4/5', control_num: null }) === '4/5');
    ok('само portal_value → превод', f(yn, { portal_value: 'ne' }) === 'не');
    ok('nyamat → нямат', f({ value_type: 'yes_no_none' }, { control_value: 'nyamat' }) === 'нямат');
    ok('„x/y" остава както е', f(yn, { portal_value: '13/20' }) === '13/20');
    ok('непозната стойност се показва както е', f(yn, { control_value: 'може би' }) === 'може би');
    ok('c) липсващ ред → празен низ', f(yn, null) === '' && f(num, undefined) === '');
    ok('ред без стойности → празен низ', f(yn, { portal_value: null, control_value: '' }) === '');
    h.close();
  }

  section('a) + b) + c) + d) таблицата за обектите на получателя');
  {
    const h = env();
    const data = await weekly(h, SCOPE);
    const cl = data && data.cross && data.cross.checklist;
    if (ok('седмичният колектор закача cross.checklist', !!cl, JSON.stringify(data && data.cross && Object.keys(data.cross)))) {
      const html = h.w.reportChecklistSectionHtml(data.cross);
      const g = grid(h, html);
      ok('колоните са активните показатели по sort_order',
        g.heads.join('|') === 'Обект|ревизия|Сторна по грешни приеми|преоценка', g.heads.join('|'));
      ok('неактивният показател няма колона', html.indexOf('Ревизия група / групи') < 0);
      ok('d) по един ред на обект в scope — Враца, Габрово, Шумен',
        Object.keys(g.rows).join('|') === 'Враца|Габрово|Шумен', Object.keys(g.rows).join('|'));
      ok('d) обект извън scope (Силистра) няма ред', !g.rows['Силистра'] && html.indexOf('Силистра') < 0);

      const vr = g.rows['Враца'] || [];
      ok('a) Враца/ревизия: control „да" печели над портал „не"', vr[0] && vr[0].text === 'да', JSON.stringify(vr[0]));
      ok('a) Враца/сторна: control_num 2 печели над „3/5"', vr[1] && vr[1].text === '2', JSON.stringify(vr[1]));
      ok('b) control → нормален текст', vr[0] && !vr[0].italic && vr[1] && !vr[1].italic);
      ok('b) Враца/преоценка: само портал „да" → сив курсив', vr[2] && vr[2].text === 'да' && vr[2].italic, JSON.stringify(vr[2]));
      ok('ред от седмица 36 не е ползван (иначе Враца/ревизия би била „не")', vr[0] && vr[0].text !== 'не');

      const gb = g.rows['Габрово'] || [];
      ok('Габрово/ревизия: „13/20" както е, сив курсив', gb[0] && gb[0].text === '13/20' && gb[0].italic, JSON.stringify(gb[0]));
      ok('Габрово/сторна: number без control_num → „4/5", сив курсив', gb[1] && gb[1].text === '4/5' && gb[1].italic, JSON.stringify(gb[1]));
      ok('Габрово/преоценка: control „нямат" → нормален', gb[2] && gb[2].text === 'нямат' && !gb[2].italic, JSON.stringify(gb[2]));

      const sh = g.rows['Шумен'] || [];
      ok('d) Шумен без записи → ред с 3 клетки', sh.length === 3, String(sh.length));
      ok('c) и трите клетки са ПРАЗНИ', sh.every(c => c.raw === ''), JSON.stringify(sh.map(c => c.raw)));
      ok('c) нито „—", нито „не" в празните клетки', sh.every(c => c.raw.indexOf('—') < 0 && c.text !== 'не'));
      const tableHtml = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
      ok('c) в таблицата няма нито едно „—"', tableHtml.indexOf('—') < 0);
    }
    const all = await weekly(env(), null);
    ok('КОНТРОЛА: без обхват Силистра Е в таблицата — решава scope',
      !!all.cross.checklist && all.cross.checklist.stores.indexOf('Силистра') >= 0 &&
      h.w.reportChecklistSectionHtml(all.cross).indexOf('Силистра') >= 0);
    h.close();
  }

  section('e) заявките са за year/week на отчетната седмица');
  {
    const h = env();
    await weekly(h, SCOPE);
    const qRows = h.calls.get.filter(u => u.indexOf('/weekly_checklist?') >= 0);
    const qMet = h.calls.get.filter(u => u.indexOf('/weekly_checklist_metrics') >= 0);
    ok('една заявка към weekly_checklist', qRows.length === 1, qRows.join(' | '));
    ok('за year=2026 и week_number=37 (неделя 13.09 21:00 → текущата)',
      qRows.length === 1 && qRows[0].indexOf('year=eq.2026') >= 0 && qRows[0].indexOf('week_number=eq.37') >= 0, qRows[0]);
    ok('една заявка към weekly_checklist_metrics, active=eq.true и order=sort_order',
      qMet.length === 1 && qMet[0].indexOf('active=eq.true') >= 0 && qMet[0].indexOf('order=sort_order') >= 0, qMet.join(' | '));
    h.close();
  }

  section('f) коментар → маркер, без текста');
  {
    const h = env();
    const data = await weekly(h, SCOPE);
    const html = h.w.reportChecklistSectionHtml(data.cross);
    const g = grid(h, html);
    ok('клетката с коментар носи 💬', g.rows['Габрово'][2].comment === true);
    ok('клетките без коментар — без 💬', !g.rows['Враца'].some(c => c.comment));
    ok('текстът на коментара отсъства от HTML', html.indexOf('ТАЙНА-БЕЛЕЖКА') < 0);
    ok('и от цялото седмично писмо', h.w.buildWeeklyReportHtml(data).indexOf('ТАЙНА-БЕЛЕЖКА') < 0);
    h.close();
  }

  section('Заглавие, легенда и „Данни на контролинга към"');
  {
    const h = env();
    const data = await weekly(h, SCOPE);
    const html = h.w.reportChecklistSectionHtml(data.cross);
    ok('заглавие „Чек лист (контролинг) — седмица 37"', html.indexOf('Чек лист (контролинг) — седмица 37') >= 0);
    ok('легенда в един ред', html.indexOf('нормален = отметка на контролинга · сив курсив = по данни на портала') >= 0);
    ok('„Данни на контролинга към 13.09 18:30" — най-новият ред в scope, в Europe/Sofia',
      html.indexOf('Данни на контролинга към 13.09 18:30') >= 0,
      (html.match(/Данни на контролинга[^<]*/) || [''])[0]);

    const hEmpty = env({ weekly_checklist: [] });
    const dEmpty = await weekly(hEmpty, SCOPE);
    const hEm = hEmpty.w.reportChecklistSectionHtml(dEmpty.cross);
    ok('без записи → „няма записи за седмицата"', hEm.indexOf('няма записи за седмицата') >= 0 &&
      hEm.indexOf('Данни на контролинга към') < 0);
    ok('и пак по ред на всеки обект, с празни клетки',
      Object.keys(grid(hEmpty, hEm).rows).join('|') === 'Враца|Габрово|Шумен');
    hEmpty.close();
    h.close();
  }

  section('g) подвижен прозорец (таб „Днес") → секцията липсва');
  {
    const h = env();
    const cross = await new Promise(res => { h.w.collectCrossModuleWeeklySummary(res, null, null); });
    ok('cross.checklist го няма', !!cross && !cross.checklist, JSON.stringify(cross && cross.checklist));
    ok('заявки към weekly_checklist не се пускат',
      h.calls.get.filter(u => u.indexOf('/weekly_checklist') >= 0).length === 0);
    const sec = h.w.buildCrossModuleSectionHtml(cross);
    ok('в секцията няма „Чек лист (контролинг)"', sec.indexOf('Чек лист (контролинг)') < 0);
    ok('reportChecklistSectionHtml без данни → празно', h.w.reportChecklistSectionHtml({}) === '');
    h.close();
  }

  section('Мястото в писмото: след „Сторна под 5 €", преди Равнението');
  {
    const h = env();
    const data = await weekly(h, SCOPE);
    const html = h.w.buildWeeklyReportHtml(data);
    const iSmall = html.indexOf('сторна под 5 €');   /* „Няма сторна под 5 € тази седмица" при 0 */
    const iCl = html.indexOf('Чек лист (контролинг)');
    const iZob = html.indexOf('Каса — Равнение');
    ok('и трите ги има', iSmall >= 0 && iCl >= 0 && iZob >= 0, iSmall + ' / ' + iCl + ' / ' + iZob);
    ok('чек листът е след „Сторна под 5 €"', iCl > iSmall);
    ok('и преди Равнението', iCl < iZob);
    h.close();
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
