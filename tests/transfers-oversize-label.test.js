/* Трансфери — видът на ред от товарен лист в списъка „Ред от товарен лист"
   (19.11.2026, сесия transfers-oversize).

   Списъкът се пълни само когато изпращачът е логистичен склад
   (tfLoadLinkOptions → tfLlOpts). Видовете там са тези на loading.js
   (pallet / oversize / roll / bulk); TF_KINDS (видовете товар в трансфер)
   няма oversize и tfKindLabel връщаше суровия ключ → „… · oversize 1/2 · …".
   Сега етикетът минава през tfLlKindLabel: думата от LL_KIND_WORD, с главна
   буква, като „Палет 1/3".

   Какво заковава файлът (loading.js + transfers.js заредени заедно, в реда
   от index.html):
   a) склад изпращач, товарен лист с палет, руло, насип и извънгабаритен
      (с и без номер) → точно четирите/петте етикета в списъка; в текста на
      списъка няма „oversize".
   b) избор на извънгабаритния ред с истински change върху <select> →
      loading_item_id е id-то; след прерисуване избраната опция носи същия
      етикет. (Във формата за този ред НЯМА чипче — показва се избраната
      опция на <select>.)
   c) обект изпращач → списъкът го няма (заявка към loading_lists не тръгва).
   d) TF_KINDS е с четирите си вида — pallet, roll, bulk, carton, без oversize;
      падащото меню „Вид" във формата е същото.
   e) резервът без loading.js: tfLlKindLabel('oversize') → „Извънгабаритен".

   Мутационна проверка (19.11.2026, всяка поотделно върху transfers.js):
     1. в tfLoadLinkOptions върнат tfKindLabel(it.kind)          → пада a), b)
     2. ['oversize','Извънгабаритен'] добавен в TF_KINDS         → пада d)
     3. махнат резервът (|| (k === 'oversize' ? …))              → пада e)
     4. махната главната буква (return w без toUpperCase)        → пада a), b), e)
   Оцелял мутант: няма.

   Пускане:  node tests/transfers-oversize-label.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, fire } = H;

const WH = 'Логистичен склад Търговище';
const STORES = ['Козлодуй', 'Кърджали', 'Сливен', WH, 'Централен офис'];
const LOG2 = { id: 'log2', email: 'logistichen2@temax.bg', display_name: 'Логистика 2', role: 'logistics', store_name: WH };
const KOZ = { id: 'u-koz', email: 'koz@temax.bg', display_name: 'Управител Козлодуй', role: 'manager', store_name: 'Козлодуй' };

const LISTS = [{ id: 'll-1', list_date: '2026-11-18', warehouse: WH }];
const ITEMS = [
  { id: 'it-p', list_id: 'll-1', store_name: 'Козлодуй', kind: 'pallet',   pallet_no: 1, pallet_total: 3, purchase_doc: '4500001' },
  { id: 'it-r', list_id: 'll-1', store_name: 'Козлодуй', kind: 'roll',     pallet_no: 2, pallet_total: 6, purchase_doc: null },
  { id: 'it-b', list_id: 'll-1', store_name: 'Сливен',   kind: 'bulk',     pallet_no: null, pallet_total: null, purchase_doc: null },
  { id: 'it-o', list_id: 'll-1', store_name: 'Сливен',   kind: 'oversize', pallet_no: 1, pallet_total: 2, purchase_doc: '4500002' },
  { id: 'it-on', list_id: 'll-1', store_name: 'Кърджали', kind: 'oversize', pallet_no: null, pallet_total: null, purchase_doc: null }
];

function env(user, modules) {
  const h = boot({
    modules: modules || ['loading.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: [], transfer_cargo: [], transfer_cargo_events: [],
      client_orders: [], transport_orders: [], app_settings: [],
      loading_lists: LISTS, loading_list_items: ITEMS,
      loading_list_products: [], loading_list_photos: []
    }
  });
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
async function settle() { for (let i = 0; i < 6; i++) await ticks(); }
async function openForm(h, from_) {
  h.w.showModule('transfers'); await settle();
  const btn = $(h, '#trf-new');
  if (btn) H.realClick(h.w, btn);
  await settle();
  /* Логистиката създава от няколко обекта — изпращачът се избира. */
  const from = $(h, '#trf-from');
  if (from && from_ && from.value !== from_) { from.value = from_; fire(h.w, from, 'change'); await settle(); }
}
const optTexts = function (h) { return $$(h, 'select.trf-ll option').map(function (o) { return o.textContent; }); };
const DATE = '18.11.2026';

(async function () {

  section('a) Склад изпращач: четирите вида в списъка');
  {
    const h = env(LOG2);
    await openForm(h, h.w.currentUser.store_name);
    ok('формата е отворена от склада', h.w.tfForm && h.w.tfForm.from_store === WH, h.w.tfForm && h.w.tfForm.from_store);
    const sel = $(h, 'select.trf-ll');
    ok('списъкът „Ред от товарен лист" го има', !!sel);
    const t = optTexts(h);
    ok('палет → „Палет 1/3"', t.indexOf(DATE + ' · Козлодуй · Палет 1/3 · 4500001') >= 0, JSON.stringify(t));
    ok('руло → „Руло 2/6"', t.indexOf(DATE + ' · Козлодуй · Руло 2/6') >= 0, JSON.stringify(t));
    ok('насип → „Насип"', t.indexOf(DATE + ' · Сливен · Насип') >= 0, JSON.stringify(t));
    ok('извънгабаритен с номер → „Извънгабаритен 1/2"', t.indexOf(DATE + ' · Сливен · Извънгабаритен 1/2 · 4500002') >= 0, JSON.stringify(t));
    ok('извънгабаритен без номер → „Извънгабаритен"', t.indexOf(DATE + ' · Кърджали · Извънгабаритен') >= 0, JSON.stringify(t));
    ok('5 реда + „—"', t.length === 6, t.length);
    ok('в текста на списъка няма „oversize"', sel && sel.textContent.indexOf('oversize') < 0, sel && sel.textContent);
    ok('в tfLlOpts няма „oversize"', !h.w.tfLlOpts.some(function (o) { return /oversize/.test(o.label); }), JSON.stringify(h.w.tfLlOpts));
    h.close();
  }

  section('b) Избор на извънгабаритния ред');
  {
    const h = env(LOG2);
    await openForm(h, h.w.currentUser.store_name);
    const sel = $(h, 'select.trf-ll');
    sel.value = 'it-o'; fire(h.w, sel, 'change'); await settle();
    ok('loading_item_id е id-то на реда', h.w.tfForm.cargo[0].loading_item_id === 'it-o', h.w.tfForm.cargo[0].loading_item_id);
    h.w.renderTransferForm(); await settle();
    const sel2 = $(h, 'select.trf-ll');
    const picked = sel2 && sel2.options[sel2.selectedIndex];
    ok('след прерисуване избраната опция е редът', picked && picked.value === 'it-o', picked && picked.value);
    ok('и носи етикета „Извънгабаритен 1/2"', picked && picked.textContent === DATE + ' · Сливен · Извънгабаритен 1/2 · 4500002', picked && picked.textContent);
    h.close();
  }

  section('c) Обект изпращач: списъкът го няма');
  {
    const h = env(KOZ);
    await openForm(h, h.w.currentUser.store_name);
    ok('формата е от обекта', h.w.tfForm && h.w.tfForm.from_store === 'Козлодуй', h.w.tfForm && h.w.tfForm.from_store);
    ok('няма select.trf-ll', !$(h, 'select.trf-ll'));
    ok('tfLlOpts е празен', Array.isArray(h.w.tfLlOpts) && h.w.tfLlOpts.length === 0);
    ok('заявка към loading_lists не тръгва', !h.calls.get.some(function (u) { return /\/loading_lists\?/.test(u); }));
    h.close();
  }

  section('d) TF_KINDS е непроменен');
  {
    const h = env(LOG2);
    ok('TF_KINDS = pallet, roll, bulk, carton', h.w.TF_KINDS.map(function (k) { return k[0]; }).join(',') === 'pallet,roll,bulk,carton', JSON.stringify(h.w.TF_KINDS));
    ok('tfKindLabel(oversize) не е вид на трансфер (връща ключа)', h.w.tfKindLabel('oversize') === 'oversize');
    await openForm(h, h.w.currentUser.store_name);
    const kinds = $$(h, 'select.trf-kind option').map(function (o) { return o.value; });
    ok('менюто „Вид" е с четирите вида', kinds.join(',') === 'pallet,roll,bulk,carton', JSON.stringify(kinds));
    ok('валидацията не приема oversize като вид', (function () {
      const f = h.w.tfForm;
      f.mode = 'bus'; f.end_store = 'Козлодуй'; f.depart_date = '2026-11-20'; f.depart_time = '08:00'; f.stops = [];
      Object.assign(f.cargo[0], { kind: 'pallet', qty: 1, recipient_store: 'Козлодуй' });
      const okPallet = h.w.tfValidate(f);
      f.cargo[0].kind = 'oversize';
      const e = h.w.tfValidate(f);
      return okPallet === null && e === 'Товар #1: избери вид.';
    })());
    h.close();
  }

  section('e) Резерв без loading.js');
  {
    const h = env(LOG2, ['transfers.js']);
    ok('LL_KIND_WORD го няма', typeof h.w.LL_KIND_WORD === 'undefined');
    ok('tfLlKindLabel(oversize) → „Извънгабаритен"', h.w.tfLlKindLabel('oversize') === 'Извънгабаритен', h.w.tfLlKindLabel('oversize'));
    ok('tfLlKindLabel(pallet) → „Палет"', h.w.tfLlKindLabel('pallet') === 'Палет');
    ok('tfLlKindLabel(bulk) → „Насип"', h.w.tfLlKindLabel('bulk') === 'Насип');
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
