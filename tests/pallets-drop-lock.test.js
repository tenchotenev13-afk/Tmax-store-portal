/* ПАЛЕТИ — сравнение с предходното подаване в имейла + затваряне в петък 17:00.

   Отчет (collectPalletsReportData + reportPalletsHtml, дословно същите в
   send-scheduled-report — tests/report-edge-sync.test.js):
     1) prev = най-новият ред на обекта отпреди понеделника → delta по тип и общо
     2) без prev → prev null, delta null, без делти в таблицата
     3) спад ТОЧНО равен на прага → флаг; ръст → без флаг
     4) по-старите редове — само от понеделник − 56 дни (граница включена),
        заявката е без limit=1000
     5) праг от app_settings 'pallets_drop_threshold'; липсва / невалиден / 0 → 10
     6) секция „⚠️ Спад за проверка (N)": ред на спад, сортирани по най-голям
        спад, „без бележка" в червено; при нула спадове секцията я няма
     7) делтата под числото: червено+удебелено при спад >= праг, сиво иначе,
        нищо при 0 / без prev; същото в „Общо"; сивият ред под таблицата

   Магазинска форма (pallets.js):
     8) palletsIsLocked: пт 16:59 false · пт 17:00 true · сб/нд true · пн 00:00 false
     9) няма поле за дата; submit праща today() — POST за нов ред, PATCH за днешния
    10) заключено → вместо бутона стои съобщението; submit от таб, отворен
        преди 17:00, отказва с toast и не пише нищо

   Пускане:  node tests/pallets-drop-lock.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'v@temax.bg', display_name: 'Иван', role: 'sklad', store_name: 'Враца' };

const USERS = ['Враца', 'Габрово', 'Добрич', 'Шумен', 'Севлиево', 'Троян', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

const DAY = '2026-09-18';    /* петък — отчетният ден */
const PREV = '2026-09-11';   /* миналият петък */
const EDGE = '2026-07-20';   /* понеделник 14.09 − 56 дни — включена граница */
const OUT = '2026-07-19';    /* ден преди границата — извън прозореца */

function pal(store, date, v, note) {
  return { store_name: store, report_date: date,
           euro_pallets: v[0], small_pallets: v[1], nonstandard_pallets: v[2],
           grate_pallets: v[3], bilka_pallets: v[4], sent_note: note || null,
           updated_at: date + 'T15:00:00Z' };
}
const PALLETS = [
  pal('Габрово', DAY, [5, 5, 0, 0, 0]),                    /* евро −25, без бележка */
  pal('Габрово', PREV, [30, 5, 0, 0, 0], 'СТАРА-БЕЛЕЖКА'),
  pal('Враца', DAY, [10, 3, 0, 0, 0], 'изпратени 10'),     /* евро −10 = прагът; малки +3 */
  pal('Враца', PREV, [20, 0, 0, 0, 0]),
  pal('Враца', '2026-09-04', [99, 0, 0, 0, 0]),             /* по-стар — губи */
  pal('Добрич', DAY, [9, 0, 0, 0, 0]),                      /* ръст +4 */
  pal('Добрич', PREV, [5, 0, 0, 0, 0]),
  pal('Шумен', DAY, [7, 0, 0, 0, 0]),                       /* без prev в прозореца */
  pal('Шумен', OUT, [50, 0, 0, 0, 0]),
  pal('Севлиево', DAY, [0, 0, 0, 0, 2]),                    /* prev точно на границата */
  pal('Севлиево', EDGE, [0, 0, 0, 0, 20]),
  pal('Троян', PREV, [4, 0, 0, 0, 0])                       /* непопълнил, сив */
];

function freezeAt(w, ms) {
  const Real = w.Date;
  const clock = { ms: ms };
  w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(clock.ms); else super(...a); }
    static now() { return clock.ms; }
  };
  return clock;
}
const local = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm || 0).getTime();

function env(settings) {
  const data = { users: USERS, transport_pallets: PALLETS, report_snapshots: [] };
  if (settings !== undefined) data.app_settings = settings;
  const h = boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: data });
  freezeAt(h.w, local(2026, 9, 18, 18, 0));
  return h;
}
const collect = h => new Promise(res => { h.w.collectPalletsReportData(null, res); });
const byStore = (d, s) => (d.filled || []).find(x => x.store === s);
const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const thr = v => [{ key: 'pallets_drop_threshold', value: v }];

(async function () {

  section('1–4) prev и делти от предходното подаване');
  {
    const h = env();
    const d = await collect(h);
    if (ok('колекторът връща данни', !!d, String(d))) {
      const g = byStore(d, 'Габрово') || {};
      ok('Габрово: prev е миналият петък', g.prev && g.prev.reportDate === PREV, JSON.stringify(g.prev));
      ok('Габрово: delta евро −25, малки 0, общо −25',
        g.delta && g.delta.euro_pallets === -25 && g.delta.small_pallets === 0 && g.delta.total === -25,
        JSON.stringify(g.delta));
      ok('Габрово: prev носи стойности по тип и total',
        g.prev && g.prev.euro_pallets === 30 && g.prev.small_pallets === 5 && g.prev.total === 35,
        JSON.stringify(g.prev));
      const v = byStore(d, 'Враца') || {};
      ok('Враца: prev е най-новият стар ред (20), не 04.09 (99)',
        v.prev && v.prev.reportDate === PREV && v.prev.euro_pallets === 20, JSON.stringify(v.prev));
      const sh = byStore(d, 'Шумен') || {};
      ok('Шумен: ред само извън 56-те дни → prev null, delta null',
        sh.prev === null && sh.delta === null, JSON.stringify({ p: sh.prev, d: sh.delta }));
      const sv = byStore(d, 'Севлиево') || {};
      ok('Севлиево: ред точно на понеделник − 56 дни Е prev',
        sv.prev && sv.prev.reportDate === EDGE && sv.delta.bilka_pallets === -18, JSON.stringify(sv.prev));
      ok('Троян (непопълнил) си остава сив с последния ред',
        (d.missing || []).some(m => m.store === 'Троян' && m.last && m.last.reportDate === PREV));

      const q = h.calls.get.filter(u => /transport_pallets/.test(u) && /report_date=lt\./.test(u));
      ok('заявката за старите редове е от 2026-07-20', q.length === 1 && q[0].indexOf('report_date=gte.' + EDGE) >= 0, q.join('\n'));
      ok('…и без limit=1000', q.length === 1 && q[0].indexOf('limit=') < 0, q.join('\n'));

      ok('прагът по подразбиране е 10', d.threshold === 10, String(d.threshold));
      const dr = (d.drops || []).map(x => x.store + ':' + x.type + ':' + x.delta).join('|');
      ok('drops: Габрово −25, Севлиево −18, Враца −10 (точно прагът) — по най-голям спад',
        dr === 'Габрово:euro_pallets:-25|Севлиево:bilka_pallets:-18|Враца:euro_pallets:-10', dr);
      ok('ръстът (Добрич +4, Враца малки +3) не флагва', !/Добрич|small_pallets/.test(dr), dr);
      const gd = (d.drops || [])[0] || {};
      ok('записът за спада носи prev, сега, дата на prev и бележка',
        gd.prev === 30 && gd.cur === 5 && gd.prevDate === PREV && gd.note === '', JSON.stringify(gd));
    }
    h.close();
  }

  section('5) праг от настройката');
  {
    const cases = [
      [thr('20'), 20, 'Габрово'],
      [thr('9,5'), 9.5, 'Габрово|Севлиево|Враца'],
      [thr('abc'), 10, 'Габрово|Севлиево|Враца'],
      [thr('0'), 10, 'Габрово|Севлиево|Враца'],
      [thr(null), 10, 'Габрово|Севлиево|Враца'],
      [[], 10, 'Габрово|Севлиево|Враца']
    ];
    for (const [rows, want, stores] of cases) {
      const h = env(rows);
      const d = await collect(h);
      const got = (d.drops || []).map(x => x.store).join('|');
      ok('настройка ' + JSON.stringify(rows) + ' → праг ' + want + ', спадове ' + stores,
        d.threshold === want && got === stores, d.threshold + ' / ' + got);
      h.close();
    }
    const h = env(thr('20'));
    const d = await collect(h);
    const html = h.w.reportPalletsHtml(d);
    ok('при праг 20 сивият ред казва „спад от 20"', text(html).indexOf('Червено = спад от 20 или повече палета от един тип.') >= 0);
    ok('при праг 20 спадът на Враца (−10) е СИВ в таблицата',
      /color:#94a3b8;font-weight:400;">−10</.test(html) && !/color:#dc2626;font-weight:700;">−10</.test(html));
    h.close();
  }

  section('6–7) HTML: секцията, делтите в таблицата, сивият ред');
  {
    const h = env();
    const d = await collect(h);
    const html = h.w.reportPalletsHtml(d);
    const t = text(html);
    ok('заглавие „⚠️ Спад за проверка (3)"', t.indexOf('⚠️ Спад за проверка (3)') >= 0);
    ok('ред: „Габрово · Евро · 30 → 5 (−25) · спрямо 11.09 · без бележка"',
      t.indexOf('Габрово · Евро · 30 → 5 (−25) · спрямо 11.09 · без бележка') >= 0);
    ok('„без бележка" е в червено', /<span style="color:#dc2626;font-weight:600;">без бележка<\/span>/.test(html));
    ok('ред: „Враца · Евро · 20 → 10 (−10) · спрямо 11.09 · изпратени 10"',
      t.indexOf('Враца · Евро · 20 → 10 (−10) · спрямо 11.09 · изпратени 10') >= 0);
    ok('ред: „Севлиево · Билка · 20 → 2 (−18) · спрямо 20.07"', t.indexOf('Севлиево · Билка · 20 → 2 (−18) · спрямо 20.07') >= 0);
    ok('секцията е НАД таблицата', html.indexOf('Спад за проверка') < html.indexOf('<table'));
    ok('старата бележка на Габрово не се показва', html.indexOf('СТАРА-БЕЛЕЖКА') < 0);

    ok('делта −25 под числото е червена и удебелена', /color:#dc2626;font-weight:700;">−25<\/div>/.test(html));
    ok('делта −10 (точно прагът) е червена', /color:#dc2626;font-weight:700;">−10<\/div>/.test(html));
    ok('ръст +3 и +4 са сиви', /color:#94a3b8;font-weight:400;">\+3<\/div>/.test(html) &&
      /color:#94a3b8;font-weight:400;">\+4<\/div>/.test(html));
    /* Колона „Общо" на Габрово: 10, отдолу −25 червено. */
    ok('„Общо" на Габрово носи делта −25 в червено',
      /font-weight:700;">10<div style="font-size:10px;line-height:1.2;color:#dc2626;font-weight:700;">−25<\/div><\/td>/.test(html));
    /* Нула → нищо: малките на Габрово (5 → 5). */
    ok('при делта 0 няма ред (Габрово малки: „>5</td>")', /text-align:right;[^"]*">5<\/td>/.test(html));
    const shumenRow = (html.split('<tr>').find(r => r.indexOf('>Шумен</a>') >= 0) || '');
    ok('Шумен (без prev) — никакви делти в реда', !!shumenRow && shumenRow.indexOf('font-size:10px') < 0, shumenRow.slice(0, 200));
    const troyanRow = (html.split('<tr>').find(r => r.indexOf('Троян') >= 0) || '');
    ok('сивият ред на Троян — без делти', !!troyanRow && troyanRow.indexOf('font-size:10px') < 0);
    ok('сивият ред под таблицата',
      t.indexOf('Сравнението е спрямо предходното подаване на обекта. Червено = спад от 10 или повече палета от един тип.') >= 0);
    ok('…и е СЛЕД таблицата', html.indexOf('Сравнението е спрямо') > html.indexOf('</table>'));
    h.close();
  }

  section('6) нула спадове → секцията я няма');
  {
    const h = env(thr('100'));
    const d = await collect(h);
    const html = h.w.reportPalletsHtml(d);
    ok('drops е празен', Array.isArray(d.drops) && d.drops.length === 0, JSON.stringify(d.drops));
    ok('няма „Спад за проверка"', html.indexOf('Спад за проверка') < 0);
    ok('няма червена делта', html.indexOf('color:#dc2626;font-weight:700;">−') < 0);
    ok('сивият ред под таблицата остава', html.indexOf('Сравнението е спрямо предходното подаване') >= 0);
    h.close();
  }

  section('6) стари данни без drops/threshold (обратна съвместимост на рендера)');
  {
    const h = env();
    let html = '';
    try { html = h.w.reportPalletsHtml({ reportDate: DAY, storeCount: 1, missing: [], totals: { total: 1 },
      filled: [{ store: 'Враца', reportDate: DAY, note: '', total: 1, euro_pallets: 1, small_pallets: 0,
                 nonstandard_pallets: 0, grate_pallets: 0, bilka_pallets: 0 }] }); } catch (e) { html = 'THROW ' + e.message; }
    ok('рендерът не хвърля и няма секция', html.indexOf('THROW') < 0 && html.indexOf('Спад за проверка') < 0, html.slice(0, 80));
    h.close();
  }

  section('8) palletsIsLocked — часовник на устройството');
  {
    const h = boot({ modules: ['pallets.js'], user: STORE, data: { transport_pallets: [] } });
    const L = h.w.palletsIsLocked;
    const at = (d, hh, mm) => L(new h.w.Date(2026, 8, d, hh, mm));
    ok('пт 16:59 → отворено', at(18, 16, 59) === false);
    ok('пт 17:00 → затворено', at(18, 17, 0) === true);
    ok('пт 23:59 → затворено', at(18, 23, 59) === true);
    ok('сб 00:00 и 12:00 → затворено', at(19, 0, 0) === true && at(19, 12, 0) === true);
    ok('нд 23:59 → затворено', at(20, 23, 59) === true);
    ok('пн 00:00 → отворено', at(21, 0, 0) === false);
    ok('чт 23:59 → отворено', at(17, 23, 59) === false);
    h.close();
  }

  const storeEnv = (ms, rows) => {
    const h = boot({ modules: ['pallets.js'], user: STORE, data: {
      transport_pallets: function (url) {
        const m = /report_date=eq\.([0-9-]+)/.exec(url);
        const all = rows || [];
        return m ? all.filter(r => r.report_date === m[1]) : all;
      }
    } });
    const clock = freezeAt(h.w, ms);
    return { h, clock };
  };

  section('9) формата: без поле за дата, submit праща today()');
  {
    const { h } = storeEnv(local(2026, 9, 16, 12, 0), [pal('Враца', PREV, [1, 0, 0, 0, 0])]);
    h.w.loadPallets(); await ticks();
    const doc = h.doc;
    ok('няма поле pf-date', !doc.getElementById('pf-date'));
    ok('няма нито един input[type=date] във формата', doc.querySelectorAll('#mod-pallets input[type=date]').length === 0);
    const dt = doc.getElementById('pf-date-text');
    ok('датата е текст — днешната (16.09.2026)', !!dt && dt.textContent === h.w.fmtDate('2026-09-16'), dt && dt.textContent);
    ok('подзаглавие „попълва се до петък 17:00"', doc.getElementById('mod-pallets').innerHTML.indexOf('попълва се до петък 17:00') >= 0);
    doc.getElementById('pf-euro_pallets').value = '12';
    doc.getElementById('pf-sent_note').value = ' изпратени 3 ';
    const btn = Array.from(doc.querySelectorAll('#mod-pallets button')).find(b => b.textContent.indexOf('Запази') >= 0);
    if (ok('бутонът „Запази" е налице', !!btn)) {
      realClick(h.w, btn, 'Запази');
      await ticks(); await ticks();
      ok('без ред за днес → един POST', h.calls.post.length === 1 && h.calls.patch.length === 0,
        h.calls.post.length + '/' + h.calls.patch.length);
      const b = (h.calls.post[0] || {}).body || {};
      ok('report_date = today() = 2026-09-16', b.report_date === '2026-09-16', b.report_date);
      ok('стойностите пътуват', b.euro_pallets === 12 && b.sent_note === 'изпратени 3' && b.store_name === 'Враца', JSON.stringify(b));
      ok('търсенето на съществуващ ред е по днешната дата',
        h.calls.get.some(u => /transport_pallets\?store_name=eq\.[^&]+&report_date=eq\.2026-09-16$/.test(u)), h.calls.get.join('\n'));
    }
    h.close();
  }
  {
    const todays = pal('Враца', '2026-09-16', [4, 0, 0, 0, 0], 'сутрин');
    todays.id = 'row-16';
    const { h } = storeEnv(local(2026, 9, 16, 12, 0), [todays]);
    h.w.loadPallets(); await ticks();
    ok('днешният ред се зарежда във формата', h.doc.getElementById('pf-euro_pallets').value === '4');
    const btn = Array.from(h.doc.querySelectorAll('#mod-pallets button')).find(b => b.textContent.indexOf('Запази') >= 0);
    realClick(h.w, btn, 'Запази (редакция)');
    await ticks(); await ticks();
    ok('има днешен ред → PATCH по id, без POST', h.calls.patch.length === 1 && h.calls.post.length === 0 &&
      /id=eq\.row-16/.test(h.calls.patch[0].url), JSON.stringify(h.calls.patch.map(p => p.url)));
    ok('PATCH-ът е за днешната дата', (h.calls.patch[0] || {}).body && h.calls.patch[0].body.report_date === '2026-09-16');
    h.close();
  }

  section('10) заключено: съобщение вместо бутон; submit от стар таб отказва');
  {
    const { h } = storeEnv(local(2026, 9, 18, 17, 30));
    h.w.loadPallets(); await ticks();
    const lk = h.doc.getElementById('pf-locked');
    ok('петък 17:30: съобщението стои', !!lk &&
      lk.textContent.indexOf('Подаването за седмицата е затворено в петък 17:00. Отваря се отново в понеделник.') >= 0,
      lk && lk.textContent);
    ok('…и няма бутон „Запази"', !Array.from(h.doc.querySelectorAll('#mod-pallets button')).some(b => b.textContent.indexOf('Запази') >= 0));
    h.close();
  }
  {
    const { h } = storeEnv(local(2026, 9, 20, 23, 59));
    h.w.loadPallets(); await ticks();
    ok('неделя 23:59: още затворено', !!h.doc.getElementById('pf-locked'));
    h.close();
  }
  {
    const { h, clock } = storeEnv(local(2026, 9, 18, 16, 59));
    h.w.loadPallets(); await ticks();
    const btn = Array.from(h.doc.querySelectorAll('#mod-pallets button')).find(b => b.textContent.indexOf('Запази') >= 0);
    if (ok('петък 16:59: бутонът е налице', !!btn)) {
      clock.ms = local(2026, 9, 18, 17, 0);
      realClick(h.w, btn, 'Запази след 17:00');
      await ticks(); await ticks();
      ok('кликът в 17:00 не пише нищо', h.calls.post.length === 0 && h.calls.patch.length === 0);
      ok('…и не търси ред', !h.calls.get.some(u => /report_date=eq\./.test(u)), h.calls.get.join('\n'));
      ok('toast със същото съобщение', h.calls.toast.some(m => String(m).indexOf('затворено в петък 17:00') >= 0), h.calls.toast.join(' | '));
    }
    h.close();
  }
  {
    const { h } = storeEnv(local(2026, 9, 21, 0, 0));
    h.w.loadPallets(); await ticks();
    ok('понеделник 00:00: бутонът се връща', !h.doc.getElementById('pf-locked') &&
      Array.from(h.doc.querySelectorAll('#mod-pallets button')).some(b => b.textContent.indexOf('Запази') >= 0));
    h.close();
  }

  report();
})();
