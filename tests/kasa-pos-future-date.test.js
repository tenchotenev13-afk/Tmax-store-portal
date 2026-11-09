/* Каса → ПОС отчет: бъдеща дата не се приема (kasa.js openKasaForm /
   submitKasaForm).

   До 09.11.2026 полето „Дата" приемаше всяка дата. Сега: max = днес на полето
   (календарът не предлага бъдеще) и проверка при „💾 Запази чернова" — max
   не спира ръчно написана дата. Граничен случай: днешната минава, утрешната не.

   Мутанти (09.11.2026, всеки събаря теста):
   М1. проверката в submitKasaForm махната              → секция 3 пада (POST с утре).
   М2. `>` сменено с `>=` (и днес се отказва)            → секция 2 пада.
   М3. max= махнато от полето                            → секция 1 пада.

   Пускане:  node tests/kasa-pos-future-date.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, dayOffset, ticks } = H;

const STORE = 'Троян';
const USER = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: STORE };

function env() {
  const h = boot({ modules: ['kasa.js', 'kasa-docs.js', 'history.js'], user: USER,
    data: { kasa_reports: [], kasa_glavna: [], kasa_zoborot: [], kasa_documents: [], stores: [] } });
  h.w.kasaReports = [];
  h.toasts = [];
  const prev = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: m, c: c }); return prev(m, c); };
  return h;
}
async function submitWith(h, date) {
  h.w.openKasaForm(null);
  const d = h.doc.getElementById('kf-date');
  d.value = date;
  h.doc.getElementById('kf-cashier').value = 'Мария';
  h.doc.getElementById('kf-cash_turnover').value = '10';
  realClick(h.w, btn(h.doc.getElementById('mod-kasa'), 'Запази чернова'));
  await ticks(8);
}
const repWrites = h => h.calls.post.concat(h.calls.patch).filter(c => c.table === 'kasa_reports');

(async function run() {

  section('1. Полето „Дата" има max = днес');
  {
    const h = env();
    if (guard('openKasaForm() не хвърля', () => h.w.openKasaForm(null))) {
      const d = h.doc.getElementById('kf-date');
      ok('max = ' + h.w.today(), !!d && d.getAttribute('max') === h.w.today(), d && d.getAttribute('max'));
    }
    h.close();
  }

  section('2. Днешна дата (граница) → записва се');
  {
    const h = env();
    const t = dayOffset(0);
    await submitWith(h, t);
    const wr = repWrites(h);
    ok('има запис в kasa_reports', wr.length === 1, JSON.stringify(h.toasts));
    ok('с днешната дата', wr.length === 1 && wr[0].body.date === t, wr.length && wr[0].body.date);
    ok('без съобщение за бъдеще', !h.toasts.some(x => x.m.indexOf('бъдещето') >= 0));
    h.close();
  }

  section('3. Утрешна дата → отказ със съобщение, без запис');
  {
    const h = env();
    const tm = dayOffset(1);
    await submitWith(h, tm);
    ok('НЯМА запис', repWrites(h).length === 0, JSON.stringify(repWrites(h)));
    const r = h.toasts.filter(x => x.c === '#dc2626' && x.m.indexOf('бъдещето') >= 0);
    ok('червено „… е в бъдещето"', r.length === 1, JSON.stringify(h.toasts));
    ok('съобщението носи датата ' + h.w.fmtDate(tm), r.length === 1 && r[0].m.indexOf(h.w.fmtDate(tm)) >= 0);
    h.close();
  }

  section('4. Вчерашна дата → записва се');
  {
    const h = env();
    await submitWith(h, dayOffset(-1));
    ok('има запис', repWrites(h).length === 1);
    h.close();
  }

  report();
})();
