/* ОТЧЕТ „ПАЛЕТИ ЗА ПРИБИРАНЕ" — петък 21:00, по обект.

   collectPalletsReportData(scope, cb) + reportPalletsHtml(data) +
   reportPalletsSubject(reportDate) + reportPalletsRecipients(recipients, users),
   дословно същите в send-scheduled-report (tests/report-edge-sync.test.js).

   „Попълнил" = най-новият ред на обекта от ПОНЕДЕЛНИКА на седмицата до
   отчетния ден. Ред отпреди понеделника е сив и не влиза в „Общо".

     a) ред за отчетния ден              → в таблицата с вярно общо, без дата
     b) ред от четвъртък същата седмица  → попълнил, „Шумен (чт 17.09)"
        + граница: ред от ПОНЕДЕЛНИК     → попълнил, „(пн 14.09)"
        + два реда в седмицата           → печели най-новият
     b2) ред само от миналия петък       → непопълнил, сив „(последно 11.09)"
     c) без нито един ред                → само в „не са попълнили"
     d) извън scope                      → никъде
     e) ред „Общо" = сума по колони (само попълнените за седмицата)
     f) темата носи датата в bg формат
     g) получатели: регионален само за своите; report_recipients weekly=true
        и scope_stores=null → всички 18; управител не е в списъка

   Плюс: истински клик по „Тест до мен" на реда „Палети" в Администрация →
   Известия → „📧 Общи отчети" (до 15.09.2026 — лента в таб „Днес") и нула
   заявки към report_snapshots.

   Часовникът е замразен в петък 18.09.2026 21:00 — момента на крона.

   Пускане:  node tests/pallets-report.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* 18 отчетни обекта + ЦО, два склада и повторен Шумен — отпадат. */
const ALL_USERS = [
  'Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово',
  'Козлодуй', 'Кърджали', 'Логистичен склад Добрич', 'Логистичен склад Търговище',
  'Монтана', 'Петрич', 'Пирдоп', 'Раднево', 'Севлиево', 'Силистра',
  'Сливен', 'Троян', 'Търговище', 'Централен офис', 'Шумен', 'Шумен'
].map(function (s) { return { store_name: s }; });

const DAY = '2026-09-18';    /* петък — отчетният ден */
const THU = '2026-09-17';
const MON = '2026-09-14';    /* понеделникът на същата седмица */
const SUN = '2026-09-13';    /* неделя — ПРЕДХОДНАТА седмица */
const PREV = '2026-09-11';   /* миналият петък */
const SCOPE = ['Враца', 'Габрово', 'Добрич', 'Шумен', 'Пирдоп', 'Троян', 'Севлиево'];

function pal(store, date, v, note) {
  return { store_name: store, report_date: date,
           euro_pallets: v[0], small_pallets: v[1], nonstandard_pallets: v[2],
           grate_pallets: v[3], bilka_pallets: v[4], sent_note: note || null,
           updated_at: date + 'T18:00:00Z' };
}
const PALLETS = [
  pal('Враца', DAY, [10, 5, 2, 1, 0], 'изпратени 4'),        /* a) общо 18 */
  pal('Враца', THU, [1, 1, 1, 1, 1], 'ЧЕТВЪРТЪК-ВРАЦА'),     /* по-стар в седмицата — губи */
  pal('Враца', PREV, [500, 0, 0, 0, 0], 'СТАР-ВРАЦА'),        /* миналата седмица — губи */
  pal('Габрово', DAY, [30, 0, 0, 0, 0]),                      /* a) общо 30 — най-отгоре */
  pal('Добрич', DAY, [0, 0, 0, 0, 0]),                        /* попълнил „нула" */
  pal('Шумен', THU, [7, 1, 0, 0, 0], 'в четвъртък'),          /* b) четвъртък → попълнил */
  pal('Шумен', PREV, [900, 0, 0, 0, 0], 'СТАР-ШУМЕН'),        /* по-стар — губи */
  pal('Севлиево', MON, [2, 0, 0, 0, 0]),                      /* граница: понеделник → попълнил */
  pal('Троян', PREV, [4, 0, 0, 0, 0], 'миналия петък'),       /* b2) само миналия петък → сив */
  pal('Троян', SUN, [6, 0, 0, 0, 0], 'в неделя'),             /* граница: неделя преди понеделника → сив */
  pal('Силистра', DAY, [99, 0, 0, 0, 0], 'ИЗВЪН-ОБХВАТ')      /* d) извън SCOPE */
  /* Пирдоп — c) нито един ред */
];

function freezeAt(w, iso) {
  const Real = w.Date, fixedMs = new Real(iso).getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}

function env(modules) {
  const h = boot({
    modules: modules || ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: { users: ALL_USERS, transport_pallets: PALLETS, report_snapshots: [] }
  });
  freezeAt(h.w, DAY + 'T21:00:00');
  return h;
}
const collect = (h, scope) => new Promise(res => { h.w.collectPalletsReportData(scope, res); });
const names = arr => (arr || []).map(x => x.store);

(async function () {

  section('a) обект с ред за отчетния ден → в таблицата с вярно общо');
  {
    const h = env();
    const d = await collect(h, SCOPE);
    if (ok('колекторът връща данни', !!d, String(d))) {
      ok('отчетният ден е петъкът на крона', d.reportDate === DAY, d.reportDate);
      ok('попълнилите: Габрово, Враца, Шумен, Севлиево, Добрич — по общо низходящо',
        names(d.filled).join('|') === 'Габрово|Враца|Шумен|Севлиево|Добрич', names(d.filled).join('|'));
      const vr = d.filled.find(x => x.store === 'Враца') || {};
      ok('Враца: печели петъчният ред (общо 18), не четвъртъчният и не старият',
        vr.total === 18 && vr.reportDate === DAY, JSON.stringify(vr));
      ok('Враца: колоните и бележката пътуват',
        vr.euro_pallets === 10 && vr.small_pallets === 5 && vr.nonstandard_pallets === 2 &&
        vr.grate_pallets === 1 && vr.bilka_pallets === 0 && vr.note === 'изпратени 4', JSON.stringify(vr));
      const dob = d.filled.find(x => x.store === 'Добрич');
      ok('Добрич с общо 0 и без бележка Е попълнил', !!dob && dob.total === 0, JSON.stringify(dob));

      const html = h.w.reportPalletsHtml(d);
      ok('„Попълнили 5 от 7 обекта"', html.indexOf('Попълнили 5 от 7 обекта') >= 0);
      ok('заглавията на колоните', ['Обект', 'Евро', 'Малки', 'Нестанд.', 'Скари', 'Билка', 'Общо', 'Бележка']
        .every(t => html.indexOf('>' + t + '</th>') >= 0));
      ok('Габрово е ред преди Враца в таблицата',
        html.indexOf('>Габрово</a>') >= 0 && html.indexOf('>Габрово</a>') < html.indexOf('>Враца</a>'));
      ok('редовете от отчетния ден са БЕЗ дата в името',
        html.indexOf('>Враца</a></td>') >= 0 && html.indexOf('>Габрово</a></td>') >= 0 &&
        html.indexOf('>Добрич</a></td>') >= 0);
      ok('по-старите редове на Враца не стигат до писмото',
        html.indexOf('ЧЕТВЪРТЪК-ВРАЦА') < 0 && html.indexOf('СТАР-ВРАЦА') < 0);
    }
    h.close();
  }

  section('b) ред от четвъртък същата седмица → попълнил, с датата в името');
  {
    const h = env();
    const d = await collect(h, SCOPE);
    const sh = d.filled.find(x => x.store === 'Шумен');
    ok('Шумен Е попълнил — с четвъртъчния ред (общо 8)', !!sh && sh.reportDate === THU && sh.total === 8,
      JSON.stringify(sh));
    ok('Шумен НЕ е в непопълнилите', names(d.missing).indexOf('Шумен') < 0, names(d.missing).join('|'));
    const sv = d.filled.find(x => x.store === 'Севлиево');
    ok('граница: ред от ПОНЕДЕЛНИК на седмицата също е попълнил', !!sv && sv.reportDate === MON,
      JSON.stringify(sv));

    const html = h.w.reportPalletsHtml(d);
    ok('в колоната Обект: „Шумен (чт 17.09)"',
      /<a [^>]*>Шумен<\/a> <span[^>]*>\(чт 17\.09\)<\/span><\/td>/.test(html));
    ok('„Севлиево (пн 14.09)"',
      /<a [^>]*>Севлиево<\/a> <span[^>]*>\(пн 14\.09\)<\/span><\/td>/.test(html));
    ok('бележката от четвъртък е в реда', html.indexOf('в четвъртък') >= 0);
    ok('старият ред на Шумен не стига до писмото', html.indexOf('СТАР-ШУМЕН') < 0);
    h.close();
  }

  section('b2) ред само от миналия петък → непопълнил, сив; c) без ред изобщо');
  {
    const h = env();
    const d = await collect(h, SCOPE);
    ok('непопълнили: Пирдоп, Троян (по азбучен ред)',
      names(d.missing).join('|') === 'Пирдоп|Троян', names(d.missing).join('|'));
    const tr = d.missing.find(x => x.store === 'Троян') || {};
    ok('b2) Троян носи най-новия си ред отпреди понеделника — неделя 13.09',
      !!tr.last && tr.last.reportDate === SUN && tr.last.total === 6, JSON.stringify(tr));
    const pi = d.missing.find(x => x.store === 'Пирдоп') || {};
    ok('c) Пирдоп е без ред изобщо', pi.last === null, JSON.stringify(pi));

    const html = h.w.reportPalletsHtml(d);
    ok('оранжевият ред „Не са попълнили: Пирдоп, Троян"',
      /color:#c2410c;[^>]*>Не са попълнили: Пирдоп, Троян</.test(html));
    ok('b2) сивият ред на Троян със старата дата',
      /color:#94a3b8;[^"]*">Троян <span[^>]*>\(последно 13\.09\)<\/span>/.test(html));
    ok('c) Пирдоп се споменава САМО в „Не са попълнили"', html.split('Пирдоп').length - 1 === 1,
      String(html.split('Пирдоп').length - 1));
    ok('непопълнилите са под попълнилите', html.indexOf('>Добрич</a>') < html.indexOf('>Троян <span'));
    h.close();
  }

  section('b2) контрола: само миналия петък, без неделята');
  {
    /* Без неделния ред последният на Троян е миналият петък — точно случаят
       от заданието. Неделята по-горе заковава границата „< понеделник". */
    const h = boot({
      modules: ['bulletin.js', 'report.js'], user: ADMIN,
      data: { users: ALL_USERS, report_snapshots: [],
              transport_pallets: PALLETS.filter(p => !(p.store_name === 'Троян' && p.report_date === SUN)) }
    });
    freezeAt(h.w, DAY + 'T21:00:00');
    const d = await collect(h, SCOPE);
    const tr = d.missing.find(x => x.store === 'Троян') || {};
    ok('Троян е непопълнил с реда от миналия петък', !!tr.last && tr.last.reportDate === PREV,
      JSON.stringify(tr));
    ok('„(последно 11.09)" в сивия ред', h.w.reportPalletsHtml(d).indexOf('(последно 11.09)') >= 0);
    h.close();
  }

  section('d) обект извън обхвата → никъде');
  {
    const h = env();
    const d = await collect(h, SCOPE);
    ok('Силистра не е в попълнилите', names(d.filled).indexOf('Силистра') < 0);
    ok('Силистра не е в непопълнилите', names(d.missing).indexOf('Силистра') < 0);
    const html = h.w.reportPalletsHtml(d);
    ok('и я няма в писмото', html.indexOf('Силистра') < 0 && html.indexOf('ИЗВЪН-ОБХВАТ') < 0);

    const all = await collect(h, null);
    ok('КОНТРОЛА: без обхват Силистра Е вътре — решава филтърът по scope',
      names(all.filled).indexOf('Силистра') >= 0, names(all.filled).join('|'));
    h.close();
  }

  section('e) ред „Общо" = сума по колони (само попълнените за седмицата)');
  {
    const h = env();
    const d = await collect(h, SCOPE);
    const t = d.totals;
    /* Габрово 30 + Враца 10/5/2/1/0 + Шумен 7/1 + Севлиево 2 + Добрич 0.
       Троян (сив) НЕ влиза — иначе евро щеше да е 55. */
    ok('сумите по колони: 49/6/2/1/0, общо 58',
      t.euro_pallets === 49 && t.small_pallets === 6 && t.nonstandard_pallets === 2 &&
      t.grate_pallets === 1 && t.bilka_pallets === 0 && t.total === 58, JSON.stringify(t));
    const byRows = d.filled.reduce((s, x) => s + x.total, 0);
    ok('общото е равно на сбора на попълнените редове', t.total === byRows, t.total + ' vs ' + byRows);

    const html = h.w.reportPalletsHtml(d);
    const i = html.lastIndexOf('>Общо</td>');
    const foot = i >= 0 ? html.slice(i, html.indexOf('</tr>', i)) : '';
    const nums = (foot.match(/>(\d+)<\/td>/g) || []).map(s => s.replace(/\D/g, ''));
    ok('редът „Общо" в писмото е 49, 6, 2, 1, 0, 58', nums.join(',') === '49,6,2,1,0,58', nums.join(','));
    h.close();
  }

  section('f) темата носи датата в bg формат');
  {
    const h = env();
    const d = await collect(h, SCOPE);
    ok('„Палети за прибиране — 18.09.2026"',
      h.w.reportPalletsSubject(d.reportDate) === 'Палети за прибиране — 18.09.2026',
      h.w.reportPalletsSubject(d.reportDate));
    ok('без дата — без „NaN"', h.w.reportPalletsSubject(null) === 'Палети за прибиране');
    const html = h.w.reportPalletsHtml(d);
    const wanted = new Date(DAY + 'T00:00:00').toLocaleDateString('bg-BG',
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    ok('шапката носи датата от данните', html.indexOf(wanted) >= 0, wanted);
    h.close();
  }

  section('g) получатели');
  {
    const h = env();
    const recipients = [
      { email: 'owner@temax.bg', name: 'Собственик', active: true, weekly: true, scope_stores: null },
      { email: 'daily-only@temax.bg', active: true, weekly: false, scope_stores: null },
      { email: 'off@temax.bg', active: false, weekly: true, scope_stores: null },
      { email: 'Reg@Temax.bg', name: 'Колева', active: true, weekly: true, scope_stores: ['Сливен'] }
    ];
    const users = [
      { email: 'reg@temax.bg', display_name: 'Колева', is_regional: true, active: true, assigned_stores: SCOPE },
      { email: 'mgr@temax.bg', display_name: 'Управител', role: 'manager', is_regional: false,
        active: true, store_name: 'Враца' }
    ];
    const plan = h.w.reportPalletsRecipients(recipients, users);
    const allEmails = plan.all.join('|');
    const persEmails = plan.personal.map(p => String(p.email).toLowerCase()).join('|');

    ok('общото писмо: само owner (weekly=true, без обхват)', allEmails === 'owner@temax.bg', allEmails);
    ok('weekly=false и неактивният не получават', allEmails.indexOf('daily-only') < 0 && allEmails.indexOf('off@') < 0);
    ok('управителят не е никъде', allEmails.indexOf('mgr@') < 0 && persEmails.indexOf('mgr@') < 0,
      allEmails + ' / ' + persEmails);
    ok('един личен запис за регионалния (дедупликация по имейл)', plan.personal.length === 1, persEmails);
    const reg = plan.personal[0] || { stores: [] };
    ok('обхватът му е assigned_stores + Сливен от report_recipients',
      reg.stores.slice().sort().join('|') === SCOPE.concat(['Сливен']).sort().join('|'), reg.stores.join('|'));

    const regData = await collect(h, SCOPE);
    ok('регионалният вижда само своите 7', regData.storeCount === 7 &&
      names(regData.filled).concat(names(regData.missing)).every(s => SCOPE.indexOf(s) >= 0),
      regData.storeCount + ': ' + names(regData.filled).concat(names(regData.missing)).join('|'));
    const fullData = await collect(h, null);
    ok('report_recipients с scope_stores=null вижда всички 18', fullData.storeCount === 18,
      String(fullData.storeCount));
    h.close();
  }

  section('Без snapshot и „Тест до мен" в Администрация → Известия');
  {
    const h = env(['bulletin.js', 'email.js', 'admin.js', 'report.js']);
    const sent = [];
    h.w.sendEmail = function (to, subject, html) {
      sent.push({ to: to, subject: subject, html: html });
      return Promise.resolve({ ok: true, status: 200 });
    };
    h.w.loadReportsAdmin();
    await ticks(); await ticks(); await ticks();
    const row = h.doc.getElementById('report-row-pallets');
    const btn = row && Array.from(row.querySelectorAll('button'))
      .find(b => b.textContent.trim() === 'Тест до мен');
    if (ok('редът „Палети" има бутон „Тест до мен"', !!btn)) {
      ok('разписанието е петък 21:00', row.textContent.indexOf('петък 21:00') >= 0, row.textContent);
      ok('без „Изпрати сега" (ръчен път до получателите няма)', row.textContent.indexOf('Изпрати сега') < 0);
      realClick(h.w, btn, 'Палети: Тест до мен');
      await ticks(); await ticks();
      ok('кликът праща точно едно писмо', sent.length === 1, String(sent.length));
      const m = sent[0] || {};
      ok('до имейла на натисналия', m.to === ADMIN.email, String(m.to));
      ok('с темата на палетите + „(тест)"', m.subject === 'Палети за прибиране — 18.09.2026 (тест)', String(m.subject));
      ok('и таблицата вътре (всички 18)', !!m.html && m.html.indexOf('от 18 обекта') >= 0);
    }
    const snapWrites = h.calls.post.concat(h.calls.patch)
      .filter(p => JSON.stringify(p).indexOf('report_snapshots') >= 0);
    ok('нула записа в report_snapshots', snapWrites.length === 0, JSON.stringify(snapWrites));
    ok('и нито едно четене от report_snapshots',
      h.calls.get.filter(u => u.indexOf('report_snapshots') >= 0).length === 0);
    h.close();
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
