/* Трансфери — „Избери всички свободни" / „Махни избора" в прозорчето
   „Получен" / „Разтоварен" (19.10.2026). При 90 бройки 87 клика стават един.

   Какво заковава файлът:
   1. qty 90, 3 вече приети → бутонът избира 87; „Запиши" → ЕДИН POST с 87
      реда, unit 4..90; заключените 1..3 не са в него.
   2. Двойно натискане не дублира (пак 87, без повтори).
   3. „Махни избора" (qty ≥ 10) → 0 избрани; „Запиши" → съобщение, 0 POST.
   4. qty 3 → „Избери всички свободни" има и работи; „Махни избора" — няма.
   5. qty 1 → няма бутон (няма и квадратчета).
   6. „Проблем" → няма бутон (там е „целият товар").

   Мутационна проверка (19.10.2026, всяка поотделно върху transfers.js):
     1. бутонът включва и заключените (1..qty вместо left) → пада 1
     2. бутонът не обновява tfEvForm.units                 → пада 1, 4
     3. бутонът се показва и при „Проблем"                 → пада 6
   И трите събарят теста.

   Пускане:  node tests/transfers-select-all.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const STORES = ['Козлодуй', 'Раднево', 'Централен офис'];
const RAD = { id: 'u-r', email: 'r@temax.bg', display_name: 'Управител Раднево', role: 'manager', store_name: 'Раднево' };
const T = { id: 't1', transfer_num: 'Козлодуй-0009', from_store: 'Козлодуй', mode: 'bus', depart_date: '2026-10-18', depart_time: '08:00',
            stops: [], end_store: 'Раднево', status: 'partial', created_at: '2026-10-17T08:00:00Z', departed_at: null };
const BIG = { id: 'big', transfer_id: 't1', position: 1, kind: 'carton', qty: 90, recipient_store: 'Раднево', transfer_points: [] };
const SMALL = { id: 'sm', transfer_id: 't1', position: 2, kind: 'roll', qty: 3, recipient_store: 'Раднево', transfer_points: [] };
const ONE = { id: 'one', transfer_id: 't1', position: 3, kind: 'pallet', qty: 1, recipient_store: 'Раднево', transfer_points: [] };
const EVS = [1, 2, 3].map(function (u) {
  return { id: 'e' + u, cargo_id: 'big', transfer_id: 't1', event: 'received', store_name: 'Раднево', unit: u, created_at: '2026-10-18T10:0' + u + ':00Z' };
});

function env() {
  return boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: RAD,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: [T], transfer_cargo: [BIG, SMALL, ONE], transfer_cargo_events: EVS,
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: [], app_settings: []
    }
  });
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
const posts = function (h) { return h.calls.post.filter(function (p) { return p.table === 'transfer_cargo_events'; }); };
async function openAct(h, cid, kind) {
  h.w.showModule('transfers'); await ticks(); await ticks();
  h.w.openTransferCard('t1'); await ticks();
  realClick(h.w, $(h, '.trf-card-cargo[data-c="' + cid + '"] .trf-act-' + kind)); await ticks();
}
const checked = function (h) { return $$(h, '#tfe-units input[type=checkbox]').filter(function (i) { return i.checked && !i.disabled; }).map(function (i) { return Number(i.id.replace('tfe-u-', '')); }); };

(async function () {

  section('1–3. qty 90, 3 вече приети');
  {
    const h = env();
    await openAct(h, 'big', 'received');
    const all = $(h, '#tfe-all');
    ok('бутонът „Избери всички свободни (87)"', !!all && all.textContent === 'Избери всички свободни (87)', all && all.textContent);
    ok('„Махни избора" има (qty ≥ 10)', !!$(h, '#tfe-none'));
    ok('бутоните са НАД квадратчетата', !!(all.compareDocumentPosition($(h, '#tfe-units')) & 4));
    realClick(h.w, all); await ticks();
    const sel = checked(h);
    ok('избрани 87: 4..90', sel.length === 87 && sel[0] === 4 && sel[86] === 90, sel.length + ' ' + sel[0] + '..' + sel[sel.length - 1]);
    ok('tfEvForm.units = 4..90', h.w.tfEvForm.units.length === 87 && h.w.tfEvForm.units[0] === 4 && h.w.tfEvForm.units[86] === 90);
    ok('заключените 1..3 остават заключени и отметнати', [1, 2, 3].every(function (u) { const i = $(h, '#tfe-u-' + u); return i.disabled && i.checked; }));
    realClick(h.w, $(h, '#tfe-all')); await ticks();
    ok('второ натискане — пак 87, без повтори', h.w.tfEvForm.units.length === 87 && new Set(h.w.tfEvForm.units).size === 87);
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    const p = posts(h);
    ok('ЕДИН POST', p.length === 1, String(p.length));
    const rows = (p[0] || {}).body || [];
    ok('87 реда', Array.isArray(rows) && rows.length === 87, String(rows.length));
    ok('unit 4..90, received, Раднево', rows.map(function (r) { return r.unit; }).join(',') === Array.from({ length: 87 }, function (_, i) { return i + 4; }).join(',') &&
       rows.every(function (r) { return r.event === 'received' && r.store_name === 'Раднево' && r.cargo_id === 'big'; }));
    h.close();

    const h2 = env();
    await openAct(h2, 'big', 'received');
    realClick(h2.w, $(h2, '#tfe-all')); await ticks();
    realClick(h2.w, $(h2, '#tfe-none')); await ticks();
    ok('„Махни избора" → 0 избрани', checked(h2).length === 0 && h2.w.tfEvForm.units.length === 0, String(checked(h2).length));
    realClick(h2.w, $(h2, '#tfe-save')); await ticks();
    ok('„Запиши" → „Избери поне една единица.", 0 POST', posts(h2).length === 0 && (($(h2, '#tfe-error') || {}).textContent || '') === 'Избери поне една единица.', ($(h2, '#tfe-error') || {}).textContent);
    h2.close();
  }

  section('4. qty 3');
  {
    const h = env();
    await openAct(h, 'sm', 'received');
    ok('бутон „Избери всички свободни (3)"', (($(h, '#tfe-all') || {}).textContent || '') === 'Избери всички свободни (3)');
    ok('„Махни избора" — няма (qty < 10)', !$(h, '#tfe-none'));
    realClick(h.w, $(h, '#tfe-all')); await ticks();
    ok('избрани 1, 2, 3', checked(h).join(',') === '1,2,3' && h.w.tfEvForm.units.join(',') === '1,2,3');
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    ok('POST с 3 реда', ((posts(h)[0] || {}).body || []).length === 3);
    h.close();
  }

  section('5–6. qty 1 и „Проблем"');
  {
    const h = env();
    await openAct(h, 'one', 'received');
    ok('qty 1 — без бутон и без квадратчета', !!$(h, '#tfe-ov') && !$(h, '#tfe-all') && !$(h, '#tfe-units'));
    h.close();
    const h2 = env();
    await openAct(h2, 'big', 'problem');
    ok('„Проблем" — без бутон', !!$(h2, '#tfe-whole') && !$(h2, '#tfe-all') && !$(h2, '#tfe-none'));
    h2.w.tfEvSelectAll(true); await ticks();
    ok('и функцията не пипа избора при „Проблем"', h2.w.tfEvForm.units.length === 0 && h2.w.tfEvForm.whole === true);
    h2.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
