/* Минуси — писмото „повтарящи се артикули" (minus_multi) по обхват на
   получателя (29.10.2026, сесия minusi-multi-scope).

   Правилото (report.js и send-scheduled-report v62, еднакво — report-edge-sync):
   обекти на получателя = minus_stores ∩ report_recipients.scope_stores;
   scope_stores NULL → всички minus_stores; масив (и празен) → само сечението.
   Писмото е ОТДЕЛНО за всеки получател. Без обхват — тръгва и при 0 артикула
   (ред „Няма артикул…", непроменено от v61); с обхват — само при непразно
   сечение и поне един артикул в неговите обекти. Неактивен / minus_multi=false →
   няма го. Дедупликация по имейл — първият ред.

   Мутационна проверка (29.10.2026) — всеки вариант пуснат и паднал:
     S1 reportMinusMultiForStores без филтъра по обекти       → пада
     S2 празният масив третиран като NULL (всички обекти)     → пада
     S3 reportMinusMultiShouldSend винаги true (без пропускане) → пада
     S4 reportMinusMultiPlan пренебрегва обхвата               → пада
     S5 едж функцията без scope_stores в заявката             → пада
   Пускане:  node tests/minusi-multi-scope.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const GD = 'Гоце Делчев', MO = 'Монтана';
const MINUS = [GD, MO];
let seq = 0;
function mv(store, material, date, o) {
  seq++;
  return Object.assign({ id: 'm' + seq, store_name: store, material: material, material_desc: 'ОПИСАНИЕ ' + material,
    mvt_type: '955', posting_date: date, mat_doc: 'D' + String(seq).padStart(3, '0'), doc_item: '1', action: null }, o || {});
}
/* Гоце Делчев: 52215 ×3 без становище; Монтана: 66741 ×4 със становище. */
const ROWS = [
  mv(GD, '52215', '2026-10-11'), mv(GD, '52215', '2026-10-13'), mv(GD, '52215', '2026-10-13'),
  mv(MO, '66741', '2026-10-20'), mv(MO, '66741', '2026-10-23'), mv(MO, '66741', '2026-10-24'), mv(MO, '66741', '2026-10-24', { action: 'грешен етикет' })
];
const RC = [
  { email: 't.tenev@temax.bg',    name: 'Теодор Тенев',        active: true, minus_multi: true, scope_stores: null },
  { email: 'm.pavlova@temax.bg',  name: 'Миглена Павлова',     active: true, minus_multi: true },
  { email: 'n.koleva@temax.bg',   name: 'Надя Колева',         active: true, minus_multi: true, scope_stores: [GD, 'Дупница', 'Петрич'] },
  { email: 's.stefanova@temax.bg', name: 'Станислава Стефанова', active: true, minus_multi: true, scope_stores: ['Враца', 'Козлодуй', MO, 'Троян'] },
  { email: 'x.shumen@temax.bg',   name: 'Без сечение',         active: true, minus_multi: true, scope_stores: ['Шумен'] },
  { email: 'empty@temax.bg',      name: 'Празен масив',        active: true, minus_multi: true, scope_stores: [] },
  { email: 'off@temax.bg',        name: 'Неактивен',           active: false, minus_multi: true, scope_stores: null },
  { email: 'noflag@temax.bg',     name: 'Без флага',           active: true, minus_multi: false, scope_stores: null },
  { email: 'T.Tenev@temax.bg ',   name: 'Дубликат',            active: true, minus_multi: true, scope_stores: ['Шумен'] }
];
const ADMIN = { id: 'u-1', email: 'ten.tenev@temax.bg', display_name: 'Тен', role: 'admin', store_name: 'Централен офис' };

(function () {
  const h = boot({ modules: ['minusi.js', 'report.js'], user: ADMIN, data: {} });
  const w = h.w;
  const data = w.reportMinusMultiGroup(JSON.parse(JSON.stringify(ROWS)), MINUS, 3, 30, '2026-10-25');
  const plan = w.reportMinusMultiPlan(RC, data.allStores);
  const by = e => plan.filter(p => p.email === e)[0];
  const job = e => { const p = by(e); const sub = p ? w.reportMinusMultiForStores(data, p.stores) : null; return { p, sub, send: p ? w.reportMinusMultiShouldSend(p, sub) : false }; };
  const sendList = plan.filter(p => w.reportMinusMultiShouldSend(p, w.reportMinusMultiForStores(data, p.stores))).map(p => p.email);

  section('1. Данните и разпределението');
  ok('allStores = minus_stores (Гоце Делчев, Монтана)', JSON.stringify(data.allStores) === JSON.stringify(MINUS), JSON.stringify(data.allStores));
  ok('общо 2 артикула (по един във всеки обект)', data.total === 2, data.total);

  section('2. Получател → обекти');
  const t = job('t.tenev@temax.bg');
  ok('Теодор (NULL) → и двата обекта, 2 артикула, получава', t.p && t.p.scoped === false && t.p.stores.join(',') === GD + ',' + MO && t.sub.total === 2 && t.send, JSON.stringify(t.p));
  const m = job('m.pavlova@temax.bg');
  ok('Миглена (без колона scope_stores = NULL) → и двата обекта, получава', m.p && m.p.stores.length === 2 && m.send);
  const k = job('n.koleva@temax.bg');
  ok('Колева [Гоце Делчев, Дупница, Петрич] → само Гоце Делчев', k.p && k.p.scoped && k.p.stores.join(',') === GD && k.sub.stores.map(s => s.store).join(',') === GD && k.sub.total === 1 && k.send, JSON.stringify(k.p));
  ok('… без становище 1 (52215)', k.sub.noStatement === 1);
  const s = job('s.stefanova@temax.bg');
  ok('Стефанова [Враца, Козлодуй, Монтана, Троян] → само Монтана', s.p && s.p.stores.join(',') === MO && s.sub.stores.map(x => x.store).join(',') === MO && s.sub.total === 1 && s.send, JSON.stringify(s.p));
  ok('… със становище (0 без)', s.sub.noStatement === 0);
  const x = job('x.shumen@temax.bg');
  ok('обхват без пресичане [Шумен] → без обекти, НЯМА писмо', x.p && x.p.stores.length === 0 && x.send === false);
  const e = job('empty@temax.bg');
  ok('празен масив {} → без обекти, НЯМА писмо (не е NULL)', e.p && e.p.scoped === true && e.p.stores.length === 0 && e.send === false, JSON.stringify(e.p));
  ok('неактивен → няма го в плана', !by('off@temax.bg'));
  ok('minus_multi=false → няма го в плана', !by('noflag@temax.bg'));
  ok('дедупликация по имейл — първият ред (Теодор с NULL), дубликатът с [Шумен] не влиза', plan.filter(p => String(p.email).trim().toLowerCase() === 't.tenev@temax.bg').length === 1 && t.p.scoped === false);
  ok('писма — точно 4: Теодор, Миглена, Колева, Стефанова', sendList.join(',') === 't.tenev@temax.bg,m.pavlova@temax.bg,n.koleva@temax.bg,s.stefanova@temax.bg', sendList.join(','));

  section('3. Без артикули в обекта на получателя');
  const onlyGd = w.reportMinusMultiGroup(JSON.parse(JSON.stringify(ROWS.filter(r => r.store_name === GD))), MINUS, 3, 30, '2026-10-25');
  const pS = w.reportMinusMultiPlan(RC, onlyGd.allStores).filter(p => p.email === 's.stefanova@temax.bg')[0];
  const subS = w.reportMinusMultiForStores(onlyGd, pS.stores);
  ok('Стефанова (Монтана), а в Монтана 0 артикула → НЯМА писмо', pS.stores.join(',') === MO && subS.total === 0 && w.reportMinusMultiShouldSend(pS, subS) === false);
  const none = w.reportMinusMultiGroup([], MINUS, 3, 30, '2026-10-25');
  const pT = w.reportMinusMultiPlan(RC, none.allStores).filter(p => p.email === 't.tenev@temax.bg')[0];
  const subT = w.reportMinusMultiForStores(none, pT.stores);
  ok('без обхват и 0 артикула → писмото пак тръгва (както в v61)', w.reportMinusMultiShouldSend(pT, subT) === true);
  ok('… с реда „Няма артикул с 3+ минуса за 30 дни"', w.reportMinusMultiHtml(subT).indexOf('Няма артикул с 3+ минуса за 30 дни') >= 0);

  section('4. Писмото на получателя — само неговите обекти');
  const hk = w.reportMinusMultiHtml(k.sub), hs = w.reportMinusMultiHtml(s.sub), ht = w.reportMinusMultiHtml(t.sub);
  ok('на Колева — 52215 (Гоце Делчев), без 66741 (Монтана)', hk.indexOf('52215') >= 0 && hk.indexOf('66741') < 0 && hk.indexOf('>' + MO + ' (') < 0);
  ok('на Стефанова — 66741 (Монтана), без 52215', hs.indexOf('66741') >= 0 && hs.indexOf('52215') < 0);
  ok('на Теодор — и двата', ht.indexOf('52215') >= 0 && ht.indexOf('66741') >= 0);
  ok('обобщението е по неговите обекти: Колева — 1 артикул, без становище 1', /за 30 дни: <b>1<\/b> · без становище: <b[^>]*>1</.test(hk));
  ok('общите данни не са пипнати от срязването', data.total === 2 && data.stores.length === 2);
  h.close();
})();

section('5. Едж функцията (send-scheduled-report)');
{
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
  const m = src.match(/if \(type === 'minus_multi'\) \{[\s\S]*?\n    \}\n/);
  const br = m ? m[0] : '';
  ok('клонът minus_multi е намерен', !!br);
  ok('заявката към report_recipients иска и scope_stores', /sbGet\('report_recipients', 'active=eq\.true&minus_multi=eq\.true&select=[^']*scope_stores/.test(br));
  ok('план по получател: reportMinusMultiPlan(…, mmData.allStores …)', /reportMinusMultiPlan\(mmRecRes, mmData\.allStores/.test(br));
  ok('писмото е до ЕДИН адрес: to: [j.plan.email]', /to: \[j\.plan\.email\]/.test(br) && !/to: mmTo/.test(br));
  ok('с данните на получателя: reportMinusMultiHtml(j.sub)', /reportMinusMultiHtml\(j\.sub\)/.test(br));
  ok('пропуска send=false: mmJobs.filter(…j.send…)', /mmJobs\.filter\(function\(j: any\)\{ return j\.send; \}\)/.test(br));
  ok('dry_run: получател → обекти → брой → send', /recipients: mmJobs\.map/.test(br) && /stores:j\.plan\.stores/.test(br) && /send:j\.send/.test(br));
}

report();
