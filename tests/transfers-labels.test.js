/* Трансфери — етикети с QR по единица товар + deep link от QR-а до картата
   (15.10.2026). ИНТЕГРАЦИОНЕН: shared.js + loading.js + transfers.js в реда
   от index.html (CLAUDE.md т. 8) — transfers.js ползва готовите llLoadQrLib,
   llQrSvg, llLabelCss, llStoreColor, llFitPt, llClearUrlHash, LL_PORTAL_URL,
   а startApp() (shared.js) вика llDeepLinkBoot и САМО ако той не е поел
   хеша — tfDeepLinkBoot. Мрежа няма: window.qrcode е фалшив кодер.

   Какво заковава файлът:
   a) tfTagUrl / tfParseTag — кръг напред-назад; целият URL и само хешът;
      чужд текст → null; #tl=… (Товарни листи) → null.
   b) Товари qty 1, 3, 12 → 16 етикета в #mod-print, всеки с различен QR
      текст; „3/12" на третия етикет на последния товар; получател, „през …",
      „от …"; дотоварен товар → „от <спирката>"; ред по position.
   c) Реален клик „🏷 Етикети" → print изглед; провал на llLoadQrLib →
      червен toast, без print изглед.
   d) startApp() с #tf=… за обект по маршрута → модул transfers, картата
      отворена, редът на товара подчертан, хешът махнат, нищо не е
      отбелязано; за чужд обект → червен екран, картата НЕ се отваря; с
      #tl=… → tfDeepLinkBoot НЕ се вика; без хеш → нищо.
   e) Съществуващият ll deep link тест (loading-lists-labels.test.js) се
      пуска отделно от run-all и продължава да минава.

   Мутационна проверка (15.10.2026, всяка поотделно):
     1. shared.js: tfDeepLinkBoot преди llDeepLinkBoot (без проверката
        за dl)                                         → пада d) „#tl"
     2. махната проверката tfVisibleToStores в
        tfDeepLinkApply                                → пада d) чужд обект
     3. брой етикети = брой товари (без цикъла по qty)  → пада b)
   И трите събарят теста.

   Пускане:  node tests/transfers-labels.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const STORES = ['Кърджали', 'Пирдоп', 'Троян', 'Варна', 'Централен офис'];
const U = function (store) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: 'manager', store_name: store }; };
const PORTAL = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';

/* Бус Кърджали → Пирдоп → Троян: три товара с qty 1, 3, 12; вторият е
   дотоварен в Пирдоп, третият минава през Пирдоп към Варна. Подредени
   нарочно разбъркано — етикетите вървят по position. */
const BUS = { id: 'b1', transfer_num: 'Кърджали-0031', from_store: 'Кърджали', mode: 'bus', depart_date: '2026-10-16', depart_time: '07:30',
              driver: 'Иван', stops: ['Пирдоп'], end_store: 'Троян', status: 'planned', created_at: '2026-10-15T08:00:00Z' };
const CARGO = [
  { id: 'c3', transfer_id: 'b1', position: 3, kind: 'carton', qty: 12, recipient_store: 'Варна', transfer_points: ['Пирдоп', 'Троян'] },
  { id: 'c1', transfer_id: 'b1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Троян', transfer_points: [] },
  { id: 'c2', transfer_id: 'b1', position: 2, kind: 'roll', qty: 3, recipient_store: 'Троян', transfer_points: [], loaded_at_store: 'Пирдоп' }
];

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['stock-differences.js', 'loading.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: function (url) {
        const u = decodeURIComponent(url);
        const m = /id=eq\.([^&]+)/.exec(u);
        return m ? [BUS].filter(function (t) { return t.id === m[1]; }) : [BUS];
      },
      transfer_cargo: CARGO, transfer_cargo_events: [],
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: [],
      loading_list_products: [], loading_list_photos: [], app_settings: [], goods_transit: [],
      stores: [], contacts: [], stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.qrTexts = [];
  if (!opts.noQr) {
    h.w.qrcode = function () {
      let text = '';
      return {
        addData: function (t) { text = t; h.qrTexts.push(t); }, make: function () {},
        getModuleCount: function () { return 21; }, isDark: function (r, c) { return ((r * 7 + c * 3 + text.length) % 5) < 2; }
      };
    };
  }
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ m: m, red: c === '#dc2626' }); return orig(m, c); };
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
async function open(h) { h.w.showModule('transfers'); await ticks(); }
async function card(h, id) { realClick(h.w, H.btn($(h, '#trf-table tbody tr[data-id="' + id + '"]'), 'Отвори')); await ticks(); }
const visible = function (h, id) { const el = h.doc.getElementById(id); return !!el && el.style.display !== 'none'; };

(async function () {

  section('a) tfTagUrl / tfParseTag');
  {
    const h = env(U('Кърджали'));
    const url = h.w.tfTagUrl('b1', 'c3', 3);
    ok('URL-ът е към портала с #tf=…&c=…&u=…', url === PORTAL + '#tf=b1&c=c3&u=3', url);
    const p = h.w.tfParseTag(url);
    ok('кръг напред-назад', !!p && p.tid === 'b1' && p.cid === 'c3' && p.unit === 3, JSON.stringify(p));
    ok('само хешът също се чете', JSON.stringify(h.w.tfParseTag('#tf=b1&c=c1&u=1')) === '{"tid":"b1","cid":"c1","unit":1}');
    const odd = h.w.tfTagUrl('a b/ц', 'x&y', 2);
    const po = h.w.tfParseTag(odd);
    ok('id със специални знаци — кодират се и се връщат', !!po && po.tid === 'a b/ц' && po.cid === 'x&y' && po.unit === 2, odd);
    ok('qty 1 → u=1', /&u=1$/.test(h.w.tfTagUrl('b1', 'c1', 1)));
    ok('чужд текст → null', h.w.tfParseTag('3800001000011') === null && h.w.tfParseTag('https://x.bg/') === null && h.w.tfParseTag('') === null);
    ok('#tl=… (Товарни листи) → null', h.w.tfParseTag(PORTAL + '#tl=L1&p=' + encodeURIComponent('pallet|1|Петрич')) === null);
    ok('без c или с u=0 → null', h.w.tfParseTag('#tf=b1&u=1') === null && h.w.tfParseTag('#tf=b1&c=c1&u=0') === null);
    ok('и llParseTag НЕ чете #tf', h.w.llParseTag(url) === null);
    h.close();
  }

  section('b) 16 етикета: по единица, по position');
  {
    const h = env(U('Кърджали'));
    await open(h);
    const n = h.w.tfRenderLabelsPrint(BUS, CARGO);
    const labels = $$(h, '#mod-print [data-tf-label="1"]');
    ok('1 + 3 + 12 = 16 етикета', n === 16 && labels.length === 16, n + ' / ' + labels.length);
    const tags = labels.map(function (l) { return l.getAttribute('data-tf-tag'); });
    ok('всеки с различен QR текст', tags.filter(function (x, i) { return tags.indexOf(x) === i; }).length === 16);
    ok('QR кодерът е получил същите 16 URL-а', JSON.stringify(h.qrTexts) === JSON.stringify(tags));
    ok('ред: първо #1 (qty 1), после #2 1/3…3/3, после #3', /#1 Палет 1\/1/.test(labels[0].textContent) &&
      /#2 .* 1\/3/.test(labels[1].textContent) && /#2 .* 3\/3/.test(labels[3].textContent) && /#3 .* 1\/12/.test(labels[4].textContent),
      labels.slice(0, 5).map(function (l) { return l.querySelector('.lt-pal').textContent; }).join(' | '));
    const l3 = labels[4 + 2];
    ok('„3/12" на третия етикет на последния товар', /#3 .* 3\/12/.test(l3.querySelector('.lt-pal').textContent), l3.querySelector('.lt-pal').textContent);
    ok('и неговият QR е #tf=b1&c=c3&u=3', l3.getAttribute('data-tf-tag') === PORTAL + '#tf=b1&c=c3&u=3');
    ok('номерът на транспорта горе', /Кърджали-0031/.test(l3.querySelector('.lt-pal').textContent));
    ok('получателят най-едро (лентата)', l3.querySelector('.lt-band .lt-store').textContent === 'Варна');
    ok('„през Пирдоп → Троян"', ((l3.querySelector('.tf-lt-via') || {}).textContent || '') === 'през Пирдоп → Троян');
    ok('„от Кърджали" и датата на тръгване', /от Кърджали/.test(l3.textContent) && /16\.10/.test(l3.textContent), l3.querySelector('.lt-meta').textContent);
    ok('без точки на прехвърляне — без „през"', !labels[0].querySelector('.tf-lt-via'));
    ok('дотоварен товар → „от Пирдоп"', /от Пирдоп/.test(labels[1].querySelector('.lt-meta').textContent), labels[1].querySelector('.lt-meta').textContent);
    ok('QR-ът е SVG 60мм, в .lt-qr (като Товарни листи)', !!l3.querySelector('.lt-qr svg') && /width:60mm/.test(l3.querySelector('.lt-qr svg').getAttribute('style')));
    ok('стилът е llLabelCss (.lt-page)', /\.lt-page\{/.test(($(h, '#mod-print style') || {}).textContent || ''));
    const k = h.w.tfRenderLabelsPrint(Object.assign({}, BUS, { mode: 'courier', courier_company: 'Econt', stops: [] }), [CARGO[1]]);
    ok('куриер: фирмата вместо дата', k === 1 && /Куриер: Econt/.test($(h, '#mod-print [data-tf-label="1"]').textContent));
    h.close();
  }

  section('c) „🏷 Етикети" в картата');
  {
    const h = env(U('Пирдоп'));
    await open(h); await card(h, 'b1');
    const b = $(h, '#trf-labels');
    ok('бутонът е в картата и за спирката', !!b && b.tagName === 'BUTTON' && /Етикети/.test(b.textContent));
    realClick(h.w, b); await ticks();
    ok('print изгледът е показан', visible(h, 'mod-print') && !visible(h, 'mod-transfers'));
    ok('16 етикета', $$(h, '#mod-print [data-tf-label="1"]').length === 16);
    h.close();

    const h2 = env(U('Кърджали'), { noQr: true });
    await open(h2); await card(h2, 'b1');
    h2.w.llLoadQrLib = function () { return Promise.reject(new Error('QR библиотеката не се зареди')); };
    realClick(h2.w, $(h2, '#trf-labels')); await ticks();
    const last = h2.toasts[h2.toasts.length - 1] || {};
    ok('без QR библиотека → червен toast', last.red && /Етикетите не се получиха: QR библиотеката не се зареди/.test(last.m), JSON.stringify(last));
    ok('и print изгледът НЕ е показан', !visible(h2, 'mod-print') && $$(h2, '#mod-print [data-tf-label="1"]').length === 0);
    h2.close();
  }

  section('d) Deep link през startApp()');
  {
    /* Обект по маршрута (Пирдоп — спирка и дотоварил) */
    const h = env(U('Пирдоп'));
    h.w.history.replaceState(null, '', '/#tf=b1&c=c2&u=2');
    h.w.startApp(); await ticks(); await ticks(); await ticks();
    ok('модулът е transfers', visible(h, 'mod-transfers'));
    ok('картата на b1 е отворена', !!$(h, '#trf-card') && h.w.tfCardId === 'b1');
    const hl = $(h, '.trf-card-cargo[data-trf-hl="1"]');
    ok('редът на товара c2 е подчертан', !!hl && hl.getAttribute('data-c') === 'c2' && /#fef9c3/i.test(hl.getAttribute('style')), hl && hl.getAttribute('style'));
    ok('само един ред е подчертан', $$(h, '.trf-card-cargo[data-trf-hl="1"]').length === 1);
    ok('хешът е махнат от адреса', h.w.location.hash === '', h.w.location.hash);
    ok('нищо не е отбелязано', h.calls.post.length === 0 && h.calls.patch.length === 0);
    ok('няма червен екран', !$(h, '#trf-foreign-modal'));
    realClick(h.w, $(h, '#trf-card-back')); await ticks();
    ok('„← Обратно" маха подчертаването', h.w.tfHighlight === null);
    h.close();

    /* Чужд обект: Централен офис не участва в b1 (Варна не става — получател е на c3). */
    const h2 = env(U('Централен офис'));
    h2.w.history.replaceState(null, '', '/#tf=b1&c=c1&u=1');
    h2.w.startApp(); await ticks(); await ticks(); await ticks();
    const red = $(h2, '#trf-foreign-modal');
    ok('чужд обект → червен екран с номера', !!red && /Транспорт Кърджали-0031 не е за вашия обект/.test(red.textContent), red && red.textContent);
    ok('картата НЕ е отворена', !$(h2, '#trf-card') && h2.w.tfCardId === null);
    realClick(h2.w, H.btn(red, 'Затвори'));
    ok('„Затвори" маха екрана', !$(h2, '#trf-foreign-modal'));
    h2.close();

    /* Чужд, но транспортът е зареден като звено от верига (tfTransferById) */
    const h2b = env(U('Централен офис'));
    await open(h2b);
    h2b.w.tfTransferById.b1 = BUS; h2b.w.tfCargoByTransfer.b1 = CARGO;
    h2b.w.tfDeepLink = { tid: 'b1', cid: 'c1', unit: 1 };
    h2b.w.tfDeepLinkApply(); await ticks();
    ok('звено от верига, чужд обект → пак червен екран', !!$(h2b, '#trf-foreign-modal') && !$(h2b, '#trf-card'));
    h2b.close();

    /* Товарът го няма */
    const h3 = env(U('Пирдоп'));
    h3.w.history.replaceState(null, '', '/#tf=b1&c=няма&u=1');
    h3.w.startApp(); await ticks(); await ticks(); await ticks();
    ok('товарът го няма → картата + toast', !!$(h3, '#trf-card') && h3.toasts.some(function (t) { return t.m === 'Товарът го няма в транспорта'; }));
    h3.close();

    /* #tl=… → поема го llDeepLinkBoot, tfDeepLinkBoot не се вика */
    const h4 = env(U('Пирдоп'));
    let tfCalls = 0;
    const origTf = h4.w.tfDeepLinkBoot;
    h4.w.tfDeepLinkBoot = function () { tfCalls++; return origTf.apply(this, arguments); };
    h4.w.history.replaceState(null, '', '/#tl=L1&p=' + encodeURIComponent('pallet|1|Пирдоп'));
    h4.w.startApp(); await ticks(); await ticks();
    ok('#tl → tfDeepLinkBoot НЕ е викан', tfCalls === 0, String(tfCalls));
    ok('#tl → модулът е loading (llDeepLinkBoot го пое)', visible(h4, 'mod-loading'));
    h4.close();

    /* Без хеш → нищо */
    const h5 = env(U('Пирдоп'));
    let tf5 = 0;
    const o5 = h5.w.tfDeepLinkBoot;
    h5.w.tfDeepLinkBoot = function () { tf5++; return o5.apply(this, arguments); };
    h5.w.history.replaceState(null, '', '/');
    h5.w.startApp(); await ticks(); await ticks();
    ok('без хеш → tfDeepLinkBoot е викан и връща false', tf5 === 1 && h5.w.tfDeepLinkBoot('') === false);
    ok('без хеш → няма карта и няма червен екран', !$(h5, '#trf-card') && !$(h5, '#trf-foreign-modal') && h5.w.tfDeepLink === null);
    h5.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
