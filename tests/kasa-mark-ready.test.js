/* Каса → „📤 Изпрати за проверка към счетоводство" (kasa-docs.js markReady).

   До 06.11.2026 markReady() показваше зелено, без да погледне резултата от
   PATCH-овете, казваше „Няма касови отчети за днес" при работен ден вчера и
   след изпращане нищо не казваше на обекта, че вече е изпратил. Сега:
   - неуспешен PATCH → червен toast с кой ПОС не мина, БЕЗ зелено;
   - ден без отчети → текстът носи датата на работния ден (дд.мм);
   - всички потвърдени ПОС за деня с ready_at → ред
     „📤 Изпратено за проверка на дд.мм в чч:мм" до бутона; нов потвърден
     без ready_at → редът изчезва, бутонът си стои.

   Мутанти (06.11.2026, всеки събаря теста):
   М1. проверката `if (bad.length)` махната (старото поведение)  → секция 3 пада.
   М2. kasaReadySentAt() с `some(ready_at)` вместо „всички"       → секция 5 пада.
   М3. текстът пак „за днес"                                       → секция 4 пада.

   Пускане:
     node tests/kasa-mark-ready.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, dayOffset, ticks } = H;

const STORE = 'Троян';
const USER = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: STORE };
const DAY = dayOffset(-1);
const DM = DAY.slice(8, 10) + '.' + DAY.slice(5, 7);

function rep(id, n, status, extra) {
  return Object.assign({
    id: id, store_name: STORE, date: DAY, pos_number: n, kasa_number: n, cashier_name: 'Касиер ' + n,
    status: status, total_turnover: 100, cash_turnover: 100, card_turnover: 0, storna_total: 0,
    counted_cash: 100, razlika: 0, ready_at: null, ready_by: null
  }, extra || {});
}

/* kasa_reports в „базата" отразява направените PATCH-ове — както би
   върнал истинският loadKasa() след успешно изпращане. */
function env(reps, fail) {
  let h;
  const base = JSON.parse(JSON.stringify(reps));
  h = boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: USER,
    fail: fail,
    data: {
      kasa_reports: () => base.map(r => {
        /* паднал PATCH (calls.notOk) не променя „базата" */
        const bad = h ? h.calls.notOk.map(x => x.url) : [];
        const p = (h ? h.calls.patch : []).filter(c => c.table === 'kasa_reports' &&
          c.url.indexOf('id=eq.' + r.id) >= 0 && bad.indexOf(c.url) < 0).pop();
        return p ? Object.assign({}, r, p.body) : r;
      }),
      kasa_glavna: [], kasa_zoborot: [], kasa_documents: [], stores: []
    }
  });
  h.w.kasaSetDate(DAY);
  h.w.kasaView = 'pos';
  h.w.kasaReports = JSON.parse(JSON.stringify(reps));
  /* toast с цвета — harness-ът пази само текста */
  h.toasts = [];
  const prev = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: m, c: c }); return prev(m, c); };
  return h;
}
async function renderAndInit(h) {
  h.w.renderKasa();
  h.w.initKasaDocsView();
  await ticks(2);
}
function sendBtn(doc) { return btn(doc.getElementById('ready-btn-wrap'), 'Изпрати за проверка'); }
const isRed = t => t.c === '#dc2626';
const isGreen = t => !t.c && t.m.indexOf('📤') === 0;

(async function run() {

  section('1. Зареждане');
  {
    const h = env([]);
    ok('markReady и kasaReadySentAt съществуват',
      typeof h.w.markReady === 'function' && typeof h.w.kasaReadySentAt === 'function');
    h.close();
  }

  section('2. Успешен PATCH → зелено + ред „Изпратено…"');
  {
    const h = env([rep('r-1', 1, 'confirmed'), rep('r-2', 2, 'confirmed')]);
    const { w, doc, calls } = h;
    if (guard('рендер не хвърля', () => w.renderKasa())) {
      w.initKasaDocsView();
      ok('преди изпращане ред „Изпратено" няма', !doc.getElementById('kasa-ready-sent'));
      const b = sendBtn(doc);
      if (ok('бутонът го има', !!b)) {
        realClick(w, b);
        await ticks(10);
        await new Promise(r => setTimeout(r, 120));   /* setTimeout(initKasaDocsView,50) след loadKasa */
        ok('2 PATCH-а с ready_at', calls.patch.filter(c => c.table === 'kasa_reports' && c.body.ready_at).length === 2);
        ok('зелен toast', h.toasts.some(isGreen), JSON.stringify(h.toasts));
        ok('червен toast няма', !h.toasts.some(isRed), JSON.stringify(h.toasts));
        const s = doc.getElementById('kasa-ready-sent');
        if (ok('ред „Изпратено" се появява', !!s)) {
          ok('текстът е „📤 Изпратено за проверка на дд.мм в чч:мм"',
            new RegExp('^📤 Изпратено за проверка на \\d\\d\\.\\d\\d в \\d\\d:\\d\\d$').test(s.textContent.trim()), s.textContent);
          ok('бутонът си стои до реда', !!sendBtn(doc));
        }
      }
    }
    h.close();
  }

  section('3. Неуспешен PATCH → червено с ПОС-а, БЕЗ зелено');
  {
    const h = env([rep('r-1', 1, 'confirmed'), rep('r-2', 2, 'confirmed')],
      { PATCH: { status: 500, body: { message: 'boom' }, url: /id=eq\.r-2/ } });
    const { w, doc } = h;
    await renderAndInit(h);
    realClick(w, sendBtn(doc));
    await ticks(10);
    await new Promise(r => setTimeout(r, 120));
    const red = h.toasts.filter(isRed);
    if (ok('червен toast', red.length === 1, JSON.stringify(h.toasts))) {
      ok('казва кой ПОС (ПОС 2)', red[0].m.indexOf('ПОС 2') >= 0, red[0].m);
      ok('НЕ казва ПОС 1 като неуспешен', red[0].m.indexOf('ПОС 1') < 0, red[0].m);
      ok('носи причината от базата', red[0].m.indexOf('boom') >= 0, red[0].m);
    }
    ok('зелено няма', !h.toasts.some(isGreen), JSON.stringify(h.toasts));
    ok('ред „Изпратено" няма (ПОС 2 е без ready_at)', !doc.getElementById('kasa-ready-sent'));
    h.close();
  }

  section('4. Ден без отчети → текстът носи датата на работния ден');
  {
    const h = env([]);
    const { w, doc, calls } = h;
    await renderAndInit(h);
    const b = sendBtn(doc);
    if (ok('бутонът го има и при празен ден', !!b)) {
      realClick(w, b);
      await ticks(4);
      const red = h.toasts.filter(isRed);
      ok('червено „Няма касови отчети за ' + DM + '"', red.length === 1 && red[0].m === 'Няма касови отчети за ' + DM, JSON.stringify(h.toasts));
      ok('не казва „днес"', !h.toasts.some(t => t.m.indexOf('днес') >= 0));
      ok('PATCH няма', calls.patch.length === 0);
    }
    h.close();
  }

  section('5. Нов потвърден без ready_at → редът изчезва, бутонът работи');
  {
    const at = '2026-11-05T14:05:00.000Z';
    const h = env([rep('r-1', 1, 'confirmed', { ready_at: at, ready_by: 'X' }), rep('r-2', 2, 'confirmed')]);
    const { w, doc, calls } = h;
    await renderAndInit(h);
    ok('ред „Изпратено" НЯМА (ПОС 2 е без ready_at)', !doc.getElementById('kasa-ready-sent'));
    ok('kasaReadySentAt() е празно', w.kasaReadySentAt() === '');
    realClick(w, sendBtn(doc));
    await ticks(10);
    await new Promise(r => setTimeout(r, 120));
    ok('бутонът праща', calls.patch.filter(c => c.table === 'kasa_reports').length === 2);
    ok('след това редът се появява', !!doc.getElementById('kasa-ready-sent'));
    h.close();
  }

  section('6. Всички с ready_at → ред с часа на ПОСЛЕДНОТО изпращане; черновите не пречат');
  {
    const a = '2026-11-05T08:05:00.000Z', b2 = '2026-11-05T14:07:00.000Z';
    const h = env([rep('r-1', 1, 'confirmed', { ready_at: a }), rep('r-2', 2, 'confirmed', { ready_at: b2 }), rep('r-3', 3, 'draft')]);
    const { doc } = h;
    await renderAndInit(h);
    const d = new Date(b2), p = n => (n < 10 ? '0' : '') + n;
    const exp = '📤 Изпратено за проверка на ' + p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' в ' + p(d.getHours()) + ':' + p(d.getMinutes());
    const s = doc.getElementById('kasa-ready-sent');
    ok('редът е с последния час', !!s && s.textContent.trim() === exp, s && s.textContent);
    h.close();
  }

  section('7. Граничен: само чернови → ред няма');
  {
    const h = env([rep('r-1', 1, 'draft', { ready_at: '2026-11-05T08:05:00.000Z' })]);
    await renderAndInit(h);
    ok('ред „Изпратено" няма', !h.doc.getElementById('kasa-ready-sent'));
    h.close();
  }

  report();
})();
