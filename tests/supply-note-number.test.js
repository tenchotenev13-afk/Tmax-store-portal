/* Зареждане — предпазител „число в коментара при празно количество"
   (submitSupplyForm, 14.10.2026). Повод: Севлиево, 12.10.2026 — 25 реда
   „Кабели на макара" с броя макари в „Коментар" и празно qty1; базата брои
   само qty1/qty2, тоест бланката излезе непопълнена в ЦО и в писмото.

   Какво се заковава (РЕАЛЕН клик по „Запази"):
   - празно количество + коментар „3" -> червен toast с името/кода на реда,
     нито един POST/PATCH към supply_entries (и валидният ред не се записва),
     фокус върху полето за количество на първия такъв ред;
   - количество „3" + коментар „3" -> записва се нормално;
   - празно количество + „3 макари" -> записва се (текст, не число);
   - празно количество + „ 2,5 " -> спира (десетична запетая с интервали);
   - едноколонна бланка (qty2 винаги null) — същото правило по qty1.

   Мутационна проверка (14.10.2026, ръчно върху supply.js) — събориха теста:
   M1 регексът без [.,]\d+ (пропуска „2,5"); M2 проверката преместена след
   reqs.push (записът тръгва); M3 toast без кода/името на реда; M4 без
   проверката изобщо. Оцелели мутанти: няма.

   Пускане: node tests/supply-note-number.test.js . */
'use strict';
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, btn } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
void ROOT;

const STORE = { email: 'sv@temax.bg', display_name: 'Обект Севлиево', role: 'store', store_name: 'Севлиево' };

const TPL2 = { id: 'tpl-2', name: 'Подови настилки', slug: 'floor', col1_label: 'Места в зала',
  col2_label: 'Брой за поръчка', target_stores: ['Севлиево'], active: true, sort_order: 0 };
const TPL1 = { id: 'tpl-1', name: 'Кабели на макара', slug: 'cable', col1_label: 'Брой макари',
  col2_label: null, target_stores: ['Севлиево'], active: true, sort_order: 1 };
const ITEMS = [
  { id: 'it-a', template_id: 'tpl-2', sap_code: '100200', name: 'Балатум 4м.', supplier: 'X', active: true, sort_order: 1 },
  { id: 'it-b', template_id: 'tpl-2', sap_code: null, name: 'Балатум 3м.', supplier: 'X', active: true, sort_order: 2 },
  { id: 'it-c', template_id: 'tpl-1', sap_code: '555001', name: 'Кабел ПВ-А1 1.5', supplier: 'Y', active: true, sort_order: 1 }
];

function env() {
  const h = boot({
    modules: ['pallets.js', 'supply.js'],
    user: STORE,
    data: {
      supply_templates: [TPL2, TPL1],
      supply_template_items: ITEMS,
      supply_entries: () => [],
      users: [{ store_name: 'Севлиево' }]
    }
  });
  /* цветът на toast-а — harness-ът пази само текста */
  h.toastColor = [];
  const t = h.w.toast;
  h.w.toast = (m, c) => { h.toastColor.push(c); return t(m, c); };
  return h;
}
const anyWrites = h => h.calls.post.length + h.calls.patch.length;
function saveBtn(h, tplId) {
  const all = Array.from(h.doc.querySelectorAll('#mod-supply button'))
    .filter(b => (b.getAttribute('onclick') || '').indexOf("submitSupplyForm('" + tplId + "')") >= 0);
  return all[0] || btn(h.doc.getElementById('mod-supply'), 'Запази');
}
const v = (h, id, val) => { h.doc.getElementById(id).value = val; };
const lastToast = h => h.calls.toast[h.calls.toast.length - 1] || '';
const lastColor = h => h.toastColor[h.toastColor.length - 1];

(async function () {
  section('1. Празно количество + коментар „3" -> спира');
  {
    const h = env();
    h.w.loadSupply(); await ticks(6);
    v(h, 'sup-q1-it-a', '5');            /* валиден ред — и той не бива да се запише */
    v(h, 'sup-note-it-b', '3');
    const g0 = h.calls.get.length;
    realClick(h.w, saveBtn(h, 'tpl-2'));
    await ticks(8);
    ok('нито един POST/PATCH', anyWrites(h) === 0, 'post=' + h.calls.post.length + ' patch=' + h.calls.patch.length);
    ok('няма и GET към supply_entries след клика (спира преди заявката)',
      !h.calls.get.slice(g0).some(u => /supply_entries/.test(u)), h.calls.get.slice(g0).join(' | '));
    ok('текстът на toast-а', lastToast(h).indexOf('Коментарът е число, а количеството е празно') === 0, lastToast(h));
    ok('името на реда (без САП) е в toast-а', lastToast(h).indexOf('Балатум 3м.') >= 0, lastToast(h));
    ok('валидният ред НЕ е посочен', lastToast(h).indexOf('100200') < 0 && lastToast(h).indexOf('Балатум 4м.') < 0, lastToast(h));
    ok('подсказката е в toast-а', lastToast(h).indexOf('Напишете числото в количеството или го обяснете с думи.') >= 0);
    ok('червен toast', lastColor(h) === '#dc2626', String(lastColor(h)));
    ok('фокус върху количеството на реда', h.doc.activeElement && h.doc.activeElement.id === 'sup-q1-it-b',
      h.doc.activeElement && h.doc.activeElement.id);
    ok('„Запази" не е заключен (supplySaving)', !h.w.supplySaving['tpl-2']);
  }

  section('2. Количество „3" + коментар „3" -> записва се');
  {
    const h = env();
    h.w.loadSupply(); await ticks(6);
    v(h, 'sup-q1-it-b', '3');
    v(h, 'sup-note-it-b', '3');
    realClick(h.w, saveBtn(h, 'tpl-2'));
    await ticks(8);
    ok('един POST', h.calls.post.length === 1, String(h.calls.post.length));
    const p = (h.calls.post[0] || {}).body || {};
    ok('qty1=3, note="3"', p.qty1 === 3 && p.note === '3', JSON.stringify(p));
    ok('без червения toast', !h.calls.toast.some(t => t.indexOf('Коментарът е число') >= 0), h.calls.toast.join(' | '));
  }

  section('3. Празно количество + „3 макари" -> записва се');
  {
    const h = env();
    h.w.loadSupply(); await ticks(6);
    v(h, 'sup-note-it-b', '3 макари');
    realClick(h.w, saveBtn(h, 'tpl-2'));
    await ticks(8);
    ok('един POST', h.calls.post.length === 1, String(h.calls.post.length));
    const p = (h.calls.post[0] || {}).body || {};
    ok('qty1 null, note „3 макари"', p.qty1 === null && p.qty2 === null && p.note === '3 макари', JSON.stringify(p));
    ok('без червения toast', !h.calls.toast.some(t => t.indexOf('Коментарът е число') >= 0));
  }

  section('4. Празно количество + „ 2,5 " -> спира; „2.5" също');
  for (const note of [' 2,5 ', '2.5', '0']) {
    const h = env();
    h.w.loadSupply(); await ticks(6);
    v(h, 'sup-note-it-a', note);
    realClick(h.w, saveBtn(h, 'tpl-2'));
    await ticks(8);
    ok('„' + note + '": нито един запис', anyWrites(h) === 0, 'post=' + h.calls.post.length);
    ok('„' + note + '": toast с САП кода на реда', lastToast(h).indexOf('Коментарът е число') === 0 && lastToast(h).indexOf('100200') >= 0, lastToast(h));
  }

  section('5. Двуколонна: попълнено само qty2 + коментар „2" -> записва се');
  {
    const h = env();
    h.w.loadSupply(); await ticks(6);
    v(h, 'sup-q2-it-a', '4');
    v(h, 'sup-note-it-a', '2');
    realClick(h.w, saveBtn(h, 'tpl-2'));
    await ticks(8);
    ok('един POST, qty2=4', h.calls.post.length === 1 && (h.calls.post[0].body || {}).qty2 === 4, String(h.calls.post.length));
  }

  section('6. Едноколонна бланка (Кабели на макара) — същото правило');
  {
    const h = env();
    h.w.loadSupply(); await ticks(6);
    ok('едноколонната няма sup-q2', !h.doc.getElementById('sup-q2-it-c'));
    v(h, 'sup-note-it-c', '1');
    realClick(h.w, saveBtn(h, 'tpl-1'));
    await ticks(8);
    ok('нито един запис', anyWrites(h) === 0, 'post=' + h.calls.post.length);
    ok('toast с кода 555001', lastToast(h).indexOf('555001') >= 0, lastToast(h));
    ok('фокус върху sup-q1-it-c', h.doc.activeElement && h.doc.activeElement.id === 'sup-q1-it-c');
  }
  report();
})();
