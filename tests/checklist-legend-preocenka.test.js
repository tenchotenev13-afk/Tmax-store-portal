/* Чек лист — легендата „ДА / НЕ / НЯМАТ" е за колоната „преоценка"
   (28.10.2026, сесия checklist-legend-preocenka; Тенчо 28.10 при
   препращането на тестовото писмо до Теодор — без колоната легендата се
   четеше като обща).

   Какво заковава файлът:
   1. писмото: без стойност в „преоценка" (колоната отпада по правилото от
      24a468f) → НЯМА легенда, нито празна кутия; с поне една стойност →
      легендата е там, със заглавие „Колона „преоценка“:" над трите реда;
      нула class= / <style>;
   2. табът: легендата е със заглавието (рендерът на таба, renderChecklist);
   3. текстът на трите реда е непроменен.

   Мутационна проверка (28.10.2026) — всеки вариант пуснат и паднал:
     L1 легендата в писмото — винаги                → пада 1
     L2 легендата в писмото — никога                → пада 1
     L3 без заглавието                              → пада 1 и 2
   Пускане:  node tests/checklist-legend-preocenka.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const M = [
  { key: 'revizia_953', label: 'ревизия',   sublabel: '', value_type: 'yes_no',      sort_order: 1, active: true, source: 'manual' },
  { key: 'preocenka',   label: 'преоценка', sublabel: '', value_type: 'yes_no_none', sort_order: 2, active: true, source: 'manual' }
];
const STORES = ['Враца', 'Габрово'];
const ADMIN = { id: 'u-1', email: 'm.pavlova@temax.bg', display_name: 'М. Павлова', role: 'admin', store_name: 'Централен офис' };
const TITLE = 'Колона „преоценка“:';
const LINE = 'има изпратена преоценка.';
function cl(store, key, f) {
  return Object.assign({ year: 2026, week_number: 43, store_name: store, metric_key: key,
    portal_value: null, control_value: null, control_num: null, comment: null }, f || {});
}

(async function () {
  section('1. Писмото');
  {
    const h = boot({ modules: ['bulletin.js', 'checklist.js'], user: ADMIN, data: {} });
    const W = h.w;
    const noPre = W.checklistEmailHtml(2026, 43, 1, [cl('Враца', 'revizia_953', { control_value: 'da' })], M, STORES, null, {});
    ok('без стойност в „преоценка" → колоната я няма', noPre.indexOf('>преоценка<') < 0);
    ok('… и легендата я няма (нито „има изпратена преоценка.", нито заглавието)', noPre.indexOf(LINE) < 0 && noPre.indexOf(TITLE) < 0);
    ok('… и няма празна кутия на легендата (line-height:1.7)', noPre.indexOf('line-height:1.7') < 0);
    const withPre = W.checklistEmailHtml(2026, 43, 1, [cl('Враца', 'revizia_953', { control_value: 'da' }), cl('Габрово', 'preocenka', { control_value: 'nyamat' })], M, STORES, null, {});
    ok('с една стойност в „преоценка" → колоната е там', withPre.indexOf('>преоценка<') >= 0);
    ok('… легендата е там', withPre.indexOf(LINE) >= 0 && withPre.indexOf('не са подавали, но магазинът е писал, че няма преоценка.') >= 0);
    ok('… със заглавието над трите реда', withPre.indexOf(TITLE) >= 0 && withPre.indexOf(TITLE) < withPre.indexOf(LINE));
    const empty = W.checklistEmailHtml(2026, 43, 1, [], M, STORES, null, {});
    ok('празна седмица → „Няма отметки за седмицата", без легенда', empty.indexOf('Няма отметки за седмицата') >= 0 && empty.indexOf(LINE) < 0);
    ok('нула class=', !/\sclass=/.test(withPre) && !/\sclass=/.test(noPre));
    ok('нула <style>', !/<style/i.test(withPre) && !/<style/i.test(noPre));
    h.close();
  }

  section('2. Табът');
  {
    const h = boot({
      modules: ['bulletin.js', 'checklist.js'], user: ADMIN,
      data: { users: STORES.map(s => ({ store_name: s })), weekly_checklist_metrics: M, weekly_checklist: [],
              weekly_checklist_freezes: [{ year: 2026, week_number: 43 }], weekly_checklist_sends: [], weekly_checklist_responses: [], rpc: [] }
    });
    h.w.checklistYear = 2026; h.w.checklistWeek = 43;
    h.w.loadChecklist(); await ticks(); await ticks();
    const txt = h.doc.getElementById('mod-checklist').textContent;
    ok('табът: легендата със заглавието', txt.indexOf(TITLE) >= 0 && txt.indexOf(TITLE) < txt.indexOf(LINE), txt.slice(-300));
    h.close();
  }

  section('3. Текстът на трите реда');
  {
    const h = boot({ modules: ['bulletin.js', 'checklist.js'], user: ADMIN, data: {} });
    ok('трите реда — непроменени', JSON.stringify(h.w.CHECKLIST_LEGEND_LINES) === JSON.stringify([
      ['ДА', 'има изпратена преоценка.'],
      ['НЕ', 'от магазина не са писали, че няма преоценка.'],
      ['НЯМАТ', 'не са подавали, но магазинът е писал, че няма преоценка.']]));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
