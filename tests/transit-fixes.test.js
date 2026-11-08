/* „Стока на път" — поправките при инструкцията за магазини и склад
   (05.11.2026, сесия transit-fixes). Реалният ред от index.html (harness),
   реални кликове.

   Проверки:
     а) склад (logistics): няма <button> „📥 Импорт Excel", „+ Добави ред", „✕"
        (изтриване); има „📊 Експорт Excel"; прякото извикване на
        openTransitImportModal / openTransitAdd / tDelete / confirmTransitImport
        не пише и не отваря нищо; офисът (admin, accounting) — има всичко,
        изтриването минава;
     б) обект: „✏️ Редакция" отваря форма, в която може само коментар (другите
        полета disabled, бележката видима); „💾 Запази" (реален клик) → PATCH
        САМО с comment + updated_by + updated_at (кой и кога); нов ред (submitTransit без editId) — отказ; офис —
        пълна форма, PATCH с всички полета;
     в) формата: „🏭 От склад" / „🏬 От магазин" / „Друго (outgoing)",
        стойностите incoming / transfer / outgoing; няма „Получавам
        (incoming)" / „Трансфер между магазини" / „Прието"; подсказката на
        коментара е новата;
     г) значките на получателя, изпращача и засечката не са nowrap — пренасят
        се (display:inline-block; max-width:100%; white-space:normal).
        Самото съответствие на 1280 px се гледа в браузъра — jsdom не смята лейаут.

   Мутанти (05.11.2026, всеки върху чист transit.js; чистият — exit 0). И
   шестте падат (exit 1):
     F1 складът пак има импорт (logistics в canAddTransit)        → ❌ а)
     F2 обектът праща всички полета (без клона „само коментар")    → ❌ б)
     F2б обектът праща само comment, без кой и кога                → ❌ б)
     F3 tDelete без проверка на ролята                             → ❌ а)
     F4 значката на получателя пак nowrap                          → ❌ г)
     F5 полетата на обекта не са disabled                          → ❌ б)

   Пускане:  node tests/transit-fixes.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';
const OFFICE = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис' };
const ACCOUNTING = { email: 'acc@temax.bg', display_name: 'Счетоводител', role: 'accounting', store_name: 'Централен офис' };
const STORE = { email: 'shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен' };
const WAREHOUSE = { email: 'sklad.t@temax.bg', display_name: 'Склад Т', role: 'logistics', store_name: WH };

const row = (id, o) => Object.assign({ id, store_name: 'Шумен', supplier: WH, direction: 'incoming', status: 'pending',
  purchase_doc: 'D-' + id, position: '10', doc_date: '2026-11-01', material_code: 'M-' + id, material_name: 'ART-' + id,
  unit: 'БР', ordered_qty: 3, remaining_qty: 3, sender_status: null, recon_at: null, reviewed_at: null, comment: '' }, o || {});
const DATA = [
  row('r1'),
  row('r2', { reviewed_at: '2026-11-04T10:00:00Z', reviewed_by: 'Управител Шумен',
              recon_at: '2026-11-05T09:00:00Z', recon_by: 'Управител Шумен', recon_side: 'receiver',
              sender_status: 'sent', sender_status_by: 'импорт' })
];

function env(user, opts) {
  opts = opts || {};
  const h = boot({ modules: ['transport.js', 'client-orders.js', 'transit.js'], user, confirm: true,
    data: { goods_transit: [], stores: [], users: [] }, fail: opts.fail });
  h.toasts = [];
  const t0 = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: String(m), c }); t0(m, c); };
  h.w.loadTransit = () => {};
  h.w.requestAnimationFrame = f => f();
  h.w.transitData = JSON.parse(JSON.stringify(DATA));
  h.w.transitArchive = [];
  h.w.transitDir = 'all'; h.w.transitFilter = 'all';
  h.w.transitStore = ''; h.w.transitMonthFilter = ''; h.w.transitSearch = '';
  guard('renderTransit()', () => h.w.renderTransit());
  return h;
}
const mod = h => h.doc.getElementById('mod-transit');
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const btnTxt = h => Array.from(mod(h).querySelectorAll('button')).map(b => txt(b));
const hasBtn = (h, t) => btnTxt(h).some(x => x.indexOf(t) >= 0);
const delBtns = h => Array.from(mod(h).querySelectorAll('button')).filter(b => /^tDelete\(/.test(b.getAttribute('onclick') || ''));
const rowBtn = (h, id, needle) => Array.from(h.doc.querySelectorAll('button[data-id="' + id + '"]')).find(b => (b.getAttribute('onclick') || '').indexOf(needle) >= 0) || null;
const writes = h => h.calls.patch.length + h.calls.post.length + h.calls.del.length;
async function settle() { for (let i = 0; i < 6; i++) await ticks(); }
const FIELDS = ['tr-direction', 'tr-store', 'tr-supplier', 'tr-purchase-doc', 'tr-position', 'tr-doc-date',
  'tr-material-code', 'tr-unit', 'tr-material-name', 'tr-qty', 'tr-remaining', 'tr-transfer-date', 'tr-status'];

(async function run() {

  section('а) Складът: без импорт, добавяне и изтриване; с експорт');
  {
    const h = env(WAREHOUSE);
    ok('няма „📥 Импорт Excel"', !hasBtn(h, 'Импорт Excel'), btnTxt(h).join(' | '));
    ok('няма „+ Добави ред"', !hasBtn(h, 'Добави ред'));
    ok('няма „✕" (изтриване) на нито един ред', delBtns(h).length === 0, delBtns(h).length);
    ok('има „📊 Експорт Excel"', hasBtn(h, 'Експорт Excel'));
    ok('canAddTransit() = false, canExportTransit() = true', h.w.canAddTransit() === false && h.w.canExportTransit() === true);
    /* Пряко извикване — защитата е във функциите, не само в бутоните. */
    h.w.openTransitImportModal(); await settle();
    ok('openTransitImportModal() отказва (без модал)', !h.doc.getElementById('transit-import-ov') && h.toasts.some(x => /Нямаш права за импорт/.test(x.m)), h.toasts.map(x => x.m).join(' | '));
    h.w.openTransitAdd();
    const m = h.doc.getElementById('transit-modal');
    ok('openTransitAdd() отказва (модалът не е отворен)', !!m && !m.classList.contains('open') && h.toasts.some(x => /само офисът/.test(x.m)));
    await h.w.tDelete('r1'); await settle();
    ok('tDelete() отказва — нито една заявка, редът е там', writes(h) === 0 && h.w.transitData.some(r => r.id === 'r1'), writes(h));
    h.w._transitImportPlan = { rows: [row('x')], newRows: [row('x')], updRows: [], archiveIds: [], skipped: [], only2: [] };
    await h.w.confirmTransitImport(); await settle();
    ok('confirmTransitImport() отказва — нищо не е записано', writes(h) === 0, writes(h));
  }
  for (const u of [OFFICE, ACCOUNTING]) {
    const h = env(u);
    ok(u.role + ': „📥 Импорт Excel", „+ Добави ред", „📊 Експорт Excel"', hasBtn(h, 'Импорт Excel') && hasBtn(h, 'Добави ред') && hasBtn(h, 'Експорт Excel'), btnTxt(h).join(' | '));
    ok(u.role + ': „✕" на двата реда', delBtns(h).length === 2, delBtns(h).length);
  }
  {
    const h = env(OFFICE);
    realClick(h.w, delBtns(h)[0], '✕'); await settle();
    const d = h.calls.del;
    ok('офис: реален клик „✕" → DELETE и редът изчезва', d.length === 1 && !h.w.transitData.some(r => r.id === 'r1'), d.length);
  }
  {
    const h = env(STORE);
    ok('обект: няма импорт / добавяне / изтриване / експорт', !hasBtn(h, 'Импорт Excel') && !hasBtn(h, 'Добави ред') && delBtns(h).length === 0 && !hasBtn(h, 'Експорт Excel'));
  }

  section('б) „✏️ Редакция": обект — само коментар; офис — пълна форма');
  {
    const h = env(STORE);
    const ed = rowBtn(h, 'r1', 'openTransitEdit');
    if (ok('обект: r1 има „✏️ Редакция"', !!ed)) {
      realClick(h.w, ed, 'Редакция');
      const m = h.doc.getElementById('transit-modal');
      ok('формата е отворена', !!m && m.classList.contains('open'));
      ok('заглавието „✏️ Коментар към реда"', txt(h.doc.getElementById('transit-modal-title')) === '✏️ Коментар към реда', txt(h.doc.getElementById('transit-modal-title')));
      const off = FIELDS.filter(f => !h.doc.getElementById(f).disabled);
      ok('всички полета без коментара са disabled', off.length === 0, off.join(','));
      ok('коментарът е разрешен', h.doc.getElementById('tr-comment').disabled === false);
      ok('бележката „Можете да промените само коментара…" се вижда', h.doc.getElementById('tr-comment-only-note').style.display === '', h.doc.getElementById('tr-comment-only-note').style.display);
      h.doc.getElementById('tr-comment').value = 'дойде непълно';
      /* Дори ако някой смени полето през конзолата — не се праща. */
      h.doc.getElementById('tr-material-name').value = 'ПОДМЕНЕНО';
      const save = Array.from(h.doc.querySelectorAll('#transit-modal button')).find(b => /submitTransit/.test(b.getAttribute('onclick') || ''));
      realClick(h.w, save, 'Запази'); await settle();
      const p = h.calls.patch.filter(x => x.table === 'goods_transit');
      ok('една заявка — PATCH към r1', p.length === 1 && /id=eq\.r1(&|$)/.test(p[0].url), p.map(x => x.url).join(' | '));
      const keys = p[0] ? Object.keys(p[0].body).sort() : [];
      ok('… тялото е САМО { comment, updated_by, updated_at }', JSON.stringify(keys) === '["comment","updated_at","updated_by"]' && p[0].body.comment === 'дойде непълно', p[0] && JSON.stringify(p[0].body));
      ok('… updated_by = името на обекта', p[0] && p[0].body.updated_by === 'Управител Шумен', p[0] && p[0].body.updated_by);
      const at = p[0] ? Date.parse(p[0].body.updated_at) : NaN;
      ok('… updated_at = сега (ISO, ±1 мин)', p[0] && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(p[0].body.updated_at) && Math.abs(at - Date.now()) < 60000, p[0] && p[0].body.updated_at);
      ok('локално: коментарът и „Обновен от" са на реда, описанието — не', h.w.transitData[0].comment === 'дойде непълно' && h.w.transitData[0].updated_by === 'Управител Шумен' && h.w.transitData[0].material_name === 'ART-r1');
      ok('нищо не е POST-нато', h.calls.post.length === 0);
    }
    /* submitTransit без editId (нов ред) от обекта — отказ. */
    h.w.transitEditId = null;
    const before = writes(h);
    h.w.submitTransit(); await settle();
    ok('обект: нов ред през submitTransit — отказ, без заявка', writes(h) === before && h.toasts.some(x => /Нов ред добавя само офисът/.test(x.m)));
  }
  {
    const h = env(WAREHOUSE);
    /* Складът е изпращач на r1 и отваря редакцията от реда. */
    const ed = rowBtn(h, 'r1', 'openTransitEdit');
    if (ok('склад: r1 има „✏️ Редакция"', !!ed)) {
      realClick(h.w, ed, 'Редакция');
      ok('склад: полетата са disabled', FIELDS.every(f => h.doc.getElementById(f).disabled));
    }
  }
  {
    const h = env(OFFICE);
    realClick(h.w, rowBtn(h, 'r1', 'openTransitEdit'), 'Редакция');
    ok('офис: заглавието „✏️ Редактирай ред"', txt(h.doc.getElementById('transit-modal-title')) === '✏️ Редактирай ред');
    ok('офис: нито едно поле не е disabled', FIELDS.every(f => !h.doc.getElementById(f).disabled));
    ok('офис: бележката е скрита', h.doc.getElementById('tr-comment-only-note').style.display === 'none');
    h.doc.getElementById('tr-comment').value = 'офис';
    const save = Array.from(h.doc.querySelectorAll('#transit-modal button')).find(b => /submitTransit/.test(b.getAttribute('onclick') || ''));
    realClick(h.w, save, 'Запази'); await settle();
    const p = h.calls.patch.filter(x => x.table === 'goods_transit')[0];
    ok('офис: PATCH с всички полета (direction, store_name, material_name, status, comment)',
      !!p && ['direction', 'store_name', 'material_name', 'status', 'comment', 'updated_by'].every(k => k in p.body), p && JSON.stringify(Object.keys(p.body)));
    /* След офиса формата пак се отваря „само коментар" за обекта — режимът не е залепнал. */
    h.w.openTransitAdd();
    ok('офис: „+ Добави ред" — полетата са разрешени', FIELDS.every(f => !h.doc.getElementById(f).disabled));
  }

  section('в) Формата — новите думи');
  {
    const h = env(OFFICE);
    const dir = h.doc.getElementById('tr-direction');
    const opts = Array.from(dir.options).map(o => o.value + '=' + txt(o));
    ok('Посока: incoming=🏭 От склад, transfer=🏬 От магазин, outgoing=Друго (outgoing)',
      opts.join('|') === 'incoming=🏭 От склад|transfer=🏬 От магазин|outgoing=Друго (outgoing)', opts.join('|'));
    const modal = txt(h.doc.getElementById('transit-modal'));
    ok('няма „Получавам (incoming)"', modal.indexOf('Получавам (incoming)') < 0);
    ok('няма „Трансфер между магазини"', modal.indexOf('Трансфер между магазини') < 0);
    ok('няма „Прието" / „Неприето" в опциите', !Array.from(h.doc.querySelectorAll('#transit-modal option')).some(o => /Прието|Неприето/.test(o.textContent)));
    ok('подсказката на коментара: „напр. дойде непълно, чакаме второ пале"', h.doc.getElementById('tr-comment').getAttribute('placeholder') === 'напр. дойде непълно, чакаме второ пале', h.doc.getElementById('tr-comment').getAttribute('placeholder'));
  }

  section('г) Значките в „Статус" се пренасят (не са nowrap)');
  {
    const h = env(STORE);
    const tr = rowBtn(h, 'r2', "'pending'").closest('tr');
    const recv = tr.querySelector('.t-recv'), recvSpan = recv.querySelector('span');
    const send = tr.querySelector('.t-send span'), recon = tr.querySelector('.t-recon');
    ok('значката е „✕ Недоставена · Управител Шумен · 04.11"', txt(recv) === '✕ Недоставена · Управител Шумен · 04.11', txt(recv));
    ok('засечката е „🔍 Чака засечка · Управител Шумен · 05.11 (получател)"', txt(recon) === '🔍 Чака засечка · Управител Шумен · 05.11 (получател)', txt(recon));
    const wraps = el => { const s = (el.getAttribute('style') || '').replace(/\s/g, ''); return !/white-space:nowrap/.test(s) && /white-space:normal/.test(s) && /max-width:100%/.test(s); };
    ok('получател: span без nowrap, white-space:normal, max-width:100%', wraps(recvSpan), recvSpan.getAttribute('style'));
    ok('получател: div без nowrap', !/nowrap/.test(recv.getAttribute('style') || ''), recv.getAttribute('style'));
    ok('изпращач („📤 Изпратена по SAP"): span се пренася', wraps(send), send.getAttribute('style'));
    ok('засечка: div се пренася', wraps(recon), recon.getAttribute('style'));
    ok('span е inline-block (рамката следва реда)', /display:inline-block/.test(recvSpan.getAttribute('style')));
  }

  report();
})();
