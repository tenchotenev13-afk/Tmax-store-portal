/* Заседнали „върнати" Равнение / Главна каса след преподаване на ПОС отчетите.

   returnKasaForRevision() (kasa-docs.js) маркира и ТРИТЕ документа със
   status='returned'. Магазинът поправя и потвърждава наново само ПОС
   отчетите — Равнението и Главна каса никой не пипа и оставаха 'returned'
   завинаги, тоест дневният отчет ги показваше всеки ден под „Непоправени от
   по-рано". На 20.09.2026 39 такива реда бяха затворени на ръка
   (backup: kasa_cleanup_bak_20260920).

   Какво заковава тестът:
     а) реален КЛИК по „✅ Потвърди" на последния непотвърден ПОС отчет на
        върнат ден → PATCH на kasa_glavna и kasa_zoborot към 'confirmed';
     б) остане ли поне един непотвърден ПОС отчет → НИКАКЪВ PATCH по двата
        документа;
     в) collectDailyKasaSection() не показва върнато Равнение, когато всички
        ПОС отчети за обект+дата са потвърдени, но ГО показва при поне един
        returned/draft — защитната мрежа за старите данни.

   Три засади, всяка вече ухапала веднъж:
     · kasa_zoborot НЯМА колона confirmed_at (само confirmed_by) — подаването
       ѝ връща 400 от PostgREST. Тестът проверява ИЗРИЧНО, че ключът липсва
       в тялото, не само че status е верен.
     · Гейтът е confirmed_at > returned_at, не просто status='confirmed':
       отчет, върнат СЛЕД като е бил потвърден, си носи стария confirmed_at.
     · Провалил се PATCH трябва да даде ЧЕРВЕН toast, не тих успех.

   АНТИ-ТАВТОЛОГИЯ: (в) проверява и в обратната посока — обектът с непотвърден
   ПОС отчет ТРЯБВА да се появи в списъка, иначе „не се показва" не доказва
   нищо. Секции а/б четат kasa_reports от стъб, който ПРИЛАГА записаните
   PATCH-ове, тоест състоянието след клика е реалното, не нагласено.

   Пускане:  node tests/kasa-returned-day-close.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, ticks } = H;

/* ── Данни ────────────────────────────────────────────────────────────────── */

const MGR = { email: 'm@temax.bg', display_name: 'Управител Силистра',
              role: 'manager', store_name: 'Силистра' };

const RET_AT = '2026-09-18T09:00:00+03:00';
const OLD_OK = '2026-09-17T20:00:00+03:00'; /* потвърдено ПРЕДИ връщането */

function pos(id, over) {
  return Object.assign({
    id: id, store_name: 'Силистра', pos_number: 1, kasa_number: 1,
    cashier_name: 'Мария', status: 'draft',
    total_turnover: 100, cash_turnover: 100, card_turnover: 0,
    storna_total: 0, counted_cash: 100, razlika: 0,
    return_reason: 'Липсва бележка', returned_by: 'Счетоводство',
    returned_at: RET_AT, confirmed_at: null, confirmed_by: null
  }, over || {});
}

/* Стъб на kasa_reports, който ПРИЛАГА записаните PATCH-ове по id. Без това
   GET-ът вътре в kasaCloseReturnedDay() би върнал състоянието ОТПРЕДИ клика
   и секция (а) щеше да минава по погрешна причина. */
function env(rows, over) {
  let h = null;
  const opts = Object.assign({
    modules: ['kasa.js', 'kasa-docs.js'],
    user: MGR,
    confirm: true,
    data: {
      kasa_reports: function () {
        const out = rows.map(function (r) { return Object.assign({}, r); });
        if (h) h.calls.patch.forEach(function (p) {
          if (p.table !== 'kasa_reports') return;
          const m = /id=eq\.([^&]+)/.exec(p.url);
          if (!m) return;
          out.forEach(function (r) { if (r.id === m[1]) Object.assign(r, p.body); });
        });
        return out;
      },
      kasa_glavna: [], kasa_zoborot: [], stores: []
    }
  }, over || {});
  h = boot(opts);
  h.w.kasaReports = rows.map(function (r) { return Object.assign({}, r); });
  return h;
}

const patchesTo = function (h, table) {
  return h.calls.patch.filter(function (p) { return p.table === table; });
};
const warnToasts = function (h) {
  return h.calls.toast.filter(function (t) {
    return /НЕ се затвориха/.test(JSON.stringify(t));
  });
};

/* Кликът минава през реалния onclick на „✅ Потвърди" в картата
   „Днешни отчети" — renderKasa() реже по today(), затова датата е днешната. */
async function clickConfirm(h, id) {
  h.w.renderKasa();
  const b = btn(h.doc.getElementById('mod-kasa'), 'Потвърди');
  if (!ok('бутонът „✅ Потвърди" е на екрана (' + id + ')', !!b)) return false;
  realClick(h.w, b);
  await ticks(6);
  return true;
}

(async function run() {

  const TODAY = (function () {
    const h = boot({ modules: ['kasa.js'], user: MGR, data: {} });
    const d = h.w.today(); h.close(); return d;
  })();

  /* ── а) последният ПОС отчет е потвърден → двата документа се затварят ──── */
  section('а) последният непотвърден ПОС отчет → Равнение и Главна каса стават confirmed');
  {
    /* r-1 вече е потвърден СЛЕД връщането; r-2 е черновата, по която кликаме. */
    const rows = [
      pos('r-1', { date: TODAY, pos_number: 1, status: 'confirmed',
                   confirmed_at: '2026-09-18T18:00:00+03:00', confirmed_by: 'Мария' }),
      pos('r-2', { date: TODAY, pos_number: 2, status: 'draft' })
    ];
    const h = env(rows);

    if (await clickConfirm(h, 'r-2')) {
      const rep = patchesTo(h, 'kasa_reports');
      ok('самият ПОС отчет е потвърден', rep.length === 1 &&
         rep[0].body.status === 'confirmed' && !!rep[0].body.confirmed_at,
         JSON.stringify(rep.map(function (p) { return p.body.status; })));

      const g = patchesTo(h, 'kasa_glavna');
      if (ok('има точно един PATCH по Главна каса', g.length === 1, 'реално: ' + g.length)) {
        ok('Главна каса → confirmed', g[0].body.status === 'confirmed', JSON.stringify(g[0].body));
        ok('Главна каса носи confirmed_by = потвърдилият', g[0].body.confirmed_by === MGR.display_name,
           String(g[0].body.confirmed_by));
        ok('Главна каса носи и confirmed_at', !!g[0].body.confirmed_at, String(g[0].body.confirmed_at));
        ok('филтърът пази чужд статус (status=eq.returned)',
           g[0].url.indexOf('status=eq.returned') >= 0, g[0].url);
        ok('филтърът е по обект и дата', g[0].url.indexOf('date=eq.' + TODAY) >= 0 &&
           g[0].url.indexOf(encodeURIComponent('Силистра')) >= 0, g[0].url);
      }

      const z = patchesTo(h, 'kasa_zoborot');
      if (ok('има точно един PATCH по Равнение', z.length === 1, 'реално: ' + z.length)) {
        ok('Равнение → confirmed', z[0].body.status === 'confirmed', JSON.stringify(z[0].body));
        ok('Равнение носи confirmed_by', z[0].body.confirmed_by === MGR.display_name,
           String(z[0].body.confirmed_by));
        /* kasa_zoborot НЯМА тази колона — подаването ѝ значи 400 и нищо не се затваря. */
        ok('Равнение НЕ праща confirmed_at (колоната не съществува)',
           !('confirmed_at' in z[0].body), JSON.stringify(z[0].body));
        ok('филтърът пази чужд статус', z[0].url.indexOf('status=eq.returned') >= 0, z[0].url);
      }
      ok('няма предупредителен toast при успех', warnToasts(h).length === 0,
         JSON.stringify(h.calls.toast));
    }
    h.close();
  }

  /* ── б) остава непотвърден ПОС отчет → нищо не се пипа ──────────────────── */
  section('б) остава непотвърден ПОС отчет → Равнение и Главна каса НЕ се пипат');
  {
    /* r-1 е черновата, по която кликаме; r-2 остава върнат и непоправен. */
    const rows = [
      pos('r-1', { date: TODAY, pos_number: 1, status: 'draft' }),
      pos('r-2', { date: TODAY, pos_number: 2, status: 'returned' })
    ];
    const h = env(rows);

    if (await clickConfirm(h, 'r-1')) {
      ok('ПОС отчетът пак се потвърждава', patchesTo(h, 'kasa_reports').length === 1);
      ok('Главна каса НЕ е пипната', patchesTo(h, 'kasa_glavna').length === 0,
         JSON.stringify(patchesTo(h, 'kasa_glavna').map(function (p) { return p.url; })));
      ok('Равнение НЕ е пипнато', patchesTo(h, 'kasa_zoborot').length === 0,
         JSON.stringify(patchesTo(h, 'kasa_zoborot').map(function (p) { return p.url; })));
    }
    h.close();
  }

  section('б2) потвърждение ОТПРЕДИ връщането не брои (confirmed_at > returned_at)');
  {
    /* r-1 е със status='confirmed', но confirmed_at е ПРЕДИ returned_at —
       тоест денят е върнат след потвърждаването и никой не го е пипал. */
    const rows = [
      pos('r-1', { date: TODAY, pos_number: 1, status: 'confirmed',
                   confirmed_at: OLD_OK, confirmed_by: 'Мария' }),
      pos('r-2', { date: TODAY, pos_number: 2, status: 'draft' })
    ];
    const h = env(rows);

    if (await clickConfirm(h, 'r-2')) {
      ok('Главна каса НЕ е пипната', patchesTo(h, 'kasa_glavna').length === 0);
      ok('Равнение НЕ е пипнато', patchesTo(h, 'kasa_zoborot').length === 0);
    }
    h.close();
  }

  section('б3) ден, който НИКОГА не е връщан → никакъв излишен PATCH');
  {
    const rows = [
      pos('r-1', { date: TODAY, pos_number: 1, status: 'draft',
                   return_reason: null, returned_by: null, returned_at: null })
    ];
    const h = env(rows);

    if (await clickConfirm(h, 'r-1')) {
      ok('ПОС отчетът е потвърден', patchesTo(h, 'kasa_reports').length === 1);
      ok('Главна каса не се пипа', patchesTo(h, 'kasa_glavna').length === 0);
      ok('Равнение не се пипа', patchesTo(h, 'kasa_zoborot').length === 0);
    }
    h.close();
  }

  section('б4) провален PATCH → предупредителен toast, не тих успех');
  {
    const rows = [
      pos('r-1', { date: TODAY, pos_number: 1, status: 'draft' })
    ];
    const h = env(rows, { fail: { PATCH: { status: 400, url: /kasa_zoborot/,
                                           body: { message: 'column does not exist' } } } });

    if (await clickConfirm(h, 'r-1')) {
      ok('опитът е направен', patchesTo(h, 'kasa_zoborot').length === 1);
      const bad = warnToasts(h);
      if (ok('има предупредителен toast', bad.length === 1, JSON.stringify(h.calls.toast))) {
        ok('toast-ът казва кой документ', /Равнение/.test(JSON.stringify(bad[0])),
           JSON.stringify(bad[0]));
        ok('toast-ът носи причината от PostgREST',
           /column does not exist/.test(JSON.stringify(bad[0])), JSON.stringify(bad[0]));
      }
    }
    h.close();
  }

  /* ── в) защитната мрежа в дневния отчет ─────────────────────────────────── */
  section('в) collectDailyKasaSection: върнато Равнение при всички ПОС confirmed не се показва');
  {
    const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                    store_name: 'Централен офис' };
    const USERS = ['Силистра', 'Търговище', 'Шумен', 'Враца', 'Русе', 'Централен офис']
      .map(function (s) { return { store_name: s }; });

    /* Отчетният ден се смята с истинската функция, не се заковава. */
    const probe = boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: { users: USERS } });
    const d0 = probe.w.reportDailyTargetDate(new Date());
    const shift = function (n) {
      const x = new Date(d0.getTime()); x.setDate(x.getDate() + n); return probe.w.toLocalISO(x);
    };
    const D = shift(0), m1 = shift(-1), m2 = shift(-2), m5 = shift(-5);
    probe.close();
    const at = function (iso, hhmm) { return iso + 'T' + (hhmm || '10:00') + ':00+03:00'; };

    /* Всички ПОС отчети, каквито ги вижда новата пета заявка (date=in.(…)). */
    const ALL_POS = [
      /* Силистра/m1 — ВСИЧКИ потвърдени → Равнението е преподадено */
      { store_name: 'Силистра', date: m1, pos_number: 1, status: 'confirmed', razlika: 0 },
      { store_name: 'Силистра', date: m1, pos_number: 2, status: 'confirmed', razlika: 0 },
      /* Шумен/m1 — един още чернова → Равнението си виси */
      { store_name: 'Шумен', date: m1, pos_number: 1, status: 'confirmed', razlika: 0 },
      { store_name: 'Шумен', date: m1, pos_number: 2, status: 'draft', razlika: 0 },
      /* Търговище/m1 — един още върнат → Равнението си виси */
      { store_name: 'Търговище', date: m1, pos_number: 1, status: 'returned', razlika: 0,
        return_reason: 'ПОС причина', returned_at: at(D) },
      /* Враца/m5 — всички потвърдени → и дългът отпада */
      { store_name: 'Враца', date: m5, pos_number: 1, status: 'confirmed', razlika: 0 }
      /* Русе/m1 — НЯМА нито един ПОС отчет: нула не е „всички потвърдени" */
    ];
    const ZOB = [
      { store_name: 'Силистра', date: m1, razlika: 5, status: 'returned',
        return_reason: 'ЗАСЕДНАЛО', returned_at: at(D) },
      { store_name: 'Шумен', date: m1, razlika: 6, status: 'returned',
        return_reason: 'ЖИВО', returned_at: at(D) },
      { store_name: 'Търговище', date: m1, razlika: 7, status: 'returned',
        return_reason: 'ЖИВО', returned_at: at(D) },
      { store_name: 'Враца', date: m5, razlika: 8, status: 'returned',
        return_reason: 'ЗАСЕДНАЛО', returned_at: at(m2) },
      { store_name: 'Русе', date: m1, razlika: 9, status: 'returned',
        return_reason: 'ЖИВО', returned_at: at(D) }
    ];

    /* Стъбът рутира по query низа, за да НЕ връща цялата таблица на всяка
       заявка: иначе петата заявка и първата биха си разменили отговорите. */
    const h = boot({
      modules: ['bulletin.js', 'report.js'],
      user: ADMIN,
      data: {
        users: USERS, app_settings: [],
        kasa_reports: function (url) {
          if (url.indexOf('date=in.(') >= 0) return ALL_POS;
          if (url.indexOf('status=eq.returned') >= 0) {
            return ALL_POS.filter(function (x) { return x.status === 'returned'; });
          }
          const m = /date=eq\.([0-9-]+)/.exec(url);
          return m ? ALL_POS.filter(function (x) { return x.date === m[1]; }) : ALL_POS;
        },
        kasa_zoborot: function (url) {
          if (url.indexOf('status=eq.returned') >= 0) {
            return ZOB.filter(function (x) { return x.status === 'returned'; });
          }
          const m = /date=eq\.([0-9-]+)/.exec(url);
          return m ? ZOB.filter(function (x) { return x.date === m[1]; }) : ZOB;
        }
      }
    });

    const k = await new Promise(function (resolve) {
      h.w.collectDailyKasaSection(resolve, D, null, 10);
    });
    const zob = k.returned.filter(function (x) { return x.type === 'Равнение'; });
    const zobStores = zob.map(function (x) { return x.store; }).sort();
    const backStores = k.returnedBacklog.map(function (x) { return x.store; }).sort();

    ok('заседналото Равнение на Силистра НЕ влиза в подробния списък',
       zobStores.indexOf('Силистра') < 0, zobStores.join('|'));
    /* Обратната посока — иначе горното не доказва нищо. */
    ok('Равнението на Шумен (един ПОС още чернова) ВЛИЗА',
       zobStores.indexOf('Шумен') >= 0, zobStores.join('|'));
    ok('Равнението на Търговище (един ПОС още върнат) ВЛИЗА',
       zobStores.indexOf('Търговище') >= 0, zobStores.join('|'));
    ok('Равнението на Русе (нула ПОС отчета) ВЛИЗА — нула не е „всички потвърдени"',
       zobStores.indexOf('Русе') >= 0, zobStores.join('|'));
    ok('точно три Равнения остават', zob.length === 3, zobStores.join('|'));

    ok('заседналото Равнение на Враца НЕ влиза и в дълга',
       backStores.indexOf('Враца') < 0, backStores.join('|'));

    /* ПОС отчетите си остават източник на истина за себе си. */
    const posRows = k.returned.filter(function (x) { return x.type.indexOf('ПОС') === 0; });
    ok('върнатият ПОС отчет на Търговище си остава в списъка',
       posRows.length === 1 && posRows[0].store === 'Търговище',
       JSON.stringify(posRows.map(function (x) { return x.store; })));

    h.close();
  }

  report();
})();
